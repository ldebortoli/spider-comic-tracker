const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const vm = require("node:vm");
const { EventEmitter } = require("node:events");
const { PassThrough } = require("node:stream");

function harness(platform = "win32") {
  const filename = require.resolve("../src/telegram");
  const files = new Map();
  const timers = new Map();
  const calls = [];
  const children = [];
  let taskkillStatus = 0;
  let killError;
  let fsError = false;
  let response = { ok: true, json: async () => ({ ok: true, result: { chat: { id: 42 }, message_id: 7, id: 10, username: "fixture", first_name: "Fixture" } }) };
  const fakeFs = {
    mkdirSync: () => { if (fsError) throw Error("disk denied"); },
    writeFileSync: (p, value) => files.set(p, value),
    existsSync: p => { if (fsError) throw Error("disk denied"); return files.has(p); },
    readFileSync: p => files.get(p), unlinkSync: p => files.delete(p)
  };
  const fakeProcess = { cwd: () => ".", env: {}, platform, kill: (...args) => { calls.push(["kill", ...args]); if (killError) throw killError; } };
  const childProcess = {
    spawn: (...args) => {
      calls.push(["spawn", ...args]);
      const child = new EventEmitter();
      Object.assign(child, { pid: 123, exitCode: null, signalCode: null, stdout: new PassThrough(), stderr: new PassThrough(), kill: signal => calls.push(["childKill", signal]) });
      children.push(child);
      return child;
    },
    spawnSync: (...args) => { calls.push(["spawnSync", ...args]); return { status: taskkillStatus }; }
  };
  const context = vm.createContext({ module: { exports: {} }, console: { log: (...a) => calls.push(["log", ...a]), error: (...a) => calls.push(["error", ...a]) },
    process: fakeProcess, URLSearchParams, FormData, Blob,
    fetch: async (...args) => { calls.push(["fetch", ...args]); return response; },
    setTimeout: (fn, delay) => { const id = {}; timers.set(id, { fn, delay }); return id; }, clearTimeout: id => timers.delete(id),
    require: name => name === "node:fs" ? fakeFs : name === "node:fs/promises" ? { readFile: async p => { assert.equal(p, "fixture.gz"); return Buffer.from("archive"); } } : name === "node:child_process" ? childProcess : require(name)
  });
  vm.runInContext(fs.readFileSync(filename, "utf8"), context, { filename });
  const Bridge = context.module.exports.TelegramBridge;
  const create = (config = {}, service = {}) => new Bridge({ config, service, serverUrl: "http://127.0.0.1:1", localToken: "local-fixture" });
  return { Bridge, create, calls, timers, files, children, setResponse: r => { response = r; }, setTaskkill: s => { taskkillStatus = s; }, setKillError: e => { killError = e; }, setFsError: b => { fsError = b; } };
}

test("Telegram transport serializes scalar and structured parameters and rejects HTTP/API errors", async () => {
  const h = harness();
  const bridge = h.create({ botToken: "bot-fixture", reviewChatId: "r", summaryChatId: "s", backupChatId: "b" });
  assert.equal(bridge.canSendReviews(), true);
  assert.equal(bridge.canSendSummary(), true);
  assert.equal(bridge.canSendBackups(), true);
  await bridge.call("fixture");
  await bridge.call("fixture", { a: "text", b: 1, c: false, d: { value: 2 }, e: undefined, f: null, g: "" });
  const body = h.calls.at(-1)[2].body;
  assert.equal(body.get("a"), "text");
  assert.equal(body.get("b"), "1");
  assert.equal(body.get("c"), "false");
  assert.deepEqual(JSON.parse(body.get("d")), { value: 2 });
  assert.equal(body.has("e"), false);
  await bridge.callMultipart("fixture", new FormData());
  for (const method of ["call", "callMultipart"]) {
    h.setResponse({ ok: false, status: 503 });
    await assert.rejects(bridge[method]("fixture", new FormData()), /503/);
    h.setResponse({ ok: true, json: async () => ({ ok: false, description: "fixture denied" }) });
    await assert.rejects(bridge[method]("fixture", new FormData()), /fixture denied/);
    h.setResponse({ ok: true, json: async () => ({ ok: false }) });
    await assert.rejects(bridge[method]("fixture", new FormData()), /rechazó fixture/);
  }
});

