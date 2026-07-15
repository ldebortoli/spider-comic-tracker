const fs = require("node:fs/promises");
const fsSync = require("node:fs");
const path = require("node:path");
const readline = require("node:readline");
const { spawn } = require("node:child_process");

class TelegramBridge {
  constructor({ config, service, serverUrl, projectRoot = process.cwd() }) {
    this.config = config;
    this.service = service;
    this.serverUrl = serverUrl;
    this.projectRoot = projectRoot;
    this.process = null;
    this.restartTimer = null;
    this.lastPollAt = "";
    this.lastError = "";
    this.lastStartedAt = "";
    this.lastStoppedAt = "";
    this.runtime = "python-telegram-bot";
    this.pidPath = path.join(this.projectRoot, "data", "telegram-bot.pid");
  }

  canSendReviews() {
    return Boolean(this.config.botToken && this.config.reviewChatId);
  }

  canSendSummary() {
    return Boolean(this.config.botToken && this.config.summaryChatId);
  }

  canSendBackups() {
    return Boolean(this.config.botToken && this.config.backupChatId);
  }

  getStatus() {
    return {
      configured: Boolean(this.config.botToken),
      pollingEnabled: this.config.pollingEnabled !== false,
      running: Boolean(this.process),
      runtime: this.runtime,
      pid: this.process?.pid || null,
      reviewsEnabled: this.canSendReviews(),
      summariesEnabled: this.canSendSummary(),
      backupsEnabled: this.canSendBackups(),
      lastPollAt: this.lastPollAt,
      lastError: this.lastError,
      lastStartedAt: this.lastStartedAt,
      lastStoppedAt: this.lastStoppedAt
    };
  }

  start() {
    if (!this.config.botToken || this.config.pollingEnabled === false || this.process) {
      return;
    }

    clearTimeout(this.restartTimer);
    this.restartTimer = null;
    const child = spawn(this.config.pythonBin || "python", [path.join(this.projectRoot, "src", "telegram_bot.py")], {
      cwd: this.projectRoot,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        PYTHONUNBUFFERED: "1",
        TELEGRAM_BOT_TOKEN: this.config.botToken,
        TELEGRAM_ALLOWED_USER_ID: this.config.allowedUserId || "",
        TELEGRAM_SERVER_URL: this.serverUrl
      }
    });

    this.process = child;
    this.lastStartedAt = new Date().toISOString();
    this.lastError = "";
    this.saveBotPid(child.pid);
    this.attachProcessLogging(child);

    child.on("error", (error) => {
      if (this.process !== child) return;
      this.process = null;
      this.lastStoppedAt = new Date().toISOString();
      this.clearBotPid(child.pid);
      this.lastError = error.message || String(error);
      this.scheduleRestart();
    });

