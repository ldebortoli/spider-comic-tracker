const {
  buildWeekKey,
  includesNormalized,
  normalizeText,
  sanitizeLine,
  toIsoDate,
  uniqueStrings
} = require("./utils");

const SECTION_LABELS = [
  "Featured Characters",
  "Supporting Characters",
  "Antagonists",
  "Other Characters",
  "Races and Species",
  "Realities",
  "Locations",
  "Items",
  "Synopsis for",
  "Solicit Synopsis",
  "See Also",
  "Links and References",
  "References"
];

const EXPLICIT_REPRINT_PATTERNS = [
  {
    pattern: /reprint of the \d+(?:st|nd|rd|th) story from/i,
    reason: "La ficha indica explícitamente que la historia es un reprint."
  },
  {
    pattern: /reprinting\s+[^\n<]+/i,
    reason: "La sinopsis indica explícitamente que este número vuelve a imprimir material previo."
  },
  {
    pattern: /re-presented in its original form/i,
    reason: "La sinopsis indica que el material se republica en su forma original."
  },
  {
    pattern: /original credits are italicized/i,
    reason: "La ficha menciona créditos originales, una señal típica de reimpresión."
  }
];

const EXPLICIT_REPRINT_KEYWORDS = [
  {
    pattern: /facsimile edition/i,
    reason: "El título incluye 'Facsimile Edition'."
  },
  {
    pattern: /\bomnibus\b/i,
    reason: "El título incluye 'Omnibus'."
  },
  {
    pattern: /\bepic collection\b/i,
    reason: "El título incluye 'Epic Collection'."
  },
  {
    pattern: /\bmasterworks\b/i,
    reason: "El título incluye 'Masterworks'."
  },
  {
    pattern: /\bgallery edition\b/i,
    reason: "El título incluye 'Gallery Edition'."
  },
  {
    pattern: /\bcomplete collection\b/i,
    reason: "El título incluye 'Complete Collection'."
  },
  {
    pattern: /\btreasury edition\b/i,
    reason: "El título incluye 'Treasury Edition'."
  }
];

const UNCERTAIN_REPRINT_PATTERNS = [
  {
    pattern: /\bcollect(?:ing|s)\b/i,
    reason: "La ficha menciona 'collecting' o 'collects', señal común de recopilatorio."
  }
];

function buildWikiUrl(baseUrl, pageTitle) {
  return `${baseUrl}/wiki/${encodeURIComponent(String(pageTitle).replace(/ /g, "_"))}`;
}

function buildRenderUrl(baseUrl, pageTitle) {
  return `${buildWikiUrl(baseUrl, pageTitle)}?action=render`;
}

function buildParseUrl(baseUrl, pageTitle) {
  const url = new URL(`${String(baseUrl).replace(/\/$/, "")}/api.php`);
  url.search = new URLSearchParams({
    action: "parse",
    page: pageTitle,
    prop: "text",
    format: "json",
    formatversion: "2"
  }).toString();
  return url.toString();
}

function isRetryableStatus(status) {
  return status === 403 || status === 408 || status === 425 || status === 429 || status >= 500;
}

async function fetchResponseWithRetry(url, {
  fetchImpl = globalThis.fetch,
  attempts = 3,
  retryDelayMs = 150,
  label = "Marvel"
} = {}) {
  let lastError;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetchImpl(url, {
        headers: {
          "User-Agent": "ComicTracker/0.1 (+local)"
        }
      });

      if (response.ok) return response;

      lastError = new Error(`${label} devolvió ${response.status} para ${url}`);
      lastError.status = response.status;
      if (!isRetryableStatus(response.status)) break;
    } catch (error) {
      lastError = new Error(`${label} no respondió para ${url}: ${error.message}`, { cause: error });
    }

    if (attempt < attempts && retryDelayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs * attempt));
    }
  }

  throw lastError || new Error(`${label} no respondió para ${url}`);
}

async function fetchJson(url, options = {}) {
  const response = await fetchResponseWithRetry(url, { ...options, label: "Marvel API" });

  return response.json();
}

async function fetchText(url, options = {}) {
  const response = await fetchResponseWithRetry(url, { ...options, label: "Marvel render" });
  return response.text();
}

