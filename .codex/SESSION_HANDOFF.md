# Session handoff

## Objetivo general

Aplicacion local para catalogar apariciones de Spider-Man y personajes relacionados, administrar una coleccion SQLite, sincronizar fuentes de comics y revisar novedades por Telegram.

## Tarea actual

Sin tareas pendientes. La acción **Encender** de los paneles gráficos ya abre automáticamente la aplicación cuando el servidor queda disponible.

## Estado actual

- El panel compilado y el script PowerShell usan el mismo mutex y rechazan una segunda ventana.
- Cerrar el panel ahora apaga el servidor; un fallo de apagado cancela el cierre para evitar procesos huerfanos.
- **Encender** en los paneles gráficos de Windows, Linux y macOS inicia el servidor y abre `http://localhost:8787` solo después de comprobar que el puerto responde; los arranques programados conservan el comportamiento silencioso.
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
- Marvel Fandom reintenta `action=render` hasta tres veces y usa `action=parse` como alternativa. Los errores finales incluyen el mensaje por ficha en el resumen y Telegram.
- `weekly_fetch_failures` conserva títulos fallidos con semana, intentos y último error; `performSync` los incorpora aunque el corte semanal haya avanzado y conserva la semana original al guardarlos.
- La migración detectó los dos errores históricos de `2026-W29` y los dejó pendientes para la próxima revisión normal. Las dos fichas reales ya se obtienen correctamente con el nuevo lector.
- La importación española registró además 2 `socket hang up` en Universo Marvel. Ambas fichas cargaron y parsearon correctamente durante el diagnóstico; `spanish_source_queue` conserva estado `error` y ya incluye esos estados en ejecuciones posteriores.
- Al comenzar la tarea del 2026-07-19, `npm run server:status` informó que el servidor local estaba apagado; el PID 16180 registrado en el handoff anterior ya no estaba activo.
- La validación visual del 2026-07-19 pulsó **Encender** en el ejecutable compilado: el panel pasó por `INICIANDO`, abrió `Spider Tracker — Mozilla Firefox` al quedar listo y, al cerrar el panel, volvió a dejar el servidor apagado.
- Antes de trabajar, reconciliar este archivo con el repositorio y los procesos reales.

## Proximos pasos

1. Leer los cinco archivos de `.codex/`.
2. Revisar README, estructura y estado Git.
3. Procesar USER_QUEUE.md y continuar desde BACKLOG.md.

## Riesgos

- La inicializacion automatica no sustituye la inspeccion tecnica del proyecto.
- Preservar cambios locales que no pertenezcan a la tarea activa.
