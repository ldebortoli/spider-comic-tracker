const assert = require("node:assert/strict");
const { test } = require("node:test");
const { EventEmitter } = require("node:events");
const http = require("node:http");
const https = require("node:https");
const catalog = require("../src/catalog");
const roster = require("../src/catalog-characters");
const marvel = require("../src/marvel");
const panini = require("../src/panini");
const universo = require("../src/universo-marvel");
const utils = require("../src/utils");

const baseUrl = "https://fixture.invalid";
const jsonResponse = (payload) => ({ ok: true, json: async () => payload });
const htmlResponse = (html) => ({ ok: true, text: async () => html });
const comicPage = (id, extra = {}) => ({ pageid: id, title: `Fixture Vol 1 ${id}`, categories: [{ title: "Category:Comics" }], ...extra });
const member = (id, appearanceType = "direct") => ({ pageId: id, pageTitle: `Fixture Vol 1 ${id}`, appearanceType });

function immediateRetries(t) {
  const realTimeout = global.setTimeout;
  t.mock.method(global, "setTimeout", (fn, _delay, ...args) => realTimeout(fn, 0, ...args));
}

// Fake only the transport boundary. Parsers, redirect handling, buffering,
// retry policy and import workers execute their normal production code.
function fakeHttp(t, handler) {
  const calls = [];
  function get(url, options, callback) {
    const address = String(url);
    calls.push(address);
    const request = new EventEmitter();
    request.setTimeout = (_ms, fn) => { request.expire = fn; return request; };
    request.destroy = (error) => request.emit("error", error);
    queueMicrotask(() => {
      const fixture = handler(address, calls.length, options);
      if (fixture.timeout) return request.expire();
      if (fixture.requestError) return request.emit("error", new Error(fixture.requestError));
      const response = new EventEmitter();
      response.statusCode = fixture.status ?? 200;
      response.headers = fixture.headers || {};
      response.resume = () => {};
      response.setEncoding = () => {};
      callback(response);
      if (fixture.responseError) response.emit("error", new Error(fixture.responseError));
      else {
        response.emit("data", Buffer.from(fixture.body || "", "latin1"));
        response.emit("end");
      }
    });
    return request;
  }
  t.mock.method(http, "get", get);
  t.mock.method(https, "get", get);
  return calls;
}

test("utilities normalize whole words, entities, dates, schedules and malformed JSON", () => {
  assert.equal(utils.normalizeText(), "");
  assert.equal(utils.normalizeText("Árbol & NiÑO"), "arbol and nino");
  assert.equal(utils.includesNormalized("Carnage", ""), false);
  assert.equal(utils.includesNormalized("Carnage returns", "Carn"), false);
  assert.equal(utils.includesNormalized("Árbol y niño", "ARBOL"), true);
  assert.equal(utils.parseHumanDate(), null);
  assert.equal(utils.toIsoDate("Foo 4, 2020"), null);
  assert.equal(utils.toIsoDate("January 4, 2020"), "2020-01-04");
  assert.equal(utils.decodeHtmlEntities("&#65;&#x42;&nbsp;&amp;&quot;&#39;&lt;&gt;"), "AB &\"'<>");
  assert.equal(utils.stripTags(), "");
  assert.equal(utils.sanitizeLine("<b>A</b>\n B"), "A B");
  assert.equal(utils.safeJsonParse("{", 7), 7);
  assert.deepEqual(utils.safeJsonParse('[1]', []), [1]);
  assert.deepEqual(utils.uniqueStrings(), []);
  assert.deepEqual(utils.uniqueStrings(["a", "", "a", "b"]), ["a", "b"]);
  assert.equal(utils.scheduleDayIndex(), 0);
  assert.equal(utils.scheduleDayIndex("SUNDAY"), 7);
  assert.equal(utils.buildWeekKey(2026, 3), "2026-W03");
  assert.ok(!Number.isNaN(Date.parse(utils.nowIso())));
  assert.deepEqual(utils.getIsoWeekInfo(new Date("2026-01-04T12:00:00Z"), "UTC"), {
    isoYear: 2026, weekNumber: 1, weekdayIndex: 7, localDayName: "SUNDAY", localHour: 12, localMinute: 0
  });
});

test("roster merges related categories without overriding manual identities", () => {
  assert.equal(roster.extractReality(), "");
  assert.equal(roster.extractReality("A (Multiverse)"), "Multiverse");
  assert.equal(roster.characterSlug("Á A (Earth-1)"), "a-a-earth-1");
  assert.equal(roster.symbioteDisplayName("Venom (Symbiote Hive) (Earth-616)"), "Venom");
  const result = roster.rosterFromCategories({ symbioteMembers: ["Bad", "Venom (Symbiote) (Earth-616)"], spiderMembers: ["Karn (Earth-001)", "Not a reality", "Peter Parker (Earth-616)", "A (Earth-2)", "A (Earth-2)"], webWarriorMembers: ["B (Multiverse)"] });
  assert.equal(result.filter((c) => c.fandomEntity === "Peter Parker (Earth-616)").length, 1);
  assert.equal(result.find((c) => c.fandomEntity === "Peter Parker (Earth-616)").source, "manual");
  assert.ok(result.some((c) => c.fandomEntity === "B (Multiverse)"));
  assert.equal(roster.rosterFromCategories({}).length, roster.manualSpiderRoster().length);
  assert.equal(roster.characterRecord({ displayName: "A", fandomEntity: "A", kind: "spider", source: "fixture" }).source, "fixture");
  const large = roster.rosterFromCategories({ symbioteMembers: Array.from({ length: 100 }, (_, i) => `S${i} (Symbiote) (Earth-1)`), spiderMembers: Array.from({ length: 100 }, (_, i) => `P${i} (Earth-2)`) });
  assert.equal(large.filter((item) => item.kind === "symbiote").length, 101);
  assert.equal(large.at(-1).kind, "symbiote");
});

