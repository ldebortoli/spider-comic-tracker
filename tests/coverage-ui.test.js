const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const vm = require("node:vm");
const { JSDOM } = require("jsdom");

const day = "2026-01-01";
const date = "2026-01-01T12:00:00Z";
const issue = (id = 1, extra = {}) => ({ id, title: `Issue ${id}`, releaseDate: day, fandomUrl: "https://example.test/issue", coverImageUrl: "https://example.test/cover", issueNumber: id, writers: ["Writer"], characters: [{ displayName: "Peter", appearanceType: "minor", appearanceDetail: "flashback" }], owned: true, ownedPublisher: "Publisher", ownedEdition: "Edition", collectionNotes: "Notes", appearanceType: "minor", appearanceDetail: "flashback", volumeName: "Volume", volumePageTitle: "Volume_1", issueLabel: `#${id}`, matchSummary: ["Peter"], ...extra });
const character = (id = 1, extra = {}) => ({ id, slug: "peter-parker-earth-616", displayName: "Peter", reality: "Earth-616", issueCount: 2, aliases: ["Spidey"], active: true, kind: "spider", lastComicDate: day, lastSyncAt: date, ...extra });
const edition = (id = 1, extra = {}) => ({ id, title: "Spanish edition", publisher: "Panini", purchaseStatus: "owned", collectionName: "Collection", volumeLabel: "Vol1", formatLabel: "Hardcover", pages: 200, publicationDate: day, characters: ["Peter"], source: "panini", coverImageUrl: "https://example.test/cover", issueCount: 4, issues: [issue(1, { isPreferredSpanishEdition: true, spanishEditionCount: 2 }), issue(2, { isPreferredSpanishEdition: false, spanishEditionCount: 2 }), issue(3, { spanishEditionCount: 1 })], preferredIssueCount: 2, alternativeIssueCount: 1, containsRaw: "#1-4", notes: "Notes", referenceUrl: "https://example.test/ref", isbn: "123", ...extra });
const dashboard = extra => ({ stats: { includedCount: 1, includedVolumesCount: 1, pendingReviewsCount: 0, trackedCharactersCount: 1 }, schedule: { day: "WEDNESDAY", hour: 12, minute: 0, enabled: true, timezone: "UTC" }, config: { telegramConfigured: false, weeklyUpdateRunning: false, paniniImportRunning: false }, ...extra });
const metrics = extra => ({ process: { cpuPercent: 1, memoryRssBytes: 1024, uptimeSeconds: 60, pid: 12 }, system: { cpuPercent: 2, usedMemoryPercent: 3, platform: "fixture", architecture: "x64", nodeVersion: "fixture", logicalCores: 2, uptimeSeconds: 3600 }, storage: { databaseBytes: 0, backupsBytes: 0, diskUsedPercent: null }, sampledAt: date, ...extra });

async function browser(hash = "", initialHandler) {
  const dom = new JSDOM(fs.readFileSync(require.resolve("../public/index.html"), "utf8"), { runScripts: "outside-only", url: `http://127.0.0.1:8787/${hash}` });
  const w = dom.window;
  const calls = [];
  const timers = new Map();
  let handler = initialHandler;
  let confirmed = true;
  const defaults = target => {
    const pathname = target.split("?")[0];
    if (pathname === "/api/dashboard") return dashboard();
    if (pathname === "/api/tracked-characters" || pathname === "/api/catalog/characters") return [];
    if (pathname.endsWith("/enemies")) return { groups: [], total: 0, selectedExists: false };
    if (pathname === "/api/catalog/stats") return { stats: {}, importStatus: {} };
    if (pathname === "/api/catalog") return { items: [], total: 0, limit: 60, offset: 0 };
    if (pathname === "/api/comics") return [];
    if (pathname === "/api/spanish-editions") return {};
    if (pathname === "/api/catalog/search") return {};
    if (pathname === "/api/system/metrics") return metrics();
    if (pathname === "/api/automation") return { enabled: true, day: "WEDNESDAY", hour: 12, minute: 0, platform: "win32" };
    if (pathname === "/api/catalog/refresh-schedule") return {};
    if (pathname.startsWith("/api/telegram/")) return {};
    return { started: false };
  };
  w.spiderLocalApi = { api: async (target, options) => { calls.push({ target, options }); const result = handler && await handler(target, options); return result === undefined ? defaults(target) : result; }, request: async () => ({ ok: true, blob: async () => new w.Blob(["fixture"]) }) };
  w.scrollTo = () => {};
  w.HTMLElement.prototype.scrollIntoView = () => {};
  w.HTMLAnchorElement.prototype.click = function () { calls.push({ download: this.download }); };
  w.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  w.HTMLDialogElement.prototype.close = function () { this.open = false; this.dispatchEvent(new w.Event("close")); };
  w.confirm = () => confirmed;
  w.URL.createObjectURL = () => "blob:fixture";
  w.URL.revokeObjectURL = url => calls.push({ revoked: url });
  w.setTimeout = (fn, delay) => { if (delay === 2500) { queueMicrotask(fn); return {}; } const id = {}; timers.set(id, fn); return id; };
  w.clearTimeout = id => timers.delete(id);
  w.setInterval = fn => { const id = {}; timers.set(id, fn); return id; };
  w.clearInterval = id => timers.delete(id);
  const context = dom.getInternalVMContext();
  const filename = require.resolve("../public/app");
  vm.runInContext(fs.readFileSync(filename, "utf8"), context, { filename });
  const run = source => vm.runInContext(source, context);
  const flush = async () => { for (let i = 0; i < 25; i++) await Promise.resolve(); };
  const tick = async () => { const queued = [...timers.values()]; timers.clear(); for (const fn of queued) await fn(); await flush(); };
  await flush();
  const state = run("state"); const elements = run("elements");
  const event = (element, type = "click") => element.dispatchEvent(new w.Event(type, { bubbles: true, cancelable: true }));
  const ask = async (name, answer = true, argument = "") => { const pending = run(`${name}(${argument})`); await flush(); if (elements.confirmModal.open) event(answer ? elements.confirmYes : elements.confirmNo); await pending; await flush(); };
  return { dom, w, state, elements, calls, run, flush, tick, event, ask, route: fn => { handler = fn; }, confirm: value => { confirmed = value; } };
}

