const fs = require("node:fs");
const path = require("node:path");
const { fileURLToPath } = require("node:url");
const { spawnSync } = require("node:child_process");

const SOURCE_DIRECTORIES = ["src", "public", "scripts"];
const INCLUDE_PATTERNS = ["src/**/*.js", "public/**/*.js", "scripts/*.js"];
const THRESHOLDS = { lines: 100, branches: 100, functions: 100 };

function collectProductionFiles(root) {
  const files = [];
  function visit(directory) {
    for (const entry of fs.readdirSync(path.join(root, directory), { withFileTypes: true })) {
      const relative = path.posix.join(directory, entry.name);
      if (entry.isDirectory()) visit(relative);
      else if (entry.isFile() && entry.name.endsWith(".js")) files.push(relative);
    }
  }
  for (const directory of SOURCE_DIRECTORIES) visit(directory);
  return files.sort();
}

function relativeSource(root, filename) {
  const resolved = filename.startsWith("file:") ? fileURLToPath(filename) : path.resolve(root, filename);
  const relative = path.relative(root, resolved).split(path.sep).join("/");
  if (!relative || relative === ".." || relative.startsWith("../") || path.isAbsolute(relative)) {
    throw new Error("LCOV contains a source outside the project.");
  }
  return relative;
}

function parseLcov(content, root) {
  const records = [];
  let record;
  const metricNames = { LF: "linesTotal", LH: "linesCovered", FNF: "functionsTotal", FNH: "functionsCovered", BRF: "branchesTotal", BRH: "branchesCovered" };
  for (const line of content.split(/\r?\n/)) {
    if (line.startsWith("SF:")) {
      if (record) throw new Error("LCOV source record is missing end_of_record.");
      record = { file: relativeSource(root, line.slice(3)), lineHits: [], functionHits: [], branchHits: [], counts: {} };
    } else if (line === "end_of_record") {
      if (!record) throw new Error("LCOV has an unexpected end_of_record.");
      records.push(record);
      record = undefined;
    } else if (record) {
      const separator = line.indexOf(":");
      const key = line.slice(0, separator);
      const value = line.slice(separator + 1);
      if (metricNames[key]) {
        if (!/^\d+$/.test(value) || record.counts[metricNames[key]] !== undefined) throw new Error(`Invalid LCOV totals for ${record.file}.`);
        record.counts[metricNames[key]] = Number(value);
      } else if (["DA", "FNDA", "BRDA"].includes(key)) {
        const pieces = value.split(",");
        const hitValue = pieces[key === "DA" ? 1 : key === "FNDA" ? 0 : 3];
        const hits = hitValue === "-" && key === "BRDA" ? 0 : Number(hitValue);
        if (!/^\d+$/.test(hitValue) && !(hitValue === "-" && key === "BRDA") || !Number.isSafeInteger(hits)) {
          throw new Error(`Invalid LCOV hit count for ${record.file}.`);
        }
        record[key === "DA" ? "lineHits" : key === "FNDA" ? "functionHits" : "branchHits"].push(hits);
      }
    }
  }
  if (record) throw new Error("LCOV source record is missing end_of_record.");
  return records;
}

function validateCoverage(records, inventory) {
  if (!inventory.length) throw new Error("Production JavaScript inventory is empty.");
  const expected = new Set(inventory);
  const seen = new Set();
  const files = [];
  const aggregate = Object.fromEntries(Object.keys(THRESHOLDS).map(metric => [metric, { covered: 0, total: 0 }]));
  for (const record of records) {
    if (!expected.has(record.file)) throw new Error(`Unexpected LCOV source: ${record.file}.`);
    if (seen.has(record.file)) throw new Error(`Duplicate LCOV source: ${record.file}.`);
    seen.add(record.file);
    const metrics = {};
    for (const [name, hitsName] of [["lines", "lineHits"], ["functions", "functionHits"], ["branches", "branchHits"]]) {
      const hits = record[hitsName];
      const total = record.counts[`${name}Total`];
      const covered = record.counts[`${name}Covered`];
      if (!Number.isSafeInteger(total) || !Number.isSafeInteger(covered) || total < 0 || covered < 0 || covered > total || hits.length !== total || hits.filter(count => count > 0).length !== covered) {
        throw new Error(`Missing or inconsistent LCOV ${name} totals for ${record.file}.`);
      }
      if (name === "lines" && total === 0) throw new Error(`LCOV has no instrumented lines for ${record.file}.`);
      if (covered !== total || hits.some(count => count === 0)) throw new Error(`Coverage below 100% for ${record.file}: ${name} ${covered}/${total}.`);
      metrics[name] = { covered, total };
      aggregate[name].covered += covered;
      aggregate[name].total += total;
    }
    files.push({ file: record.file, ...metrics });
  }
  const missing = inventory.filter(file => !seen.has(file));
  if (missing.length) throw new Error(`Production source absent from LCOV: ${missing.join(", ")}.`);
  for (const [name, counts] of Object.entries(aggregate)) {
    if (!counts.total) throw new Error(`LCOV has no measurable ${name}.`);
  }
  return { thresholds: THRESHOLDS, metrics: aggregate, files: files.sort((left, right) => left.file.localeCompare(right.file)) };
}

function run(root = path.resolve(__dirname, "..")) {
  const outputDir = path.join(root, "data", "coverage");
  const lcovPath = path.join(outputDir, "node.lcov");
  const summaryPath = path.join(outputDir, "node-summary.json");
  fs.mkdirSync(outputDir, { recursive: true });
  fs.rmSync(lcovPath, { force: true });
  fs.rmSync(summaryPath, { force: true });
  const inventory = collectProductionFiles(root);
  const tests = fs.readdirSync(path.join(root, "tests")).filter(name => name.endsWith(".test.js")).sort().map(name => `tests/${name}`);
  if (!tests.length) throw new Error("No JavaScript test suites were found.");
  const args = ["--test", "--experimental-test-coverage", ...INCLUDE_PATTERNS.map(pattern => `--test-coverage-include=${pattern}`),
    ...Object.entries(THRESHOLDS).map(([metric, threshold]) => `--test-coverage-${metric}=${threshold}`),
    "--test-reporter=spec", "--test-reporter-destination=stdout", "--test-reporter=lcov", `--test-reporter-destination=${lcovPath}`, ...tests];
  const result = spawnSync(process.execPath, args, { cwd: root, stdio: "inherit", windowsHide: true });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Node tests or native coverage thresholds failed (exit ${result.status ?? result.signal}).`);
  if (!fs.existsSync(lcovPath)) throw new Error("Node did not produce the required LCOV report.");
  const content = fs.readFileSync(lcovPath, "utf8");
  const records = parseLcov(content, root);
  const summary = validateCoverage(records, inventory);
  fs.writeFileSync(lcovPath, content.replace(/^SF:(.+)$/gm, (_, filename) => `SF:${relativeSource(root, filename.trimEnd())}`));
  fs.writeFileSync(summaryPath, `${JSON.stringify({ nodeVersion: process.version, generatedAt: new Date().toISOString(), scope: INCLUDE_PATTERNS, ...summary }, null, 2)}\n`);
  console.log(`Verified ${summary.files.length}/${inventory.length} production JavaScript files: exactly 100% lines, branches and functions.`);
  return summary;
}

if (require.main === module) {
  try { run(); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}

module.exports = { collectProductionFiles, parseLcov, validateCoverage, run };
