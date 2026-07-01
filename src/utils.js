const MONTHS = {
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

const WEEKDAY_TO_INDEX = {
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
  sunday: 7
};

function nowIso() {
  return new Date().toISOString();
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function includesNormalized(text, alias) {
  const normalizedText = ` ${normalizeText(text)} `;
  const normalizedAlias = normalizeText(alias);

  if (!normalizedAlias) {
    return false;
  }

  return normalizedText.includes(` ${normalizedAlias} `);
}

function parseHumanDate(input) {
  const match = String(input || "").match(/([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})/);

  if (!match) {
    return null;
  }

  const month = MONTHS[match[1].toLowerCase()];

  if (!month) {
    return null;
  }

  return {
    year: Number(match[3]),
    month,
    day: Number(match[2])
  };
}

function toIsoDate(input) {
  const parts = parseHumanDate(input);

  if (!parts) {
    return null;
  }

  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

function decodeHtmlEntities(value) {
  return String(value || "")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)))
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function stripTags(value) {
  return decodeHtmlEntities(String(value || "").replace(/<[^>]+>/g, " "));
}

function sanitizeLine(value) {
  return stripTags(value)
    .replace(/\s+/g, " ")
    .trim();
}

function getTimeZoneParts(date, timeZone) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    weekday: "long"
  });

  const parts = formatter.formatToParts(date);
  const get = (type) => parts.find((part) => part.type === type)?.value;

  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    hour: Number(get("hour")),
    minute: Number(get("minute")),
    second: Number(get("second")),
    weekday: String(get("weekday") || "").toUpperCase()
  };
}

function getIsoWeekInfo(date, timeZone) {
  const parts = getTimeZoneParts(date, timeZone);
  const utcDate = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  const day = utcDate.getUTCDay() || 7;
  utcDate.setUTCDate(utcDate.getUTCDate() + 4 - day);
  const isoYear = utcDate.getUTCFullYear();
  const yearStart = new Date(Date.UTC(isoYear, 0, 1));
  const weekNumber = Math.ceil((((utcDate - yearStart) / 86400000) + 1) / 7);

  return {
    isoYear,
    weekNumber,
    weekdayIndex: WEEKDAY_TO_INDEX[parts.weekday.toLowerCase()] || 0,
    localDayName: parts.weekday,
    localHour: parts.hour,
    localMinute: parts.minute
  };
}

function buildWeekKey(year, weekNumber) {
  return `${year}-W${String(weekNumber).padStart(2, "0")}`;
}

function scheduleDayIndex(dayName) {
  return WEEKDAY_TO_INDEX[String(dayName || "").toLowerCase()] || 0;
}

function safeJsonParse(value, fallback) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function uniqueStrings(items) {
  return [...new Set((items || []).filter(Boolean))];
}

module.exports = {
  buildWeekKey,
  decodeHtmlEntities,
  getIsoWeekInfo,
  getTimeZoneParts,
  includesNormalized,
  normalizeText,
  nowIso,
  parseHumanDate,
  safeJsonParse,
  sanitizeLine,
  scheduleDayIndex,
  stripTags,
  toIsoDate,
  uniqueStrings
};
