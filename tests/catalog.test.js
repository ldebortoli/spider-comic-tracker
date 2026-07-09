const assert = require("node:assert/strict");

const {
  extractWriters,
  extractAppearanceDetails,
  extractDateMetadata,
  mergeAppearanceMembers,
  parseCatalogPage,
  extractCoverFileName,
  parseDefaultSortDate
} = require("../src/catalog");
const { ComicDatabase } = require("../src/database");
const { characterRecord, manualSpiderRoster } = require("../src/catalog-characters");

function parseCatalogPageTest() {
  const infoboxes = [{
    data: [{
      type: "data",
      data: {
        value: "<a>June 5, 1962</a>",
        source: "ReleaseDate"
      }
    }]
  }];
  const page = {
    pageid: 6011,
    title: "Amazing Fantasy Vol 1 15",
    pageprops: {
      defaultsort: "&nbsp;1962-08  19620605 Amazing Fantasy",
      infoboxes: JSON.stringify(infoboxes)
    },
    thumbnail: {
      source: "https://example.test/cover.jpg"
    },
    revisions: [{
      slots: {
        main: {
          content: [
            "| Writer1_1 = [[Stan Lee]]",
            "| Writer1_2 = [[Steve Ditko|S. Ditko]]",
            "| Writer2_1 = Stan Lee",
            "'''Antagonists:'''",
            "* [[Burglar (Earth-616)|Burglar]]",
            "'''Other Characters:'''",
            "* [[May Reilly (Earth-616)|Aunt May]]"
          ].join("\n")
        }
      }
    }]
  };
  const result = parseCatalogPage(page, {
    pageId: 6011,
    pageTitle: page.title,
    appearanceType: "direct"
  }, "https://marvel.fandom.com");

  assert.equal(result.title, "Amazing Fantasy (Vol. 1) #15");
  assert.equal(result.releaseDate, "1962-06-05");
  assert.equal(result.dateSource, "release");
  assert.equal(result.datePrecision, "day");
  assert.equal(result.seriesName, "Amazing Fantasy");
  assert.deepEqual(result.writers, ["Stan Lee", "S. Ditko"]);
  assert.deepEqual(result.antagonists, ["Burglar"]);
}

function coverDateFallbackTest() {
  const infoboxes = [{
    data: [{
      type: "data",
      data: {
        label: "Cover Date",
        value: "<a>November</a>, <a>1994</a>",
        source: null
      }
    }]
  }];
  const page = {
    pageprops: {
      defaultsort: "&nbsp;1994-11  Amazing Spider-Man",
      infoboxes: JSON.stringify(infoboxes)
    }
  };
  const result = extractDateMetadata(page, "| ReleaseDate =\n| Month = November\n| Year = 1994");

  assert.deepEqual(result, {
    releaseDate: "1994-11-01",
    dateSource: "cover",
    datePrecision: "month"
  });
  assert.deepEqual(extractDateMetadata({ pageprops: {} }, ""), {
    releaseDate: null,
    dateSource: "",
    datePrecision: ""
  });
  assert.deepEqual(extractDateMetadata({ pageprops: {} }, "| Year = 1990"), {
    releaseDate: "1990-01-01",
    dateSource: "cover",
    datePrecision: "year"
  });
}

function relatedCharactersSeedTest() {
  const entities = new Set(manualSpiderRoster().map((character) => character.fandomEntity));

  for (const entity of [
    "Felicia Hardy (Earth-616)",
    "Knull (Earth-616)",
    "Mary Jane Watson (Earth-616)",
    "Gwendolyne Stacy (Earth-616)",
    "Bailey Briggs (Earth-616)"
  ]) {
    assert.ok(entities.has(entity), `${entity} deberia estar en el roster`);
  }
}