test("full browser entry point boots real markup and renders dates, dialogs, tabs and grouped approvals safely", async t => {
  const h = await browser(); t.after(() => h.dom.window.close());
  const { state: s, elements: e, run } = h;
  assert.equal(e.syncStatus.textContent, "Vista actualizada");
  assert.equal(run("formatDate('')"), "Sin fecha");
  for (const precision of ["day", "month", "year"]) assert.ok(run(`formatDate('${day}', '${precision}', 'cover')`).includes("portada"));
  assert.equal(run("escapeHtml(null)"), "");
  assert.equal(run(`escapeHtml(${JSON.stringify('&<>"\'')})`), "&amp;&lt;&gt;&quot;&#39;");
  for (const url of ["invalid", "javascript:alert(1)", "http://example.test", "https://example.test"]) assert.equal(typeof run(`escapeUrl(${JSON.stringify(url)})`), "string");
  assert.equal(run("normalizeForSearch()"), "");
  assert.equal(run("normalizeForSearch('PÉTER! Parker')"), "peter parker");
  assert.equal(run("formatDateTime()"), "Nunca");
  assert.equal(run("localDateTimeParts('invalid').date"), "");
  assert.ok(run(`localDateTimeParts('${date}').time`));
  for (const args of ["'', ''", "'2026-01-01', ''", "'invalid', '12:00'", "'2026-01-01', '12:00'"]) run(`isoFromLocalDateTime(${args})`);
  for (const bytes of [0, 1024, 1024 ** 6]) assert.ok(run(`formatBytes(${bytes})`).length);
  run("formatBytes(); formatDuration(); formatDuration(90060)");
  for (const status of ["sent", "unexpected", ""]) assert.ok(run(`formatBackupStatus('${status}')`));
  for (const name of ["usa", "spanish", "tracking", "invalid"]) { run(`activateAppTab('${name}')`); assert.ok(s.activeTab); }
  for (const element of e.appTabs) h.event(element);
  for (const link of e.tabOpenLinks) h.event(link);
  run("closeDialog(null); updateModalScrollLock(); openDialog(elements.modal); updateModalScrollLock()");
  assert.equal(h.w.document.body.classList.contains("modal-open"), true);
  h.event(e.modalTitle); assert.equal(e.modal.open, true);
  h.event(e.modal); assert.equal(e.modal.open, false);
  for (const comic of [issue(), issue(2, { issueNumber: undefined, volumeName: "", volumePageTitle: "", issueLabel: "", matchSummary: undefined, matchedCharacters: ["Other"], fandomUrl: "invalid", coverImageUrl: "invalid" }), issue(3, { issueNumber: null, matchSummary: undefined }), issue(4, { volumeName: "Another", volumePageTitle: "", releaseDate: "2025-01-01" })]) { s.comics.push(comic); run("renderComics()"); }
  assert.equal(e.comicsGrid.querySelectorAll(".comic-card").length, 4);
  for (const card of e.comicsGrid.querySelectorAll(".comic-card")) h.event(card);
  run("openModal({title:'Empty'}); closeDialog(elements.modal)");
  e.comicsGrid.querySelector(".comic-card").dataset.comicId = "missing"; h.event(e.comicsGrid.querySelector(".comic-card"));
  run("sortComicGroup({issueNumber:null,releaseDate:'a',title:'A'}, {issueNumber:undefined,releaseDate:'a',title:'B'})");
  s.dashboard = dashboard({ lastSync: { status: "completed", weekKey: "2026-W1" } }); s.comics = []; run("renderComics(); renderApprovalPagination('missing',0,0)");
  s.dashboard.lastSync.status = "running"; run("renderComics()");
  s.historyOpen = true; s.historyComics = [issue(1, { weekYear: 2025, weekNumber: 1 }), issue(2, { weekYear: 2026, weekNumber: 2 }), issue(3, { weekYear: 2026, weekNumber: 3 }), issue(4, { weekYear: 2026, weekNumber: 3, releaseDate: "" }), issue(5, { weekNumber: 0 }), issue(6, { weekYear: 0 })]; run("renderHistoryComics()");
  assert.equal(e.historyComicsGrid.querySelectorAll(".comic-card").length, 6);
  await h.run("toggleApprovalHistory()"); await h.run("toggleApprovalHistory()");
  s.comics = Array.from({ length: 22 }, (_, i) => issue(i)); s.historyComics = s.comics; run("renderComics();renderHistoryComics()");
  for (const button of e.approvalPageButtons) { button.disabled = false; h.event(button); }
  assert.ok(e.resultsMeta.textContent.includes("22"));
});

