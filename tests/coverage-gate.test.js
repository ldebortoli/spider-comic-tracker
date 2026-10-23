const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");
const { collectProductionFiles, parseLcov, validateCoverage } = require("./run-node-coverage");

function lcov(file = "src/example.js", overrides = {}) {
  const values = { lines: 2, lineHits: [1, 1], functions: 1, functionHits: [1], branches: 1, branchHits: [1], ...overrides };
  return [`SF:${file}`, ...values.lineHits.map((hits, index) => `DA:${index + 1},${hits}`),
    ...values.functionHits.map((hits, index) => `FNDA:${hits},function${index}`),
    ...values.branchHits.map((hits, index) => `BRDA:1,0,${index},${hits}`),
    `LF:${values.lines}`, `LH:${values.lineHits.filter(hits => hits > 0).length}`,
    `FNF:${values.functions}`, `FNH:${values.functionHits.filter(hits => hits > 0).length}`,
    `BRF:${values.branches}`, `BRH:${values.branchHits.filter(hits => hits > 0).length}`, "end_of_record", ""].join("\n");
}

test("coverage inventory includes nested production JavaScript and catches never-loaded files", t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "comic-coverage-gate-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const name of ["src", "public", "scripts", "src/nested"]) fs.mkdirSync(path.join(root, name));
  fs.writeFileSync(path.join(root, "src/example.js"), "example");
  fs.writeFileSync(path.join(root, "src/nested/missing.js"), "missing");
  fs.writeFileSync(path.join(root, "public/style.css"), "css");
  const inventory = collectProductionFiles(root);
  assert.deepEqual(inventory, ["src/example.js", "src/nested/missing.js"]);
  assert.throws(() => validateCoverage(parseLcov(lcov(), root), inventory), /absent.*nested\/missing/);
});

test("coverage guard accepts only exact raw 100% and relative, complete source inventories", () => {
  const root = process.cwd();
  const inventory = ["src/example.js"];
  const parsed = parseLcov(lcov(path.join(root, "src/example.js")), root);
  const summary = validateCoverage(parsed, inventory);
  assert.deepEqual(summary.metrics, { lines: { covered: 2, total: 2 }, functions: { covered: 1, total: 1 }, branches: { covered: 1, total: 1 } });
  assert.equal(summary.files[0].file, "src/example.js");
  assert.equal(JSON.stringify(summary).includes(root), false);
  for (const overrides of [{ lineHits: [1, 0] }, { functionHits: [0] }, { branchHits: ["-"] }, { lineHits: [1], lines: 2 }]) {
    assert.throws(() => validateCoverage(parseLcov(lcov(undefined, overrides), root), inventory), /below 100%|inconsistent/);
  }
  assert.throws(() => validateCoverage(parseLcov(lcov(undefined, { lineHits: [], lines: 0 }), root), inventory), /no instrumented lines/);
  assert.throws(() => validateCoverage(parsed, []), /inventory is empty/);
  assert.throws(() => validateCoverage([...parsed, ...parsed], inventory), /Duplicate/);
  assert.throws(() => validateCoverage(parsed, ["src/other.js"]), /Unexpected/);
  assert.throws(() => parseLcov(lcov("../outside.js"), root), /outside the project/);
  assert.throws(() => parseLcov(lcov().replace("end_of_record", ""), root), /missing end_of_record/);
  assert.throws(() => parseLcov(lcov().replace("DA:1,1", "DA:1,bad"), root), /Invalid LCOV hit count/);
  assert.throws(() => parseLcov(lcov().replace("LF:2", "LF:bad"), root), /Invalid LCOV totals/);
  assert.throws(() => validateCoverage(parseLcov(lcov().replace("LF:2\n", ""), root), inventory), /inconsistent/);
  const manyLines = lcov(undefined, { lines: 100_000, lineHits: Array.from({ length: 100_000 }, (_, index) => index === 99_999 ? 0 : 1) });
  assert.throws(() => validateCoverage(parseLcov(manyLines, root), inventory), /lines 99999\/100000/);
});
