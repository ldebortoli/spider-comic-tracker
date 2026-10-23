(function (root) {
  function createLocalApi(fetchImpl) {
    let session;
    async function request(path, options = {}, retry = true) {
      if (!path.startsWith("/api/") || /[\\#]/.test(path)) throw new Error("Ruta local invalida.");
      if (!session) {
        session = fetchImpl("/api/local-session", { credentials: "same-origin", redirect: "error", cache: "no-store" })
          .then(async (response) => {
            if (!response.ok) throw new Error("No se pudo abrir la sesion local.");
            return (await response.json()).token;
          }).catch((error) => { session = undefined; throw error; });
      }
      const token = await session;
      const response = await fetchImpl(path, { ...options, credentials: "same-origin", redirect: "error",
        headers: { "Content-Type": "application/json", ...options.headers, "X-Spider-Token": token } });
      // A server restart invalidates the old token before any mutation executes.
      if (response.status === 401 && retry) {
        session = undefined;
        return request(path, options, false);
      }
      return response;
    }
    async function api(path, options) {
      const response = await request(path, options);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Error de API");
      return payload;
    }
    return { request, api };
  }
  if (typeof module === "object") module.exports = { createLocalApi };
  else root.spiderLocalApi = createLocalApi(root.fetch.bind(root));
})(globalThis);
