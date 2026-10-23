const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

// Execute complete CLI sources, replacing only database/network/process boundaries.
async function run(name, { args = [], db = {}, fetchBatch, fetchPage, parseProduct, importCatalog, write } = {}) {
  const output = [], errors = [], states = [], saved = [];
  let closed = 0;
  const fakeDb = {
    close() { closed++; }, setState(key, value) { states.push([key, JSON.parse(value)]); },
    getCatalogCharacter: () => ({ slug: "synthetic" }), getCatalogStats: () => ({ total: 1 }),
    listCatalogIssuesForEnemyBackfill: () => [], updateCatalogIssueAntagonists: items => items.length,
    listCatalogIssuesMissingCovers: () => [], listCatalogIssuesMissingDates: () => [],
    upsertCatalogIssues(items) { saved.push(...items); },
    listCatalogMembershipsMissingAppearanceDetails: () => [], updateCatalogAppearanceDetails: items => items.length,
    listSpanishEditionsMissingCovers: () => [], updateSpanishEditionCover: () => true,
    ...db
  };
  const fakeProcess = { argv: ["node", name, ...args], stdout: { write: text => { output.push(text); write?.(text); } } };
  const modules = {
    "../src/database": { ComicDatabase: class { constructor() { return fakeDb; } } },
    "../src/env": { loadEnv() {}, getConfig: () => ({ dbPath: ":memory:", marvelBaseUrl: "https://synthetic.invalid" }) },
    "../src/catalog": { fetchCatalogBatch: fetchBatch || (async () => ({ comics: [] })) },
    "../src/utils": { nowIso: () => "2026-10-23T12:00:00Z" },
    "../src/service": { ComicTrackerService: class { async performCatalogImport(options) {
      return importCatalog ? importCatalog(options) : { importedComics: 0, errors: [] };
    } } },
    "../src/universo-marvel": { fetchPage, parseUniversoMarvelProduct: parseProduct }
  };
  const filename = path.resolve(__dirname, "../scripts", name);
  const context = vm.createContext({ process: fakeProcess,
    console: { log: (...items) => output.push(...items), error: (...items) => errors.push(...items) },
    require: key => { assert.ok(Object.hasOwn(modules, key), key); return modules[key]; }
  });
  await vm.runInContext(fs.readFileSync(filename, "utf8"), context, { filename });
  return { output, errors, states, saved, closed, exitCode: fakeProcess.exitCode };
}

const issues = length => Array.from({ length }, (_, i) => ({ fandomPageId: i + 1, pageTitle: `Synthetic ${i}`, appearanceType: i % 2 ? "minor" : "" }));

test("catalog CLI validates character, reports progress once per batch and closes on errors", async () => {
  const result = await run("import-spiderman-catalog.js", { args: ["--character", "synthetic", "--continue"], importCatalog: async options => {
    assert.equal(options.characterSlug, "synthetic"); assert.equal(options.incremental, true);
    options.onProgress({ stage: "discovering", discovered: 12 });
    const progress = { stage: "importing", completedBatches: 0, totalBatches: 0, importedComics: 0, skippedNonComics: 0 };
    options.onProgress(progress); options.onProgress(progress);
    options.onProgress({ ...progress, completedBatches: 1, totalBatches: 2 });
    options.onProgress({ stage: "unrelated" });
    return { importedComics: 5, errors: [] };
  } });
  assert.equal(result.closed, 1); assert.equal(result.exitCode, 0);
  assert.equal(result.output.filter(item => typeof item === "string" && item.includes("Importando")).length, 2);
  assert.match(result.output.join(" "), /50%/);
  const partial = await run("import-spiderman-catalog.js", { importCatalog: async () => ({ importedComics: 1, errors: ["synthetic error"] }) });
  assert.equal(partial.exitCode, 2);
  for (const args of [["--character", "absent"], ["--character"]]) {
    const failed = await run("import-spiderman-catalog.js", { args, db: { getCatalogCharacter: () => null },
      importCatalog: async () => { throw new Error("synthetic fetch failure"); } });
    assert.equal(failed.exitCode, 1); assert.equal(failed.closed, 1); assert.ok(failed.errors.length);
  }
});

test("enemy backfill preserves filters, records failed batches and final status", async () => {
  const source = issues(201);
  let call = 0;
  const result = await run("backfill-catalog-enemies.js", { args: ["--missing-only", "--limit", "201", "--offset", "3"],
    db: { listCatalogIssuesForEnemyBackfill: options => { assert.equal(options.limit, 201); assert.equal(options.offset, 3); assert.equal(options.missingOnly, true); return source; } },
    fetchBatch: async ({ members }) => { if (++call === 2) throw new Error("temporary block"); return { comics: members.map((m, i) => ({ fandomPageId: m.pageId, antagonists: i % 2 ? ["Synthetic enemy"] : undefined })) }; }
  });
  const status = result.states.at(-1)[1];
  assert.equal(status.stage, "completed_with_errors"); assert.equal(status.processed, 201); assert.equal(status.changed, 191);
  assert.equal(status.errors[0].batch, 2); assert.equal(result.closed, 1);
  const empty = await run("backfill-catalog-enemies.js", { args: ["--limit", "--offset"] });
  assert.equal(empty.states.at(-1)[1].stage, "completed");
  const noLimitValue = await run("backfill-catalog-enemies.js", { args: ["--limit"] });
  assert.equal(noLimitValue.states.at(-1)[1].total, 0);
  const failed = await run("backfill-catalog-enemies.js", { db: { listCatalogIssuesForEnemyBackfill: () => { throw new Error("synthetic read failure"); } } });
  assert.equal(failed.states.at(-1)[1].stage, "failed"); assert.equal(failed.exitCode, 1); assert.equal(failed.closed, 1);
});