function unifiedSuggestionCharactersTest() {
  const db = new ComicDatabase(":memory:");
  const catalog = db.listCatalogCharacters();
  const suggestions = db.getTrackedCharacters();
  assert.equal(suggestions.length, catalog.length);
  assert.equal(suggestions.some((item) => item.displayName === "Spider-Verse (all variants)"), false);
  const peter = suggestions.find((item) => item.fandomEntity === "Peter Parker (Earth-616)");
  assert.ok(peter.aliases.includes("Amazing Spider-Man"));
  const before = db.getDashboardStats().trackedCharactersCount;
  db.updateTrackedCharacter(peter.id, { aliases: ["Peter Parker"], active: false });
  assert.equal(db.getTrackedCharacterById(peter.id).active, false);
  assert.equal(db.getDashboardStats().trackedCharactersCount, before - 1);
  db.close();
}

function extractCoverFileNameTest() {
  assert.equal(
    extractCoverFileName("{{Comic\n| Image1 = Venom Lethal Protector Vol 1 2.jpg\n}}"),
    "Venom Lethal Protector Vol 1 2.jpg"
  );
  assert.equal(
    extractCoverFileName("| Image = [[File:Example Cover.jpg|300px]]"),
    "Example Cover.jpg"
  );
}

function extractWritersTest() {
  const result = extractWriters(`
    | Writer1_1 = {{c|[[Zeb Wells]]}}
    | Writer1_2 = Uncredited
    | Writer2_1 = <ref>note</ref> [[Joe Kelly]]
  `);

  assert.deepEqual(result, ["Zeb Wells", "Joe Kelly"]);
}

function appearanceDetailsTest() {
  const details = extractAppearanceDetails(`
    * {{apn|[[Peter Parker (Earth-616)|Spider-Man]]|Example}} {{Flashback}}
    * {{Dream|[[Mary Jane Watson (Earth-616)|Mary Jane]]}}
    * {{Vision|[[Venom (Symbiote) (Earth-616)|Venom]]}}
  `);
  assert.equal(details["Peter Parker (Earth-616)"], "flashback");
  assert.equal(details["Mary Jane Watson (Earth-616)"], "dream");
  assert.equal(details["Venom (Symbiote) (Earth-616)"], "vision");
}

function mergeAppearanceMembersTest() {
  const result = mergeAppearanceMembers(
    [{ pageId: 1, pageTitle: "A", appearanceType: "direct" }],
    [
      { pageId: 1, pageTitle: "A", appearanceType: "minor" },
      { pageId: 2, pageTitle: "B", appearanceType: "minor" }
    ]
  );

  assert.equal(result.length, 2);
  assert.equal(result.find((item) => item.pageId === 1).appearanceType, "direct");
}

function parseDefaultSortDateTest() {
  assert.equal(parseDefaultSortDate("&nbsp;2025-01  20241218 Title"), "2024-12-18");
  assert.equal(parseDefaultSortDate("no date"), null);
}

function collectionStateSurvivesImportTest() {
  const db = new ComicDatabase(":memory:");
  const issue = {
    fandomPageId: 6011,
    pageTitle: "Amazing Fantasy Vol 1 15",
    title: "Amazing Fantasy (Vol. 1) #15",
    fandomUrl: "https://marvel.fandom.com/wiki/Amazing_Fantasy_Vol_1_15",
    seriesName: "Amazing Fantasy",
    volumeNumber: 1,
    issueLabel: "15",
    issueNumber: 15,
    releaseDate: "1962-06-05",
    coverImageUrl: "",
    writers: ["Stan Lee", "Steve Ditko"],
    appearanceType: "direct",
    sourceDefaultSort: ""
  };

  db.upsertCatalogIssues([issue]);
  db.replaceCatalogCharacterIssues("peter-parker-earth-616", [{
    pageId: issue.fandomPageId,
    appearanceType: "direct"
  }]);
  const stored = db.listCatalogIssues({ limit: 10 }).items[0];
  db.updateCatalogCollection(stored.id, {
    owned: true,
    publisher: "Panini",
    editionTitle: "Biblioteca Marvel",
    notes: "Tomo 1"
  });
  db.upsertCatalogIssues([{ ...issue, coverImageUrl: "https://example.test/new.jpg" }]);
  const updated = db.getCatalogIssue(stored.id);

  assert.equal(updated.owned, true);
  assert.equal(updated.ownedPublisher, "Panini");
  assert.equal(updated.coverImageUrl, "https://example.test/new.jpg");
  db.close();
}