test("dashboard, catalog character scopes and import statuses render all operational states", async t => {
  const h = await browser(); t.after(() => h.dom.window.close()); const { state: s, elements: e, run } = h;
  s.dashboard = null; run("renderStats();renderQuarterlyRefreshStatus();renderPending()");
  for (const extra of [
    { backup: { enabled: true, intervalWeeks: 2 }, weeklyUpdate: { running: true, stage: "weekly_review", reviewWeeks: [1], currentReviewWeekKey: "2026-W1" } },
    { backup: { enabled: true, intervalWeeks: 2, lastSentAt: date }, weeklyUpdate: { running: true, stage: "catalog_update" } },
    { backup: { enabled: true, lastAttemptAt: date }, weeklyUpdate: { running: true, stage: "unknown", completedReviewWeeks: 1 }, schedule: { day: "OTHER", hour: 1, minute: 2, windowsTaskInstalled: true } },
    { lastSync: { weekKey: "2026-W1" }, weeklyUpdate: { status: "failed", finishedAt: date, errorMessage: "fixture" }, config: { telegramConfigured: true } },
    { weeklyUpdate: { status: "failed" }, schedule: { day: "MONDAY", enabled: false, hour: 0, minute: 0 } },
    { weeklyUpdate: { finishedAt: date } }
  ]) { s.dashboard = dashboard(extra); run("renderStats()"); assert.ok(e.statsGrid.textContent.includes("Cómics guardados")); }
  for (const status of [{ running: true }, { status: "failed" }, { status: "failed", errorMessage: "fixture" }, { lastRefreshAt: date, nextRefreshAt: date, minimumNextRefreshAt: date }]) { s.dashboard.quarterlyRefresh = status; run("renderQuarterlyRefreshStatus()"); }
  for (const status of [{}, { stage: "completed", incremental: true }, { stage: "completed", incremental: true, characterResults: [{ addedCount: 1 }], characterSlug: "peter" }, { stage: "completed", characterSlug: "peter" }, { stage: "completed_with_errors", errors: [1] }, { stage: "failed", errorMessage: "fixture" }, { discovered: 2, completedCharacters: 1, totalCharacters: 2, completedBatches: 1, totalBatches: 2, importedComics: 3 }]) { h.w.fixtureStatus = status; run("catalogImportLabel(fixtureStatus)"); }
  for (const group of ["main", "all", "ultimate", "featured", "other"]) {
    s.catalog.filters.universeGroup = group;
    s.catalog.characters = [character(), character(2, { slug: "miles-morales-earth-1610", reality: "Earth-1610" }), character(3, { slug: "unknown", displayName: "Same", reality: "Earth-65", kind: "symbiote" }), character(4, { slug: "unknown2", displayName: "Same", reality: "Earth-928" }), character(5, { reality: "Earth-6160" }), character(6, { reality: "Earth-42" }), character(7, { issueCount: 0 })];
    run("visibleCatalogCharacters();ensureCatalogCharacterForUniverseGroup();renderCatalogCharacters();renderCatalogStats()");
  }
  s.catalog.filters.character = ""; run("ensureCatalogCharacterForUniverseGroup();renderCatalogStats()");
  s.catalog.filters.universeGroup = "all"; s.catalog.filters.character = "peter-parker-earth-616";
  for (const status of [null, { running: true }]) { s.catalog.stats = null; s.catalog.importStatus = status; run("renderCatalogStats()"); }
  s.catalog.characters[0].lastComicDate = ""; s.catalog.characters[0].lastSyncAt = ""; run("renderCatalogStats()");
  for (const value of ["flashback", "unknown", ""]) run(`appearanceDetailLabel('${value}')`);
  s.dashboard = dashboard({ pendingReviews: [issue(1, { originalityReason: "reason" }), issue(2, { coverImageUrl: "", volumeName: "", issueLabel: "", matchSummary: undefined })] }); run("renderPending()");
  for (const action of ["approve", "reject"]) { s.dashboard.pendingReviews = [issue()]; run("renderPending()"); h.event(e.pendingList.querySelector(`[data-review-action='${action}']`)); await h.flush(); }
  s.dashboard.pendingReviews = [issue()]; run("renderPending()"); h.route(target => { if (target.includes("/decision")) throw Error("decision failed"); }); h.event(e.pendingList.querySelector("button")); await h.flush(); assert.equal(e.syncStatus.textContent, "decision failed");
});

