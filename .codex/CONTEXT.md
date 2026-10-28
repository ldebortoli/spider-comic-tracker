# Spider Tracker - Contexto del proyecto

## Descripcion general

Aplicacion local para catalogar apariciones de Spider-Man y personajes relacionados, administrar una coleccion SQLite, sincronizar fuentes de comics y revisar novedades por Telegram.

## Estado detectado

- Ruta: usar la raiz Git detectada en cada maquina; no registrar rutas personales absolutas.
- Stack: Node.js/JavaScript, Python
- Git: True
- Rama primaria y actual: `main`
- Remoto origin: `https://github.com/ldebortoli/spider-comic-tracker.git`
- Visibilidad remota verificada: publica (`PUBLIC`) al 2026-08-20.
- Seguridad remota: Secret Scanning y Push Protection habilitados para este repositorio desde el 2026-08-20.

## Estructura inicial

- `.env`
- `.env.example`
- `.gitignore`
- `APAGAR SERVIDOR.cmd`
- `assets`
- `bin`
- `BUILDING.md`
- `data`
- `ESTADO SERVIDOR.cmd`
- `INICIAR SERVIDOR.cmd`
- `INSTALAR ACTUALIZACION SEMANAL.cmd`
- `LICENSE`
- `package.json`
- `packaging`
- `PANEL DEL SERVIDOR.cmd`
- `public`
- `QUITAR ACTUALIZACION SEMANAL.cmd`
- `README.md`
- `requirements.txt`
- `scripts`
- `src`
- `tests`

## Ejecucion y tests

- Servidor local: `npm start` o `npm run server:start`.
- Estado del servidor: `npm run server:status`.
- Apagado del servidor: `npm run server:stop`.
- Tests completos: `npm test`.
- Importacion historica: `npm run import:catalog`.
- Reparaciones puntuales: `npm run repair:covers`, `npm run repair:dates`, `npm run repair:appearances`, `npm run repair:enemies`, `npm run repair:spanish-covers`.
- La UI local responde en `http://localhost:8787`.
- La base principal queda en `data/comics.sqlite` y no debe versionarse.

## Arquitectura estable

- Backend Node.js en `src/server.js`, `src/service.js` y `src/database.js`.
- UI estatica en `public/index.html`, `public/app.js` y `public/styles.css`.
- Scrapers/parsers principales: `src/catalog.js`, `src/marvel.js`, `src/panini.js`, `src/universo-marvel.js`.
- Datos historicos USA: `spiderman_catalog_issues`, `catalog_characters`, `catalog_character_issues`.
- Seguimiento semanal: `comics`, `volumes`, `comic_characters`, `review_queue`, `sync_runs`, `weekly_fetch_failures`.
- La revision semanal recupera categorias `Category:Week_##,_YYYY` desde la semana posterior a la ultima `sync_run` completada hasta la semana ISO actual.
- Las fichas semanales fallidas se conservan en una cola persistente y se reintentan en revisiones posteriores con su semana original. Marvel Fandom usa reintentos de `action=render` y `action=parse` como alternativa.
- Los endpoints de enemigos conservan una cache completa por personaje/universo, pero la UI consume paginas de hasta 50, permite ordenar por frecuencia o alfabeticamente y agrega mas opciones al hacer scroll.
- El conteo y el filtrado de enemigos comparten la misma normalizacion de nombres para unificar diferencias de puntuacion, comillas y mayusculas.
- Ediciones en espanol: `spanish_editions`, `spanish_edition_issues`, `panini_products`.

## Convenciones

- Preservar cambios ajenos y secretos locales.
- Actualizar este archivo solo cuando cambie informacion estable.
- La memoria persistente vive en `.codex/` y se carga siguiendo `AGENTS.md`.

## Candidato HTTP local 0.1.1 (2026-10-23)

- Ver D-012 (CI), D-013 (sesion local) y SECURITY_REVIEW_20261023.md.
- UI y CSV usan public/local-api.js; bridge Node transmite SPIDER_LOCAL_TOKEN al cliente Python. No persistir ese token ni ponerlo en URLs.
- Importar src/server.js ya no inicia DB, scheduler ni Telegram; createTrackerServer permite pruebas sinteticas.
- Gates: npm run test:security y npm run test:python-coverage. Cierre Windows: npm run test:windows.
- Fuente candidato integrado/publicado en main en 0.1.3 tras resolver el gate de cobertura. No adopcion/timer Linux sin host. Incidente de aislamiento inicial documentado; no afirmar datos reales inalterados.


## Apagado semanal local 0.1.2 (2026-10-23)

- `src/weekly-shutdown.js` usa el temporizador existente del servidor: comprobacion al iniciar y cada minuto, aun con calendario semanal desactivado. No automatizacion Codex ni nueva tarea Windows.
- El resumen agregado Telegram se envia al final de USA, catalogo y fuentes espanolas. Solo un flujo sin errores y un recibo `ok` con chat/mensaje habilitan `weekly_shutdown_receipt` en SQLite.
- Vencimiento: 24 horas despues de confirmacion; respeta las cinco operaciones largas, diferencia corridas posteriores y consume el recibo antes de cerrar servidor/bot/DB. Fallo de apagado deja el recibo reintentable.
- Gate nuevo: `npm run test:shutdown` exige 100% de lineas, ramas y funciones del comprobador; incluye pruebas sinteticas de pipeline y cierre HTTP/bot. Se complementa con el gate global de 0.1.3; bloqueo de publicacion resuelto.
- Windows mantiene unicamente la tarea preexistente de encendido semanal, habilitada. El arbol de trabajo local sera usado por su siguiente arranque; no se arranco el servidor real para probar ni se generaron recibos retroactivos.


