const { decodeHtmlEntities, normalizeText, sanitizeLine, uniqueStrings } = require("./utils");
const http = require("node:http");
const https = require("node:https");

const DEFAULT_LISTING_URL = "https://www.panini.es/shp_esp_es/comics/marvel.html?skip_default_filters=true";
const SPANISH_MONTHS = {
  ene: 1, enero: 1, feb: 2, febrero: 2, mar: 3, marzo: 3, abr: 4, abril: 4,
  may: 5, mayo: 5, jun: 6, junio: 6, jul: 7, julio: 7, ago: 8, agosto: 8,
  sept: 9, sep: 9, septiembre: 9, oct: 10, octubre: 10, nov: 11, noviembre: 11,
  dic: 12, diciembre: 12
};

function fold(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function escapeRegex(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function wordsPattern(value) {
  const words = fold(value).match(/[a-z0-9]+/g) || [];
  return words.length ? words.map(escapeRegex).join("[^a-z0-9]+") : "";
}

function parseSpanishDate(value) {
  const text = fold(sanitizeLine(value));
  const match = text.match(/(\d{1,2})\s+([a-z]+)\s+(\d{4})/);
  if (!match) return "";
  const month = SPANISH_MONTHS[match[2]];
  if (!month) return "";
  return `${match[3]}-${String(month).padStart(2, "0")}-${String(Number(match[1])).padStart(2, "0")}`;
}

function absoluteUrl(value, baseUrl = DEFAULT_LISTING_URL) {
  try {
    return new URL(decodeHtmlEntities(value), baseUrl).toString();
  } catch {
    return "";
  }
}

function sourceKeyFromUrl(value) {
  try {
    const pathname = new URL(value).pathname;
    return pathname.split("/").pop().replace(/\.html$/i, "").toLowerCase();
  } catch {
    return normalizeText(value).replace(/\s+/g, "-");
  }
}

function parseListingPage(html, pageUrl = DEFAULT_LISTING_URL) {
  const items = [];
  const seen = new Set();
  const linkPattern = /<a[^>]*class="[^"]*product-item-link[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let match;

  while ((match = linkPattern.exec(String(html || "")))) {
    const productUrl = absoluteUrl(match[1], pageUrl);
    if (!productUrl || seen.has(productUrl)) continue;
    seen.add(productUrl);
    items.push({
      sourceKey: sourceKeyFromUrl(productUrl),
      title: sanitizeLine(match[2]),
      productUrl
    });
  }

  const toolbarNumbers = [...String(html || "").matchAll(/toolbar-number[^>]*>\s*([\d.]+)/gi)]
    .map((entry) => Number(entry[1].replace(/\./g, "")))
    .filter(Number.isFinite);
  const totalCount = toolbarNumbers.length ? Math.max(...toolbarNumbers) : items.length;
  const pageLinks = [...String(html || "").matchAll(/[?&](?:amp;)?p=(\d+)/gi)]
    .map((entry) => Number(entry[1]))
    .filter(Number.isFinite);
  const pageSize = Math.max(1, items.length || 36);
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize), ...pageLinks);

  return { items, totalCount, totalPages, pageSize };
}

function parseProductAttributes(html) {
  const attributes = {};
  const pattern = /<li class="item ([^"]+)">\s*<strong class="label">([\s\S]*?)<\/strong>\s*<span class="data">([\s\S]*?)<\/span>\s*<\/li>/gi;
  let match;

  while ((match = pattern.exec(String(html || "")))) {
    const key = match[1].trim();
    const label = sanitizeLine(match[2]).replace(/:$/, "");
    const value = sanitizeLine(match[3]);
    attributes[key] = { label, value };
  }

  return attributes;
}

function metaContent(html, property) {
  const escaped = escapeRegex(property);
  const first = String(html || "").match(new RegExp(`<meta[^>]+(?:property|name)="${escaped}"[^>]+content="([^"]*)"`, "i"));
  const reverse = String(html || "").match(new RegExp(`<meta[^>]+content="([^"]*)"[^>]+(?:property|name)="${escaped}"`, "i"));
  return decodeHtmlEntities(first?.[1] || reverse?.[1] || "");
}

