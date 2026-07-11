const { fetchCatalogBatch } = require("../src/catalog");
const { ComicDatabase } = require("../src/database");
const { getConfig, loadEnv } = require("../src/env");
const { nowIso } = require("../src/utils");

loadEnv();

const args = process.argv.slice(2);
const missingOnly = args.includes("--missing-only");
const limitIndex = args.indexOf("--limit");
const offsetIndex = args.indexOf("--offset");
const limit = limitIndex === -1 ? 0 : Number(args[limitIndex + 1] || 0);
const offset = offsetIndex === -1 ? 0 : Number(args[offsetIndex + 1] || 0);
const config = getConfig();
const db = new ComicDatabase(config.dbPath);

function chunks(items, size) {
  const result = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}

function saveStatus(status) {
  db.setState("catalog_enemy_backfill_status", JSON.stringify({
    ...status,
    updatedAt: nowIso()
  }));
}

async function main() {
  const issues = db.listCatalogIssuesForEnemyBackfill({ missingOnly, limit, offset });
  const batches = chunks(issues.map((issue) => ({
    pageId: Number(issue.fandomPageId),
    pageTitle: issue.pageTitle,
    appearanceType: issue.appearanceType || "direct"
  })), 10);
  const startedAt = nowIso();
  const status = {
    running: true,
    stage: "fetching_antagonists",
    missingOnly,
    total: issues.length,
    totalBatches: batches.length,
    completedBatches: 0,
    processed: 0,
    changed: 0,
    errors: [],
    startedAt,
    finishedAt: ""
  };

  saveStatus(status);
  console.log(`Fichas a revisar: ${issues.length}`);

  let nextBatch = 0;

  async function worker() {
    while (true) {
      const index = nextBatch;
      nextBatch += 1;

      if (index >= batches.length) {
        return;
      }

      try {
        const result = await fetchCatalogBatch({ baseUrl: config.marvelBaseUrl, members: batches[index] });
        status.changed += db.updateCatalogIssueAntagonists(result.comics.map((comic) => ({
          fandomPageId: comic.fandomPageId,
          antagonists: comic.antagonists || []
        })));
      } catch (error) {
        status.errors.push({
          batch: index + 1,
          pageTitles: batches[index].map((item) => item.pageTitle),
          message: error.message
        });
      } finally {
        status.completedBatches += 1;
        status.processed += batches[index].length;
        saveStatus(status);

        if (status.completedBatches % 20 === 0 || status.completedBatches === status.totalBatches) {
          console.log(`Procesadas ${status.processed}/${status.total}; lotes ${status.completedBatches}/${status.totalBatches}; errores ${status.errors.length}`);
        }
      }
    }
  }

  await Promise.all(Array.from({ length: 5 }, () => worker()));

  const finalStatus = {
    ...status,
    running: false,
    stage: status.errors.length ? "completed_with_errors" : "completed",
    finishedAt: nowIso()
  };
  saveStatus(finalStatus);
  console.log(JSON.stringify(finalStatus, null, 2));
}

main().catch((error) => {
  saveStatus({
    running: false,
    stage: "failed",
    errorMessage: error.message,
    finishedAt: nowIso()
  });
  console.error(error);
  process.exitCode = 1;
}).finally(() => db.close());
