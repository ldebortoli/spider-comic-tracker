# TODO

- [BLOCKED 2026-10-23] Adopcion Linux timer: host desconocido; no desplegar. Cierre nativo Linux/macOS y compilacion AppleScript requieren esos entornos.

# IN PROGRESS

No hay tareas en curso.

# DONE

- [2026-10-23] Resolver cobertura global y publicar 0.1.3 en main: commit f762daa, push y SHA remoto verificados. Todos los motores instrumentables al 100%: 23 JS, Python, C#, diez PowerShell y cinco Bash; gates estrictos, checkout limpio LF/core.autocrlf=true y WinForms/arboles sinteticos aprobados. CMD completo y contrato AppleScript separados sin porcentajes inventados; prueba nativa macOS pendiente por entorno. CI rapida por push/PR, suites largas manuales; CI remota no monitoreada.
- [2026-10-23] Completar publicacion del apagado semanal 0.1.2 (9229136) junto con 0.1.1/0.1.3 en main: recibo Telegram final, comprobacion cada minuto y apagado 24 h despues; preserva el scheduler si falla detener Telegram. Solo temporizador interno, ninguna automatizacion AI/tarea Windows duplicada. Sin envios ni DB reales durante validacion.
- [2026-10-23] Implementar candidato HTTP local 0.1.1 con Host/Origin/token, limite streaming, errores/URL seguros, UI/CSV y bridge adaptados, cierre de arbol Windows y fuentes POSIX. Suite local y gates HTTP/Python pasan; limites e incidente inicial registrados en SECURITY_REVIEW_20261023.md. Integrado/publicado en main junto con el cierre del gate amplio en 0.1.3.

- [2026-10-23] Incorporar la politica CI de USER_QUEUE a D-012: validacion local, push cuando corresponda, ninguna consulta de CI remota salvo pedido actual.
- [2026-10-23] Reconciliar privacidad GitHub con DONE del 2026-08-20 sin repetir ajustes. Consulta solo lectura: PUBLIC, Secret Scanning/Push Protection enabled; correo Git local noreply. Sin cambios de identidad, remotos, cuentas o protecciones. Los cuatro pedidos historicos de enemigos siguen DONE.

- [2026-08-20] Habilitar Secret Scanning y Push Protection en `ldebortoli/spider-comic-tracker` e integrar la auditoria de publicacion en `main`; la configuracion global de la cuenta no fue modificada.
- [2026-08-20] Verificar que el repositorio ya es publico y auditar los 32 commits y los 72 archivos de `HEAD`: sin secretos ni archivos sensibles versionados; `.env` y `data/` permanecen locales e ignorados. Retirar del contexto actual la ruta absoluta con el usuario de Windows.
- [2026-07-19] Hacer que **Encender** en los paneles gráficos de Windows, Linux y macOS inicie el servidor, espere a que la aplicación esté disponible y la abra automáticamente, sin modificar los arranques programados.
- [2026-07-15] Robustecer la revisión semanal de Marvel Fandom ante desafíos intermitentes de Cloudflare: reintentar `action=render`, usar `action=parse` como alternativa, conservar el mensaje de error por ficha y reintentar títulos fallidos aunque la semana avance como completada.
- [2026-07-11] Permitir ordenar el selector de enemigos por cantidad de apariciones o alfabeticamente.
- [2026-07-11] Corregir la discrepancia por la que un enemigo con 100+ apariciones podia filtrar solo una variante textual y, por lo tanto, muy pocos comics.
- [2026-07-11] Limpiar comillas exteriores redundantes en nombres de enemigos sin dañar nombres compuestos como `Green Goblin ("Norman Osborn")`.
- [2026-07-11] Reemplazar la carga masiva del dropdown de enemigos por un selector paginado de 50 elementos con prioridad 100+, luego 10+ y carga incremental al hacer scroll.

- [2026-07-11] Hacer que la revision semanal recupere secuencialmente todas las semanas faltantes desde la ultima completada, incluso entre años ISO y sin duplicar comics.
- [2026-07-11] Optimizar la carga del dropdown de enemigos con agregacion SQL, orden alfabetico reutilizable, cache temporal y recargas solo al cambiar personaje o universo.
- [2026-07-11] Cambiar la agrupacion de enemigos de 100+ a 10+ apariciones.
- [2026-07-11] Reemplazar filtro de enemigo libre por dropdown agrupado, backfillear enemigos por issue y mantener descubrimiento futuro basado solo en personajes seguidos.
- [2026-07-11] Completar y validar CONTEXT.md con arquitectura, comandos y convenciones del proyecto.
- [2026-07-11] Hacer que cerrar el panel de Spider Tracker apague el servidor administrado y cancele el cierre si el apagado falla.
- [2026-07-10] Garantizar una sola ventana del panel Spider Tracker con un mutex compartido entre el ejecutable C# y el script PowerShell.
- [2026-07-10] Inicializar la memoria persistente del proyecto.
