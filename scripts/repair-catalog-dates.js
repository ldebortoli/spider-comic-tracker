const { fetchCatalogBatch } = require("../src/catalog");
const { ComicDatabase } = require("../src/database");
const { getConfig, loadEnv } = require("../src/env");

loadEnv();

const config = getConfig();
const db = new ComicDatabase(config.dbPath);
const missing = db.listCatalogIssuesMissingDates();
const batches = [];

for (let index = 0; index < missing.length; index += 10) {
  batches.push(missing.slice(index, index + 10).map((issue) => ({
    pageId: Number(issue.fandomPageId),
    pageTitle: issue.pageTitle,
    appearanceType: issue.appearanceType || "direct"
  })));
}

const counts = {
  scanned: missing.length,
  repaired: 0,
  release: 0,
  cover: 0,
  defaultsort: 0,
  unresolved: 0,
  errors: 0
};
let nextBatch = 0;
let completedBatches = 0;

async function worker() {
  while (true) {
    const batchIndex = nextBatch;
    nextBatch += 1;

    if (batchIndex >= batches.length) {
      return;
    }

    try {
      const result = await fetchCatalogBatch({
        baseUrl: config.marvelBaseUrl,
        members: batches[batchIndex]
      });
      db.upsertCatalogIssues(result.comics);

      for (const issue of result.comics) {
        if (issue.releaseDate) {
          counts.repaired += 1;
          counts[issue.dateSource] = (counts[issue.dateSource] || 0) + 1;
        } else {
          counts.unresolved += 1;
        }
      }

      counts.unresolved += Math.max(0, batches[batchIndex].length - result.comics.length);
    } catch (error) {
      counts.errors += 1;
      counts.unresolved += batches[batchIndex].length;
      console.error(`\nLote ${batchIndex + 1}: ${error.message}`);
    } finally {
      completedBatches += 1;
      process.stdout.write(`\rFechas: ${completedBatches}/${batches.length} lotes | reparadas ${counts.repaired} | sin fecha ${counts.unresolved}`);
    }
  }
}

(async () => {
  try {
    await Promise.all(Array.from({ length: Math.min(5, Math.max(1, batches.length)) }, () => worker()));
    process.stdout.write("\n");
    console.log(counts);
    process.exitCode = counts.errors ? 2 : 0;
  } catch (error) {
    console.error("No se pudieron reparar las fechas:", error);
    process.exitCode = 1;
  } finally {
    db.close();
  }
})();