function sharedComicAppearsInEachCharacterTest() {
  const db = new ComicDatabase(":memory:");
  const venom = characterRecord({
    displayName: "Venom",
    fandomEntity: "Venom (Symbiote) (Earth-616)",
    kind: "symbiote"
  });
  const issue = {
    fandomPageId: 777,
    pageTitle: "Shared Comic Vol 1 1",
    title: "Shared Comic (Vol. 1) #1",
    fandomUrl: "https://marvel.fandom.com/wiki/Shared_Comic_Vol_1_1",
    seriesName: "Shared Comic",
    volumeNumber: 1,
    issueLabel: "1",
    issueNumber: 1,
    releaseDate: "2026-01-15",
    coverImageUrl: "",
    writers: ["Writer"],
    appearanceType: "direct",
    sourceDefaultSort: ""
  };

  db.upsertCatalogCharacters([venom]);
  db.upsertCatalogIssues([issue]);
  db.replaceCatalogCharacterIssues("peter-parker-earth-616", [
    { pageId: 777, appearanceType: "direct" },
    { pageId: 777, appearanceType: "minor" }
  ]);
  db.replaceCatalogCharacterIssues(venom.slug, [{ pageId: 777, appearanceType: "direct" }]);
  db.seedPeterCatalogMembership();

  const peterList = db.listCatalogIssues({ character: "peter-parker-earth-616" });
  const venomList = db.listCatalogIssues({ character: venom.slug });
  assert.equal(peterList.total, 1);
  assert.equal(venomList.total, 1);
  assert.equal(db.listCatalogIssues({ character: "", universeGroup: "main" }).total, 1);
  assert.equal(db.getCatalogStats("", "main").totalCount, 1);
  assert.equal(db.getCatalogCharacter(venom.slug).lastComicDate, "2026-01-15");

  db.updateCatalogCollection(peterList.items[0].id, {
    owned: true,
    publisher: "Panini",
    editionTitle: "Tomo compartido",
    notes: ""
  });
  assert.equal(db.listCatalogIssues({ character: venom.slug }).items[0].owned, true);
  db.close();
}

function spanishEditionsTest() {
  const db = new ComicDatabase(":memory:");
  assert.equal(db.listSpanishEditions().stats.totalCount, 0);

  db.upsertCatalogIssues([{
    fandomPageId: 9090,
    pageTitle: "Amazing Spider-Man Vol 1 1",
    title: "Amazing Spider-Man (Vol. 1) #1",
    fandomUrl: "https://marvel.fandom.com/wiki/Amazing_Spider-Man_Vol_1_1",
    seriesName: "Amazing Spider-Man",
    volumeNumber: 1,
    issueLabel: "1",
    issueNumber: 1,
    releaseDate: "1963-03-01",
    dateSource: "release",
    datePrecision: "day",
    coverImageUrl: "",
    writers: ["Stan Lee"],
    appearanceType: "direct",
    sourceDefaultSort: ""
  }]);
  const usaIssue = db.getCatalogIssueByFandomPageId(9090);
  const created = db.saveSpanishEdition(null, {
    title: "Biblioteca de prueba",
    publisher: "Panini Comics",
    collectionName: "Marvel Gold",
    purchaseStatus: "wanted",
    characters: ["Peter Parker", "Venom", "Peter Parker"],
    issueIds: [usaIssue.id],
    notes: "Sin precargar en producción"
  });

  assert.equal(created.issueCount, 1);
  assert.deepEqual(created.characters, ["Peter Parker", "Venom"]);
  assert.equal(db.listSpanishEditions({ publisher: "Panini Comics" }).items.length, 1);
  assert.equal(db.listSpanishEditions({ character: "Venom" }).items.length, 1);
  assert.equal(db.listSpanishEditions({ limit: 1, offset: 0 }).total, 1);
  assert.equal(db.searchCatalogIssues("Amazing Spider-Man").length, 1);

  const updated = db.saveSpanishEdition(created.id, {
    ...created,
    purchaseStatus: "owned",
    issueIds: [usaIssue.id]
  });
  assert.equal(updated.purchaseStatus, "owned");
  assert.equal(db.listSpanishEditions().stats.ownedCount, 1);
  assert.equal(db.deleteSpanishEdition(created.id), true);
  assert.equal(db.listSpanishEditions().stats.totalCount, 0);
  db.close();
}