test("catalog collection and Spanish edition forms preserve edits, filtering, relationships and pagination", async t => {
  const h = await browser(); t.after(() => h.dom.window.close()); const { state: s, elements: e, run } = h;
  s.catalog.items = [issue(), issue(2, { owned: false, writers: [], characters: undefined, coverImageUrl: "", ownedPublisher: "", ownedEdition: "", collectionNotes: "", appearanceType: "major" }), issue(3, { writers: undefined, characters: [{ displayName: "Other", appearanceType: "major" }], appearanceDetail: "" })];
  s.catalog.total = 200; s.catalog.offset = 60; s.catalog.filters.query = "test"; s.catalog.filters.enemy = "enemy"; run("renderCatalog()");
  assert.equal(e.catalogList.querySelectorAll(".catalog-row").length, 3);
  for (const issueData of [issue(), issue(2, { writers: undefined, ownedPublisher: "", ownedEdition: "", collectionNotes: "" })]) { h.w.fixtureIssue = issueData; run("openCollectionModal(fixtureIssue);closeDialog(elements.collectionModal)"); }
  h.event(e.catalogList.querySelector('[data-action="edit"]')); assert.equal(e.collectionModal.open, true);
  e.catalogList.querySelector(".catalog-row").dataset.catalogId = "missing"; h.event(e.catalogList.querySelector("button"));
  h.route((target, options) => { if (target.endsWith("/collection")) return issue(1, JSON.parse(options.body)); });
  h.w.fixtureIssue = issue(); await run("saveCollectionIssue(fixtureIssue)");
  h.route(target => { if (target.endsWith("/collection")) return issue(999); }); await run("saveCollectionIssue(fixtureIssue, {owned:false,publisher:'New',editionTitle:'New',notes:'New'})");
  s.catalog.items = [issue()]; run("renderCatalog()"); h.event(e.catalogList.querySelector('[data-action="toggle"]')); await h.flush();
  s.catalog.filters.query = "query"; s.catalog.filters.enemy = ""; run("renderCatalog()"); s.catalog.filters.query = ""; s.catalog.filters.enemy = "enemy"; run("renderCatalog()"); h.event(e.catalogFilterNotice.querySelector("button")); await h.flush();
  run("closeDialog(elements.collectionModal)");
  s.spanishEditions.items = [edition(), edition(2, { purchaseStatus: "wanted", source: "universo_marvel", coverImageUrl: "", publicationDate: "", pages: 0, publisher: "", collectionName: "", volumeLabel: "", formatLabel: "", preferredIssueCount: 0, alternativeIssueCount: 0, containsRaw: "", notes: "", referenceUrl: "", issues: [], issueCount: 0 }), edition(3, { source: "manual" })];
  s.spanishEditions.total = 100; s.spanishEditions.offset = 20; s.spanishEditions.filterOptions = { publishers: ["Panini"], characters: ["Peter"] }; s.spanishEditions.stats = { totalCount: 3, wantedCount: 1, ownedCount: 2, linkedIssueCount: 5, publisherCount: 1, paniniPendingContains: 1, paniniPendingMatch: 1, paniniLastCheckedAt: date };
  run("renderSpanishEditions()"); assert.equal(e.spanishEditionsList.querySelectorAll("article").length, 3);
  h.event(e.spanishEditionsList.querySelector('[data-spanish-action="edit"]')); assert.equal(s.spanishEditions.editingId, 1);
  h.event(e.spanishSelectedIssues.querySelector("button")); assert.equal(s.spanishEditions.selectedIssues.length, 2);
  h.confirm(false); h.event(e.spanishEditionsList.querySelector('[data-spanish-action="delete"]')); await h.flush();
  h.confirm(true); h.event(e.spanishEditionsList.querySelector('[data-spanish-action="delete"]')); await h.flush();
  for (const status of [{ running: true, processedProducts: 1 }, { running: true, processed: 2 }, { running: true }, { stage: "failed" }, { stage: "failed", errorMessage: "fixture" }, { stage: "completed_with_warnings", officialError: "offline" }, { stage: "completed_with_warnings", universoMarvel: { processed: 2, queue: { pending: 1 } } }]) { s.dashboard.paniniImport = status; run("renderSpanishEditions()"); }
  s.spanishEditions.stats = { totalCount: 0 }; run("renderSpanishEditions()"); s.spanishEditions.stats = { totalCount: 2 }; s.spanishEditions.filters.query = "x"; run("renderSpanishEditions()"); s.spanishEditions.filters.query = ""; run("renderSpanishEditions()");
  run("openSpanishEditionModal()");
  for (const query of ["", "x", "xx"]) { e.spanishIssueSearch.value = query; await run("searchSpanishIssues()"); }
  h.route(target => target.startsWith("/api/catalog/search") ? { items: [issue(1), issue(2)] } : undefined);
  await run("searchSpanishIssues()"); h.event(e.spanishIssueSearchResults.querySelector("button")); assert.equal(s.spanishEditions.selectedIssues.length, 1);
  await run("searchSpanishIssues()"); e.spanishIssueSearchResults.querySelector("button").dataset.searchIssueId = "999"; h.event(e.spanishIssueSearchResults.querySelector("button"));
  for (const id of [null, 1]) { s.spanishEditions.editingId = id; e.spanishTitle.value = "Fixture"; e.spanishCharacters.value = "Peter, Miles"; s.spanishEditions.selectedIssues = [issue()]; await run("saveSpanishEdition({preventDefault(){}})"); }
  assert.ok(h.calls.some(call => call.options?.method === "POST")); assert.ok(h.calls.some(call => call.options?.method === "PUT"));
  for (const button of e.spanishPageButtons) { button.disabled = false; h.event(button); await h.flush(); }
  for (const select of e.spanishPageSizes) { select.value = ""; h.event(select, "change"); await h.flush(); select.value = "60"; h.event(select, "change"); await h.flush(); }
  for (const input of [e.spanishQuery, e.spanishStatusFilter, e.spanishPublisherFilter, e.spanishCharacterFilter]) h.event(input, "input"); await h.tick();
  h.event(e.spanishAddButton); h.event(e.spanishEditionClose); h.event(e.spanishAddButton); h.event(e.spanishEditionCancel);
  h.event(e.spanishIssueSearch, "input"); await h.tick();
});

