// Read-only baseline reproduction: export tracked files into an isolated temp cwd.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");
const { execFileSync, spawn } = require("node:child_process");
const { once } = require("node:events");

async function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "spider-baseline-repro-"));
  let child;
  try {
    const archive = path.join(root, "HEAD.zip");
    execFileSync("git", ["archive", "--format=zip", `--output=${archive}`, "d5c12682c7fb"], { windowsHide: true });
    execFileSync("python", ["-B", "-c", `import pathlib,sys,zipfile
root=pathlib.Path(sys.argv[1]).resolve()
with zipfile.ZipFile(root/'HEAD.zip') as z:
 for name in z.namelist():
  assert (root/name).resolve().is_relative_to(root)
 z.extractall(root)
`, root], { windowsHide: true });
    const wrapper = `global.fetch = async () => { throw new Error("external transport forbidden"); };
const http = require('node:http');
const listen = http.Server.prototype.listen;
http.Server.prototype.listen = function (...args) {
 this.once('listening', () => process.stdout.write('TESTPORT=' + this.address().port + '\\n'));
 return listen.apply(this, args);
}; require('./src/server.js');`;
    child = spawn(process.execPath, ["-e", wrapper], { cwd: root, windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, PORT: "0", DB_PATH: path.join(root, "synthetic.sqlite"), TELEGRAM_BOT_TOKEN: "",
        TELEGRAM_POLLING_ENABLED: "false", SCHEDULE_ENABLED: "false", CATALOG_REFRESH_ENABLED: "false", BACKUP_ENABLED: "false" } });
    const exit = once(child, "exit");
    const port = await new Promise((resolve, reject) => {
      let output = "";
      const timeout = setTimeout(() => reject(new Error("baseline startup timeout")), 10_000);
      child.stdout.on("data", chunk => { output += chunk; const match = output.match(/TESTPORT=(\d+)/); if (match) { clearTimeout(timeout); resolve(Number(match[1])); } });
      child.once("error", reject);
    });
    const origin = `http://127.0.0.1:${port}`;
    let response = await fetch(origin + "/api/dashboard", { headers: { Host: "evil.test", Origin: "https://evil.test" } });
    assert.equal(response.status, 200);
    console.log("reproduced - baseline accepts untrusted Host/Origin without local token");
    response = await fetch(origin + "/api/spanish-editions", { method: "POST", headers: { Origin: "https://evil.test", "Content-Type": "text/plain" },
      body: JSON.stringify({ title: "Synthetic CSRF", notes: "x".repeat(70_000) }) });
    assert.equal(response.status, 201);
    console.log("reproduced - baseline accepts cross-origin text/plain mutation and body above 64KiB");
    await new Promise(resolve => {
      const request = http.get(origin + "/api/dashboard", { headers: { Host: "[" } }, response => { response.resume(); response.on("end", resolve); });
      request.on("error", resolve);
    });
    const [code] = await exit;
    assert.equal(code, 1);
    console.log("reproduced - malformed Host URL terminates baseline process");
    console.log("ok - only exported baseline, temporary SQLite, no Telegram token and disabled automation");
  } finally {
    if (child && child.exitCode === null) { child.kill(); await once(child, "exit"); }
    fs.rmSync(root, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
