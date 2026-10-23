// Test-only preload. Refuse ordinary checkouts and inherit containment in Node children.
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const Module = require("node:module");
const { fileURLToPath } = require("node:url");
const root = path.resolve(__dirname, "..");
const sandbox = path.join(root, "test-sandbox");
if (!fs.existsSync(path.join(root, "evidence/baseline-manifest.json")) ||
    fs.existsSync(path.join(root, ".env")) || fs.existsSync(path.join(root, ".git"))) {
  throw new Error("ISOLATION: tests require a code-only snapshot without .env or .git");
}
const original = {
  exists: fs.existsSync.bind(fs), realpath: fs.realpathSync.bind(fs),
  write: fs.writeFileSync.bind(fs), mkdir: fs.mkdirSync.bind(fs)
};
original.mkdir(sandbox, { recursive: true });
original.mkdir(path.join(root, "evidence/isolation"), { recursive: true });
const state = { imported: [], sqlite: 0, listeners: 0, children: 0, blocked: [] };
let importing = 0;
const ports = new Set();
const contains = (base, target) => {
  const relative = path.relative(base, target);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
};
function deny(kind) { state.blocked.push(kind); throw new Error("ISOLATION: " + kind); }
function checkPath(value, write = false) {
  if (typeof value === "number") return; // Already-authorized descriptor.
  if (value instanceof URL) value = fileURLToPath(value);
  if (Buffer.isBuffer(value)) value = value.toString();
  if (typeof value !== "string") return;
  const target = path.resolve(value);
  if (!contains(root, target)) deny("path outside snapshot");
  if (path.basename(target) === ".env" && !contains(sandbox, target)) deny("non-synthetic environment");
  let existing = target;
  while (!original.exists(existing)) existing = path.dirname(existing);
  if (!contains(root, original.realpath(existing))) deny("reparse point outside snapshot");
  if (write && importing) deny("filesystem mutation during import");
  if (write && ![sandbox, path.join(root, "data"), path.join(root, "evidence")].some(base => contains(base, target))) {
    deny("write outside synthetic outputs");
  }
}
const inherited = { coverage: process.env.NODE_V8_COVERAGE, token: process.env.SPIDER_LOCAL_TOKEN, url: process.env.TELEGRAM_SERVER_URL };
const allowed = new Set(["PATH", "PATHEXT", "SYSTEMROOT", "SYSTEMDRIVE", "WINDIR", "COMSPEC", "PROCESSOR_ARCHITECTURE",
  "NUMBER_OF_PROCESSORS", "PROGRAMDATA", "USERPROFILE", "APPDATA", "LOCALAPPDATA", "NODE_TEST_CONTEXT",
  "NODE_CHANNEL_FD", "NODE_CHANNEL_SERIALIZATION_MODE"]);
for (const key of Object.keys(process.env)) if (!allowed.has(key.toUpperCase())) delete process.env[key];
Object.assign(process.env, { SPIDER_SYNTHETIC_TEST: "code-only", TEMP: sandbox, TMP: sandbox,
  DB_PATH: path.join(sandbox, "synthetic.sqlite"), PORT: "0", SCHEDULE_ENABLED: "false",
  CATALOG_REFRESH_ENABLED: "false", BACKUP_ENABLED: "false", TELEGRAM_BOT_TOKEN: "", TELEGRAM_POLLING_ENABLED: "false",
  NODE_OPTIONS: '--require "' + __filename.replaceAll("\\", "/") + '"', PYTHONDONTWRITEBYTECODE: "1" });