test("catalog metadata tolerates absent/corrupt infoboxes and cleans wiki variants", () => {
  assert.deepEqual(catalog.extractAppearanceDetails(), {});
  assert.deepEqual(catalog.extractAppearanceDetails("[[A (Earth-1)]]\n[[A (Earth-1)]] {{photo}}\n[[A (Earth-1)]] {{dream}}\n[[B (Earth-2)]] {{video}}"), { "A (Earth-1)": "photo", "B (Earth-2)": "recording" });
  assert.equal(catalog.cleanWikiCreator(), "");
  assert.equal(catalog.cleanWikiCreator("{{Solo}} {{}} {{c|[[Writer|Alias]]}}<br/>B<ref/> <!-- x -->''C''"), "Solo {{}} Alias, B C");
  assert.deepEqual(catalog.extractWriters(), []);
  assert.deepEqual(catalog.extractWriters("| Writer2 = none\n| Writer3 = {{|}}\n| Writer4 = Writer"), ["Writer"]);
  assert.deepEqual(catalog.extractWriters("| Writer =\n| Writer2 = none\n| Writer4 = Writer"), ["Writer"]);
  assert.equal(catalog.extractReleaseDate({}, "| ReleaseDate =\n| Month = June\n| Year = 2020"), "2020-06-01");
  assert.equal(catalog.extractCoverFileName("| Image =\n| Writer = Writer"), "");
  assert.equal(catalog.extractCoverFileName(), "");
  assert.equal(catalog.extractCoverFileName("| Image ="), "");
  assert.equal(catalog.extractCoverFileName("| Image = File:Cover.jpg"), "Cover.jpg");
  assert.deepEqual(catalog.extractCharacterSection(), []);
  assert.deepEqual(catalog.extractCharacterSection("outside\n== Featured Characters ==\n* Hero\n== Antagonists ==\ntext\n* [[Enemy]]\n* {{ap|Other}}\n* Plain\n* unknown\n* <ref/>\n== Antagonists ==\n* Enemy\n== Notes ==", "Antagonists"), ["Enemy", "Other", "Plain"]);
  assert.deepEqual(catalog.extractDateMetadata({ pageprops: { infoboxes: "{" } }), { releaseDate: null, dateSource: "", datePrecision: "" });
  assert.equal(catalog.extractReleaseDate(undefined, "| ReleaseDate = February 2, 2020"), "2020-02-02");
  assert.equal(catalog.extractReleaseDate({ pageprops: { infoboxes: JSON.stringify({ nested: [null, "primitive", { source: "ReleaseDate", value: "March 3, 2020" }] }) } }), "2020-03-03");
  assert.equal(catalog.extractReleaseDate({ pageprops: { infoboxes: JSON.stringify([{ nested: [{ label: "missing" }, { source: "CoverDate", value: "April 2021" }] }]) } }), "2021-04-01");
  assert.equal(catalog.extractReleaseDate({}, "| Month = May\n| Day = 5\n| Year = 2022"), "2022-05-05");
  assert.equal(catalog.extractReleaseDate({ pageprops: { defaultsort: "20231301 20230230 20230301" } }), "2023-03-01");
  assert.equal(catalog.parseDefaultSortDate(), null);
  assert.equal(catalog.parseDefaultSortDate("20230230"), null);
  const fallback = catalog.parseCatalogPage({}, { pageId: 2, pageTitle: "Standalone_Title", appearanceType: "minor" }, `${baseUrl}/`);
  assert.equal(fallback.title, "Standalone Title");
  assert.equal(fallback.fandomPageId, 2);
  assert.equal(catalog.parseCatalogPage({ title: "Standalone #2" }, member(2), baseUrl).title, "Standalone #2");
  assert.equal(catalog.parseCatalogPage({}, { pageId: 1 }, baseUrl).title, "");
  assert.equal(catalog.mergeAppearanceMembers([member(1, "minor"), member(1)], []).length, 1);
});

test("catalog API pagination, cover selection and roster discovery use actual URL contracts", async (t) => {
  const progress = [];
  const calls = [];
  t.mock.method(global, "fetch", async (url) => {
    const p = new URL(url).searchParams;
    calls.push(p);
    if (p.get("prop") === "imageinfo") return jsonResponse({ query: { pages: [
      { title: "File:A", imageinfo: [{ thumburl: "thumb", url: "full" }] }, { title: "File:B", imageinfo: [{ url: "full-b" }] }, {}, { title: "File:C" }
    ] } });
    if (p.get("cmcontinue")) return jsonResponse({});
    return jsonResponse({ query: { categorymembers: [{ pageid: 3, title: "Fixture (Earth-1)" }] }, continue: { cmcontinue: "second" } });
  });
  assert.equal((await catalog.fetchCategoryMembers({ baseUrl: `${baseUrl}/`, categoryTitle: "Category:A", appearanceType: "minor", onProgress: (p) => progress.push(p) })).length, 1);
  assert.equal(progress.length, 2);
  assert.equal(calls[1].get("continue"), "-||");
  assert.equal((await catalog.fetchRawCategoryMembers({ baseUrl, categoryTitle: "Category:A" }))[0].pageId, 3);
  assert.equal((await catalog.fetchCharacterAppearanceMembers({ baseUrl, character: { fandomEntity: "Fixture" } }))[0].appearanceType, "direct");
  assert.ok((await catalog.discoverCatalogRoster({ baseUrl })).some((c) => c.fandomEntity === "Fixture (Earth-1)"));
  assert.equal((await catalog.fetchCoverImageUrls({ baseUrl, fileNames: [] })).size, 0);
  assert.deepEqual([...await catalog.fetchCoverImageUrls({ baseUrl, fileNames: ["A", "A", "B", ""] })], [["A", "thumb"], ["B", "full-b"]]);
  t.mock.method(global, "fetch", async () => jsonResponse({}));
  assert.equal((await catalog.fetchCoverImageUrls({ baseUrl, fileNames: ["A"] })).size, 0);
  assert.deepEqual(await catalog.fetchCatalogBatch({ baseUrl, members: [] }), { comics: [], processed: 0, skipped: 0 });
});

