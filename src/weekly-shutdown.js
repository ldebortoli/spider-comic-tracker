const DAY_MS = 24 * 60 * 60 * 1000;
const RECEIPT_KEY = "weekly_shutdown_receipt";

class WeeklyShutdown {
  constructor({ service, now = Date.now }) {
    this.service = service;
    this.now = now;
    this.shutdown = null;
  }

  async confirm(completed) {
    const { telegram, db } = this.service;
    if (!telegram?.canSendSummary()) return;
    const complete = completed.status === "completed"
      && completed.weeklyReview.errors === 0
      && !completed.weeklyReview.backupFailed
      && completed.catalogUpdate.errors === 0
      && completed.paniniUpdate.errors === 0
      && completed.paniniUpdate.status === "completed";
    const [weekYear, weekNumber] = completed.weekKey.split("-W").map(Number);
    const payload = await telegram.sendSummary({
      ...completed.weeklyReview, weekYear, weekNumber,
      triggerSource: completed.triggerSource,
      failed: completed.status !== "completed", hasWarnings: !complete,
      catalogUpdate: completed.catalogUpdate, paniniUpdate: completed.paniniUpdate
    });
    if (!complete || payload?.ok !== true || !payload.result?.message_id || !payload.result.chat?.id) return;
    const confirmedAt = this.now();
    db.setState(RECEIPT_KEY, JSON.stringify({
      status: "pending", weekKey: completed.weekKey, startedAt: completed.startedAt,
      chatId: String(payload.result.chat.id), messageId: String(payload.result.message_id),
      confirmedAt: new Date(confirmedAt).toISOString(), dueAt: new Date(confirmedAt + DAY_MS).toISOString()
    }));
  }

  async check() {
    const { service } = this;
    let receipt;
    try { receipt = JSON.parse(service.db.getState(RECEIPT_KEY, "null")); } catch { return false; }
    if (!receipt || receipt.status !== "pending" || !this.shutdown) return false;
    const due = Date.parse(receipt.dueAt);
    if (!Number.isFinite(due) || this.now() < due) return false;
    const confirmed = Date.parse(receipt.confirmedAt);
    if (!receipt.messageId || !receipt.chatId || !Number.isFinite(confirmed) || due !== confirmed + DAY_MS) return false;
    const weekly = service.getWeeklyUpdateStatus();
    if (weekly.status !== "completed" || weekly.startedAt !== receipt.startedAt || weekly.weekKey !== receipt.weekKey) return false;
    if ([service.currentSyncPromise, service.currentWeeklyUpdatePromise, service.currentCatalogImportPromise,
      service.currentPaniniImportPromise, service.currentQuarterlyRefreshPromise].some(Boolean)) return false;
    // Persist before closing the database; a successful stop must not affect a later manual start.
    service.db.setState(RECEIPT_KEY, JSON.stringify({ ...receipt, status: "consumed" }));
    try {
      if (await this.shutdown()) return true;
    } catch (error) {
      service.db.setState(RECEIPT_KEY, JSON.stringify(receipt));
      throw error;
    }
    service.db.setState(RECEIPT_KEY, JSON.stringify(receipt));
    return false;
  }
}

module.exports = { WeeklyShutdown };
