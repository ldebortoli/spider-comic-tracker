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

async function weeklyUpdateCatchesUpMissingWeeksTest() {
  const state = new Map();
  const db = {
    getState(key, fallback) { return state.has(key) ? state.get(key) : fallback; },
    setState(key, value) { state.set(key, value); },
    getLastCompletedSyncRun() {
      return { weekYear: 2025, weekNumber: 51, weekKey: "2025-W51", status: "completed" };
    }
  };
  const service = new ComicTrackerService({ db, config: {} });
  const reviewed = [];
  service.performSync = async (options) => {
    reviewed.push(options);
    return {
      weekKey: `${options.weekYear}-W${String(options.weekNumber).padStart(2, "0")}`,
      processed: 1,
      added: 1,
      addedTitles: [`Issue ${options.weekYear}-${options.weekNumber}`]
    };
  };
  service.performCatalogImport = async () => ({ importedComics: 0, existingSkipped: 3, errors: [] });
  service.performPaniniImport = async () => ({ processedProducts: 0, matchedProducts: 0, errors: [] });

  const result = await service.performWeeklyUpdate({
    triggerSource: "test",
    weekYear: 2026,
    weekNumber: 2
  });

  assert.deepEqual(
    reviewed.map(({ weekYear, weekNumber }) => [weekYear, weekNumber]),
    [[2025, 52], [2026, 1], [2026, 2]]
  );
  assert.deepEqual(reviewed.map(({ runSideEffects }) => runSideEffects), [false, false, true]);
  assert.equal(result.weeklyReview.weeksReviewed, 3);
  assert.equal(result.weeklyReview.processed, 3);
  assert.equal(result.weeklyReview.fromWeekKey, "2025-W52");
  assert.equal(result.weeklyReview.toWeekKey, "2026-W02");
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

async function quarterlyRefreshScheduleValidationTest() {
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
    config: { catalogRefresh: { enabled: true, intervalMonths: 3, nextRefreshAt: "" } }
  });
  state.set("catalog_full_refresh_last_at", "2026-07-01T12:00:00.000Z");

  assert.throws(
    () => service.configureQuarterlyRefresh({ enabled: true, nextRefreshAt: "2026-09-30T12:00:00.000Z" }),
    /al menos 3 meses/
  );

  const status = service.configureQuarterlyRefresh({ enabled: true, nextRefreshAt: "2026-10-01T12:00:00.000Z" });
  assert.equal(status.configuredNextRefreshAt, "2026-10-01T12:00:00.000Z");
  assert.equal(state.get("catalog_full_refresh_next_at"), "2026-10-01T12:00:00.000Z");
}

async function paniniFailureDoesNotCancelUsaTest() {
  const state = new Map();
  const db = {
    getState(key, fallback) { return state.has(key) ? state.get(key) : fallback; },
    setState(key, value) { state.set(key, value); }
  };
  const service = new ComicTrackerService({ db, config: {} });
  service.performSync = async () => ({ processed: 1 });
  service.performCatalogImport = async () => ({ importedComics: 1, existingSkipped: 0, errors: [] });
  service.performPaniniImport = async () => { throw new Error("Sala de espera"); };
  const result = await service.performWeeklyUpdate({ triggerSource: "test", weekYear: 2026, weekNumber: 27 });
  assert.equal(result.status, "completed");
  assert.equal(result.paniniUpdate.status, "failed");
  assert.match(result.paniniUpdate.errorMessage, /Sala de espera/);
}

(async () => {
  await weeklyUpdateRunsBothStepsTest();
  console.log("ok - la actualizacion semanal ejecuta revision e importacion incremental");
  await weeklyUpdateCatchesUpMissingWeeksTest();
  console.log("ok - la actualizacion semanal recupera semanas faltantes incluso entre años");
  await quarterlyRefreshTest();
  console.log("ok - la revision trimestral actualiza todos los metadatos");
  await quarterlyRefreshScheduleValidationTest();
  console.log("ok - la revision trimestral valida la proxima fecha configurable");
  await paniniFailureDoesNotCancelUsaTest();
  console.log("ok - una caida de Panini no cancela la actualizacion USA");
})()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