async function fetchRenderedPageHtml({
  baseUrl,
  pageTitle,
  fetchImpl = globalThis.fetch,
  retryDelayMs = 150
}) {
  const requestOptions = { fetchImpl, retryDelayMs };

  try {
    return await fetchText(buildRenderUrl(baseUrl, pageTitle), requestOptions);
  } catch (renderError) {
    try {
      const payload = await fetchJson(buildParseUrl(baseUrl, pageTitle), requestOptions);
      const html = payload?.parse?.text;
      if (!html) throw new Error("La API no devolvió HTML para la ficha.");
      return html;
    } catch (parseError) {
      throw new Error(
        `No se pudo obtener ${pageTitle}. action=render: ${renderError.message}; action=parse: ${parseError.message}`,
        { cause: parseError }
      );
    }
  }
}

function normalizeHeading(line) {
  return normalizeText(String(line || "").replace(/:$/, ""));
}

function htmlToLines(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|section|aside|figure|figcaption|h1|h2|h3|h4|h5|h6|table|tr|tbody|thead|ul|ol|dl|dd|dt|blockquote)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "\n* ")
    .split(/\n+/)
    .map((line) => sanitizeLine(line))
    .filter(Boolean);
}

function isBoundaryLine(line) {
  const normalized = normalizeHeading(line);

  return SECTION_LABELS.some((label) => normalized === normalizeHeading(label) || normalized.startsWith(normalizeHeading(label)));
}

function findLineIndex(lines, label) {
  const normalizedLabel = normalizeHeading(label);

  return lines.findIndex((line) => {
    const normalized = normalizeHeading(line);
    return normalized === normalizedLabel || normalized.startsWith(`${normalizedLabel} `);
  });
}

function readValueAfterLabel(lines, label) {
  const index = findLineIndex(lines, label);

  if (index === -1) {
    return "";
  }

  for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
    if (!lines[cursor]) {
      continue;
    }

    if (isBoundaryLine(lines[cursor])) {
      break;
    }

    return lines[cursor];
  }

  return "";
}

function collectSection(lines, label) {
  const index = findLineIndex(lines, label);

  if (index === -1) {
    return [];
  }

  const values = [];

  for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
    const line = lines[cursor];

    if (!line) {
      continue;
    }

    if (isBoundaryLine(line)) {
      break;
    }

    if (!line.startsWith("*")) {
      continue;
    }

    const cleaned = line
      .replace(/^\*\s*/, "")
      .replace(/\s+\([^)]*mentioned[^)]*\)$/i, "")
      .replace(/\s+\([^)]*referenced[^)]*\)$/i, "")
      .trim();

    if (cleaned) {
      values.push(cleaned);
    }
  }

  return uniqueStrings(values);
}

function parseAppearanceCategories(categories) {
  const appearances = [];
  for (const category of categories || []) {
    const title = String(category?.title || category || "");
    const match = title.match(/^Category:(.+?)\/(Minor )?Appearances$/i);
    if (!match) continue;
    appearances.push({
      fandomEntity: match[1],
      appearanceType: match[2] ? "minor" : "direct"
    });
  }
  return appearances;
}

async function fetchComicAppearanceCategories({ baseUrl, pageTitle }) {
  const categories = [];
  let continuation = "";
  do {
    const url = new URL(`${String(baseUrl).replace(/\/$/, "")}/api.php`);
    const params = {
      action: "query",
      prop: "categories",
      titles: pageTitle,
      cllimit: "max",
      format: "json",
      formatversion: "2"
    };
    if (continuation) params.clcontinue = continuation;
    url.search = new URLSearchParams(params).toString();
    const payload = await fetchJson(url);
    categories.push(...(payload?.query?.pages?.[0]?.categories || []));
    continuation = payload?.continue?.clcontinue || "";
  } while (continuation);
  return parseAppearanceCategories(categories);
}

function extractSynopsis(lines) {
  const index = findLineIndex(lines, "Solicit Synopsis");

  if (index === -1) {
    return "";
  }

  const parts = [];

  for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
    const line = lines[cursor];

    if (!line) {
      continue;
    }

    if (isBoundaryLine(line)) {
      break;
    }

    parts.push(line.replace(/^\*\s*/, "").trim());
  }

  return parts.join(" ").trim();
}

function extractSectionText(lines, label) {
  const index = findLineIndex(lines, label);

  if (index === -1) {
    return "";
  }

  const parts = [];

  for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
    const line = lines[cursor];

    if (!line) {
      continue;
    }

    if (isBoundaryLine(line) || normalizeHeading(line) === "categories" || normalizeHeading(line) === "languages") {
      break;
    }

    parts.push(line.replace(/^\*\s*/, "").trim());
  }

  return parts.join(" ").trim();
}

