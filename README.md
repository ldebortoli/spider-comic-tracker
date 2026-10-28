# Analizador de comics

Las pruebas `npm test` y `npm run test:*` usan una copia de código sin `.env`,
datos habituales ni Git. El guard se carga antes de importar la aplicación y
fuerza configuración sintética. Las copias de diagnóstico se conservan y sólo
se devuelven reportes; las pruebas no arrancan el perfil habitual.
Los gates nativos requieren las herramientas fijadas en
`tests/install-coverage-tools.ps1`, preparadas previamente o disponibles en caché.
CI prepara esas mismas dependencias antes de ejecutar las pruebas aisladas;
el gate no descarga herramientas durante la validación.

Aplicacion local para catalogar las apariciones historicas de Spider-Man/Peter Parker de Earth-616, marcar que material ya esta cubierto por tu coleccion y seguir comics nuevos de personajes relacionados.

## Que hace

- Mantiene una lista independiente por personaje, con arácnidos y simbiontes de distintas realidades.
- Descubre simbiontes identificados explicitamente como `(Symbiote)` dentro de `Category:Symbiotes`, sin limitarse a Earth-616.
- Amplia los arácnidos desde `Human/Spider Hybrids`, `Radioactive Spider-Powered`, Spider-Army, Spider-Society y Web-Warriors.
- Oculta del selector las entidades que todavia no tienen comics, pero las conserva para futuras sincronizaciones.
- Importa desde Marvel Database/Fandom los miembros de `Appearances` y `Minor Appearances` de cada personaje.
- Un comic compartido aparece en cada lista correspondiente, pero se almacena una sola vez.
- Conserva solo paginas categorizadas como comics; no mezcla peliculas, juegos u otros medios.
- Guarda título, serie, volumen, issue, fecha de salida, tapa, guionistas, tipo de aparición y subtipo de aparición menor (sueño, flashback, visión, recapitulación u otro).
- Permite marcar cada issue como cubierto por una edicion propia y anotar editorial, tomo y notas (por ejemplo, una edicion de Panini).
- Mantiene esos datos personales aunque se vuelva a importar el catalogo.
- Guarda por personaje la fecha del comic mas reciente, la ultima sincronizacion y cuantos comics nuevos se agregaron.
- La accion **Continuar desde...** revisa solamente una lista y no vuelve a descargar ni duplicar issues ya conocidos.
- Incluye buscador, filtros de colección/aparición/fecha, orden cronológico predeterminado, tamaño de página configurable y paginación arriba y abajo.
- Muestra en cada issue los personajes que aparecen dentro de la lista o categoría seleccionada.
- Exporta todo el catalogo y el estado de la coleccion a CSV desde la interfaz.
- Revisa las categorias semanales de Marvel Fandom `Category:Week_##,_YYYY` desde la semana posterior a la ultima revision completada hasta la actual.
- Reintenta fichas bloqueadas temporalmente por Cloudflare, usa `action=parse` si falla `action=render` y conserva cada error individual para recuperarlo en una revisión posterior sin cambiar su semana original.
- Extrae titulo, URL de la ficha, fecha de publicacion, tapa y personajes detectados.
- Organiza cada comic dentro de su volumen correspondiente.
- Distingue entre material nuevo, reediciones claras y casos dudosos.
- Genera backups periodicos de la base SQLite y puede enviarlos por Telegram.
- Guarda todo en `SQLite`, no en archivos sueltos.
- Agrega automaticamente los comics con coincidencia fuerte.
- Descarta automaticamente reediciones claras como facsimiles, omnibus o recopilatorios detectados.
- Envia a Telegram los casos ambiguos con botones inline `Agregar` y `No agregar`.
- Puede enviar un backup comprimido de la base por Telegram cada 16 semanas.
- Bloquea doble decision: una vez resuelto, el mensaje se edita y no vuelve a aceptar clicks.
- Valida que solo el usuario configurado en `TELEGRAM_ALLOWED_USER_ID` pueda aprobar o rechazar.
- Muestra una UI local con buscador por titulo, personaje y rango de fechas.

## Requisitos

- Node.js 22 o superior.
- Python 3.10 o superior con `python-telegram-bot`.
- Un bot de Telegram.
- Un chat privado o grupo privado para revisiones. Para mensajes con botones y control por usuario, esto es mas seguro que un canal publico.

