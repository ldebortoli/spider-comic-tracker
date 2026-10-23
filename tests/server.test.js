const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");
const net = require("node:net");
const { execFileSync } = require("node:child_process");
const { ComicDatabase } = require("../src/database");
const { ComicTrackerService } = require("../src/service");
const { getConfig } = require("../src/env");
const { createTrackerServer, startTracker } = require("../src/server");

test("temporary HTTP server authorizes UI and bridge without contacting Telegram", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "spider-http-"));
  const db = new ComicDatabase(path.join(root, "synthetic.sqlite"));
  const config = getConfig();
  config.port = 0;
  config.telegram = { botToken: "fake-do-not-send", pollingEnabled: false };
  const service = new ComicTrackerService({ db, config });
  let stopped = 0;
  const telegram = { stop: async () => { stopped++; }, getStatus: () => ({ running: false }), buildDebugText: () => "synthetic debug" };
  const server = createTrackerServer({ config, db, service, telegram, localToken: "a".repeat(64),
    systemMonitor: { snapshot: () => ({ synthetic: true }) }, automationManager: {}, envPath: path.join(root, ".env") });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  const origin = `http://127.0.0.1:${port}`;
  t.after(async () => { await server.shutdown(); fs.rmSync(root, { recursive: true, force: true }); });
  const call = (url, headers = {}, options = {}) => fetch(origin + url, { ...options, headers });
  let response = await call("/", { "sec-fetch-site": "none" });
  assert.equal(response.status, 200);
  assert.match(await response.text(), /Spider Tracker/);
  assert.equal((await call("/api/dashboard")).status, 401);
  assert.equal((await call("/api/local-session")).status, 403);
  assert.equal((await call("/api/local-session", { origin: "https://evil.test" })).status, 403);
  response = await call("/api/local-session", { origin });
  assert.equal(response.headers.get("cache-control"), "no-store");
  const { token } = await response.json();
  const headers = { "x-spider-token": token, "content-type": "application/json", origin };
  assert.equal((await call("/api/dashboard", headers)).status, 200);
  assert.equal((await call("/api/telegram/debug", { "x-spider-token": token })).status, 200);
  assert.equal((await call("/api/dashboard", { ...headers, origin: "null" })).status, 403);
  response = await call("/api/spanish-editions", headers, { method: "POST", body: JSON.stringify({ title: "Synthetic", publisher: "Fake" }) });
  assert.equal(response.status, 201);
  assert.equal((await response.json()).title, "Synthetic");
  // Import only a synthetic fixture through the real service/DB path.
  const fixture = { fandomPageId: 6001, pageTitle: "Synthetic Vol 1 1", title: '<img src=x onerror="evil()">',
    fandomUrl: "https://example.test/synthetic", seriesName: "Synthetic", volumeNumber: 1, issueNumber: 1,
    issueLabel: "1", releaseDate: "1962-01-01", coverImageUrl: "https://example.test/cover", writers: ["Fake"], appearanceType: "direct" };
  service.performCatalogImport = async () => {
    db.upsertCatalogIssues([fixture]);
    db.replaceCatalogCharacterIssues("peter-parker-earth-616", [{ pageId: fixture.fandomPageId, appearanceType: "direct" }]);
  };
  response = await call("/api/catalog/import", headers, { method: "POST", body: JSON.stringify({ characterSlug: "peter-parker-earth-616", incremental: true }) });
  assert.equal(response.status, 202);
  await service.currentCatalogImportPromise;
  const issue = db.getCatalogIssueByFandomPageId(6001);
  assert.equal(issue.title, fixture.title);
  response = await call(`/api/catalog/${issue.id}/collection`, headers, { method: "PATCH", body: JSON.stringify({ owned: true, notes: "preserve" }) });
  assert.equal(response.status, 200);
  await call("/api/catalog/import", headers, { method: "POST", body: "{}" });
  await service.currentCatalogImportPromise;
  assert.equal(db.getCatalogIssue(issue.id).collectionNotes, "preserve");
  assert.equal(db.listCatalogIssues({ limit: 10 }).total, 1);
  response = await call("/api/catalog/export.csv", headers);
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-disposition"), /attachment/);
  assert.match(await response.text(), /preserve/);
  for (const body of ["{", "null", "[]"]) {
    assert.equal((await call("/api/tracked-characters", headers, { method: "POST", body })).status, 400);
  }
  assert.equal((await call("/api/tracked-characters", { ...headers, "content-type": "text/plain" }, { method: "POST", body: "{}" })).status, 415);
  assert.equal((await call("/api/tracked-characters", headers, { method: "POST", body: " ".repeat(65537) })).status, 413);
  service.getDashboard = () => { throw new Error("secret fake-do-not-send C:/private/db"); };
  response = await call("/api/dashboard", headers);
  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { error: "Error interno del servidor." });
  assert.equal((await call("/api/missing", headers)).status, 404);
  // Raw framing cannot hide oversized chunks, negative lengths or malformed URLs.
  const raw = (target, head = "", body = "", method = "POST") => new Promise((resolve, reject) => {
    const socket = net.createConnection(port, "127.0.0.1", () => socket.end(`${method} ${target} HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nX-Spider-Token: ${token}\r\nConnection: close\r\n${head}\r\n${body}`));
    let text = "";
    socket.on("data", chunk => { text += chunk; });
    socket.on("error", reject);
    socket.on("close", () => resolve(text));
  });
  assert.match(await raw("/api/spanish-editions", "Content-Length: -1\r\n"), /^HTTP\/1.1 400/);
  assert.match(await raw("/%ZZ", "", "", "GET"), /^HTTP\/1.1 400/);
  assert.match(await raw("http://evil.test/api/dashboard", "", "", "GET"), /^HTTP\/1.1 400/);
  assert.match(await raw("/api/spanish-editions", "Content-Type: application/json\r\nContent-Length: 20\r\n", "{}"), /^HTTP\/1.1 400/);
  const chunk = " ".repeat(65537);
  assert.match(await raw("/api/spanish-editions", "Content-Type: application/json\r\nTransfer-Encoding: chunked\r\n", `${chunk.length.toString(16)}\r\n${chunk}\r\n0\r\n\r\n`), /^HTTP\/1.1 413/);
  assert.match(await raw("/api/dashboard", "Host: evil.test\r\n", "", "GET"), /^HTTP\/1.1 403/);
  assert.equal((await call("/api/telegram/debug", headers)).status, 200);
  await server.shutdown();
  await server.shutdown();
  assert.equal(stopped, 1);
  assert.equal(server.listening, false);
});

