# TODO

No hay tareas pendientes.

# IN PROGRESS

No hay tareas en curso.

# DONE

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
