const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const reportDir = path.join(root, "data/coverage");
fs.mkdirSync(reportDir, { recursive: true });
fs.rmSync(path.join(reportDir, "summary.json"), { force: true });

function execute(program, args) {
  const result = spawnSync(program, args, { cwd: root, stdio: "inherit", windowsHide: true });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${program} validation failed (${result.status ?? result.signal}).`);
}

try {
  execute(process.execPath, ["tests/run-node-coverage.js"]);
  execute("python", ["-B", "-m", "coverage", "run", "--branch", "--data-file=data/coverage/python.coverage", "--include=src/telegram_bot.py", "tests/telegram_bot_test.py"]);
  execute("python", ["-B", "-m", "coverage", "report", "--data-file=data/coverage/python.coverage", "--fail-under=100"]);
  execute("python", ["-B", "-m", "coverage", "json", "--data-file=data/coverage/python.coverage", "-o", "data/coverage/python-summary.json"]);
  const python = JSON.parse(fs.readFileSync(path.join(reportDir, "python-summary.json"), "utf8"));
  const pythonFiles = fs.readdirSync(path.join(root, "src")).filter(file => file.endsWith(".py")).map(file => `src/${file}`);
  const measuredPython = Object.keys(python.files).map(file => file.replaceAll("\\", "/")).sort();
  if (JSON.stringify(pythonFiles.sort()) !== JSON.stringify(measuredPython) || python.totals.missing_lines || python.totals.missing_branches) throw new Error("Incomplete Python coverage or source inventory.");
  execute("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "tests/run-csharp-coverage.ps1"]);
  execute("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "tests/run-powershell-coverage.ps1"]);
  execute(process.execPath, ["--test", "tests/native/wrappers.test.js"]);
  execute(process.execPath, ["--test", "tests/native/posix.test.js"]);
  const read = file => JSON.parse(fs.readFileSync(path.join(reportDir, file), "utf8").replace(/^\uFEFF/, ""));
  const summary = {
    version: require("../package.json").version,
    javascript: read("node-summary.json"),
    python: { files: measuredPython, lines: python.totals.covered_lines, statements: python.totals.num_statements, branches: python.totals.num_branches, missingLines: 0, missingBranches: 0 },
    csharp: read("csharp-summary.json"),
    powershell: read("powershell/summary.json"),
    bash: JSON.parse(fs.readFileSync(path.join(root, "data/coverage-posix-summary.json"), "utf8")),
    // Bash and the AppleScript contract have their own source-hash inventory.
    contracts: { cmdWrappers: "passed", appleScript: "see POSIX contract report; no executable percentage assigned" }
  };
  fs.writeFileSync(path.join(reportDir, "summary.json"), JSON.stringify(summary, null, 2) + "\n");
  console.log("All local coverage gates and launcher contracts passed; no reachable instrumentable production source omitted.");
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