    child.on("exit", (code, signal) => {
      if (this.process !== child) return;
      this.process = null;
      this.lastStoppedAt = new Date().toISOString();
      this.clearBotPid(child.pid);
      if (code !== 0 && code !== null) {
        this.lastError = `Bot Python finalizó con código ${code}${signal ? ` (${signal})` : ""}`;
      }
      this.scheduleRestart();
    });
  }

  stop() {
    clearTimeout(this.restartTimer);
    this.restartTimer = null;
    const child = this.process;
    this.process = null;
    this.lastStoppedAt = new Date().toISOString();
    if (child && !child.killed) {
      child.kill();
    }
    this.clearBotPid(child?.pid);
  }

  configure(nextConfig) {
    this.stop();
    Object.assign(this.config, nextConfig);
    this.lastPollAt = "";
    this.lastError = "";
    this.start();
  }

  attachProcessLogging(child) {
    const stdout = readline.createInterface({ input: child.stdout });
    stdout.on("line", (line) => this.handleBotProcessLine(line));

    const stderr = readline.createInterface({ input: child.stderr });
    stderr.on("line", (line) => {
      const message = String(line || "").trim();
      if (message) {
        this.lastError = message.slice(0, 600);
        console.error("Bot Telegram Python:", message);
      }
    });
  }

  handleBotProcessLine(line) {
    const raw = String(line || "").trim();
    if (!raw) {
      return;
    }

    try {
      const payload = JSON.parse(raw);
      if (payload.type === "ready" || payload.type === "status") {
        this.lastPollAt = payload.lastPollAt || new Date().toISOString();
        this.lastError = "";
      } else if (payload.type === "error") {
        this.lastError = String(payload.message || "Error del bot Python").slice(0, 600);
      }
    } catch {
      console.log("Bot Telegram Python:", raw);
    }
  }

  scheduleRestart() {
    if (!this.config.botToken || this.config.pollingEnabled === false || this.restartTimer) {
      return;
    }

    this.restartTimer = setTimeout(() => {
      this.restartTimer = null;
      this.start();
    }, 5000);
  }

  saveBotPid(pid) {
    if (!pid) return;
    try {
      fsSync.mkdirSync(path.dirname(this.pidPath), { recursive: true });
      fsSync.writeFileSync(this.pidPath, String(pid), "ascii");
    } catch (error) {
      this.lastError = `No se pudo guardar el PID del bot: ${error.message}`;
    }
  }

  clearBotPid(pid) {
    try {
      if (!fsSync.existsSync(this.pidPath)) return;
      const saved = fsSync.readFileSync(this.pidPath, "utf8").trim();
      if (!pid || saved === String(pid)) {
        fsSync.unlinkSync(this.pidPath);
      }
    } catch {
      // El PID file es auxiliar; no debe romper el servidor.
    }
  }

  async call(method, params = {}) {
    const body = new URLSearchParams();

    for (const [key, value] of Object.entries(params)) {
      if (value === undefined || value === null || value === "") {
        continue;
      }

      if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
        body.set(key, String(value));
      } else {
        body.set(key, JSON.stringify(value));
      }
    }

    const response = await fetch(`https://api.telegram.org/bot${this.config.botToken}/${method}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body
    });

    if (!response.ok) {
      throw new Error(`Telegram devolvió ${response.status} en ${method}`);
    }

    const payload = await response.json();

    if (!payload.ok) {
      throw new Error(payload.description || `Telegram rechazó ${method}`);
    }

    return payload;
  }

  async callMultipart(method, formData) {
    const response = await fetch(`https://api.telegram.org/bot${this.config.botToken}/${method}`, {
      method: "POST",
      body: formData
    });

    if (!response.ok) {
      throw new Error(`Telegram devolvió ${response.status} en ${method}`);
    }

    const payload = await response.json();

    if (!payload.ok) {
      throw new Error(payload.description || `Telegram rechazó ${method}`);
    }

    return payload;
  }

  buildReviewText(review) {
    const matches = review.matchSummary?.length ? review.matchSummary.join(", ") : "Sin coincidencias fuertes";
    const lines = [
      "Revisión manual requerida",
      "",
      `Título: ${review.title}`,
      `Volumen: ${review.volumeName || "Sin detectar"}${review.issueLabel ? ` / ${review.issueLabel}` : ""}`,
      `Fecha: ${review.releaseDate}`,
      `Coincidencias: ${matches}`,
      ""
    ];

    if (review.originalityStatus === "uncertain" && review.originalityReason) {
      lines.push(`Duda principal: ${review.originalityReason}`, "");
    }

    lines.push(review.decisionReason || "Sin motivo adicional.", "", review.fandomUrl);

    return lines.join("\n");
  }

  buildResolvedText(review, action, user) {
    const verb = action === "approve" ? "AGREGADO" : "RECHAZADO";
    const identity = user.username ? `@${user.username}` : user.first_name || user.firstName || String(user.id);
    const matches = review.matchSummary?.length ? review.matchSummary.join(", ") : "Sin coincidencias fuertes";

    return [
      `Revisión ${verb}`,
      "",
      `Título: ${review.title}`,
      `Volumen: ${review.volumeName || "Sin detectar"}${review.issueLabel ? ` / ${review.issueLabel}` : ""}`,
      `Fecha: ${review.releaseDate}`,
      `Coincidencias: ${matches}`,
      ...(review.originalityReason ? [`Originalidad: ${review.originalityReason}`] : []),
      `Resuelto por: ${identity}`,
      "",
      review.fandomUrl
    ].join("\n");
  }

  async sendReviewRequest(review) {
    const payload = await this.call("sendMessage", {
      chat_id: this.config.reviewChatId,
      text: this.buildReviewText(review),
      disable_web_page_preview: true,
      reply_markup: {
        inline_keyboard: [[
          { text: "Agregar", callback_data: `review:${review.id}:approve` },
          { text: "No agregar", callback_data: `review:${review.id}:reject` }
        ]]
      }
    });

    return {
      chatId: String(payload.result.chat.id),
      messageId: String(payload.result.message_id)
    };
  }

  async sendSummary(summary) {
    const statusLine = summary.failed ? "Falló la revisión semanal" : "Revisión semanal finalizada";
    const chunks = [
      statusLine,
      "",
      `Semana: ${summary.weekYear}-W${String(summary.weekNumber).padStart(2, "0")}`,
      `Origen: ${summary.triggerSource}`,
      `Procesados: ${summary.processed}`,
      `Agregados: ${summary.added}`,
      `Rechazados: ${summary.rejected}`,
      `Pendientes: ${summary.pendingReview}`,
      `Reintentos: ${summary.retried || 0}`,
      `Recuperados: ${summary.retryRecovered || 0}`,
      `Errores: ${summary.errors}`
    ];

    if (summary.failed && summary.errorMessage) {
      chunks.push("", `Error: ${summary.errorMessage}`);
    }

    if (summary.addedTitles?.length) {
      chunks.push("", `Agregados: ${summary.addedTitles.slice(0, 8).join(", ")}`);
    }

    if (summary.errorDetails?.length) {
      chunks.push(
        "",
        "Detalle de errores:",
        ...summary.errorDetails.slice(0, 5).map((item) => (
          `- ${item.pageTitle}: ${String(item.message || "Error desconocido").slice(0, 220)}`
        ))
      );
    }

    if (summary.rejectedTitles?.length) {
      chunks.push("", `Rechazados: ${summary.rejectedTitles.slice(0, 8).join(", ")}`);
    }

    if (summary.pendingTitles?.length) {
      chunks.push("", `Pendientes: ${summary.pendingTitles.slice(0, 8).join(", ")}`);
    }

    await this.call("sendMessage", {
      chat_id: this.config.summaryChatId,
      text: chunks.join("\n"),
      disable_web_page_preview: true
    });
  }

  async sendBackupNotice({ text }) {
    await this.call("sendMessage", {
      chat_id: this.config.backupChatId,
      text,
      disable_web_page_preview: true
    });
  }

  async sendBackupFile({ filePath, fileName, caption }) {
    const form = new FormData();
    const buffer = await fs.readFile(filePath);

    form.set("chat_id", this.config.backupChatId);
    form.set("caption", caption);
    form.set("document", new Blob([buffer], { type: "application/gzip" }), fileName);

    return this.callMultipart("sendDocument", form);
  }

  async testConnection() {
    if (!this.config.botToken) {
      throw new Error("Telegram no tiene token configurado.");
    }

    const payload = await this.call("getMe");
    const bot = payload.result || {};
    const targetChatId = this.config.reviewChatId || this.config.summaryChatId || this.config.backupChatId;
    let sentMessage = false;

    if (targetChatId) {
      await this.call("sendMessage", {
        chat_id: targetChatId,
        text: [
          "Prueba de Spider Tracker",
          "",
          "El bot está configurado correctamente.",
          "Comando disponible: /debug"
        ].join("\n"),
        disable_web_page_preview: true
      });
      sentMessage = true;
    }

    return {
      ok: true,
      id: bot.id,
      username: bot.username || "",
      firstName: bot.first_name || "",
      sentMessage,
      running: Boolean(this.process),
      pollingEnabled: this.config.pollingEnabled !== false,
      runtime: this.runtime
    };
  }

  async answerCallbackQuery(callbackQueryId, text, showAlert = false) {
    try {
      await this.call("answerCallbackQuery", {
        callback_query_id: callbackQueryId,
        text,
        show_alert: showAlert
      });
    } catch (error) {
      console.error("No se pudo responder callback de Telegram:", error);
    }
  }

  async handleUpdate(update) {
    if (update.callback_query) {
      await this.handleCallbackQuery(update.callback_query);
      return;
    }

    if (update.message) {
      await this.handleMessage(update.message);
    }
  }

  isAuthorizedUser(user = {}) {
    return !this.config.allowedUserId || String(user.id) === String(this.config.allowedUserId);
  }

  async sendChatMessage(chatId, text) {
    await this.call("sendMessage", {
      chat_id: chatId,
      text,
      disable_web_page_preview: true
    });
  }

  buildDebugText() {
    const dashboard = this.service.getDashboard();
    const runtime = this.service.getRuntimeStatus();
    const stats = dashboard.stats || {};
    const lastSync = dashboard.lastSync;
    const weekly = dashboard.weeklyUpdate || {};
    const panini = dashboard.paniniImport || {};
    const quarterly = dashboard.quarterlyRefresh || {};
    const status = this.getStatus();

    return [
      "Spider Tracker /debug",
      "",
      `Bot: ${status.running ? "python-telegram-bot activo" : status.pollingEnabled ? "python-telegram-bot activado pero detenido" : "polling desactivado"}`,
      status.pid ? `PID bot: ${status.pid}` : "",
      `Revisión manual: ${status.reviewsEnabled ? "activa" : "sin chat"}`,
      `Resúmenes: ${status.summariesEnabled ? "activos" : "sin chat"}`,
      `Backups: ${status.backupsEnabled ? "activos" : "sin chat"}`,
      "",
      `Issues semanales guardados: ${stats.includedCount || 0}`,
      `Pendientes de revisión: ${stats.pendingReviewsCount || 0}`,
      `Personajes activos: ${stats.trackedCharactersCount || 0}`,
      `Última sync: ${lastSync?.weekKey || "sin corridas"}`,
      "",
      `Sync semanal: ${runtime.weeklyUpdateRunning || weekly.running ? "en curso" : weekly.status || "reposo"}`,
      `Catálogo USA: ${runtime.catalogImportRunning ? "importando" : "reposo"}`,
      `Panini/español: ${runtime.paniniImportRunning || panini.running ? "importando" : panini.status || "reposo"}`,
      `Revisión completa: ${runtime.quarterlyRefreshRunning || quarterly.running ? "en curso" : quarterly.status || "reposo"}`,
      status.lastPollAt ? `Último polling: ${status.lastPollAt}` : "",
      status.lastError ? `Último error: ${status.lastError}` : ""
    ].filter(Boolean).join("\n");
  }

  async handleMessage(message) {
    const text = String(message.text || "").trim();
    if (!text.startsWith("/")) {
      return;
    }

    if (!this.isAuthorizedUser(message.from)) {
      await this.sendChatMessage(message.chat.id, "No autorizado para usar este bot.");
      return;
    }

    const command = text.split(/\s+/)[0].replace(/@.+$/, "").toLowerCase();

    if (command === "/debug") {
      await this.sendChatMessage(message.chat.id, this.buildDebugText());
      return;
    }

    if (command === "/start" || command === "/help") {
      await this.sendChatMessage(message.chat.id, "Spider Tracker activo. Comandos disponibles: /debug");
    }
  }

  async handleCallbackQuery(callbackQuery) {
    const data = String(callbackQuery.data || "");
    const match = data.match(/^review:(\d+):(approve|reject)$/);

    if (!match) {
      await this.answerCallbackQuery(callbackQuery.id, "Acción desconocida.", true);
      return;
    }

    if (!this.isAuthorizedUser(callbackQuery.from)) {
      await this.answerCallbackQuery(callbackQuery.id, "No autorizado para esta acción.", true);
      return;
    }

    const reviewId = Number(match[1]);
    const action = match[2];
    const result = this.service.resolveReview(reviewId, action, callbackQuery.from);

    if (result.status === "not_found") {
      await this.answerCallbackQuery(callbackQuery.id, "Revisión inexistente.", true);
      return;
    }

    if (result.status === "already_resolved") {
      await this.answerCallbackQuery(callbackQuery.id, "Esa revisión ya fue resuelta.");
      return;
    }

    await this.answerCallbackQuery(callbackQuery.id, action === "approve" ? "Cómic agregado." : "Cómic rechazado.");

    try {
      await this.call("editMessageText", {
        chat_id: callbackQuery.message.chat.id,
        message_id: callbackQuery.message.message_id,
        text: this.buildResolvedText(result.review, action, callbackQuery.from),
        disable_web_page_preview: true,
        reply_markup: { inline_keyboard: [] }
      });
    } catch (error) {
      console.error("No se pudo editar el mensaje de Telegram:", error);
      try {
        await this.call("editMessageReplyMarkup", {
          chat_id: callbackQuery.message.chat.id,
          message_id: callbackQuery.message.message_id,
          reply_markup: { inline_keyboard: [] }
        });
      } catch (nestedError) {
        console.error("Tampoco se pudo limpiar el teclado inline:", nestedError);
      }
    }
  }

  async updateResolvedReviewMessage(review, action, user) {
    if (!this.config.botToken || !review?.telegramChatId || !review?.telegramMessageId) {
      return;
    }

    try {
      await this.call("editMessageText", {
        chat_id: review.telegramChatId,
        message_id: review.telegramMessageId,
        text: this.buildResolvedText(review, action, user),
        disable_web_page_preview: true,
        reply_markup: { inline_keyboard: [] }
      });
    } catch (error) {
      console.error("No se pudo reflejar en Telegram la decisión tomada desde la web:", error);
    }
  }
}

module.exports = {
  TelegramBridge
};
