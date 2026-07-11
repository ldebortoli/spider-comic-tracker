# Session handoff

## Objetivo general

Aplicacion local para catalogar apariciones de Spider-Man y personajes relacionados, administrar una coleccion SQLite, sincronizar fuentes de comics y revisar novedades por Telegram.

## Tarea actual

No hay una tarea activa registrada.

## Estado actual

- El panel compilado y el script PowerShell usan el mismo mutex y rechazan una segunda ventana.
- Cerrar el panel ahora apaga el servidor; un fallo de apagado cancela el cierre para evitar procesos huerfanos.
- `scripts/build-server-control.ps1` recompilo correctamente `bin/SpiderTrackerServerControl.exe` y el script PowerShell pasa el parser.
- Memoria persistente inicializada el 2026-07-10.
- Rama detectada: `main`.
- Remoto origin: `https://github.com/ldebortoli/spider-comic-tracker.git`.
- Antes de trabajar, reconciliar este archivo con el repositorio y los procesos reales.

## Proximos pasos

1. Leer los cinco archivos de `.codex/`.
2. Revisar README, estructura y estado Git.
3. Completar CONTEXT.md si falta informacion estable.
4. Procesar USER_QUEUE.md y continuar desde BACKLOG.md.

## Riesgos

- La inicializacion automatica no sustituye la inspeccion tecnica del proyecto.
- Preservar cambios locales que no pertenezcan a la tarea activa.
