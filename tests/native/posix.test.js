const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { createHash } = require("node:crypto");
const net = require("node:net");
const { test } = require("node:test");

const projectRoot = path.resolve(__dirname, "../..");
const scripts = ["server-control-posix.sh", "server-control-linux.sh", "install-linux.sh", "install-macos.sh", "build-macos-app.sh"];
const bash = process.env.GIT_BASH || (process.platform === "win32" ? "C:/Program Files/Git/usr/bin/bash.exe" : "/bin/bash");
const toShellPath = (p) => process.platform === "win32" ? p.replace(/\\/g, "/").replace(/^([A-Za-z]):/, (_, drive) => `/${drive.toLowerCase()}`) : p;
const traces = [];

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "spider posix "));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, "scripts"));
  for (const file of scripts) fs.copyFileSync(path.join(projectRoot, "scripts", file), path.join(root, "scripts", file));
  fs.cpSync(path.join(projectRoot, "packaging"), path.join(root, "packaging"), { recursive: true });
  fs.mkdirSync(path.join(root, "home"));
  fs.mkdirSync(path.join(root, "data"));
  fs.writeFileSync(path.join(root, "state"), "stopped");
  fs.writeFileSync(path.join(root, "actions"), "Cerrar\n");
  const settings = { PORT: "", POSIX_NODE: "1", POSIX_ZENITY: "1", POSIX_MACOS: "1", POSIX_OPENER: "none", POSIX_START_FAIL: "0", POSIX_STOP_FAIL: "0", POSIX_SYSTEMCTL_FAIL: "0", POSIX_LAUNCHCTL_FAIL: "0" };
  function run(file, args = [], override = {}) {
    const result = spawnSync(bash, ["--noprofile", "--norc", toShellPath(path.join(root, "scripts", file)), ...args], {
      encoding: "utf8", timeout: file === "server-control-posix.sh" && args.includes("--open") ? 180_000 : 60_000,
      env: { ...process.env, PATH: process.platform === "win32" ? `${path.dirname(bash)};${process.env.PATH}` : process.env.PATH, HOME: toShellPath(path.join(root, "home")), BASH_ENV: toShellPath(path.join(projectRoot, "tests/native/posix-environment.sh")), POSIX_TRACE: toShellPath(path.join(root, "trace")), POSIX_COMMAND_LOG: toShellPath(path.join(root, "commands")), POSIX_STATE: toShellPath(path.join(root, "state")), POSIX_ACTIONS: toShellPath(path.join(root, "actions")), ...settings, ...override }
    });
    assert.equal(result.error, undefined, `${file}: ${result.error?.message}`);
    if (fs.existsSync(path.join(root, "trace"))) {
      const records = fs.readFileSync(path.join(root, "trace"), "utf8").split("\0");
      for (let i = 0; i + 2 < records.length; i += 3) {
        const fileName = path.posix.basename(records[i]);
        if (scripts.includes(fileName) && fs.readFileSync(path.join(root, "scripts", fileName)).equals(fs.readFileSync(path.join(projectRoot, "scripts", fileName)))) traces.push({ file: fileName, line: Number(records[i + 1]), command: records[i + 2] });
      }
      fs.unlinkSync(path.join(root, "trace"));
    }
    return result;
  }
  const writeEnv = (value) => fs.writeFileSync(path.join(root, ".env"), value);
  const running = (pid = "123") => { fs.writeFileSync(path.join(root, "data/server.pid"), pid); fs.writeFileSync(path.join(root, "state"), "running"); };
  const log = () => fs.existsSync(path.join(root, "commands")) ? fs.readFileSync(path.join(root, "commands"), "utf8") : "";
  return { root, run, settings, writeEnv, running, log };
}

