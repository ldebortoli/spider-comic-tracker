function isPaniniPage(url) {
  return ["https://www.panini.es", "https://panini.es"].includes(url.origin)
    && url.pathname.startsWith("/shp_esp_es/") && !url.username && !url.password;
}

class PaniniBrowserSession {
  constructor({ chromium, channel = "msedge" } = {}) {
    this.chromium = chromium;
    this.channel = channel;
    this.browser = null;
    this.contextPromise = null;
    this.active = false;
  }

  async open() {
    try {
      const chromium = this.chromium || require("playwright-core").chromium;
      this.browser = await chromium.launch({ channel: this.channel, headless: true, chromiumSandbox: true, timeout: 20_000 });
      return await this.browser.newContext({ locale: "es-ES" });
    } catch (cause) {
      throw new Error("No se pudo iniciar el navegador instalado para leer Panini. Se requiere Microsoft Edge o un canal compatible configurado.", { cause });
    }
  }

  async fetch(url) {
    if (!isPaniniPage(new URL(url))) throw new Error("El lector de Panini solo admite sus páginas públicas HTTPS.");
    this.active = true;
    this.contextPromise ||= this.open();
    for (let attempt = 1; ; attempt += 1) {
      try {
        return await this.readPage(url);
      } catch (error) {
        if (attempt === 3 || !error.retryable) throw error;
        await new Promise((resolve) => setTimeout(resolve, 600 * attempt));
      }
    }
  }

  async readPage(url) {
    const context = await this.contextPromise;
    const page = await context.newPage();
    let html;
    try {
      const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 });
      const statusCode = response.status();
      if (statusCode >= 400) throw Object.assign(new Error(`HTTP ${statusCode}`), { statusCode });
      await page.locator("a.product-item-link, .product-info-main").first().waitFor({ state: "attached", timeout: 45_000 });
      if (!isPaniniPage(new URL(page.url()))) throw new Error("La navegación no terminó en Panini.");
      html = await page.content();
    } catch (cause) {
      const timedOut = cause.name === "TimeoutError";
      const retryable = timedOut || /net::ERR_(?:CONNECTION_RESET|CONNECTION_CLOSED|TIMED_OUT|NETWORK_CHANGED)\b/.test(cause.message)
        || cause.statusCode === 429 || cause.statusCode >= 500;
      const reason = cause.statusCode ? `HTTP ${cause.statusCode}` : timedOut ? "tiempo de espera agotado" : "fallo de navegación o lectura";
      throw Object.assign(new Error(`Panini no pudo leerse con el navegador; el acceso o la descarga siguen pendientes (${reason}).`, { cause }), { retryable });
    } finally {
      await page.close();
    }
    return html;
  }

  async close() {
    if (this.contextPromise) await this.contextPromise.catch(() => {});
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
    this.contextPromise = null;
    this.active = false;
  }
}

module.exports = { PaniniBrowserSession };
