const { ComicDatabase } = require("../src/database");
const { getConfig, loadEnv } = require("../src/env");
const { ComicTrackerService } = require("../src/service");

loadEnv();

const config = getConfig();
const db = new ComicDatabase(config.dbPath);
const service = new ComicTrackerService({ db, config });
let lastPrintedBatch = -1;
const args = process.argv.slice(2);
const characterArgumentIndex = args.indexOf("--character");
const characterSlug = characterArgumentIndex === -1 ? "" : String(args[characterArgumentIndex + 1] || "");
const incremental = args.includes("--continue");

function printProgress(progress) {
  if (progress.stage === "discovering") {
    process.stdout.write(`\rDescubriendo apariciones: ${progress.discovered}`);
    return;
  }

  if (progress.stage === "importing" && progress.completedBatches !== lastPrintedBatch) {
    lastPrintedBatch = progress.completedBatches;
    const percent = progress.totalBatches
      ? Math.floor((progress.completedBatches / progress.totalBatches) * 100)
      : 0;
    process.stdout.write(
      `\rImportando fichas: ${progress.completedBatches}/${progress.totalBatches} (${percent}%) | cómics: ${progress.importedComics} | omitidos: ${progress.skippedNonComics}`
    );
  }
}

(async () => {
  try {
    if (characterSlug && !db.getCatalogCharacter(characterSlug)) {
      throw new Error(`No existe el personaje con slug "${characterSlug}".`);
    }

    const result = await service.performCatalogImport({
      characterSlug,
      incremental,
      onProgress: printProgress
    });
    process.stdout.write("\n");
    console.log(`Catálogo listo: ${result.importedComics} cómics procesados, ${result.errors.length} lotes con error.`);
    console.log(db.getCatalogStats(characterSlug || "peter-parker-earth-616"));
    process.exitCode = result.errors.length ? 2 : 0;
  } catch (error) {
    process.stdout.write("\n");
    console.error("No se pudo importar el catálogo:", error);
    process.exitCode = 1;
  } finally {
    db.close();
  }
})();