test("catalog retry reports HTTP/API failures and recovers, batches skip invalid pages", async (t) => {
  immediateRetries(t);
  const payloads = [{ ok: false, status: 503 }, jsonResponse({ error: { info: "info" } }), jsonResponse({ error: { code: "code" } }), jsonResponse({ error: {} }), jsonResponse({})];
  t.mock.method(global, "fetch", async () => payloads.shift());
  assert.deepEqual(await catalog.fetchCategoryMembers({ baseUrl, categoryTitle: "x" }), []);
  t.mock.method(global, "fetch", async (url) => new URL(url).searchParams.get("prop") === "imageinfo"
    ? jsonResponse({ query: { pages: [{ title: "File:Cover.jpg", imageinfo: [{ url: "cover" }] }] } })
    : jsonResponse({ query: { pages: [{ pageid: 999 }, { pageid: 2, missing: true }, { pageid: 3 }, { pageid: 4, categories: [{ title: "Other" }] }, comicPage(5, { revisions: [{ slots: { main: { content: "| Image = Cover.jpg" } } }] }), comicPage(6, { revisions: [{ slots: { main: { content: "| Image = Absent.jpg" } } }] })] } }));
  const result = await catalog.fetchCatalogBatch({ baseUrl, members: [2, 3, 4, 5, 6].map((n) => member(n)) });
  assert.equal(result.skipped, 4);
  assert.equal(result.comics[0].coverImageUrl, "cover");
  assert.equal(result.comics[1].coverImageUrl, "");
  t.mock.method(global, "fetch", async () => { throw new Error("offline"); });
  await assert.rejects(catalog.fetchRawCategoryMembers({ baseUrl, categoryTitle: "x" }), /offline/);
});

test("Spider-Man import workers count successful pages and isolate batch/callback failures", async (t) => {
  immediateRetries(t);
  const updates = [];
  t.mock.method(global, "fetch", async (url) => {
    const p = new URL(url).searchParams;
    if (p.has("cmtitle")) return jsonResponse({ query: { categorymembers: p.get("cmtitle").includes("Minor") ? [] : Array.from({ length: 21 }, (_, i) => ({ pageid: i + 1, title: `Fixture ${i}` })) } });
    const ids = p.get("pageids").split("|").map(Number);
    if (ids[0] === 11) throw new Error("batch offline");
    return jsonResponse({ query: { pages: ids.map((id) => comicPage(id)) } });
  });
  const imported = [];
  const result = await catalog.importSpiderManCatalog({ baseUrl, onItems: (items) => imported.push(...items), onProgress: (p) => updates.push(p), concurrency: 9 });
  assert.equal(result.stage, "completed_with_errors");
  assert.equal(result.completedBatches, 3);
  assert.equal(result.importedComics, 11);
  assert.equal(result.errors[0].batch, 2);
  assert.equal(imported.length, 11);
  assert.ok(updates.some((u) => u.stage === "discovering"));
  t.mock.method(global, "fetch", async (url) => new URL(url).searchParams.has("cmtitle") ? jsonResponse({ query: { categorymembers: [{ pageid: 1, title: "A" }] } }) : jsonResponse({ query: { pages: [comicPage(1)] } }));
  assert.equal((await catalog.importSpiderManCatalog({ baseUrl })).stage, "completed");
  assert.equal((await catalog.importSpiderManCatalog({ baseUrl, concurrency: 0, onItems: () => { throw new Error("persist"); } })).errors[0].message, "persist");
  t.mock.method(global, "fetch", async () => jsonResponse({}));
  assert.equal((await catalog.importSpiderManCatalog({ baseUrl })).totalBatches, 0);
});

test("character import deduplicates, skips existing, preserves minor details and records failures", async (t) => {
  immediateRetries(t);
  const chars = ["A", "B", "Bad"].map((name) => ({ slug: name, displayName: name, fandomEntity: `${name} (Earth-1)` }));
  t.mock.method(global, "fetch", async (url) => {
    const p = new URL(url).searchParams;
    const title = p.get("cmtitle");
    if (title?.includes("Bad")) throw new Error("discovery");
    if (title) return jsonResponse({ query: { categorymembers: title.includes("Minor") ? [{ pageid: 2, title: "Fixture2" }, { pageid: 3, title: "Fixture3" }] : [{ pageid: 1, title: "Fixture1" }] } });
    return jsonResponse({ query: { pages: p.get("pageids").split("|").map((id) => comicPage(Number(id), { revisions: [{ slots: { main: { content: "[[A (Earth-1)]] {{Flashback}}" } } }] })) } });
  });
  const linked = [];
  const result = await catalog.importCharacterCatalogs({ baseUrl, characters: chars, refreshExisting: false, hasIssue: (id) => id === 1, onItems: (items) => assert.equal(items.length, 2), onCharacterMembers: (character, members) => {
    linked.push(members);
    if (character.slug === "B") throw new Error("linking");
    return { linked: members.length };
  }, onProgress: (p) => assert.ok(p.stage), concurrency: 9 });
  assert.equal(result.existingSkipped, 1);
  assert.equal(result.totalDiscovered, 3);
  assert.equal(result.characterResults[0].linked, 3);
  assert.equal(linked[0][1].appearanceDetail, "flashback");
  assert.equal(linked[1][1].appearanceDetail, "");
  assert.deepEqual(result.errors.map((e) => e.stage), ["discovery", "linking"]);
  const simple = await catalog.importCharacterCatalogs({ baseUrl, characters: chars.slice(0, 1), concurrency: 0 });
  assert.equal(simple.stage, "completed");
  const failed = await catalog.importCharacterCatalogs({ baseUrl, characters: chars.slice(0, 1), onItems: () => { throw new Error("metadata"); } });
  assert.equal(failed.errors[0].stage, "metadata");
  assert.equal((await catalog.importCharacterCatalogs({ baseUrl, characters: [], refreshExisting: false })).totalBatches, 0);
});