test("route contracts and safe errors use only injected local collaborators", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "spider-routes-"));
  for (const [name, content] of Object.entries({ "index.html": "synthetic UI", "app.js": "/* synthetic */", "app.css": "body {}", "icon.svg": "<svg/>", "cover.png": "png", "other.bin": "bin" })) {
    fs.writeFileSync(path.join(root, name), content);
  }
  const config = { port: 0, publicDir: root, telegram: { botToken: "fake-existing", pollingEnabled: false } };
  const calls = [];
  let result = {};
  const service = new Proxy({}, { get: (_object, method) => method === "schedulerHandle" ? undefined
    : (...args) => { calls.push({ method, args }); return result; } });
  const telegram = { getStatus: () => ({ running: false }), configure: async () => {}, testConnection: async () => ({ ok: true }),
    buildDebugText: () => "fake", updateResolvedReviewMessage: async () => {}, stop: async () => {} };
  let enabled = false;
  const server = createTrackerServer({ config, db: { close() {} }, service, telegram,
    systemMonitor: { snapshot: () => ({}) }, automationManager: { getStatus: () => ({}), configure: async () => ({ enabled }) }, envPath: path.join(root, ".env") });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => { await server.shutdown(); fs.rmSync(root, { recursive: true, force: true }); });
  const origin = `http://127.0.0.1:${server.address().port}`;
  const token = (await (await fetch(origin + "/api/local-session", { headers: { origin } })).json()).token;
  assert.match(token, /^[a-f0-9]{64}$/);
  const call = (route, method = "GET", body) => fetch(origin + route, { method,
    headers: { "x-spider-token": token, "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  for (const route of ["/api/dashboard", "/api/system/metrics", "/api/automation", "/api/telegram/config", "/api/telegram/debug",
    "/api/comics", "/api/comics/enemies", "/api/catalog/stats", "/api/catalog/characters", "/api/catalog/search", "/api/catalog/enemies",
    "/api/spanish-editions", "/api/catalog", "/api/catalog/refresh-schedule", "/api/tracked-characters"]) {
    assert.equal((await call(route)).status, 200, route);
    assert.equal((await call(route + "?scope=recent&query=x&character=peter&q=x&limit=5&offset=1&sort=alpha&enemy=Venom&from=1960&to=2020&universeGroup=all&ownership=owned&appearance=minor&search=x&selected=x&publisher=Fake&status=owned")).status, 200, route);
  }
  for (const payload of [{}, { botToken: "fake-new", pollingEnabled: true, reviewChatId: "fake" }, { pollingEnabled: false }]) {
    const response = await call("/api/telegram/config", "PUT", payload);
    assert.equal(response.status, 200);
    assert.ok(!(await response.text()).includes("fake-new"));
  }
  assert.equal((await call("/api/telegram/test", "POST")).status, 200);
  for (const value of [true, false]) {
    assert.equal((await call("/api/telegram/polling", "PUT", { enabled: value })).status, 200);
    enabled = value;
    assert.equal((await call("/api/automation", "PUT", { enabled: value, day: "MONDAY", hour: 1, minute: 2 })).status, 200);
    result = { enabled: value, configuredNextRefreshAt: "2027-01-01" };
    assert.equal((await call("/api/catalog/refresh-schedule", "PUT", { enabled: value, nextRefreshAt: "2027-01-01" })).status, 200);
  }
  result = {};
  assert.equal((await call("/api/catalog/refresh-schedule", "PUT", {})).status, 200);
  for (const [route, method, body, status] of [
    ["/api/spanish-editions", "POST", { title: "synthetic" }, 201], ["/api/spanish-editions/1", "PUT", {}, 200],
    ["/api/tracked-characters", "POST", { displayName: "Fake", aliases: ["a"], active: false }, 201],
    ["/api/tracked-characters/1", "PUT", { displayName: "Fake", aliases: "a,b" }, 200],
    ["/api/tracked-characters/1", "DELETE", undefined, 200]
  ]) assert.equal((await call(route, method, body)).status, status, route);
  for (const body of [{}, { displayName: "Fake" }]) assert.equal((await call("/api/tracked-characters", "POST", body)).status, 500);
  for (const value of [false, true]) {
    result = value;
    assert.equal((await call("/api/spanish-editions/1", "DELETE")).status, value ? 200 : 404);
    result = value ? { id: 1 } : null;
    assert.equal((await call("/api/catalog/1/collection", "PATCH", value ? { owned: true, publisher: "Fake", editionTitle: "Fake", notes: "Fake" } : {})).status, value ? 200 : 404);
    result = { started: value };
    for (const route of ["/api/catalog/import", "/api/catalog/characters/peter/continue", "/api/catalog/refresh-all", "/api/panini/import", "/api/weekly-update", "/api/sync"]) {
      assert.equal((await call(route, "POST", {})).status, value ? 202 : (["/api/panini/import", "/api/weekly-update", "/api/sync"].includes(route) ? 409 : 200));
    }
  }
  result = { notFound: true };
  for (const route of ["/api/catalog/import", "/api/catalog/characters/missing/continue"]) assert.equal((await call(route, "POST", { characterSlug: "missing", incremental: true })).status, 404);
  assert.equal((await call("/api/panini/import", "POST", { full: true })).status, 409);
  assert.equal((await call("/api/sync", "POST", { weekYear: 2026 })).status, 400);
  assert.equal((await call("/api/sync", "POST", { weekNumber: 1 })).status, 400);
  assert.equal((await call("/api/reviews/1/decision", "POST", {})).status, 400);
  for (const [status, code] of [["not_found", 404], ["already_resolved", 409], ["resolved", 200]]) {
    result = { status, review: {} };
    for (const action of ["approve", "reject"]) {
      assert.equal((await call("/api/reviews/1/decision", "POST", { action })).status, code);
      assert.equal((await call("/api/reviews/1/decision", "POST", { action, user: { source: "telegram-python", id: "fake", username: "fake", first_name: "fake" } })).status, code);
    }
  }
  result = { status: "resolved", review: {} };
  assert.equal((await call("/api/reviews/1/decision", "POST", { action: "approve", user: { source: "telegram-python" } })).status, 200);
  for (const file of ["/", "/app.js", "/app.css", "/icon.svg", "/cover.png", "/other.bin", "/missing", "/%2e%2e%2foutside"]) {
    assert.equal((await call(file)).status, file.includes("outside") ? 403 : 200, file);
  }
  assert.equal((await call("/api/unknown", "POST")).status, 404);
  assert.equal((await call("/unknown", "POST")).status, 405);
  assert.equal((await call("/api/local-session", "POST")).status, 403);
  const idle = net.createConnection(server.address().port, "127.0.0.1");
  await new Promise(resolve => idle.once("connect", resolve));
  const closed = new Promise(resolve => idle.once("close", resolve));
  server.emit("timeout", idle);
  await closed;
  assert.ok(calls.some(item => item.method === "startScheduler"));
  const partial = net.createConnection(server.address().port, "127.0.0.1");
  await new Promise(resolve => partial.once("connect", resolve));
  partial.write(`POST /api/spanish-editions HTTP/1.1\r\nHost: 127.0.0.1:${server.address().port}\r\nX-Spider-Token: ${token}\r\nContent-Length: 20\r\nContent-Type: application/json\r\n\r\n{`);
  await new Promise(resolve => setImmediate(resolve));
  const shutdown = server.shutdown();
  await shutdown;
  partial.destroy();
});

