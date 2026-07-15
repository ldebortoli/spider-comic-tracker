const assert = require("node:assert/strict");

const { ComicDatabase } = require("../src/database");
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

function enemyOptionsPaginationTest() {
  const makeItems = (prefix, count, appearances) => Array.from({ length: count }, (_, index) => ({
    name: `${prefix} ${String(index + 1).padStart(3, "0")}`,
    count: appearances
  }));
  const db = {
    listCatalogEnemies() {
      return {
        threshold: 10,
        popularThreshold: 100,
        total: 125,
        groups: [
          {
            key: "popular",
            label: "100 apariciones o más",
            items: makeItems("Popular", 5, 100).map((item, index) => ({ ...item, count: 100 + index }))
          },
          { key: "frequent", label: "Entre 10 y 99 apariciones", items: makeItems("Frecuente", 60, 10) },
          { key: "other", label: "Menos de 10 apariciones", items: makeItems("Otro", 60, 1) }
        ]
      };
    }
  };
  const service = new ComicTrackerService({ db, config: {} });
  const first = service.listCatalogEnemies({}, { limit: 50, offset: 0 });
  const second = service.listCatalogEnemies({}, { limit: 50, offset: 50 });
  const alphabetical = service.listCatalogEnemies({}, { limit: 50, offset: 0, sort: "name" });
  const searched = service.listCatalogEnemies({}, { limit: 50, search: "Otro 060", selected: "Otro 060" });

  assert.equal(first.groups.flatMap((group) => group.items).length, 50);
  assert.deepEqual(first.groups.map((group) => group.key), ["popular", "frequent"]);
  assert.equal(first.groups[0].items[0].name, "Popular 005");
  assert.equal(alphabetical.groups[0].items[0].name, "Popular 001");
  assert.equal(first.hasMore, true);
  assert.equal(second.offset, 50);
  assert.equal(searched.total, 1);
  assert.equal(searched.selectedExists, true);
  assert.equal(searched.selectedItem.name, "Otro 060");
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

async function weeklyRetryQueueTest() {
  const db = new ComicDatabase(":memory:");
  db.queueWeeklyFetchFailure({
    pageTitle: "Retry Alien Vol 1 1",
    weekYear: 2026,
    weekNumber: 29,
    errorMessage: "Cloudflare 403"
  });
  const calls = [];
  const service = new ComicTrackerService({
    db,
    config: { marvelBaseUrl: "https://marvel.fandom.com" },
    marvelClient: {
      fetchWeekReleases: async () => ({ members: [{ pageTitle: "Current Failure Vol 1 1" }] }),
      fetchComicDetails: async ({ pageTitle }) => {
        calls.push(pageTitle);
        if (pageTitle === "Current Failure Vol 1 1") throw new Error("Cloudflare volvió a bloquear");
        return {
          title: "Retry Alien #1",
          pageTitle,
          fandomUrl: "https://example.test/retry-alien-1",
          releaseDate: "2026-07-15",
          coverImageUrl: "",
          volumePageTitle: "Retry Alien Vol 1",
          volumeName: "Retry Alien (Vol. 1)",
          seriesName: "Retry Alien",
          volumeNumber: 1,
          volumeFandomUrl: "https://example.test/retry-alien",
          issueLabel: "1",
          issueNumber: 1,
          featuredCharacters: [],
          supportingCharacters: [],
          antagonists: [],
          otherCharacters: [],
          appearanceCategories: [],
          synopsis: "",
          sourceHtml: ""
        };
      }
    }
  });

  const originalConsoleError = console.error;
  let summary;
  try {
    console.error = () => {};
    summary = await service.performSync({
      triggerSource: "test",
      weekYear: 2026,
      weekNumber: 30,
      runSideEffects: false
    });
  } finally {
    console.error = originalConsoleError;
  }

  assert.deepEqual(calls, ["Retry Alien Vol 1 1", "Current Failure Vol 1 1"]);
  assert.equal(summary.retried, 1);
  assert.equal(summary.retryRecovered, 1);
  assert.equal(summary.errors, 1);
  assert.match(summary.errorDetails[0].message, /Cloudflare volvió a bloquear/);
  assert.equal(db.getComicByPageTitle("Retry Alien Vol 1 1").weekKey, "2026-W29");
  assert.equal(db.getWeeklyFetchFailure("Retry Alien Vol 1 1").status, "resolved");
  assert.equal(db.getWeeklyFetchFailure("Current Failure Vol 1 1").status, "pending");
  db.close();
}

(async () => {
  await weeklyUpdateRunsBothStepsTest();
  console.log("ok - la actualizacion semanal ejecuta revision e importacion incremental");
  await weeklyUpdateCatchesUpMissingWeeksTest();
  console.log("ok - la actualizacion semanal recupera semanas faltantes incluso entre años");
  enemyOptionsPaginationTest();
  console.log("ok - los enemigos se entregan en paginas de hasta 50 con prioridad por frecuencia");
  await quarterlyRefreshTest();
  console.log("ok - la revision trimestral actualiza todos los metadatos");
  await quarterlyRefreshScheduleValidationTest();
  console.log("ok - la revision trimestral valida la proxima fecha configurable");
  await paniniFailureDoesNotCancelUsaTest();
  console.log("ok - una caida de Panini no cancela la actualizacion USA");
  await weeklyRetryQueueTest();
  console.log("ok - los errores por ficha se conservan y se reintentan aunque avance la semana");
})()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