if (inherited.coverage && contains(root, path.resolve(inherited.coverage))) process.env.NODE_V8_COVERAGE = inherited.coverage;
if (/^synthetic-/.test(inherited.token || "")) process.env.SPIDER_LOCAL_TOKEN = inherited.token;
if (/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(inherited.url || "")) process.env.TELEGRAM_SERVER_URL = inherited.url;
os.tmpdir = () => sandbox;
for (const name of ["setTimeout", "setInterval", "setImmediate"]) {
  const timer = global[name];
  global[name] = (...args) => { if (importing) deny("timer during import"); return timer(...args); };
}
const mutation = /^(write|append|mkdir|mkdtemp|unlink|rm|rmdir|truncate|chmod|chown|utimes|createWrite)/;
for (const name of ["readFileSync", "writeFileSync", "appendFileSync", "existsSync", "statSync", "lstatSync", "accessSync",
  "mkdirSync", "mkdtempSync", "readdirSync", "unlinkSync", "rmSync", "rmdirSync", "openSync", "truncateSync",
  "readFile", "writeFile", "appendFile", "stat", "lstat", "access", "mkdir", "mkdtemp", "readdir", "unlink", "rm",
  "rmdir", "open", "createReadStream", "createWriteStream", "statfsSync"]) {
  if (!fs[name]) continue;
  const method = fs[name].bind(fs);
  fs[name] = (target, ...args) => {
    // DatabaseSync(':memory:') asks mkdir('.') recursively; it is an existing-directory no-op.
    const noOpDirectory = !importing && name === "mkdirSync" && args[0]?.recursive && path.resolve(String(target)) === root && original.exists(root);
    const writing = !noOpDirectory && (mutation.test(name) || (/^open/.test(name) && !["r", "rs", undefined].includes(args[0])));
    checkPath(target, writing); return method(target, ...args);
  };
}
for (const name of ["renameSync", "copyFileSync", "cpSync", "rename", "copyFile", "cp", "linkSync", "symlinkSync"]) {
  const method = fs[name].bind(fs);
  fs[name] = (source, target, ...args) => { checkPath(source); checkPath(target, true); return method(source, target, ...args); };
}
for (const name of ["readFile", "writeFile", "appendFile", "mkdir", "mkdtemp", "stat", "lstat", "readdir", "unlink", "rm", "open"]) {
  const method = fs.promises[name].bind(fs.promises);
  fs.promises[name] = (target, ...args) => {
    checkPath(target, mutation.test(name) || (name === "open" && !["r", "rs", undefined].includes(args[0])));
    return method(target, ...args);
  };
}
for (const name of ["rename", "copyFile", "cp", "link", "symlink"]) {
  const method = fs.promises[name].bind(fs.promises);
  fs.promises[name] = (source, target, ...args) => { checkPath(source); checkPath(target, true); return method(source, target, ...args); };
}
const local = host => ["127.0.0.1", "localhost", "::1", "[::1]"].includes(host);
function network(host, port) {
  if (importing) deny("network during import");
  if (!local(host) || !ports.has(Number(port))) deny("external or unregistered network");
}
const net = require("node:net");
const connect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args) {
  let options = args[0];
  if (Array.isArray(options)) options = options[0];
  if (typeof options === "object") network(options.host || "localhost", options.port);
  else network(typeof args[1] === "string" ? args[1] : "localhost", options);
  return connect.apply(this, args);
};
const listen = net.Server.prototype.listen;
net.Server.prototype.listen = function (...args) {
  if (importing) deny("listen during import");
  const host = typeof args[0] === "object" ? args[0].host : args[1];
  if (!local(host)) deny("non-loopback listener");
  this.once("listening", () => { ports.add(this.address().port); state.listeners++; });
  return listen.apply(this, args);
};
for (const protocol of [require("node:http"), require("node:https")]) {
  const create = protocol.createServer;
  protocol.createServer = (...args) => { if (importing) deny("server during import"); return create(...args); };
}
const fetch = global.fetch;
global.fetch = (input, options) => { const url = new URL(input); network(url.hostname, url.port || (url.protocol === "https:" ? 443 : 80)); return fetch(input, options); };
const dns = require("node:dns");
for (const name of ["lookup", "resolve", "resolve4", "resolve6"]) {
  const method = dns[name];
  dns[name] = (host, ...args) => { if (!local(host)) deny("external DNS"); return method(host, ...args); };
  const promiseMethod = dns.promises[name].bind(dns.promises);
  dns.promises[name] = (host, ...args) => { if (!local(host)) deny("external DNS"); return promiseMethod(host, ...args); };
}
require("node:dgram").createSocket = () => deny("UDP forbidden in tests");
require("node:worker_threads").Worker = class { constructor() { deny("worker forbidden in tests"); } };
const cp = require("node:child_process");
const owned = new Set();
for (const name of ["spawn", "spawnSync", "execFile", "execFileSync", "exec", "execSync", "fork"]) {
  const method = cp[name];
  cp[name] = (file, args = [], options = {}) => {
    if (importing) deny("child process during import");
    if (name === "fork") deny("fork forbidden in tests");
    if (name === "exec" || name === "execSync") deny("unstructured shell command");
    const command = path.basename(String(file)).toLowerCase();
    if (!["node", "node.exe", "python", "python.exe", "powershell.exe", "cmd.exe", "csc.exe", "bash.exe", "taskkill.exe"].includes(command)) deny("unapproved child executable");
    if (options.cwd) checkPath(options.cwd);
    if (args.some(arg => path.resolve(String(arg)) === path.join(root, "src/telegram_bot.py"))) deny("real bot entrypoint");
    if (command === "taskkill.exe" && (!args.includes("/PID") || !owned.has(Number(args[args.indexOf("/PID") + 1])))) deny("unowned taskkill");
    if (command === "powershell.exe") {
      const script = args[args.indexOf("-File") + 1];
      if (!args.includes("-File") || !["run-csharp-coverage.ps1", "run-powershell-coverage.ps1", "process-tree.test.ps1"].some(name => path.resolve(String(script)) === path.join(root, "tests", name))) deny("unapproved PowerShell script");
    }
    if (command === "csc.exe" && !contains(path.join(process.env.WINDIR, "Microsoft.NET"), path.resolve(file))) deny("unapproved compiler");
    if (command === "cmd.exe" && (!args.some(arg => String(arg).includes(sandbox)) || !options.env?.SPIDER_WRAPPER_TEST_LOG)) deny("unapproved CMD fixture");
    if (command === "bash.exe" && (!args.includes("--noprofile") || !args.includes("--norc") || options.env?.BASH_ENV?.replaceAll("\\", "/") !== path.join(root, "tests/native/posix-environment.sh").replaceAll("\\", "/").replace(/^([A-Za-z]):/, (_, drive) => "/" + drive.toLowerCase()))) deny("unapproved Bash fixture");
    state.children++;
    const child = method(file, args, { ...options, env: { ...process.env, ...options.env, NODE_OPTIONS: process.env.NODE_OPTIONS } });
    if (child.pid && typeof child.once === "function") {
      owned.add(child.pid);
      child.once("exit", () => owned.delete(child.pid));
    }
    return child;
  };
}
const load = Module._load;
Module._load = function (name, parent, isMain) {
  if (name === "node:sqlite") {
    const sqlite = load.apply(this, arguments);
    return { ...sqlite, DatabaseSync: class extends sqlite.DatabaseSync {
      constructor(target, ...args) {
        if (importing) deny("SQLite during import");
        if (target !== ":memory:" && !contains(sandbox, path.resolve(target))) deny("non-synthetic SQLite");
        state.sqlite++; super(target, ...args);
      }
    } };
  }
  let resolved;
  if (!Module.isBuiltin(name)) {
    resolved = Module._resolveFilename(name, parent);
    checkPath(resolved);
  }
  const app = resolved && contains(path.join(root, "src"), resolved);
  // Explicit entrypoint tests still run in the synthetic cwd/configuration.
  const guardedImport = app && !isMain;
  if (guardedImport) {
    if (process.env.SPIDER_SYNTHETIC_TEST !== "code-only") deny("synthetic configuration absent");
    state.imported.push(path.relative(root, resolved)); importing++;
  }
  try { return load.apply(this, arguments); }
  finally { if (guardedImport) importing--; }
};
global.__spiderIsolation = { root, sandbox, state, ports, checkPath,
  probeImport(fn) { importing++; try { return fn(); } finally { importing--; } } };
process.on("exit", () => original.write(path.join(root, "evidence/isolation", process.pid + ".json"), JSON.stringify(state, null, 2)));
original.write(path.join(root, "evidence/isolation", process.pid + ".started.json"), JSON.stringify({ pid: process.pid, parentPid: process.ppid, argv: process.argv.slice(1) }));
