const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

test("all CMD entry points preserve their launch directory and invoke only their intended boundary", async () => {
  const project = path.resolve(__dirname, "../..");
  const wrappers = {
    "INICIAR SERVIDOR.cmd": "server-start.ps1", "APAGAR SERVIDOR.cmd": "server-stop.ps1",
    "ESTADO SERVIDOR.cmd": "server-status.ps1", "INSTALAR ACTUALIZACION SEMANAL.cmd": "install-weekly-task.ps1",
    "QUITAR ACTUALIZACION SEMANAL.cmd": "uninstall-weekly-task.ps1", "PANEL DEL SERVIDOR.cmd": null
  };
  assert.deepEqual(fs.readdirSync(project).filter(p => p.endsWith(".cmd")).sort(), Object.keys(wrappers).sort());
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "spider wrapper contract "));
  const log = path.join(root, "receipt.txt");
  try {
    fs.mkdirSync(path.join(root, "bin"));
    const compiler = path.join(process.env.WINDIR, "Microsoft.NET/Framework64/v4.0.30319/csc.exe");
    const built = spawnSync(compiler, ["/nologo", "/target:exe", `/out:${path.join(root, "powershell.exe")}`, path.join(__dirname, "WrapperBoundary.cs")], { encoding: "utf8", windowsHide: true });
    assert.equal(built.status, 0, built.stdout + built.stderr);
    fs.copyFileSync(path.join(root, "powershell.exe"), path.join(root, "bin/SpiderTrackerServerControl.exe"));
    for (const [name, script] of Object.entries(wrappers)) {
      const source = fs.readFileSync(path.join(project, name));
      const expected = ["@echo off", 'cd /d "%~dp0"', ...(script
        ? [`powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\\scripts\\${script}"`, "pause"]
        : ['start "" "%~dp0bin\\SpiderTrackerServerControl.exe"'])];
      assert.deepEqual(source.toString().trim().split(/\r?\n/), expected, "new wrapper logic requires a contract test");
      fs.writeFileSync(path.join(root, name), source);
      fs.rmSync(log, { force: true });
      const result = spawnSync(process.env.ComSpec || "cmd.exe", ["/d", "/s", "/c", `""${path.join(root, name)}""`], {
        cwd: os.tmpdir(), input: "\r\n", encoding: "utf8", timeout: 5000, windowsHide: true,
        windowsVerbatimArguments: true, env: { ...process.env, SPIDER_WRAPPER_TEST_LOG: log }
      });
      assert.equal(result.status, 0, result.stdout + result.stderr);
      for (let tries = 0; tries < 100 && !fs.existsSync(log); tries++) await new Promise(resolve => setTimeout(resolve, 20));
      assert.ok(fs.existsSync(log), name);
      const [cwd, args] = fs.readFileSync(log, "utf8").trimEnd().split(/\r?\n/);
      // TEMP may use an 8.3 alias while .NET expands the same directory's name.
      assert.equal(fs.realpathSync.native(cwd), fs.realpathSync.native(root));
      assert.equal(args || "", script ? `-NoProfile|-ExecutionPolicy|Bypass|-File|.\\scripts\\${script}` : "");
    }
  } finally {
    // The panel's asynchronous fixture process can briefly retain its cwd.
    await fs.promises.rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
});
