# Cobertura global 0.1.3 - validacion final y publicacion en curso

- Rama codex/weekly-shutdown, base local 9229136. Todos los componentes instrumentables pasan sus gates100%; ver COVERAGE_20261023.md para alcance y contadores exactos. No confundir el baseline JS cargado70.50% con un inventario global.
- JS23 archivos:11566/11566 lineas,3686/3686 ramas,803/803 funciones; Python146 sentencias/34 ramas; C#244 lineas/214 puntos/38 ramas explicitas/19 metodos; PowerShell489 comandos; Bash266 comandos/6 funciones. Todos100%.
- CMD seis wrappers ejecutados completos; AppleScript contrato estatico aprobado pero no tiene cobertura ejecutable en Windows. MacOS nativo permanece pendiente, porcentaje null. Excepcion tecnica documentada D-015, ningun modulo instrumentable omitido.
- Fuentes/testhelpers y CI listos, revision independiente sin hallazgos. Cambios reales de comportamiento: fix camposwiki vacios, cancelacion de cierre PowerShell y rutas Linux con espacios; DI importadores conserva defaults. Version package/lock/README0.1.3.
- Proximo paso inmediato: checkout limpio del indice con core.autocrlf=true/.gitattributesLF, npmci y gatecompleto + test:windows; commit y push despues. No hay otros writers activos ni listener8787, no usar datos reales. CI no se monitorea.

# Trabajo actual: cobertura global y publicacion

- Pedido directo posterior: resolver cobertura global100% y subir cambios. Reemplaza la condicion de entrega local pendiente, no autoriza rebajar el gate.
- Baseline Node 70.50% lineas /76.56% ramas /75.72% funciones en modulos cargados; public/app.js y scripts aun ausentes. Inventariar todos los fuentes para fallar por archivos no ejecutados.
- Plan registrado en COVERAGE_PLAN.md. Trabajo paralelo autorizado por la seccion Parallelization Opportunities del skill planning-and-task-breakdown: tests de implementaciones existentes independientes; raiz coordina gates, scripts y controles nativos, agentes separados DB/servicio, parsers y UI/bridge/runtime.
- Nunca usar DB/env/Telegram reales en pruebas; no usar captura nativa incompatible. No monitorear CI tras push.

# Entrega local 2026-10-23 ART - apagado semanal 0.1.2

## Estado actual

- Rama `codex/weekly-shutdown`, creada desde `04210b3` (candidato local HTTP 0.1.1); remoto `origin` publico de `ldebortoli/spider-comic-tracker`, principal `main`. Sin cambios ajenos al iniciar.
- Pedido directo implementado localmente: usar el temporizador existente al iniciar y cada minuto; apagar servidor/bot a las 24 h de la confirmacion Telegram final. No se creo tarea AI ni tarea Windows duplicada.
- Recibo en estado SQLite `weekly_shutdown_receipt`: corrida, chat/mensaje, confirmacion, vencimiento, pending/consumed. Sin historicos retroactivos. Sin acuse real/no Telegram/error/warnings/backup fallido no se arma; con operaciones largas espera. Un reinicio conserva un recibo pendiente; tras consumirse no apaga un nuevo arranque.
- Telegram confirma el resumen agregado despues de USA, catalogo y fuentes espanolas, antes se enviaba al terminar solo USA. El callback compartido con SIGTERM cierra bot, HTTP y DB; si falla, devuelve false y se conserva el recibo reintentable.
- Version `package.json` 0.1.2 y README sincronizados; prueba evita una documentacion de version desactualizada.
- Windows: unica tarea Spider Tracker - Actualizacion semanal, Ready/habilitada, apunta al arbol local. No listener 8787 ni tracker habituales al comenzar o al terminar comprobaciones. El siguiente arranque semanal usa este codigo; no se encendio la instancia habitual ni se toco su DB/config/Telegram en esta entrega.

## Validacion

- `npm test`: 39 comprobaciones previas +23 pruebas Node +8 Python pasan; nueva suite con nueve casos de plazo, espera, recibos invalidos, reinicio, fallo de envio/backup/apagado, version y pipeline real sintetico con cierre HTTP/bot.
- `npm run test:shutdown`: 100% lineas/ramas/funciones de weekly-shutdown.js. Motor Node no reporta sentencias por separado. Mutacion del limite temporal detectada por las pruebas.
- `npm run test:security`: 100% lineas/ramas/funciones en server.js, http-security.js y local-api.js; 12 pruebas.
- `npm run test:python-coverage`: 146 sentencias, 34 ramas, 100% en telegram_bot.py; ocho pruebas.
- `npm run test:windows`: raiz/hijo/nieto y FormClosing sinteticos pasan; candidato compilado en data/security-review/windows-candidate sin reemplazar bin/.
- Sin UI nueva, nueva dependencia, envios Telegram ni uso de captura Windows conocida incompatible. Sin consultas de CI remota.
- GitHub solo lectura revalidado: PUBLIC, Secret Scanning/Push Protection enabled; correo Git local noreply ya correcto. Sin cambios de cuenta/protecciones/remotos.

## Bloqueos y continuacion

- Publicacion/merge de 0.1.1 y 0.1.2 bloqueados: falta demostrar el requisito global de cobertura 100% del codigo mantenido de UI/bridge JS y C#/PowerShell. No rebajar ni confundir el gate focalizado con cobertura global; no push mientras siga este gate. Cambio scoped confirmado localmente.
- Adopcion Linux timer sigue bloqueada por host desconocido; validacion nativa Linux/macOS requiere esos entornos. Sin despliegues.
- USER_QUEUE sin pendientes; todas las procesadas tienen DONE en BACKLOG. La solicitud actual es directa, no un pendiente nuevo de cola.
- Proximo paso de publicacion: resolver la medicion y cobertura global pendiente o recibir una excepcion explicita del usuario; luego push del branch sin reescribir historial y sin esperar CI. No ampliar esta entrega a una reescritura de la app.

## Incidente previo preservado

- La entrega anterior 0.1.1 importo inicialmente un baseline con arranque automatico: abrio DB habitual y tuvo WAL/bot el 2026-10-23 01:50 UTC. No se puede certificar ausencia de sync/intentos de notificacion de esa entrega. Esta corregido el import sin efectos; esta entrega solo uso dependencias/DB/cwd sinteticos. Evidencia y rollback previos: SECURITY_REVIEW_20261023.md.
