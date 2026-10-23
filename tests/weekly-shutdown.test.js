const assert = require("node:assert/strict");
const { test } = require("node:test");
const { WeeklyShutdown } = require("../src/weekly-shutdown");

function fixture() {
  const state = new Map();
  const completed = {
    status: "completed", startedAt: "2026-10-23T14:00:00.000Z", weekKey: "2026-W43",
    triggerSource: "scheduled", weeklyReview: { errors: 0 },
    catalogUpdate: { errors: 0 }, paniniUpdate: { errors: 0, status: "completed" }
  };
  let now = Date.parse("2026-10-23T15:30:00.000Z");
  const service = {
    db: { getState: (key, fallback) => state.get(key) ?? fallback, setState: (key, value) => state.set(key, value) },
    telegram: {
      canSendSummary: () => true,
      sendSummary: async () => ({ ok: true, result: { message_id: 42, chat: { id: -123 } } })
    },
    getWeeklyUpdateStatus: () => completed
  };
  const watcher = new WeeklyShutdown({ service, now: () => now });
  let stops = 0;
  watcher.shutdown = async () => { stops++; return true; };
  return { watcher, service, state, completed, stops: () => stops, advance: (ms) => { now += ms; } };
}

test("confirmed delivery arms tomorrow, waits while busy and is consumed only once", async () => {
  const f = fixture();
  await f.watcher.confirm(f.completed);
  const receipt = JSON.parse(f.state.get("weekly_shutdown_receipt"));
  assert.equal(receipt.dueAt, "2026-10-24T15:30:00.000Z");
  assert.equal(receipt.messageId, "42");
  assert.equal(receipt.chatId, "-123");
  assert.equal(await f.watcher.check(), false);
  f.advance(24 * 60 * 60 * 1000);
  for (const job of ["currentSyncPromise", "currentWeeklyUpdatePromise", "currentCatalogImportPromise", "currentPaniniImportPromise", "currentQuarterlyRefreshPromise"]) {
    f.service[job] = Promise.resolve();
    assert.equal(await f.watcher.check(), false);
    f.service[job] = null;
  }
  assert.equal(await f.watcher.check(), true);
  assert.equal(await f.watcher.check(), false);
  assert.equal(f.stops(), 1);
});

test("no receipt, bad receipt, a newer run or a failed run cannot stop the server", async () => {
  const f = fixture();
  for (const value of [undefined, "{", "null", "{}", '{"status":"pending","dueAt":"invalid"}']) {
    f.state.set("weekly_shutdown_receipt", value);
    assert.equal(await f.watcher.check(), false);
  }
  await f.watcher.confirm(f.completed);
  f.advance(86400000);
  f.completed.status = "failed";
  assert.equal(await f.watcher.check(), false);
  f.completed.status = "completed";
  f.completed.startedAt = "2026-10-24T14:00:00.000Z";
  assert.equal(await f.watcher.check(), false);
  f.completed.startedAt = "2026-10-23T14:00:00.000Z";
  f.completed.weekKey = "2026-W44";
  assert.equal(await f.watcher.check(), false);
  f.completed.weekKey = "2026-W43";
  const good = JSON.parse(f.state.get("weekly_shutdown_receipt"));
  for (const invalid of [{ messageId: "" }, { chatId: "" }, { confirmedAt: "invalid" }, { dueAt: "2026-10-24T15:00:00Z" }]) {
    f.state.set("weekly_shutdown_receipt", JSON.stringify({ ...good, ...invalid }));
    assert.equal(await f.watcher.check(), false);
  }
  assert.equal(f.stops(), 0);
});

test("unconfigured, partial or unconfirmed deliveries never arm shutdown", async () => {
  for (const mutate of [
    f => { f.service.telegram = null; },
    f => { f.service.telegram.canSendSummary = () => false; },
    f => { f.service.telegram.sendSummary = async () => undefined; },
    f => { f.service.telegram.sendSummary = async () => ({ ok: false }); },
    f => { f.service.telegram.sendSummary = async () => ({ ok: true, result: {} }); },
    f => { f.service.telegram.sendSummary = async () => ({ ok: true, result: { message_id: 1 } }); },
    f => { f.completed.status = "failed"; },
    f => { f.completed.weeklyReview.errors = 1; },
    f => { f.completed.weeklyReview.backupFailed = true; },
    f => { f.completed.catalogUpdate.errors = 1; },
    f => { f.completed.paniniUpdate.errors = 1; },
    f => { f.completed.paniniUpdate.status = "failed"; },
    f => { f.completed.paniniUpdate.status = "completed_with_warnings"; }
  ]) {
    const f = fixture();
    mutate(f);
    await f.watcher.confirm(f.completed);
    assert.equal(f.state.has("weekly_shutdown_receipt"), false);
    assert.equal(f.stops(), 0);
  }
  const f = fixture();
  f.service.telegram.sendSummary = async () => { throw new Error("send failed"); };
  await assert.rejects(f.watcher.confirm(f.completed), /send failed/);
  assert.equal(f.state.has("weekly_shutdown_receipt"), false);
});

test("restart retains the deadline; unsuccessful shutdown leaves a retryable receipt", async () => {
  const f = fixture();
  await f.watcher.confirm(f.completed);
  f.advance(86400000);
  const resumed = new WeeklyShutdown({ service: f.service, now: () => Date.parse("2026-10-25T12:00:00Z") });
  assert.equal(await resumed.check(), false);
  resumed.shutdown = async () => false;
  assert.equal(await resumed.check(), false);
  assert.equal(JSON.parse(f.state.get("weekly_shutdown_receipt")).status, "pending");
  resumed.shutdown = async () => { throw new Error("stop failed"); };
  await assert.rejects(resumed.check(), /stop failed/);
  assert.equal(JSON.parse(f.state.get("weekly_shutdown_receipt")).status, "pending");
  resumed.shutdown = f.watcher.shutdown;
  assert.equal(await resumed.check(), true);
  assert.equal(f.stops(), 1);
});

