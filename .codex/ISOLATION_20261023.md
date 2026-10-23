# Bridge y contencion de pruebas 0.1.4

Base verificada local/remota: 8df19a44025ed4bdd64501c42a526091456f8b85.
Integracion preparada desde una copia temporal; instalacion habitual separada.

## Cambio

- El callback de cierre forzado del bridge captura errores. ESRCH se tolera; otros errores rechazan la promesa y conservan el hijo para reintentar. El error no escapa del temporizador.
- Todas las entradas npm test/test:* exportan codigo/dependencias antes de importar aplicacion. La copia excluye Git, .env y datos habituales; configura fixtures y conserva solo reportes al volver al checkout.
- Preload JS y guard Python anteriores a imports rechazan efectos de arranque, SQLite de aplicacion, procesos, rutas reales y red externa. Las conexiones sinteticas usan listeners loopback registrados. Las herramientas nativas fijadas se preparan antes del gate offline.
- No se cambian inventarios, motores o umbrales. Se conservan byte por byte server.js, weekly-shutdown.js, C#, PowerShell, POSIX, CMD, configuracion de calendario y pruebas recientes de rutas8.3/cleanup.

## Validacion local final

`node tests/run-isolated.cjs full` termino exit0 desde el checkout temporal normal. El bootstrap exporto una segunda copia sin Git/.env y cargo sus guards antes de imports. Node24.18.0 y Python3.13.2; codigo LF y diff sin errores de whitespace.

| Motor | Resultado |
| --- | --- |
| JavaScript, inventario23fuentes | 11570/11570 lineas, 3684/3684 ramas, 804/804 funciones V8; LCOV exacto |
| Python | 146/146 sentencias, 34/34 ramas |
| C# completo, AltCover9.0.145 | 244/244 lineas, 214/214 secuencias, 38/38 ramas explicitas, 19/19 metodos |
| PowerShell10fuentes | 10casos, 489/489 comandos Pester |
| Bash5fuentes bajo Git Bash/Windows | 7casos, 266/266 comandos y6/6funciones |
| CMD6wrappers | Contrato estructural y ejecucion nativa aprobados |
| WinForms/arboles sinteticos | PowerShell, panel compilado y FormClosing cierran raiz/hijo/nieto |
| AppleScript | Contrato estatico aprobado; compilacion/UI nativa macOS no disponible |

Los contadores V8 corresponden a esa ejecucion, sin inventario estatico de ramas comparable entre motores. CMD/AppleScript no reciben porcentajes ejecutables inventados.

Contencion:20probes JS y10Python previos a imports; seis mutaciones con efectos de importacion rechazadas antes de SQLite/listener/hijo. Todos los modulos JS de src importan sin iniciar servicios. Python usa Telegram falso. Una mutacion adicional invierte la condicion ESRCH del callback: el caso focal falla con timeout acotado5s; codigo final pasa. El RED contra la implementacion anterior tambien se conserva en la evidencia candidata.

Revision de correccion, simplicidad, arquitectura, seguridad y rendimiento sin hallazgos bloqueantes en el delta final. Auditoria de patrones de secretos/rutas personales/correos sobre archivos seleccionados aprobada. No se agregan dependencias ni cambian identidades globales o protecciones.

## EXE preparado y adopcion pendiente

Staging: SpiderTrackerServerControl.exe,45056bytes,version0.1.4.0.
SHA256:9f190824e7a6654ae38bab3ba022257022af7f3d6997ebd89abb03767336d4a0.
Fuente C#:7b209d191a98ecbb701c7b075972deb8aa1e4cf586fc6276aa4f0530654aa4d4.
Binario compilado directamente a staging; nunca ejecutado ni instalado. Ensayo previo de File.Replace/rollback con binario inerte y cuatro canarios sinteticos conservado.

Operacion bloqueada: actualizar el arbol operativo y sustituir bin/SpiderTrackerServerControl.exe. Falta evidencia vigente de exclusion de paneles, servidor, bridge y disparadores durante la ventana. La inspeccion Scheduler anteriormente denegada no se reintenta ni sustituye. Solo con esa precondicion confirmada se revalidan identidad/HEAD y backups de codigo/binario, y se realiza sustitucion atomica con rollback; no iniciar perfil habitual como smoke.

No se leyeron/copiaron DB/WAL/SHM/config reales, enviaron notificaciones, hicieron scraping o cerraron procesos ajenos en esta integracion. El incidente previo conserva efectos externos indeterminables; no se restauro ni reparo nada. Los guards previenen errores accidentales de pruebas; no son un sandbox del SO contra codigo hostil con la misma identidad.

Temporales propios de integracion, snapshot exportado, mutaciones y staging permanecen para diagnostico/limpieza recuperable posterior. Conservar evidencia del incidente y backups necesarios; ningun borrado en esta entrega. Cola procesada auditada: todos sus pedidos historicos siguen DONE; bloqueos de plataforma previos conservados.