test("settings render metrics and Telegram states, save configuration and display recoverable errors", async t => {
  const h = await browser(); t.after(() => h.dom.window.close()); const { state: s, elements: e, run } = h;
  for (const telegram of [undefined, { configured: true, running: true, reviewsEnabled: true, summariesEnabled: true, backupsEnabled: true, lastPollAt: date, lastError: "fixture" }, { configured: true, pollingEnabled: false }, { configured: true, runtime: "python" }, { configured: true, running: true, runtime: "python" }]) { h.w.fixtureMetrics = metrics({ telegram, operations: { syncRunning: true, catalogImportRunning: true, paniniImportRunning: true, weeklyUpdateRunning: true, quarterlyRefreshRunning: true }, storage: { diskUsedPercent: 12 } }); run("renderSystemMetrics(fixtureMetrics)"); }
  await run("openSystemModal()"); await h.tick(); run("closeSystemModal()");
  for (const config of [{}, { botTokenConfigured: true }, { botTokenConfigured: true, status: { pollingEnabled: false } }, { botTokenConfigured: true, status: { running: true, runtime: "python", reviewsEnabled: true, summariesEnabled: true, backupsEnabled: true, lastError: "fixture" } }, { botTokenConfigured: true, status: { running: true } }, { botTokenConfigured: true, status: { runtime: "python" } }]) { h.w.fixtureConfig = config; run("renderTelegramConfigStatus(fixtureConfig)"); }
  for (const automation of [{ enabled: true, externalTaskInstalled: true, hour: 1, minute: 2 }, { enabled: false, platform: "linux", hour: 0, minute: 0 }, { enabled: true, platform: "win32", hour: 0, minute: 0 }]) {
    h.route(target => target === "/api/automation" ? automation : undefined);
    await run("loadAutomationSettings()");
    assert.equal(e.automationEnabled.checked, automation.enabled);
    await run("saveAutomationSettings()");
    assert.match(e.automationStatus.textContent, automation.enabled ? /Horario guardado/ : /desactivada/);
  }
  h.route(target => target === "/api/telegram/config" ? { reviewChatId: "r", summaryChatId: "s", backupChatId: "b", allowedUserId: "u", botTokenConfigured: true } : undefined);
  await run("loadTelegramConfig()"); await run("saveTelegramConfig({preventDefault(){}})");
  e.telegramBotToken.value = "fixture-only-token"; run("openDialog(elements.systemModal)"); await run("saveTelegramConfig({preventDefault(){}})");
  s.telegramConfig = null; await run("toggleTelegramPolling()"); s.telegramConfig = { status: { pollingEnabled: false } }; await run("toggleTelegramPolling()");
  for (const result of [{ username: "tester", sentMessage: true }, { firstName: "Fixture", sentMessage: false }, {}]) { h.route(target => target === "/api/telegram/test" ? result : undefined); await run("testTelegramBot()"); }
  await run("saveQuarterlyRefreshSettings()"); await run("loadQuarterlyRefreshSettings()"); s.dashboard = null; await run("loadQuarterlyRefreshSettings()");
  await h.ask("deleteTelegramToken", false); await h.ask("deleteTelegramToken");
  run("closeSystemModal()"); await h.ask("deleteTelegramToken");
  for (const name of ["refreshSystemMetrics", "saveAutomationSettings", "saveQuarterlyRefreshSettings", "saveTelegramConfig", "testTelegramBot", "toggleTelegramPolling"]) { h.route(() => { throw Error("fixture failure"); }); await run(`${name}(${name === "saveTelegramConfig" ? "{preventDefault(){}}" : ""})`); }
  await h.ask("deleteTelegramToken"); assert.match(e.telegramConfigStatus.textContent, /failure/);
  h.route(undefined); await run("openSettingsModal()"); run("closeSettingsModal()");
  for (const name of ["triggerQuarterlyRefresh", "confirmCsvExport", "confirmRefreshView"]) { await h.ask(name, false, name === "confirmCsvExport" ? "{preventDefault(){}}" : ""); await h.ask(name, true, name === "confirmCsvExport" ? "{preventDefault(){}}" : ""); }
  await h.tick(); assert.ok(h.calls.some(call => call.download));
  h.route(target => target === "/api/catalog/refresh-all" ? { started: true } : undefined); await h.ask("triggerQuarterlyRefresh");
  h.route(() => { throw Error("refresh failed"); }); await h.ask("triggerQuarterlyRefresh");
  h.w.spiderLocalApi.request = async () => ({ ok: false }); await run("exportCatalogCsv()"); assert.match(e.syncStatus.textContent, /exportar/);
  for (const kind of ["no", "cancel", "close"]) { const p = run("askConfirmation({title:'Fixture',message:'Fixture'})"); if (kind === "no") h.event(e.confirmClose); else if (kind === "cancel") h.event(e.confirmModal, "cancel"); else e.confirmModal.close(); assert.equal(await p, false); }
});