function paniniPreferenceTest() {
  const db = new ComicDatabase(":memory:");
  db.upsertCatalogIssues([{
    fandomPageId: 9191,
    pageTitle: "Unique Spider Test Vol 1 1",
    title: "Unique Spider Test (Vol. 1) #1",
    fandomUrl: "https://example.test/unique-spider-test-1",
    seriesName: "Unique Spider Test",
    volumeNumber: 1,
    issueLabel: "1",
    issueNumber: 1,
    releaseDate: "2020-01-01",
    coverImageUrl: "",
    writers: [],
    appearanceType: "direct",
    sourceDefaultSort: ""
  }]);
  db.replaceCatalogCharacterIssues("peter-parker-earth-616", [{ pageId: 9191, appearanceType: "direct" }]);
  const product = (key, pages) => ({
    sourceKey: key,
    title: `Tomo ${key}`,
    productUrl: `https://panini.test/${key}.html`,
    pages,
    containsRaw: "Unique Spider Test 1"
  });
  db.processPaniniProduct(product("small", 120));
  db.processPaniniProduct(product("large", 480));
  db.processPaniniProduct(product("large", 480));
  db.processPaniniProduct({ ...product("official", 200), isbn: "9780000000001" });
  db.processPaniniProduct({
    ...product("um-official", 200),
    source: "universo_marvel",
    isbn: "9780000000001",
    productUrl: "https://fichas.test/um-official.html"
  });
  const editions = db.listSpanishEditions().items;
  assert.equal(editions.length, 3);
  assert.equal(editions.find((item) => item.sourceKey === "large").preferredIssueCount, 1);
  assert.equal(editions.find((item) => item.sourceKey === "small").alternativeIssueCount, 1);
  db.close();
}

function webReviewDecisionTest() {
  const db = new ComicDatabase(":memory:");
  const comic = db.upsertComic({
    title: "Comic ambiguo #1",
    pageTitle: "Comic ambiguo Vol 1 1",
    fandomUrl: "https://example.test/comic",
    releaseDate: "2026-06-30",
    coverImageUrl: "",
    volumePageTitle: "Comic ambiguo Vol 1",
    volumeName: "Comic ambiguo (Vol. 1)",
    seriesName: "Comic ambiguo",
    volumeNumber: 1,
    volumeFandomUrl: "https://example.test/volume",
    issueLabel: "1",
    issueNumber: 1,
    weekYear: 2026,
    weekNumber: 27,
    weekKey: "2026-W27",
    matchSummary: ["Spider-Man"],
    originalityStatus: "uncertain",
    originalityReason: "Prueba",
    decision: "pending_review",
    decisionReason: "Requiere decision"
  });
  const review = db.createOrGetPendingReview(comic.id);
  const result = db.resolveReviewDecision(review.id, "approve", {
    id: "local-web",
    username: "pagina-local",
    source: "web"
  });

  assert.equal(result.status, "resolved");
  assert.equal(result.comic.decision, "manual_added");
  assert.match(result.comic.decisionReason, /página local/);
  assert.equal(db.resolveReviewDecision(review.id, "reject", { id: "x" }).status, "already_resolved");
  db.close();
}

