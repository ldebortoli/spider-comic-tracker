const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const { randomBytes } = require("node:crypto");
const { HttpError, validateLocalRequest, readRequestBody } = require("./http-security");

const { ComicDatabase } = require("./database");
const { getConfig, loadEnv } = require("./env");
const { ComicTrackerService } = require("./service");
const { TelegramBridge } = require("./telegram");
const { SystemMonitor } = require("./system-monitor");
const { AutomationManager, updateEnvFile } = require("./automation-manager");

function createTrackerServer({ config, db, service, telegram, systemMonitor, automationManager,
  envPath = path.join(process.cwd(), ".env"), localToken = randomBytes(32).toString("hex") }) {
function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  response.end(JSON.stringify(payload));
}

function sendText(response, statusCode, text, contentType = "text/plain; charset=utf-8") {
  response.writeHead(statusCode, {
    "Content-Type": contentType,
    "Cache-Control": "no-store"
  });
  response.end(text);
}

function sendCsv(response, fileName, text) {
  response.writeHead(200, {
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": `attachment; filename="${fileName}"`,
    "Cache-Control": "no-store"
  });
  response.end(text);
}

function parseCharacterPayload(body) {
  const displayName = String(body.displayName || "").trim();
  const aliasesSource = Array.isArray(body.aliases) ? body.aliases : String(body.aliases || "").split(",");
  const aliases = aliasesSource.map((value) => String(value).trim()).filter(Boolean);
  const active = body.active !== false;

  if (!displayName) {
    throw new Error("displayName es obligatorio.");
  }

  if (!aliases.length) {
    throw new Error("Debe haber al menos un alias.");
  }

  return {
    displayName,
    aliases,
    active
  };
}

function parseTelegramConfigPayload(body) {
  const clean = (value) => String(value || "").trim();
  return {
    hasBotToken: Object.prototype.hasOwnProperty.call(body, "botToken"),
    hasPollingEnabled: Object.prototype.hasOwnProperty.call(body, "pollingEnabled"),
    botToken: clean(body.botToken),
    pollingEnabled: body.pollingEnabled === true,
    reviewChatId: clean(body.reviewChatId),
    summaryChatId: clean(body.summaryChatId),
    backupChatId: clean(body.backupChatId),
    allowedUserId: clean(body.allowedUserId)
  };
}

function staticContentType(filePath) {
  if (filePath.endsWith(".css")) {
    return "text/css; charset=utf-8";
  }

  if (filePath.endsWith(".js")) {
    return "application/javascript; charset=utf-8";
  }

  if (filePath.endsWith(".html")) {
    return "text/html; charset=utf-8";
  }

  if (filePath.endsWith(".svg")) {
    return "image/svg+xml";
  }

  if (filePath.endsWith(".png")) {
    return "image/png";
  }

  return "application/octet-stream";
}

function serveStatic(requestPath, response) {
  const normalizedPath = requestPath === "/" ? "/index.html" : requestPath;
  const resolved = path.resolve(config.publicDir, `.${decodeURIComponent(normalizedPath)}`);
  const relative = path.relative(config.publicDir, resolved);

  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    sendText(response, 403, "Forbidden");
    return;
  }

  if (!fs.existsSync(resolved) || fs.statSync(resolved).isDirectory()) {
    const fallback = path.resolve(config.publicDir, "index.html");
    sendText(response, 200, fs.readFileSync(fallback, "utf8"), "text/html; charset=utf-8");
    return;
  }

  response.writeHead(200, {
    "Content-Type": staticContentType(resolved),
    "Cache-Control": "no-store"
  });
  response.end(fs.readFileSync(resolved));
}

