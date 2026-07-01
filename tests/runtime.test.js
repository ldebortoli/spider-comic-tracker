const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { updateEnvFile } = require("../src/automation-manager");
const { SystemMonitor } = require("../src/system-monitor");

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "spider-runtime-"));
const envPath = path.join(tempDir, ".env");
const dbPath = path.join(tempDir, "comics.sqlite");
fs.writeFileSync(envPath, "SCHEDULE_ENABLED=true\nSCHEDULE_DAY=WEDNESDAY\n", "utf8");
fs.writeFileSync(dbPath, "test", "utf8");

updateEnvFile(envPath, {
  SCHEDULE_ENABLED: "false",
  SCHEDULE_DAY: "FRIDAY",
  SCHEDULE_HOUR: 18,
  SCHEDULE_MINUTE: 30
});
const env = fs.readFileSync(envPath, "utf8");
assert.match(env, /SCHEDULE_ENABLED=false/);
assert.match(env, /SCHEDULE_DAY=FRIDAY/);
assert.match(env, /SCHEDULE_HOUR=18/);

const monitor = new SystemMonitor({ dataDir: tempDir, dbPath });
const metrics = monitor.snapshot();
assert.equal(metrics.process.pid, process.pid);
assert.ok(metrics.system.logicalCores >= 1);
assert.equal(metrics.storage.databaseBytes, 4);
assert.ok(metrics.process.memoryRssBytes > 0);

fs.rmSync(tempDir, { recursive: true, force: true });
console.log("ok - metricas y configuracion automatica local");
