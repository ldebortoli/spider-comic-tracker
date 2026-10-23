# Cobertura global100% y publicacion

Inventario congelado: todo JS de src/, public/ y scripts/; src/telegram_bot.py; src/ServerControl.cs; todos los scripts PowerShell mantenidos; scripts shell y fuente AppleScript/launchers de plataformas soportadas. CSS/HTML, iconos y plantillas declarativas se validan estructuralmente, no tienen cobertura ejecutable. Tests, herramientas de cobertura y artefactos generados no son produccion; su exclusión no excluye comportamiento de la aplicacion.

1. [DONE] Tests reales y100% Node en DB/servicio: pruebas SQLite sintetica, importadores/backup/calendar/error con inyeccion en fronteras externas.
2. [DONE] Tests reales y100% Node en parsers/roster/utilidades con HTML y transportes sinteticos.
3. [DONE] Cargar UI completa bajo DOM, medir app.js sin slices;100% bridge/config/monitor y rutas de error.
4. [DONE] Instrumentar controles C#/PowerShell y scripts de mantenimiento/instalacion con herramientas reproducibles y sandbox sintetico. Declarar limites medibles exactos; no afirmar cobertura inexistente ni retirar fuentes alcanzables para lograr porcentaje.
5. [DONE] Gate global explicito que rechace archivo ausente o metrica menor100; reproducir checkout limpio, CI gratuita con timeout/cache/concurrency y suites caras manuales.
6. [IN PROGRESS] Revisar cambios, validar local, version sincronizada si cambia produccion/config/dependencias, memoria actual y publicar a GitHub sin esperarCI.

No borrar ni rebajar codigo para aumentar el porcentaje; eliminar solo ramas demostrablemente inalcanzables y registrar evidencia. AppleScript y CMD conservan contratos explicitamente separados por carecer de motor de cobertura utilizable; no se les asigna porcentaje. Compilacion/UI de AppleScript y smoke nativo Linux/macOS conservan su pendiente de plataforma.
