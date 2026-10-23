const assert = require("node:assert/strict");
const { test } = require("node:test");
const { once } = require("node:events");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const vm = require("node:vm");
const { EventEmitter } = require("node:events");
const { TelegramBridge } = require("../src/telegram");

test("bridge passes local token to fake bot, redacts diagnostics and stops managed tree", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "spider-bot-fake-"));
  fs.mkdirSync(path.join(root, "src"));
  fs.writeFileSync(path.join(root, "src", "telegram_bot.py"), `
const fs = require('node:fs');
const { spawn } = require('node:child_process');
const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { windowsHide: true, stdio: 'ignore' });
fs.writeFileSync('ready.json', JSON.stringify({ pid: process.pid, childPid: child.pid,
  local: process.env.SPIDER_LOCAL_TOKEN === 'synthetic-local', server: process.env.TELEGRAM_SERVER_URL }));
process.stdout.write(JSON.stringify({ type: 'ready' }) + '\\n');
setInterval(() => {}, 1000);
`);
  const bridge = new TelegramBridge({ config: { botToken: "synthetic-bot", pythonBin: process.execPath },
    localToken: "synthetic-local", service: {}, serverUrl: "http://127.0.0.1:12345", projectRoot: root });
  t.after(async () => { await bridge.stop(); fs.rmSync(root, { recursive: true, force: true }); });
  bridge.start();
  const bot = bridge.process;
  await once(bot.stdout, "data");
  const ready = JSON.parse(fs.readFileSync(path.join(root, "ready.json")));
  assert.equal(ready.local, true);
  assert.equal(ready.server, "http://127.0.0.1:12345");
  assert.equal(bridge.getStatus().running, true);
  bridge.handleBotProcessLine('{"type":"error","message":"synthetic-bot synthetic-local"}');
  assert.equal(bridge.lastError, "[redacted] [redacted]");
  await bridge.stop();
  assert.equal(bridge.process, null);
  assert.equal(bridge.restartTimer, null);
  assert.throws(() => process.kill(ready.pid, 0));
  assert.throws(() => process.kill(ready.childPid, 0));
  assert.equal(fs.existsSync(path.join(root, "data", "telegram-bot.pid")), false);
  await bridge.configure({ pollingEnabled: false });
  assert.equal(bridge.process, null);
});

test("shutdown failure, POSIX process groups and force deadline are isolated doubles", async () => {
  const source = fs.readFileSync(require.resolve("../src/telegram"), "utf8");
  for (const platform of ["win32", "linux"]) {
    const kills = [];
    let deadline;
    let status = 0;
    const context = vm.createContext({ module: { exports: {} }, console,
      process: { platform, env: {}, cwd: () => process.cwd(), kill: (...args) => kills.push(args) },
      setTimeout: fn => { deadline = fn; }, clearTimeout: () => {},
      require: name => name === "node:child_process" ? { spawnSync: () => ({ status }), spawn: () => {} } : require(name)
    });
    vm.runInContext(source, context);
    const Bridge = context.module.exports.TelegramBridge;
    const bridge = new Bridge({ config: {}, service: {}, serverUrl: "http://127.0.0.1:1" });
    bridge.clearBotPid = () => {};
    assert.equal(bridge.redactSecrets(undefined), "");
    const child = new EventEmitter();
    Object.assign(child, { pid: 123, exitCode: null, signalCode: null, kill: signal => kills.push([123, signal]) });
    bridge.process = child;
    if (platform === "win32") {
      status = 1;
      await assert.rejects(bridge.stop(), /No se pudo detener/);
      assert.equal(bridge.process, child);
      status = 0;
    }
    const stopped = bridge.stop();
    deadline();
    child.emit("exit", 0);
    await stopped;
    assert.deepEqual(kills, platform === "win32" ? [[123, "SIGKILL"]] : [[-123, "SIGTERM"], [-123, "SIGKILL"], [-123, "SIGKILL"]]);
    bridge.process = { exitCode: 0 };
    await bridge.stop();
  }
});
