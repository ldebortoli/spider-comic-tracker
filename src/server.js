const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");

const { ComicDatabase } = require("./database");
const { getConfig, loadEnv } = require("./env");
const { ComicTrackerService } = require("./service");
const { TelegramBridge } = require("./telegram");
const { SystemMonitor } = require("./system-monitor");
const { AutomationManager } = require("./automation-manager");

loadEnv();

const config = getConfig();
const db = new ComicDatabase(config.dbPath);
const service = new ComicTrackerService({ db, config });
const telegram = new TelegramBridge({ config: config.telegram, service });
const systemMonitor = new SystemMonitor({ dataDir: path.dirname(config.dbPath), dbPath: config.dbPath });
const automationManager = new AutomationManager({ config, projectRoot: process.cwd() });

service.attachTelegram(telegram);
service.startScheduler();
telegram.start();

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

async function readRequestBody(request) {
  const chunks = [];

  for await (const chunk of request) {
    chunks.push(chunk);
  }

  if (!chunks.length) {
    return {};
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
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
  const resolved = path.resolve(config.publicDir, `.${normalizedPath}`);

  if (!resolved.startsWith(config.publicDir)) {
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
  const url = new URL(request.url, `http://${request.headers.host}`);

  try {
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

    if (request.method === "PUT" && url.pathname === "/api/automation") {
      const body = await readRequestBody(request);
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
        from: url.searchParams.get("from") || "",
        to: url.searchParams.get("to") || ""
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

    if (request.method === "GET" && url.pathname === "/api/spanish-editions") {
      sendJson(response, 200, service.listSpanishEditions({
        query: url.searchParams.get("query") || "",
        publisher: url.searchParams.get("publisher") || "",
        character: url.searchParams.get("character") || "",
        status: url.searchParams.get("status") || ""
      }));
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/spanish-editions") {
      const body = await readRequestBody(request);
      sendJson(response, 201, service.createSpanishEdition(body));
      return;
    }

    if (request.method === "PUT" && /^\/api\/spanish-editions\/\d+$/.test(url.pathname)) {
      const body = await readRequestBody(request);
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
      const body = await readRequestBody(request);
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

    if (request.method === "POST" && url.pathname === "/api/panini/import") {
      const body = await readRequestBody(request);
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
      const body = await readRequestBody(request);
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
      const body = await readRequestBody(request);
      const character = service.createTrackedCharacter(parseCharacterPayload(body));
      sendJson(response, 201, character);
      return;
    }

    if (request.method === "PUT" && /^\/api\/tracked-characters\/\d+$/.test(url.pathname)) {
      const body = await readRequestBody(request);
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
      const body = await readRequestBody(request);
      const action = String(body.action || "");

      if (action !== "approve" && action !== "reject") {
        sendJson(response, 400, { error: "La acción debe ser approve o reject." });
        return;
      }

      const webUser = { id: "local-web", username: "pagina-local", source: "web" };
      const result = service.resolveReview(reviewId, action, webUser);
      if (result.status === "not_found") {
        sendJson(response, 404, { error: "Revisión no encontrada." });
        return;
      }
      if (result.status === "already_resolved") {
        sendJson(response, 409, { error: "La revisión ya fue resuelta.", result });
        return;
      }

      await telegram.updateResolvedReviewMessage(result.review, action, webUser);
      sendJson(response, 200, result);
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/sync") {
      const body = await readRequestBody(request);

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

    if (request.method === "GET" && url.pathname.startsWith("/api/")) {
      sendJson(response, 404, { error: "Ruta no encontrada" });
      return;
    }

    serveStatic(url.pathname, response);
  } catch (error) {
    console.error("Request error:", error);
    sendJson(response, 500, { error: error.message || "Error interno" });
  }
});

server.listen(config.port, "127.0.0.1", () => {
  console.log(`Comic tracker disponible en http://localhost:${config.port}`);
});