test("Marvel originality and matching cover the full classification decision tree", () => {
  const empty = { title: "Ordinary", featuredCharacters: [], supportingCharacters: [], antagonists: [], otherCharacters: [] };
  const character = { displayName: "Hero", fandomEntity: "Hero (Earth-1)", active: true, aliases: ["", "Hero", "Hero"] };
  assert.equal(marvel.classifyComic(empty, [{ ...character, active: false }]).decision, "auto_rejected");
  const weak = marvel.classifyComic({ ...empty, supportingCharacters: ["Hero"], antagonists: ["Hero"], otherCharacters: ["Hero"], synopsis: "Hero", pages: 120, appearanceCategories: [{ fandomEntity: character.fandomEntity, appearanceType: "minor" }] }, [character]);
  assert.equal(weak.decision, "pending_review");
  assert.equal(weak.matches.length, 5);
  const strong = marvel.classifyComic({ ...empty, title: "Hero #1", pages: 120 }, [character]);
  assert.equal(strong.decision, "pending_review");
  assert.equal(strong.matches.length, 1);
  assert.equal(marvel.classifyComic({ ...empty, title: "Hero #1", featuredCharacters: ["Hero"] }, [character]).decision, "auto_added");
  assert.deepEqual(marvel.buildCharacterRows({ ...empty, featuredCharacters: ["Hero"], supportingCharacters: ["B"], antagonists: ["C"], otherCharacters: ["D"] }, { matches: [{ section: "featured", alias: "Hero" }, { section: "featured", alias: "B" }] }).map((r) => r.isMatch), [true, false, false, false]);
  assert.equal(marvel.buildCharacterRows({ ...empty, featuredCharacters: ["Hero"] }, {})[0].isMatch, false);
  for (const details of [{ title: "Omnibus" }, { isbn: "x" }, { pages: 80 }, { sourceHtml: "reprinting stories" }, { sourceHtml: "collects stories" }]) assert.equal(marvel.shouldFetchVolumeMetadata(details), true);
  assert.equal(marvel.shouldFetchVolumeMetadata({ pages: 20 }), false);
  for (const details of [{ sourceHtml: "re-presented in its original form" }, { sourceHtml: "original credits are italicized" }, { title: "Epic Collection Masterworks Gallery Edition Complete Collection Treasury Edition" }, { volumeType: "TPB Edition" }, { volumeSourceHtml: "This volume is a TPB edition" }, { volumeSourceHtml: "Trade Paperbacks" }, { volumeSourceHtml: "Type: Reprint Series" }, { volumeSourceHtml: "Type: TPB Edition" }]) assert.equal(marvel.evaluateOriginality(details).status, "reprint");
  assert.equal(marvel.evaluateOriginality({ sourceHtml: "collecting stories" }).status, "uncertain");
  assert.equal(marvel.evaluateOriginality({ isbn: "x", pages: 80 }).status, "uncertain");
  assert.equal(marvel.evaluateOriginality({ pages: 120 }).status, "uncertain");
  assert.equal(marvel.evaluateOriginality({}).status, "new");
  assert.equal(marvel.deriveVolumeInfo({ pageTitle: "Fallback", title: "Title (Vol. 2) #3", fandomUrl: "https://fixture.invalid/wiki/A" }).volumeNumber, 2);
  assert.equal(marvel.deriveVolumeInfo({ title: "Title #Alpha" }).issueNumber, null);
  assert.equal(marvel.deriveVolumeInfo({ pageTitle: "Title Volume 2 Alpha", title: "Title #7" }).issueNumber, 7);
  assert.equal(marvel.deriveVolumeInfo({ pageTitle: "Title", title: "" }).seriesName, "Title");
  assert.equal(marvel.deriveVolumeInfo({}).volumePageTitle, "");
  assert.deepEqual(marvel.parseAppearanceCategories(), []);
  assert.equal(marvel.parseAppearanceCategories([null, "Category:A/Appearances", "Category:B/Minor Appearances", { title: "Other" }]).length, 2);
});

test("Marvel article parsing handles missing labels, boundary sections and title fallbacks", () => {
  const dated = "<div>Release Date</div><div>January 1, 2026</div>";
  assert.throws(() => marvel.parseComicArticleHtml("Missing", "", baseUrl), /fecha/);
  assert.throws(() => marvel.parseComicArticleHtml("Missing", "<div>Release Date</div><div>Featured Characters</div>", baseUrl), /fecha/);
  assert.throws(() => marvel.parseComicArticleHtml("Missing", "<div>Release Date</div>", baseUrl), /fecha/);
  const parsed = marvel.parseComicArticleHtml(undefined, `<script>#99</script><style>#77</style><div>Part of #1</div><div>LGY: #2</div>${dated}<div>Pages</div><div>32 pages</div><div>ISBN</div><div>abc</div><div>Featured Characters</div><div>prose</div><ul><li>Hero (mentioned)</li><li></li></ul><div>Supporting Characters</div><ul><li>Support</li></ul><div>Solicit Synopsis</div><p>First</p><ul><li>Second</li></ul><div>See Also</div>`, baseUrl);
  assert.equal(parsed.title, "");
  assert.equal(parsed.pages, 32);
  assert.equal(parsed.synopsis, "First Second");
  assert.deepEqual(parsed.featuredCharacters, ["Hero"]);
  const unnumbered = marvel.parseComicArticleHtml("Fallback_Title", `${dated}<div>Pages</div><div>n/a</div>`, baseUrl);
  assert.equal(unnumbered.title, "Fallback Title");
  assert.equal(unnumbered.pages, null);
  for (const title of ["Infinity Comic", "Omnibus", "Epic Collection"]) assert.equal(marvel.parseComicArticleHtml("Fixture", `<div>${title}</div>${dated}`, baseUrl).title, title);
});

