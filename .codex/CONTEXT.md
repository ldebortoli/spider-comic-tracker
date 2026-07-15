# Spider Tracker - Contexto del proyecto

## Descripcion general

Aplicacion local para catalogar apariciones de Spider-Man y personajes relacionados, administrar una coleccion SQLite, sincronizar fuentes de comics y revisar novedades por Telegram.

## Estado detectado

- Ruta: `C:\Users\calei\Documents\Codex\Analizador de comics`
- Stack: Node.js/JavaScript, Python
- Git: True
- Rama detectada: `main`
- Remoto origin: `https://github.com/ldebortoli/spider-comic-tracker.git`

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
