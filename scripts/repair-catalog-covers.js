const { fetchCatalogBatch } = require("../src/catalog");
const { ComicDatabase } = require("../src/database");
const { getConfig, loadEnv } = require("../src/env");

loadEnv();

async function main() {
  const config = getConfig();
  const db = new ComicDatabase(config.dbPath);
  const missing = db.listCatalogIssuesMissingCovers();
  const batchSize = 10;
  let repaired = 0;
  let processed = 0;

  console.log(`Fichas sin tapa antes de reparar: ${missing.length}`);

  for (let index = 0; index < missing.length; index += batchSize) {
    const members = missing.slice(index, index + batchSize).map((issue) => ({
      pageId: Number(issue.fandomPageId),
      pageTitle: issue.pageTitle,
      appearanceType: issue.appearanceType || "direct"
    }));
    const result = await fetchCatalogBatch({ baseUrl: config.marvelBaseUrl, members });
    const repairedItems = result.comics.filter((comic) => comic.coverImageUrl);
    db.upsertCatalogIssues(repairedItems);
    repaired += repairedItems.length;
    processed += members.length;
    process.stdout.write(`\rProcesadas ${processed}/${missing.length}; reparadas ${repaired}`);
  }

  const remaining = db.listCatalogIssuesMissingCovers();
  process.stdout.write("\n");
  console.log(`Reparadas: ${repaired}`);
  console.log(`Sin tapa declarada o recuperable: ${remaining.length}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