test("Marvel render fallback preserves network and invalid parse diagnostics", async (t) => {
  immediateRetries(t);
  assert.equal(await marvel.fetchRenderedPageHtml({ baseUrl, pageTitle: "A", fetchImpl: async () => htmlResponse("html") }), "html");
  let calls = 0;
  assert.equal(await marvel.fetchRenderedPageHtml({ baseUrl, pageTitle: "A", fetchImpl: async () => {
    calls += 1;
    if (calls === 1) throw new Error("socket");
    return htmlResponse("retry");
  } }), "retry");
  for (const status of [403, 408, 425, 429, 503, 404]) {
    let attempts = 0;
    await assert.rejects(marvel.fetchRenderedPageHtml({ baseUrl, pageTitle: "A", retryDelayMs: 0, fetchImpl: async (url) => {
      if (String(url).includes("action=render")) { attempts += 1; return { ok: false, status }; }
      return jsonResponse({});
    } }), /API no devolvió HTML/);
    assert.equal(attempts, status === 404 ? 1 : 3);
  }
  await assert.rejects(marvel.fetchRenderedPageHtml({ baseUrl, pageTitle: "A", fetchImpl: async () => { throw new Error("offline"); } }), /action=render.*offline.*action=parse.*offline/);
});

test("Marvel week, appearance and volume requests support pagination and optional metadata failures", async (t) => {
  immediateRetries(t);
  let withVolume = true;
  let failVolume = false;
  let volumeHtml = "<div>Type</div><div>Reprint Series</div><div>Notes</div><p>Volume notes</p><div>Categories</div>";
  t.mock.method(global, "fetch", async (url) => {
    const address = new URL(url);
    const p = address.searchParams;
    if (p.get("list") === "categorymembers") return jsonResponse({ query: { categorymembers: [{ ns: 0, title: "A" }, { ns: 14, title: "Other" }] } });
    if (p.get("prop") === "categories") return p.has("clcontinue") ? jsonResponse({}) : jsonResponse({ query: { pages: [{ categories: [{ title: "Category:A/Appearances" }] }] }, continue: { clcontinue: "next" } });
    if (decodeURIComponent(address.pathname).endsWith("Fixture_Vol_1_1")) return htmlResponse(`<div>Fixture #1</div><div>Release Date</div><div>January 1, 2026</div>${withVolume ? "<div>ISBN</div><div>978-x</div>" : ""}`);
    if (failVolume) return { ok: false, status: 404 };
    return htmlResponse(volumeHtml);
  });
  assert.equal((await marvel.fetchWeekReleases({ baseUrl, weekYear: 2026, weekNumber: 1 })).members.length, 1);
  assert.equal((await marvel.fetchComicAppearanceCategories({ baseUrl, pageTitle: "A" })).length, 1);
  let details = await marvel.fetchComicDetails({ baseUrl, pageTitle: "Fixture Vol 1 1" });
  assert.equal(details.volumeType, "Reprint Series");
  assert.equal(details.volumeNotes, "Volume notes");
  for (const html of ["", "<div>Notes</div><p>One</p><div>Languages</div>", "<div>Notes</div><p>One</p><div>See Also</div>", "<div>Notes</div><p>One</p>"]) {
    volumeHtml = html;
    const d = await marvel.fetchComicDetails({ baseUrl, pageTitle: "Fixture Vol 1 1" });
    assert.equal(d.volumeNotes, html ? "One" : "");
    assert.equal(d.volumeType, "");
  }
  failVolume = true;
  assert.equal((await marvel.fetchComicDetails({ baseUrl, pageTitle: "Fixture Vol 1 1" })).volumeType, "");
  withVolume = false;
  assert.equal((await marvel.fetchComicDetails({ baseUrl, pageTitle: "Fixture Vol 1 1" })).volumeSourceHtml, "");
  t.mock.method(global, "fetch", async () => jsonResponse({}));
  assert.deepEqual((await marvel.fetchWeekReleases({ baseUrl, weekYear: 2026, weekNumber: 1 })).members, []);
});

test("Panini parsers preserve metadata fallback, deduplicate links and reject invalid dates", () => {
  assert.equal(panini.parseSpanishDate(), "");
  assert.equal(panini.parseSpanishDate("1 nonsense 2020"), "");
  assert.equal(panini.parseSpanishDate("1 enero 2020"), "2020-01-01");
  assert.equal(panini.sourceKeyFromUrl("A Broken Path"), "a-broken-path");
  assert.equal(panini.sourceKeyFromUrl(), "");
  assert.equal(panini.parseListingPage().totalPages, 1);
  const listing = panini.parseListingPage('<a class="product-item-link" href="http://[">bad</a><a class="product-item-link" href="a.html">A</a><a class="product-item-link" href="a.html">again</a>');
  assert.equal(listing.items.length, 1);
  assert.equal(listing.totalCount, 1);
  assert.equal(panini.parseProductPage('<meta content="Meta title" property="og:title">', "https://fixture.invalid/p.html").title, "Meta title");
  const product = panini.parseProductPage('<li class="item pnn_issn"><strong class="label">ISSN:</strong><span class="data">issn</span></li><li class="item pnn_binding"><strong class="label">Tipo:</strong><span class="data">Grapa</span></li>', "https://fixture.invalid/p.html", "Fallback");
  assert.equal(product.title, "Fallback");
  assert.equal(product.isbn, "issn");
  assert.equal(product.formatLabel, "Grapa");
  assert.equal(panini.parseProductPage(undefined, "invalid").title, "");
  assert.equal(panini.parseProductPage('<li class="item pnn_isbn"><strong class="label">ISBN:</strong><span class="data">isbn</span></li>', "invalid").isbn, "isbn");
  assert.deepEqual(panini.expandIssueNumbers(), []);
  assert.deepEqual(panini.expandIssueNumbers("9-1, 1-400, 1900, 2100, 2101, #0"), [2101, 0]);
});