test("POSIX status/start/stop operate only on fixture state and record shutdown failures", (t) => {
  const f = fixture(t);
  assert.equal(f.run("server-control-posix.sh").status, 1);
  assert.match(f.run("server-control-posix.sh", ["invalid"]).stderr, /Uso:/);
  f.running("malformed");
  assert.equal(f.run("server-control-posix.sh", ["status"]).status, 1);
  f.running();
  assert.match(f.run("server-control-posix.sh", ["--status"]).stdout, /ENCENDIDO.*http:\/\/localhost:8787/);
  assert.match(f.run("server-control-posix.sh", ["start"]).stdout, /ya está encendido/);
  assert.match(f.run("server-control-posix.sh", ["--stop"]).stdout, /Servidor apagado/);
  assert.equal(fs.existsSync(path.join(f.root, "data/server.pid")), false);
  assert.match(f.run("server-control-posix.sh", ["stop"]).stdout, /ya está apagado/);
  assert.match(f.run("server-control-posix.sh", ["--start"]).stdout, /Servidor encendido/);
  assert.equal(f.run("server-control-posix.sh", ["stop"], { POSIX_STOP_FAIL: "1" }).status, 1);
  assert.equal(fs.existsSync(path.join(f.root, "data/server.pid")), true);
  fs.writeFileSync(path.join(f.root, "state"), "stopped");
  assert.equal(f.run("server-control-posix.sh", ["start"], { POSIX_START_FAIL: "1" }).status, 1);
  fs.writeFileSync(path.join(f.root, "data/server.pid"), "123\n");
  assert.match(f.run("server-control-posix.sh", ["status"]).stdout, /APAGADO/);
  assert.match(f.log(), /nohup node src\/server.js/);
});

test("POSIX open readiness fails boundedly and supports each available browser command", async (t) => {
  const f = fixture(t);
  f.running();
  const server = net.createServer((socket) => socket.end());
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  const port = server.address().port;
  f.settings.PORT = String(port);
  try {
    for (const opener of ["xdg", "mac", "none"]) {
      const result = f.run("server-control-posix.sh", ["open"], { POSIX_OPENER: opener });
      assert.equal(result.status, 0, result.stderr);
      if (opener === "none") assert.ok(result.stdout.includes(`http://localhost:${port}`));
    }
  } finally { await new Promise((resolve) => server.close(resolve)); }
  const closed = await new Promise((resolve) => { const probe = net.connect(port, "127.0.0.1"); probe.on("error", () => resolve(true)); probe.on("connect", () => { probe.destroy(); resolve(false); }); });
  assert.equal(closed, true, "fixture listener must be closed");
  assert.equal(f.run("server-control-posix.sh", ["--open"]).status, 1);
  assert.ok(f.log().includes(`xdg-open http://localhost:${port}`));
  assert.ok(f.log().includes(`open http://localhost:${port}`));
});

test("Linux installer validates prerequisites/day and writes each weekly schedule", (t) => {
  const f = fixture(t);
  assert.equal(f.run("install-linux.sh", [], { POSIX_NODE: "0" }).status, 1);
  assert.equal(f.run("install-linux.sh", [], { POSIX_ZENITY: "0" }).status, 1);
  assert.equal(f.run("install-linux.sh").status, 0);
  const days = { MONDAY: "Mon", TUESDAY: "Tue", WEDNESDAY: "Wed", THURSDAY: "Thu", FRIDAY: "Fri", SATURDAY: "Sat", SUNDAY: "Sun" };
  for (const [day, expected] of Object.entries(days)) {
    f.writeEnv(`SCHEDULE_DAY=${day}\nSCHEDULE_HOUR=3\nSCHEDULE_MINUTE=7\nSCHEDULE_ENABLED=true\n`);
    const result = f.run("install-linux.sh");
    assert.equal(result.status, 0, result.stderr);
    const timer = fs.readFileSync(path.join(f.root, "home/.config/systemd/user/spider-tracker-weekly.timer"), "utf8");
    assert.match(timer, new RegExp(`${expected}.*03:07`));
    assert.equal(timer.includes("__DAY__"), false);
  }
  f.writeEnv("SCHEDULE_DAY=BAD\n");
  assert.equal(f.run("install-linux.sh").status, 1);
  f.writeEnv("SCHEDULE_DAY=\nSCHEDULE_HOUR=\nSCHEDULE_MINUTE=\nSCHEDULE_ENABLED=\n");
  assert.equal(f.run("install-linux.sh").status, 0);
  f.writeEnv("SCHEDULE_ENABLED=false\n");
  assert.equal(f.run("install-linux.sh", [], { POSIX_SYSTEMCTL_FAIL: "0" }).status, 0);
  assert.equal(f.run("install-linux.sh", [], { POSIX_SYSTEMCTL_FAIL: "disable" }).status, 0);
  assert.equal(fs.existsSync(path.join(f.root, "home/.config/systemd/user/spider-tracker-weekly.timer")), false);
  assert.match(f.log(), /systemctl --user enable --now spider-tracker-weekly.timer/);
  assert.match(f.log(), /systemctl --user disable --now spider-tracker-weekly.timer/);
});