test("Telegram process lifecycle isolates managed PID files, diagnostics, restart and stop failures", async () => {
  for (const platform of ["win32", "linux"]) {
    const h = harness(platform);
    const disabled = h.create({ pollingEnabled: false, botToken: "fixture" });
    disabled.start(); disabled.scheduleRestart();
    const empty = h.create();
    empty.start(); empty.scheduleRestart();
    assert.equal(h.children.length, 0);
    const bridge = h.create({ botToken: "bot-fixture", allowedUserId: "100" });
    const defaultUser = h.create({ botToken: "default-user-fixture", pythonBin: "fixture-python" });
    defaultUser.start();
    assert.equal(h.calls.find(c => c[0] === "spawn")[3].env.TELEGRAM_ALLOWED_USER_ID, "");
    defaultUser.process.exitCode = 0;
    await defaultUser.stop();
    h.children.length = 0;
    assert.equal(bridge.getStatus().pid, null);
    bridge.saveBotPid();
    h.setFsError(true);
    bridge.saveBotPid(2);
    assert.match(bridge.lastError, /guardar el PID/);
    bridge.clearBotPid(2);
    h.setFsError(false);
    bridge.start(); bridge.start();
    assert.equal(h.children.length, 1);
    const child = bridge.process;
    assert.equal(bridge.getStatus().pid, 123);
    assert.equal(h.calls.find(c => c[0] === "spawn")[3].windowsHide, true);
    bridge.clearBotPid(999);
    assert.equal(h.files.size, 1);
    child.stdout.write(' {"type":"ready"}\n');
    child.stdout.write('{"type":"status","lastPollAt":"fixture-time"}\n');
    assert.equal(bridge.lastPollAt, "fixture-time");
    child.stderr.write(" \n");
    child.stderr.write("bot-fixture local-fixture\n");
    assert.equal(bridge.lastError, "[redacted] [redacted]");
    bridge.handleBotProcessLine("");
    bridge.handleBotProcessLine('{"type":"error"}');
    assert.equal(bridge.lastError, "Error del bot Python");
    bridge.handleBotProcessLine('{"type":"error","message":"explicit"}');
    bridge.handleBotProcessLine('{"type":"other"}');
    bridge.handleBotProcessLine("not json bot-fixture");
    assert.equal(h.calls.at(-1).at(-1), "not json [redacted]");
    assert.equal(empty.redactSecrets(undefined), "");
    child.emit("error", Error("spawn failed"));
    assert.equal(bridge.process, null);
    assert.equal(bridge.lastError, "spawn failed");
    bridge.scheduleRestart();
    assert.equal(h.timers.size, 1);
    child.emit("error", Error("stale"));
    child.emit("exit", 1);
    h.timers.values().next().value.fn();
    h.timers.clear();
    let current = bridge.process;
    current.emit("error", { toString: () => "string error" });
    assert.equal(bridge.lastError, "string error");
    h.timers.values().next().value.fn(); h.timers.clear();
    current = bridge.process;
    current.emit("exit", 1, "SIGTERM");
    assert.match(bridge.lastError, /1 \(SIGTERM\)/);
    h.timers.values().next().value.fn(); h.timers.clear();
    bridge.process.emit("exit", 2);
    assert.match(bridge.lastError, /código 2$/);
    h.timers.values().next().value.fn(); h.timers.clear();
    bridge.process.emit("exit", 0);
    h.timers.values().next().value.fn(); h.timers.clear();
    bridge.process.emit("exit", null);
    h.timers.values().next().value.fn(); h.timers.clear();
    const active = bridge.process;
    if (platform === "win32") {
      h.setTaskkill(1);
      await assert.rejects(bridge.stop(), /No se pudo detener/);
      assert.equal(bridge.process, active);
      h.setTaskkill(0);
    }
    const stopped = bridge.stop();
    h.timers.values().next().value.fn();
    active.emit("exit", 0);
    await stopped;
    assert.equal(bridge.process, null);
    assert.equal(h.files.size, 0);
    bridge.process = { pid: 456, exitCode: 0, signalCode: null };
    await bridge.stop();
    bridge.process = { pid: 456, exitCode: null, signalCode: "SIGTERM" };
    await bridge.stop();
    await bridge.stop();
    await bridge.configure({ pollingEnabled: false });
    assert.equal(bridge.lastError, "");
    if (platform !== "win32") {
      for (const code of ["ESRCH", "EACCES"]) {
        bridge.process = { pid: 789, exitCode: null, signalCode: null, once: (name, cb) => { h.setKillError(Object.assign(Error("kill"), { code })); cb(); } };
        h.setKillError(undefined);
        const result = bridge.stop();
        if (code === "ESRCH") await result;
        else await assert.rejects(result, /grupo del bot/);
      }
    }
  }
});

