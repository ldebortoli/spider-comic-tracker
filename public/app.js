const state = {
  activeTab: "usa",
  dashboard: null,
  comics: [],
  historyComics: [],
  historyOpen: false,
  approvals: { pageSize: 20, recentPage: 0, historyPage: 0 },
  catalog: {
    stats: null,
    importStatus: {},
    characters: [],
    items: [],
    total: 0,
    limit: 60,
    offset: 0,
    filters: {
      character: "peter-parker-earth-616",
      universeGroup: "main",
      query: "",
      ownership: "all",
      appearance: "all",
      from: "",
      to: "",
      sort: "date-asc"
    }
  },
  spanishEditions: {
    items: [],
    total: 0,
    limit: 20,
    offset: 0,
    stats: {},
    filterOptions: { publishers: [], characters: [] },
    filters: { query: "", status: "", publisher: "", character: "" },
    editingId: null,
    selectedIssues: []
  },
  filters: {
    query: "",
    character: "",
    from: "",
    to: ""
  },
  editingCharacterId: null,
  suggestionQuery: "",
  suggestionPage: 0,
  suggestionPageSize: 20,
  editingCatalogIssueId: null,
  systemMetricsTimer: null,
  modalScrollY: 0
};

const elements = {
  appTabs: document.querySelectorAll("[data-app-tab]"),
  appTabPanels: document.querySelectorAll("[data-app-tab-panel]"),
  tabOpenLinks: document.querySelectorAll("[data-open-tab]"),
  statsGrid: document.querySelector("#stats-grid"),
  comicsGrid: document.querySelector("#comics-grid"),
  resultsMeta: document.querySelector("#results-meta"),
  recentApprovalsMeta: document.querySelector("#recent-approvals-meta"),
  historyToggle: document.querySelector("#history-toggle"),
  historySection: document.querySelector("#history-section"),
  historyComicsGrid: document.querySelector("#history-comics-grid"),
  historyResultsMeta: document.querySelector("#history-results-meta"),
  historyEmptyState: document.querySelector("#history-empty-state"),
  approvalPageGroups: document.querySelectorAll("[data-approval-pagination]"),
  approvalPageButtons: document.querySelectorAll("[data-approval-page-action]"),
  pendingList: document.querySelector("#pending-list"),
  charactersList: document.querySelector("#characters-list"),
  emptyState: document.querySelector("#empty-state"),
  syncButton: document.querySelector("#sync-button"),
  exportCsvButton: document.querySelector("#export-csv-button"),
  catalogImportButton: document.querySelector("#catalog-import-button"),
  catalogContinueButton: document.querySelector("#catalog-continue-button"),
  refreshButton: document.querySelector("#refresh-button"),
  syncStatus: document.querySelector("#sync-status"),
  weeklyUpdateMeta: document.querySelector("#weekly-update-meta"),
  systemInfoButton: document.querySelector("#system-info-button"),
  settingsButton: document.querySelector("#settings-button"),
  systemModal: document.querySelector("#system-modal"),
  systemClose: document.querySelector("#system-close"),
  settingsModal: document.querySelector("#settings-modal"),
  settingsClose: document.querySelector("#settings-close"),
  systemSampledAt: document.querySelector("#system-sampled-at"),
  systemMetricsGrid: document.querySelector("#system-metrics-grid"),
  telegramRuntimeStatus: document.querySelector("#telegram-runtime-status"),
  telegramConfigForm: document.querySelector("#telegram-config-form"),
  telegramConfigStatus: document.querySelector("#telegram-config-status"),
  telegramConfigRefresh: document.querySelector("#telegram-config-refresh"),
  telegramConfigSave: document.querySelector("#telegram-config-save"),
  telegramBotToken: document.querySelector("#telegram-bot-token"),
  telegramClearToken: document.querySelector("#telegram-clear-token"),
  telegramReviewChatId: document.querySelector("#telegram-review-chat-id"),
  telegramSummaryChatId: document.querySelector("#telegram-summary-chat-id"),
  telegramBackupChatId: document.querySelector("#telegram-backup-chat-id"),
  telegramAllowedUserId: document.querySelector("#telegram-allowed-user-id"),
  serverOperationsStatus: document.querySelector("#server-operations-status"),
  automationEnabled: document.querySelector("#automation-enabled"),
  automationDay: document.querySelector("#automation-day"),
  automationTime: document.querySelector("#automation-time"),
  automationSave: document.querySelector("#automation-save"),
  automationStatus: document.querySelector("#automation-status"),
  quarterlyRefreshButton: document.querySelector("#quarterly-refresh-button"),
  quarterlyRefreshEnabled: document.querySelector("#quarterly-refresh-enabled"),
  quarterlyRefreshDate: document.querySelector("#quarterly-refresh-date"),
  quarterlyRefreshTime: document.querySelector("#quarterly-refresh-time"),
  quarterlyRefreshSave: document.querySelector("#quarterly-refresh-save"),
  quarterlyRefreshStatus: document.querySelector("#quarterly-refresh-status"),
  confirmModal: document.querySelector("#confirm-modal"),
  confirmTitle: document.querySelector("#confirm-title"),
  confirmMessage: document.querySelector("#confirm-message"),
  confirmYes: document.querySelector("#confirm-yes"),
  confirmNo: document.querySelector("#confirm-no"),
  modal: document.querySelector("#cover-modal"),
  modalTitle: document.querySelector("#modal-title"),
  modalDate: document.querySelector("#modal-date"),
  modalCharacters: document.querySelector("#modal-characters"),
  modalLink: document.querySelector("#modal-link"),
  modalCover: document.querySelector("#modal-cover"),
  modalClose: document.querySelector("#modal-close"),
  queryInput: document.querySelector("#query-input"),
  characterInput: document.querySelector("#character-input"),
  fromInput: document.querySelector("#from-input"),
  toInput: document.querySelector("#to-input"),
  characterForm: document.querySelector("#character-form"),
  characterId: document.querySelector("#character-id"),
  characterName: document.querySelector("#character-name"),
  characterAliases: document.querySelector("#character-aliases"),
  characterActive: document.querySelector("#character-active"),
  characterReset: document.querySelector("#character-reset"),
  suggestionCharacterQuery: document.querySelector("#suggestion-character-query"),
  suggestionCharactersSummary: document.querySelector("#suggestion-characters-summary"),
  catalogStatsGrid: document.querySelector("#catalog-stats-grid"),
  catalogSourceMeta: document.querySelector("#catalog-source-meta"),
  catalogResultsMeta: document.querySelector("#catalog-results-meta"),
  catalogList: document.querySelector("#catalog-list"),
  catalogEmpty: document.querySelector("#catalog-empty"),
  catalogPageButtons: document.querySelectorAll("[data-catalog-page-action]"),
  catalogPageMetas: document.querySelectorAll("[data-catalog-page-meta]"),
  catalogUniverseGroup: document.querySelector("#catalog-universe-group"),
  catalogQuery: document.querySelector("#catalog-query"),
  catalogFilterNotice: document.querySelector("#catalog-filter-notice"),
  catalogCharacter: document.querySelector("#catalog-character"),
  catalogOwnership: document.querySelector("#catalog-ownership"),
  catalogAppearance: document.querySelector("#catalog-appearance"),
  catalogSort: document.querySelector("#catalog-sort"),
  catalogPageSizes: document.querySelectorAll("[data-catalog-page-size]"),
  catalogFrom: document.querySelector("#catalog-from"),
  catalogTo: document.querySelector("#catalog-to"),
  collectionModal: document.querySelector("#collection-modal"),
  collectionForm: document.querySelector("#collection-form"),
  collectionClose: document.querySelector("#collection-close"),
  collectionCancel: document.querySelector("#collection-cancel"),
  collectionTitle: document.querySelector("#collection-title"),
  collectionOriginalMeta: document.querySelector("#collection-original-meta"),
  collectionOwned: document.querySelector("#collection-owned"),
  collectionPublisher: document.querySelector("#collection-publisher"),
  collectionEdition: document.querySelector("#collection-edition"),
  collectionNotes: document.querySelector("#collection-notes"),
  spanishAddButton: document.querySelector("#spanish-add-button"),
  paniniImportButton: document.querySelector("#panini-import-button"),
  paniniImportMeta: document.querySelector("#panini-import-meta"),
  spanishStatsGrid: document.querySelector("#spanish-stats-grid"),
  spanishQuery: document.querySelector("#spanish-query"),
  spanishStatusFilter: document.querySelector("#spanish-status-filter"),
  spanishPublisherFilter: document.querySelector("#spanish-publisher-filter"),
  spanishCharacterFilter: document.querySelector("#spanish-character-filter"),
  spanishEditionsList: document.querySelector("#spanish-editions-list"),
  spanishEmpty: document.querySelector("#spanish-empty"),
  spanishPageButtons: document.querySelectorAll("[data-spanish-page-action]"),
  spanishPageMetas: document.querySelectorAll("[data-spanish-page-meta]"),
  spanishPageSizes: document.querySelectorAll("[data-spanish-page-size]"),
  characterPageButtons: document.querySelectorAll("[data-character-page-action]"),
  characterPageMeta: document.querySelector("[data-character-page-meta]"),
  spanishEditionModal: document.querySelector("#spanish-edition-modal"),
  spanishEditionForm: document.querySelector("#spanish-edition-form"),
  spanishEditionClose: document.querySelector("#spanish-edition-close"),
  spanishEditionCancel: document.querySelector("#spanish-edition-cancel"),
  spanishEditionModalTitle: document.querySelector("#spanish-edition-modal-title"),
  spanishEditionId: document.querySelector("#spanish-edition-id"),
  spanishTitle: document.querySelector("#spanish-title"),
  spanishPublisher: document.querySelector("#spanish-publisher"),
  spanishPurchaseStatus: document.querySelector("#spanish-purchase-status"),
  spanishCollection: document.querySelector("#spanish-collection"),
  spanishVolume: document.querySelector("#spanish-volume"),
  spanishFormat: document.querySelector("#spanish-format"),
  spanishPublicationDate: document.querySelector("#spanish-publication-date"),
  spanishIsbn: document.querySelector("#spanish-isbn"),
  spanishCharacters: document.querySelector("#spanish-characters"),
  spanishCoverUrl: document.querySelector("#spanish-cover-url"),
  spanishReferenceUrl: document.querySelector("#spanish-reference-url"),
  spanishNotes: document.querySelector("#spanish-notes"),
  spanishIssueSearch: document.querySelector("#spanish-issue-search"),
  spanishIssueSearchResults: document.querySelector("#spanish-issue-search-results"),
  spanishSelectedIssues: document.querySelector("#spanish-selected-issues")
};

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: {
      "Content-Type": "application/json"
    },
    ...options
  });

  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.error || "Error de API");
  }

  return payload;
}

function debounce(fn, wait = 250) {
  let timeoutId = null;
  return (...args) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), wait);
  };
}