test("Panini issue matching resolves volume hints, ambiguity, dates and partial matches", () => {
  const row = (id, volume_number, issue_number, release_date = "2020-01-01", series_name = "Hero") => ({ id, volume_number, issue_number, release_date, series_name });
  assert.deepEqual(panini.matchContainsToCatalog(undefined).issueIds, []);
  assert.deepEqual(panini.matchContainsToCatalog("Hero 1", [row(1, 1, 1), row(2, 2, 1)]).issueIds, []);
  assert.deepEqual(panini.matchContainsToCatalog("Hero 1-2", [row(1, 1, 1), row(2, 2, 1), row(3, 2, 2)]).issueIds, [2, 3]);
  assert.deepEqual(panini.matchContainsToCatalog("Hero 1", [row(1, 1, 1, "2022-01-01"), row(2, 2, 1, "2019-01-01")], "2020-01-01").issueIds, [2]);
  assert.deepEqual(panini.matchContainsToCatalog("Hero 1", [row(1, 1, 1, "2019-01-01"), row(2, 2, 1, "2022-01-01")], "2020-01-01").issueIds, [1]);
  assert.deepEqual(panini.matchContainsToCatalog("Hero 1", [row(1, 1, 1, "2022-01-01"), row(2, 2, 1, "2019-01-01")]).issueIds, [1]);
  assert.deepEqual(panini.matchContainsToCatalog("Hero (2019) 1", [row(1, 1, 1, "2022-01-01"), row(2, 2, 1, "2019-01-01")]).issueIds, [2]);
  assert.deepEqual(panini.matchContainsToCatalog("Hero vol.9 1", [row(1, 1, 1)]).unresolved, ["Hero: 1"]);
  assert.deepEqual(panini.matchContainsToCatalog("Hero 1, 2", [row(1, null, 1, "")]).unresolved, ["Hero: 2"]);
  assert.deepEqual(panini.matchContainsToCatalog("Hero text", [row(1, undefined, 1)]).issueIds, []);
  assert.deepEqual(panini.matchContainsToCatalog("Hero 1", [{ ...row(1, 1, 1), series_name: undefined, seriesName: "Hero" }, row(2, 1, 2, "", ""), row(3, 1, 1, "2020-01-01", "Amazing Hero")]).issueIds, [1]);
  assert.deepEqual(panini.matchContainsToCatalog("Hero Special 1", [row(1, 1, 1), row(2, 1, 1, "2020-01-01", "Hero Special"), row(3, 1, 1, "2020-01-01", "&")]).issueIds, [2]);
  assert.deepEqual(panini.matchContainsToCatalog("Hero (2020) 1", [row(1, 1, 1, "unknown")]).issueIds, [1]);
});

test("Panini HTTP transport follows redirects, surfaces errors and retries failures", async (t) => {
  immediateRetries(t);
  let mode = "redirect";
  let count = 0;
  const calls = fakeHttp(t, (url) => {
    count += 1;
    if (mode === "redirect" && url.endsWith("/a")) return { status: 302, headers: { location: "/b" } };
    if (mode === "queue") return { status: 302, headers: { location: "https://queue-it.net/wait" } };
    if (mode === "bad") return { status: 404 };
    if (mode === "forbidden") return { status: 403 };
    if (mode === "timeout") return { timeout: true };
    if (mode === "response") return { responseError: "stream" };
    if (mode === "retry" && count === 1) return { requestError: "socket" };
    return { body: "hello" };
  });
  assert.equal(await panini.fetchTextWithRetry("http://fixture.invalid/a"), "hello");
  assert.ok(calls[1].endsWith("/b"));
  mode = "queue"; await assert.rejects(panini.fetchTextWithRetry("https://fixture.invalid/a", { attempts: 1 }), /sala de espera/);
  mode = "bad"; await assert.rejects(panini.fetchTextWithRetry("https://fixture.invalid/a", { attempts: 1 }), /HTTP 404/);
  mode = "forbidden"; const beforeForbidden = count;
  await assert.rejects(panini.fetchTextWithRetry("https://fixture.invalid/a"), /HTTP 403/);
  assert.equal(count - beforeForbidden, 1);
  mode = "timeout"; await assert.rejects(panini.fetchTextWithRetry("https://fixture.invalid/a", { attempts: 1, timeoutMs: 1 }), /tiempo/);
  mode = "response"; await assert.rejects(panini.fetchTextWithRetry("https://fixture.invalid/a", { attempts: 1 }), /stream/);
  mode = "retry"; count = 0; assert.equal(await panini.fetchTextWithRetry("https://fixture.invalid/a", { attempts: 2 }), "hello");
  assert.equal(count, 2);
  await assert.rejects(panini.fetchTextWithRetry("https://fixture.invalid/a", { attempts: 0 }), (e) => e === undefined);
});

