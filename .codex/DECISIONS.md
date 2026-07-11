# Decisiones tecnicas

No borrar decisiones anteriores. Si una decision cambia, agregar una nueva entrada que indique cual reemplaza.

## D-001 - Memoria persistente del proyecto

- Estado: vigente.
- Fecha: 2026-07-10.
- Decision: usar `.codex/` como fuente de verdad entre sesiones, modelos y agentes.
- Motivo: continuidad independiente del historial del chat.

## D-002 - Instancia unica del panel

- Estado: vigente.
- Fecha: 2026-07-10.
- Decision: el panel C# y el panel PowerShell comparten el mutex Windows `Local\SpiderTrackerServerControl`.
- Motivo: impedir ventanas duplicadas aunque se usen lanzadores distintos, sin afectar el proceso Node del servidor.

## D-003 - El panel es propietario del servidor

- Estado: vigente.
- Fecha: 2026-07-11.
- Decision: cerrar la ventana de control ejecuta `Stop-TrackerFromPanel` antes de liberar el panel; si el apagado falla, se cancela el cierre y se muestra el error.
- Motivo: una UI creada para controlar el ciclo de vida del servidor no debe dejar el proceso Node ejecutandose sin su panel.

## D-004 - Los enemigos son metadata de filtrado, no fuente de descubrimiento

- Estado: vigente.
- Fecha: 2026-07-11.
- Decision: el catalogo y el seguimiento semanal guardan antagonistas para filtrar por enemigo, pero las importaciones nuevas siguen descubriendo comics exclusivamente desde los personajes/listas seguidos.
- Motivo: evita ampliar el alcance por enemigos y mantiene estable la cobertura definida por el usuario.

## D-005 - Las opciones de enemigos dependen solo del alcance de personajes

- Estado: vigente.
- Fecha: 2026-07-11.
- Decision: construir el dropdown completo por personaje y universo, agruparlo desde 10 apariciones y cachearlo durante cinco minutos; los demas filtros no vuelven a descargar ni renderizar sus miles de opciones.
- Motivo: el listado de enemigos es una faceta del alcance elegido y reconstruirlo ante cada cambio de texto, fecha, orden o coleccion bloqueaba innecesariamente la interfaz.

## D-006 - La revision semanal recupera semanas faltantes

- Estado: vigente.
- Fecha: 2026-07-11.
- Decision: antes de revisar novedades, buscar la ultima `sync_run` completada y procesar en orden cada semana ISO posterior hasta la actual; una corrida fallida no mueve el punto de corte. Si no existe una corrida completada previa, comenzar en la semana vigente.
- Motivo: una PC apagada o un servidor detenido durante varias semanas no debe producir huecos en el seguimiento.

## D-007 - El selector de enemigos se pagina sin perder la cache

- Estado: vigente; complementa D-005.
- Fecha: 2026-07-11.
- Decision: conservar en el servidor durante cinco minutos el catalogo completo de enemigos por alcance, pero entregar y renderizar paginas de hasta 50. Priorizar primero 100 apariciones o mas, luego entre 10 y 99 y finalmente menos de 10; cargar paginas adicionales al acercarse al final del scroll y permitir buscar dentro del mismo catalogo.
- Motivo: evita transferir y crear de una vez mas de ocho mil opciones, mantiene rapido el primer despliegue y conserva una forma practica de encontrar enemigos poco frecuentes.

## D-008 - Conteo y filtro de enemigos comparten identidad normalizada

- Estado: vigente; complementa D-004 y D-007.
- Fecha: 2026-07-11.
- Decision: agrupar y filtrar enemigos por su nombre normalizado, aunque las fichas fuente difieran en comillas, puntos, espacios o mayusculas. Mostrar el nombre limpio, quitando solo comillas que envuelven el nombre completo, y conservar comillas internas con significado. El selector se ordena por cantidad descendente por defecto y permite cambiar a orden alfabetico.
- Motivo: el selector ya sumaba variantes equivalentes, pero la consulta exacta devolvia solo la variante elegida y producia discrepancias como 106 apariciones contabilizadas frente a un unico resultado.