test("refresh/import controls poll completion, report timeouts and never drop button recovery", async t => {
  const h = await browser(); t.after(() => h.dom.window.close()); const { state: s, elements: e, run } = h;
  for (const name of ["triggerCatalogImport", "triggerSync", "triggerPaniniImport"]) await h.ask(name, false);
  await run("triggerCatalogContinue()");
  s.catalog.characters = [character()]; s.catalog.filters.character = "peter-parker-earth-616";
  await h.ask("triggerCatalogContinue", false);
  for (const name of ["triggerCatalogImport", "triggerCatalogContinue", "triggerSync", "triggerPaniniImport"]) await h.ask(name);
  for (const result of [{ started: true, weeksPlanned: 3, fromWeekKey: "2026-W1", weekKey: "2026-W3" }, { started: true, weeksPlanned: 1, weekKey: "2026-W1" }]) { h.route(target => target === "/api/sync" ? result : undefined); await h.ask("triggerSync"); }
  h.route(target => target === "/api/panini/import" ? { started: true } : undefined); await h.ask("triggerPaniniImport");
  for (const name of ["triggerCatalogImport", "triggerCatalogContinue", "triggerSync", "triggerPaniniImport"]) { s.catalog.characters = [character(1, { lastComicDate: "" })]; s.catalog.filters.character = "peter-parker-earth-616"; h.route((target, options) => { if (options?.method === "POST") throw Error("import failure"); }); await h.ask(name); }
  h.route(target => target === "/api/dashboard" ? dashboard({ config: { weeklyUpdateRunning: true, paniniImportRunning: true } }) : target === "/api/panini/import" ? { started: true } : target.startsWith("/api/catalog/stats") ? { stats: {}, importStatus: { running: true } } : undefined);
  await run("pollUntilFinished()"); assert.match(e.syncStatus.textContent, /sigue corriendo/);
  await h.ask("triggerPaniniImport"); assert.match(e.syncStatus.textContent, /segundo plano/);
  await run("pollCatalogImport()"); assert.match(e.syncStatus.textContent, /sigue corriendo/);
});

