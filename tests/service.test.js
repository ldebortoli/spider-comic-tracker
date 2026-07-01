const assert = require("node:assert/strict");

const { ComicTrackerService } = require("../src/service");

async function weeklyUpdateRunsBothStepsTest() {
  const state = new Map();
  const db = {
    getState(key, fallback) {
      return state.has(key) ? state.get(key) : fallback;
    },
    setState(key, value) {
      state.set(key, value);
    }
  };
  const service = new ComicTrackerService({ db, config: {} });
  const calls = [];

  service.performSync = async (options) => {
    calls.push(["weekly-review", options]);
    return { processed: 3 };
  };
  service.performCatalogImport = async (options) => {
    calls.push(["catalog-update", options]);
    return { importedComics: 2, existingSkipped: 100, errors: [] };
  };
  service.performPaniniImport = async (options) => {
    calls.push(["panini-update", options]);
    return { processedProducts: 4, matchedProducts: 1, pendingContains: 2, pendingMatch: 1, errors: [] };
  };

  const result = await service.performWeeklyUpdate({
    triggerSource: "scheduled",
    weekYear: 2026,
    weekNumber: 27
  });

  assert.deepEqual(calls.map(([name]) => name), ["weekly-review", "catalog-update", "panini-update"]);
  assert.equal(calls[1][1].incremental, true);
  assert.equal(result.status, "completed");
  assert.equal(result.weekKey, "2026-W27");
  assert.equal(JSON.parse(state.get("weekly_update_status")).catalogUpdate.importedComics, 2);
  assert.equal(JSON.parse(state.get("weekly_update_status")).paniniUpdate.matchedProducts, 1);
}

async function quarterlyRefreshTest() {
  const state = new Map();
  const db = {
    getState(key, fallback) {
      return state.has(key) ? state.get(key) : fallback;
    },
    setState(key, value) {
      state.set(key, value);
    }
  };
  const service = new ComicTrackerService({
    db,
    config: { catalogRefresh: { enabled: true, intervalMonths: 3 } }
  });
  service.performCatalogImport = async (options) => {
    assert.equal(options.incremental, false);
    assert.equal(options.triggerSource, "manual");
    state.set("catalog_full_refresh_last_at", new Date().toISOString());
    return { importedComics: 42, errors: [] };
  };

  service.ensureQuarterlyRefreshBaseline();
  assert.equal(service.getQuarterlyRefreshStatus().intervalMonths, 3);
  const started = service.startQuarterlyRefresh({ triggerSource: "manual", force: true });
  assert.equal(started.started, true);
  await service.currentQuarterlyRefreshPromise;
  const status = JSON.parse(state.get("quarterly_refresh_status"));
  assert.equal(status.status, "completed");
  assert.equal(status.importedComics, 42);
}

(async () => {
  await weeklyUpdateRunsBothStepsTest();
  console.log("ok - la actualizacion semanal ejecuta revision e importacion incremental");
  await quarterlyRefreshTest();
  console.log("ok - la revision trimestral actualiza todos los metadatos");
})()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
