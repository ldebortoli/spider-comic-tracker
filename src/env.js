const fs = require("node:fs");
const path = require("node:path");

function loadEnv(envPath = path.resolve(process.cwd(), ".env")) {
  if (!fs.existsSync(envPath)) {
    return;
  }

  const content = fs.readFileSync(envPath, "utf8");

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();

    if (!line || line.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");

    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    let value = line.slice(separatorIndex + 1).trim();

    if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function toNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toBoolean(value, fallback) {
  if (value === undefined) {
    return fallback;
  }

  const normalized = String(value).trim().toLowerCase();

  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }

  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }

  return fallback;
}

function getConfig() {
  return {
    port: toNumber(process.env.PORT, 8787),
    timezone: process.env.APP_TIMEZONE || "America/Buenos_Aires",
    dbPath: path.resolve(process.cwd(), process.env.DB_PATH || "data/comics.sqlite"),
    publicDir: path.resolve(process.cwd(), "public"),
    marvelBaseUrl: process.env.MARVEL_BASE_URL || "https://marvel.fandom.com",
    panini: {
      listingUrl: process.env.PANINI_LISTING_URL || "https://www.panini.es/shp_esp_es/comics/marvel.html?skip_default_filters=true",
      concurrency: Math.max(1, Math.min(8, toNumber(process.env.PANINI_CONCURRENCY, 4)))
    },
    schedule: {
      enabled: toBoolean(process.env.SCHEDULE_ENABLED, true),
      day: (process.env.SCHEDULE_DAY || "WEDNESDAY").toUpperCase(),
      hour: toNumber(process.env.SCHEDULE_HOUR, 12),
      minute: toNumber(process.env.SCHEDULE_MINUTE, 0)
    },
    catalogRefresh: {
      enabled: toBoolean(process.env.CATALOG_REFRESH_ENABLED, true),
      intervalMonths: Math.max(1, toNumber(process.env.CATALOG_REFRESH_INTERVAL_MONTHS, 3))
    },
    telegram: {
      botToken: process.env.TELEGRAM_BOT_TOKEN || "",
      reviewChatId: process.env.TELEGRAM_REVIEW_CHAT_ID || "",
      summaryChatId: process.env.TELEGRAM_SUMMARY_CHAT_ID || process.env.TELEGRAM_REVIEW_CHAT_ID || "",
      backupChatId: process.env.TELEGRAM_BACKUP_CHAT_ID || process.env.TELEGRAM_SUMMARY_CHAT_ID || process.env.TELEGRAM_REVIEW_CHAT_ID || "",
      allowedUserId: process.env.TELEGRAM_ALLOWED_USER_ID || ""
    },
    backup: {
      enabled: toBoolean(process.env.BACKUP_ENABLED, true),
      intervalWeeks: toNumber(process.env.BACKUP_INTERVAL_WEEKS, 16),
      dir: path.resolve(process.cwd(), process.env.BACKUP_DIR || "data/backups"),
      maxBytes: toNumber(process.env.BACKUP_MAX_BYTES, 2 * 1024 * 1024 * 1024),
      telegramMaxBytes: toNumber(process.env.BACKUP_TELEGRAM_MAX_BYTES, 50 * 1024 * 1024),
      retentionCount: toNumber(process.env.BACKUP_RETENTION_COUNT, 4)
    }
  };
}

module.exports = {
  getConfig,
  loadEnv
};