function parseProductPage(html, productUrl, fallbackTitle = "") {
  const attributes = parseProductAttributes(html);
  const heading = String(html || "").match(/<h1[^>]*class="[^"]*page-title[^"]*"[^>]*>([\s\S]*?)<\/h1>/i);
  const title = sanitizeLine(heading?.[1] || metaContent(html, "og:title") || fallbackTitle);
  const pages = Number(String(attributes.pnn_pages_number?.value || "").replace(/\D+/g, "")) || null;
  const containsRaw = attributes.pnn_contains?.value || "";
  const publicationDate = parseSpanishDate(attributes.pnn_release_date?.value || "");
  const isbn = attributes.pnn_isbn?.value || attributes.pnn_issn?.value || "";
  const canonicalUrl = metaContent(html, "og:url") || productUrl;

  return {
    sourceKey: sourceKeyFromUrl(canonicalUrl),
    title,
    productUrl: canonicalUrl,
    coverImageUrl: metaContent(html, "og:image"),
    publicationDate,
    pages,
    isbn,
    formatLabel: attributes.pnn_binding?.value || "",
    containsRaw,
    rawAttributes: Object.fromEntries(Object.entries(attributes).map(([key, item]) => [key, item.value]))
  };
}

function expandIssueNumbers(text) {
  const numbers = new Set();
  const source = String(text || "");
  const ranges = [...source.matchAll(/#?\s*(\d{1,4})\s*[-–—]\s*#?\s*(\d{1,4})/g)];
  for (const match of ranges) {
    const start = Number(match[1]);
    const end = Number(match[2]);
    if (end >= start && end - start <= 250) {
      for (let value = start; value <= end; value += 1) numbers.add(value);
    }
  }
  const withoutRanges = source.replace(/#?\s*\d{1,4}\s*[-–—]\s*#?\s*\d{1,4}/g, " ");
  for (const match of withoutRanges.matchAll(/#?\s*(\d{1,4})(?!\d)/g)) {
    const value = Number(match[1]);
    if (value >= 1900 && value <= 2100) continue;
    numbers.add(value);
  }
  return [...numbers];
}

function chooseVolume(rows, numbers, year, publicationDate, volumeHint = null) {
  const byVolume = new Map();
  for (const row of rows) {
    const key = row.volume_number === null || row.volume_number === undefined ? "" : String(row.volume_number);
    if (!byVolume.has(key)) byVolume.set(key, []);
    byVolume.get(key).push(row);
  }
  const scored = [...byVolume.entries()].filter(([key]) => volumeHint === null || Number(key) === Number(volumeHint)).map(([, volumeRows]) => {
    const matched = volumeRows.filter((row) => numbers.includes(Number(row.issue_number)));
    const years = volumeRows.map((row) => Number(String(row.release_date || "").slice(0, 4))).filter(Number.isFinite);
    const firstYear = years.length ? Math.min(...years) : 0;
    const latestDate = matched.map((row) => row.release_date || "").sort().at(-1) || "";
    return {
      rows: matched,
      coverage: matched.length,
      yearDistance: year && firstYear ? Math.abs(firstYear - year) : 9999,
      beforePublication: !publicationDate || !latestDate || latestDate <= publicationDate,
      latestDate
    };
  }).filter((item) => item.coverage > 0);
  scored.sort((a, b) => {
    if (year && a.yearDistance !== b.yearDistance) return a.yearDistance - b.yearDistance;
    if (a.coverage !== b.coverage) return b.coverage - a.coverage;
    if (a.beforePublication !== b.beforePublication) return a.beforePublication ? -1 : 1;
    return b.latestDate.localeCompare(a.latestDate);
  });
  if (!scored.length) return [];
  const best = scored[0];
  const second = scored[1];
  if (second && !year && best.coverage === second.coverage && best.beforePublication === second.beforePublication && best.latestDate === second.latestDate) {
    return [];
  }
  return best.rows;
}

function matchContainsToCatalog(containsRaw, catalogIssues, publicationDate = "") {
  const source = fold(containsRaw);
  const seriesGroups = new Map();
  for (const issue of catalogIssues || []) {
    const key = normalizeText(issue.series_name || issue.seriesName);
    if (!key) continue;
    if (!seriesGroups.has(key)) seriesGroups.set(key, { name: issue.series_name || issue.seriesName, rows: [] });
    seriesGroups.get(key).rows.push(issue);
  }

  const occurrences = [];
  for (const group of seriesGroups.values()) {
    const pattern = wordsPattern(group.name);
    if (!pattern) continue;
    const regex = new RegExp(`\\b${pattern}\\b(?:\\s*\\((\\d{4})\\))?`, "ig");
    let match;
    while ((match = regex.exec(source))) {
      occurrences.push({ group, index: match.index, end: match.index + match[0].length, year: Number(match[1]) || 0 });
    }
  }
  occurrences.sort((a, b) => a.index - b.index || b.end - a.end);
  const nonOverlapping = occurrences.filter((item, index, all) => !all.some((other, otherIndex) => (
    otherIndex !== index && other.index <= item.index && other.end >= item.end &&
    (other.end - other.index) > (item.end - item.index)
  )));
  const matched = [];
  const unresolved = [];

  for (let index = 0; index < nonOverlapping.length; index += 1) {
    const occurrence = nonOverlapping[index];
    const nextIndex = nonOverlapping.slice(index + 1).find((item) => item.index > occurrence.end)?.index ?? source.length;
    const separatorIndex = source.slice(occurrence.end, nextIndex).search(/[;\n]/);
    const end = separatorIndex >= 0 ? occurrence.end + separatorIndex : nextIndex;
    const issueText = source.slice(occurrence.end, end).slice(0, 180);
    const volumeMatch = issueText.match(/\bvol(?:ume)?\.?\s*(\d+)\b/i);
    const volumeHint = volumeMatch ? Number(volumeMatch[1]) : null;
    const numberText = issueText.replace(/\bvol(?:ume)?\.?\s*\d+\b/ig, " ");
    const numbers = expandIssueNumbers(numberText);
    if (!numbers.length) continue;
    const chosen = chooseVolume(occurrence.group.rows, numbers, occurrence.year, publicationDate, volumeHint);
    if (!chosen.length) {
      unresolved.push(`${occurrence.group.name}: ${numbers.join(", ")}`);
      continue;
    }
    matched.push(...chosen);
    const foundNumbers = new Set(chosen.map((row) => Number(row.issue_number)));
    const missing = numbers.filter((number) => !foundNumbers.has(number));
    if (missing.length) unresolved.push(`${occurrence.group.name}: ${missing.join(", ")}`);
  }

  const byId = new Map(matched.map((row) => [Number(row.id), row]));
  return {
    issues: [...byId.values()],
    issueIds: [...byId.keys()],
    unresolved: uniqueStrings(unresolved),
    recognizedSeries: nonOverlapping.map((item) => item.group.name)
  };
}

function requestText(url, { timeoutMs = 45_000, redirects = 5 } = {}) {
  return new Promise((resolve, reject) => {
    const client = String(url).startsWith("https:") ? https : http;
    const request = client.get(url, {
      headers: {
        "user-agent": "SpiderComicTracker/1.0 (+local personal catalog)",
        "accept-encoding": "identity"
      },
      maxHeaderSize: 256 * 1024
    }, (response) => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location && redirects > 0) {
        if (/queue-it\.net/i.test(response.headers.location)) {
          response.resume();
          reject(new Error("Panini activó su sala de espera; el catálogo se reintentará en la próxima ejecución"));
          return;
        }
        response.resume();
        resolve(requestText(new URL(response.headers.location, url).toString(), { timeoutMs, redirects: redirects - 1 }));
        return;
      }
      if (response.statusCode < 200 || response.statusCode >= 300) {
        response.resume();
        reject(new Error(`Panini respondió HTTP ${response.statusCode}`));
        return;
      }
      response.setEncoding("utf8");
      let body = "";
      response.on("data", (chunk) => { body += chunk; });
      response.on("end", () => resolve(body));
      response.on("error", reject);
    });
    request.setTimeout(timeoutMs, () => request.destroy(new Error("Panini agotó el tiempo de espera")));
    request.on("error", reject);
  });
}

async function fetchTextWithRetry(url, { attempts = 4, timeoutMs = 45_000 } = {}) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await requestText(url, { timeoutMs });
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, 600 * attempt));
    }
  }
  throw lastError;
}