test("Panini import scans incrementally, retries pending products and counts each outcome", async (t) => {
  immediateRetries(t);
  const listing = (names, total = names.length) => `<span class="toolbar-number">${total}</span>${names.map((name) => `<a class="product-item-link" href="https://fixture.invalid/${name}.html">${name}</a>`).join("")}`;
  const updates = [];
  const calls = fakeHttp(t, (url) => {
    const u = new URL(url);
    if (u.pathname === "/listing") return { body: listing(["matched", "contains", "match", "neutral", "bad"], 10) };
    if (u.pathname === "/bad.html") return { status: 500 };
    return { body: "" };
  });
  const result = await panini.importPaniniCatalog({ listingUrl: "https://fixture.invalid/listing?p=9", concurrency: 9, pendingProducts: [{ productUrl: "https://fixture.invalid/extra.html", title: "extra" }, {}], onProduct: (p) => ({ status: p.errorMessage ? "failed" : ({ matched: "matched", contains: "pending_contains", match: "pending_match" })[p.title] }), onProgress: (p) => updates.push(p) });
  assert.equal(result.stage, "completed_with_errors");
  assert.equal(result.scannedPages, 2);
  assert.equal(result.processedProducts, 6);
  assert.equal(result.matchedProducts, 1);
  assert.equal(result.pendingContains, 1);
  assert.equal(result.pendingMatch, 1);
  assert.ok(calls[0].includes("product_list_limit=36"));
  assert.ok(!new URL(calls[0]).searchParams.has("p"));
  assert.ok(updates.some((p) => p.stage === "discovering_panini"));
  t.mock.restoreAll();
  fakeHttp(t, (url) => ({ body: listing(["known"], 5) }));
  const incremental = await panini.importPaniniCatalog({ listingUrl: "https://fixture.invalid/listing", knownUrls: new Set(["https://fixture.invalid/known.html"]), pendingProducts: null });
  assert.equal(incremental.scannedPages, 2);
  assert.equal(incremental.queuedProducts, 0);
  t.mock.restoreAll();
  fakeHttp(t, () => ({ body: listing(["a"]) }));
  assert.equal((await panini.importPaniniCatalog({ full: true, concurrency: 0 })).stage, "completed");
  t.mock.restoreAll();
  fakeHttp(t, () => ({ body: "" }));
  assert.equal((await panini.importPaniniCatalog()).queuedProducts, 0);
  assert.equal((await panini.importPaniniCatalog({ listingUrl: "" })).queuedProducts, 0);
});

test("Panini reuses and closes a normal browser session when the direct download requires JavaScript", async (t) => {
  immediateRetries(t);
  const calls = fakeHttp(t, () => ({ status: 302, headers: { location: 'https://panini.queue-it.net/wait' } }));
  const seen = [];
  let closed = 0;
  const browserSession = {
    active: false,
    fetch: async url => {
      browserSession.active = true;
      seen.push(url);
      return url.includes('/comics/') ? '<a class="product-item-link" href="https://www.panini.es/shp_esp_es/hero.html">Hero</a>' : '<h1><span class="base">Hero</span></h1>';
    },
    close: async () => { closed++; }
  };
  const result = await panini.importPaniniCatalog({ browserSession, onProduct: () => ({ status: 'matched' }) });
  assert.equal(result.matchedProducts, 1);
  assert.equal(result.errors.length, 0);
  assert.equal(calls.length, 1);
  assert.equal(seen.length, 2);
  assert.equal(closed, 1);
  browserSession.active = false;
  browserSession.fetch = async () => { throw Error('browser unavailable'); };
  await assert.rejects(panini.importPaniniCatalog({ browserSession }), /browser unavailable/);
  assert.equal(closed, 2);
});

test("Universo parsers filter malformed links, foreign indexes and fallback artwork", () => {
  assert.deepEqual(universo.parseDirectory(), []);
  const dir = universo.parseDirectory('<option value="">blank</option><option value="plain">bad</option><option value="b.html">B</option><option value="a.html">A</option><option value="esp/a.html">Venom</option><option value="esp/a.html">Venom</option>');
  assert.equal(dir.length, 3);
  assert.equal(dir[0].priority, 10);
  assert.equal(dir[1].title, "A");
  const links = universo.parseIndexLinks('<a href="http://[">bad</a><a href="https://other.invalid/esp/a.html">foreign</a><a href="a.pdf">pdf</a><a href="root.html">self</a><a href="root_1.html">nested</a><a href="root_1.html">duplicate</a><a href="esp/x.html">X</a>', `${universo.BASE_URL}root.html`, "root");
  assert.equal(links.products.length, 1);
  assert.equal(links.nestedIndexes.length, 1);
  assert.equal(universo.parseIndexLinks(undefined, universo.BASE_URL, "root").products.length, 0);
  assert.equal(universo.parseSpanishMonthYear(""), "");
  assert.equal(universo.parseSpanishMonthYear("Nonsense 2020"), "");
  assert.equal(universo.parseSpanishMonthYear("Enero 2020"), "2020-01-01");
  const empty = universo.parseUniversoMarvelProduct(undefined, `${universo.BASE_URL}esp/x.html`);
  assert.equal(empty.title, "");
  assert.equal(empty.pages, null);
  assert.equal(universo.parseUniversoMarvelProduct('', `${universo.BASE_URL}esp/x.html`, "Fallback").title, "Fallback");
  assert.equal(universo.parseUniversoMarvelProduct('<img src="../usa/portadas/a.jpg">', `${universo.BASE_URL}esp/x.html`).coverImageUrl, "");
  assert.match(universo.parseUniversoMarvelProduct("<a onClick=\"MM_openBrWindow('portadas/a.jpg')\"></a><!-- Contenido USA --><li> </td></body>", `${universo.BASE_URL}esp/x.html`).coverImageUrl, /portadas\/a.jpg$/);
});

test("Universo discovery ignores unpublished anchors inside HTML comments", () => {
  const html = '<td><!--<a href="esp/not-published.html">-->1</a></td>'
    + '<td><a href="esp/published.html">2</a></td><!--<a href="root_future.html">future</a>-->';
  const parsed = universo.parseIndexLinks(html, `${universo.BASE_URL}root.html`, "root");
  assert.deepEqual(parsed.products.map(item => item.sourceKey), ["um-published"]);
  assert.deepEqual(parsed.nestedIndexes, []);
  assert.deepEqual(universo.parseDirectory('<!--<option value="esp/future.html">Future</option>--><option value="esp/live.html">Live</option>').map(item => item.title), ["Live"]);
});