## Cobertura y publicacion 0.1.3 (2026-10-23)

- Fuente 0.1.1/0.1.2/0.1.3 integrado en main, remoto origin/main verificado en f762daa. La instalacion/bin habitual no se reemplazo; los builds sinteticos quedan ignorados en data/.
- `npm ci` instala JSDOM de desarrollo fijado; `requirements-dev.txt` fija coverage.py. Las pruebas de desarrollo usan Node24.15 o posterior (validado24.18), sin cambiar el requisito de ejecucion habitual del servidor.
- `npm test` corre pruebas JS/Python sinteticas. `npm run test:coverage` ejecuta todos los gates locales y contratos. `test:coverage:node` rechaza cualquier archivo JS mantenido ausente y todo contador no cubierto. `test:coverage:native` cubre C#/PowerShell y verifica wrappers CMD. `test:posix` mide todos los comandos/funciones Bash; puede tardar mas de dos minutos en Windows.
- Todos los motores instrumentables al 100%; ver COVERAGE_20261023.md y D-015. CMD/AppleScript sin motor utilizable tienen contratos separados; no se les asigna un porcentaje. Compilacion/UI de AppleScript requiere macOS.
- CI Windows rapida por push/PR con cache/timeout/concurrency; POSIX lento y WinForms real adicional solo workflow_dispatch/full. No monitorear CI despues del push.
- Los importadores del servicio admiten clientes opcionales inyectados para probar orquestacion sin red, conservando los defaults productivos.

## Contencion de pruebas y bridge 0.1.4 (2026-10-23)

- Todas las entradas npm test/test:* exportan codigo y dependencias a una copia sin Git, .env ni datos habituales. Preload JS y guard Python se instalan antes de importar aplicacion; fuerzan configuracion sintetica y bloquean efectos de importacion, red externa, rutas reales, procesos y SQLite de aplicacion fuera de fixtures.
- Las herramientas nativas fijadas se preparan antes del gate offline. No se reducen inventarios ni umbrales; contencion accidental de pruebas, sin prometer un sandbox del SO contra codigo hostil de la misma identidad.
- TelegramBridge.stop captura errores del callback de cierre forzado: ESRCH se tolera; otros rechazan y conservan la referencia del hijo para reintentar. Apagado semanal, scheduler y launchers actuales conservados.
- Adopcion habitual Windows0.1.4 completada el2026-10-23: fuente validada15ca121 y EXE0.1.4.0/SHA9f190824e7a6654ae38bab3ba022257022af7f3d6997ebd89abb03767336d4a0, sin ejecutar el perfil habitual. Tarea semanal original pausada y restaurada bajo autorizacion expresa, Ready/habilitada y XML/calendario identicos; no se creo otra tarea. 42archivos de datos/config/PID/backups identicos, con copia DPAPI verificada; no abrir SQLite para validacion. Detalle y rollback: ADOPTION_20261023.md.

## Resumen semanal0.1.5 (2026-10-28)

- El resumen distingue finalizacion limpia, finalizacion con incidencias e interrupcion fatal. Identifica los conteos USA e incluye errores del catalogo historico y ediciones espanolas, aviso oficial de Panini y motivos repetidos agrupados. No modifica descubrimiento, decisiones, scheduler ni el gate de apagado24h.
- El control POSIX usa el PORT heredado del proceso igual que Node; default8787. Las pruebas de readiness reservan un puerto efimero, sin competir con la aplicacion activa. En Windows se usa el runtime Git usr/bin/bash directo con su PATH para los contratos POSIX y un presupuesto acotado60s por subprocess; se conserva el inventario completo.
- Para lecturas/activacion operativas locales, cURL nativo sin proxy responde donde Python urllib tuvo timeouts (incluido sin proxy). Usar el bootstrap de sesion oficial, token solo transitorio en memoria/stdin y confirmar identidad/operaciones antes de un reinicio; no inferir una caida del servidor por ese fallo del cliente.
- En procedimientos que inician el launcher Windows y dejan su servidor activo, usar WaitForExit del proceso launcher, no Start-Process -Wait (que espera tambien los descendientes). La activacion0.1.5 mantuvo UI, configuracion, tarea y estado semanal, sin reconstruir el panel nativo que no cambio.

## Fuentes espanolas0.1.6 (2026-10-28)

- Panini conserva HTTP como primera ruta y usa src/panini-browser.js ante Queue-it/403: playwright-core1.64.1 fijado, Edge instalado, headless/sandbox, contexto anonimo temporal y una sesion por importacion, con cierre en finally. No descarga navegadores, reutiliza perfiles personales ni resuelve desafios. La instalacion de Edge es necesaria para esa alternativa; una incompatibilidad se informa como incidencia real.
- Universo Marvel ignora comentarios solo durante descubrimiento (no los delimitadores de contenido de fichas), reintenta transitorios hasta3 veces y conserva404 reales/errores de indices. La cola retira artefactos antiguos `-->` exclusivamente sin productos asociados; un enlace publicado despues puede redescubrirse. Las ediciones/estado de coleccion no se eliminan.
- Version sincronizada package/lock/README0.1.6, inventario JS24fuentes. Reparacion puntual confirmada y backup privado en data/source-repair-016; no volver a reproducirla ni reemplazar los estados de corridas historicas por resultados parciales. Gate de apagado, interfaz y calendario conservados.
