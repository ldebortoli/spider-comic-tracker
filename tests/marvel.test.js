const assert = require("node:assert/strict");

const { classifyComic, deriveVolumeInfo, evaluateOriginality, parseAppearanceCategories, parseComicArticleHtml } = require("../src/marvel");

function parseComicArticleHtmlTest() {
  const html = `
    <article>
      <h2>Venom (Vol. 6) #257</h2>
      <img src="https://static.wikia.nocookie.net/marveldatabase/images/a/ab/VenomVol6257.jpg/revision/latest?cb=1" />
      <h3>Release Date</h3>
      <div>April 15, 2026</div>
      <h3>Featured Characters:</h3>
      <ul>
        <li>Spider-Man (Peter Parker)</li>
      </ul>
      <h3>Supporting Characters:</h3>
      <ul>
        <li>Eddie Brock</li>
      </ul>
      <h3>Antagonists:</h3>
      <ul>
        <li>Carnage Symbiote</li>
      </ul>
      <h3>Other Characters:</h3>
      <ul>
        <li>Dylan Brock</li>
      </ul>
      <h3>Solicit Synopsis</h3>
      <p>Spider-Man and Venom save the day.</p>
    </article>
  `;

  const result = parseComicArticleHtml("Venom_Vol_6_257", html, "https://marvel.fandom.com");

  assert.equal(result.title, "Venom (Vol. 6) #257");
  assert.equal(result.releaseDate, "2026-04-15");
  assert.match(result.coverImageUrl, /VenomVol6257/);
  assert.equal(result.volumeName, "Venom (Vol. 6)");
  assert.equal(result.volumePageTitle, "Venom Vol 6");
  assert.equal(result.issueLabel, "257");
  assert.equal(result.issueNumber, 257);
  assert.deepEqual(result.featuredCharacters, ["Spider-Man (Peter Parker)"]);
  assert.deepEqual(result.supportingCharacters, ["Eddie Brock"]);
}

function deriveVolumeInfoFromPageTitleTest() {
  const result = deriveVolumeInfo({
    pageTitle: "Miles Morales: Spider-Man - Brooklyn's Finest Infinity Comic Vol 1 13",
    title: "Miles Morales: Spider-Man - Brooklyn's Finest Infinity Comic #13",
    baseUrl: "https://marvel.fandom.com"
  });

  assert.equal(result.volumeName, "Miles Morales: Spider-Man - Brooklyn's Finest Infinity Comic (Vol. 1)");
  assert.equal(result.volumePageTitle, "Miles Morales: Spider-Man - Brooklyn's Finest Infinity Comic Vol 1");
  assert.equal(result.issueLabel, "13");
  assert.equal(result.issueNumber, 13);
}

function classifyAutoAddTest() {
  const classification = classifyComic({
    title: "Amazing Spider-Man (Vol. 7) #27",
    synopsis: "",
    featuredCharacters: ["Spider-Man (Peter Parker)"],
    supportingCharacters: [],
    antagonists: [],
    otherCharacters: []
  }, [
    {
      id: 1,
      displayName: "Peter Parker",
      aliases: ["Peter Parker", "Spider-Man"],
      active: true
    }
  ]);

  assert.equal(classification.decision, "auto_added");
  assert.deepEqual(classification.matchSummary, ["Peter Parker"]);
}

function classifyFromCatalogCategoryTest() {
  const appearances = parseAppearanceCategories([
    { title: "Category:Peter Parker (Earth-616)/Appearances" },
    { title: "Category:Mary Jane Watson (Earth-616)/Minor Appearances" },
    { title: "Category:Zeb Wells/Writer" }
  ]);
  const classification = classifyComic({
    title: "A New Weekly Comic #1",
    synopsis: "",
    featuredCharacters: [],
    supportingCharacters: [],
    antagonists: [],
    otherCharacters: [],
    appearanceCategories: appearances
  }, [{
    id: 1,
    displayName: "Peter Parker / Spider-Man",
    fandomEntity: "Peter Parker (Earth-616)",
    aliases: [],
    active: true
  }]);
  assert.equal(classification.decision, "auto_added");
  assert.deepEqual(classification.matchSummary, ["Peter Parker / Spider-Man"]);
  assert.equal(appearances.length, 2);
}

function classifyPendingReviewTest() {
  const classification = classifyComic({
    title: "Alias: Red Band #2",
    synopsis: "Eddie Brock aparece brevemente.",
    featuredCharacters: [],
    supportingCharacters: ["Eddie Brock"],
    antagonists: [],
    otherCharacters: []
  }, [
    {
      id: 2,
      displayName: "Venom",
      aliases: ["Venom", "Eddie Brock"],
      active: true
    }
  ]);

  assert.equal(classification.decision, "pending_review");
  assert.deepEqual(classification.matchSummary, ["Venom"]);
}

function classifyReprintRejectTest() {
  const classification = classifyComic({
    title: "Silver Surfer Facsimile Edition #2",
    pageTitle: "Silver Surfer Facsimile Edition Vol 1 2",
    volumeName: "Silver Surfer Facsimile Edition (Vol. 1)",
    synopsis: "Reprinting SILVER SURFER (1968) #2.",
    featuredCharacters: ["Silver Surfer"],
    supportingCharacters: [],
    antagonists: [],
    otherCharacters: [],
    sourceHtml: `
      <div>Reprint of the 1st story from Silver Surfer #2</div>
      <div>Reprinting SILVER SURFER (1968) #2.</div>
    `,
    volumeType: "Reprint Series (Solo)",
    volumeSourceHtml: ""
  }, [
    {
      id: 3,
      displayName: "Spider-Verse (all variants)",
      aliases: ["Spider-Man"],
      active: true
    },
    {
      id: 4,
      displayName: "Symbiotes (all variants)",
      aliases: ["Venom"],
      active: true
    }
  ]);

  assert.equal(classification.decision, "auto_rejected");
  assert.equal(classification.originalityStatus, "reprint");
  assert.match(classification.reason, /no parece material nuevo/i);
}

function evaluateOriginalityUncertainTest() {
  const originality = evaluateOriginality({
    title: "Spider-Man Special #1",
    pageTitle: "Spider-Man Special Vol 1 1",
    volumeName: "Spider-Man Special (Vol. 1)",
    synopsis: "",
    sourceHtml: "<div>ISBN</div><div>978-1-302-96707-9</div>",
    volumeType: "",
    volumeSourceHtml: "",
    isbn: "978-1-302-96707-9",
    pages: 160
  });

  assert.equal(originality.status, "uncertain");
  assert.match(originality.reason, /ISBN/i);
}

const tests = [
  ["parseComicArticleHtml extrae titulo, fecha, tapa y personajes", parseComicArticleHtmlTest],
  ["deriveVolumeInfo ubica correctamente el volumen", deriveVolumeInfoFromPageTitleTest],
  ["classifyComic auto-agrega cuando la coincidencia es fuerte", classifyAutoAddTest],
  ["classifyComic usa las categorías exactas del catálogo unificado", classifyFromCatalogCategoryTest],
  ["classifyComic manda a revision cuando solo hay coincidencia debil", classifyPendingReviewTest],
  ["classifyComic rechaza reediciones evidentes", classifyReprintRejectTest],
  ["evaluateOriginality marca como duda un tomo sospechoso", evaluateOriginalityUncertainTest]
];

for (const [label, fn] of tests) {
  fn();
  console.log(`ok - ${label}`);
}
