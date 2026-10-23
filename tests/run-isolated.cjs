// Never import application code here. Snapshot first, then preload containment in children.
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createHash } = require("node:crypto");
const { spawnSync } = require("node:child_process");
const source = path.resolve(__dirname, "..");
function verifyReportDestination(target) {
  let existing = target;
  while (!fs.existsSync(existing)) existing = path.dirname(existing);
  const relative = path.relative(fs.realpathSync(source), fs.realpathSync(existing));
  if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("Report destination escapes source snapshot");
}
const mode = process.argv[2];
if (!["test", "security", "windows", "python", "shutdown", "coverage", "node", "native", "posix", "full"].includes(mode)) {
  throw new Error("Unknown isolated test mode");
}
if (["coverage", "full"].includes(mode)) {
  const priorSummary = path.join(source, "data/coverage/summary.json");
  verifyReportDestination(priorSummary);
  fs.rmSync(priorSummary, { force: true });
}
let root = source;
const isSnapshot = fs.existsSync(path.join(source, "evidence/baseline-manifest.json")) &&
  !fs.existsSync(path.join(source, ".git")) && !fs.existsSync(path.join(source, ".env"));
if (!isSnapshot) {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "spider-code-only-tests-"));
  const manifest = {};
  function copy(relative, inventory = true) {
    const from = path.join(source, relative), to = path.join(root, relative);
    const info = fs.lstatSync(from);
    if (info.isSymbolicLink()) throw new Error("Test snapshot refuses reparse points");
    if (info.isDirectory()) {
      fs.mkdirSync(to, { recursive: true });
      for (const name of fs.readdirSync(from)) copy(path.join(relative, name), inventory);
    } else {
      if (/(^|[\\/])\.env$|(\.sqlite3?|\.db|-wal|-shm|\.pem|\.key)$/i.test(relative)) throw new Error("Non-code file refused by snapshot");
      fs.mkdirSync(path.dirname(to), { recursive: true });
      fs.copyFileSync(from, to);
      if (inventory) manifest[relative.replaceAll("\\", "/")] = createHash("sha256").update(fs.readFileSync(to)).digest("hex");
    }
  }
  for (const name of ["src", "public", "scripts", "tests", "assets", "packaging", "package.json", "package-lock.json", "README.md"]) copy(name);
  for (const name of fs.readdirSync(source).filter(name => name.endsWith(".cmd"))) copy(name);
  for (const name of ["node_modules", "data/coverage-tools/Pester/5.7.1", "data/coverage-tools/altcover"]) {
    if (fs.existsSync(path.join(source, name))) copy(name, false);
  }
  fs.mkdirSync(path.join(root, "evidence"), { recursive: true });
  fs.writeFileSync(path.join(root, "evidence/baseline-manifest.json"), JSON.stringify({ files: manifest }, null, 2) + "\n");
}
if (["native", "coverage", "full"].includes(mode)) {
  for (const probe of ["data/coverage-tools/Pester/5.7.1/Pester.psd1", "data/coverage-tools/altcover/tools/net472/AltCover.exe"]) {
    if (!fs.existsSync(path.join(root, probe))) throw new Error("Offline coverage dependency missing: " + probe);
  }
}
const guard = path.join(root, "tests/isolation-guard.cjs");
const inheritedKeys = new Set(["PATH", "PATHEXT", "SYSTEMROOT", "SYSTEMDRIVE", "WINDIR", "COMSPEC", "PROCESSOR_ARCHITECTURE", "NUMBER_OF_PROCESSORS", "PROGRAMDATA", "USERPROFILE", "APPDATA", "LOCALAPPDATA"]);
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => inheritedKeys.has(key.toUpperCase())));
Object.assign(env, { NODE_OPTIONS: '--require "' + guard.replaceAll("\\", "/") + '"', PYTHONDONTWRITEBYTECODE: "1", PYTHONUTF8: "1" });
function execute(program, args) {
  const result = spawnSync(program, args, { cwd: root, env, stdio: "inherit", windowsHide: true });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error("Isolated validation failed: " + path.basename(program) + " (" + (result.status ?? result.signal) + ")");
}
const node = (...args) => execute(process.execPath, args);
const python = (...args) => execute("python", ["-B", ...args]);
const powershell = file => execute("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "tests/" + file]);
const jsTests = fs.readdirSync(path.join(root, "tests")).filter(name => name.endsWith(".test.js")).sort().map(name => "tests/" + name);
const thresholds = ["--test-coverage-lines=100", "--test-coverage-branches=100", "--test-coverage-functions=100"];
try {
  node("tests/isolation-smoke.cjs");
  python("tests/python_isolation_smoke.py");
  if (mode === "test") { node("--test", ...jsTests); python("tests/telegram_bot_test.py"); }
  if (mode === "security") node("--test", "--experimental-test-coverage", "--test-coverage-include=src/http-security.js",
    "--test-coverage-include=src/server.js", "--test-coverage-include=public/local-api.js", ...thresholds,
    "tests/http-security.test.js", "tests/server.test.js", "tests/ui-security.test.js");
  if (mode === "shutdown") node("--test", "--experimental-test-coverage", "--test-coverage-include=src/weekly-shutdown.js", ...thresholds, "tests/weekly-shutdown.test.js");
  if (mode === "node") node("tests/run-node-coverage.js");
  if (mode === "python") {
    fs.mkdirSync(path.join(root, "data/coverage"), { recursive: true });
    python("-m", "coverage", "run", "--branch", "--data-file=data/coverage/python.coverage", "--include=src/telegram_bot.py", "tests/telegram_bot_test.py");
    python("-m", "coverage", "report", "--data-file=data/coverage/python.coverage", "--fail-under=100");
  }
  if (mode === "native") {
    powershell("run-csharp-coverage.ps1"); powershell("run-powershell-coverage.ps1");
    node("--test", "tests/native/wrappers.test.js");
  }
  if (mode === "posix") node("--test", "tests/native/posix.test.js");
  if (mode === "coverage" || mode === "full") node("tests/run-coverage.js");
  if (mode === "windows" || mode === "full") powershell("process-tree.test.ps1");
} finally {
  // Preserve the snapshot for diagnosis; copy reports only, never fixture DB/config/PIDs.
  if (root !== source) {
    for (const relative of ["data/coverage", "evidence/isolation", "data/coverage-posix-summary.json"]) {
      const from = path.join(root, relative);
      if (fs.existsSync(from)) {
        const to = path.join(source, relative);
        verifyReportDestination(to);
        fs.mkdirSync(path.dirname(to), { recursive: true });
        fs.cpSync(from, to, { recursive: true });
      }
    }
  }
  console.log("Isolated test snapshot: " + root);
}