const review = { id: 2, title: "Fixture", releaseDate: "2026-01-01", fandomUrl: "https://example.test/issue" };

test("force-stop timer failures reject safely and retain the child for a shutdown retry", async () => {
  for (const platform of ["win32", "linux"]) {
    for (const code of ["EPERM", "ESRCH"]) {
      const h = harness(platform);
      const bridge = h.create({ botToken: "fixture" });
      bridge.start();
      const child = bridge.process;
      const failure = Object.assign(Error("synthetic force-stop failure"), { code });
      const stopped = bridge.stop();
      // Attach the rejection assertion before invoking the deferred callback.
      const rejected = code === "EPERM" ? assert.rejects(stopped, /No se pudo forzar el cierre del bot/) : undefined;
      if (platform === "win32") child.kill = () => { throw failure; };
      else h.setKillError(failure);
      const deadline = [...h.timers.values()].find(timer => timer.delay === 1500);
      assert.doesNotThrow(() => deadline.fn(), "timer callback must settle the promise instead of throwing");
      if (code === "ESRCH") {
        h.setKillError(undefined);
        child.emit("exit", 0);
        await stopped;
        assert.equal(bridge.process, null);
      } else {
        await rejected;
        assert.equal(bridge.process, child);
        h.setKillError(undefined);
        child.kill = () => {};
        const retry = bridge.stop();
        child.emit("exit", 0);
        await retry;
        assert.equal(bridge.process, null);
      }
    }
  }
});


test("review, summary, backup and connection messages retain their metadata and default text", async () => {
  const h = harness();
  const bridge = h.create({ botToken: "fixture", reviewChatId: "review", summaryChatId: "summary", backupChatId: "backup" });
  assert.match(bridge.buildReviewText(review), /Sin detectar/);
  const enriched = { ...review, volumeName: "Volume", issueLabel: "#1", originalityStatus: "uncertain", originalityReason: "uncertain source", decisionReason: "manual", matchSummary: ["Peter"] };
  assert.match(bridge.buildReviewText(enriched), /Duda principal: uncertain source/);
  assert.match(bridge.buildReviewText({ ...enriched, originalityReason: "" }), /manual/);
  for (const user of [{ username: "tester" }, { first_name: "First" }, { firstName: "Other" }, { id: 1 }]) {
    assert.match(bridge.buildResolvedText(enriched, "approve", user), /AGREGADO/);
    assert.match(bridge.buildResolvedText(review, "reject", user), /RECHAZADO/);
  }
  assert.deepEqual(JSON.parse(JSON.stringify(await bridge.sendReviewRequest(review))), { chatId: "42", messageId: "7" });
  await bridge.sendSummary({ weekYear: 2026, weekNumber: 1 });
  assert.match(h.calls.at(-1)[2].body.get("text"), /finalizada/);
  await bridge.sendSummary({ weekYear: 2026, weekNumber: 12, failed: true, errorMessage: "fixture error", retried: 2, retryRecovered: 1, addedTitles: ["one"], rejectedTitles: ["two"], pendingTitles: ["three"], errorDetails: [{ pageTitle: "page", message: "detail" }, { pageTitle: "another" }] });
  assert.match(h.calls.at(-1)[2].body.get("text"), /Error desconocido/);
  await bridge.sendSummary({ failed: true });
  await bridge.sendBackupNotice({ text: "backup complete" });
  await bridge.sendBackupFile({ filePath: "fixture.gz", fileName: "fixture.gz", caption: "caption" });
  const multipart = h.calls.at(-1)[2].body;
  assert.equal(multipart.get("document").name, "fixture.gz");
  assert.equal(await multipart.get("document").text(), "archive");
  await assert.rejects(h.create().testConnection(), /token configurado/);
  for (const config of [{}, { reviewChatId: "r" }, { summaryChatId: "s" }, { backupChatId: "b" }]) {
    const result = await h.create({ botToken: "fixture", ...config }).testConnection();
    assert.equal(result.sentMessage, Boolean(Object.keys(config).length));
  }
  h.setResponse({ ok: true, json: async () => ({ ok: true }) });
  const result = await bridge.testConnection();
  assert.equal(result.username, "");
  assert.equal(result.firstName, "");
});