test("live filter, character and pagination event handlers use the selected scope and editable values", async t => {
  const h = await browser("#seguimiento"); t.after(() => h.dom.window.close()); const { state: s, elements: e, run } = h;
  s.historyOpen = true; s.filters.query = "fixture"; s.filters.character = "Peter"; await run("loadComics()"); await run("loadComicEnemies()");
  e.characterInput.value = "Miles"; h.event(e.characterInput, "input"); await h.tick(); h.event(e.queryInput, "change"); await h.tick();
  for (const value of ["all", ""]) { e.catalogUniverseGroup.value = value; h.event(e.catalogUniverseGroup, "change"); await h.flush(); }
  for (const value of ["", "60"]) { for (const select of e.catalogPageSizes) { select.value = value; h.event(select, "change"); await h.flush(); } }
  e.catalogQuery.value = "test"; h.event(e.catalogQuery, "input"); await h.tick(); h.event(e.catalogQuery, "input"); await h.tick();
  for (const button of e.catalogPageButtons) { button.disabled = false; h.event(button); await h.flush(); }
  h.w.__trackedCharacters = [character(), character(2, { active: false, reality: "", issueCount: 0 })]; run("renderCharacters()"); h.event(e.charactersList.querySelector("button")); assert.equal(s.editingCharacterId, 1);
  e.characterAliases.value = "Peter, Miles"; h.event(e.characterForm, "submit"); await h.flush(); h.event(e.characterForm, "submit"); await h.flush();
  h.w.__trackedCharacters = Array.from({ length: 25 }, (_, i) => character(i)); run("renderCharacters()");
  for (const button of e.characterPageButtons) { button.disabled = false; h.event(button); }
  e.suggestionCharacterQuery.value = "Peter"; h.event(e.suggestionCharacterQuery, "input"); for (const button of e.characterPageButtons) { button.disabled = false; h.event(button); }
  e.suggestionCharacterQuery.value = "missing"; h.event(e.suggestionCharacterQuery, "input");
  h.w.__trackedCharacters = undefined; run("renderCharacters()"); for (const button of e.characterPageButtons) { button.disabled = false; h.event(button); }
  h.event(e.characterReset); h.event(e.collectionForm, "submit"); await h.flush();
  s.catalog.items = [issue()]; s.editingCatalogIssueId = 1; h.route(target => target.endsWith("/collection") ? issue() : undefined); h.event(e.collectionForm, "submit"); await h.flush();
  for (const element of [e.modalClose, e.collectionClose, e.collectionCancel, e.systemClose, e.settingsClose]) h.event(element);
});

test("enemy picker loads grouped pages, selection, search, scrolling, errors and stale requests", async t => {
  const h = await browser(); t.after(() => h.dom.window.close());
  const root = h.elements.catalogEnemyPicker.cloneNode(true);
  const input = h.w.document.createElement("input");
  h.w.document.body.append(root, input);
  let payload = { groups: [{ key: "a", label: "A", items: [{ name: "Goblin", count: 2 }, { name: "Venom" }] }], total: 3, hasMore: true, selectedExists: true, selectedItem: { name: "Goblin" } };
  let fetchPage = async () => payload;
  h.w.pickerArgs = { root, input, allLabel: "All", fetchPage: params => fetchPage(params) };
  const picker = h.run("createLazyEnemyPicker(pickerArgs)");
  await picker.reset({ character: "Peter" }, "Goblin");
  const options = root.querySelector(".lazy-enemy-options");
  const status = root.querySelector(".lazy-enemy-status");
  const trigger = root.querySelector(".lazy-enemy-trigger");
  const search = root.querySelector(".lazy-enemy-search");
  assert.match(status.textContent, /Mostrando 2 de 3/);
  picker.setValue("Venom"); assert.equal(input.value, "Venom");
  h.event(trigger); assert.equal(trigger.getAttribute("aria-expanded"), "true");
  h.event(trigger); assert.equal(trigger.getAttribute("aria-expanded"), "false");
  h.event(root.querySelector("[data-value='Goblin']")); assert.equal(input.value, "Goblin");
  h.event(root.querySelector("[data-value='']")); assert.equal(input.value, "");
  payload = { groups: [{ key: "a", items: [{ name: "Kraven", count: 1 }] }, { key: "empty" }], offset: 2, total: 3, selectedExists: true };
  h.event(options, "scroll"); await h.flush();
  assert.equal(root.querySelectorAll(".lazy-enemy-group").length, 2);
  assert.match(status.textContent, /3 enemigos/);
  h.event(options, "scroll"); await h.flush();
  payload = { groups: [{ key: "one", items: [{ name: "One" }] }], total: 1, selectedExists: true };
  await picker.reset({}, "One"); assert.match(status.textContent, /1 enemigo\./);
  payload = {}; await picker.reset(); assert.match(status.textContent, /No hay enemigos/);
  h.event(search, "input"); await h.tick();
  search.value = "missing"; h.event(search, "input"); await h.tick(); assert.match(status.textContent, /No hay coincidencias/);
  h.event(root.querySelector(".lazy-enemy-sort"), "change"); await h.tick();
  h.event(root, "keydown"); root.dispatchEvent(new h.w.KeyboardEvent("keydown", { key: "Escape" })); picker.close();
  Object.defineProperties(options, { scrollHeight: { configurable: true, value: 1000 }, clientHeight: { configurable: true, value: 100 } }); h.event(options, "scroll");
  fetchPage = async () => { throw Error("picker failed"); };
  await assert.rejects(picker.reset(), /picker failed/);
  h.event(search, "input"); await h.tick(); assert.equal(status.textContent, "picker failed");
  payload = { groups: [], total: 2, hasMore: true };
  fetchPage = async () => payload;
  await picker.reset();
  Object.defineProperty(options, "scrollHeight", { configurable: true, value: 0 });
  fetchPage = async () => { throw Error("scroll failed"); };
  h.event(options, "scroll"); await h.flush(); assert.equal(status.textContent, "scroll failed");
  const pending = [];
  fetchPage = () => new Promise((resolve, reject) => pending.push({ resolve, reject }));
  const first = picker.reset({}, "old"); h.event(options, "scroll");
  const second = picker.reset({}, "new");
  pending[1].resolve({ groups: [], total: 0, selectedExists: true }); await second;
  pending[0].resolve({ groups: [{ key: "stale", items: [{ name: "Stale" }] }], total: 1 });
  assert.equal((await first).payload, null);
  assert.equal(root.querySelector("[data-value='Stale']"), null);
  const third = picker.reset(); const thirdFailure = assert.rejects(third, /stale failure/);
  const fourth = picker.reset(); pending[3].resolve({}); await fourth; pending[2].reject(Error("stale failure")); await thirdFailure;
});

