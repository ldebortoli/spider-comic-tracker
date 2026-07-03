const http = require("node:http");
const https = require("node:https");
const { decodeHtmlEntities, sanitizeLine, uniqueStrings } = require("./utils");

const BASE_URL = "https://fichas.universomarvel.com/";
const RELEVANT_PATTERN = /spider|spiderman|spider-man|araña|arana|venom|matanza|carnage|simbion/i;
const MONTHS = {
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6,
  julio: 7, agosto: 8, septiembre: 9, octubre: 10, noviembre: 11, diciembre: 12
};

function fetchBuffer(url, { timeoutMs = 45_000, redirects = 5 } = {}) {
  return new Promise((resolve, reject) => {
    const client = String(url).startsWith("https:") ? https : http;
    const request = client.get(url, {
      headers: { "user-agent": "SpiderComicTracker/1.0 (+local personal catalog)", "accept-encoding": "identity" },
      maxHeaderSize: 128 * 1024
    }, (response) => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location && redirects > 0) {
        response.resume();
        resolve(fetchBuffer(new URL(response.headers.location, url).toString(), { timeoutMs, redirects: redirects - 1 }));
        return;
      }
      if (response.statusCode < 200 || response.statusCode >= 300) {
        response.resume();
        reject(new Error(`Fichas Universo Marvel respondió HTTP ${response.statusCode}`));
        return;
      }
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => resolve(Buffer.concat(chunks)));
      response.on("error", reject);
    });
    request.setTimeout(timeoutMs, () => request.destroy(new Error("Fichas Universo Marvel agotó el tiempo de espera")));
    request.on("error", reject);
  });
}

async function fetchPage(url) {
  const buffer = await fetchBuffer(url);
  return new TextDecoder("windows-1252").decode(buffer);
}

function sourceKey(url) {
  const name = new URL(url).pathname.split("/").pop().replace(/\.html$/i, "").toLowerCase();
  return `um-${name}`;
}

