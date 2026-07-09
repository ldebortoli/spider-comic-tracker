const { deriveVolumeInfo } = require("./marvel");
const { sanitizeLine, toIsoDate, uniqueStrings } = require("./utils");
const { rosterFromCategories } = require("./catalog-characters");

const DIRECT_APPEARANCES_CATEGORY = "Category:Peter Parker (Earth-616)/Appearances";
const MINOR_APPEARANCES_CATEGORY = "Category:Peter Parker (Earth-616)/Minor Appearances";
const API_BATCH_SIZE = 10;

function buildApiUrl(baseUrl, params) {
  const url = new URL(`${String(baseUrl).replace(/\/$/, "")}/api.php`);
  url.search = new URLSearchParams({
    ...params,
    format: "json",
    formatversion: "2"
  }).toString();
  return url;
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function fetchJsonWithRetry(url, { attempts = 5 } = {}) {
  let lastError;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: {
          Accept: "application/json",
          "User-Agent": "SpiderTracker/0.2 (personal comic catalog)"
        },
        signal: AbortSignal.timeout(45_000)
      });

      if (!response.ok) {
        throw new Error(`Marvel Fandom respondió HTTP ${response.status}`);
      }

      const payload = await response.json();

      if (payload.error) {
        throw new Error(payload.error.info || payload.error.code || "Error de Marvel Fandom");
      }

      return payload;
    } catch (error) {
      lastError = error;

      if (attempt < attempts) {
        await wait(Math.min(8_000, 500 * (2 ** (attempt - 1))));
      }
    }
  }

  throw lastError;
}

async function fetchCategoryMembers({ baseUrl, categoryTitle, appearanceType, onProgress }) {
  const members = [];
  let continuation = "";

  do {
    const params = {
      action: "query",
      list: "categorymembers",
      cmtitle: categoryTitle,
      cmnamespace: "0",
      cmprop: "ids|title",
      cmlimit: "max"
    };

    if (continuation) {
      params.cmcontinue = continuation;
      params.continue = "-||";
    }

    const payload = await fetchJsonWithRetry(buildApiUrl(baseUrl, params));
    const page = payload?.query?.categorymembers || [];

    for (const member of page) {
      members.push({
        pageId: Number(member.pageid),
        pageTitle: member.title,
        appearanceType
      });
    }

    continuation = payload?.continue?.cmcontinue || "";
    onProgress?.({
      stage: "discovering",
      categoryTitle,
      discovered: members.length
    });
  } while (continuation);

  return members;
}

async function fetchRawCategoryMembers({ baseUrl, categoryTitle }) {
  const members = [];
  let continuation = "";

  do {
    const params = {
      action: "query",
      list: "categorymembers",
      cmtitle: categoryTitle,
      cmnamespace: "0",
      cmprop: "ids|title",
      cmlimit: "max"
    };

    if (continuation) {
      params.cmcontinue = continuation;
      params.continue = "-||";
    }

    const payload = await fetchJsonWithRetry(buildApiUrl(baseUrl, params));
    members.push(...(payload?.query?.categorymembers || []));
    continuation = payload?.continue?.cmcontinue || "";
  } while (continuation);

  return members.map((member) => ({
    pageId: Number(member.pageid),
    pageTitle: member.title
  }));
}

async function discoverCatalogRoster({ baseUrl }) {
  const [symbiotes, webWarriors, radioactiveSpiderPowered, humanSpiderHybrids, spiderArmy, spiderSociety] = await Promise.all([
    fetchRawCategoryMembers({ baseUrl, categoryTitle: "Category:Symbiotes" }),
    fetchRawCategoryMembers({ baseUrl, categoryTitle: "Category:Web-Warriors (Earth-001)/Members" }),
    fetchRawCategoryMembers({ baseUrl, categoryTitle: "Category:Radioactive Spider-Powered" }),
    fetchRawCategoryMembers({ baseUrl, categoryTitle: "Category:Human/Spider Hybrids" }),
    fetchRawCategoryMembers({ baseUrl, categoryTitle: "Category:Spider-Army (Multiverse)/Members" }),
    fetchRawCategoryMembers({ baseUrl, categoryTitle: "Category:Spider-Society (Multiverse)/Members" })
  ]);

  return rosterFromCategories({
    symbioteMembers: symbiotes.map((member) => member.pageTitle),
    spiderMembers: [
      ...radioactiveSpiderPowered,
      ...humanSpiderHybrids,
      ...spiderArmy,
      ...spiderSociety
    ].map((member) => member.pageTitle),
    webWarriorMembers: webWarriors.map((member) => member.pageTitle)
  });
}