test("browser recovery and boundary states exercise settings fallbacks and persistent filter data", async t => {
  const h = await browser("#spanish-editions"); t.after(() => h.dom.window.close()); const { state: s, elements: e, run } = h;
  assert.equal(s.activeTab, "spanish");
  s.dashboard = dashboard({ weeklyUpdate: { running: true, stage: "weekly_review", reviewWeeks: [1, 2], completedReviewWeeks: 1 } }); run("renderStats()");
  s.dashboard.stats.includedVolumesCount = 0; run("renderStats()");
  s.catalog.characters = [character()]; s.catalog.filters.universeGroup = "main"; s.catalog.filters.character = "peter-parker-earth-616"; run("ensureCatalogCharacterForUniverseGroup();renderCatalogCharacters()"); assert.equal(e.catalogCharacter.value, "peter-parker-earth-616");
  h.route(target => target === "/api/catalog/characters" ? [character()] : undefined); await h.ask("triggerCatalogContinue");
  run("sortComicGroup({issueNumber:null,releaseDate:'2025-01-01'}, {issueNumber:undefined,releaseDate:'2026-01-01'})");
  s.historyOpen = true; s.historyComics = [issue(1, { weekYear: 0, weekNumber: 0, releaseDate: "" }), issue(2, { weekYear: undefined, weekNumber: undefined, releaseDate: "" }), issue(3, { weekYear: undefined, weekNumber: 1 })]; run("renderHistoryComics()");
  s.historyComics = [issue(1, { weekYear: 2026, weekNumber: 1 }), issue(2, { weekYear: 2026, weekNumber: 0 })]; run("renderHistoryComics()");
  s.historyComics = [issue(1, { weekYear: 2026, weekNumber: 1, releaseDate: "" }), issue(2, { weekYear: 2026, weekNumber: 1 })]; run("renderHistoryComics()");
  s.dashboard = null; await run("loadQuarterlyRefreshSettings()"); assert.ok(s.dashboard.quarterlyRefresh);
  h.route(target => target.startsWith("/api/catalog/stats") ? { stats: {} } : undefined); await run("loadCatalogStats()");
  s.catalog.characters = [character()]; s.catalog.filters.character = ""; e.catalogCharacter.innerHTML = '<option value="peter-parker-earth-616">Peter</option>'; e.catalogCharacter.value = "peter-parker-earth-616"; h.event(e.catalogCharacter, "change"); await h.tick();
  s.spanishEditions.items = [edition(1, { issueCount: 3 })]; run("renderSpanishEditions()");
  e.spanishEditionsList.querySelector("article").dataset.spanishEditionId = "missing"; h.event(e.spanishEditionsList.querySelector("button"));
  h.w.fixtureComic = issue(1, { releaseDate: "" }); run("openModal(fixtureComic);closeDialog(elements.modal)");
  h.route(target => target.startsWith("/api/telegram/config") ? {} : undefined); s.telegramConfig = undefined; await run("testTelegramBot()");
  const loadRaces = async name => {
    const pending = [];
    h.route(target => target.includes("/enemies?") ? new Promise(resolve => pending.push(resolve)) : undefined);
    const first = run(`${name}()`); const second = run(`${name}()`); await h.flush();
    pending[1]({}); await second; pending[0]({}); await first;
  };
  await loadRaces("loadCatalogEnemies"); await loadRaces("loadComicEnemies");
  const failed = await browser("", () => { throw Error("initial data failed"); }); t.after(() => failed.dom.window.close()); assert.equal(failed.elements.syncStatus.textContent, "initial data failed");
});
