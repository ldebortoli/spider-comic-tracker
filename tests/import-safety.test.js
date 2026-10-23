const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

test("application modules import with synthetic configuration and no startup effects", () => {
  const guard = global.__spiderIsolation;
  assert.ok(guard, "isolation preload is mandatory");
  const before = { sqlite: guard.state.sqlite, listeners: guard.state.listeners, children: guard.state.children, blocked: guard.state.blocked.length };
  const files = fs.readdirSync(path.join(guard.root, "src")).filter(name => name.endsWith(".js")).sort();
  for (const filename of files) require(path.join(guard.root, "src", filename));
  assert.ok(files.includes("server.js"));
  assert.ok(files.includes("telegram.js"));
  assert.ok(files.includes("weekly-shutdown.js"));
  assert.deepEqual({ sqlite: guard.state.sqlite, listeners: guard.state.listeners, children: guard.state.children, blocked: guard.state.blocked.length }, before);
});

test("preload blocks injected top-level startup effects before they execute", () => {
  const guard = global.__spiderIsolation;
  const mutations = {
    sqlite: 'new (require("node:sqlite").DatabaseSync)(":memory:");',
    server: 'require("node:http").createServer().listen(0, "127.0.0.1");',
    scheduler: 'setInterval(() => {}, 1000);',
    bot: 'require("node:child_process").spawn(process.execPath, ["-v"]);',
    network: 'fetch("https://example.invalid/");',
    write: 'require("node:fs").writeFileSync(__dirname + "/must-not-exist", "");'
  };
  for (const [name, source] of Object.entries(mutations)) {
    const root = fs.mkdtempSync(path.join(guard.sandbox, "import-mutant-"));
    for (const folder of ["src", "tests", "evidence"]) fs.mkdirSync(path.join(root, folder));
    fs.writeFileSync(path.join(root, "evidence/baseline-manifest.json"), "{}");
    fs.copyFileSync(path.join(guard.root, "tests/isolation-guard.cjs"), path.join(root, "tests/isolation-guard.cjs"));
    fs.writeFileSync(path.join(root, "src/mutant.js"), source);
    const result = spawnSync(process.execPath, ["--require", path.join(root, "tests/isolation-guard.cjs"), "-e", 'require("./src/mutant.js")'], {
      cwd: root, encoding: "utf8", timeout: 5000, windowsHide: true
    });
    assert.equal(result.status, 1, name + ": " + result.stderr);
    assert.match(result.stderr, /ISOLATION:/, name);
    const report = JSON.parse(fs.readFileSync(path.join(root, "evidence/isolation", result.pid + ".json")));
    assert.equal(report.sqlite + report.listeners + report.children, 0, name);
    assert.equal(report.blocked.length, 1, name);
    assert.equal(fs.existsSync(path.join(root, "src/must-not-exist")), false);
  }
});