async function fetchCharacterAppearanceMembers({ baseUrl, character, onProgress }) {
  const [direct, minor] = await Promise.all([
    fetchCategoryMembers({
      baseUrl,
      categoryTitle: `Category:${character.fandomEntity}/Appearances`,
      appearanceType: "direct",
      onProgress
    }),
    fetchCategoryMembers({
      baseUrl,
      categoryTitle: `Category:${character.fandomEntity}/Minor Appearances`,
      appearanceType: "minor",
      onProgress
    })
  ]);

  return mergeAppearanceMembers(direct, minor);
}

function mergeAppearanceMembers(directMembers, minorMembers) {
  const merged = new Map();

  for (const member of [...directMembers, ...minorMembers]) {
    const existing = merged.get(member.pageId);

    if (!existing || member.appearanceType === "direct") {
      merged.set(member.pageId, member);
    }
  }

  return [...merged.values()];
}

const APPEARANCE_DETAIL_TEMPLATES = [
  ["flashback", /\{\{\s*flashback\b/i],
  ["dream", /\{\{\s*dream\b/i],
  ["vision", /\{\{\s*vision\b/i],
  ["recap", /\{\{\s*recap\b/i],
  ["photo", /\{\{\s*(?:photo|photograph)\b/i],
  ["on-screen", /\{\{\s*onscreenonly\b/i],
  ["illusion", /\{\{\s*illusion\b/i],
  ["statue", /\{\{\s*statue\b/i],
  ["portrait", /\{\{\s*portrait\b/i],
  ["recording", /\{\{\s*(?:recording|video)\b/i]
];

function extractAppearanceDetails(wikitext) {
  const details = {};

  for (const line of String(wikitext || "").split(/\r?\n/)) {
    const entities = [...line.matchAll(/\[\[([^\]|#]+\(Earth-[^)]+\))(?=[\]|])/g)].map((match) => match[1].trim());
    if (!entities.length) continue;
    const detail = APPEARANCE_DETAIL_TEMPLATES.find(([, pattern]) => pattern.test(line))?.[0] || "";
    if (!detail) continue;
    for (const entity of entities) {
      if (!details[entity]) details[entity] = detail;
    }
  }

  return details;
}

function parseInfoboxes(rawInfoboxes) {
  if (!rawInfoboxes) {
    return [];
  }

  try {
    return JSON.parse(rawInfoboxes);
  } catch {
    return [];
  }
}

function findSourceValue(value, sourceName) {
  if (!value || typeof value !== "object") {
    return null;
  }

  if (value.source === sourceName && value.value !== undefined) {
    return value.value;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const match = findSourceValue(item, sourceName);
      if (match !== null) {
        return match;
      }
    }
    return null;
  }

  for (const nested of Object.values(value)) {
    const match = findSourceValue(nested, sourceName);
    if (match !== null) {
      return match;
    }
  }

  return null;
}

function findLabelValue(value, label) {
  if (!value || typeof value !== "object") {
    return null;
  }

  if (normalizeLabel(value.label) === normalizeLabel(label) && value.value !== undefined) {
    return value.value;
  }

  for (const nested of Array.isArray(value) ? value : Object.values(value)) {
    const match = findLabelValue(nested, label);
    if (match !== null) {
      return match;
    }
  }

  return null;
}

function normalizeLabel(value) {
  return sanitizeLine(value).toLowerCase().replace(/\s+/g, " ").trim();
}

const COVER_MONTHS = {
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  may: 5,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12
};

function parseFlexibleDate(value) {
  const cleaned = sanitizeLine(cleanWikiCreator(value || ""));
  const exact = toIsoDate(cleaned);

  if (exact) {
    return { date: exact, precision: "day" };
  }

  const monthMatch = cleaned.match(/\b([A-Za-z]+)\s*,?\s+(\d{4})\b/);
  const month = COVER_MONTHS[String(monthMatch?.[1] || "").toLowerCase()];

  if (month && monthMatch) {
    return {
      date: `${monthMatch[2]}-${String(month).padStart(2, "0")}-01`,
      precision: "month"
    };
  }

  const yearMatch = cleaned.match(/\b(\d{4})\b/);
  if (yearMatch) {
    return { date: `${yearMatch[1]}-01-01`, precision: "year" };
  }

  return null;
}

function readWikiField(wikitext, fieldName) {
  const escaped = String(fieldName).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = String(wikitext || "").match(new RegExp(`^\\s*\\|\\s*${escaped}\\s*=\\s*(.*?)\\s*$`, "mi"));
  return cleanWikiCreator(match?.[1] || "");
}

function parseDefaultSortDate(defaultSort) {
  const matches = String(defaultSort || "").match(/\b(\d{4})(\d{2})(\d{2})\b/g) || [];

  for (const compact of matches) {
    const year = Number(compact.slice(0, 4));
    const month = Number(compact.slice(4, 6));
    const day = Number(compact.slice(6, 8));
    const candidate = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const parsed = new Date(`${candidate}T00:00:00Z`);

    if (!Number.isNaN(parsed.getTime()) && parsed.getUTCFullYear() === year && parsed.getUTCMonth() + 1 === month && parsed.getUTCDate() === day) {
      return candidate;
    }
  }

  return null;
}

function cleanWikiCreator(value) {
  let text = String(value || "")
    .replace(/<!--[^]*?-->/g, " ")
    .replace(/<ref\b[^>]*>[^]*?<\/ref>/gi, " ")
    .replace(/<ref\b[^/]*\/>/gi, " ")
    .replace(/<br\s*\/?\s*>/gi, ", ")
    .replace(/\[\[[^\]|]+\|([^\]]+)\]\]/g, "$1")
    .replace(/\[\[([^\]]+)\]\]/g, "$1");

  for (let pass = 0; pass < 3; pass += 1) {
    text = text.replace(/\{\{([^{}]+)\}\}/g, (_, body) => {
      const parts = body.split("|").map((part) => part.trim()).filter(Boolean);
      return parts.length > 1 ? parts.slice(1).join(" ") : parts[0] || "";
    });
  }

  return sanitizeLine(text.replace(/'{2,}/g, "").replace(/\s*,\s*/g, ", "));
}

function normalizeWikiHeading(value) {
  return String(value || "")
    .replace(/^=+|=+$/g, "")
    .replace(/^'{2,}|'{2,}$/g, "")
    .replace(/:+$/g, "")
    .trim()
    .toLowerCase();
}

function sectionLabelFromWikiLine(line) {
  const headingMatch = String(line || "").trim().match(/^={2,}\s*(.*?)\s*={2,}$/);
  if (headingMatch) {
    return normalizeWikiHeading(headingMatch[1]);
  }

  const boldMatch = String(line || "").trim().match(/^;?\s*'{2,}\s*([^']+?)\s*:?\s*'{2,}\s*$/);
  return boldMatch ? normalizeWikiHeading(boldMatch[1]) : "";
}

function extractCharacterSection(wikitext, label) {
  const lines = String(wikitext || "").split(/\r?\n/);
  const target = normalizeWikiHeading(label);
  const sectionLabels = new Set([
    "featured characters",
    "supporting characters",
    "antagonists",
    "other characters",
    "locations",
    "items",
    "vehicles",
    "races and species",
    "notes",
    "trivia"
  ]);
  const values = [];
  let inSection = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    const heading = sectionLabelFromWikiLine(line);

    if (heading && sectionLabels.has(heading)) {
      if (inSection && heading && heading !== target) {
        break;
      }
      inSection = heading === target;
      continue;
    }

    if (!inSection) {
      continue;
    }

    const itemMatch = line.match(/^\*+\s*(.+)$/);
    if (!itemMatch) {
      continue;
    }

    const cleaned = cleanWikiCreator(itemMatch[1])
      .replace(/\s+\([^)]*(?:mentioned|referenced)[^)]*\)$/i, "")
      .trim();

    if (cleaned && !/^(?:none|unknown|-|n\/a)$/i.test(cleaned)) {
      values.push(cleaned);
    }
  }

  return uniqueStrings(values).slice(0, 120);
}

function extractWriters(wikitext) {
  const writers = [];
  const pattern = /^\s*\|\s*Writer(?:\d+)?(?:_\d+)?\s*=\s*(.*?)\s*$/gmi;

  for (const match of String(wikitext || "").matchAll(pattern)) {
    const writer = cleanWikiCreator(match[1]);

    if (writer && !/^(?:unknown|uncredited|none|-|n\/a)$/i.test(writer)) {
      writers.push(writer);
    }
  }

  return uniqueStrings(writers);
}

function extractCoverFileName(wikitext) {
  const match = String(wikitext || "").match(/^\s*\|\s*Image(?:1)?\s*=\s*(.*?)\s*$/mi);
  if (!match) {
    return "";
  }

  return String(match[1] || "")
    .replace(/<!--[^]*?-->/g, "")
    .replace(/^\[\[(?:File|Image):/i, "")
    .replace(/\]\]$/, "")
    .split("|")[0]
    .replace(/^(?:File|Image):/i, "")
    .trim();
}

async function fetchCoverImageUrls({ baseUrl, fileNames }) {
  const uniqueFileNames = uniqueStrings(fileNames.filter(Boolean));
  if (!uniqueFileNames.length) {
    return new Map();
  }

  const payload = await fetchJsonWithRetry(buildApiUrl(baseUrl, {
    action: "query",
    prop: "imageinfo",
    titles: uniqueFileNames.map((fileName) => `File:${fileName}`).join("|"),
    iiprop: "url",
    iiurlwidth: "360"
  }));
  const urls = new Map();

  for (const page of payload?.query?.pages || []) {
    const fileName = String(page.title || "").replace(/^File:/i, "");
    const imageInfo = page?.imageinfo?.[0];
    const imageUrl = imageInfo?.thumburl || imageInfo?.url || "";
    if (fileName && imageUrl) {
      urls.set(fileName, imageUrl);
    }
  }

  return urls;
}

function extractDateMetadata(page, wikitext) {
  const infoboxes = parseInfoboxes(page?.pageprops?.infoboxes);
  const releaseDateHtml = findSourceValue(infoboxes, "ReleaseDate");
  const fromInfobox = toIsoDate(sanitizeLine(releaseDateHtml || ""));

  if (fromInfobox) {
    return { releaseDate: fromInfobox, dateSource: "release", datePrecision: "day" };
  }

  const fromWikitext = toIsoDate(readWikiField(wikitext, "ReleaseDate"));
  if (fromWikitext) {
    return { releaseDate: fromWikitext, dateSource: "release", datePrecision: "day" };
  }

  const coverDateHtml = findLabelValue(infoboxes, "Cover Date") || findSourceValue(infoboxes, "CoverDate");
  const coverDateField = readWikiField(wikitext, "CoverDate");
  const coverMonth = readWikiField(wikitext, "Month");
  const coverDay = readWikiField(wikitext, "Day");
  const coverYear = readWikiField(wikitext, "Year");
  const constructedCoverDate = [coverMonth, coverDay ? `${coverDay},` : "", coverYear].filter(Boolean).join(" ");
  const coverDate = parseFlexibleDate(coverDateHtml || coverDateField || constructedCoverDate);

  if (coverDate) {
    return {
      releaseDate: coverDate.date,
      dateSource: "cover",
      datePrecision: coverDate.precision
    };
  }

  const fromDefaultSort = parseDefaultSortDate(page?.pageprops?.defaultsort);
  if (fromDefaultSort) {
    return { releaseDate: fromDefaultSort, dateSource: "defaultsort", datePrecision: "day" };
  }

  return { releaseDate: null, dateSource: "", datePrecision: "" };
}

function extractReleaseDate(page, wikitext) {
  return extractDateMetadata(page, wikitext).releaseDate;
}

function displayIssueTitle(volumeInfo, pageTitle) {
  if (!volumeInfo.issueLabel) {
    return String(pageTitle || "").replace(/_/g, " ");
  }

  const volume = volumeInfo.volumeNumber === null || volumeInfo.volumeNumber === undefined
    ? volumeInfo.seriesName
    : `${volumeInfo.seriesName} (Vol. ${volumeInfo.volumeNumber})`;
  return `${volume} #${volumeInfo.issueLabel}`;
}

function parseCatalogPage(page, member, baseUrl) {
  const wikitext = page?.revisions?.[0]?.slots?.main?.content || "";
  const dateMetadata = extractDateMetadata(page, wikitext);
  const volumeInfo = deriveVolumeInfo({
    pageTitle: page.title || member.pageTitle,
    title: page.title || member.pageTitle,
    baseUrl
  });

  return {
    fandomPageId: Number(page.pageid || member.pageId),
    pageTitle: page.title || member.pageTitle,
    title: displayIssueTitle(volumeInfo, page.title || member.pageTitle),
    fandomUrl: `${String(baseUrl).replace(/\/$/, "")}/wiki/${encodeURIComponent(String(page.title || member.pageTitle).replace(/ /g, "_"))}`,
    seriesName: volumeInfo.seriesName,
    volumeNumber: volumeInfo.volumeNumber,
    issueLabel: volumeInfo.issueLabel,
    issueNumber: volumeInfo.issueNumber,
    releaseDate: dateMetadata.releaseDate,
    dateSource: dateMetadata.dateSource,
    datePrecision: dateMetadata.datePrecision,
    coverImageUrl: page?.thumbnail?.source || "",
    coverFileName: extractCoverFileName(wikitext),
    writers: extractWriters(wikitext),
    antagonists: extractCharacterSection(wikitext, "Antagonists"),
    appearanceType: member.appearanceType,
    appearanceDetails: extractAppearanceDetails(wikitext),
    sourceDefaultSort: page?.pageprops?.defaultsort || ""
  };
}

async function fetchCatalogBatch({ baseUrl, members }) {
  const byPageId = new Map(members.map((member) => [member.pageId, member]));
  const payload = await fetchJsonWithRetry(buildApiUrl(baseUrl, {
    action: "query",
    prop: "categories|pageprops|pageimages|revisions",
    pageids: members.map((member) => member.pageId).join("|"),
    clcategories: "Category:Comics",
    piprop: "thumbnail",
    pithumbsize: "360",
    rvprop: "content",
    rvslots: "main"
  }));
  const pages = payload?.query?.pages || [];
  const comics = [];

  for (const page of pages) {
    const member = byPageId.get(Number(page.pageid));

    if (!member || page.missing || !page.categories?.some((category) => category.title === "Category:Comics")) {
      continue;
    }

    comics.push(parseCatalogPage(page, member, baseUrl));
  }

  const missingCoverComics = comics.filter((comic) => !comic.coverImageUrl && comic.coverFileName);
  if (missingCoverComics.length) {
    const coverUrls = await fetchCoverImageUrls({
      baseUrl,
      fileNames: missingCoverComics.map((comic) => comic.coverFileName)
    });

    for (const comic of missingCoverComics) {
      comic.coverImageUrl = coverUrls.get(comic.coverFileName) || "";
    }
  }

  return {
    comics,
    processed: pages.length,
    skipped: pages.length - comics.length
  };
}

function chunk(items, size) {
  const result = [];

  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }

  return result;
}

async function importSpiderManCatalog({ baseUrl, concurrency = 3, onItems, onProgress }) {
  const startedAt = new Date().toISOString();
  const directMembers = await fetchCategoryMembers({
    baseUrl,
    categoryTitle: DIRECT_APPEARANCES_CATEGORY,
    appearanceType: "direct",
    onProgress
  });
  const minorMembers = await fetchCategoryMembers({
    baseUrl,
    categoryTitle: MINOR_APPEARANCES_CATEGORY,
    appearanceType: "minor",
    onProgress
  });
  const members = mergeAppearanceMembers(directMembers, minorMembers);
  const batches = chunk(members, API_BATCH_SIZE);
  const progress = {
    stage: "importing",
    startedAt,
    totalDiscovered: members.length,
    totalBatches: batches.length,
    completedBatches: 0,
    processedPages: 0,
    importedComics: 0,
    skippedNonComics: 0,
    errors: []
  };

  onProgress?.({ ...progress });
  let nextBatch = 0;

  async function worker() {
    while (true) {
      const batchIndex = nextBatch;
      nextBatch += 1;

      if (batchIndex >= batches.length) {
        return;
      }

      try {
        const result = await fetchCatalogBatch({ baseUrl, members: batches[batchIndex] });
        await onItems?.(result.comics);
        progress.processedPages += result.processed;
        progress.importedComics += result.comics.length;
        progress.skippedNonComics += result.skipped;
      } catch (error) {
        progress.errors.push({
          batch: batchIndex + 1,
          pageTitles: batches[batchIndex].map((member) => member.pageTitle),
          message: error.message
        });
      } finally {
        progress.completedBatches += 1;
        onProgress?.({ ...progress, errors: [...progress.errors] });
      }
    }
  }

  await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, 5)) }, () => worker()));

  return {
    ...progress,
    stage: progress.errors.length ? "completed_with_errors" : "completed",
    finishedAt: new Date().toISOString()
  };
}

async function importCharacterCatalogs({
  baseUrl,
  characters,
  refreshExisting = true,
  hasIssue,
  onItems,
  onCharacterMembers,
  onProgress,
  concurrency = 3
}) {
  const startedAt = new Date().toISOString();
  const discoveries = new Map();
  const appearanceDetailsByPage = new Map();
  const errors = [];
  let nextCharacter = 0;
  let discoveredCharacters = 0;

  async function discoveryWorker() {
    while (true) {
      const index = nextCharacter;
      nextCharacter += 1;

      if (index >= characters.length) {
        return;
      }

      const character = characters[index];

      try {
        const members = await fetchCharacterAppearanceMembers({ baseUrl, character });
        discoveries.set(character.slug, { character, members });
      } catch (error) {
        errors.push({ character: character.slug, stage: "discovery", message: error.message });
      } finally {
        discoveredCharacters += 1;
        onProgress?.({
          stage: "discovering_characters",
          startedAt,
          totalCharacters: characters.length,
          completedCharacters: discoveredCharacters,
          currentCharacter: character.displayName,
          errors: [...errors]
        });
      }
    }
  }

  await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, 6)) }, () => discoveryWorker()));

  const union = new Map();

  for (const { members } of discoveries.values()) {
    for (const member of members) {
      if (!union.has(member.pageId)) {
        union.set(member.pageId, member);
      }
    }
  }

  const membersToFetch = [];

  for (const member of union.values()) {
    if (refreshExisting || !hasIssue?.(member.pageId)) {
      membersToFetch.push(member);
    }
  }

  const batches = chunk(membersToFetch, API_BATCH_SIZE);
  const importProgress = {
    stage: "importing",
    startedAt,
    totalCharacters: characters.length,
    completedCharacters: discoveries.size,
    totalDiscovered: union.size,
    existingSkipped: union.size - membersToFetch.length,
    totalBatches: batches.length,
    completedBatches: 0,
    processedPages: 0,
    importedComics: 0,
    skippedNonComics: 0,
    errors
  };
  let nextBatch = 0;

  async function importWorker() {
    while (true) {
      const batchIndex = nextBatch;
      nextBatch += 1;

      if (batchIndex >= batches.length) {
        return;
      }

      try {
        const result = await fetchCatalogBatch({ baseUrl, members: batches[batchIndex] });
        for (const comic of result.comics) {
          appearanceDetailsByPage.set(comic.fandomPageId, comic.appearanceDetails || {});
        }
        await onItems?.(result.comics);
        importProgress.processedPages += result.processed;
        importProgress.importedComics += result.comics.length;
        importProgress.skippedNonComics += result.skipped;
      } catch (error) {
        importProgress.errors.push({
          batch: batchIndex + 1,
          stage: "metadata",
          pageTitles: batches[batchIndex].map((member) => member.pageTitle),
          message: error.message
        });
      } finally {
        importProgress.completedBatches += 1;
        onProgress?.({ ...importProgress, errors: [...importProgress.errors] });
      }
    }
  }

  await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, 5)) }, () => importWorker()));

  const characterResults = [];

  for (const { character, members } of discoveries.values()) {
    try {
      const enrichedMembers = members.map((member) => ({
        ...member,
        appearanceDetail: member.appearanceType === "minor"
          ? (appearanceDetailsByPage.get(member.pageId)?.[character.fandomEntity] || "")
          : ""
      }));
      const result = await onCharacterMembers?.(character, enrichedMembers);
      characterResults.push({
        slug: character.slug,
        displayName: character.displayName,
        ...result
      });
    } catch (error) {
      importProgress.errors.push({ character: character.slug, stage: "linking", message: error.message });
    }
  }

  return {
    ...importProgress,
    stage: importProgress.errors.length ? "completed_with_errors" : "completed",
    characterResults,
    finishedAt: new Date().toISOString()
  };
}

module.exports = {
  API_BATCH_SIZE,
  DIRECT_APPEARANCES_CATEGORY,
  MINOR_APPEARANCES_CATEGORY,
  cleanWikiCreator,
  discoverCatalogRoster,
  extractDateMetadata,
  extractAppearanceDetails,
  extractReleaseDate,
  extractCoverFileName,
  extractWriters,
  fetchCoverImageUrls,
  fetchCatalogBatch,
  fetchCategoryMembers,
  fetchCharacterAppearanceMembers,
  fetchRawCategoryMembers,
  importCharacterCatalogs,
  importSpiderManCatalog,
  mergeAppearanceMembers,
  parseCatalogPage,
  parseDefaultSortDate
};
