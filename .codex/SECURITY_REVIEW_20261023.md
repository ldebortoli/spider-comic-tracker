# Lote HTTP local 0.1.1 - 2026-10-23 UTC

## Resultado

Candidato implementado en `security/local-http-0.1.1`, con unico writer, sobre
`d5c12682c7fbcf41ded3ad531896b52ad7cef4c8`. Host verificado: DESKTOP-IH4I3NF.
Cola recibida reconciliada por separado en `0d5d112`. No se descarto WIP, no se
reimplementaron los cuatro pedidos historicos de enemigos y no se cambiaron
cuentas, identidad Git, remotos, protecciones ni permisos del SO.

La validacion del nucleo HTTP y del cliente Python tiene gates automatizados al
100%. Esto **no demuestra cobertura del 100% de todo el codigo mantenido**: no hay
medicion equivalente para los cambios C#/PowerShell, ni medicion completa de
`public/app.js` y `src/telegram.js`. Tienen pruebas de comportamiento descritas
abajo. MERGE/push quedan pendientes del gate mas amplio, sin afirmar que se haya
cumplido. No se publico, instalo ni inicio habitualmente el candidato.

No es una afirmacion de seguridad global ni una auditoria de todas las funciones.

## Incidente de aislamiento de la validacion inicial

La primera prueba HTTP importo `src/server.js` antes de separar su arranque al
importar. El baseline leyo la configuracion habitual y abrio la SQLite real; el
proceso anuncio disponibilidad en el puerto 8787. Se interrumpio inmediatamente
con Ctrl-C. La comprobacion elevada posterior no encontro listener 8787, bot
Python ni proceso de prueba activo. Los metadatos mostraron una escritura en
`comics.sqlite-wal` a las 01:50:17 UTC y archivo PID del bot a las 01:50:18 UTC.

No se leyeron registros, se revirtieron datos ni se descartaron WAL/config/PID.
**No se puede afirmar ausencia de sync, backfill o intentos de notificacion en
ese breve arranque.** No hubo envio intencional de mensajes reales, pero tampoco
hay evidencia para certificar que no ocurrieron intentos automaticos. La primera
prueba incumplio el aislamiento pedido; las pruebas posteriores usaron solo
SQLite sintetica y Telegram falso. El incidente se conserva como limite de la
entrega, sin atribuir cambios de datos a un resultado conocido.

Correccion: importar el modulo ya no arranca la app. `createTrackerServer` usa
colaboradores explicitos. El test del arranque real cambia primero a cwd temporal,
usa DB absoluta sintetica, desactiva scheduler, refresh, backups y polling, deja
vacio el token Telegram y bloquea el transporte externo. La reproduccion del
baseline exporta solo archivos versionados a otro cwd temporal con esos mismos
controles; nunca vuelve a arrancar la copia habitual.

## Preservacion

Backup estable ignorado: `data/security-review/baseline-20261023/`.
La copia temporal inicial fue recuperada desde objetos Git locales y se
revalidaron exactamente sus tres hashes originales; no se modifico el historial
publicado. El texto original de la cola se conserva sin atribuir autoria.

| Archivo | SHA-256 |
| --- | --- |
| USER_QUEUE.md | 6895ecdb58cde7329eb76f82a3ca330c382834bd688eece0383eeedb23f6a342 |
| baseline.patch | 51d3196fe085c5c4b0a319ac040cbce9175d182651099e147194db3bc222bbdb |
| HEAD.zip | d97b19e3bc30b68834ba7af3962ca0e205506f7acee941ca1b8a47f2b0f1baaf |

No se copio ni versiono la DB real o `.env`. El codigo no cambia esquema de DB.

## Controles y clientes reales

- `src/http-security.js` y `src/server.js`: Host exacto localhost/127.0.0.1 con el
  puerto de escucha; Origin HTTP exacto si esta presente; Fetch Metadata rechaza
  otro sitio, incluidos puertos distintos. La navegacion directa a la UI admite
  `Sec-Fetch-Site: none`. La escucha de produccion sigue en 127.0.0.1.
- Token aleatorio de 256 bits por proceso, en memoria, comparacion de tiempo
  constante con longitud validada. Toda API salvo bootstrap exige
  `X-Spider-Token`, incluidas lecturas y CSV. `/api/local-session` requiere el
  contexto del origen local; no hay CORS. Un proceso del mismo usuario que puede
  falsificar headers o leer el entorno pertenece al limite de confianza local.
- Cuerpo limitado a 64 KiB contados por streaming en todas las rutas; longitudes
  declaradas invalidas, exceso real, JSON truncado, malformado o no objeto se
  rechazan. Cuerpo no vacio requiere application/json. Recepcion 15 s, headers
  10 s e inactividad 30 s. Exceso/error cierra la conexion tras responder.
- URL dentro del try con base validada; se rechazan destinos absolutos, ambiguos
  y escapes invalidos. Contencion de archivos mediante path.relative. Errores
  inesperados devuelven 500 generico sin imprimir la excepcion; errores HTTP
  previstos usan 400/401/403/413/415. CSP, nosniff, frame denial y no-referrer.
- UI: `public/local-api.js`, `app.js`, `index.html`. Bootstrap sin almacenamiento
  persistente, token solo en header, sin redirects, renovacion unica tras 401.
  CSV conserva la confirmacion y descarga por fetch autenticado y Blob; ningun
  token en href. Texto importado escapado y URLs externas solo HTTP/HTTPS,
  incluidas tarjetas, pendientes, catalogo, ediciones y modal.
