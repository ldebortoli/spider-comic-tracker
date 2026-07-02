const assert = require("node:assert/strict");

const {
  expandIssueNumbers,
  matchContainsToCatalog,
  parseListingPage,
  parseProductPage
} = require("../src/panini");

function parserTest() {
  const listing = parseListingPage(`
    <span class="toolbar-number">1</span><span class="toolbar-number">36</span><span class="toolbar-number">72</span>
    <a class="product-item-link" href="/shp_esp_es/tomo-spider-s001-es01.html">Tomo Spider</a>
    <a href="?p=2&amp;skip_default_filters=true" class="page">2</a>
  `, "https://www.panini.es/shp_esp_es/comics/marvel.html");
  assert.equal(listing.items[0].title, "Tomo Spider");
  assert.equal(listing.totalCount, 72);

  const product = parseProductPage(`
    <meta property="og:url" content="https://www.panini.es/shp_esp_es/tomo-spider-s001-es01.html" />
    <meta property="og:image" content="https://example.test/cover.jpg" />
    <h1 class="page-title"><span>Tomo Spider</span></h1>
    <li class="item pnn_release_date"><strong class="label">Fecha de lanzamiento:</strong><span class="data">5 dic 2019</span></li>
    <li class="item pnn_pages_number"><strong class="label">Páginas:</strong><span class="data">320</span></li>
    <li class="item pnn_contains"><strong class="label">Contiene:</strong><span class="data">Amazing Spider-Man (1963) 1-2</span></li>
  `, "https://example.test/product", "");
  assert.equal(product.publicationDate, "2019-12-05");
  assert.equal(product.pages, 320);
  assert.equal(product.containsRaw, "Amazing Spider-Man (1963) 1-2");
}

function matchingTest() {
  const rows = [
    { id: 1, series_name: "Amazing Spider-Man", volume_number: 1, issue_number: 1, release_date: "1963-03-01" },
    { id: 2, series_name: "Amazing Spider-Man", volume_number: 1, issue_number: 2, release_date: "1963-05-01" },
    { id: 3, series_name: "Amazing Spider-Man", volume_number: 6, issue_number: 1, release_date: "2022-04-01" },
    { id: 4, series_name: "Amazing Spider-Man", volume_number: 6, issue_number: 2, release_date: "2022-05-01" },
    { id: 5, series_name: "Venom: Lethal Protector", volume_number: 1, issue_number: 1, release_date: "1993-02-01" },
    { id: 6, series_name: "Spider-Man", volume_number: 1, issue_number: 13, release_date: "1991-01-01" },
    { id: 7, series_name: "Spider-Man", volume_number: 2, issue_number: 13, release_date: "2017-01-01" },
    { id: 8, series_name: "Spider-Man", volume_number: 2, issue_number: 2, release_date: "2016-01-01" }
  ];
  const result = matchContainsToCatalog(
    "Amazing Spider-Man (1963) 1-2; Venom: Lethal Protector 1",
    rows,
    "2026-01-01"
  );
  assert.deepEqual(result.issueIds.sort((a, b) => a - b), [1, 2, 5]);
  assert.deepEqual(matchContainsToCatalog("Spider-Man Vol.2 #13", rows, "2017-06-01").issueIds, [7]);
  assert.deepEqual(
    matchContainsToCatalog("Spider-Man Vol.2 #2; Spider-Man Vol.2 #13", rows, "2017-06-01").issueIds.sort((a, b) => a - b),
    [7, 8]
  );
  assert.deepEqual(expandIssueNumbers("1-3, 7 y 9"), [1, 2, 3, 7, 9]);
}

parserTest();
console.log("ok - parsea listados y fichas de Panini");
matchingTest();
console.log("ok - relaciona Contiene con series, años y números USA");