function listingPageUrl(listingUrl, page) {
  const url = new URL(listingUrl || DEFAULT_LISTING_URL);
  url.searchParams.set("product_list_limit", "36");
  if (page > 1) url.searchParams.set("p", String(page));
  else url.searchParams.delete("p");
  return url.toString();
}

async function importPaniniCatalog({
  listingUrl = DEFAULT_LISTING_URL,
  knownUrls = new Set(),
  pendingProducts = [],
  full = false,
  concurrency = 4,
  onProduct,
  onProgress
} = {}) {
  const startedAt = new Date().toISOString();
  const firstHtml = await fetchTextWithRetry(listingPageUrl(listingUrl, 1));
  const first = parseListingPage(firstHtml, listingUrl);
  const discovered = new Map(first.items.map((item) => [item.productUrl, item]));
  const shouldScanAll = full || knownUrls.size === 0;
  let scannedPages = 1;
  let consecutiveKnownPages = first.items.every((item) => knownUrls.has(item.productUrl)) ? 1 : 0;
  const maxPages = shouldScanAll ? first.totalPages : Math.min(first.totalPages, 30);

  for (let page = 2; page <= maxPages; page += 1) {
    if (!shouldScanAll && consecutiveKnownPages >= 2) break;
    const html = await fetchTextWithRetry(listingPageUrl(listingUrl, page));
    const parsed = parseListingPage(html, listingUrl);
    scannedPages += 1;
    const allKnown = parsed.items.length > 0 && parsed.items.every((item) => knownUrls.has(item.productUrl));
    consecutiveKnownPages = allKnown ? consecutiveKnownPages + 1 : 0;
    for (const item of parsed.items) discovered.set(item.productUrl, item);
    onProgress?.({ stage: "discovering_panini", startedAt, scannedPages, totalPages: first.totalPages, discovered: discovered.size });
  }

  const candidates = new Map();
  for (const item of discovered.values()) {
    if (!knownUrls.has(item.productUrl)) candidates.set(item.productUrl, item);
  }
  for (const item of pendingProducts || []) {
    if (item.productUrl) candidates.set(item.productUrl, item);
  }
  const queue = [...candidates.values()];
  const progress = {
    stage: "importing_panini",
    startedAt,
    scannedPages,
    catalogPages: first.totalPages,
    discoveredProducts: discovered.size,
    queuedProducts: queue.length,
    processedProducts: 0,
    matchedProducts: 0,
    pendingContains: 0,
    pendingMatch: 0,
    errors: []
  };
  onProgress?.({ ...progress });
  let nextIndex = 0;

  async function worker() {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= queue.length) return;
      const item = queue[index];
      try {
        const html = await fetchTextWithRetry(item.productUrl);
        const product = parseProductPage(html, item.productUrl, item.title);
        const result = await onProduct?.(product);
        if (result?.status === "matched") progress.matchedProducts += 1;
        else if (result?.status === "pending_contains") progress.pendingContains += 1;
        else if (result?.status === "pending_match") progress.pendingMatch += 1;
      } catch (error) {
        progress.errors.push({ productUrl: item.productUrl, message: error.message });
        await onProduct?.({ ...item, errorMessage: error.message });
      } finally {
        progress.processedProducts += 1;
        onProgress?.({ ...progress, errors: [...progress.errors] });
      }
    }
  }

  await Promise.all(Array.from({ length: Math.max(1, Math.min(8, concurrency)) }, () => worker()));
  return {
    ...progress,
    stage: progress.errors.length ? "completed_with_errors" : "completed",
    finishedAt: new Date().toISOString()
  };
}

module.exports = {
  DEFAULT_LISTING_URL,
  expandIssueNumbers,
  importPaniniCatalog,
  matchContainsToCatalog,
  parseListingPage,
  parseProductPage,
  parseSpanishDate,
  fetchTextWithRetry,
  sourceKeyFromUrl
};