- Puente Node `src/telegram.js`: transmite SPIDER_LOCAL_TOKEN al hijo, sin argv
  con secretos, y oculta token local/Telegram en diagnosticos del hijo.
- Cliente `src/telegram_bot.py`: GET debug y POST decision con header local;
  destinos solo loopback HTTP, sin proxies heredados ni redirecciones. Conserva
  autorizacion por usuario Telegram y no cambia credenciales de terceros.
- Cierre: bridge espera al hijo y termina su arbol Windows; POSIX usa grupo de
  procesos y elimina descendientes restantes. Fallo de cierre mantiene servidor
  para reintentar. Panel C# y controles PowerShell usan taskkill /T /F; el cierre
  conserva su cancelacion ante error. Controles POSIX esperan salida y los
  paneles Linux/macOS intentan apagar antes de cerrar.

## Evidencia local

- Baseline: `npm test` paso sus 39 comprobaciones existentes.
- Baseline exportado: `node tests/baseline-security-repro.js` reproduce handlers
  que aceptan Host/Origin ajenos sin token, POST text/plain de mas de 64 KiB y
  terminacion del proceso por Host malformado. No prueba explotacion desde
  Internet ni evita posibles guardas adicionales del navegador/OS.
- Candidato: `npm test`: 39 comprobaciones existentes, 14 tests Node nuevos y
  8 tests Python, todos pasan. Incluye DB SQLite temporal, importacion sintetica,
  deduplicacion y preservacion de coleccion, errores sin secretos, clientes y UI.
- `npm run test:security`: 12 tests, 100% lineas/ramas/funciones en server.js,
  http-security.js y local-api.js, con umbrales que fallan por debajo de 100.
- `npm run test:python-coverage`: telegram_bot.py, 146 sentencias, 34 ramas,
  ninguna faltante, 100%. Framework Telegram falso incluso al probar main.
- `npm run test:windows`: compila panel candidato y harness, verifica cierre de
  raiz/hijo/nieto via PowerShell, helper compilado y FormClosing real de ventana
  oculta. No reemplaza bin/ ni abre panel habitual.
- TCP/HTTP adversarial: Origin permitido/denegado/null, Host duplicado/ajeno,
  token ausente/incorrecto, CSRF text/plain, chunked excesivo, limite exacto,
  longitudes negativas y truncadas, URL invalida, 500 seguro y servidor vivo.
- UI: escape de titulo/volumen/personajes/atributos, links javascript/data
  rechazados, texto de modal, confirmacion CSV y renovacion de token.
- Revision propia: invertir la comparacion de Origin en una copia temporal hace
  fallar el test (exit 1), sin cambiar el candidato. No se delegaron writers.
- JavaScript pasa node --check; scripts PowerShell pasan parser; ambos scripts
  de control Bash pasan bash -n en Git Bash. POSIX real/AppleScript no ejecutados.

Logs ignorados: `data/security-review/npm-test.txt`, `security-coverage.txt`,
`python-coverage.txt`, `windows-test.txt`, `baseline-repro.txt`.
El diff exportado final queda en el mismo directorio. No son datos de produccion.

## Cola, Git y permisos

GitHub consultado solo lectura: PUBLIC, Secret Scanning enabled y Push Protection
enabled. Correo local ya noreply. No se repitieron ajustes historicos. Politica CI
incorporada a D-012: validar localmente, push cuando corresponda, ninguna consulta
o espera de CI remota salvo pedido actual. Ambos pedidos de cola estan DONE.
No se inspecciono GitHub Actions. origin/main seguia en d5c12682c7fb al revalidar.

Las escrituras Git/memoria, consultas de red de GitHub y pruebas loopback
requirieron ejecucion elevada por restricciones del sandbox; se aprobaron. No hay
rechazo de auto-review pendiente. El intento de enviar un punto de control al
hilo coordinador devolvio thread not found: entrega no confirmada; no se insistio.

## Adopcion y rollback

1. Resolver el gate de cobertura del codigo mantenido mas alla de los cuatro
   componentes medidos, o registrar una excepcion autorizada. Revisar el incidente
   sin asumir datos reales inalterados; no diagnosticar la DB sin ampliar permiso.
2. Integrar por fast-forward cuando main siga siendo ancestro; si avanzo,
   reconciliar preservando commits. Push no forzado cuando corresponda, sin CI
   remoto. La rama candidata y los commits locales preservan todo el trabajo.
3. Respaldar binario habitual/config/DB mediante el procedimiento normal de la
   app antes de adopcion. Esta tarea no crea un backup de DB real por la restriccion
   explicita de aislamiento. Actualizar juntos servidor/UI/bridge/controles y
   recompilar panel Windows. No hay migracion nueva ni cambio de cuenta/token de
   Telegram. No arrancar servicios habituales como parte de pruebas sinteticas.
4. Rollback: detener el arbol administrado, restaurar el codigo d5c12682c7fb y el
   panel previamente respaldado mediante una rama/revert revisado; conservar la
   memoria de cola y sus decisiones. No reset/stash destructivo, reescritura,
   force-push, borrado de DB/WAL o restauracion de datos antiguos sobre decisiones
   reales. Token efimero desaparece al detener el proceso.

BLOCKED: merge/push hasta resolver el gate de cobertura mas amplio. Linux timer:
no desplegar hasta identificar host; validacion nativa Linux/macOS y compilacion
AppleScript requieren esos entornos. Node 24.18.0/Python 3.13.2 observados no se
actualizaron; dependencias/locks y otros hallazgos del informe base quedan fuera
del alcance HTTP aprobado. No hubo instalacion de herramientas o dependencias.