test("commands and review callbacks enforce identity and handle stale reviews and Telegram edit failures", async () => {
  const h = harness();
  let dashboard = {};
  let runtime = {};
  let resolved = { status: "not_found" };
  const service = { getDashboard: () => dashboard, getRuntimeStatus: () => runtime, resolveReview: () => resolved };
  const bridge = h.create({ botToken: "fixture", allowedUserId: "allowed" }, service);
  assert.equal(bridge.isAuthorizedUser(), false);
  assert.equal(h.create().isAuthorizedUser(), true);
  assert.match(bridge.buildDebugText(), /sin corridas/);
  dashboard = { stats: { includedCount: 1, pendingReviewsCount: 2, trackedCharactersCount: 3 }, lastSync: { weekKey: "2026-W1" }, weeklyUpdate: { running: true }, paniniImport: { running: true }, quarterlyRefresh: { running: true } };
  bridge.process = { pid: 123 }; bridge.lastPollAt = "now"; bridge.lastError = "last";
  Object.assign(bridge.config, { reviewChatId: "r", summaryChatId: "s", backupChatId: "b" });
  assert.match(bridge.buildDebugText(), /PID bot: 123/);
  bridge.process = null; bridge.config.pollingEnabled = false;
  assert.match(bridge.buildDebugText(), /polling desactivado/);
  runtime = { weeklyUpdateRunning: true, catalogImportRunning: true, paniniImportRunning: true, quarterlyRefreshRunning: true };
  assert.match(bridge.buildDebugText(), /Catálogo USA: importando/);
  runtime = {}; dashboard = { weeklyUpdate: { status: "done" }, paniniImport: { status: "done" }, quarterlyRefresh: { status: "done" } };
  assert.match(bridge.buildDebugText(), /Sync semanal: done/);
  const msg = { text: "/debug", from: { id: "allowed" }, chat: { id: 1 } };
  await bridge.handleUpdate({});
  await bridge.handleUpdate({ message: {} });
  await bridge.handleMessage({ ...msg, text: "plain" });
  await bridge.handleMessage({ ...msg, from: {} });
  assert.match(h.calls.at(-1)[2].body.get("text"), /No autorizado/);
  for (const text of ["/debug", "/start@fixture", "/help", "/unknown"]) await bridge.handleMessage({ ...msg, text });
  const callback = { id: "callback", from: { id: "allowed" }, message: { chat: { id: "chat" }, message_id: 7 } };
  await bridge.handleUpdate({ callback_query: { ...callback } });
  await bridge.handleCallbackQuery({ ...callback, data: "review:2:approve", from: {} });
  await bridge.handleCallbackQuery({ ...callback, data: "review:2:approve" });
  resolved = { status: "already_resolved" };
  await bridge.handleCallbackQuery({ ...callback, data: "review:2:approve" });
  resolved = { status: "resolved", review };
  for (const action of ["approve", "reject"]) await bridge.handleCallbackQuery({ ...callback, data: `review:2:${action}` });
  let failures = 1;
  bridge.call = async method => { if (method.startsWith("edit") && failures-- > 0) throw Error("edit failed"); };
  await bridge.handleCallbackQuery({ ...callback, data: "review:2:approve" });
  failures = 2;
  await bridge.handleCallbackQuery({ ...callback, data: "review:2:approve" });
  bridge.call = async () => { throw Error("transport failed"); };
  await bridge.answerCallbackQuery("id", "text");
  await bridge.answerCallbackQuery("id", "text", true);
  await bridge.updateResolvedReviewMessage(review, "approve", {});
  await bridge.updateResolvedReviewMessage({ telegramChatId: "chat" }, "approve", {});
  await bridge.updateResolvedReviewMessage({ ...review, telegramChatId: "chat", telegramMessageId: "message" }, "approve", {});
  bridge.call = async () => {};
  await bridge.updateResolvedReviewMessage({ ...review, telegramChatId: "chat", telegramMessageId: "message" }, "approve", {});
  await h.create().updateResolvedReviewMessage(undefined, "approve", {});
});