function weeklyApprovalScopesTest() {
  const db = new ComicDatabase(":memory:");
  const latestRun = db.createSyncRun({ weekYear: 2026, weekNumber: 27, triggerSource: "test" });
  db.finishSyncRun(latestRun, { status: "completed", summary: {}, errorMessage: "" });

  const comic = (issue, weekNumber) => ({
    title: `Prueba semanal #${issue}`,
    pageTitle: `Prueba semanal Vol 1 ${issue}`,
    fandomUrl: `https://example.test/weekly-${issue}`,
    releaseDate: `2026-06-${String(issue).padStart(2, "0")}`,
    coverImageUrl: "",
    volumePageTitle: "Prueba semanal Vol 1",
    volumeName: "Prueba semanal (Vol. 1)",
    seriesName: "Prueba semanal",
    volumeNumber: 1,
    volumeFandomUrl: "https://example.test/weekly-volume",
    issueLabel: String(issue),
    issueNumber: issue,
    weekYear: 2026,
    weekNumber,
    weekKey: `2026-W${weekNumber}`,
    matchSummary: ["Spider-Man"],
    originalityStatus: "original",
    originalityReason: "Prueba",
    decision: "auto_added",
    decisionReason: "Prueba"
  });

  db.upsertComic(comic(26, 26));
  db.upsertComic(comic(27, 27));

  assert.deepEqual(db.listIncludedComics({ scope: "latest-week" }).map((item) => item.issueNumber), [27]);
  assert.deepEqual(db.listIncludedComics({ scope: "history" }).map((item) => item.issueNumber), [26]);
  assert.equal(db.listIncludedComics({ scope: "all" }).length, 2);
  db.close();
}

function futureIssuesStayHiddenTest() {
  const db = new ComicDatabase(":memory:");
  db.upsertCatalogIssues([{
    fandomPageId: 999001,
    pageTitle: "Future Spider Test Vol 1 1",
    title: "Future Spider Test (Vol. 1) #1",
    fandomUrl: "https://example.test/future-spider-test-1",
    seriesName: "Future Spider Test",
    volumeNumber: 1,
    issueLabel: "1",
    issueNumber: 1,
    releaseDate: "2999-01-01",
    coverImageUrl: "",
    writers: [],
    appearanceType: "direct",
    sourceDefaultSort: ""
  }]);
  db.replaceCatalogCharacterIssues("peter-parker-earth-616", [{ pageId: 999001, appearanceType: "direct" }]);
  assert.equal(db.listCatalogIssues({ character: "peter-parker-earth-616" }).total, 0);
  assert.equal(db.getCatalogStats("peter-parker-earth-616").totalCount, 0);
  db.close();
}

const tests = [
  ["parsea una ficha del catalogo", parseCatalogPageTest],
  ["extrae la tapa declarada en Image1", extractCoverFileNameTest],
  ["extrae y limpia guionistas", extractWritersTest],
  ["clasifica el subtipo de las apariciones menores", appearanceDetailsTest],
  ["usa Cover Date cuando falta Release Date", coverDateFallbackTest],
  ["incluye los personajes relacionados pedidos", relatedCharactersSeedTest],
  ["unifica sugerencias semanales y personajes del catálogo", unifiedSuggestionCharactersTest],
  ["deduplica apariciones y prioriza la directa", mergeAppearanceMembersTest],
  ["usa la fecha de salida codificada en defaultsort", parseDefaultSortDateTest],
  ["una reimportacion conserva la coleccion", collectionStateSurvivesImportTest],
  ["un comic compartido aparece en cada lista sin duplicarse", sharedComicAppearsInEachCharacterTest],
  ["las ediciones en español relacionan varios issues sin datos precargados", spanishEditionsTest],
  ["Panini no duplica productos y prioriza el tomo con más páginas", paniniPreferenceTest],
  ["una revision web se resuelve una sola vez", webReviewDecisionTest],
  ["separa la ultima revision semanal del historial aprobado", weeklyApprovalScopesTest],
  ["oculta issues futuros hasta su fecha de publicacion", futureIssuesStayHiddenTest]
];

for (const [label, fn] of tests) {
  fn();
  console.log(`ok - ${label}`);
}
