# Session handoff

## Objetivo general

Aplicacion local para catalogar apariciones de Spider-Man y personajes relacionados, administrar una coleccion SQLite, sincronizar fuentes de comics y revisar novedades por Telegram.

## Tarea actual

Sin tarea en curso. Se diagnosticaron las dos advertencias de la revisión semanal del 15 de julio de 2026.

## Estado actual

- El panel compilado y el script PowerShell usan el mismo mutex y rechazan una segunda ventana.
- Cerrar el panel ahora apaga el servidor; un fallo de apagado cancela el cierre para evitar procesos huerfanos.
- `scripts/build-server-control.ps1` recompilo correctamente `bin/SpiderTrackerServerControl.exe` y el script PowerShell pasa el parser.
- Memoria persistente inicializada el 2026-07-10.
- Rama detectada: `main`.
- Remoto origin: `https://github.com/ldebortoli/spider-comic-tracker.git`.
- El filtro de enemigos usa endpoints `/api/catalog/enemies` y `/api/comics/enemies`, con tres grupos priorizados (`100 apariciones o mas`, `entre 10 y 99` y `menos de 10`).
- `listCatalogEnemies` agrega antagonistas con `json_each` en SQLite y reutiliza un `Intl.Collator`; el servicio cachea el listado completo cinco minutos y entrega paginas de hasta 50. La UI carga el primer bloque, agrega los siguientes al hacer scroll, permite buscar y alternar entre cantidad descendente y orden alfabetico.
- El filtro de catalogo compara `normalize_text(enemy.value)` con el nombre seleccionado normalizado, por lo que coincide con todas las variantes que componen el conteo. Las comillas exteriores redundantes se limpian al mostrar y guardar; las comillas internas se conservan.
- `scripts/backfill-catalog-enemies.js` completo el backfill de 11.248 fichas el 2026-07-11 sin errores; `npm run repair:enemies` lo puede repetir.
- Parser y capa de base limpian notas de plantillas de antagonistas antes de guardar.
- La revision semanal consulta `Category:Week_##,_YYYY` en Marvel Fandom para cada semana faltante, en orden; usa la ultima `sync_run` completada como corte y cruza correctamente cambios de año ISO.
- Las semanas recuperadas ejecutan una sola vez al final la importacion incremental historica y la revision de fuentes españolas; backups/resumenes Telegram tampoco se repiten por cada semana atrasada.
- La revisión programada `2026-W29` terminó como completada: procesó 22 fichas, agregó 3, rechazó 17, envió 1 a revisión, reconoció 1 rechazo previo y registró 2 errores sobre títulos de Alien.
- Los dos errores Marvel se reprodujeron como desafíos `403` intermitentes de Cloudflare en `action=render`; ambas páginas existen y `action=parse` responde. Ninguna quedó guardada y, al quedar la semana completada, hoy no se reintentan automáticamente.
- La importación española registró además 2 `socket hang up` en Universo Marvel. Ambas fichas cargaron y parsearon correctamente durante el diagnóstico; `spanish_source_queue` conserva estado `error` y ya incluye esos estados en ejecuciones posteriores.
- El servidor local está encendido en `http://localhost:8787` con PID 7548.
- Antes de trabajar, reconciliar este archivo con el repositorio y los procesos reales.

## Proximos pasos

1. Leer los cinco archivos de `.codex/`.
2. Revisar README, estructura y estado Git.
3. Procesar USER_QUEUE.md y continuar desde BACKLOG.md.

## Riesgos

- La inicializacion automatica no sustituye la inspeccion tecnica del proyecto.
- Preservar cambios locales que no pertenezcan a la tarea activa.
