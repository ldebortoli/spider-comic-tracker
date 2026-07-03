const { ComicDatabase } = require("../src/database");
const { getConfig, loadEnv } = require("../src/env");
const { fetchPage, parseUniversoMarvelProduct } = require("../src/universo-marvel");

loadEnv();

async function main() {
  const config = getConfig();
  const db = new ComicDatabase(config.dbPath);
  const missing = db.listSpanishEditionsMissingCovers();
  let cursor = 0;
  let repaired = 0;
  let errors = 0;

  console.log(`Ediciones españolas sin portada: ${missing.length}`);

  async function worker() {
    while (true) {
      const item = missing[cursor];
      cursor += 1;
      if (!item) return;

      try {
        if (item.source !== "universo_marvel") continue;
        const product = parseUniversoMarvelProduct(
          await fetchPage(item.referenceUrl),
          item.referenceUrl,
          item.title
        );
        if (product.coverImageUrl && db.updateSpanishEditionCover(item.id, product.coverImageUrl)) repaired += 1;
      } catch (error) {
        errors += 1;
        console.error(`No se pudo revisar ${item.referenceUrl}: ${error.message}`);
      }
    }
  }

  await Promise.all(Array.from({ length: 6 }, () => worker()));
  const remaining = db.listSpanishEditionsMissingCovers();
  db.close();
  console.log(`Portadas reparadas: ${repaired}; errores: ${errors}; todavía sin portada: ${remaining.length}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