test("Universo retries transient failures and never retries a definitive missing page", async (t) => {
  immediateRetries(t);
  let transient = true;
  let failure = 0;
  const calls = fakeHttp(t, () => {
    failure += 1;
    if (transient && failure === 1) return { timeout: true };
    if (!transient) return { status: 404 };
    return { body: '<title>Recovered</title>' };
  });
  assert.match(await universo.fetchPage(`${universo.BASE_URL}esp/recover.html`), /Recovered/);
  assert.equal(calls.length, 2);
  transient = false;
  const before = calls.length;
  await assert.rejects(universo.fetchPage(`${universo.BASE_URL}esp/missing.html`), /HTTP 404/);
  assert.equal(calls.length - before, 1);
});

test("Universo transport handles redirects, windows encoding and all network errors", async (t) => {
  immediateRetries(t);
  let mode = "redirect";
  fakeHttp(t, (url) => {
    if (mode === "redirect" && url.endsWith("/a")) return { status: 302, headers: { location: "/b" } };
    if (mode === "error") return { status: 404 };
    if (mode === "timeout") return { timeout: true };
    if (mode === "stream") return { responseError: "stream" };
    if (mode === "request") return { requestError: "socket" };
    return { body: "Espa\xf1a" };
  });
  assert.equal(await universo.fetchPage("http://fixture.invalid/a"), "España");
  mode = "error"; await assert.rejects(universo.fetchPage("https://fixture.invalid/a"), /HTTP 404/);
  mode = "timeout"; await assert.rejects(universo.fetchPage("https://fixture.invalid/a"), /tiempo/);
  mode = "stream"; await assert.rejects(universo.fetchPage("https://fixture.invalid/a"), /stream/);
  mode = "request"; await assert.rejects(universo.fetchPage("https://fixture.invalid/a"), /socket/);
});

test("Universo collection traversal deduplicates indexes and caps recursive discovery", async (t) => {
  fakeHttp(t, (url) => {
    const stem = new URL(url).pathname.match(/root_(\d+)/)?.[1];
    const n = Number(stem || 0);
    return { body: `<a href="root_${n + 1}.html">next</a><a href="root_1.html">first</a><a href="esp/product${n}.html">P</a>` };
  });
  const products = await universo.discoverCollection({ url: `${universo.BASE_URL}root.html`, priority: 10 });
  assert.equal(products.length, 12);
  assert.equal(products[0].priority, 10);
  t.mock.restoreAll();
  const calls = fakeHttp(t, (url) => ({ body: url.endsWith("root.html")
    ? '<a href="root_1.html">1</a><a href="root_2.html">2</a>'
    : /root_[12]\.html$/.test(url) ? '<a href="root_3.html">3</a>' : '<a href="esp/final.html">Final</a>' }));
  assert.equal((await universo.discoverCollection({ url: `${universo.BASE_URL}root.html`, priority: 0 })).length, 1);
  assert.equal(calls.filter((url) => url.endsWith("root_3.html")).length, 1);
});

test("Universo import rotates indexes, preserves pending failures and resolves missing products", async (t) => {
  immediateRetries(t);
  const states = new Map();
  const queued = [];
  const resolved = [];
  let requeues = 0;
  let directory = '<option value="root.html">Spider</option><option value="bad.html">Bad</option><option value="esp/direct.html">Direct</option>';
  fakeHttp(t, (url) => {
    if (url.endsWith("panini.html")) return { body: directory };
    if (url.endsWith("bad.html")) return { status: 500 };
    if (url.endsWith("missing.html")) return { status: 404 };
    if (url.endsWith("error.html")) return { status: 503 };
    if (url.endsWith("root.html")) return { body: '<a href="esp/one.html">One</a>' };
    return { body: "" };
  });
  let pending = [{ id: 1, productUrl: `${universo.BASE_URL}esp/matched.html`, title: "matched" }, { id: 2, productUrl: `${universo.BASE_URL}esp/other.html` }, { id: 3, productUrl: `${universo.BASE_URL}esp/missing.html` }, { id: 4, productUrl: `${universo.BASE_URL}esp/error.html` }];
  const db = {
    discardCommentedSpanishSourceProducts: () => 0,
    getState: (key, fallback) => states.has(key) ? states.get(key) : fallback,
    setState: (key, value) => states.set(key, value),
    requeueSpanishSourceProducts: () => { requeues += 1; },
    queueSpanishSourceProducts: (source, products) => queued.push({ source, products }),
    listPendingSpanishSourceProducts: () => pending,
    processPaniniProduct: (p) => ({ status: p.title === "matched" ? "matched" : "pending_match" }),
    resolveSpanishSourceQueueItem: (id, error) => resolved.push({ id, error }),
    getSpanishSourceQueueStats: () => ({ pending: 1 })
  };
  const progress = [];
  const result = await universo.importUniversoMarvelCatalog({ db, onProgress: (p) => progress.push(p), concurrency: 9 });
  assert.equal(result.scannedIndexes, 2);
  assert.equal(result.discoveredFromIndexes, 1);
  assert.equal(result.processed, 2);
  assert.equal(result.matched, 1);
  assert.equal(result.pendingMatch, 1);
  assert.equal(result.errors.length, 3);
  assert.equal(result.discardedUnpublished, 0);
  assert.match(resolved.find((p) => p.id === 3).error, /HTTP 404/);
  assert.match(resolved.find((p) => p.id === 4).error, /HTTP 503/);
  assert.ok(progress.some((p) => p.warning));
  assert.equal(requeues, 1);
  pending = [];
  directory = "";
  states.set("universo_marvel_index_cursor", "");
  assert.equal((await universo.importUniversoMarvelCatalog({ db, concurrency: 0 })).queued, 0);
  assert.equal(requeues, 1);
  assert.ok(queued.some((q) => q.products.some((p) => p.sourceKey === "um-direct")));
});
