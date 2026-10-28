const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const vm = require("node:vm");

function fixture() {
  const calls = { launch: 0, contexts: 0, pages: 0, closedPages: 0, closedBrowsers: 0, required: 0 };
  let failure = "";
  const browser = {
    newContext: async options => {
      calls.contexts++;
      assert.equal(options.locale, "es-ES");
      if (failure === "context") throw Error("context failed");
      return { newPage: async () => {
        if (failure === "page") throw Error("page failed");
        calls.pages++;
        let url;
        return {
          goto: async (value, options) => {
            url = value;
            assert.equal(options.waitUntil, "domcontentloaded");
            if (failure === "goto") throw Error("navigation failed");
          },
          locator: selector => {
            assert.equal(selector, "a.product-item-link, .product-info-main");
            return { first: () => ({ waitFor: async options => {
              assert.equal(options.state, "attached");
              if (failure === "wait") throw Error("page not available");
            } }) };
          },
          url: () => failure === "foreign" ? "https://panini.queue-it.net/wait" : url,
          content: async () => { if (failure === "content") throw Error("content failed"); return "<main>Real catalog fixture</main>"; },
          close: async () => { calls.closedPages++; if (failure === "pageClose") throw Error("page close failed"); }
        };
      } };
    },
    close: async () => { calls.closedBrowsers++; if (failure === "close") throw Error("close failed"); }
  };
  const chromium = { launch: async options => {
    calls.launch++;
    assert.equal(options.headless, true);
    assert.equal(options.chromiumSandbox, true);
    assert.ok(["msedge", "chrome"].includes(options.channel));
    if (failure === "launch") throw Error("browser missing");
    return browser;
  } };
  const filename = require.resolve("../src/panini-browser");
  const context = vm.createContext({ URL, module: { exports: {} }, require: name => {
    assert.equal(name, "playwright-core"); calls.required++; return { chromium };
  } });
  vm.runInContext(fs.readFileSync(filename, "utf8"), context, { filename });
  return { Session: context.module.exports.PaniniBrowserSession, chromium, calls, fail: value => { failure = value; } };
}

test("Panini browser stays lazy, shares one anonymous context and closes every page", async () => {
  const f = fixture();
  const session = new f.Session();
  await session.close();
  assert.equal(f.calls.launch, 0);
  const results = await Promise.all([
    session.fetch("https://www.panini.es/shp_esp_es/comics/marvel.html"),
    session.fetch("https://panini.es/shp_esp_es/book.html")
  ]);
  assert.equal(results.length, 2);
  assert.match(results[0], /Real catalog fixture/);
  assert.equal(session.active, true);
  assert.equal(f.calls.launch, 1);
  assert.equal(f.calls.contexts, 1);
  assert.equal(f.calls.required, 1);
  assert.equal(f.calls.closedPages, 2);
  await session.close();
  await session.close();
  assert.equal(session.active, false);
  assert.equal(f.calls.closedBrowsers, 1);
});

test("Panini browser rejects foreign, credentialed, non-HTTPS and non-catalog URLs before launch", async () => {
  const f = fixture();
  const session = new f.Session({ chromium: f.chromium, channel: "chrome" });
  for (const url of ["invalid", "http://www.panini.es/shp_esp_es/a", "https://example.test/shp_esp_es/a", "https://www.panini.es/other", "https://user@www.panini.es/shp_esp_es/a", "https://:password@www.panini.es/shp_esp_es/a"]) {
    await assert.rejects(session.fetch(url));
  }
  assert.equal(f.calls.launch, 0);
  await session.fetch("https://www.panini.es/shp_esp_es/a");
  assert.equal(f.calls.required, 0);
  await session.close();
});

test("Panini browser closes pages after navigation, waiting, content or redirect failures", async () => {
  for (const failure of ["goto", "wait", "content", "foreign"]) {
    const f = fixture(); f.fail(failure);
    const session = new f.Session({ chromium: f.chromium });
    await assert.rejects(session.fetch("https://www.panini.es/shp_esp_es/a"), /siguen pendientes/);
    assert.equal(f.calls.closedPages, 1);
    await session.close();
    assert.equal(f.calls.closedBrowsers, 1);
  }
});

test("Panini browser startup failures retain enough state for cleanup and close can be retried", async () => {
  for (const failure of ["launch", "context", "page"]) {
    const f = fixture(); f.fail(failure);
    const session = new f.Session({ chromium: f.chromium });
    await assert.rejects(session.fetch("https://www.panini.es/shp_esp_es/a"), /navegador instalado|page failed/);
    await session.close();
    assert.equal(f.calls.closedBrowsers, failure === "launch" ? 0 : 1);
  }
  const f = fixture();
  const session = new f.Session({ chromium: f.chromium });
  await session.fetch("https://www.panini.es/shp_esp_es/a");
  f.fail("close");
  await assert.rejects(session.close(), /close failed/);
  assert.ok(session.browser);
  f.fail("");
  await session.close();
  assert.equal(session.browser, null);
  const closing = fixture(); closing.fail("pageClose");
  const closingSession = new closing.Session({ chromium: closing.chromium });
  await assert.rejects(closingSession.fetch("https://www.panini.es/shp_esp_es/a"), /page close failed/);
  await closingSession.close();
  assert.equal(closing.calls.closedBrowsers, 1);
});
