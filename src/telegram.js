const fs = require("node:fs/promises");

class TelegramBridge {
  constructor({ config, service }) {
    this.config = config;
    this.service = service;
    this.running = false;
    this.offset = 0;
    this.lastPollAt = "";
    this.lastError = "";
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
      running: this.running,
      reviewsEnabled: this.canSendReviews(),
      summariesEnabled: this.canSendSummary(),
      backupsEnabled: this.canSendBackups(),
      lastPollAt: this.lastPollAt,
      lastError: this.lastError
    };
  }

  start() {
    if (!this.config.botToken || this.running) {
      return;
    }

    this.running = true;
    this.pollLoop().catch((error) => {
      console.error("Error en polling de Telegram:", error);
      this.running = false;
    });
  }

  async pollLoop() {
    while (this.running) {
      try {
        const payload = await this.call("getUpdates", {
          offset: this.offset,
          timeout: 25,
          allowed_updates: JSON.stringify(["callback_query"])
        });
        this.lastPollAt = new Date().toISOString();
        this.lastError = "";

        for (const update of payload.result || []) {
          this.offset = update.update_id + 1;
          await this.handleUpdate(update);
        }
      } catch (error) {
        this.lastError = error.message || String(error);
        console.error("Falló getUpdates de Telegram:", error);
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
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
      `Errores: ${summary.errors}`
    ];

    if (summary.failed && summary.errorMessage) {
      chunks.push("", `Error: ${summary.errorMessage}`);
    }

    if (summary.addedTitles?.length) {
      chunks.push("", `Agregados: ${summary.addedTitles.slice(0, 8).join(", ")}`);
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
    if (!update.callback_query) {
      return;
    }

    await this.handleCallbackQuery(update.callback_query);
  }

  async handleCallbackQuery(callbackQuery) {
    const data = String(callbackQuery.data || "");
    const match = data.match(/^review:(\d+):(approve|reject)$/);

    if (!match) {
      await this.answerCallbackQuery(callbackQuery.id, "Acción desconocida.", true);
      return;
    }

    if (this.config.allowedUserId && String(callbackQuery.from.id) !== String(this.config.allowedUserId)) {
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