test("cover repair saves only recovered covers and reports transport failure", async () => {
  let reads = 0;
  const result = await run("repair-catalog-covers.js", { db: { listCatalogIssuesMissingCovers: () => ++reads === 1 ? issues(11) : [] },
    fetchBatch: async ({ members }) => ({ comics: members.map((m, i) => ({ ...m, coverImageUrl: i % 2 ? "https://synthetic.invalid/cover" : "" })) }) });
  assert.equal(result.saved.length, 5); assert.ok(result.saved.every(item => item.coverImageUrl));
  assert.match(result.output.join(" "), /Reparadas: 5/);
  const failed = await run("repair-catalog-covers.js", { db: { listCatalogIssuesMissingCovers: () => issues(1) }, fetchBatch: async () => { throw new Error("synthetic fetch failure"); } });
  assert.equal(failed.exitCode, 1); assert.ok(failed.errors.length);
});

test("date repair counts recovered, missing and failed batches and always closes", async () => {
  let calls = 0;
  const result = await run("repair-catalog-dates.js", { db: { listCatalogIssuesMissingDates: () => issues(11) }, fetchBatch: async () => {
    if (++calls === 2) throw new Error("blocked");
    return { comics: [{ releaseDate: "2026-01-01", dateSource: "release" }, { releaseDate: "2026-01-02", dateSource: "inferred" }, { releaseDate: "" }] };
  } });
  const counts = result.output.find(item => typeof item === "object");
  assert.equal(counts.repaired, 2); assert.equal(counts.unresolved, 9); assert.equal(counts.errors, 1);
  assert.equal(result.exitCode, 2); assert.equal(result.closed, 1);
  const empty = await run("repair-catalog-dates.js"); assert.equal(empty.exitCode, 0); assert.equal(empty.closed, 1);
  let first = true;
  const failed = await run("repair-catalog-dates.js", { write: () => { if (first) { first = false; throw new Error("broken output pipe"); } } });
  assert.equal(failed.exitCode, 1); assert.equal(failed.closed, 1);
});

test("appearance repair deduplicates pages and uses explicit and fallback details", async () => {
  const source = issues(201).map(item => ({ ...item, fandomEntity: "Synthetic" }));
  source.push({ ...source[0], fandomEntity: "Absent" });
  let changed = 0;
  const result = await run("repair-appearance-details.js", { db: {
    listCatalogMembershipsMissingAppearanceDetails: () => source,
    updateCatalogAppearanceDetails: items => { changed += items.length; assert.ok(items.every(i => ["cameo", "other"].includes(i.appearanceDetail))); return items.length; }
  }, fetchBatch: async ({ members }) => ({ comics: members.slice(0, 9).map((item, i) => ({ fandomPageId: item.pageId, appearanceDetails: i % 2 ? { Synthetic: "cameo" } : undefined })) }) });
  assert.equal(changed, 202); assert.equal(result.closed, 1); assert.match(result.output.join(" "), /"pages":201/);
  const failed = await run("repair-appearance-details.js", { db: { listCatalogMembershipsMissingAppearanceDetails: () => { throw new Error("synthetic read failure"); } } });
  assert.equal(failed.exitCode, 1); assert.equal(failed.closed, 1);
  assert.equal((await run("repair-appearance-details.js")).closed, 1);
});

test("Spanish cover repair skips other sources, counts failures and only updates covers", async () => {
  const source = ["other", "universo_marvel", "universo_marvel", "universo_marvel", "universo_marvel"].map((s, i) => ({ source: s, id: i, referenceUrl: `https://synthetic.invalid/${i}`, title: `Synthetic ${i}` }));
  let reads = 0, updates = 0;
  const result = await run("repair-spanish-covers.js", { db: {
    listSpanishEditionsMissingCovers: () => ++reads === 1 ? source : [],
    updateSpanishEditionCover: (id, url) => { updates++; assert.ok(url); return id === 2; }
  }, fetchPage: async url => { if (url.endsWith("/4")) throw new Error("blocked"); return url; },
    parseProduct: html => ({ coverImageUrl: html.endsWith("/1") ? "" : "https://synthetic.invalid/cover" }) });
  assert.equal(updates, 2); assert.equal(result.closed, 1); assert.match(result.output.join(" "), /Portadas reparadas: 1; errores: 1/);
  const failed = await run("repair-spanish-covers.js", { db: { listSpanishEditionsMissingCovers: () => { throw new Error("synthetic read failure"); } } });
  assert.equal(failed.exitCode, 1); assert.ok(failed.errors.length);
});