function parseDirectory(html, baseUrl = BASE_URL) {
  const entries = [];
  for (const match of String(html || "").matchAll(/<option\s+value="([^"]+)">([\s\S]*?)<\/option>/gi)) {
    const value = decodeHtmlEntities(match[1]).trim();
    if (!value || !/\.html(?:$|[?#])/i.test(value)) continue;
    const title = sanitizeLine(match[2]);
    entries.push({
      title,
      url: new URL(value, baseUrl).toString(),
      isProduct: /^esp\//i.test(value),
      priority: RELEVANT_PATTERN.test(title) ? 10 : 0
    });
  }
  return [...new Map(entries.map((entry) => [entry.url, entry])).values()]
    .sort((a, b) => b.priority - a.priority || a.title.localeCompare(b.title, "es"));
}

function parseIndexLinks(html, pageUrl, rootStem, priority = 0) {
  const products = [];
  const nestedIndexes = [];
  for (const match of String(html || "").matchAll(/<a[^>]+href\s*=\s*["']?([^"'\s>]+)[^>]*>([\s\S]*?)<\/a>/gi)) {
    let url;
    try { url = new URL(decodeHtmlEntities(match[1]), pageUrl); } catch { continue; }
    if (url.hostname !== new URL(BASE_URL).hostname || !/\.html$/i.test(url.pathname)) continue;
    const title = sanitizeLine(match[2]);
    if (/\/esp\//i.test(url.pathname)) {
      products.push({ sourceKey: sourceKey(url), title, productUrl: url.toString(), priority });
      continue;
    }
    const basename = url.pathname.split("/").pop().replace(/\.html$/i, "");
    if (basename !== rootStem && basename.startsWith(`${rootStem}_`)) nestedIndexes.push(url.toString());
  }
  return {
    products: [...new Map(products.map((item) => [item.productUrl, item])).values()],
    nestedIndexes: uniqueStrings(nestedIndexes)
  };
}

async function discoverCollection(entry) {
  const rootStem = new URL(entry.url).pathname.split("/").pop().replace(/\.html$/i, "");
  const queue = [entry.url];
  const visited = new Set();
  const products = new Map();
  while (queue.length && visited.size < 12) {
    const url = queue.shift();
    if (visited.has(url)) continue;
    visited.add(url);
    const parsed = parseIndexLinks(await fetchPage(url), url, rootStem, entry.priority);
    for (const product of parsed.products) products.set(product.productUrl, product);
    for (const nested of parsed.nestedIndexes) if (!visited.has(nested)) queue.push(nested);
  }
  return [...products.values()];
}

function parseSpanishMonthYear(value) {
  const match = sanitizeLine(value).toLowerCase().match(/([a-záéíóúñ]+)\s+(\d{4})/i);
  if (!match) return "";
  const normalized = match[1].normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const month = MONTHS[normalized];
  return month ? `${match[2]}-${String(month).padStart(2, "0")}-01` : "";
}

function parseUniversoMarvelProduct(html, productUrl, fallbackTitle = "") {
  const titleMatch = String(html || "").match(/<title>([\s\S]*?)<\/title>/i);
  const title = sanitizeLine(titleMatch?.[1] || fallbackTitle)
    .replace(/^Universo Marvel:\s*/i, "")
    .replace(/\s*-\s*Panini\s*$/i, "");
  const sourceHtml = String(html || "");
  const coverMatch = sourceHtml.match(/<img[^>]+src=["']?([^"'\s>]*\bportadas\/[^"'\s>]+)["']?[^>]*>/i)
    || sourceHtml.match(/MM_openBrWindow\(["']([^"']*\bportadas\/[^"']+)["']/i);
  const pagesMatch = sanitizeLine(html).match(/(\d+)\s*P[aá]ginas/i);
  const isbnMatch = sanitizeLine(html).match(/\bCB:\s*([0-9X-]+)/i);
  const dateMatch = String(html || "").match(/href=["'][^"']*\/fechases\/[^"']+["'][^>]*>([\s\S]*?)<\/a>/i);
  const formatMatch = dateMatch
    ? String(html || "").slice((dateMatch.index || 0) + dateMatch[0].length).match(/<b>([\s\S]*?)<\/b>/i)
    : null;
  const contents = [];
  const blocks = [...String(html || "").matchAll(/<!--\s*Contenido USA\s*-->([\s\S]*?)(?=<!--\s*Contenido USA\s*-->|<!--\s*Comentarios|<\/body>)/gi)];
  for (const block of blocks) {
    for (const item of block[1].matchAll(/<li>([\s\S]*?)(?=<li>|<\/td>)/gi)) {
      const value = sanitizeLine(item[1]);
      if (value) contents.push(value);
    }
  }

  return {
    source: "universo_marvel",
    publisher: "Panini Comics",
    sourceKey: sourceKey(productUrl),
    title,
    productUrl,
    coverImageUrl: coverMatch && !/^\.\.\/usa\/portadas\//i.test(coverMatch[1])
      ? new URL(decodeHtmlEntities(coverMatch[1]), productUrl).toString()
      : "",
    publicationDate: parseSpanishMonthYear(dateMatch?.[1] || ""),
    pages: pagesMatch ? Number(pagesMatch[1]) : null,
    isbn: isbnMatch?.[1] || "",
    formatLabel: sanitizeLine(formatMatch?.[1] || ""),
    containsRaw: uniqueStrings(contents).join("; ")
  };
}

async function importUniversoMarvelCatalog({ db, indexBatch = 25, productBatch = 50, concurrency = 5, onProgress } = {}) {
  if (db.getState("universo_marvel_matcher_version", "") !== "2") {
    db.requeueSpanishSourceProducts("universo_marvel");
    db.setState("universo_marvel_matcher_version", "2");
  }
  const directory = parseDirectory(await fetchPage(new URL("panini.html", BASE_URL)), BASE_URL);
  const directProducts = directory.filter((entry) => entry.isProduct).map((entry) => ({
    sourceKey: sourceKey(entry.url), title: entry.title, productUrl: entry.url, priority: entry.priority
  }));
  db.queueSpanishSourceProducts("universo_marvel", directProducts);

  const indexes = directory.filter((entry) => !entry.isProduct);
  const cursor = Number(db.getState("universo_marvel_index_cursor", "0") || 0) % Math.max(1, indexes.length);
  const selectedIndexes = [];
  for (let offset = 0; offset < Math.min(indexBatch, indexes.length); offset += 1) {
    selectedIndexes.push(indexes[(cursor + offset) % indexes.length]);
  }
  let nextIndex = 0;
  let discoveredFromIndexes = 0;

  async function discoveryWorker() {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= selectedIndexes.length) return;
      try {
        const products = await discoverCollection(selectedIndexes[index]);
        db.queueSpanishSourceProducts("universo_marvel", products);
        discoveredFromIndexes += products.length;
      } catch (error) {
        onProgress?.({ stage: "discovering_universo_marvel", warning: error.message });
      }
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(8, concurrency)) }, () => discoveryWorker()));
  db.setState("universo_marvel_index_cursor", String((cursor + selectedIndexes.length) % Math.max(1, indexes.length)));

  const pending = db.listPendingSpanishSourceProducts("universo_marvel", productBatch);
  const result = { source: "universo_marvel", directoryEntries: directory.length, scannedIndexes: selectedIndexes.length, discoveredFromIndexes, queued: pending.length, processed: 0, matched: 0, pendingMatch: 0, errors: [] };
  let nextProduct = 0;
  async function productWorker() {
    while (true) {
      const index = nextProduct;
      nextProduct += 1;
      if (index >= pending.length) return;
      const item = pending[index];
      try {
        const product = parseUniversoMarvelProduct(await fetchPage(item.productUrl), item.productUrl, item.title);
        const processed = db.processPaniniProduct(product);
        db.resolveSpanishSourceQueueItem(item.id);
        result.processed += 1;
        if (processed.status === "matched") result.matched += 1;
        else result.pendingMatch += 1;
      } catch (error) {
        db.resolveSpanishSourceQueueItem(item.id, /HTTP 404\b/.test(error.message) ? "" : error.message);
        result.errors.push({ productUrl: item.productUrl, message: error.message });
      }
      onProgress?.({ stage: "importing_universo_marvel", ...result, errors: [...result.errors] });
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(8, concurrency)) }, () => productWorker()));
  result.queue = db.getSpanishSourceQueueStats("universo_marvel");
  return result;
}

module.exports = {
  BASE_URL,
  discoverCollection,
  fetchPage,
  importUniversoMarvelCatalog,
  parseDirectory,
  parseIndexLinks,
  parseSpanishMonthYear,
  parseUniversoMarvelProduct
};