function formatDate(isoDate, precision = "day", source = "") {
  if (!isoDate) {
    return "Sin fecha";
  }

  const options = precision === "year"
    ? { year: "numeric" }
    : precision === "month"
      ? { month: "long", year: "numeric" }
      : { day: "2-digit", month: "short", year: "numeric" };
  const formatted = new Date(`${isoDate}T12:00:00`).toLocaleDateString("es-AR", options);
  return source === "cover" ? `${formatted} (fecha de portada)` : formatted;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normalizeForSearch(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function formatDateTime(isoDate) {
  if (!isoDate) {
    return "Nunca";
  }

  return new Date(isoDate).toLocaleString("es-AR", {
    dateStyle: "medium",
    timeStyle: "short"
  });
}

function localDateTimeParts(isoDate) {
  if (!isoDate) {
    return { date: "", time: "" };
  }

  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) {
    return { date: "", time: "" };
  }

  const pad = (value) => String(value).padStart(2, "0");
  return {
    date: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    time: `${pad(date.getHours())}:${pad(date.getMinutes())}`
  };
}

function isoFromLocalDateTime(dateValue, timeValue) {
  if (!dateValue || !timeValue) {
    return "";
  }

  const date = new Date(`${dateValue}T${timeValue}:00`);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

function formatBytes(bytes) {
  const value = Number(bytes || 0);
  const units = ["B", "KB", "MB", "GB", "TB"];
  let scaled = value;
  let index = 0;
  while (scaled >= 1024 && index < units.length - 1) {
    scaled /= 1024;
    index += 1;
  }
  return `${scaled.toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function formatDuration(seconds) {
  const totalMinutes = Math.floor(Number(seconds || 0) / 60);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  return [days ? `${days}d` : "", hours ? `${hours}h` : "", `${minutes}m`].filter(Boolean).join(" ");
}

function setSyncStatus(text) {
  elements.syncStatus.textContent = text;
}

function hasOpenDialog() {
  return Boolean(document.querySelector("dialog[open]"));
}

function updateModalScrollLock() {
  if (hasOpenDialog()) {
    if (!document.body.classList.contains("modal-open")) {
      state.modalScrollY = window.scrollY;
      document.documentElement.classList.add("modal-open");
      document.body.classList.add("modal-open");
      document.body.style.top = `-${state.modalScrollY}px`;
    }
    return;
  }

  if (document.body.classList.contains("modal-open")) {
    document.documentElement.classList.remove("modal-open");
    document.body.classList.remove("modal-open");
    document.body.style.top = "";
    window.scrollTo(0, state.modalScrollY);
  }
}

function openDialog(dialog) {
  dialog.showModal();
  updateModalScrollLock();
}

function closeDialog(dialog) {
  if (dialog?.open) {
    dialog.close();
  }
}

function wireDialogDismissal(dialog) {
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) {
      closeDialog(dialog);
    }
  });
}

function formatBackupStatus(status) {
  const labels = {
    never: "Pend.",
    sent: "Enviado",
    stored_local: "Local",
    skipped_too_large: "Omitido",
    failed: "Error"
  };

  return labels[status] || status || "Pend.";
}

function renderStats() {
  if (!state.dashboard) {
    return;
  }

  const { stats, lastSync, schedule, config } = state.dashboard;
  const backup = state.dashboard.backup || {};
  const weeklyUpdate = state.dashboard.weeklyUpdate || {};
  const scheduleDayLabels = {
    MONDAY: "lunes",
    TUESDAY: "martes",
    WEDNESDAY: "miércoles",
    THURSDAY: "jueves",
    FRIDAY: "viernes",
    SATURDAY: "sábado",
    SUNDAY: "domingo"
  };
  const scheduleText = `${scheduleDayLabels[schedule.day] || schedule.day} ${String(schedule.hour).padStart(2, "0")}:${String(schedule.minute).padStart(2, "0")}`;
  const cards = [
    {
      label: "Cómics guardados",
      value: stats.includedCount,
      foot: lastSync ? `Última sync: ${lastSync.weekKey}` : "Sin corridas"
    },
    {
      label: "Volúmenes",
      value: stats.includedVolumesCount || 0,
      foot: "Agrupación activa por volumen"
    },
    {
      label: "Pendientes Telegram",
      value: stats.pendingReviewsCount,
      foot: config.telegramConfigured ? "Bot configurado" : "Bot aún no configurado"
    },
    {
      label: "Backups",
      value: backup.enabled ? formatBackupStatus(backup.lastStatus) : "OFF",
      foot: backup.enabled
        ? ((backup.lastSentAt || backup.lastAttemptAt)
          ? `Último: ${new Date(backup.lastSentAt || backup.lastAttemptAt).toLocaleDateString("es-AR")} / ${backup.intervalWeeks} semanas`
          : `Cada ${backup.intervalWeeks} semanas`)
        : "Backup periódico desactivado"
    },
    {
      label: "Personajes activos",
      value: stats.trackedCharactersCount,
      foot: "Lista editable desde el panel lateral"
    },
    {
      label: "Actualización semanal",
      value: weeklyUpdate.running ? "EN CURSO" : (schedule.enabled ? "ON" : "OFF"),
      foot: weeklyUpdate.finishedAt
        ? `Última: ${formatDateTime(weeklyUpdate.finishedAt)} / ${scheduleText}`
        : `${scheduleText} (${schedule.timezone})`
    }
  ];

  const taskLabel = schedule.windowsTaskInstalled ? "Tarea de Windows activa" : "Solo mientras el servidor esté abierto";
  if (weeklyUpdate.running) {
    const stage = ({
      weekly_review: "revisando novedades USA",
      catalog_update: "actualizando listas históricas USA",
      panini_update: "revisando Panini"
    })[weeklyUpdate.stage] || "revisando la semana";
    elements.weeklyUpdateMeta.textContent = `Actualización semanal en curso: ${stage}. ${taskLabel}.`;
  } else if (weeklyUpdate.status === "failed") {
    elements.weeklyUpdateMeta.textContent = `Última actualización automática fallida: ${formatDateTime(weeklyUpdate.finishedAt)}. ${weeklyUpdate.errorMessage || "Error sin detalle"}`;
  } else if (weeklyUpdate.finishedAt) {
    elements.weeklyUpdateMeta.textContent = `Última actualización automática: ${formatDateTime(weeklyUpdate.finishedAt)}. Próxima: ${scheduleText}. ${taskLabel}.`;
  } else {
    elements.weeklyUpdateMeta.textContent = `Actualización automática: ${scheduleText}. Todavía no tuvo su primera ejecución. ${taskLabel}.`;
  }
  renderQuarterlyRefreshStatus();

  elements.statsGrid.innerHTML = cards.map((card) => `
    <article class="panel stat-card">
      <span class="eyebrow">${card.label}</span>
      <strong>${card.value}</strong>
      <span class="muted">${card.foot}</span>
    </article>
  `).join("");
}

function renderQuarterlyRefreshStatus() {
  const status = state.dashboard?.quarterlyRefresh || {};
  elements.quarterlyRefreshButton.disabled = Boolean(status.running || state.dashboard?.config?.catalogImportRunning);
  elements.quarterlyRefreshSave.disabled = Boolean(status.running || state.dashboard?.config?.catalogImportRunning);
  elements.quarterlyRefreshEnabled.checked = status.enabled !== false;
  const nextParts = localDateTimeParts(status.nextRefreshAt);
  const minimumParts = localDateTimeParts(status.minimumNextRefreshAt);
  elements.quarterlyRefreshDate.value = nextParts.date;
  elements.quarterlyRefreshTime.value = nextParts.time || "12:00";
  elements.quarterlyRefreshDate.min = minimumParts.date;
  if (status.running) {
    elements.quarterlyRefreshStatus.textContent = "Revisión completa en curso. Puede tardar varios minutos.";
  } else if (status.status === "failed") {
    elements.quarterlyRefreshStatus.textContent = `La última revisión completa falló: ${status.errorMessage || "error sin detalle"}`;
  } else if (status.lastRefreshAt) {
    elements.quarterlyRefreshStatus.textContent = `Última revisión: ${formatDateTime(status.lastRefreshAt)}. Próxima: ${formatDateTime(status.nextRefreshAt)}. Mínima permitida: ${formatDateTime(status.minimumNextRefreshAt)}.`;
  } else {
    elements.quarterlyRefreshStatus.textContent = "La revisión trimestral todavía no tiene una fecha base.";
  }
}

function catalogImportLabel(status) {
  const stages = {
    starting: "Preparando importación...",
    discovering: `Descubriendo apariciones: ${status.discovered || 0}`,
    discovering_characters: `Revisando personajes: ${status.completedCharacters || 0}/${status.totalCharacters || 0}`,
    importing: `Importando ${status.completedBatches || 0}/${status.totalBatches || 0} lotes (${status.importedComics || 0} cómics)`,
    completed: status.incremental && !(status.characterResults || []).some((result) => result.addedCount > 0)
      ? "Lista al día: no se encontraron cómics nuevos"
      : `${status.characterSlug ? "Lista actualizada" : "Catálogo actualizado"}: ${status.importedComics || 0} fichas procesadas`,
    completed_with_errors: `Actualizado con ${status.errors?.length || 0} lotes fallidos; se puede reintentar`,
    failed: `Falló la importación: ${status.errorMessage || "error desconocido"}`
  };
  return stages[status.stage] || "Catálogo aún no importado";
}

function selectedCatalogCharacter() {
  return state.catalog.characters.find((character) => character.slug === state.catalog.filters.character) || null;
}

const FEATURED_REALITIES = new Set(["Earth-65", "Earth-928", "Earth-982", "Earth-90214"]);
const CATALOG_CHARACTER_PRIORITY = [
  "peter-parker-earth-616",
  "miles-morales-earth-1610",
  "jessica-drew-earth-616",
  "bailey-briggs-earth-616",
  "felicia-hardy-earth-616",
  "mary-jane-watson-earth-616",
  "gwendolyne-stacy-earth-616",
  "venom-symbiote-earth-616",
  "carnage-symbiote-earth-616",
  "knull-earth-616",
  "miguel-o-hara-earth-928",
  "may-parker-earth-982",
  "peter-parker-earth-90214"
];

function characterMatchesUniverseGroup(character, group = state.catalog.filters.universeGroup) {
  if (group === "all") return true;
  if (group === "main") return character.reality === "Earth-616";
  if (group === "ultimate") return character.reality === "Earth-1610" || character.reality === "Earth-6160";
  if (group === "featured") return FEATURED_REALITIES.has(character.reality);
  return character.reality !== "Earth-616"
    && character.reality !== "Earth-1610"
    && character.reality !== "Earth-6160"
    && !FEATURED_REALITIES.has(character.reality);
}

function visibleCatalogCharacters() {
  return state.catalog.characters
    .filter((character) => character.issueCount > 0 && characterMatchesUniverseGroup(character))
    .sort((left, right) => {
      const leftPriority = CATALOG_CHARACTER_PRIORITY.indexOf(left.slug);
      const rightPriority = CATALOG_CHARACTER_PRIORITY.indexOf(right.slug);
      const leftScore = leftPriority === -1 ? 10_000 : leftPriority;
      const rightScore = rightPriority === -1 ? 10_000 : rightPriority;
      return leftScore - rightScore
        || left.displayName.localeCompare(right.displayName, "es")
        || left.reality.localeCompare(right.reality, "es");
    });
}

function ensureCatalogCharacterForUniverseGroup() {
  const visible = visibleCatalogCharacters();
  if (!state.catalog.filters.character) return;
  if (!visible.some((character) => character.slug === state.catalog.filters.character)) {
    state.catalog.filters.character = "";
  }
}

function renderCatalogCharacters() {
  const groups = [
    ["spider", "Personajes arácnidos"],
    ["symbiote", "Simbiontes"]
  ];

  const groupedOptions = groups.map(([kind, label]) => {
    const options = visibleCatalogCharacters()
      .filter((character) => character.kind === kind)
      .map((character) => `
        <option value="${escapeHtml(character.slug)}" ${character.slug === state.catalog.filters.character ? "selected" : ""}>
          ${escapeHtml(character.displayName)} · ${escapeHtml(character.reality)} (${character.issueCount})
        </option>
    `).join("");
    return options ? `<optgroup label="${escapeHtml(label)}">${options}</optgroup>` : "";
  }).join("");
  elements.catalogCharacter.innerHTML = `<option value="">Todos los personajes de esta categoría</option>${groupedOptions}`;
  elements.catalogCharacter.value = state.catalog.filters.character;
}

function renderCatalogStats() {
  const stats = state.catalog.stats || {
    totalCount: 0,
    ownedCount: 0,
    missingCount: 0,
    seriesCount: 0,
    completionPercent: 0
  };
  const status = state.catalog.importStatus || {};
  const character = selectedCatalogCharacter();
  const universeLabels = {
    main: "Todos los personajes de Earth-616",
    ultimate: "Todos los personajes de los universos Ultimate",
    featured: "Todos los personajes de universos destacados",
    other: "Todos los personajes de otros universos",
    all: "Todos los personajes y universos"
  };
  const cards = [
    ["Issues catalogados", stats.totalCount],
    ["Ya tengo", stats.ownedCount],
    ["Me faltan", stats.missingCount],
    ["Series", stats.seriesCount],
    ["Completado", `${stats.completionPercent}%`]
  ];

  elements.catalogStatsGrid.innerHTML = cards.map(([label, value]) => `
    <article class="catalog-stat">
      <span class="muted">${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
    </article>
  `).join("");
  const cutoff = character?.lastComicDate || stats.lastComicDate;
  elements.catalogSourceMeta.textContent = [
    character ? `${character.displayName} · ${character.reality}` : universeLabels[state.catalog.filters.universeGroup],
    `Fecha de corte (issue más reciente guardado): ${cutoff ? formatDate(cutoff) : "sin fecha de corte"}`,
    `Última sincronización: ${formatDateTime(character?.lastSyncAt || stats.lastSourceSyncAt)}`,
    catalogImportLabel(status)
  ].join(". ");
  elements.catalogImportButton.disabled = Boolean(status.running);
  elements.catalogContinueButton.disabled = Boolean(status.running || !character);
  elements.catalogImportButton.textContent = status.running ? "Importando catálogos..." : "Importar o actualizar todos";
  elements.catalogContinueButton.textContent = !character
    ? "Elegí un personaje para buscar novedades"
    : cutoff
    ? `Buscar posteriores a ${formatDate(cutoff)}`
    : "Buscar issues de este personaje";
  elements.catalogContinueButton.dataset.tooltip = character
    ? `Revisa la categoría de ${character.displayName} en Marvel Fandom, actualiza fichas conocidas y agrega nuevas sin duplicarlas.`
    : "Elegí un personaje para buscar nuevas fichas y actualizar las existentes sin crear duplicados.";
  elements.catalogContinueButton.setAttribute("aria-label", elements.catalogContinueButton.textContent);
}

function appearanceDetailLabel(value) {
  return ({
    flashback: "Flashback",
    dream: "Sueño",
    vision: "Visión",
    recap: "Recapitulación",
    photo: "Fotografía",
    "on-screen": "En pantalla",
    illusion: "Ilusión",
    statue: "Estatua",
    portrait: "Retrato",
    recording: "Grabación"
  })[value] || (value ? "Otra aparición menor" : "");
}

function renderCatalog() {
  const { items, total, limit, offset } = state.catalog;
  const first = total ? offset + 1 : 0;
  const last = Math.min(total, offset + items.length);
  const page = Math.floor(offset / limit) + 1;
  const pages = Math.max(1, Math.ceil(total / limit));

  elements.catalogResultsMeta.textContent = `${total} resultado(s)`;
  const pageMeta = `${first}-${last} de ${total} / página ${page} de ${pages}`;
  for (const element of elements.catalogPageMetas) element.textContent = pageMeta;
  for (const select of elements.catalogPageSizes) select.value = String(limit);
  for (const button of elements.catalogPageButtons) {
    const action = button.dataset.catalogPageAction;
    button.disabled = action === "first" || action === "prev" ? offset <= 0 : offset + limit >= total;
  }

  const activeQuery = state.catalog.filters.query;
  if (activeQuery) {
    elements.catalogFilterNotice.classList.remove("hidden");
    elements.catalogFilterNotice.innerHTML = `
      <span>Filtro activo: <strong>${escapeHtml(activeQuery)}</strong>. Solo se muestran títulos o datos que coinciden; otras series de la cronología pueden quedar ocultas.</span>
      <button type="button" data-action="clear-catalog-query">Quitar filtro</button>
    `;
    elements.catalogFilterNotice.querySelector("button").addEventListener("click", async () => {
      elements.catalogQuery.value = "";
      state.catalog.filters.query = "";
      state.catalog.offset = 0;
      await loadCatalog();
    });
  } else {
    elements.catalogFilterNotice.classList.add("hidden");
    elements.catalogFilterNotice.innerHTML = "";
  }

  if (!items.length) {
    elements.catalogList.innerHTML = "";
    elements.catalogEmpty.classList.remove("hidden");
    return;
  }

  elements.catalogEmpty.classList.add("hidden");
  elements.catalogList.innerHTML = items.map((issue) => {
    const edition = [issue.ownedPublisher, issue.ownedEdition].filter(Boolean).join(" - ");
    const writers = issue.writers?.length ? issue.writers.join(", ") : "Guionista sin datos";
    const detail = appearanceDetailLabel(issue.appearanceDetail);
    const appearance = issue.appearanceType === "minor"
      ? `Aparición menor${detail ? ` · ${detail}` : ""}`
      : "Aparición";
    const characterTags = (issue.characters || []).map((character) => {
      const characterDetail = character.appearanceType === "minor" ? appearanceDetailLabel(character.appearanceDetail) : "";
      return `<span class="tag tag-character">${escapeHtml(character.displayName)}${characterDetail ? ` · ${escapeHtml(characterDetail)}` : ""}</span>`;
    }).join("");
    const image = issue.coverImageUrl
      ? `<img src="${escapeHtml(issue.coverImageUrl)}" alt="" loading="lazy" />`
      : `<div class="catalog-cover-placeholder">Sin tapa</div>`;

    return `
      <article class="catalog-row ${issue.owned ? "is-owned" : ""}" data-catalog-id="${issue.id}">
        <div class="catalog-cover">${image}</div>
        <div class="catalog-copy">
          <div class="catalog-title-line">
            <a href="${escapeHtml(issue.fandomUrl)}" target="_blank" rel="noreferrer">${escapeHtml(issue.title)}</a>
            <span class="tag">${escapeHtml(appearance)}</span>
          </div>
          <p>${escapeHtml(formatDate(issue.releaseDate, issue.datePrecision, issue.dateSource))} · ${escapeHtml(writers)}</p>
          ${characterTags ? `<div class="tags catalog-character-tags">${characterTags}</div>` : ""}
          ${edition ? `<p class="owned-edition">En mi colección: ${escapeHtml(edition)}</p>` : ""}
          ${issue.collectionNotes ? `<p class="muted">${escapeHtml(issue.collectionNotes)}</p>` : ""}
        </div>
        <div class="catalog-actions">
          <button class="button ${issue.owned ? "button-owned" : "button-secondary"}" data-action="toggle" type="button">
            ${issue.owned ? "Tengo" : "Me falta"}
          </button>
          <button class="button button-secondary" data-action="edit" type="button">Editar edición</button>
        </div>
      </article>
    `;
  }).join("");

  for (const button of elements.catalogList.querySelectorAll("button[data-action]")) {
    button.addEventListener("click", async () => {
      const row = button.closest(".catalog-row");
      const issue = state.catalog.items.find((item) => String(item.id) === row?.dataset.catalogId);

      if (!issue) {
        return;
      }

      if (button.dataset.action === "edit") {
        openCollectionModal(issue);
        return;
      }

      button.disabled = true;
      try {
        await saveCollectionIssue(issue, { owned: !issue.owned });
      } finally {
        button.disabled = false;
      }
    });
  }
}

function openCollectionModal(issue) {
  state.editingCatalogIssueId = issue.id;
  elements.collectionTitle.textContent = issue.title;
  elements.collectionOriginalMeta.textContent = `${formatDate(issue.releaseDate, issue.datePrecision, issue.dateSource)} · ${(issue.writers || []).join(", ") || "Guionista sin datos"}`;
  elements.collectionOwned.checked = issue.owned;
  elements.collectionPublisher.value = issue.ownedPublisher || "";
  elements.collectionEdition.value = issue.ownedEdition || "";
  elements.collectionNotes.value = issue.collectionNotes || "";
  openDialog(elements.collectionModal);
}

async function saveCollectionIssue(issue, overrides = {}) {
  const updated = await api(`/api/catalog/${issue.id}/collection`, {
    method: "PATCH",
    body: JSON.stringify({
      owned: overrides.owned ?? issue.owned,
      publisher: overrides.publisher ?? issue.ownedPublisher,
      editionTitle: overrides.editionTitle ?? issue.ownedEdition,
      notes: overrides.notes ?? issue.collectionNotes
    })
  });
  const index = state.catalog.items.findIndex((item) => item.id === updated.id);

  if (index !== -1) {
    state.catalog.items[index] = updated;
  }

  await Promise.all([loadCatalogStats(), loadCatalog()]);
  return updated;
}

function renderSpanishFilterOptions() {
  const publisherValue = state.spanishEditions.filters.publisher;
  const characterValue = state.spanishEditions.filters.character;
  elements.spanishPublisherFilter.innerHTML = `<option value="">Todas</option>${state.spanishEditions.filterOptions.publishers
    .map((publisher) => `<option value="${escapeHtml(publisher)}">${escapeHtml(publisher)}</option>`).join("")}`;
  elements.spanishCharacterFilter.innerHTML = `<option value="">Todos</option>${state.spanishEditions.filterOptions.characters
    .map((character) => `<option value="${escapeHtml(character)}">${escapeHtml(character)}</option>`).join("")}`;
  elements.spanishPublisherFilter.value = publisherValue;
  elements.spanishCharacterFilter.value = characterValue;
}

function renderSpanishEditions() {
  const { items, stats, total, limit, offset } = state.spanishEditions;
  const first = total ? offset + 1 : 0;
  const last = Math.min(total, offset + items.length);
  const page = Math.floor(offset / limit) + 1;
  const pages = Math.max(1, Math.ceil(total / limit));
  for (const meta of elements.spanishPageMetas) meta.textContent = `${first}-${last} de ${total} / página ${page} de ${pages}`;
  for (const select of elements.spanishPageSizes) select.value = String(limit);
  for (const button of elements.spanishPageButtons) {
    const action = button.dataset.spanishPageAction;
    button.disabled = action === "first" || action === "prev" ? offset <= 0 : offset + limit >= total;
  }
  const cards = [
    ["Ediciones", stats.totalCount || 0],
    ["Quiero comprar", stats.wantedCount || 0],
    ["Ya tengo", stats.ownedCount || 0],
    ["Issues USA relacionados", stats.linkedIssueCount || 0],
    ["Editoriales", stats.publisherCount || 0],
    ["Panini sin «Contiene»", stats.paniniPendingContains || 0],
    ["Panini sin match USA", stats.paniniPendingMatch || 0]
  ];
  elements.spanishStatsGrid.innerHTML = cards.map(([label, value]) => `
    <article class="catalog-stat"><span class="muted">${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></article>
  `).join("");
  renderSpanishFilterOptions();
  const paniniStatus = state.dashboard?.paniniImport || {};
  elements.paniniImportButton.disabled = Boolean(paniniStatus.running);
  elements.paniniImportButton.textContent = paniniStatus.running ? "Actualizando fuentes..." : "Actualizar fuentes españolas";
  const universoStatus = paniniStatus.universoMarvel || {};
  elements.paniniImportMeta.textContent = paniniStatus.running
    ? `Importación en curso: ${paniniStatus.processedProducts || paniniStatus.processed || 0} productos revisados.`
    : paniniStatus.stage === "failed"
      ? `Último intento de Panini interrumpido: ${paniniStatus.errorMessage || "error sin detalle"}.`
    : paniniStatus.stage === "completed_with_warnings"
      ? `Fichas Universo Marvel procesadas: ${universoStatus.processed || 0}; pendientes: ${universoStatus.queue?.pending || 0}. La tienda oficial no estuvo disponible: ${paniniStatus.officialError}`
    : stats.paniniLastCheckedAt
      ? `Última revisión de fuentes españolas: ${formatDateTime(stats.paniniLastCheckedAt)}. Los productos pendientes se retoman en la próxima ejecución.`
      : "Las fuentes españolas todavía no fueron importadas. Se consulta la tienda de Panini y Fichas Universo Marvel.";

  const hasFilters = Object.values(state.spanishEditions.filters).some(Boolean);
  elements.spanishEmpty.classList.toggle("hidden", items.length > 0);
  elements.spanishEmpty.textContent = stats.totalCount === 0
    ? "Todavía no agregaste ediciones en español. Este apartado comienza vacío para que armes tu propia colección."
    : hasFilters
      ? "No hay ediciones que coincidan con estos filtros."
      : "No hay ediciones en español.";

  elements.spanishEditionsList.innerHTML = items.map((edition) => {
    const cover = edition.coverImageUrl
      ? `<img src="${escapeHtml(edition.coverImageUrl)}" alt="Portada de ${escapeHtml(edition.title)}" loading="lazy" />`
      : `<div class="spanish-cover-placeholder">Sin portada</div>`;
    const details = [edition.publisher, edition.collectionName, edition.volumeLabel, edition.formatLabel, edition.pages ? `${edition.pages} páginas` : ""].filter(Boolean).join(" · ");
    const shownIssues = edition.issues.slice(0, 8);
    const remainingIssues = Math.max(0, edition.issueCount - shownIssues.length);
    return `
      <article class="spanish-edition-card" data-spanish-edition-id="${edition.id}">
        <div class="spanish-edition-cover">${cover}</div>
        <div class="spanish-edition-copy">
          <div class="spanish-edition-title-line">
            <div>
              <span class="tag ${edition.purchaseStatus === "owned" ? "tag-owned" : ""}">${edition.purchaseStatus === "owned" ? "Ya tengo" : "Quiero comprar"}</span>
              <h3>${escapeHtml(edition.title)}</h3>
            </div>
          </div>
          ${details ? `<p class="muted">${escapeHtml(details)}</p>` : ""}
          ${edition.publicationDate ? `<p class="muted">Publicación: ${escapeHtml(formatDate(edition.publicationDate))}</p>` : ""}
          ${["panini", "universo_marvel"].includes(edition.source) ? `<div class="tags">
            <span class="tag tag-source">${edition.source === "universo_marvel" ? "Fuente: Fichas Universo Marvel" : "Fuente: Panini España"}</span>
            ${edition.preferredIssueCount ? `<span class="tag tag-preferred">Prioritario para ${edition.preferredIssueCount} issue(s)</span>` : ""}
            ${edition.alternativeIssueCount ? `<span class="tag tag-alternative">Alternativa para ${edition.alternativeIssueCount} issue(s)</span>` : ""}
          </div>` : ""}
          <details class="spanish-edition-details">
            <summary>Ver contenido y relaciones · ${edition.issueCount} issue(s) USA</summary>
            <div class="spanish-edition-details__body">
              <div class="tags">${edition.characters.map((character) => `<span class="tag">${escapeHtml(character)}</span>`).join("")}</div>
              <div class="spanish-linked-issues">
                <strong>${edition.issueCount} issue(s) USA relacionados</strong>
                ${shownIssues.length ? `<div>${shownIssues.map((issue) => `<a class="${issue.isPreferredSpanishEdition ? "is-preferred" : "is-alternative"}" href="${escapeHtml(issue.fandomUrl)}" target="_blank" rel="noreferrer" title="${issue.spanishEditionCount > 1 ? (issue.isPreferredSpanishEdition ? "Edición prioritaria por cantidad de páginas" : "También incluido en una edición prioritaria más extensa") : ""}">${escapeHtml(issue.title)}${issue.spanishEditionCount > 1 ? (issue.isPreferredSpanishEdition ? " ★" : " · alternativa") : ""}</a>`).join("")}${remainingIssues ? `<span class="muted">+${remainingIssues} más</span>` : ""}</div>` : `<span class="muted">Todavía no se relacionaron issues individuales.</span>`}
              </div>
              ${edition.containsRaw ? `<p class="muted"><strong>Contiene:</strong> ${escapeHtml(edition.containsRaw)}</p>` : ""}
              ${edition.notes ? `<p>${escapeHtml(edition.notes)}</p>` : ""}
              ${edition.referenceUrl ? `<a href="${escapeHtml(edition.referenceUrl)}" target="_blank" rel="noreferrer">Abrir referencia</a>` : ""}
            </div>
          </details>
        </div>
        <div class="spanish-edition-actions">
          <button class="button button-secondary" data-spanish-action="edit" type="button">Editar</button>
          <button class="button button-danger" data-spanish-action="delete" type="button">Borrar</button>
        </div>
      </article>
    `;
  }).join("");

  for (const button of elements.spanishEditionsList.querySelectorAll("button[data-spanish-action]")) {
    button.addEventListener("click", async () => {
      const card = button.closest("[data-spanish-edition-id]");
      const edition = items.find((item) => item.id === Number(card?.dataset.spanishEditionId));
      if (!edition) return;

      if (button.dataset.spanishAction === "edit") {
        openSpanishEditionModal(edition);
        return;
      }

      if (window.confirm(`¿Borrar "${edition.title}" de la lista?`)) {
        await api(`/api/spanish-editions/${edition.id}`, { method: "DELETE" });
        await loadSpanishEditions();
      }
    });
  }
}

async function loadSpanishEditions() {
  const params = new URLSearchParams({
    ...state.spanishEditions.filters,
    limit: String(state.spanishEditions.limit),
    offset: String(state.spanishEditions.offset)
  });
  const payload = await api(`/api/spanish-editions?${params.toString()}`);
  state.spanishEditions.items = payload.items || [];
  state.spanishEditions.total = Number(payload.total || 0);
  state.spanishEditions.limit = Number(payload.limit || 20);
  state.spanishEditions.offset = Number(payload.offset || 0);
  state.spanishEditions.stats = payload.stats || {};
  state.spanishEditions.filterOptions = payload.filters || { publishers: [], characters: [] };
  renderSpanishEditions();
}

function renderSpanishSelectedIssues() {
  const issues = state.spanishEditions.selectedIssues;
  elements.spanishSelectedIssues.innerHTML = issues.length
    ? issues.map((issue) => `
      <div class="spanish-selected-issue" data-selected-issue-id="${issue.id}">
        <span>${escapeHtml(issue.title)}</span>
        <button type="button" aria-label="Quitar ${escapeHtml(issue.title)}">Quitar</button>
      </div>
    `).join("")
    : `<span class="muted">No seleccionaste issues USA.</span>`;

  for (const button of elements.spanishSelectedIssues.querySelectorAll("button")) {
    button.addEventListener("click", () => {
      const row = button.closest("[data-selected-issue-id]");
      state.spanishEditions.selectedIssues = issues.filter((issue) => issue.id !== Number(row?.dataset.selectedIssueId));
      renderSpanishSelectedIssues();
    });
  }
}

function resetSpanishEditionForm() {
  state.spanishEditions.editingId = null;
  state.spanishEditions.selectedIssues = [];
  elements.spanishEditionForm.reset();
  elements.spanishEditionId.value = "";
  elements.spanishPublisher.value = "Panini Comics";
  elements.spanishPurchaseStatus.value = "wanted";
  elements.spanishIssueSearchResults.innerHTML = "";
  elements.spanishEditionModalTitle.textContent = "Agregar edición";
  renderSpanishSelectedIssues();
}

function openSpanishEditionModal(edition = null) {
  resetSpanishEditionForm();
  if (edition) {
    state.spanishEditions.editingId = edition.id;
    state.spanishEditions.selectedIssues = [...edition.issues];
    elements.spanishEditionId.value = String(edition.id);
    elements.spanishEditionModalTitle.textContent = "Editar edición";
    elements.spanishTitle.value = edition.title;
    elements.spanishPublisher.value = edition.publisher;
    elements.spanishPurchaseStatus.value = edition.purchaseStatus;
    elements.spanishCollection.value = edition.collectionName;
    elements.spanishVolume.value = edition.volumeLabel;
    elements.spanishFormat.value = edition.formatLabel;
    elements.spanishPublicationDate.value = edition.publicationDate;
    elements.spanishIsbn.value = edition.isbn;
    elements.spanishCharacters.value = edition.characters.join(", ");
    elements.spanishCoverUrl.value = edition.coverImageUrl;
    elements.spanishReferenceUrl.value = edition.referenceUrl;
    elements.spanishNotes.value = edition.notes;
    renderSpanishSelectedIssues();
  }
  openDialog(elements.spanishEditionModal);
}

async function searchSpanishIssues() {
  const query = elements.spanishIssueSearch.value.trim();
  if (query.length < 2) {
    elements.spanishIssueSearchResults.innerHTML = query ? `<span class="muted">Escribí al menos dos caracteres.</span>` : "";
    return;
  }

  const payload = await api(`/api/catalog/search?q=${encodeURIComponent(query)}&limit=30`);
  const selectedIds = new Set(state.spanishEditions.selectedIssues.map((issue) => issue.id));
  const results = (payload.items || []).filter((issue) => !selectedIds.has(issue.id));
  elements.spanishIssueSearchResults.innerHTML = results.length
    ? results.map((issue) => `
      <button type="button" data-search-issue-id="${issue.id}">
        <strong>${escapeHtml(issue.title)}</strong>
        <span>${escapeHtml(formatDate(issue.releaseDate, issue.datePrecision, issue.dateSource))}</span>
      </button>
    `).join("")
    : `<span class="muted">No se encontraron issues nuevos para agregar.</span>`;

  for (const button of elements.spanishIssueSearchResults.querySelectorAll("button[data-search-issue-id]")) {
    button.addEventListener("click", () => {
      const issue = results.find((item) => item.id === Number(button.dataset.searchIssueId));
      if (!issue) return;
      state.spanishEditions.selectedIssues.push(issue);
      button.remove();
      renderSpanishSelectedIssues();
    });
  }
}

async function saveSpanishEdition(event) {
  event.preventDefault();
  const id = state.spanishEditions.editingId;
  const payload = {
    title: elements.spanishTitle.value.trim(),
    publisher: elements.spanishPublisher.value.trim(),
    purchaseStatus: elements.spanishPurchaseStatus.value,
    collectionName: elements.spanishCollection.value.trim(),
    volumeLabel: elements.spanishVolume.value.trim(),
    formatLabel: elements.spanishFormat.value.trim(),
    publicationDate: elements.spanishPublicationDate.value,
    isbn: elements.spanishIsbn.value.trim(),
    characters: elements.spanishCharacters.value.split(",").map((value) => value.trim()).filter(Boolean),
    coverImageUrl: elements.spanishCoverUrl.value.trim(),
    referenceUrl: elements.spanishReferenceUrl.value.trim(),
    notes: elements.spanishNotes.value.trim(),
    issueIds: state.spanishEditions.selectedIssues.map((issue) => issue.id)
  };
  await api(id ? `/api/spanish-editions/${id}` : "/api/spanish-editions", {
    method: id ? "PUT" : "POST",
    body: JSON.stringify(payload)
  });
  closeDialog(elements.spanishEditionModal);
  await loadSpanishEditions();
}

function sortComicGroup(a, b) {
  if (a.issueNumber !== null && a.issueNumber !== undefined && b.issueNumber !== null && b.issueNumber !== undefined) {
    return b.issueNumber - a.issueNumber;
  }

  if (a.releaseDate !== b.releaseDate) {
    return String(b.releaseDate).localeCompare(String(a.releaseDate));
  }

  return String(a.title).localeCompare(String(b.title), "es");
}

function groupComicsByVolume(comics) {
  const groups = new Map();

  for (const comic of comics) {
    const key = comic.volumePageTitle || comic.volumeName || comic.title;

    if (!groups.has(key)) {
      groups.set(key, {
        key,
        volumeName: comic.volumeName || "Volumen sin detectar",
        volumeFandomUrl: comic.volumeFandomUrl || comic.fandomUrl,
        comics: []
      });
    }

    groups.get(key).comics.push(comic);
  }

  return [...groups.values()]
    .map((group) => ({
      ...group,
      comics: [...group.comics].sort(sortComicGroup)
    }))
    .sort((a, b) => a.volumeName.localeCompare(b.volumeName, "es"));
}

function renderComicGroups(container, comics) {
  const volumeGroups = groupComicsByVolume(comics);
  container.innerHTML = volumeGroups.map((group) => `
    <section class="volume-group">
      <div class="volume-group__header">
        <div>
          <p class="eyebrow">Volumen</p>
          <h3>${group.volumeName}</h3>
        </div>
        <div class="volume-group__meta">
          <span class="muted">${group.comics.length} cómic(s)</span>
          <a class="button button-secondary" href="${group.volumeFandomUrl}" target="_blank" rel="noreferrer">Abrir volumen</a>
        </div>
      </div>
      <div class="volume-group__grid">
        ${group.comics.map((comic) => `
          <article class="comic-card" data-comic-id="${comic.id}">
            <img src="${comic.coverImageUrl || ""}" alt="Tapa de ${comic.title}" loading="lazy" />
            <div>
              <p>${formatDate(comic.releaseDate)}${comic.issueLabel ? ` - ${comic.issueLabel}` : ""}</p>
              <h3>${comic.title}</h3>
            </div>
            <div class="tags">
              ${(comic.matchSummary || comic.matchedCharacters || []).slice(0, 4).map((character) => `<span class="tag">${character}</span>`).join("")}
            </div>
          </article>
        `).join("")}
      </div>
    </section>
  `).join("");

  for (const card of container.querySelectorAll(".comic-card")) {
    card.addEventListener("click", () => {
      const comic = comics.find((item) => String(item.id) === card.dataset.comicId);
      if (comic) {
        openModal(comic);
      }
    });
  }

  return volumeGroups.length;
}

function renderComics() {
  const total = state.comics.length;
  const pages = Math.max(1, Math.ceil(total / state.approvals.pageSize));
  state.approvals.recentPage = Math.min(state.approvals.recentPage, pages - 1);
  const start = state.approvals.recentPage * state.approvals.pageSize;
  const visible = state.comics.slice(start, start + state.approvals.pageSize);
  const volumeCount = renderComicGroups(elements.comicsGrid, visible);
  const weekKey = state.comics[0]?.weekKey
    || (state.dashboard?.lastSync?.status === "completed" ? state.dashboard.lastSync.weekKey : "");
  elements.resultsMeta.textContent = `${total} resultados · ${volumeCount} volúmenes en esta página`;
  elements.recentApprovalsMeta.textContent = weekKey
    ? `Revisión ${weekKey}. Se muestran únicamente los issues aprobados en esa revisión.`
    : "Todavía no hay una revisión semanal completada.";
  elements.emptyState.classList.toggle("hidden", state.comics.length > 0);
  renderApprovalPagination("recent", total, state.approvals.recentPage);
}

function renderApprovalPagination(scope, total, page) {
  const pages = Math.max(1, Math.ceil(total / state.approvals.pageSize));
  const group = [...elements.approvalPageGroups].find((item) => item.dataset.approvalPagination === scope);
  if (!group) return;
  group.classList.toggle("hidden", total <= state.approvals.pageSize);
  const first = total ? page * state.approvals.pageSize + 1 : 0;
  const last = Math.min(total, first + state.approvals.pageSize - 1);
  group.querySelector("[data-approval-page-meta]").textContent = `${first}-${last} de ${total} · página ${page + 1} de ${pages}`;
  for (const button of group.querySelectorAll("[data-approval-page-action]")) {
    const action = button.dataset.approvalPageAction;
    button.disabled = action === "first" || action === "prev" ? page <= 0 : page >= pages - 1;
  }
}

function renderHistoryComics() {
  elements.historySection.classList.toggle("hidden", !state.historyOpen);
  elements.historyToggle.textContent = state.historyOpen ? "Ocultar historial" : "Ver historial de aprobados";

  if (!state.historyOpen) return;

  const sorted = [...state.historyComics].sort((a, b) => {
    if (a.weekYear !== b.weekYear) return Number(b.weekYear || 0) - Number(a.weekYear || 0);
    if (a.weekNumber !== b.weekNumber) return Number(b.weekNumber || 0) - Number(a.weekNumber || 0);
    return String(b.releaseDate || "").localeCompare(String(a.releaseDate || ""));
  });
  const pages = Math.max(1, Math.ceil(sorted.length / state.approvals.pageSize));
  state.approvals.historyPage = Math.min(state.approvals.historyPage, pages - 1);
  const start = state.approvals.historyPage * state.approvals.pageSize;
  const visible = sorted.slice(start, start + state.approvals.pageSize);
  const volumeCount = renderComicGroups(elements.historyComicsGrid, visible);
  elements.historyResultsMeta.textContent = `${sorted.length} aprobados · ${volumeCount} volúmenes en esta página`;
  elements.historyEmptyState.classList.toggle("hidden", sorted.length > 0);
  renderApprovalPagination("history", sorted.length, state.approvals.historyPage);
}

function renderPending() {
  const pending = state.dashboard?.pendingReviews || [];

  if (!pending.length) {
    elements.pendingList.innerHTML = `
      <li class="pending-item pending-item-empty">
        <div class="pending-copy">
          <strong>Sin pendientes</strong>
          <span class="muted">Todo lo ambiguo ya fue decidido o todavía no se configuró Telegram.</span>
        </div>
      </li>
    `;
    return;
  }

  elements.pendingList.innerHTML = pending.map((item) => {
    const matches = (item.matchSummary || []).join(", ") || "Sin match fuerte";
    const cover = item.coverImageUrl
      ? `<img src="${escapeHtml(item.coverImageUrl)}" alt="" loading="lazy" />`
      : `<div class="pending-cover-placeholder">Sin tapa</div>`;
    return `
      <li class="pending-item" data-review-id="${item.id}">
        <div class="pending-cover">${cover}</div>
        <div class="pending-copy">
          <strong><a href="${escapeHtml(item.fandomUrl)}" target="_blank" rel="noreferrer">${escapeHtml(item.title)}</a></strong>
          <span class="muted">${escapeHtml(item.volumeName || "Volumen sin detectar")}${item.issueLabel ? ` - ${escapeHtml(item.issueLabel)}` : ""}</span>
          <span class="muted">${escapeHtml(formatDate(item.releaseDate))}</span>
          <span class="pending-matches"><strong>Personajes detectados:</strong> ${escapeHtml(matches)}</span>
          ${item.originalityReason ? `<span class="muted">${escapeHtml(item.originalityReason)}</span>` : ""}
        </div>
        <div class="pending-actions">
          <button class="button button-owned" data-review-action="approve" type="button">Agregar</button>
          <button class="button button-danger" data-review-action="reject" type="button">No agregar</button>
        </div>
      </li>
    `;
  }).join("");

  for (const button of elements.pendingList.querySelectorAll("button[data-review-action]")) {
    button.addEventListener("click", async () => {
      const item = button.closest("[data-review-id]");
      const reviewId = Number(item?.dataset.reviewId);
      const action = button.dataset.reviewAction;
      for (const sibling of item.querySelectorAll("button")) sibling.disabled = true;

      try {
        await api(`/api/reviews/${reviewId}/decision`, {
          method: "POST",
          body: JSON.stringify({ action })
        });
        setSyncStatus(action === "approve" ? "Cómic agregado desde la revisión manual" : "Cómic rechazado desde la revisión manual");
        await Promise.all([loadDashboard(), loadComics()]);
      } catch (error) {
        setSyncStatus(error.message);
        for (const sibling of item.querySelectorAll("button")) sibling.disabled = false;
      }
    });
  }
}

function renderSystemMetrics(metrics) {
  const cards = [
    ["CPU del servidor", `${metrics.process.cpuPercent}%`],
    ["CPU total del equipo", `${metrics.system.cpuPercent}%`],
    ["RAM del servidor", formatBytes(metrics.process.memoryRssBytes)],
    ["RAM total usada", `${metrics.system.usedMemoryPercent}%`],
    ["Base de datos", formatBytes(metrics.storage.databaseBytes)],
    ["Backups", formatBytes(metrics.storage.backupsBytes)],
    ["Disco usado", metrics.storage.diskUsedPercent === null ? "Sin dato" : `${metrics.storage.diskUsedPercent}%`],
    ["Servidor activo", formatDuration(metrics.process.uptimeSeconds)]
  ];
  elements.systemMetricsGrid.innerHTML = cards.map(([label, value]) => `
    <article class="system-metric"><span class="muted">${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></article>
  `).join("");
  elements.systemSampledAt.textContent = `PID ${metrics.process.pid} · ${metrics.system.platform}/${metrics.system.architecture} · Node ${metrics.system.nodeVersion} · ${metrics.system.logicalCores} núcleos lógicos · muestra ${formatDateTime(metrics.sampledAt)}`;

  const telegram = metrics.telegram || {};
  elements.telegramRuntimeStatus.textContent = telegram.configured
    ? `Bot ${telegram.running ? "conectado y escuchando dentro del servidor" : "configurado pero detenido"}. Revisiones: ${telegram.reviewsEnabled ? "activas" : "sin chat"}; resúmenes: ${telegram.summariesEnabled ? "activos" : "sin chat"}; backups: ${telegram.backupsEnabled ? "activos" : "sin chat"}.${telegram.lastPollAt ? ` Último contacto: ${formatDateTime(telegram.lastPollAt)}.` : ""}${telegram.lastError ? ` Error: ${telegram.lastError}` : ""}`
    : "Bot no configurado. La revisión manual desde esta página funciona igualmente.";

  const operations = metrics.operations || {};
  const running = [
    operations.syncRunning ? "revisión semanal" : "",
    operations.catalogImportRunning ? "importación de catálogos" : "",
    operations.weeklyUpdateRunning ? "actualización automática" : "",
    operations.quarterlyRefreshRunning ? "revisión trimestral" : ""
  ].filter(Boolean);
  elements.serverOperationsStatus.textContent = running.length
    ? `En curso: ${running.join(", ")}.`
    : `Servidor en reposo. Sistema activo desde hace ${formatDuration(metrics.system.uptimeSeconds)}.`;
}

async function refreshSystemMetrics() {
  try {
    renderSystemMetrics(await api("/api/system/metrics"));
  } catch (error) {
    elements.systemSampledAt.textContent = error.message;
  }
}

async function loadAutomationSettings() {
  const automation = await api("/api/automation");
  elements.automationEnabled.checked = automation.enabled;
  elements.automationDay.value = automation.day;
  elements.automationTime.value = `${String(automation.hour).padStart(2, "0")}:${String(automation.minute).padStart(2, "0")}`;
  const external = automation.externalTaskInstalled
    ? "Tarea del sistema instalada"
    : (automation.platform === "win32" ? "Tarea de Windows no instalada" : "El instalador del sistema debe actualizarse por separado");
  elements.automationStatus.textContent = `${automation.enabled ? "Activa" : "Desactivada"}. ${external}. Protección contra duplicados: activa.`;
  return automation;
}

async function saveAutomationSettings() {
  const [hour, minute] = elements.automationTime.value.split(":").map(Number);
  elements.automationSave.disabled = true;
  try {
    const automation = await api("/api/automation", {
      method: "PUT",
      body: JSON.stringify({
        enabled: elements.automationEnabled.checked,
        day: elements.automationDay.value,
        hour,
        minute
      })
    });
    elements.automationStatus.textContent = automation.enabled
      ? "Horario guardado y tarea del sistema actualizada."
      : "Actualización automática desactivada y tarea del sistema eliminada.";
    await loadDashboard();
  } catch (error) {
    elements.automationStatus.textContent = error.message;
  } finally {
    elements.automationSave.disabled = false;
  }
}

async function saveQuarterlyRefreshSettings() {
  const nextRefreshAt = isoFromLocalDateTime(elements.quarterlyRefreshDate.value, elements.quarterlyRefreshTime.value);
  elements.quarterlyRefreshSave.disabled = true;
  try {
    const status = await api("/api/catalog/refresh-schedule", {
      method: "PUT",
      body: JSON.stringify({
        enabled: elements.quarterlyRefreshEnabled.checked,
        nextRefreshAt
      })
    });
    state.dashboard.quarterlyRefresh = status;
    renderQuarterlyRefreshStatus();
    await loadDashboard();
  } catch (error) {
    elements.quarterlyRefreshStatus.textContent = error.message;
  } finally {
    elements.quarterlyRefreshSave.disabled = false;
  }
}

async function loadQuarterlyRefreshSettings() {
  const status = await api("/api/catalog/refresh-schedule");
  state.dashboard = state.dashboard || { config: {} };
  state.dashboard.quarterlyRefresh = status;
  renderQuarterlyRefreshStatus();
  return status;
}

function askConfirmation({ title, message }) {
  return new Promise((resolve) => {
    const cleanup = (answer) => {
      elements.confirmYes.removeEventListener("click", onYes);
      elements.confirmNo.removeEventListener("click", onNo);
      elements.confirmModal.removeEventListener("cancel", onCancel);
      elements.confirmModal.removeEventListener("close", onClose);
      if (elements.confirmModal.open) {
        closeDialog(elements.confirmModal);
      }
      resolve(answer);
    };
    const onYes = () => cleanup(true);
    const onNo = () => cleanup(false);
    const onCancel = (event) => {
      event.preventDefault();
      cleanup(false);
    };
    const onClose = () => cleanup(false);

    elements.confirmTitle.textContent = title;
    elements.confirmMessage.textContent = message;
    elements.confirmYes.addEventListener("click", onYes);
    elements.confirmNo.addEventListener("click", onNo);
    elements.confirmModal.addEventListener("cancel", onCancel);
    elements.confirmModal.addEventListener("close", onClose);
    openDialog(elements.confirmModal);
    elements.confirmNo.focus();
  });
}

async function triggerQuarterlyRefresh() {
  const confirmed = await askConfirmation({
    title: "Revisar todos los metadatos ahora",
    message: "Esta revisión volverá a consultar todas las fichas de Marvel Fandom y puede tardar varios minutos. ¿Continuar?"
  });
  if (!confirmed) return;
  elements.quarterlyRefreshButton.disabled = true;
  try {
    const result = await api("/api/catalog/refresh-all", { method: "POST", body: JSON.stringify({}) });
    setSyncStatus(result.started ? "Revisión completa de metadatos iniciada" : "Ya hay una actualización en curso");
    await loadDashboard();
  } catch (error) {
    elements.quarterlyRefreshStatus.textContent = error.message;
    elements.quarterlyRefreshButton.disabled = false;
  } finally {
    renderQuarterlyRefreshStatus();
  }
}

async function confirmCsvExport(event) {
  event.preventDefault();
  const confirmed = await askConfirmation({
    title: "Exportar CSV",
    message: "Se descargará un archivo CSV con el catálogo USA y el estado actual de tu colección. ¿Continuar?"
  });

  if (confirmed) {
    window.location.assign(elements.exportCsvButton.href);
  }
}

async function openSystemModal() {
  openDialog(elements.systemModal);
  await refreshSystemMetrics();
  clearInterval(state.systemMetricsTimer);
  state.systemMetricsTimer = setInterval(refreshSystemMetrics, 2000);
}

function closeSystemModal() {
  clearInterval(state.systemMetricsTimer);
  state.systemMetricsTimer = null;
  closeDialog(elements.systemModal);
}

function renderTelegramConfigStatus(config) {
  const status = config.status || {};
  if (!config.botTokenConfigured) {
    elements.telegramConfigStatus.textContent = "Bot no configurado. Cargá un token para activar Telegram.";
    return;
  }

  const enabledParts = [
    status.reviewsEnabled ? "revisión manual" : "",
    status.summariesEnabled ? "resúmenes" : "",
    status.backupsEnabled ? "backups" : ""
  ].filter(Boolean);
  const enabledText = enabledParts.length ? enabledParts.join(", ") : "sin chats activos";
  elements.telegramConfigStatus.textContent = `Token guardado. Bot ${status.running ? "escuchando" : "detenido"}. Funciones: ${enabledText}.${status.lastError ? ` Error: ${status.lastError}` : ""}`;
}

async function loadTelegramConfig() {
  const config = await api("/api/telegram/config");
  elements.telegramBotToken.value = "";
  elements.telegramBotToken.placeholder = config.botTokenConfigured
    ? "Token guardado; dejalo vacío para conservarlo"
    : "Pegá el token de BotFather";
  elements.telegramClearToken.checked = false;
  elements.telegramReviewChatId.value = config.reviewChatId || "";
  elements.telegramSummaryChatId.value = config.summaryChatId || "";
  elements.telegramBackupChatId.value = config.backupChatId || "";
  elements.telegramAllowedUserId.value = config.allowedUserId || "";
  renderTelegramConfigStatus(config);
  return config;
}

async function saveTelegramConfig(event) {
  event.preventDefault();
  const payload = {
    reviewChatId: elements.telegramReviewChatId.value.trim(),
    summaryChatId: elements.telegramSummaryChatId.value.trim(),
    backupChatId: elements.telegramBackupChatId.value.trim(),
    allowedUserId: elements.telegramAllowedUserId.value.trim()
  };
  const token = elements.telegramBotToken.value.trim();
  if (elements.telegramClearToken.checked) {
    payload.botToken = "";
  } else if (token) {
    payload.botToken = token;
  }

  elements.telegramConfigSave.disabled = true;
  try {
    const config = await api("/api/telegram/config", {
      method: "PUT",
      body: JSON.stringify(payload)
    });
    elements.telegramBotToken.value = "";
    elements.telegramClearToken.checked = false;
    renderTelegramConfigStatus(config);
    await loadDashboard();
    if (elements.systemModal.open) {
      await refreshSystemMetrics();
    }
  } catch (error) {
    elements.telegramConfigStatus.textContent = error.message;
  } finally {
    elements.telegramConfigSave.disabled = false;
  }
}

async function openSettingsModal() {
  openDialog(elements.settingsModal);
  await Promise.all([loadTelegramConfig(), loadAutomationSettings(), loadQuarterlyRefreshSettings()]);
}

function closeSettingsModal() {
  closeDialog(elements.settingsModal);
}

function renderCharacters() {
  const trackedCharacters = window.__trackedCharacters || [];
  const query = normalizeForSearch(state.suggestionQuery);
  const filtered = trackedCharacters.filter((character) => !query || normalizeForSearch([
    character.displayName,
    character.fandomEntity,
    character.reality,
    ...character.aliases
  ].join(" ")).includes(query));
  const pages = Math.max(1, Math.ceil(filtered.length / state.suggestionPageSize));
  state.suggestionPage = Math.min(state.suggestionPage, pages - 1);
  const start = state.suggestionPage * state.suggestionPageSize;
  const visible = filtered.slice(start, start + state.suggestionPageSize);
  const enabledCount = trackedCharacters.filter((character) => character.active).length;
  elements.suggestionCharactersSummary.textContent = `${enabledCount} de ${trackedCharacters.length} personajes del catálogo participan en las sugerencias. Mostrando ${filtered.length ? start + 1 : 0}-${Math.min(filtered.length, start + visible.length)} de ${filtered.length}.`;
  elements.characterPageMeta.textContent = `Página ${state.suggestionPage + 1} de ${pages}`;
  for (const button of elements.characterPageButtons) {
    const action = button.dataset.characterPageAction;
    button.disabled = action === "first" || action === "prev" ? state.suggestionPage <= 0 : state.suggestionPage >= pages - 1;
  }

  elements.charactersList.innerHTML = visible.map((character) => `
    <article class="character-item">
      <strong>${escapeHtml(character.displayName)}</strong>
      <p class="muted">${escapeHtml(character.reality || "Realidad sin datos")} · ${character.issueCount || 0} issues</p>
      <div class="tags">
        ${character.aliases.map((alias) => `<span class="tag">${escapeHtml(alias)}</span>`).join("")}
      </div>
      <p class="muted">${character.active ? "Incluido en sugerencias" : "Excluido de sugerencias"}</p>
      <div class="character-actions">
        <button class="button button-secondary" data-action="edit" data-id="${character.id}">Configurar</button>
      </div>
    </article>
  `).join("");

  for (const button of elements.charactersList.querySelectorAll("button")) {
    button.addEventListener("click", async () => {
      const id = Number(button.dataset.id);
      const character = trackedCharacters.find((item) => item.id === id);

      if (button.dataset.action === "edit" && character) {
        state.editingCharacterId = id;
        elements.characterId.value = String(id);
        elements.characterName.value = character.displayName;
        elements.characterAliases.value = character.aliases.join(", ");
        elements.characterActive.checked = character.active;
        elements.characterForm.classList.remove("hidden");
        elements.characterAliases.focus();
      }
    });
  }
}

function openModal(comic) {
  elements.modalTitle.textContent = comic.title;
  elements.modalDate.textContent = `${formatDate(comic.releaseDate)}${comic.issueLabel ? ` - ${comic.issueLabel}` : ""}`;
  elements.modalCharacters.textContent = `Volumen: ${comic.volumeName || "Sin detectar"} | Personajes: ${(comic.matchSummary || comic.matchedCharacters || []).join(", ") || "Sin personajes destacados"}`;
  elements.modalLink.href = comic.fandomUrl;
  elements.modalCover.src = comic.coverImageUrl || "";
  elements.modalCover.alt = `Tapa de ${comic.title}`;
  openDialog(elements.modal);
}

function resetCharacterForm() {
  state.editingCharacterId = null;
  elements.characterId.value = "";
  elements.characterName.value = "";
  elements.characterAliases.value = "";
  elements.characterActive.checked = true;
  elements.characterForm.classList.add("hidden");
}

async function loadDashboard() {
  state.dashboard = await api("/api/dashboard");
  renderStats();
  renderPending();
}

async function loadCatalogStats() {
  const character = encodeURIComponent(state.catalog.filters.character);
  const universeGroup = encodeURIComponent(state.catalog.filters.universeGroup);
  const payload = await api(`/api/catalog/stats?character=${character}&universeGroup=${universeGroup}`);
  state.catalog.stats = payload.stats;
  state.catalog.importStatus = payload.importStatus || {};
  renderCatalogStats();
}

async function loadCatalogCharacters() {
  state.catalog.characters = await api("/api/catalog/characters");

  ensureCatalogCharacterForUniverseGroup();

  elements.catalogUniverseGroup.value = state.catalog.filters.universeGroup;
  renderCatalogCharacters();
}

async function loadCatalog() {
  const params = new URLSearchParams({
    ...state.catalog.filters,
    limit: String(state.catalog.limit),
    offset: String(state.catalog.offset)
  });
  const payload = await api(`/api/catalog?${params.toString()}`);
  state.catalog.items = payload.items;
  state.catalog.total = payload.total;
  state.catalog.limit = payload.limit;
  state.catalog.offset = payload.offset;
  renderCatalog();
}

async function loadTrackedCharacters() {
  window.__trackedCharacters = await api("/api/tracked-characters");
  renderCharacters();
}

async function loadComics() {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(state.filters)) {
    if (value) {
      params.set(key, value);
    }
  }

  params.set("scope", "latest-week");
  state.comics = await api(`/api/comics?${params.toString()}`);
  renderComics();

  if (state.historyOpen) {
    params.set("scope", "history");
    state.historyComics = await api(`/api/comics?${params.toString()}`);
  }
  renderHistoryComics();
}

async function toggleApprovalHistory() {
  state.historyOpen = !state.historyOpen;
  state.approvals.historyPage = 0;
  await loadComics();
}

async function reloadAll() {
  await Promise.all([loadDashboard(), loadTrackedCharacters(), loadComics(), loadCatalogCharacters(), loadSpanishEditions()]);
  await Promise.all([loadCatalogStats(), loadCatalog()]);
  setSyncStatus("Vista actualizada");
}

async function confirmRefreshView() {
  const confirmed = await askConfirmation({
    title: "Actualizar vista",
    message: "Se recargarán los datos visibles desde la base local. No se consultarán fuentes externas. ¿Continuar?"
  });
  if (!confirmed) return;

  await reloadAll();
}

async function triggerCatalogImport() {
  const confirmed = await askConfirmation({
    title: "Importar o actualizar catálogos",
    message: "Se consultará Marvel Fandom para actualizar las listas históricas de personajes sin borrar tus marcas de colección. Puede tardar varios minutos. ¿Continuar?"
  });
  if (!confirmed) return;

  elements.catalogImportButton.disabled = true;
  setSyncStatus("Iniciando importación histórica...");

  try {
    await api("/api/catalog/import", {
      method: "POST",
      body: JSON.stringify({})
    });
    await pollCatalogImport();
  } catch (error) {
    setSyncStatus(error.message);
    await loadCatalogStats();
  }
}

async function triggerCatalogContinue() {
  const character = selectedCatalogCharacter();

  if (!character) {
    return;
  }

  elements.catalogContinueButton.disabled = true;
  setSyncStatus(`Continuando ${character.displayName} desde ${character.lastComicDate ? formatDate(character.lastComicDate) : "el inicio"}...`);

  try {
    await api(`/api/catalog/characters/${encodeURIComponent(character.slug)}/continue`, {
      method: "POST",
      body: JSON.stringify({})
    });
    await pollCatalogImport();
  } catch (error) {
    setSyncStatus(error.message);
    await loadCatalogStats();
  }
}

async function pollCatalogImport() {
  for (let attempt = 0; attempt < 600; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 2500));
    await loadCatalogStats();
    setSyncStatus(catalogImportLabel(state.catalog.importStatus));

    if (!state.catalog.importStatus.running) {
      await loadCatalogCharacters();
      await Promise.all([loadCatalogStats(), loadCatalog()]);
      return;
    }
  }

  setSyncStatus("La importación sigue corriendo; usá Actualizar vista más tarde");
}

async function triggerSync() {
  elements.syncButton.disabled = true;
  setSyncStatus("Revisando semana actual...");

  try {
    const result = await api("/api/sync", {
      method: "POST",
      body: JSON.stringify({})
    });

    if (!result.started) {
      setSyncStatus("Ya hay una sincronización corriendo");
    } else {
      setSyncStatus(`Actualización USA + Panini lanzada para ${result.weekKey}`);
    }

    await pollUntilFinished();
  } catch (error) {
    setSyncStatus(error.message);
  } finally {
    elements.syncButton.disabled = false;
  }
}

async function pollUntilFinished() {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 2500));
    await loadDashboard();

    if (!state.dashboard.config.weeklyUpdateRunning) {
      await Promise.all([loadComics(), loadCatalogCharacters(), loadCatalogStats(), loadCatalog(), loadSpanishEditions()]);
      setSyncStatus("Revisión USA + Panini terminada");
      return;
    }
  }

  setSyncStatus("La sync sigue corriendo; usá Actualizar vista en unos segundos");
}

async function triggerPaniniImport() {
  elements.paniniImportButton.disabled = true;
  setSyncStatus("Iniciando revisión de Panini...");
  try {
    const result = await api("/api/panini/import", {
      method: "POST",
      body: JSON.stringify({ full: false })
    });
    if (!result.started) return;
    for (let attempt = 0; attempt < 30; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 2500));
      await loadDashboard();
      await loadSpanishEditions();
      if (!state.dashboard.config.paniniImportRunning) {
        setSyncStatus("Revisión de Panini terminada");
        return;
      }
    }
    setSyncStatus("Panini sigue procesándose en segundo plano; podés actualizar la vista más tarde");
  } catch (error) {
    setSyncStatus(error.message);
  } finally {
    elements.paniniImportButton.disabled = false;
  }
}

function wireFilters() {
  const applyFilters = debounce(async () => {
    state.filters.query = elements.queryInput.value.trim();
    state.filters.character = elements.characterInput.value.trim();
    state.filters.from = elements.fromInput.value;
    state.filters.to = elements.toInput.value;
    state.approvals.recentPage = 0;
    state.approvals.historyPage = 0;
    await loadComics();
  });

  for (const input of [elements.queryInput, elements.characterInput, elements.fromInput, elements.toInput]) {
    input.addEventListener("input", applyFilters);
    input.addEventListener("change", applyFilters);
  }
}

function wireCatalogFilters() {
  const applyFilters = debounce(async () => {
    state.catalog.filters.character = elements.catalogCharacter.value || "";
    state.catalog.filters.query = elements.catalogQuery.value.trim();
    state.catalog.filters.ownership = elements.catalogOwnership.value;
    state.catalog.filters.appearance = elements.catalogAppearance.value;
    state.catalog.filters.sort = elements.catalogSort.value;
    state.catalog.filters.from = elements.catalogFrom.value;
    state.catalog.filters.to = elements.catalogTo.value;
    state.catalog.offset = 0;
    await Promise.all([loadCatalogStats(), loadCatalog()]);
  });

  elements.catalogUniverseGroup.addEventListener("change", async () => {
    state.catalog.filters.universeGroup = elements.catalogUniverseGroup.value || "main";
    ensureCatalogCharacterForUniverseGroup();
    renderCatalogCharacters();
    elements.catalogCharacter.value = state.catalog.filters.character;
    state.catalog.offset = 0;
    await Promise.all([loadCatalogStats(), loadCatalog()]);
  });

  for (const select of elements.catalogPageSizes) {
    select.addEventListener("change", async () => {
      state.catalog.limit = Number(select.value) || 60;
      state.catalog.offset = 0;
      for (const sibling of elements.catalogPageSizes) sibling.value = String(state.catalog.limit);
      await loadCatalog();
    });
  }

  for (const input of [
    elements.catalogQuery,
    elements.catalogCharacter,
    elements.catalogOwnership,
    elements.catalogAppearance,
    elements.catalogSort,
    elements.catalogFrom,
    elements.catalogTo
  ]) {
    input.addEventListener("input", applyFilters);
    input.addEventListener("change", applyFilters);
  }
}

function wireSpanishEditionEvents() {
  const applyFilters = debounce(async () => {
    state.spanishEditions.filters.query = elements.spanishQuery.value.trim();
    state.spanishEditions.filters.status = elements.spanishStatusFilter.value;
    state.spanishEditions.filters.publisher = elements.spanishPublisherFilter.value;
    state.spanishEditions.filters.character = elements.spanishCharacterFilter.value;
    state.spanishEditions.offset = 0;
    await loadSpanishEditions();
  });
  for (const input of [
    elements.spanishQuery,
    elements.spanishStatusFilter,
    elements.spanishPublisherFilter,
    elements.spanishCharacterFilter
  ]) {
    input.addEventListener("input", applyFilters);
    input.addEventListener("change", applyFilters);
  }

  for (const select of elements.spanishPageSizes) {
    select.addEventListener("change", async () => {
      state.spanishEditions.limit = Number(select.value) || 20;
      state.spanishEditions.offset = 0;
      await loadSpanishEditions();
    });
  }

  for (const button of elements.spanishPageButtons) {
    button.addEventListener("click", async () => {
      const action = button.dataset.spanishPageAction;
      const spanish = state.spanishEditions;
      if (action === "first") spanish.offset = 0;
      if (action === "prev") spanish.offset = Math.max(0, spanish.offset - spanish.limit);
      if (action === "next") spanish.offset = Math.min(Math.max(0, spanish.total - 1), spanish.offset + spanish.limit);
      if (action === "last") spanish.offset = Math.max(0, (Math.ceil(spanish.total / spanish.limit) - 1) * spanish.limit);
      await loadSpanishEditions();
      elements.spanishEditionsList.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  elements.spanishAddButton.addEventListener("click", () => openSpanishEditionModal());
  elements.spanishEditionClose.addEventListener("click", () => closeDialog(elements.spanishEditionModal));
  elements.spanishEditionCancel.addEventListener("click", () => closeDialog(elements.spanishEditionModal));
  elements.spanishEditionForm.addEventListener("submit", saveSpanishEdition);
  elements.spanishIssueSearch.addEventListener("input", debounce(searchSpanishIssues, 300));
}

function activateAppTab(name, { updateHash = true } = {}) {
  const validName = ["usa", "spanish", "tracking"].includes(name) ? name : "usa";
  state.activeTab = validName;
  for (const tab of elements.appTabs) {
    const active = tab.dataset.appTab === validName;
    tab.classList.toggle("is-active", active);
    tab.setAttribute("aria-selected", active ? "true" : "false");
  }
  for (const panel of elements.appTabPanels) {
    const active = panel.dataset.appTabPanel === validName;
    panel.classList.toggle("is-active", active);
    panel.hidden = !active;
  }
  if (updateHash) {
    const hash = validName === "spanish" ? "#spanish-editions" : validName === "tracking" ? "#seguimiento" : "#issues-usa";
    history.replaceState(null, "", hash);
  }
}

function wireAppTabs() {
  for (const tab of elements.appTabs) {
    tab.addEventListener("click", () => activateAppTab(tab.dataset.appTab));
  }
  for (const link of elements.tabOpenLinks) {
    link.addEventListener("click", (event) => {
      event.preventDefault();
      activateAppTab(link.dataset.openTab);
      document.querySelector(".app-tabs")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }
  const initialTab = location.hash === "#spanish-editions"
    ? "spanish"
    : location.hash === "#seguimiento"
      ? "tracking"
      : "usa";
  activateAppTab(initialTab, { updateHash: false });
}

function wireEvents() {
  for (const dialog of document.querySelectorAll("dialog")) {
    dialog.addEventListener("close", updateModalScrollLock);
    wireDialogDismissal(dialog);
  }
  elements.refreshButton.addEventListener("click", confirmRefreshView);
  elements.historyToggle.addEventListener("click", toggleApprovalHistory);
  for (const button of elements.approvalPageButtons) {
    button.addEventListener("click", () => {
      const group = button.closest("[data-approval-pagination]");
      const scope = group?.dataset.approvalPagination;
      const stateKey = scope === "history" ? "historyPage" : "recentPage";
      const total = scope === "history" ? state.historyComics.length : state.comics.length;
      const pages = Math.max(1, Math.ceil(total / state.approvals.pageSize));
      const action = button.dataset.approvalPageAction;
      if (action === "first") state.approvals[stateKey] = 0;
      if (action === "prev") state.approvals[stateKey] = Math.max(0, state.approvals[stateKey] - 1);
      if (action === "next") state.approvals[stateKey] = Math.min(pages - 1, state.approvals[stateKey] + 1);
      if (action === "last") state.approvals[stateKey] = pages - 1;
      if (scope === "history") renderHistoryComics(); else renderComics();
      group?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  }
  elements.syncButton.addEventListener("click", triggerSync);
  elements.exportCsvButton.addEventListener("click", confirmCsvExport);
  elements.paniniImportButton.addEventListener("click", triggerPaniniImport);
  elements.catalogImportButton.addEventListener("click", triggerCatalogImport);
  elements.catalogContinueButton.addEventListener("click", triggerCatalogContinue);
  elements.systemInfoButton.addEventListener("click", openSystemModal);
  elements.settingsButton.addEventListener("click", openSettingsModal);
  elements.systemClose.addEventListener("click", closeSystemModal);
  elements.settingsClose.addEventListener("click", closeSettingsModal);
  elements.telegramConfigForm.addEventListener("submit", saveTelegramConfig);
  elements.telegramConfigRefresh.addEventListener("click", loadTelegramConfig);
  elements.telegramClearToken.addEventListener("change", () => {
    elements.telegramBotToken.disabled = elements.telegramClearToken.checked;
    if (elements.telegramClearToken.checked) {
      elements.telegramBotToken.value = "";
    }
  });
  elements.systemModal.addEventListener("close", () => {
    clearInterval(state.systemMetricsTimer);
    state.systemMetricsTimer = null;
  });
  for (const button of elements.catalogPageButtons) {
    button.addEventListener("click", async () => {
      const action = button.dataset.catalogPageAction;
      if (action === "prev") state.catalog.offset = Math.max(0, state.catalog.offset - state.catalog.limit);
      if (action === "next") state.catalog.offset += state.catalog.limit;
      if (action === "first") state.catalog.offset = 0;
      if (action === "last") {
        state.catalog.offset = Math.max(0, (Math.ceil(state.catalog.total / state.catalog.limit) - 1) * state.catalog.limit);
      }
      await loadCatalog();
      elements.catalogList.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }
  elements.automationSave.addEventListener("click", saveAutomationSettings);
  elements.quarterlyRefreshSave.addEventListener("click", saveQuarterlyRefreshSettings);
  elements.quarterlyRefreshButton.addEventListener("click", triggerQuarterlyRefresh);
  elements.modalClose.addEventListener("click", () => closeDialog(elements.modal));
  elements.collectionClose.addEventListener("click", () => closeDialog(elements.collectionModal));
  elements.collectionCancel.addEventListener("click", () => closeDialog(elements.collectionModal));
  elements.collectionForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const issue = state.catalog.items.find((item) => item.id === state.editingCatalogIssueId);

    if (!issue) {
      return;
    }

    await saveCollectionIssue(issue, {
      owned: elements.collectionOwned.checked,
      publisher: elements.collectionPublisher.value,
      editionTitle: elements.collectionEdition.value,
      notes: elements.collectionNotes.value
    });
    closeDialog(elements.collectionModal);
  });

  elements.characterReset.addEventListener("click", resetCharacterForm);
  elements.suggestionCharacterQuery.addEventListener("input", () => {
    state.suggestionQuery = elements.suggestionCharacterQuery.value;
    state.suggestionPage = 0;
    renderCharacters();
  });
  for (const button of elements.characterPageButtons) {
    button.addEventListener("click", () => {
      const trackedCharacters = window.__trackedCharacters || [];
      const query = normalizeForSearch(state.suggestionQuery);
      const total = trackedCharacters.filter((character) => !query || normalizeForSearch([
        character.displayName, character.fandomEntity, character.reality, ...character.aliases
      ].join(" ")).includes(query)).length;
      const pages = Math.max(1, Math.ceil(total / state.suggestionPageSize));
      const action = button.dataset.characterPageAction;
      if (action === "first") state.suggestionPage = 0;
      if (action === "prev") state.suggestionPage = Math.max(0, state.suggestionPage - 1);
      if (action === "next") state.suggestionPage = Math.min(pages - 1, state.suggestionPage + 1);
      if (action === "last") state.suggestionPage = pages - 1;
      renderCharacters();
      elements.charactersList.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }
  elements.characterForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const payload = {
      displayName: elements.characterName.value.trim(),
      aliases: elements.characterAliases.value.split(",").map((value) => value.trim()).filter(Boolean),
      active: elements.characterActive.checked
    };

    if (!state.editingCharacterId) return;
    await api(`/api/tracked-characters/${state.editingCharacterId}`, {
      method: "PUT",
      body: JSON.stringify(payload)
    });

    resetCharacterForm();
    await reloadAll();
  });
}

async function bootstrap() {
  wireAppTabs();
  wireEvents();
  wireFilters();
  wireCatalogFilters();
  wireSpanishEditionEvents();
  await reloadAll();
}

bootstrap().catch((error) => {
  setSyncStatus(error.message);
});
