const { timingSafeEqual } = require("node:crypto");

const MAX_BODY_BYTES = 64 * 1024;

class HttpError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}

function validateLocalRequest(request, token) {
  const host = request.headers.host;
  const port = request.socket.localPort;
  const suffix = port === 80 ? "" : `:${port}`;
  if ((request.headersDistinct && request.headersDistinct.host?.length !== 1)
      || ![`localhost${suffix}`, `127.0.0.1${suffix}`].includes(host)) {
    throw new HttpError(403, "Host local no permitido.");
  }
  const origin = `http://${host}`;
  if (request.headers.origin !== undefined && request.headers.origin !== origin) {
    throw new HttpError(403, "Origen no permitido.");
  }
  // Only origin-form targets; never construct a base URL from an unvalidated Host.
  if (!request.url.startsWith("/") || request.url.startsWith("//") || /[\x00-\x20\\#]/.test(request.url)) {
    throw new HttpError(400, "URL invalida.");
  }
  let url;
  try {
    decodeURIComponent(request.url);
    url = new URL(request.url, origin);
  } catch {
    throw new HttpError(400, "URL invalida.");
  }
  const site = request.headers["sec-fetch-site"];
  if (site !== undefined && site !== "same-origin" && (url.pathname.startsWith("/api/") || site !== "none")) {
    throw new HttpError(403, "Origen no permitido.");
  }
  if (url.pathname === "/api/local-session") {
    if (!request.headers.origin && request.headers["sec-fetch-site"] !== "same-origin") {
      throw new HttpError(403, "La sesion requiere el origen local.");
    }
  } else if (url.pathname.startsWith("/api/")) {
    const supplied = Buffer.from(request.headers["x-spider-token"] || "");
    const expected = Buffer.from(token);
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
      throw new HttpError(401, "Sesion local invalida. Recarga la pagina.");
    }
  }
  return url;
}

async function readRequestBody(request) {
  const length = request.headers["content-length"];
  if (length !== undefined && (!/^\d+$/.test(length) || !Number.isSafeInteger(Number(length)))) {
    throw new HttpError(400, "Longitud de cuerpo invalida.");
  }
  if (Number(length) > MAX_BODY_BYTES) {
    throw new HttpError(413, "El cuerpo supera 64 KiB.");
  }
  // Event listeners allow an HTTP error to be flushed before closing the socket.
  return new Promise((resolve, reject) => {
    let size = 0;
    let chunks = [];
    let failed = false;
    const fail = (error) => {
      failed = true;
      chunks = [];
      reject(error);
    };
    request.on("data", (chunk) => {
      if (failed) return;
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        fail(new HttpError(413, "El cuerpo supera 64 KiB."));
      } else {
        chunks.push(chunk);
      }
    });
    request.on("error", () => fail(new HttpError(400, "Cuerpo incompleto.")));
    request.on("end", () => {
      if (failed) return;
      if (length !== undefined && size !== Number(length)) {
        fail(new HttpError(400, "Cuerpo incompleto."));
        return;
      }
      if (!size) {
        resolve({});
        return;
      }
      if (!/^application\/json(?:\s*;|$)/i.test(request.headers["content-type"] || "")) {
        fail(new HttpError(415, "Se requiere application/json."));
        return;
      }
      try {
        const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error();
        resolve(body);
      } catch {
        fail(new HttpError(400, "JSON invalido; se requiere un objeto."));
      }
    });
  });
}

module.exports = { HttpError, MAX_BODY_BYTES, validateLocalRequest, readRequestBody };
