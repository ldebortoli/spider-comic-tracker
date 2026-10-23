const assert = require("node:assert/strict");
const { test } = require("node:test");
const { Readable } = require("node:stream");
const { validateLocalRequest, readRequestBody, HttpError, MAX_BODY_BYTES } = require("../src/http-security");

function request(headers = {}, url = "/api/dashboard") {
  return { headers: { host: "localhost:8787", ...headers }, url, socket: { localPort: 8787 } };
}

test("local host, origin, fetch metadata and token are independent gates", () => {
  const token = "a".repeat(64);
  const headers = { "x-spider-token": token };
  assert.equal(validateLocalRequest(request(headers), token).pathname, "/api/dashboard");
  assert.equal(validateLocalRequest(request({ ...headers, origin: "http://localhost:8787" }), token).host, "localhost:8787");
  assert.equal(validateLocalRequest(request({ ...headers, host: "127.0.0.1:8787", origin: "http://127.0.0.1:8787" }), token).hostname, "127.0.0.1");
  for (const host of [undefined, "evil.test:8787", "localhost:9999", "localhost.evil:8787", "user@localhost:8787", "127.1:8787", "[::1]:8787"]) {
    assert.throws(() => validateLocalRequest(request({ ...headers, host }), token), { statusCode: 403 });
  }
  for (const origin of ["null", "https://localhost:8787", "http://evil.test", "http://localhost:9999", "http://localhost:8787/path"]) {
    assert.throws(() => validateLocalRequest(request({ ...headers, origin }), token), { statusCode: 403 });
  }
  for (const site of ["cross-site", "same-site", "none"]) {
    assert.throws(() => validateLocalRequest(request({ ...headers, "sec-fetch-site": site }), token), { statusCode: 403 });
  }
  for (const supplied of [undefined, "", "bad", "b".repeat(64)]) {
    assert.throws(() => validateLocalRequest(request({ "x-spider-token": supplied }), token), { statusCode: 401 });
  }
  assert.throws(() => validateLocalRequest({ ...request(headers), headersDistinct: { host: ["localhost:8787", "evil"] } }, token), { statusCode: 403 });
  for (const target of ["http://localhost:8787/api/dashboard", "//evil.test/api/dashboard", "/%ZZ", "/\u0000"]) {
    assert.throws(() => validateLocalRequest(request(headers, target), token), { statusCode: 400 });
  }
  assert.doesNotThrow(() => validateLocalRequest(request({}, "/app.js"), token));
  assert.doesNotThrow(() => validateLocalRequest(request({ ...headers, "sec-fetch-site": "same-origin" }), token));
  assert.throws(() => validateLocalRequest(request({ "sec-fetch-site": "cross-site" }, "/app.js"), token), { statusCode: 403 });
  assert.throws(() => validateLocalRequest(request({}, "/api/local-session"), token), { statusCode: 403 });
  assert.doesNotThrow(() => validateLocalRequest(request({ "sec-fetch-site": "same-origin" }, "/api/local-session"), token));
  assert.doesNotThrow(() => validateLocalRequest(request({ origin: "http://localhost:8787" }, "/api/local-session"), token));
  assert.doesNotThrow(() => validateLocalRequest({ ...request({ host: "localhost", "x-spider-token": token }), socket: { localPort: 80 } }, token));
  assert.throws(() => validateLocalRequest({ ...request(headers), headersDistinct: {} }, token), { statusCode: 403 });
});

function bodyStream(chunks, headers = {}) {
  const stream = Readable.from(chunks);
  stream.headers = headers;
  return stream;
}

test("streaming JSON limit applies to actual bytes and validates shape/framing", async () => {
  const json = { "content-type": "application/json; charset=utf-8" };
  assert.deepEqual(await readRequestBody(bodyStream([])), {});
  assert.deepEqual(await readRequestBody(bodyStream([Buffer.from('{"a":'), Buffer.from('1}')], json)), { a: 1 });
  const boundary = Buffer.from('{"a":"' + "x".repeat(MAX_BODY_BYTES - 8) + '"}');
  assert.equal(boundary.length, MAX_BODY_BYTES);
  assert.equal((await readRequestBody(bodyStream([boundary], json))).a.length, MAX_BODY_BYTES - 8);
  for (const length of ["-1", "x", "9007199254740992"]) {
    await assert.rejects(readRequestBody(bodyStream([], { ...json, "content-length": length })), { statusCode: 400 });
  }
  await assert.rejects(readRequestBody(bodyStream([], { ...json, "content-length": String(MAX_BODY_BYTES + 1) })), { statusCode: 413 });
  await assert.rejects(readRequestBody(bodyStream([boundary, Buffer.from(" ")], json)), { statusCode: 413 });
  await assert.rejects(readRequestBody(bodyStream([boundary, Buffer.from(" "), Buffer.from("ignored")], json)), { statusCode: 413 });
  await assert.rejects(readRequestBody(bodyStream([Buffer.from("{}")], { ...json, "content-length": "3" })), { statusCode: 400 });
  await assert.rejects(readRequestBody(bodyStream([Buffer.from("{}")], { "content-type": "text/plain" })), { statusCode: 415 });
  await assert.rejects(readRequestBody(bodyStream([Buffer.from("{}")], {})), { statusCode: 415 });
  for (const raw of ["{", "null", "[]", "1", '"text"']) {
    await assert.rejects(readRequestBody(bodyStream([Buffer.from(raw)], json)), { statusCode: 400 });
  }
  assert.equal(new HttpError(400, "invalid").message, "invalid");
  const broken = bodyStream([], json);
  const rejected = assert.rejects(readRequestBody(broken), { statusCode: 400 });
  broken.emit("error", new Error("synthetic truncated stream"));
  await rejected;
});