test("macOS shell packaging prepares app/icon commands and installs each launchd schedule", (t) => {
  const f = fixture(t);
  assert.equal(f.run("build-macos-app.sh", [], { POSIX_MACOS: "0" }).status, 1);
  assert.equal(f.run("install-macos.sh", [], { POSIX_NODE: "0" }).status, 1);
  assert.equal(f.run("build-macos-app.sh").status, 0);
  const built = path.join(f.root, "dist/macos/Spider Tracker Server.app/Contents/Resources/applet.icns");
  assert.equal(fs.readFileSync(built, "utf8"), "fixture icon");
  assert.equal(fs.existsSync(path.join(f.root, "dist/macos/SpiderTracker.iconset")), false);
  assert.equal(fs.readFileSync(path.join(f.root, "dist/macos/SpiderTrackerServer.applescript"), "utf8").includes("__PROJECT_ROOT__"), false);
  assert.equal(f.run("install-macos.sh").status, 0);
  const days = { SUNDAY: 1, MONDAY: 2, TUESDAY: 3, WEDNESDAY: 4, THURSDAY: 5, FRIDAY: 6, SATURDAY: 7 };
  const plistPath = path.join(f.root, "home/Library/LaunchAgents/com.spidertracker.weekly.plist");
  for (const [day, number] of Object.entries(days)) {
    f.writeEnv(`SCHEDULE_DAY=${day}\nSCHEDULE_HOUR=3\nSCHEDULE_MINUTE=7\n`);
    const result = f.run("install-macos.sh");
    assert.equal(result.status, 0, result.stderr);
    const plist = fs.readFileSync(plistPath, "utf8");
    assert.match(plist, new RegExp(`<key>Weekday</key>\\s*<integer>${number}</integer>`));
    assert.equal(plist.includes("__PROJECT_ROOT__"), false);
  }
  f.writeEnv("SCHEDULE_DAY=BAD\n");
  assert.equal(f.run("install-macos.sh").status, 1);
  f.writeEnv("SCHEDULE_DAY=\nSCHEDULE_HOUR=\nSCHEDULE_MINUTE=\nSCHEDULE_ENABLED=\n");
  assert.equal(f.run("install-macos.sh").status, 0);
  f.writeEnv("SCHEDULE_ENABLED=false\n");
  assert.equal(f.run("install-macos.sh").status, 0);
  assert.equal(fs.existsSync(plistPath), false);
  assert.equal(f.run("install-macos.sh", [], { POSIX_LAUNCHCTL_FAIL: "1" }).status, 0);
  assert.match(f.log(), /launchctl bootstrap/);
  assert.equal(f.log().split("\n").filter((line) => line.startsWith("sips ")).length % 10, 0);
});

test("Linux panel reports missing Zenity and preserves a failed-stop window until recovery", (t) => {
  const f = fixture(t);
  assert.equal(f.run("server-control-linux.sh", [], { POSIX_ZENITY: "0" }).status, 1);
  // The panel's control subprocess is a fixture boundary here. The original
  // lifecycle script is exercised independently above.
  const control = path.join(f.root, "scripts/server-control-posix.sh");
  fs.writeFileSync(control, '#!/usr/bin/env bash\nif [[ "$1" == status ]]; then exit 1; fi\nif [[ "$1" == open && -f "$POSIX_STATE.openfail" ]]; then rm "$POSIX_STATE.openfail"; echo open-refused >&2; exit 1; fi\nif [[ "$1" == stop && -f "$POSIX_STATE.fail" ]]; then rm "$POSIX_STATE.fail"; echo refused >&2; exit 1; fi\nprintf "control %s\\n" "$1" >> "$POSIX_COMMAND_LOG"\necho "fixture $1"\n');
  fs.writeFileSync(path.join(f.root, "state.openfail"), "1");
  fs.writeFileSync(path.join(f.root, "state.fail"), "1");
  fs.writeFileSync(path.join(f.root, "actions"), "Encender\nApagar\nAbrir aplicación\nActualizar estado\n@stop-fails\nCerrar\n");
  const result = f.run("server-control-linux.sh");
  assert.equal(result.status, 0, result.stderr);
  assert.match(f.log(), /zenity --error --text=refused/);
  assert.match(f.log(), /zenity --info/);
  assert.match(f.log(), /control open/);
  fs.writeFileSync(path.join(f.root, "actions"), "@cancel\n");
  assert.equal(f.run("server-control-linux.sh").status, 0);
});

