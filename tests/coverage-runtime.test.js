const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const vm = require("node:vm");

function load(name, overrides = {}, globals = {}) {
  const filename = require.resolve(`../src/${name}`);
  const context = vm.createContext({ module: { exports: {} }, require: key => overrides[key] || require(key), process, console, ...globals });
  vm.runInContext(fs.readFileSync(filename, "utf8"), context, { filename });
  return context.module.exports;
}

test("environment parser preserves existing values, handles quoting and config fallbacks", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "spider-env-"));
  try {
    const env = {};
    const envFile = path.join(root, ".env");
    const isolatedProcess = { cwd: () => root, env };
    const { loadEnv, getConfig } = load("env", {}, { process: isolatedProcess });
    loadEnv();
    fs.writeFileSync(envFile, "# comment\n\ninvalid\nEXISTING=replace\nSINGLE='uno'\nDOUBLE=\"dos\"\nPLAIN=tres\nUNMATCHED=\"open\n");
    env.EXISTING = "keep";
    loadEnv();
    assert.equal(env.EXISTING, "keep");
    assert.equal(env.SINGLE, "uno");
    assert.equal(env.DOUBLE, "dos");
    assert.equal(env.PLAIN, "tres");
    assert.equal(env.UNMATCHED, '"open');
    const defaults = getConfig();
    assert.equal(defaults.port, 8787);
    assert.equal(defaults.schedule.enabled, true);
    assert.equal(defaults.telegram.backupChatId, "");
    Object.assign(env, {
      PORT: "bad", APP_TIMEZONE: "UTC", DB_PATH: "custom.sqlite", MARVEL_BASE_URL: "https://example.test",
      PANINI_LISTING_URL: "https://example.test/list", PANINI_CONCURRENCY: "99", SCHEDULE_ENABLED: "off", SCHEDULE_DAY: "friday", SCHEDULE_HOUR: "2", SCHEDULE_MINUTE: "3",
      CATALOG_REFRESH_ENABLED: "unknown", CATALOG_REFRESH_INTERVAL_MONTHS: "0", CATALOG_REFRESH_NEXT_AT: "2027-01-01",
      TELEGRAM_BOT_TOKEN: "fixture-token", TELEGRAM_POLLING_ENABLED: "yes", TELEGRAM_PYTHON_BIN: "fixture-python", TELEGRAM_REVIEW_CHAT_ID: "review", TELEGRAM_ALLOWED_USER_ID: "user",
      BACKUP_ENABLED: "no", BACKUP_INTERVAL_WEEKS: "2", BACKUP_DIR: "copies", BACKUP_MAX_BYTES: "100", BACKUP_TELEGRAM_MAX_BYTES: "20", BACKUP_RETENTION_COUNT: "1"
    });
    const configured = getConfig();
    assert.equal(configured.port, 8787);
    assert.equal(configured.panini.concurrency, 8);
    assert.equal(configured.schedule.day, "FRIDAY");
    assert.equal(configured.schedule.enabled, false);
    assert.equal(configured.catalogRefresh.enabled, true);
    assert.equal(configured.catalogRefresh.intervalMonths, 1);
    assert.equal(configured.telegram.summaryChatId, "review");
    assert.equal(configured.telegram.backupChatId, "review");
    Object.assign(env, { PORT: "9999", TELEGRAM_SUMMARY_CHAT_ID: "summary" });
    assert.equal(getConfig().telegram.backupChatId, "summary");
    env.TELEGRAM_BACKUP_CHAT_ID = "backup";
    assert.equal(getConfig().telegram.backupChatId, "backup");
    assert.equal(getConfig().port, 9999);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("automation validates before mutation, persists schedule and invokes the correct hidden Windows task", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "spider-auto-"));
  try {
    for (const platform of ["linux", "win32"]) {
      const calls = [];
      const { AutomationManager, updateEnvFile } = load("automation-manager", { "node:child_process": { execFile: (...args) => { calls.push(args.slice(0, -1)); args.at(-1)(null, "", ""); } } }, { process: { platform } });
      const config = { timezone: "UTC", schedule: { enabled: false, day: "MONDAY", hour: 1, minute: 2 } };
      const manager = new AutomationManager({ config, projectRoot: root });
      assert.equal(manager.getStatus().externalTaskInstalled, false);
      for (const invalid of [{ day: "" }, { day: "MONDAY", hour: "nan" }, { day: "MONDAY", hour: -1 }, { day: "MONDAY", hour: 24 }, { day: "MONDAY", hour: 1, minute: "nan" }, { day: "MONDAY", hour: 1, minute: -1 }, { day: "MONDAY", hour: 1, minute: 60 }]) {
        await assert.rejects(manager.configure(invalid), /válid/);
      }
      await manager.configure({ enabled: true, day: "friday", hour: 23, minute: 59 });
      assert.match(fs.readFileSync(manager.envPath, "utf8"), /SCHEDULE_DAY=FRIDAY/);
      await manager.configure({ enabled: false, day: "MONDAY", hour: 0, minute: 0 });
      if (platform === "win32") {
        assert.equal(calls.length, 2);
        assert.match(calls[0][1].at(-1), /install-weekly-task/);
        assert.match(calls[1][1].at(-1), /uninstall-weekly-task/);
        assert.equal(calls[0][2].windowsHide, true);
      } else assert.equal(calls.length, 0);
      fs.mkdirSync(path.dirname(manager.markerPath), { recursive: true });
      fs.writeFileSync(manager.markerPath, '\uFEFF{"installedAt":"fixture-time","taskName":"fixture-task"}');
      assert.equal(manager.getStatus().externalTaskInstalled, true);
      assert.equal(manager.getStatus().taskName, "fixture-task");
      fs.writeFileSync(manager.markerPath, "bad json");
      assert.equal(manager.getStatus().externalTaskInstalled, false);
      updateEnvFile(manager.envPath, { NEW_SETTING: "new" });
      assert.match(fs.readFileSync(manager.envPath, "utf8"), /NEW_SETTING=new/);
    }
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("system samples account for transient storage errors, cache, CPU deltas and unavailable statfs", () => {
  let cpu = [{ times: { user: 10, idle: 20 } }, { times: { user: 1, idle: 2 } }];
  let now = 20_000;
  let statfsFails = false;
  let dbExists = true;
  const entries = {
    data: [{ name: "sub", isDirectory: () => true }, { name: "gone", isDirectory: () => false, isFile: () => true }, { name: "other", isDirectory: () => false, isFile: () => false }],
    [path.join("data", "sub")]: [{ name: "file", isDirectory: () => false, isFile: () => true }],
    [path.join("data", "backups")]: null
  };
  const fakeFs = {
    existsSync: p => p === "db" ? dbExists : p !== "missing",
    readdirSync: p => { if (!entries[p]) throw Error("directory disappeared"); return entries[p]; },
    statSync: p => { if (p.endsWith("gone")) throw Error("file disappeared"); return { size: 25 }; },
    statfsSync: () => { if (statfsFails) throw Error("unsupported"); return { bsize: 2, blocks: 100, bavail: 40 }; }
  };
  const fakeOs = { cpus: () => cpu, totalmem: () => 1000, freemem: () => 400, uptime: () => 123.8, hostname: () => "fixture-host" };
  let clock = 1n;
  let usage = { user: 20, system: 10 };
  const fakeProcess = { hrtime: { bigint: () => clock }, cpuUsage: () => usage, memoryUsage: () => ({ rss: 20, heapUsed: 10, heapTotal: 15 }), uptime: () => 2.5, pid: 123, platform: "fixture", arch: "x64", version: "fixture" };
  class FixtureDate extends Date { static now() { return now; } }
  const { SystemMonitor } = load("system-monitor", { "node:fs": fakeFs, "node:os": fakeOs }, { process: fakeProcess, Date: FixtureDate });
  const monitor = new SystemMonitor({ dataDir: "data", dbPath: "db" });
  assert.equal(monitor.sampleStorage().diskUsedPercent, 60);
  assert.equal(monitor.sampleStorage(), monitor.cachedStorage);
  clock = 1_000_001n;
  usage = { user: 120, system: 10 };
  cpu = [{ times: { user: 21, idle: 22, sys: 1 } }];
  const snapshot = monitor.snapshot();
  assert.equal(snapshot.process.cpuPercent, 10);
  assert.equal(snapshot.storage.appDataBytes, 25);
  assert.equal(snapshot.system.usedMemoryPercent, 60);
  cpu = [{ times: {} }];
  assert.equal(monitor.snapshot().system.cpuPercent, 0);
  now += 20_000;
  dbExists = false;
  statfsFails = true;
  const missing = new SystemMonitor({ dataDir: "missing", dbPath: "db" }).snapshot();
  assert.equal(missing.storage.appDataBytes, 0);
  assert.equal(missing.storage.databaseBytes, 0);
  assert.equal(missing.storage.diskUsedPercent, null);
});