test("the weekly pipeline sends one final summary and the recurring check closes HTTP and bot", async () => {
  const { ComicDatabase } = require("../src/database");
  const { ComicTrackerService } = require("../src/service");
  const { createTrackerServer } = require("../src/server");
  const db = new ComicDatabase(":memory:");
  const config = { backup: { enabled: false }, schedule: { enabled: false }, catalogRefresh: { enabled: false } };
  const service = new ComicTrackerService({ db, config, marvelClient: {
    fetchWeekReleases: async () => ({ members: [] })
  } });
  const steps = [];
  const telegram = {
    canSendSummary: () => true,
    sendSummary: async summary => {
      assert.deepEqual(steps, ["catalog", "spanish"]);
      assert.equal(summary.weeksReviewed, 2);
      assert.equal(summary.failed, false);
      assert.equal(db.getState("weekly_shutdown_receipt", ""), "");
      steps.push("delivered");
      return { ok: true, result: { message_id: 21, chat: { id: -321 } } };
    },
    stop: async () => { steps.push("bot-stopped"); }
  };
  service.attachTelegram(telegram);
  service.performCatalogImport = async () => { steps.push("catalog"); return { errors: [] }; };
  service.performPaniniImport = async () => { steps.push("spanish"); return { status: "completed", errors: [] }; };
  const server = createTrackerServer({ config, db, service, telegram });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  try {
    await service.performWeeklyUpdate({ triggerSource: "test", weekYear: 2026, weekNumber: 43,
      reviewWeeks: [{ weekYear: 2026, weekNumber: 42, weekKey: "2026-W42" }, { weekYear: 2026, weekNumber: 43, weekKey: "2026-W43" }] });
    const receipt = JSON.parse(db.getState("weekly_shutdown_receipt", ""));
    assert.equal(receipt.status, "pending");
    assert.equal(receipt.messageId, "21");
    assert.equal(server.listening, true);
    service.weeklyShutdown.now = () => Date.parse(receipt.dueAt);
    service.weeklyShutdown.shutdown = async () => { await server.shutdown(); return true; };
    await service.runScheduledTasks();
    assert.equal(server.listening, false);
    assert.deepEqual(steps, ["catalog", "spanish", "delivered", "bot-stopped"]);
  } finally {
    if (server.listening) await server.shutdown();
  }
});

test("an unsuccessful final send leaves the weekly run failed and cannot arm shutdown", async () => {
  const { ComicTrackerService } = require("../src/service");
  const f = fixture();
  const service = new ComicTrackerService({ db: f.service.db, config: {} });
  service.performSync = async () => ({ errors: 0 });
  service.performCatalogImport = async () => ({ errors: [] });
  service.performPaniniImport = async () => ({ status: "completed", errors: [] });
  service.attachTelegram({ canSendSummary: () => true, sendSummary: async () => { throw new Error("delivery rejected"); } });
  await assert.rejects(service.performWeeklyUpdate({ triggerSource: "test", weekYear: 2026, weekNumber: 43 }), /delivery rejected/);
  assert.equal(service.getWeeklyUpdateStatus().status, "failed");
  assert.equal(f.state.has("weekly_shutdown_receipt"), false);
});

test("a failed backup prevents arming even when the remaining weekly work completes", async (t) => {
  const { ComicDatabase } = require("../src/database");
  const { ComicTrackerService } = require("../src/service");
  const db = new ComicDatabase(":memory:");
  t.after(() => db.close());
  t.mock.method(console, "error", () => {});
  const service = new ComicTrackerService({ db, config: {}, marvelClient: { fetchWeekReleases: async () => ({ members: [] }) } });
  service.maybeSendPeriodicBackup = async () => { throw new Error("backup rejected"); };
  service.performCatalogImport = async () => ({ errors: [] });
  service.performPaniniImport = async () => ({ status: "completed", errors: [] });
  service.attachTelegram({ canSendSummary: () => true, sendSummary: async summary => {
    assert.equal(summary.failed, true);
    return { ok: true, result: { message_id: 5, chat: { id: -5 } } };
  } });
  const result = await service.performWeeklyUpdate({ triggerSource: "test", weekYear: 2026, weekNumber: 43 });
  assert.equal(result.weeklyReview.backupFailed, true);
  assert.equal(db.getState("weekly_shutdown_receipt", ""), "");
});

test("scheduler checks shutdown even with the weekly schedule disabled and recovers from errors", async (t) => {
  const { ComicTrackerService } = require("../src/service");
  const f = fixture();
  const service = new ComicTrackerService({ db: f.service.db, config: { schedule: { enabled: false }, catalogRefresh: { enabled: false, intervalMonths: 3 } } });
  const errors = t.mock.method(console, "error", () => {});
  service.weeklyShutdown.check = async () => { throw new Error("temporary failure"); };
  await service.runScheduledTasks();
  assert.equal(errors.mock.callCount(), 1);
  service.weeklyShutdown.check = async () => false;
  await service.runScheduledTasks();
  assert.equal(errors.mock.callCount(), 1);
});

test("the delivered version matches release documentation", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const { version } = require("../package.json");
  const readme = fs.readFileSync(path.join(__dirname, "../README.md"), "utf8");
  assert.ok(readme.includes(`version **${version}**`));
});