const server = http.createServer(async (request, response) => {
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Frame-Options", "DENY");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' https: http: data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
  try {
    const url = validateLocalRequest(request, localToken);
    // Bound every request body, including routes that do not use a payload.
    const body = await readRequestBody(request);
    if (request.method === "GET" && url.pathname === "/api/local-session") {
      sendJson(response, 200, { token: localToken });
      return;
    }
    if (request.method === "GET" && url.pathname === "/api/dashboard") {
      sendJson(response, 200, service.getDashboard());
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/system/metrics") {
      sendJson(response, 200, {
        ...systemMonitor.snapshot(),
        operations: service.getRuntimeStatus(),
        telegram: telegram.getStatus()
      });
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/automation") {
      sendJson(response, 200, automationManager.getStatus());
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/telegram/config") {
      sendJson(response, 200, {
        botTokenConfigured: Boolean(config.telegram.botToken),
        pollingEnabled: config.telegram.pollingEnabled !== false,
        reviewChatId: config.telegram.reviewChatId,
        summaryChatId: config.telegram.summaryChatId,
        backupChatId: config.telegram.backupChatId,
        allowedUserId: config.telegram.allowedUserId,
        status: telegram.getStatus()
      });
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/telegram/debug") {
      sendJson(response, 200, { text: telegram.buildDebugText() });
      return;
    }

    if (request.method === "PUT" && url.pathname === "/api/telegram/config") {
      const parsed = parseTelegramConfigPayload(body);
      const nextTelegramConfig = {
        botToken: parsed.hasBotToken ? parsed.botToken : config.telegram.botToken,
        pollingEnabled: parsed.hasPollingEnabled ? parsed.pollingEnabled : config.telegram.pollingEnabled !== false,
        reviewChatId: parsed.reviewChatId,
        summaryChatId: parsed.summaryChatId,
        backupChatId: parsed.backupChatId,
        allowedUserId: parsed.allowedUserId
      };

      config.telegram = nextTelegramConfig;
      updateEnvFile(envPath, {
        TELEGRAM_BOT_TOKEN: nextTelegramConfig.botToken,
        TELEGRAM_POLLING_ENABLED: nextTelegramConfig.pollingEnabled ? "true" : "false",
        TELEGRAM_REVIEW_CHAT_ID: nextTelegramConfig.reviewChatId,
        TELEGRAM_SUMMARY_CHAT_ID: nextTelegramConfig.summaryChatId,
        TELEGRAM_BACKUP_CHAT_ID: nextTelegramConfig.backupChatId,
        TELEGRAM_ALLOWED_USER_ID: nextTelegramConfig.allowedUserId
      });
      await telegram.configure(nextTelegramConfig);
      sendJson(response, 200, {
        botTokenConfigured: Boolean(nextTelegramConfig.botToken),
        pollingEnabled: nextTelegramConfig.pollingEnabled !== false,
        reviewChatId: nextTelegramConfig.reviewChatId,
        summaryChatId: nextTelegramConfig.summaryChatId,
        backupChatId: nextTelegramConfig.backupChatId,
        allowedUserId: nextTelegramConfig.allowedUserId,
        status: telegram.getStatus()
      });
      return;
    }

    if (request.method === "PUT" && url.pathname === "/api/telegram/polling") {
      config.telegram.pollingEnabled = body.enabled === true;
      updateEnvFile(envPath, {
        TELEGRAM_POLLING_ENABLED: config.telegram.pollingEnabled ? "true" : "false"
      });
      await telegram.configure(config.telegram);
      sendJson(response, 200, {
        botTokenConfigured: Boolean(config.telegram.botToken),
        pollingEnabled: config.telegram.pollingEnabled !== false,
        reviewChatId: config.telegram.reviewChatId,
        summaryChatId: config.telegram.summaryChatId,
        backupChatId: config.telegram.backupChatId,
        allowedUserId: config.telegram.allowedUserId,
        status: telegram.getStatus()
      });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/telegram/test") {
      sendJson(response, 200, await telegram.testConnection());
      return;
    }

    if (request.method === "PUT" && url.pathname === "/api/automation") {
      const status = await automationManager.configure({
        enabled: body.enabled === true,
        day: body.day,
        hour: body.hour,
        minute: body.minute
      });
      if (status.enabled) service.startScheduler();
      sendJson(response, 200, status);
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/comics") {
      sendJson(response, 200, service.listComics({
        scope: url.searchParams.get("scope") || "all",
        query: url.searchParams.get("query") || "",
        character: url.searchParams.get("character") || "",
        enemy: url.searchParams.get("enemy") || "",
        from: url.searchParams.get("from") || "",
        to: url.searchParams.get("to") || ""
      }));
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/comics/enemies") {
      sendJson(response, 200, service.listComicEnemies({
        scope: url.searchParams.get("scope") || "all",
        query: url.searchParams.get("query") || "",
        character: url.searchParams.get("character") || "",
        from: url.searchParams.get("from") || "",
        to: url.searchParams.get("to") || ""
      }, {
        limit: url.searchParams.get("limit") || "50",
        offset: url.searchParams.get("offset") || "0",
        search: url.searchParams.get("search") || "",
        selected: url.searchParams.get("selected") || "",
        sort: url.searchParams.get("sort") || "count"
      }));
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/catalog/stats") {
      sendJson(response, 200, {
        stats: service.getCatalogStats(
          url.searchParams.get("character") || "",
          url.searchParams.get("universeGroup") || "main"
        ),
        importStatus: service.getCatalogImportStatus()
      });
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/catalog/characters") {
      sendJson(response, 200, service.listCatalogCharacters());
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/catalog/search") {
      sendJson(response, 200, {
        items: service.searchCatalogIssues(
          url.searchParams.get("q") || "",
          url.searchParams.get("limit") || "30"
        )
      });
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/catalog/enemies") {
      sendJson(response, 200, service.listCatalogEnemies({
        character: url.searchParams.get("character") || "",
        universeGroup: url.searchParams.get("universeGroup") || "main",
        query: url.searchParams.get("query") || "",
        ownership: url.searchParams.get("ownership") || "all",
        appearance: url.searchParams.get("appearance") || "all",
        from: url.searchParams.get("from") || "",
        to: url.searchParams.get("to") || ""
      }, {
        limit: url.searchParams.get("limit") || "50",
        offset: url.searchParams.get("offset") || "0",
        search: url.searchParams.get("search") || "",
        selected: url.searchParams.get("selected") || "",
        sort: url.searchParams.get("sort") || "count"
      }));
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/spanish-editions") {
      sendJson(response, 200, service.listSpanishEditions({
        query: url.searchParams.get("query") || "",
        publisher: url.searchParams.get("publisher") || "",
        character: url.searchParams.get("character") || "",
        status: url.searchParams.get("status") || "",
        limit: url.searchParams.get("limit") || "20",
        offset: url.searchParams.get("offset") || "0"
      }));
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/spanish-editions") {
      sendJson(response, 201, service.createSpanishEdition(body));
      return;
    }

    if (request.method === "PUT" && /^\/api\/spanish-editions\/\d+$/.test(url.pathname)) {
      const edition = service.updateSpanishEdition(Number(url.pathname.split("/")[3]), body);
      sendJson(response, 200, edition);
      return;
    }

    if (request.method === "DELETE" && /^\/api\/spanish-editions\/\d+$/.test(url.pathname)) {
      const deleted = service.deleteSpanishEdition(Number(url.pathname.split("/")[3]));
      sendJson(response, deleted ? 200 : 404, deleted ? { deleted: true } : { error: "Edición en español no encontrada." });
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/catalog/export.csv") {
      sendCsv(response, "spider-man-earth-616.csv", service.exportCatalogCsv());
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/catalog") {
      sendJson(response, 200, service.listCatalogIssues({
        character: url.searchParams.get("character") || "",
        universeGroup: url.searchParams.get("universeGroup") || "main",
        query: url.searchParams.get("query") || "",
        enemy: url.searchParams.get("enemy") || "",
        ownership: url.searchParams.get("ownership") || "all",
        appearance: url.searchParams.get("appearance") || "all",
        from: url.searchParams.get("from") || "",
        to: url.searchParams.get("to") || "",
        sort: url.searchParams.get("sort") || "date-asc",
        limit: url.searchParams.get("limit") || "60",
        offset: url.searchParams.get("offset") || "0"
      }));
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/catalog/import") {
      const result = service.startCatalogImport({
        characterSlug: String(body.characterSlug || ""),
        incremental: body.incremental === true
      });
      sendJson(response, result.notFound ? 404 : (result.started ? 202 : 200), result);
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/catalog/refresh-all") {
      const result = service.startQuarterlyRefresh({ triggerSource: "manual", force: true });
      sendJson(response, result.started ? 202 : 200, result);
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/catalog/refresh-schedule") {
      sendJson(response, 200, service.getQuarterlyRefreshStatus());
      return;
    }

    if (request.method === "PUT" && url.pathname === "/api/catalog/refresh-schedule") {
      const status = service.configureQuarterlyRefresh({
        enabled: body.enabled === true,
        nextRefreshAt: body.nextRefreshAt
      });
      updateEnvFile(envPath, {
        CATALOG_REFRESH_ENABLED: status.enabled ? "true" : "false",
        CATALOG_REFRESH_NEXT_AT: status.configuredNextRefreshAt || ""
      });
      sendJson(response, 200, status);
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/panini/import") {
      const result = service.startPaniniImport({ full: body.full === true, triggerSource: "manual" });
      sendJson(response, result.started ? 202 : 409, result);
      return;
    }

    if (request.method === "POST" && /^\/api\/catalog\/characters\/[a-z0-9-]+\/continue$/.test(url.pathname)) {
      const characterSlug = url.pathname.split("/")[4];
      const result = service.startCatalogImport({ characterSlug, incremental: true });
      sendJson(response, result.notFound ? 404 : (result.started ? 202 : 200), result);
      return;
    }

    if (request.method === "PATCH" && /^\/api\/catalog\/\d+\/collection$/.test(url.pathname)) {
      const id = Number(url.pathname.split("/")[3]);
      const issue = service.updateCatalogCollection(id, {
        owned: body.owned === true,
        publisher: String(body.publisher || "").slice(0, 200),
        editionTitle: String(body.editionTitle || "").slice(0, 500),
        notes: String(body.notes || "").slice(0, 2_000)
      });

      if (!issue) {
        sendJson(response, 404, { error: "Issue no encontrado" });
        return;
      }

      sendJson(response, 200, issue);
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/tracked-characters") {
      sendJson(response, 200, service.listTrackedCharacters());
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/tracked-characters") {
      const character = service.createTrackedCharacter(parseCharacterPayload(body));
      sendJson(response, 201, character);
      return;
    }

    if (request.method === "PUT" && /^\/api\/tracked-characters\/\d+$/.test(url.pathname)) {
      const id = Number(url.pathname.split("/").pop());
      const character = service.updateTrackedCharacter(id, parseCharacterPayload(body));
      sendJson(response, 200, character);
      return;
    }

    if (request.method === "DELETE" && /^\/api\/tracked-characters\/\d+$/.test(url.pathname)) {
      const id = Number(url.pathname.split("/").pop());
      service.deleteTrackedCharacter(id);
      sendJson(response, 200, { ok: true });
      return;
    }

    if (request.method === "POST" && /^\/api\/reviews\/\d+\/decision$/.test(url.pathname)) {
      const reviewId = Number(url.pathname.split("/")[3]);
      const action = String(body.action || "");

      if (action !== "approve" && action !== "reject") {
        sendJson(response, 400, { error: "La acción debe ser approve o reject." });
        return;
      }

      const user = body.user && body.user.source === "telegram-python"
        ? {
          id: String(body.user.id || "telegram"),
          username: String(body.user.username || ""),
          firstName: String(body.user.first_name || ""),
          source: "telegram-python"
        }
        : { id: "local-web", username: "pagina-local", source: "web" };
      const result = service.resolveReview(reviewId, action, user);
      if (result.status === "not_found") {
        sendJson(response, 404, { error: "Revisión no encontrada." });
        return;
      }
      if (result.status === "already_resolved") {
        sendJson(response, 409, { error: "La revisión ya fue resuelta.", result });
        return;
      }

      await telegram.updateResolvedReviewMessage(result.review, action, user);
      sendJson(response, 200, result);
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/sync") {

      if (body.weekYear || body.weekNumber) {
        sendJson(response, 400, {
          error: "La sincronización histórica todavía no está soportada. Por ahora solo se revisa la semana actual."
        });
        return;
      }

      const result = service.startWeeklyUpdate({ triggerSource: "manual" });

      sendJson(response, result.started ? 202 : 409, result);
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/weekly-update") {
      const result = service.startWeeklyUpdate({ triggerSource: "manual" });
      sendJson(response, result.started ? 202 : 409, result);
      return;
    }

    if (url.pathname.startsWith("/api/")) {
      sendJson(response, 404, { error: "Ruta no encontrada" });
      return;
    }

    if (request.method !== "GET") throw new HttpError(405, "Metodo no permitido.");
    serveStatic(url.pathname, response);
  } catch (error) {
    // Never expose/log arbitrary exceptions: upstream URLs can contain secrets.
    response.setHeader("Connection", "close");
    sendJson(response, error instanceof HttpError ? error.statusCode : 500,
      { error: error instanceof HttpError ? error.message : "Error interno del servidor." });
  }
});

