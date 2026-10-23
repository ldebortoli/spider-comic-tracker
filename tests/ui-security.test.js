const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const vm = require("node:vm");
const { createLocalApi } = require("../public/local-api");

test("UI shares a session, authenticates requests and renews once after restart", async () => {
  const calls = [];
  let serial = 0;
  const client = createLocalApi(async (path, options) => {
    calls.push({ path, options });
    if (path === "/api/local-session") return { ok: true, json: async () => ({ token: `synthetic-${++serial}` }) };
    const stale = options.headers["X-Spider-Token"] === "synthetic-1";
    return { status: stale ? 401 : 200, ok: !stale, json: async () => ({ ok: true }) };
  });
  assert.deepEqual(await client.api("/api/dashboard"), { ok: true });
  assert.deepEqual(await client.api("/api/dashboard", { headers: { Accept: "application/json" } }), { ok: true });
  assert.equal(serial, 2);
  assert.equal(calls[1].options.redirect, "error");
  assert.equal(calls[1].options.credentials, "same-origin");
  assert.equal(calls.at(-1).options.headers.Accept, "application/json");
  for (const path of ["https://evil.test", "/api/evil\\test", "/api/test#fragment"]) {
    await assert.rejects(client.request(path), /Ruta local invalida/);
  }
  let attempts = 0;
  const broken = createLocalApi(async () => { attempts++; return { ok: false }; });
  await assert.rejects(broken.api("/api/dashboard"), /sesion local/);
  await assert.rejects(broken.api("/api/dashboard"), /sesion local/);
  assert.equal(attempts, 2);
  for (const payload of [{ error: "safe server error" }, {}]) {
    const denied = createLocalApi(async path => path.endsWith("local-session")
      ? { ok: true, json: async () => ({ token: "synthetic" }) }
      : { status: 401, ok: false, json: async () => payload });
    await assert.rejects(denied.api("/api/dashboard"), new RegExp(payload.error || "Error de API"));
  }
});

test("browser entry point creates an authenticated client", () => {
  const context = vm.createContext({ fetch: async () => {} });
  vm.runInContext(fs.readFileSync(require.resolve("../public/local-api"), "utf8"), context, { filename: require.resolve("../public/local-api") });
  assert.equal(typeof context.spiderLocalApi.api, "function");
});

test("comic group renderer escapes imported text and rejects executable URLs", () => {
  const source = fs.readFileSync(require.resolve("../public/app"), "utf8");
  const functions = source.slice(source.indexOf("function escapeHtml"), source.indexOf("function createLazyEnemyPicker"))
    + source.slice(source.indexOf("function sortComicGroup"), source.indexOf("function renderComics"));
  const context = vm.createContext({ URL, formatDate: () => "2026-01-01" });
  vm.runInContext(functions, context);
  assert.equal(context.escapeUrl("javascript:alert(1)"), "");
  assert.equal(context.escapeUrl("data:text/html,evil"), "");
  assert.equal(context.escapeUrl("invalid"), "");
  assert.equal(context.escapeUrl('https://example.test/?a=1&b=2'), "https://example.test/?a=1&amp;b=2");
  assert.equal(context.escapeUrl("http://example.test/"), "http://example.test/");
  const container = { innerHTML: "", querySelectorAll: () => [] };
  context.renderComicGroups(container, [{ id: '" onclick="evil()', volumeName: "<script>evil()</script>",
    title: '<img src=x onerror="evil()">', issueLabel: "<svg/onload=evil()>",
    volumeFandomUrl: "javascript:evil()", coverImageUrl: '" onerror="evil()',
    matchSummary: ["<iframe>"] }]);
  assert.ok(!container.innerHTML.includes("<script>"));
  assert.ok(!container.innerHTML.includes('href="javascript:'));
  assert.ok(!container.innerHTML.includes('src="" onerror='));
  assert.match(container.innerHTML, /&lt;iframe&gt;/);
  assert.match(container.innerHTML, /&quot; onclick=&quot;evil\(\)/);
});

test("CSV preserves confirmation and downloads through authenticated fetch", async () => {
  const source = fs.readFileSync(require.resolve("../public/app"), "utf8");
  const calls = [];
  const link = { click: () => calls.push("download") };
  let confirmed = false;
  const context = vm.createContext({
    window: { spiderLocalApi: { request: async path => { calls.push(path); return { ok: true, blob: async () => "synthetic CSV" }; } } },
    document: { createElement: () => link },
    URL: { createObjectURL: blob => { assert.equal(blob, "synthetic CSV"); return "blob:synthetic"; }, revokeObjectURL: url => calls.push(url) },
    setTimeout: fn => fn(), setSyncStatus: error => calls.push(error), askConfirmation: async () => confirmed
  });
  vm.runInContext(source.slice(source.indexOf("async function exportCatalogCsv"), source.indexOf("function debounce"))
    + source.slice(source.indexOf("async function confirmCsvExport"), source.indexOf("async function openSystemModal")), context);
  const event = { preventDefault: () => calls.push("prevented") };
  await context.confirmCsvExport(event);
  assert.deepEqual(calls, ["prevented"]);
  confirmed = true;
  await context.confirmCsvExport(event);
  assert.deepEqual(calls.slice(2), ["/api/catalog/export.csv", "download", "blob:synthetic"]);
  assert.equal(link.download, "spider-man-earth-616.csv");
  assert.equal(link.href, "blob:synthetic");
  context.window.spiderLocalApi.request = async () => ({ ok: false });
  await context.exportCatalogCsv();
  assert.equal(calls.at(-1), "No se pudo exportar el catalogo.");
});

test("modal uses text fields and rejects executable links", () => {
  const source = fs.readFileSync(require.resolve("../public/app"), "utf8");
  const elements = Object.fromEntries(["modalTitle", "modalDate", "modalCharacters", "modalLink", "modalCover", "modal"].map(key => [key, {}]));
  const context = vm.createContext({ elements, URL, formatDate: () => "1960-01-01", openDialog: () => {} });
  vm.runInContext(source.slice(source.indexOf("function escapeHtml"), source.indexOf("function createLazyEnemyPicker"))
    + source.slice(source.indexOf("function openModal"), source.indexOf("function resetCharacterForm")), context);
  context.openModal({ title: "<script>synthetic</script>", fandomUrl: "javascript:evil()", coverImageUrl: "data:text/html,evil" });
  assert.equal(elements.modalTitle.textContent, "<script>synthetic</script>");
  assert.equal(elements.modalLink.href, "about:blank");
  assert.equal(elements.modalCover.src, "");
  context.openModal({ title: "Safe", fandomUrl: "https://example.test/", coverImageUrl: "https://example.test/cover", issueLabel: "1", volumeName: "Fake", matchedCharacters: ["Fake"] });
  assert.equal(elements.modalLink.href, "https://example.test/");
  assert.equal(elements.modalCover.src, "https://example.test/cover");
});