test("AppleScript template retains lifecycle and error contracts (static validation only)", () => {
  const source = fs.readFileSync(path.join(projectRoot, "packaging/macos/SpiderTrackerServer.applescript.in"), "utf8");
  assert.match(source, /property projectRoot : "__PROJECT_ROOT__"/);
  assert.match(source, /on run[\s\S]*end run/);
  for (const action of ["Encender", "Apagar", "Abrir aplicación", "Actualizar estado", "Cerrar"]) assert.ok(source.includes(`"${action}"`));
  assert.match(source, /selectedAction is false or item 1 of selectedAction is "Cerrar" then\s*try\s*do shell script controlScript & " stop"\s*exit repeat\s*on error errorMessage\s*display dialog errorMessage/);
  assert.match(source, /actionName is "Encender" then\s*display dialog \(do shell script controlScript & " open"\)/);
  assert.match(source, /actionName is "Apagar" then\s*display dialog \(do shell script controlScript & " stop"\)/);
});

test("POSIX command coverage receipt requires the entire frozen executable inventory", () => {
  const out = path.join(projectRoot, "data/coverage-posix-traces.json");
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(traces, null, 2));
  const inventory = JSON.parse(fs.readFileSync(path.join(projectRoot, "tests/coverage-posix.inventory.json"), "utf8"));
  assert.deepEqual(Object.keys(inventory.files).sort(), fs.readdirSync(path.join(projectRoot, "scripts")).filter((file) => file.endsWith(".sh")).sort(), "every maintained shell script must belong to the frozen inventory");
  const summary = { metric: inventory.metric, files: {}, appleScript: { source: "packaging/macos/SpiderTrackerServer.applescript.in", staticContract: "passed", executableCoverage: null, limitation: "AppleScript compiler/runtime and a native coverage engine are unavailable on Windows; shell osacompile stub verifies command arguments only. Native compilation and interactive lifecycle checks require macOS." } };
  const missing = [];
  const unexpected = [];
  for (const [file, entry] of Object.entries(inventory.files)) {
    const source = fs.readFileSync(path.join(projectRoot, "scripts", file));
    assert.equal(createHash("sha256").update(source).digest("hex"), entry.sha256, `${file}: source changed; review and update the static command inventory`);
    const actual = traces.filter((record) => record.file === file);
    const actualIds = new Set(actual.map((record) => `${record.line}:${record.command}`));
    const expectedIds = new Set(entry.commands.map((record) => `${record.line}:${record.command}`));
    const lines = source.toString().split("\n");
    const functions = lines.flatMap((line, index) => {
      const name = line.match(/^(\w+)\(\) \{/);
      return name ? [{ line: index + 1, name: name[1] }] : [];
    });
    for (const command of entry.commands) if (!actualIds.has(`${command.line}:${command.command}`)) missing.push({ file, ...command });
    for (const record of actual) if (!expectedIds.has(`${record.line}:${record.command}`) && !functions.some((fn) => fn.line === record.line && fn.name === record.command)) unexpected.push(record);
    const covered = entry.commands.filter((record) => actualIds.has(`${record.line}:${record.command}`)).length;
    const functionsCovered = functions.filter((fn) => actualIds.has(`${fn.line}:${fn.name}`)).length;
    summary.files[file] = { commandsCovered: covered, commandsTotal: entry.commands.length, commandPercent: 100 * covered / entry.commands.length, functionsCovered, functionsTotal: functions.length, functionPercent: functions.length ? 100 * functionsCovered / functions.length : null };
    assert.equal(functionsCovered, functions.length, `${file}: every shell function must execute`);
  }
  summary.commandsCovered = Object.values(summary.files).reduce((sum, file) => sum + file.commandsCovered, 0);
  summary.commandsTotal = Object.values(summary.files).reduce((sum, file) => sum + file.commandsTotal, 0);
  summary.commandPercent = 100 * summary.commandsCovered / summary.commandsTotal;
  const uniqueUnexpected = [...new Set(unexpected.map((record) => JSON.stringify(record)))];
  summary.gatePassed = missing.length === 0 && uniqueUnexpected.length === 0;
  summary.missingCommands = missing;
  summary.uninventoriedCommands = uniqueUnexpected;
  fs.writeFileSync(path.join(projectRoot, "data/coverage-posix-summary.json"), JSON.stringify(summary, null, 2) + "\n");
  assert.deepEqual(missing, [], "unexecuted Bash commands fail the 100% gate");
  assert.deepEqual(uniqueUnexpected, [], "executed source commands absent from the reviewed inventory");
});