function extractCoverImageUrl(html) {
  const matches = [...html.matchAll(/https?:\/\/static\.wikia\.nocookie\.net\/[^"'<>\\\s]+\.(?:jpg|jpeg|png|webp)(?:\?[^"'<>\\\s]*)?/gi)]
    .map((match) => match[0].replace(/&amp;/g, "&"));

  return uniqueStrings(matches)[0] || "";
}

function looksLikeTitle(line) {
  if (!line) {
    return false;
  }

  if (/^(part of|lgy:|previous issue|next issue|this comic will be released|art by:)/i.test(line)) {
    return false;
  }

  return /#\d+/.test(line) || /infinity comic/i.test(line) || /omnibus/i.test(line) || /epic collection/i.test(line);
}

function extractTitle(lines, pageTitle) {
  const releaseDateIndex = findLineIndex(lines, "Release Date");
  const searchWindow = releaseDateIndex === -1 ? lines.slice(0, 30) : lines.slice(0, releaseDateIndex);

  for (const line of searchWindow) {
    if (looksLikeTitle(line)) {
      return line;
    }
  }

  return String(pageTitle || "").replace(/_/g, " ");
}

function toInteger(value) {
  const match = String(value || "").match(/\d+/);
  return match ? Number(match[0]) : null;
}

function parseIssueNumber(issueLabel, title) {
  const issueMatch = String(issueLabel || "").match(/^#?(\d+)/);

  if (issueMatch) {
    return Number(issueMatch[1]);
  }

  const titleMatch = String(title || "").match(/#(\d+)/);

  if (titleMatch) {
    return Number(titleMatch[1]);
  }

  return null;
}

function deriveVolumeInfo({ pageTitle, title, fandomUrl, baseUrl }) {
  const cleanPageTitle = String(pageTitle || "").replace(/_/g, " ").trim();
  const cleanTitle = String(title || "").trim();
  const resolvedBaseUrl = baseUrl || (fandomUrl ? new URL(fandomUrl).origin : "https://marvel.fandom.com");

  const pageTitleMatch = cleanPageTitle.match(/^(.*?)(?:\s+Vol(?:ume)?\.?\s+)(\d+)\s+(.+)$/i);

  if (pageTitleMatch) {
    const seriesName = pageTitleMatch[1].trim();
    const volumeNumber = Number(pageTitleMatch[2]);
    const issueLabel = pageTitleMatch[3].trim();
    const volumePageTitle = `${seriesName} Vol ${volumeNumber}`;

    return {
      seriesName,
      volumeNumber,
      volumeName: `${seriesName} (Vol. ${volumeNumber})`,
      volumePageTitle,
      volumeFandomUrl: buildWikiUrl(resolvedBaseUrl, volumePageTitle),
      issueLabel,
      issueNumber: parseIssueNumber(issueLabel, cleanTitle)
    };
  }

  const titleWithVolumeMatch = cleanTitle.match(/^(.*?)(?:\s+\(Vol\.\s*(\d+)\))\s+#(.+)$/i);

  if (titleWithVolumeMatch) {
    const seriesName = titleWithVolumeMatch[1].trim();
    const volumeNumber = Number(titleWithVolumeMatch[2]);
    const issueLabel = titleWithVolumeMatch[3].trim();
    const volumePageTitle = `${seriesName} Vol ${volumeNumber}`;

    return {
      seriesName,
      volumeNumber,
      volumeName: `${seriesName} (Vol. ${volumeNumber})`,
      volumePageTitle,
      volumeFandomUrl: buildWikiUrl(resolvedBaseUrl, volumePageTitle),
      issueLabel,
      issueNumber: parseIssueNumber(issueLabel, cleanTitle)
    };
  }

  const titleWithoutIssueMatch = cleanTitle.match(/^(.*?)(?:\s+#(.+))$/);

  if (titleWithoutIssueMatch) {
    const seriesName = titleWithoutIssueMatch[1].trim();
    const issueLabel = titleWithoutIssueMatch[2].trim();

    return {
      seriesName,
      volumeNumber: null,
      volumeName: seriesName,
      volumePageTitle: seriesName,
      volumeFandomUrl: buildWikiUrl(resolvedBaseUrl, seriesName),
      issueLabel,
      issueNumber: parseIssueNumber(issueLabel, cleanTitle)
    };
  }

  return {
    seriesName: cleanTitle || cleanPageTitle,
    volumeNumber: null,
    volumeName: cleanTitle || cleanPageTitle,
    volumePageTitle: cleanPageTitle || cleanTitle,
    volumeFandomUrl: buildWikiUrl(resolvedBaseUrl, cleanPageTitle || cleanTitle),
    issueLabel: "",
    issueNumber: null
  };
}

function extractVolumeType(volumeHtml) {
  if (!volumeHtml) {
    return "";
  }

  return readValueAfterLabel(htmlToLines(volumeHtml), "Type");
}

function shouldFetchVolumeMetadata(details) {
  const titleSignals = [details.title, details.pageTitle, details.volumeName].filter(Boolean).join(" ");

  if (EXPLICIT_REPRINT_KEYWORDS.some((entry) => entry.pattern.test(titleSignals))) {
    return true;
  }

  if (details.isbn) {
    return true;
  }

  if (details.pages && details.pages >= 80) {
    return true;
  }

  if (EXPLICIT_REPRINT_PATTERNS.some((entry) => entry.pattern.test(details.sourceHtml || ""))) {
    return true;
  }

  if (UNCERTAIN_REPRINT_PATTERNS.some((entry) => entry.pattern.test(details.sourceHtml || ""))) {
    return true;
  }

  return false;
}

function evaluateOriginality(details) {
  const explicitReasons = [];
  const uncertainReasons = [];
  const issueText = [
    details.title,
    details.pageTitle,
    details.volumeName,
    details.synopsis,
    details.sourceHtml || ""
  ].join("\n");
  const volumeText = [
    details.volumeName,
    details.volumeType || "",
    details.volumeSourceHtml || ""
  ].join("\n");
  const keywordSources = [details.title, details.pageTitle, details.volumeName].filter(Boolean);

  for (const source of [issueText, volumeText]) {
    for (const entry of EXPLICIT_REPRINT_PATTERNS) {
      if (entry.pattern.test(source)) {
        explicitReasons.push(entry.reason);
      }
    }

    for (const entry of UNCERTAIN_REPRINT_PATTERNS) {
      if (entry.pattern.test(source)) {
        uncertainReasons.push(entry.reason);
      }
    }
  }

  for (const source of keywordSources) {
    for (const entry of EXPLICIT_REPRINT_KEYWORDS) {
      if (entry.pattern.test(source)) {
        explicitReasons.push(entry.reason);
      }
    }
  }

  if (/type:\s*reprint series/i.test(volumeText) || /reprint series/i.test(details.volumeType || "")) {
    explicitReasons.push("La página del volumen lo clasifica como Reprint Series.");
  }

  if (/type:\s*tpb edition/i.test(volumeText) || /tpb edition/i.test(details.volumeType || "")) {
    explicitReasons.push("La página del volumen lo clasifica como TPB Edition.");
  }

  if (/this volume is a tpb edition/i.test(volumeText)) {
    explicitReasons.push("La página del volumen indica que es una TPB edition.");
  }

  if (/trade paperbacks/i.test(volumeText)) {
    explicitReasons.push("La página del volumen indica que pertenece a Trade Paperbacks.");
  }

  if (details.isbn && details.pages && details.pages >= 80 && !explicitReasons.length) {
    uncertainReasons.push(`Tiene ISBN y ${details.pages} páginas, algo más común en tomos o recopilatorios que en un issue nuevo.`);
  }

  if (!details.isbn && details.pages && details.pages >= 120 && !explicitReasons.length) {
    uncertainReasons.push(`Tiene ${details.pages} páginas, un conteo atípicamente alto para un issue nuevo.`);
  }

  const dedupedExplicit = uniqueStrings(explicitReasons);
  const dedupedUncertain = uniqueStrings(uncertainReasons);

  if (dedupedExplicit.length) {
    return {
      status: "reprint",
      reason: dedupedExplicit.join(" "),
      evidence: dedupedExplicit
    };
  }

  if (dedupedUncertain.length) {
    return {
      status: "uncertain",
      reason: dedupedUncertain.join(" "),
      evidence: dedupedUncertain
    };
  }

  return {
    status: "new",
    reason: "No se detectaron señales de reedición o recopilatorio.",
    evidence: []
  };
}

function buildCharacterRows(details, classification) {
  const rows = [];

  const pushSection = (items, section) => {
    for (const item of items) {
      rows.push({
        name: item,
        section,
        isMatch: (classification.matches || []).some((match) => {
          return match.section === section && includesNormalized(item, match.alias);
        })
      });
    }
  };

  pushSection(details.featuredCharacters, "featured");
  pushSection(details.supportingCharacters, "supporting");
  pushSection(details.antagonists, "antagonists");
  pushSection(details.otherCharacters, "other");

  return rows;
}

function classifyComic(details, trackedCharacters) {
  const matches = [];
  const synopsis = details.synopsis || "";

  for (const character of trackedCharacters.filter((item) => item.active)) {
    const categoryAppearance = (details.appearanceCategories || []).find((appearance) => (
      normalizeText(appearance.fandomEntity) === normalizeText(character.fandomEntity)
    ));
    if (categoryAppearance) {
      const direct = categoryAppearance.appearanceType === "direct";
      matches.push({
        character: character.displayName,
        section: direct ? "category_direct" : "category_minor",
        alias: character.fandomEntity,
        strength: direct ? "strong" : "weak",
        evidence: direct
          ? `Marvel Fandom lo incluye en las apariciones de ${character.displayName}.`
          : `Marvel Fandom lo incluye como aparición menor de ${character.displayName}.`
      });
    }

    for (const alias of character.aliases) {
      if (!alias) {
        continue;
      }

      if (includesNormalized(details.title, alias)) {
        matches.push({
          character: character.displayName,
          section: "title",
          alias,
          strength: "strong",
          evidence: `Coincidió por título con "${alias}".`
        });
      }

      if (details.featuredCharacters.some((item) => includesNormalized(item, alias))) {
        matches.push({
          character: character.displayName,
          section: "featured",
          alias,
          strength: "strong",
          evidence: `Coincidió en Featured Characters con "${alias}".`
        });
      }

      if (details.supportingCharacters.some((item) => includesNormalized(item, alias))) {
        matches.push({
          character: character.displayName,
          section: "supporting",
          alias,
          strength: "weak",
          evidence: `Coincidió en Supporting Characters con "${alias}".`
        });
      }

      if (details.antagonists.some((item) => includesNormalized(item, alias))) {
        matches.push({
          character: character.displayName,
          section: "antagonists",
          alias,
          strength: "weak",
          evidence: `Coincidió en Antagonists con "${alias}".`
        });
      }

      if (details.otherCharacters.some((item) => includesNormalized(item, alias))) {
        matches.push({
          character: character.displayName,
          section: "other",
          alias,
          strength: "weak",
          evidence: `Coincidió en Other Characters con "${alias}".`
        });
      }

      if (synopsis && includesNormalized(synopsis, alias)) {
        matches.push({
          character: character.displayName,
          section: "synopsis",
          alias,
          strength: "weak",
          evidence: `Coincidió en la sinopsis con "${alias}".`
        });
      }
    }
  }

  const deduped = [];
  const seen = new Set();

  for (const match of matches) {
    const key = `${match.character}:${match.section}:${normalizeText(match.alias)}`;

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    deduped.push(match);
  }

  const strongMatches = deduped.filter((match) => match.strength === "strong");
  const weakMatches = deduped.filter((match) => match.strength === "weak");
  const matchSummary = uniqueStrings(deduped.map((match) => match.character));
  const originality = evaluateOriginality(details);

  if (originality.status === "reprint") {
    return {
      decision: "auto_rejected",
      reason: `Descartado porque no parece material nuevo. ${originality.reason}`,
      matches: deduped,
      matchSummary,
      originalityStatus: originality.status,
      originalityReason: originality.reason
    };
  }

  if (strongMatches.length > 0) {
    if (originality.status === "uncertain") {
      return {
        decision: "pending_review",
        reason: `Coincidencia fuerte con personajes seguidos, pero hay dudas sobre si es material nuevo. ${originality.reason}`,
        matches: strongMatches,
        matchSummary,
        originalityStatus: originality.status,
        originalityReason: originality.reason
      };
    }

    return {
      decision: "auto_added",
      reason: strongMatches.map((match) => match.evidence).join(" "),
      matches: strongMatches,
      matchSummary,
      originalityStatus: originality.status,
      originalityReason: originality.reason
    };
  }

  if (weakMatches.length > 0) {
    const baseReason = weakMatches.map((match) => match.evidence).join(" ");

    return {
      decision: "pending_review",
      reason: originality.status === "uncertain"
        ? `${baseReason} Ademas, hay dudas sobre si es material nuevo. ${originality.reason}`
        : baseReason,
      matches: weakMatches,
      matchSummary,
      originalityStatus: originality.status,
      originalityReason: originality.reason
    };
  }

  return {
    decision: "auto_rejected",
    reason: "No se detectaron protagonistas o coincidencias claras con la lista seguida.",
    matches: [],
    matchSummary: [],
    originalityStatus: originality.status,
    originalityReason: originality.reason
  };
}

function parseComicArticleHtml(pageTitle, html, baseUrl) {
  const lines = htmlToLines(html);
  const title = extractTitle(lines, pageTitle);
  const releaseDateHuman = readValueAfterLabel(lines, "Release Date");
  const releaseDate = toIsoDate(releaseDateHuman);
  const volumeInfo = deriveVolumeInfo({
    pageTitle,
    title,
    baseUrl
  });

  if (!releaseDate) {
    throw new Error(`No se pudo extraer la fecha de ${pageTitle}`);
  }

  return {
    title,
    pageTitle,
    fandomUrl: buildWikiUrl(baseUrl, pageTitle),
    releaseDate,
    releaseDateHuman,
    coverImageUrl: extractCoverImageUrl(html),
    pages: toInteger(readValueAfterLabel(lines, "Pages")),
    isbn: readValueAfterLabel(lines, "ISBN"),
    seriesName: volumeInfo.seriesName,
    volumeName: volumeInfo.volumeName,
    volumeNumber: volumeInfo.volumeNumber,
    volumePageTitle: volumeInfo.volumePageTitle,
    volumeFandomUrl: volumeInfo.volumeFandomUrl,
    issueLabel: volumeInfo.issueLabel,
    issueNumber: volumeInfo.issueNumber,
    featuredCharacters: collectSection(lines, "Featured Characters"),
    supportingCharacters: collectSection(lines, "Supporting Characters"),
    antagonists: collectSection(lines, "Antagonists"),
    otherCharacters: collectSection(lines, "Other Characters"),
    synopsis: extractSynopsis(lines),
    sourceHtml: html
  };
}

async function fetchWeekReleases({ baseUrl, weekYear, weekNumber }) {
  const url = new URL(`${baseUrl}/api.php`);
  url.search = new URLSearchParams({
    action: "query",
    list: "categorymembers",
    cmtitle: `Category:Week_${String(weekNumber).padStart(2, "0")},_${weekYear}`,
    cmlimit: "max",
    format: "json"
  }).toString();

  const payload = await fetchJson(url);
  const members = payload?.query?.categorymembers || [];

  return {
    weekYear,
    weekNumber,
    weekKey: buildWeekKey(weekYear, weekNumber),
    members: members
      .filter((member) => member.ns === 0)
      .map((member) => ({
        pageTitle: member.title
      }))
  };
}

async function fetchComicDetails({ baseUrl, pageTitle }) {
  const [html, appearanceCategories] = await Promise.all([
    fetchRenderedPageHtml({ baseUrl, pageTitle }),
    fetchComicAppearanceCategories({ baseUrl, pageTitle })
  ]);
  const details = parseComicArticleHtml(pageTitle, html, baseUrl);
  details.appearanceCategories = appearanceCategories;

  details.volumeSourceHtml = "";
  details.volumeType = "";
  details.volumeNotes = "";

  if (shouldFetchVolumeMetadata(details)) {
    try {
      const volumeHtml = await fetchRenderedPageHtml({ baseUrl, pageTitle: details.volumePageTitle });
      details.volumeSourceHtml = volumeHtml;
      details.volumeType = extractVolumeType(volumeHtml);
      details.volumeNotes = extractSectionText(htmlToLines(volumeHtml), "Notes");
    } catch {
      details.volumeSourceHtml = "";
      details.volumeType = "";
      details.volumeNotes = "";
    }
  }

  return details;
}

module.exports = {
  buildCharacterRows,
  classifyComic,
  deriveVolumeInfo,
  evaluateOriginality,
  fetchComicDetails,
  fetchComicAppearanceCategories,
  fetchRenderedPageHtml,
  fetchWeekReleases,
  parseComicArticleHtml,
  parseAppearanceCategories,
  shouldFetchVolumeMetadata
};