server.requestTimeout = 15_000;
server.headersTimeout = 10_000;
server.setTimeout(30_000, (socket) => socket.destroy());
let shutdownPromise;
server.shutdown = () => {
  if (!shutdownPromise) {
    shutdownPromise = (async () => {
      clearInterval(service.schedulerHandle);
      await telegram.stop();
      await new Promise((resolve, reject) => {
        const deadline = setTimeout(() => server.closeAllConnections(), 2_000);
        server.close((error) => {
          clearTimeout(deadline);
          if (error) reject(error); else resolve();
        });
      });
      db.close();
    })().catch((error) => { shutdownPromise = undefined; throw error; });
  }
  return shutdownPromise;
};
return server;
}

function startTracker() {
  loadEnv();
  const config = getConfig();
  const db = new ComicDatabase(config.dbPath);
  const service = new ComicTrackerService({ db, config });
  const localToken = randomBytes(32).toString("hex");
  const telegram = new TelegramBridge({ config: config.telegram, service,
    serverUrl: `http://127.0.0.1:${config.port}`, localToken, projectRoot: process.cwd() });
  const server = createTrackerServer({ config, db, service, telegram, localToken,
    systemMonitor: new SystemMonitor({ dataDir: path.dirname(config.dbPath), dbPath: config.dbPath }),
    automationManager: new AutomationManager({ config, projectRoot: process.cwd() }) });
  service.attachTelegram(telegram);
  server.listen(config.port, "127.0.0.1", () => {
    service.listCatalogEnemies({ character: "peter-parker-earth-616", universeGroup: "main" });
    service.startScheduler();
    telegram.start();
    console.log(`Comic tracker disponible en http://localhost:${config.port}`);
  });
  const shutdown = () => server.shutdown().then(() => { process.exit(0); return true; }, () => {
    process.exitCode = 1;
    console.error("No se pudo detener el proceso administrado; se mantiene el servidor para reintentar.");
    return false;
  });
  service.weeklyShutdown.shutdown = shutdown;
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
  return server;
}

if (require.main === module) startTracker();
module.exports = { createTrackerServer, startTracker };
