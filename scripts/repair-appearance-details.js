const { fetchCatalogBatch } = require("../src/catalog");
const { ComicDatabase } = require("../src/database");
const { getConfig, loadEnv } = require("../src/env");

loadEnv();
const config = getConfig();
const db = new ComicDatabase(config.dbPath);

function chunks(items, size) {
  const result = [];
  for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size));
  return result;
}

async function main() {
  const memberships = db.listCatalogMembershipsMissingAppearanceDetails();
  const pages = new Map();
  for (const item of memberships) {
    if (!pages.has(item.fandomPageId)) pages.set(item.fandomPageId, { pageId: item.fandomPageId, pageTitle: item.pageTitle, appearanceType: "minor" });
  }
  const batches = chunks([...pages.values()], 10);
  let nextBatch = 0;
  let updated = 0;

  async function worker() {
    while (true) {
      const index = nextBatch;
      nextBatch += 1;
      if (index >= batches.length) return;
      const result = await fetchCatalogBatch({ baseUrl: config.marvelBaseUrl, members: batches[index] });
      const detailsByPage = new Map(result.comics.map((comic) => [comic.fandomPageId, comic.appearanceDetails || {}]));
      const pageIds = new Set(batches[index].map((item) => item.pageId));
      const changes = memberships.filter((item) => pageIds.has(item.fandomPageId)).map((item) => ({
        ...item,
        appearanceDetail: detailsByPage.get(item.fandomPageId)?.[item.fandomEntity] || "other"
      }));
      updated += db.updateCatalogAppearanceDetails(changes);
      if ((index + 1) % 20 === 0 || index + 1 === batches.length) {
        console.log(`Apariciones procesadas: ${Math.min((index + 1) * 10, pages.size)}/${pages.size}; relaciones actualizadas: ${updated}`);
      }
    }
  }

  await Promise.all(Array.from({ length: 5 }, () => worker()));
  console.log(JSON.stringify({ pages: pages.size, memberships: memberships.length, updated }));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => db.close());
