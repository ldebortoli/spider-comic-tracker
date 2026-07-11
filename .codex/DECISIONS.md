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