test("startup is isolated in a temporary cwd with all external automation disabled", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "spider-startup-"));
  const previousCwd = process.cwd();
  const overrides = { PORT: "0", DB_PATH: path.join(root, "synthetic.sqlite"), SCHEDULE_ENABLED: "false",
    CATALOG_REFRESH_ENABLED: "false", BACKUP_ENABLED: "false", TELEGRAM_BOT_TOKEN: "", TELEGRAM_POLLING_ENABLED: "false" };
  const previous = Object.fromEntries(Object.keys(overrides).map(key => [key, process.env[key]]));
  const listeners = new Map(["SIGINT", "SIGTERM"].map(signal => [signal, process.listeners(signal)]));
  const originalFetch = global.fetch;
  let outbound = 0;
  global.fetch = async () => { outbound++; throw new Error("External transport forbidden in startup test"); };
  let server;
  try {
    process.chdir(root);
    Object.assign(process.env, overrides);
    const preload = path.join(root, "no-network.cjs");
    fs.writeFileSync(preload, 'global.fetch = async () => { throw new Error("external transport forbidden"); }; setTimeout(() => process.emit("SIGTERM"), 200);');
    execFileSync(process.execPath, ["--require", preload, require.resolve("../src/server")], {
      cwd: root, env: process.env, windowsHide: true, timeout: 10_000, stdio: "pipe"
    });
    server = startTracker();
    await new Promise(resolve => server.once("listening", resolve));
    assert.equal(server.address().address, "127.0.0.1");
    assert.equal(outbound, 0);
    assert.ok(fs.existsSync(path.join(root, "synthetic.sqlite")));
    await server.shutdown();
    const actualExit = process.exit;
    const actualExitCode = process.exitCode;
    const actualError = console.error;
    const codes = [];
    process.exit = code => codes.push(code);
    console.error = () => {};
    try {
      const handler = process.listeners("SIGTERM").find(listener => !listeners.get("SIGTERM").includes(listener));
      handler();
      await new Promise(resolve => setImmediate(resolve));
      server.shutdown = async () => { throw new Error("synthetic shutdown error"); };
      handler();
      await new Promise(resolve => setImmediate(resolve));
      assert.deepEqual(codes, [0]);
      assert.equal(process.exitCode, 1);
    } finally { process.exit = actualExit; process.exitCode = actualExitCode; console.error = actualError; }
  } finally {
    if (server?.listening) await server.shutdown();
    process.chdir(previousCwd);
    global.fetch = originalFetch;
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    for (const [signal, saved] of listeners) {
      for (const listener of process.listeners(signal)) if (!saved.includes(listener)) process.off(signal, listener);
    }
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("shutdown reports a server that was never listening", async () => {
  const server = createTrackerServer({ config: {}, service: {}, db: {}, telegram: { stop: async () => {} } });
  await assert.rejects(server.shutdown(), { code: "ERR_SERVER_NOT_RUNNING" });
});

test("failed bot shutdown keeps server and its retry scheduler available", async (t) => {
  t.mock.timers.enable({ apis: ["setInterval"] });
  let fail = true;
  let closed = 0;
  let ticks = 0;
  const service = { schedulerHandle: setInterval(() => { ticks++; }, 1000) };
  const server = createTrackerServer({ config: {}, service, db: { close: () => { closed++; } },
    telegram: { stop: async () => { if (fail) throw new Error("synthetic stop failure"); } } });
  t.after(async () => { fail = false; await server.shutdown(); });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  await assert.rejects(server.shutdown(), /synthetic stop failure/);
  assert.equal(server.listening, true);
  t.mock.timers.tick(1000);
  assert.equal(ticks, 1, "the next scheduled check must still run after stop failure");
  fail = false;
  await server.shutdown();
  assert.equal(server.listening, false);
  assert.equal(closed, 1);
  t.mock.timers.tick(1000);
  assert.equal(ticks, 1, "successful stop clears its scheduler");
});