Dependencias Python:

```bash
python -m pip install -r requirements.txt
```

El servidor y la interfaz funcionan en Windows, Linux y macOS. Las instrucciones de construccion y los paneles nativos estan documentados en [BUILDING.md](BUILDING.md).

## Configuracion

1. Copiar `.env.example` a `.env`.
2. Completar al menos:

```env
TELEGRAM_BOT_TOKEN=...
TELEGRAM_REVIEW_CHAT_ID=...
TELEGRAM_SUMMARY_CHAT_ID=...
TELEGRAM_ALLOWED_USER_ID=123456789
```

3. Ajustar horario semanal si hace falta:

```env
SCHEDULE_DAY=WEDNESDAY
SCHEDULE_HOUR=12
SCHEDULE_MINUTE=0
APP_TIMEZONE=America/Buenos_Aires
```

4. Opcionalmente, configurar backups:

```env
TELEGRAM_BACKUP_CHAT_ID=...
BACKUP_ENABLED=true
BACKUP_INTERVAL_WEEKS=16
BACKUP_DIR=data/backups
BACKUP_MAX_BYTES=2147483648
BACKUP_TELEGRAM_MAX_BYTES=52428800
BACKUP_RETENTION_COUNT=4
```

## Uso

```bash
npm start
```

Abrir [http://localhost:8787](http://localhost:8787).

En Windows tambien se puede administrar el servidor con doble clic desde la carpeta del proyecto:

- `PANEL DEL SERVIDOR.cmd` abre el ejecutable grafico `bin/SpiderTrackerServerControl.exe`. El boton **Encender** inicia el servidor, espera a que la aplicacion este disponible y la abre automaticamente en el navegador; el panel tambien permite apagarla, consultar el estado o volver a abrirla.
- `INICIAR SERVIDOR.cmd`
- `APAGAR SERVIDOR.cmd`
- `ESTADO SERVIDOR.cmd`

El servidor se ejecuta oculto desde esta misma carpeta. Su PID se guarda en `data/server.pid` y los registros en `data/server.log` y `data/server-error.log`.
Si Telegram está activado, el servidor levanta además `src/telegram_bot.py` como proceso Python con polling mediante `python-telegram-bot`; su PID se guarda en `data/telegram-bot.pid` y se apaga junto con el servidor.
Comandos disponibles: `/debug` para estado operativo y `/log` para devolver el JSON de la update recibida por Telegram.
El icono del panel y del acceso directo se guarda en `assets/spider-tracker-icon.ico`.

Los mismos controles estan disponibles desde una terminal con `npm run server:start`, `npm run server:stop` y `npm run server:status`.
El control POSIX respeta `PORT` exportado al proceso, igual que Node; por defecto conserva el puerto 8787.

La actualización automática semanal ejecuta tres pasos secuenciales: recupera en orden todas las semanas USA posteriores a la ultima revisión completada hasta la actual, busca nuevos cómics en las listas históricas y después revisa novedades y pendientes de las fuentes españolas. `INSTALAR ACTUALIZACION SEMANAL.cmd` registra la tarea de Windows para que el servidor se inicie a la hora configurada aunque estuviera apagado; `QUITAR ACTUALIZACION SEMANAL.cmd` la elimina.

El horario tambien se puede activar, desactivar o modificar desde **Configuración**. Telegram no ejecuta el calendario: la tarea del sistema solo despierta el servidor y una marca semanal persistente evita corridas duplicadas.

Desde la version **0.1.2**, el resumen semanal se envia al terminar los tres pasos,
con todas las semanas recuperadas incluidas. Desde la version **0.1.5**, distingue
una revision finalizada con incidencias de un fallo fatal e informa por separado
los errores USA, del catalogo historico y de las ediciones espanolas, incluyendo
la sala de espera de Panini y los motivos de Universo Marvel agrupados por cantidad.
Solo un flujo sin errores ni advertencias y un recibo
confirmado de Telegram (`ok`, chat y mensaje) habilitan el apagado. El recibo se
persiste en SQLite como `weekly_shutdown_receipt`; no se infiere a partir de una
corrida marcada como completada ni de mensajes historicos sin recibo.

El temporizador del propio servidor comprueba ese recibo al iniciar y cada minuto,
incluso si el calendario semanal se desactiva. A las **24 horas de la confirmacion**
apaga el servidor y su bot si siguen activos. Si hay una revision, importacion o
actualizacion en curso, espera a que termine. Una corrida posterior fallida o un
backup fallido impiden el apagado. El recibo conserva el vencimiento al reiniciar
y se consume antes de cerrar SQLite para no apagar otra vez un arranque posterior.
No agrega tareas de IA ni otra tarea de Windows: si el servidor ya esta apagado,
no hay proceso que comprobar ni iniciar para apagarlo.

Pruebas rapidas: `npm test`. Gate del comprobador (100% en lineas, ramas y funciones;
el motor de Node no informa sentencias por separado): `npm run test:shutdown`.
Las pruebas usan SQLite sintetica, Telegram simulado y un reloj adelantado; nunca
requieren esperar 24 horas ni envios reales.


La aplicación se organiza en tres pestañas: **Issues USA**, **Panini y ediciones en español** y **Seguimiento complementario**. En la lista USA se puede dejar vacío el selector de personaje para ver todos los issues únicos del universo o grupo elegido.

La interfaz permite lanzar el backfill historico con **Importar o actualizar catalogo 616**. La primera corrida consulta varios miles de fichas y puede tardar varios minutos. Las siguientes corridas actualizan los metadatos sin borrar las marcas de la coleccion.

Tambien se puede ejecutar desde la terminal:

```bash
npm run import:catalog
```

Para continuar solamente una lista desde su corte guardado:

```bash
npm run import:catalog -- --character venom-symbiote-earth-616 --continue
```

El `slug` de cada personaje se obtiene desde el selector de la interfaz o desde `GET /api/catalog/characters`.

Si una ficha no tiene `Release Date`, el importador usa `Cover Date`. Las fechas de portada que solo indican mes o año conservan esa precisión en la interfaz, sin presentar como real un día inventado. Para volver a consultar únicamente las fichas que siguen sin fecha:

```bash
npm run repair:dates
```

## Ediciones en español

El apartado permite registrar manualmente tomos, integrales, grapas o colecciones con estado **Quiero comprar** o **Ya tengo**, editorial, línea, personajes, ISBN, portada, referencia y notas.

También importa el catálogo Marvel de Panini España. Si la tienda oficial activa su sala de espera, continúa con [Fichas Universo Marvel](https://fichas.universomarvel.com/), que publica fecha, formato, páginas, portada y el contenido USA de cada edición. Cada producto se identifica por fuente y URL para no duplicarlo. El servidor relaciona los números declarados con el catálogo USA y solo publica en la lista las ediciones que tienen al menos una coincidencia.

Un issue USA puede pertenecer a varias ediciones españolas. En ese caso se conservan todas y se marca como prioritaria la edición con más páginas; las demás se muestran como alternativas. La primera importación recorre el catálogo completo y es reanudable; las siguientes revisan novedades y pendientes.

Los personajes de las sugerencias semanales y del catálogo histórico están unificados. Cada ficha activa del catálogo puede participar en las sugerencias mediante su categoría exacta de Marvel Fandom; desde **Seguimiento complementario** se pueden ajustar alias o excluir personajes concretos. Los antiguos grupos genéricos “Spider-Verse (all variants)” y “Symbiotes (all variants)” ya no son necesarios.

Para completar subtipos en datos importados antes de esta función:

```bash
npm run repair:appearances
```

## Revisión trimestral

Cada tres meses el servidor inicia una revisión completa de Marvel Fandom para actualizar fechas, precisión de fecha, portadas, guionistas y relaciones. La tarea semanal del sistema también sirve para despertar el servidor cuando la revisión trimestral ya está vencida. El estado y el botón de ejecución manual están en **Recursos y servidor**.

```env
CATALOG_REFRESH_ENABLED=true
CATALOG_REFRESH_INTERVAL_MONTHS=3
```

La fuente usada son las categorias de apariciones de Marvel Database. El catalogo representa issues originales estadounidenses. El campo de coleccion registra que una edicion propia cubre ese issue; no presupone que exista una correspondencia uno-a-uno, porque un tomo de Panini puede recopilar varios issues.

## Notas de funcionamiento

- La base queda en `data/comics.sqlite`.
- Los issues historicos quedan en `spiderman_catalog_issues`; las listas por personaje se guardan en `catalog_characters` y `catalog_character_issues`.
- Los backups locales comprimidos quedan en `data/backups`.
- Los comics aceptados se muestran agrupados por volumen en la UI.
- La primera lista de personajes viene precargada con cobertura amplia para Spider-Man de distintos universos, simbiontes, Black Cat, Knull, Spider-Boy, Mary Jane y Gwen Stacy. Se puede editar desde la UI.
- Si todavía no existe ninguna revisión semanal completada, la primera ejecución toma la semana vigente como punto inicial. A partir de ahí, cada ejecución recupera cualquier semana faltante, incluso al cambiar de año ISO.
- Los títulos que fallen dentro de una semana completada quedan en `weekly_fetch_failures` con su mensaje e intentos; se reintentan automáticamente hasta completar el flujo y entonces se marcan como resueltos.
- La UI no fuerza auto-refresh luego de una corrida. Queda a proposito un boton `Actualizar vista`, como pediste.
- Si Telegram no esta configurado, los casos ambiguos quedan como pendientes en la base, pero no se manda notificacion.
- Los pendientes se pueden aprobar o rechazar directamente desde la pagina. Si Telegram esta configurado, el servidor mantiene encendido el bot Python por polling y refleja tambien las decisiones tomadas desde la web.
- El boton **Recursos y servidor** muestra CPU, RAM, disco, tamano de la base, backups, tiempo activo, operaciones y estado seguro de Telegram.
- Si hay dudas sobre si un numero es material nuevo o una reedicion, el mensaje de Telegram explica la razon concreta de esa duda.
- El proceso intenta mantenerse liviano: no usa dependencias externas, scrapea en serie y solo consulta la pagina del volumen cuando detecta senales de posible reedicion o recopilatorio.
- Aunque Telegram general soporte archivos mucho mas grandes, el Bot API oficial permite enviar documentos nuevos de hasta 50 MB por `sendDocument`, asi que los backups solo se adjuntan si el archivo comprimido entra en ese limite.

## Scripts

```bash
npm test
```

## Acceso HTTP local (0.1.1)

El servidor conserva la escucha en `127.0.0.1`. Acepta un Host `localhost` o
`127.0.0.1` con el puerto de escucha; cuando se envia Origin debe coincidir
exactamente con ese Host, puerto y esquema HTTP. Las solicitudes de otro sitio
se rechazan tambien mediante Fetch Metadata. No habilita CORS.

Cada arranque genera un token aleatorio en memoria. La UI obtiene su sesion local
y autentica las consultas, cambios y exportaciones CSV con `X-Spider-Token`.
Renueva la sesion al reiniciar el servidor. El puente administrado transmite el
token al bot hijo mediante `SPIDER_LOCAL_TOKEN`; no necesita cambiar el bot, la
cuenta o las credenciales de Telegram. No colocar este token en URLs, archivos de
configuracion ni logs. Un cliente propio debe integrarse con este arranque local;
un bot Python lanzado por separado requiere el token del mismo proceso servidor.

Este control protege el acceso HTTP desde sitios ajenos. Un proceso local con
acceso al entorno puede actuar como cliente de confianza; no se pretende aislar
procesos hostiles del mismo usuario. El cuerpo JSON tiene un limite de 64 KiB
reales, incluso con transferencia chunked. Los errores inesperados devuelven un
mensaje generico. Las URLs externas de la UI admiten solo HTTP/HTTPS.

Validaciones adicionales (sin Telegram real ni base habitual):

```bash
npm run test:security
npm run test:python-coverage
npm run test:windows
node tests/baseline-security-repro.js
```

La medicion Python requiere `coverage` en el entorno de desarrollo; el runtime
de la app no incorpora una dependencia nueva. El gate HTTP mide al 100% lineas,
ramas y funciones de `server.js`, `http-security.js` y `local-api.js`; no es una
medicion global de todo el repositorio. El gate Python mide `telegram_bot.py`.
El test Windows compila el candidato en `data/security-review/windows-candidate`
y prueba arboles sinteticos, incluido FormClosing de una ventana oculta.

Para adoptar el cambio, actualizar juntos servidor, UI, ambos archivos del puente
y los controles. En Windows recompilar el panel con
`scripts/build-server-control.ps1` despues de respaldar el ejecutable existente;
el candidato de pruebas no reemplaza `bin/`. Ver evidencia, incidente de la
validacion inicial, limites y rollback en
[el informe del lote](.codex/SECURITY_REVIEW_20261023.md).


## Version actual y validacion (version **0.1.6**)

Panini usa primero HTTP y, cuando requiere JavaScript o responde403, abre una
sesion anonima temporal en Microsoft Edge instalado mediante playwright-core1.64.1.
No descarga navegadores, reutiliza perfiles personales ni desactiva el sandbox.
La sesion se comparte durante una importacion y se cierra al terminar, incluso
si una descarga falla. Una sala de espera o desafio que impida cargar las fichas
sigue siendo una incidencia; no se resuelve ni se elude automaticamente.

Universo Marvel ignora enlaces desactivados en comentarios HTML y retira de su
cola esas referencias antiguas solo cuando no hay un producto importado asociado.
Si se publican posteriormente, se descubren de nuevo. Las descargas transitorias
se reintentan hasta tres veces; un404 real permanece como error, y los errores de
descubrimiento de indices tambien se incluyen en el resumen.

Instalar dependencias de desarrollo con `npm ci` (Node 24.15 o posterior) y
`python -m pip install -r requirements-dev.txt`.

- `npm test`: pruebas deterministas de JavaScript y Python, con SQLite temporal y
  transportes simulados; no requiere Telegram, configuracion o datos habituales.
- `npm run test:coverage`: gate local completo. Exige 100% de cada metrica que
  expone cada motor y rechaza fuentes de produccion sin instrumentar.
- `npm run test:coverage:node`:24 fuentes JS de src/, public/ y scripts/, incluido
  app.js completo bajo JSDOM. Node V8 mide lineas, ramas y funciones; el gate
  inspecciona los contadores LCOV sin redondear y verifica el inventario completo.
- `npm run test:coverage:native`: panel C# y diez scripts PowerShell, mas pruebas
  reales de los seis lanzadores CMD con ejecutables de frontera sinteticos.
- `npm run test:posix`: cobertura de comandos y funciones de los cinco scripts
  Bash con Git Bash, archivos temporales, HOME sintetico y fronteras de SO falsas.
  El caso de conexion TCP rechazada puede tardar mas de un minuto en Windows.
- `npm run test:windows`: integracion real del compilador/WinForms y apagado de
  arboles sinteticos; no reemplaza el panel habitual.
- `npm run test:full`: todas las anteriores, incluida la cobertura completa.

Los reportes son locales en data/coverage/ y no se versionan. Python coverage
mide sentencias/lineas y ramas. Pester 5.7.1 mide comandos ejecutables (no publica
metricas independientes de ramas/funciones). AltCover 9.0.145 instrumenta todo el
fuente C# sin modificarlo: el gate comprueba cada SequencePoint, BranchPoint y
metodo de produccion. La suma resumida de AltCover agrega ramas ficticias a
metodos sin bifurcaciones; se usan sus registros BranchPoint explicitos, sin
alterar el reporte ni excluir instrucciones. Los dobles de framework y el
harness son fuentes de prueba, y se complementan con test:windows sobre WinForms
y procesos reales sinteticos.

CMD no ofrece un motor de cobertura: cada wrapper completo se ejecuta byte por
byte en un directorio con espacios, validando cwd/argumentos y la estructura sin
ramas. AppleScript tampoco ofrece un motor de cobertura utilizable en Windows:
su plantilla conserva una prueba de contrato separada y no recibe un porcentaje
inventado. La compilacion/ejecucion nativa de esa UI requiere macOS y queda como
validacion de plataforma pendiente, sin afectar la medicion de los motores
instrumentables. No se excluye ningun modulo instrumentable de produccion.

La CI por push/PR corre solo los gates rapidos en Windows. La suite completa
POSIX y la integracion nativa adicional se disparan manualmente. No se consulta
ni espera su resultado remoto despues de un push por defecto.
