const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");
const { pipeline } = require("node:stream/promises");

const { discoverCatalogRoster, importCharacterCatalogs } = require("./catalog");
const { buildCharacterRows, classifyComic, fetchComicDetails, fetchWeekReleases } = require("./marvel");
const { importPaniniCatalog } = require("./panini");
const { importUniversoMarvelCatalog } = require("./universo-marvel");
const { buildWeekKey, getIsoWeekInfo, nowIso, scheduleDayIndex, uniqueStrings } = require("./utils");

function isLeapYear(year) {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function isoWeeksInYear(year) {
  const januaryFirstDay = new Date(Date.UTC(year, 0, 1)).getUTCDay();
  return januaryFirstDay === 4 || (januaryFirstDay === 3 && isLeapYear(year)) ? 53 : 52;
}

function compareIsoWeeks(left, right) {
  if (left.weekYear !== right.weekYear) return left.weekYear - right.weekYear;
  return left.weekNumber - right.weekNumber;
}

function nextIsoWeek(week) {
  if (week.weekNumber < isoWeeksInYear(week.weekYear)) {
    return { weekYear: week.weekYear, weekNumber: week.weekNumber + 1 };
  }
  return { weekYear: week.weekYear + 1, weekNumber: 1 };
}

function buildCatchUpWeeks(lastCompleted, target) {
  if (!lastCompleted || compareIsoWeeks(lastCompleted, target) >= 0) {
    return [{ ...target, weekKey: buildWeekKey(target.weekYear, target.weekNumber) }];
  }

  const weeks = [];
  let cursor = nextIsoWeek(lastCompleted);
  while (compareIsoWeeks(cursor, target) <= 0) {
    weeks.push({ ...cursor, weekKey: buildWeekKey(cursor.weekYear, cursor.weekNumber) });
    cursor = nextIsoWeek(cursor);
  }
  return weeks;
}

function aggregateWeeklyReviews(weekSummaries) {
  const first = weekSummaries[0] || {};
  const last = weekSummaries[weekSummaries.length - 1] || {};
  const numericFields = [
    "processed",
    "added",
    "rejected",
    "pendingReview",
    "alreadyIncluded",
    "alreadyRejected",
    "pendingAlreadyOpen",
    "errors"
  ];
  const titleFields = ["addedTitles", "rejectedTitles", "pendingTitles", "erroredTitles"];
  const summary = {
    weekKey: last.weekKey || "",
    fromWeekKey: first.weekKey || "",
    toWeekKey: last.weekKey || "",
    weeksReviewed: weekSummaries.length,
    weekSummaries
  };

  for (const field of numericFields) {
    summary[field] = weekSummaries.reduce((total, item) => total + Number(item[field] || 0), 0);
  }
  for (const field of titleFields) {
    summary[field] = uniqueStrings(weekSummaries.flatMap((item) => item[field] || []));
  }
  return summary;
}

function isIncludedDecision(decision) {
  return decision === "auto_added" || decision === "manual_added";
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) {
    return "desconocido";
  }

  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let index = 0;

  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }

  return `${value.toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

class ComicTrackerService {
  constructor({ db, config }) {
    this.db = db;
    this.config = config;
    this.telegram = null;
    this.currentSyncPromise = null;
    this.currentCatalogImportPromise = null;
    this.currentPaniniImportPromise = null;
    this.currentWeeklyUpdatePromise = null;
    this.currentQuarterlyRefreshPromise = null;
    this.schedulerHandle = null;
    this.enemyOptionCache = new Map();
  }

  attachTelegram(telegram) {
    this.telegram = telegram;
  }

  getDashboard() {
    return {
      stats: this.db.getDashboardStats(),
      lastSync: this.db.getLastSyncRun(),
      backup: this.getBackupStatus(),
      pendingReviews: this.db.listPendingReviews(),
      schedule: {
        enabled: this.config.schedule.enabled,
        day: this.config.schedule.day,
        hour: this.config.schedule.hour,
        minute: this.config.schedule.minute,
        timezone: this.config.timezone,
        windowsTaskInstalled: fs.existsSync(path.resolve(process.cwd(), "data/weekly-task-installed.json"))
      },
      weeklyUpdate: this.getWeeklyUpdateStatus(),
      paniniImport: this.getPaniniImportStatus(),
      quarterlyRefresh: this.getQuarterlyRefreshStatus(),
      telegram: this.telegram?.getStatus?.() || { configured: false, running: false },
      config: {
        telegramConfigured: Boolean(this.config.telegram.botToken && this.config.telegram.reviewChatId),
        telegramUserRestricted: Boolean(this.config.telegram.allowedUserId),
        syncRunning: Boolean(this.currentSyncPromise),
        catalogImportRunning: Boolean(this.currentCatalogImportPromise),
        paniniImportRunning: Boolean(this.currentPaniniImportPromise),
        weeklyUpdateRunning: Boolean(this.currentWeeklyUpdatePromise),
        quarterlyRefreshRunning: Boolean(this.currentQuarterlyRefreshPromise)
      }
    };
  }

  getBackupStatus() {
    return {
      enabled: this.config.backup.enabled,
      intervalWeeks: this.config.backup.intervalWeeks,
      lastAttemptAt: this.db.getState("backup_last_attempt_at", ""),
      lastSentAt: this.db.getState("backup_last_sent_at", ""),
      lastFileName: this.db.getState("backup_last_file_name", ""),
      lastSizeBytes: Number(this.db.getState("backup_last_size_bytes", "0") || 0),
      lastStatus: this.db.getState("backup_last_status", "never"),
      lastReason: this.db.getState("backup_last_reason", "")
    };
  }

  setBackupStatus({ attemptAt, sentAt, fileName, sizeBytes, status, reason }) {
    if (attemptAt !== undefined) {
      this.db.setState("backup_last_attempt_at", attemptAt || "");
    }

    if (sentAt !== undefined) {
      this.db.setState("backup_last_sent_at", sentAt || "");
    }

    if (fileName !== undefined) {
      this.db.setState("backup_last_file_name", fileName || "");
    }

    if (sizeBytes !== undefined) {
      this.db.setState("backup_last_size_bytes", String(sizeBytes || 0));
    }

    if (status !== undefined) {
      this.db.setState("backup_last_status", status || "");
    }

    if (reason !== undefined) {
      this.db.setState("backup_last_reason", reason || "");
    }
  }

  backupIsDue() {
    if (!this.config.backup.enabled) {
      return false;
    }

    const lastSentAt = this.db.getState("backup_last_sent_at", "");

    if (!lastSentAt) {
      return true;
    }

    const lastSentMs = Date.parse(lastSentAt);

    if (Number.isNaN(lastSentMs)) {
      return true;
    }

    const intervalMs = this.config.backup.intervalWeeks * 7 * 24 * 60 * 60 * 1000;
    return (Date.now() - lastSentMs) >= intervalMs;
  }

  async compressBackup(sourcePath, targetPath) {
    await pipeline(
      fs.createReadStream(sourcePath),
      zlib.createGzip({ level: zlib.constants.Z_BEST_SPEED }),
      fs.createWriteStream(targetPath)
    );
  }

  cleanupBackupArtifacts(paths) {
    for (const candidate of paths) {
      if (!candidate) {
        continue;
      }

      try {
        if (fs.existsSync(candidate)) {
          fs.unlinkSync(candidate);
        }
      } catch {
        // Ignore cleanup failures for temp artifacts.
      }
    }
  }

  pruneBackupDirectory() {
    fs.mkdirSync(this.config.backup.dir, { recursive: true });
    const files = fs.readdirSync(this.config.backup.dir)
      .filter((name) => name.endsWith(".sqlite.gz"))
      .map((name) => {
        const absolutePath = path.resolve(this.config.backup.dir, name);
        return {
          name,
          absolutePath,
          mtimeMs: fs.statSync(absolutePath).mtimeMs
        };
      })
      .sort((a, b) => b.mtimeMs - a.mtimeMs);

    for (const file of files.slice(Math.max(0, this.config.backup.retentionCount))) {
      this.cleanupBackupArtifacts([file.absolutePath]);
    }
  }

  async maybeSendPeriodicBackup({ triggerSource, weekYear, weekNumber }) {
    if (!this.backupIsDue()) {
      return { attempted: false, reason: "not_due" };
    }

    return this.createAndSendBackup({ triggerSource, weekYear, weekNumber });
  }

  async createAndSendBackup({ triggerSource, weekYear, weekNumber }) {
    const stamp = nowIso().replace(/[:.]/g, "-");
    const baseName = `comics-backup-${stamp}`;
    const rawPath = path.resolve(this.config.backup.dir, `${baseName}.sqlite`);
    const gzipPath = path.resolve(this.config.backup.dir, `${baseName}.sqlite.gz`);
    const weekKey = buildWeekKey(weekYear, weekNumber);
    const sentAt = nowIso();

    fs.mkdirSync(this.config.backup.dir, { recursive: true });

    try {
      this.db.createBackupSnapshot(rawPath);
      const rawStats = fs.statSync(rawPath);

      if (rawStats.size > this.config.backup.maxBytes) {
        const reason = `Backup omitido: ${path.basename(rawPath)} pesa ${formatBytes(rawStats.size)}, por encima del límite configurado de ${formatBytes(this.config.backup.maxBytes)}.`;
        this.setBackupStatus({
          attemptAt: sentAt,
          status: "skipped_too_large",
          reason,
          fileName: path.basename(rawPath),
          sizeBytes: rawStats.size
        });

        if (this.telegram && this.telegram.canSendBackups()) {
          await this.telegram.sendBackupNotice({
            text: [
              "Backup periódico omitido",
              "",
              `Semana: ${weekKey}`,
              `Origen: ${triggerSource}`,
              reason
            ].join("\n")
          });
        }

        this.cleanupBackupArtifacts([rawPath]);
        return { attempted: true, sent: false, reason: "too_large" };
      }

      await this.compressBackup(rawPath, gzipPath);
      const gzipStats = fs.statSync(gzipPath);
      this.cleanupBackupArtifacts([rawPath]);

      if (this.telegram && this.telegram.canSendBackups() && gzipStats.size <= this.config.backup.telegramMaxBytes) {
        await this.telegram.sendBackupFile({
          filePath: gzipPath,
          fileName: path.basename(gzipPath),
          caption: [
            "Backup periódico de base de datos",
            `Semana: ${weekKey}`,
            `Origen: ${triggerSource}`,
            `Tamaño comprimido: ${formatBytes(gzipStats.size)}`
          ].join("\n")
        });

        this.setBackupStatus({
          attemptAt: sentAt,
          sentAt,
          fileName: path.basename(gzipPath),
          sizeBytes: gzipStats.size,
          status: "sent",
          reason: `Backup enviado por Telegram (${formatBytes(gzipStats.size)}).`
        });
      } else {
        const reason = this.telegram && this.telegram.canSendBackups()
          ? `Backup generado pero no enviado: ${path.basename(gzipPath)} pesa ${formatBytes(gzipStats.size)} y el Bot API solo permite hasta ${formatBytes(this.config.backup.telegramMaxBytes)} por documento.`
          : `Backup generado localmente, pero el backup de Telegram no está configurado. Archivo: ${path.basename(gzipPath)} (${formatBytes(gzipStats.size)}).`;

        this.setBackupStatus({
          attemptAt: sentAt,
          fileName: path.basename(gzipPath),
          sizeBytes: gzipStats.size,
          status: "stored_local",
          reason
        });

        if (this.telegram && this.telegram.canSendBackups()) {
          await this.telegram.sendBackupNotice({
            text: [
              "Backup periódico generado",
              "",
              `Semana: ${weekKey}`,
              `Origen: ${triggerSource}`,
              reason
            ].join("\n")
          });
        }
      }

      this.pruneBackupDirectory();
      return { attempted: true, sent: true };
    } catch (error) {
      const reason = `Falló el backup periódico: ${error.message}`;
      this.setBackupStatus({
        attemptAt: sentAt,
        status: "failed",
        reason
      });

      if (this.telegram && this.telegram.canSendBackups()) {
        await this.telegram.sendBackupNotice({
          text: [
            "Falló el backup periódico",
            "",
            `Semana: ${weekKey}`,
            `Origen: ${triggerSource}`,
            `Error: ${error.message}`
          ].join("\n")
        });
      }

      this.cleanupBackupArtifacts([rawPath, gzipPath]);
      throw error;
    }
  }

  listComics(filters) {
    return this.db.listIncludedComics(filters);
  }

  listComicEnemies(filters) {
    return this.getCachedEnemyOptions("comics", filters, () => this.db.listComicEnemies(filters));
  }

  listCatalogIssues(filters) {
    return this.db.listCatalogIssues(filters);
  }

  listCatalogEnemies(filters) {
    return this.getCachedEnemyOptions("catalog", filters, () => this.db.listCatalogEnemies(filters));
  }

  getCachedEnemyOptions(scope, filters, loader) {
    const key = `${scope}:${JSON.stringify(filters || {})}`;
    const cached = this.enemyOptionCache.get(key);
    const maxAgeMs = 5 * 60 * 1000;

    if (cached && Date.now() - cached.createdAt < maxAgeMs) {
      return cached.value;
    }

    const value = loader();
    this.enemyOptionCache.set(key, { createdAt: Date.now(), value });
    if (this.enemyOptionCache.size > 40) {
      this.enemyOptionCache.delete(this.enemyOptionCache.keys().next().value);
    }
    return value;
  }

  clearEnemyOptionCache() {
    this.enemyOptionCache.clear();
  }

  listCatalogCharacters() {
    return this.db.listCatalogCharacters();
  }

  getCatalogStats(characterSlug, universeGroup) {
    return this.db.getCatalogStats(characterSlug, universeGroup);
  }

  listSpanishEditions(filters) {
    return this.db.listSpanishEditions(filters);
  }

  createSpanishEdition(payload) {
    return this.db.saveSpanishEdition(null, payload);
  }

  updateSpanishEdition(id, payload) {
    return this.db.saveSpanishEdition(id, payload);
  }

  deleteSpanishEdition(id) {
    return this.db.deleteSpanishEdition(id);
  }

  searchCatalogIssues(query, limit) {
    return this.db.searchCatalogIssues(query, limit);
  }

  exportCatalogCsv() {
    const quote = (value) => `"${String(value ?? "").replace(/"/g, "\"\"")}"`;
    const headers = [
      "Título",
      "Personaje",
      "Realidad del personaje",
      "Grupo",
      "Serie",
      "Volumen",
      "Issue",
      "Fecha de publicación",
      "Fuente de la fecha",
      "Precisión de la fecha",
      "Guionistas",
      "Tipo de aparición",
      "Tengo",
      "Editorial",
      "Edición o tomo",
      "Notas",
      "Marvel Fandom"
    ];
    const rows = this.db.listAllCatalogMemberships().map(({ character, issue }) => [
      issue.title,
      character.displayName,
      character.reality,
      character.kind === "symbiote" ? "Simbionte" : "Arácnido",
      issue.seriesName,
      issue.volumeNumber ?? "",
      issue.issueLabel,
      issue.releaseDate || "",
      issue.dateSource === "cover" ? "Cover Date" : issue.dateSource === "release" ? "Release Date" : issue.dateSource || "",
      issue.datePrecision || "",
      issue.writers.join("; "),
      issue.appearanceType === "minor" ? "Aparición menor" : "Aparición",
      issue.owned ? "Sí" : "No",
      issue.ownedPublisher,
      issue.ownedEdition,
      issue.collectionNotes,
      issue.fandomUrl
    ]);

    return `\uFEFF${[headers, ...rows].map((row) => row.map(quote).join(",")).join("\r\n")}`;
  }

  getCatalogImportStatus() {
    let stored = {};

    try {
      stored = JSON.parse(this.db.getState("catalog_import_status", "{}"));
    } catch {
      stored = {};
    }

    return {
      ...stored,
      running: Boolean(this.currentCatalogImportPromise)
    };
  }

  getPaniniImportStatus() {
    let stored = {};
    try {
      stored = JSON.parse(this.db.getState("panini_import_status", "{}"));
    } catch {
      stored = {};
    }
    return { ...stored, running: Boolean(this.currentPaniniImportPromise) };
  }

  getWeeklyUpdateStatus() {
    let stored = {};

    try {
      stored = JSON.parse(this.db.getState("weekly_update_status", "{}"));
    } catch {
      stored = {};
    }

    return {
      ...stored,
      running: Boolean(this.currentWeeklyUpdatePromise)
    };
  }

  saveWeeklyUpdateStatus(status) {
    this.db.setState("weekly_update_status", JSON.stringify(status));
  }

  ensureQuarterlyRefreshBaseline() {
    if (!this.db.getState("catalog_full_refresh_last_at", "")) {
      this.db.setState("catalog_full_refresh_last_at", nowIso());
    }
  }

  addMonthsToDate(date, months) {
    const next = new Date(date);
    next.setUTCMonth(next.getUTCMonth() + months);
    return next;
  }

  getQuarterlyRefreshDates() {
    const lastRefreshAt = this.db.getState("catalog_full_refresh_last_at", "");
    const lastDate = lastRefreshAt ? new Date(lastRefreshAt) : null;
    const validLastDate = lastDate && !Number.isNaN(lastDate.getTime()) ? lastDate : null;
    const minimumNextDate = validLastDate ? this.addMonthsToDate(validLastDate, 3) : null;
    const defaultNextDate = validLastDate
      ? this.addMonthsToDate(validLastDate, this.config.catalogRefresh.intervalMonths)
      : null;
    const configuredNextRefreshAt = (
      this.db.getState("catalog_full_refresh_next_at", "") ||
      this.config.catalogRefresh.nextRefreshAt ||
      ""
    );
    const configuredNextDate = configuredNextRefreshAt ? new Date(configuredNextRefreshAt) : null;
    const validConfiguredNextDate = configuredNextDate && !Number.isNaN(configuredNextDate.getTime())
      ? configuredNextDate
      : null;
    let nextDate = validConfiguredNextDate || defaultNextDate;

    if (minimumNextDate && nextDate && nextDate.getTime() < minimumNextDate.getTime()) {
      nextDate = minimumNextDate;
    }

    return {
      lastRefreshAt,
      minimumNextRefreshAt: minimumNextDate?.toISOString() || "",
      configuredNextRefreshAt: validConfiguredNextDate?.toISOString() || "",
      nextRefreshAt: nextDate?.toISOString() || ""
    };
  }

  getQuarterlyRefreshStatus() {
    let stored = {};
    try {
      stored = JSON.parse(this.db.getState("quarterly_refresh_status", "{}"));
    } catch {
      stored = {};
    }
    const dates = this.getQuarterlyRefreshDates();
    const nextDate = dates.nextRefreshAt ? new Date(dates.nextRefreshAt) : null;
    return {
      ...stored,
      enabled: this.config.catalogRefresh.enabled,
      intervalMonths: this.config.catalogRefresh.intervalMonths,
      ...dates,
      due: Boolean(nextDate && Date.now() >= nextDate.getTime()),
      running: Boolean(this.currentQuarterlyRefreshPromise)
    };
  }

  configureQuarterlyRefresh({ enabled, nextRefreshAt }) {
    this.ensureQuarterlyRefreshBaseline();
    const normalizedEnabled = Boolean(enabled);
    const normalizedNextRefreshAt = String(nextRefreshAt || "").trim();
    const dates = this.getQuarterlyRefreshDates();
    const minimumDate = dates.minimumNextRefreshAt ? new Date(dates.minimumNextRefreshAt) : null;
    const nextDate = normalizedNextRefreshAt ? new Date(normalizedNextRefreshAt) : null;

    if (normalizedEnabled && (!nextDate || Number.isNaN(nextDate.getTime()))) {
      throw new Error("Elegí una fecha válida para la próxima revisión completa.");
    }

    if (nextDate && minimumDate && nextDate.getTime() < minimumDate.getTime()) {
      throw new Error(`La próxima revisión debe ser al menos 3 meses después de la última: ${minimumDate.toISOString()}.`);
    }

    this.config.catalogRefresh.enabled = normalizedEnabled;
    this.config.catalogRefresh.nextRefreshAt = nextDate ? nextDate.toISOString() : "";
    this.db.setState("catalog_full_refresh_next_at", this.config.catalogRefresh.nextRefreshAt);
    return this.getQuarterlyRefreshStatus();
  }

  startQuarterlyRefresh({ triggerSource = "quarterly", force = false } = {}) {
    if (!this.config.catalogRefresh.enabled && !force) return { started: false, disabled: true };
    if (this.currentSyncPromise || this.currentCatalogImportPromise || this.currentWeeklyUpdatePromise || this.currentQuarterlyRefreshPromise) {
      return { started: false, running: true };
    }
    const startedAt = nowIso();
    this.db.setState("quarterly_refresh_status", JSON.stringify({
      status: "running",
      stage: "refreshing_all_metadata",
      triggerSource,
      startedAt,
      finishedAt: ""
    }));
    const promise = this.performCatalogImport({ incremental: false, triggerSource })
      .then((result) => {
        this.db.setState("quarterly_refresh_status", JSON.stringify({
          status: "completed",
          stage: "completed",
          triggerSource,
          startedAt,
          finishedAt: nowIso(),
          importedComics: result.importedComics || 0,
          errors: result.errors?.length || 0
        }));
        return result;
      })
      .catch((error) => {
        this.db.setState("quarterly_refresh_status", JSON.stringify({
          status: "failed",
          stage: "failed",
          triggerSource,
          startedAt,
          finishedAt: nowIso(),
          errorMessage: error.message
        }));
        console.error("Error en la revisión trimestral de metadatos:", error);
      })
      .finally(() => {
        if (this.currentCatalogImportPromise === promise) this.currentCatalogImportPromise = null;
        if (this.currentQuarterlyRefreshPromise === promise) this.currentQuarterlyRefreshPromise = null;
      });
    this.currentCatalogImportPromise = promise;
    this.currentQuarterlyRefreshPromise = promise;
    return { started: true, running: true, triggerSource, startedAt };
  }

  maybeRunQuarterlyRefresh() {
    this.ensureQuarterlyRefreshBaseline();
    const status = this.getQuarterlyRefreshStatus();
    if (status.enabled && status.due) this.startQuarterlyRefresh({ triggerSource: "quarterly" });
  }

  updateCatalogCollection(id, payload) {
    const result = this.db.updateCatalogCollection(id, payload);
    this.clearEnemyOptionCache();
    return result;
  }

  startCatalogImport({ characterSlug = "", incremental = false } = {}) {
    if (this.currentCatalogImportPromise || this.currentWeeklyUpdatePromise || this.currentPaniniImportPromise) {
      return { started: false, running: true };
    }

    const selected = characterSlug ? this.db.getCatalogCharacter(characterSlug) : null;

    if (characterSlug && !selected) {
      return { started: false, running: false, notFound: true };
    }

    this.currentCatalogImportPromise = this.performCatalogImport({ characterSlug, incremental })
      .catch((error) => {
        console.error("Error importando el catálogo histórico:", error);
      })
      .finally(() => {
        this.currentCatalogImportPromise = null;
      });

    return {
      started: true,
      running: true,
      characterSlug,
      incremental,
      startingFrom: selected?.lastComicDate || ""
    };
  }

  async performCatalogImport({ characterSlug = "", incremental = false, triggerSource = "manual", onProgress } = {}) {
    const importContext = {
      characterSlug,
      incremental,
      triggerSource,
      startingFrom: characterSlug ? this.db.getCatalogCharacter(characterSlug)?.lastComicDate || "" : ""
    };
    const saveProgress = (progress) => {
      const status = { ...importContext, ...progress };
      this.db.setState("catalog_import_status", JSON.stringify(status));
      onProgress?.(status);
    };

    saveProgress({
      stage: "starting",
      running: true,
      startedAt: nowIso(),
      ...importContext
    });

    try {
      if (!characterSlug) {
        const roster = await discoverCatalogRoster({ baseUrl: this.config.marvelBaseUrl });
        this.db.upsertCatalogCharacters(roster);
      }

      const characters = characterSlug
        ? this.db.listCatalogCharacters().filter((character) => character.slug === characterSlug)
        : this.db.listCatalogCharacters();
      const result = await importCharacterCatalogs({
        baseUrl: this.config.marvelBaseUrl,
        characters,
        concurrency: 5,
        refreshExisting: !incremental,
        hasIssue: (pageId) => Boolean(this.db.getCatalogIssueByFandomPageId(pageId)),
        onItems: (items) => this.db.upsertCatalogIssues(items),
        onCharacterMembers: (character, members) => this.db.replaceCatalogCharacterIssues(
          character.slug,
          members,
          "completed"
        ),
        onProgress: (progress) => saveProgress({ ...progress, running: true })
      });
      const finalStatus = {
        ...result,
        running: false,
        characterSlug,
        incremental,
        startingFrom: characterSlug ? characters[0]?.lastComicDate || "" : ""
      };
      this.clearEnemyOptionCache();
      saveProgress(finalStatus);
      if (!characterSlug && !incremental) {
        this.db.setState("catalog_full_refresh_last_at", finalStatus.finishedAt || nowIso());
      }
      return finalStatus;
    } catch (error) {
      if (characterSlug) {
        this.db.markCatalogCharacterSyncFailed(characterSlug);
      }
      const failedStatus = {
        ...this.getCatalogImportStatus(),
        stage: "failed",
        running: false,
        finishedAt: nowIso(),
        errorMessage: error.message
      };
      saveProgress(failedStatus);
      throw error;
    }
  }

  startPaniniImport({ full = false, triggerSource = "manual" } = {}) {
    if (this.currentPaniniImportPromise || this.currentWeeklyUpdatePromise) {
      return { started: false, running: true };
    }
    this.currentPaniniImportPromise = this.performPaniniImport({ full, triggerSource })
      .catch((error) => console.error("Error importando Panini:", error))
      .finally(() => { this.currentPaniniImportPromise = null; });
    return { started: true, running: true, full };
  }

  async performPaniniImport({ full = false, triggerSource = "manual" } = {}) {
    const effectiveFull = full || this.db.getState("panini_full_scan_completed", "") !== "true";
    const baseStatus = { running: true, stage: "starting", full: effectiveFull, triggerSource, startedAt: nowIso() };
    const saveProgress = (progress) => {
      this.db.setState("panini_import_status", JSON.stringify({ ...baseStatus, ...progress }));
    };
    saveProgress(baseStatus);
    try {
      let official = null;
      let officialError = "";
      try {
        official = await importPaniniCatalog({
          listingUrl: this.config.panini.listingUrl,
          knownUrls: new Set(this.db.listKnownPaniniProductUrls()),
          pendingProducts: this.db.listPendingPaniniProducts().filter((item) => !String(item.sourceKey || "").startsWith("um-")),
          full: effectiveFull,
          concurrency: this.config.panini.concurrency,
          onProduct: (product) => this.db.processPaniniProduct(product),
          onProgress: (progress) => saveProgress({ ...progress, running: true })
        });
      } catch (error) {
        officialError = error.message;
        saveProgress({ running: true, stage: "official_source_unavailable", warning: officialError });
      }
      if (official && official.scannedPages >= official.catalogPages) {
        this.db.setState("panini_full_scan_completed", "true");
      }

      const universoMarvel = await importUniversoMarvelCatalog({
        db: this.db,
        indexBatch: effectiveFull ? 75 : 25,
        productBatch: effectiveFull ? 500 : 100,
        concurrency: this.config.panini.concurrency,
        onProgress: (progress) => saveProgress({ ...progress, running: true, officialError })
      });
      const completed = {
        running: false,
        stage: officialError ? "completed_with_warnings" : "completed",
        status: officialError ? "completed_with_warnings" : "completed",
        full: effectiveFull,
        triggerSource,
        startedAt: baseStatus.startedAt,
        finishedAt: nowIso(),
        official,
        officialError,
        universoMarvel,
        processedProducts: Number(official?.processedProducts || 0) + Number(universoMarvel.processed || 0),
        matchedProducts: Number(official?.matchedProducts || 0) + Number(universoMarvel.matched || 0),
        pendingContains: Number(official?.pendingContains || 0),
        pendingMatch: Number(official?.pendingMatch || 0) + Number(universoMarvel.pendingMatch || 0),
        errors: [...(official?.errors || []), ...(universoMarvel.errors || [])]
      };
      this.db.setState("panini_import_status", JSON.stringify(completed));
      return completed;
    } catch (error) {
      const failed = {
        ...this.getPaniniImportStatus(),
        running: false,
        stage: "failed",
        finishedAt: nowIso(),
        errorMessage: error.message,
        full,
        triggerSource
      };
      this.db.setState("panini_import_status", JSON.stringify(failed));
      throw error;
    }
  }

  listTrackedCharacters() {
    return this.db.getTrackedCharacters();
  }

  createTrackedCharacter(payload) {
    return this.db.createTrackedCharacter(payload);
  }

  updateTrackedCharacter(id, payload) {
    return this.db.updateTrackedCharacter(id, payload);
  }

  deleteTrackedCharacter(id) {
    return this.db.deleteTrackedCharacter(id);
  }

  startScheduler() {
    if (this.schedulerHandle) {
      return;
    }

    this.ensureQuarterlyRefreshBaseline();

    this.schedulerHandle = setInterval(() => {
      this.maybeRunScheduledSync().catch((error) => {
        console.error("Error en scheduler semanal:", error);
      });
      this.maybeRunQuarterlyRefresh();
    }, 60 * 1000);

    this.maybeRunScheduledSync().catch((error) => {
      console.error("Error inicial del scheduler:", error);
    });
    this.maybeRunQuarterlyRefresh();
  }

  async maybeRunScheduledSync() {
    if (!this.config.schedule.enabled) {
      return;
    }

    if (this.currentSyncPromise || this.currentCatalogImportPromise || this.currentPaniniImportPromise || this.currentWeeklyUpdatePromise) {
      return;
    }

    const now = new Date();
    const weekInfo = getIsoWeekInfo(now, this.config.timezone);
    const currentWeekKey = buildWeekKey(weekInfo.isoYear, weekInfo.weekNumber);
    const attemptKey = this.db.getState("last_scheduled_attempt_week_key", "");
    const scheduledDayIndex = scheduleDayIndex(this.config.schedule.day);
    const currentMinuteOfDay = weekInfo.localHour * 60 + weekInfo.localMinute;
    const scheduledMinuteOfDay = this.config.schedule.hour * 60 + this.config.schedule.minute;
    const shouldRunNow = (
      weekInfo.weekdayIndex > scheduledDayIndex ||
      (weekInfo.weekdayIndex === scheduledDayIndex && currentMinuteOfDay >= scheduledMinuteOfDay)
    );

    if (!shouldRunNow || attemptKey === currentWeekKey) {
      return;
    }

    const result = this.startWeeklyUpdate({
      triggerSource: "scheduled",
      weekYear: weekInfo.isoYear,
      weekNumber: weekInfo.weekNumber
    });

    if (result.started) {
      this.db.setState("last_scheduled_attempt_week_key", currentWeekKey);
    }
  }

  getWeeklyReviewPlan(weekYear, weekNumber) {
    const target = { weekYear: Number(weekYear), weekNumber: Number(weekNumber) };
    const lastCompleted = typeof this.db.getLastCompletedSyncRun === "function"
      ? this.db.getLastCompletedSyncRun(target)
      : null;
    const weeks = buildCatchUpWeeks(lastCompleted, target);
    return {
      lastCompleted,
      weeks,
      fromWeekKey: weeks[0].weekKey,
      toWeekKey: weeks[weeks.length - 1].weekKey
    };
  }

  startWeeklyUpdate({ triggerSource = "scheduled", weekYear, weekNumber } = {}) {
    if (this.currentWeeklyUpdatePromise || this.currentSyncPromise || this.currentCatalogImportPromise || this.currentPaniniImportPromise) {
      return { started: false, running: true };
    }

    const nowWeek = getIsoWeekInfo(new Date(), this.config.timezone);
    const finalWeekYear = weekYear || nowWeek.isoYear;
    const finalWeekNumber = weekNumber || nowWeek.weekNumber;
    const weekKey = buildWeekKey(finalWeekYear, finalWeekNumber);
    const reviewPlan = this.getWeeklyReviewPlan(finalWeekYear, finalWeekNumber);
    this.db.setState("last_scheduled_attempt_week_key", weekKey);

    this.currentWeeklyUpdatePromise = this.performWeeklyUpdate({
      triggerSource,
      weekYear: finalWeekYear,
      weekNumber: finalWeekNumber,
      reviewWeeks: reviewPlan.weeks
    }).catch((error) => {
      console.error("Error en actualización semanal completa:", error);
    }).finally(() => {
      this.currentWeeklyUpdatePromise = null;
    });

    return {
      started: true,
      running: true,
      weekYear: finalWeekYear,
      weekNumber: finalWeekNumber,
      weekKey,
      fromWeekKey: reviewPlan.fromWeekKey,
      weeksPlanned: reviewPlan.weeks.length
    };
  }

  async performWeeklyUpdate({ triggerSource, weekYear, weekNumber, reviewWeeks }) {
    const weekKey = buildWeekKey(weekYear, weekNumber);
    const plannedWeeks = reviewWeeks?.length
      ? reviewWeeks
      : this.getWeeklyReviewPlan(weekYear, weekNumber).weeks;
    const startedAt = nowIso();
    this.saveWeeklyUpdateStatus({
      running: true,
      status: "running",
      stage: "weekly_review",
      triggerSource,
      weekKey,
      fromWeekKey: plannedWeeks[0].weekKey,
      reviewWeeks: plannedWeeks.map((week) => week.weekKey),
      completedReviewWeeks: 0,
      currentReviewWeekKey: plannedWeeks[0].weekKey,
      startedAt,
      finishedAt: "",
      errorMessage: ""
    });

    try {
      const reviewSummaries = [];
      for (let index = 0; index < plannedWeeks.length; index += 1) {
        const reviewWeek = plannedWeeks[index];
        this.saveWeeklyUpdateStatus({
          running: true,
          status: "running",
          stage: "weekly_review",
          triggerSource,
          weekKey,
          fromWeekKey: plannedWeeks[0].weekKey,
          reviewWeeks: plannedWeeks.map((week) => week.weekKey),
          completedReviewWeeks: index,
          currentReviewWeekKey: reviewWeek.weekKey,
          startedAt,
          finishedAt: "",
          errorMessage: ""
        });
        this.currentSyncPromise = this.performSync({
          triggerSource,
          weekYear: reviewWeek.weekYear,
          weekNumber: reviewWeek.weekNumber,
          runSideEffects: index === plannedWeeks.length - 1
        });
        reviewSummaries.push(await this.currentSyncPromise);
        this.currentSyncPromise = null;
      }
      const weeklyReview = aggregateWeeklyReviews(reviewSummaries);

      this.saveWeeklyUpdateStatus({
        running: true,
        status: "running",
        stage: "catalog_update",
        triggerSource,
        weekKey,
        fromWeekKey: plannedWeeks[0].weekKey,
        reviewWeeks: plannedWeeks.map((week) => week.weekKey),
        completedReviewWeeks: plannedWeeks.length,
        currentReviewWeekKey: "",
        startedAt,
        finishedAt: "",
        errorMessage: "",
        weeklyReview
      });

      this.currentCatalogImportPromise = this.performCatalogImport({ incremental: true, triggerSource: "weekly" });
      const catalogUpdate = await this.currentCatalogImportPromise;
      this.currentCatalogImportPromise = null;

      this.saveWeeklyUpdateStatus({
        running: true,
        status: "running",
        stage: "panini_update",
        triggerSource,
        weekKey,
        fromWeekKey: plannedWeeks[0].weekKey,
        reviewWeeks: plannedWeeks.map((week) => week.weekKey),
        completedReviewWeeks: plannedWeeks.length,
        currentReviewWeekKey: "",
        startedAt,
        finishedAt: "",
        errorMessage: "",
        weeklyReview,
        catalogUpdate
      });

      let paniniUpdate;
      try {
        this.currentPaniniImportPromise = this.performPaniniImport({ full: false, triggerSource: "weekly" });
        paniniUpdate = await this.currentPaniniImportPromise;
      } catch (paniniError) {
        paniniUpdate = {
          status: "failed",
          processedProducts: 0,
          matchedProducts: 0,
          pendingContains: 0,
          pendingMatch: 0,
          errors: [{ message: paniniError.message }],
          errorMessage: paniniError.message
        };
      } finally {
        this.currentPaniniImportPromise = null;
      }

      const completed = {
        running: false,
        status: "completed",
        stage: "completed",
        triggerSource,
        weekKey,
        fromWeekKey: plannedWeeks[0].weekKey,
        reviewWeeks: plannedWeeks.map((week) => week.weekKey),
        completedReviewWeeks: plannedWeeks.length,
        currentReviewWeekKey: "",
        startedAt,
        finishedAt: nowIso(),
        errorMessage: "",
        weeklyReview,
        catalogUpdate: {
          importedComics: catalogUpdate.importedComics || 0,
          existingSkipped: catalogUpdate.existingSkipped || 0,
          errors: catalogUpdate.errors?.length || 0
        },
        paniniUpdate: {
          processedProducts: paniniUpdate.processedProducts || 0,
          matchedProducts: paniniUpdate.matchedProducts || 0,
          pendingContains: paniniUpdate.pendingContains || 0,
          pendingMatch: paniniUpdate.pendingMatch || 0,
          errors: paniniUpdate.errors?.length || 0,
          status: paniniUpdate.status || "completed",
          errorMessage: paniniUpdate.errorMessage || ""
        }
      };
      this.saveWeeklyUpdateStatus(completed);
      return completed;
    } catch (error) {
      this.currentSyncPromise = null;
      this.currentCatalogImportPromise = null;
      this.currentPaniniImportPromise = null;
      const failed = {
        ...this.getWeeklyUpdateStatus(),
        running: false,
        status: "failed",
        stage: "failed",
        triggerSource,
        weekKey,
        startedAt,
        finishedAt: nowIso(),
        errorMessage: error.message
      };
      this.saveWeeklyUpdateStatus(failed);
      throw error;
    }
  }

  startSync({ triggerSource = "manual", weekYear, weekNumber } = {}) {
    if (this.currentSyncPromise || this.currentWeeklyUpdatePromise || this.currentPaniniImportPromise) {
      return { started: false, running: true };
    }

    const nowWeek = getIsoWeekInfo(new Date(), this.config.timezone);
    const finalWeekYear = weekYear || nowWeek.isoYear;
    const finalWeekNumber = weekNumber || nowWeek.weekNumber;

    this.currentSyncPromise = this.performSync({
      triggerSource,
      weekYear: finalWeekYear,
      weekNumber: finalWeekNumber
    }).finally(() => {
      this.currentSyncPromise = null;
    });

    return {
      started: true,
      running: true,
      weekYear: finalWeekYear,
      weekNumber: finalWeekNumber,
      weekKey: buildWeekKey(finalWeekYear, finalWeekNumber)
    };
  }

  resolveDecision(existingComic, automaticDecision) {
    if (!existingComic) {
      return automaticDecision;
    }

    if (existingComic.decision === "manual_added" || existingComic.decision === "manual_rejected") {
      return {
        ...automaticDecision,
        decision: existingComic.decision,
        reason: existingComic.decisionReason || automaticDecision.reason,
        matchSummary: automaticDecision.matchSummary,
        originalityStatus: automaticDecision.originalityStatus,
        originalityReason: automaticDecision.originalityReason
      };
    }

    if (existingComic.decision === "pending_review" && automaticDecision.decision === "pending_review") {
      return {
        ...automaticDecision,
        reason: existingComic.decisionReason || automaticDecision.reason,
        matchSummary: automaticDecision.matchSummary,
        originalityStatus: automaticDecision.originalityStatus,
        originalityReason: automaticDecision.originalityReason
      };
    }

    return automaticDecision;
  }

  summarizeTransition(summary, previousDecision, nextDecision, title) {
    summary.processed += 1;

    if (nextDecision === "pending_review") {
      if (previousDecision !== "pending_review") {
        summary.pendingReview += 1;
        summary.pendingTitles.push(title);
      } else {
        summary.pendingAlreadyOpen += 1;
      }
      return;
    }

    if (isIncludedDecision(nextDecision)) {
      if (!isIncludedDecision(previousDecision)) {
        summary.added += 1;
        summary.addedTitles.push(title);
      } else {
        summary.alreadyIncluded += 1;
      }
      return;
    }

    if (nextDecision === "auto_rejected" || nextDecision === "manual_rejected") {
      if (previousDecision !== nextDecision) {
        summary.rejected += 1;
        summary.rejectedTitles.push(title);
      } else {
        summary.alreadyRejected += 1;
      }
    }
  }

  async performSync({ triggerSource, weekYear, weekNumber, runSideEffects = true }) {
    const runId = this.db.createSyncRun({ weekYear, weekNumber, triggerSource });
    const summary = {
      weekKey: buildWeekKey(weekYear, weekNumber),
      processed: 0,
      added: 0,
      rejected: 0,
      pendingReview: 0,
      alreadyIncluded: 0,
      alreadyRejected: 0,
      pendingAlreadyOpen: 0,
      errors: 0,
      addedTitles: [],
      rejectedTitles: [],
      pendingTitles: [],
      erroredTitles: []
    };

    try {
      const trackedCharacters = this.db.getTrackedCharacters();
      const releases = await fetchWeekReleases({
        baseUrl: this.config.marvelBaseUrl,
        weekYear,
        weekNumber
      });

      for (const member of releases.members) {
        try {
          const details = await fetchComicDetails({
            baseUrl: this.config.marvelBaseUrl,
            pageTitle: member.pageTitle
          });

          const existing = this.db.getComicByPageTitle(member.pageTitle);
          const automaticDecision = classifyComic(details, trackedCharacters);
          const finalDecision = this.resolveDecision(existing, automaticDecision);
          const comic = this.db.upsertComic({
            ...details,
            weekYear,
            weekNumber,
            weekKey: buildWeekKey(weekYear, weekNumber),
            matchSummary: finalDecision.matchSummary,
            originalityStatus: finalDecision.originalityStatus,
            originalityReason: finalDecision.originalityReason,
            decision: finalDecision.decision,
            decisionReason: finalDecision.reason,
            lastSyncRunId: runId
          });

          this.db.replaceComicCharacters(comic.id, buildCharacterRows(details, automaticDecision));
          this.summarizeTransition(summary, existing?.decision || "", comic.decision, comic.title);

          if (comic.decision === "pending_review") {
            const review = this.db.createOrGetPendingReview(comic.id);

            if (this.telegram && this.telegram.canSendReviews() && !review.telegramMessageId) {
              const attached = await this.telegram.sendReviewRequest(review);
              this.db.attachTelegramMessage(review.id, attached);
            }
          }
        } catch (error) {
          summary.errors += 1;
          summary.erroredTitles.push(member.pageTitle);
          console.error(`Error procesando ${member.pageTitle}:`, error);
        }
      }

      this.db.finishSyncRun(runId, {
        status: "completed",
        summary
      });

      if (runSideEffects) {
        try {
          await this.maybeSendPeriodicBackup({
            triggerSource,
            weekYear,
            weekNumber
          });
        } catch (backupError) {
          console.error("Error generando o enviando backup:", backupError);
        }

        if (this.telegram && this.telegram.canSendSummary()) {
          await this.telegram.sendSummary({
            ...summary,
            triggerSource,
            weekYear,
            weekNumber
          });
        }
      }

      this.clearEnemyOptionCache();
      return summary;
    } catch (error) {
      this.db.finishSyncRun(runId, {
        status: "failed",
        summary,
        errorMessage: error.message
      });

      if (runSideEffects && this.telegram && this.telegram.canSendSummary()) {
        await this.telegram.sendSummary({
          ...summary,
          triggerSource,
          weekYear,
          weekNumber,
          failed: true,
          errorMessage: error.message
        });
      }

      throw error;
    }
  }

  resolveReview(reviewId, action, user) {
    const result = this.db.resolveReviewDecision(reviewId, action, user);
    this.clearEnemyOptionCache();
    return result;
  }

  getRuntimeStatus() {
    return {
      syncRunning: Boolean(this.currentSyncPromise),
      catalogImportRunning: Boolean(this.currentCatalogImportPromise),
      paniniImportRunning: Boolean(this.currentPaniniImportPromise),
      weeklyUpdateRunning: Boolean(this.currentWeeklyUpdatePromise),
      quarterlyRefreshRunning: Boolean(this.currentQuarterlyRefreshPromise)
    };
  }
}

module.exports = {
  ComicTrackerService
};
