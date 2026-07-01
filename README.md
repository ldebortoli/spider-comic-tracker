# Analizador de comics

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
- Revisa una vez por semana la categoria de Marvel Fandom `Category:Week_##,_YYYY`.
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
- Un bot de Telegram.
- Un chat privado o grupo privado para revisiones. Para mensajes con botones y control por usuario, esto es mas seguro que un canal publico.

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

- `PANEL DEL SERVIDOR.cmd` abre el ejecutable grafico `bin/SpiderTrackerServerControl.exe` para encender, apagar, consultar el estado y abrir la aplicacion.
- `INICIAR SERVIDOR.cmd`
- `APAGAR SERVIDOR.cmd`
- `ESTADO SERVIDOR.cmd`

El servidor se ejecuta oculto desde esta misma carpeta. Su PID se guarda en `data/server.pid` y los registros en `data/server.log` y `data/server-error.log`.
El icono del panel y del acceso directo se guarda en `assets/spider-tracker-icon.ico`.

Los mismos controles estan disponibles desde una terminal con `npm run server:start`, `npm run server:stop` y `npm run server:status`.

La actualización automática semanal ejecuta tres pasos secuenciales: revisa la semana USA actual, busca nuevos cómics en las listas históricas y después revisa novedades y pendientes de Panini. `INSTALAR ACTUALIZACION SEMANAL.cmd` registra la tarea de Windows para que el servidor se inicie a la hora configurada aunque estuviera apagado; `QUITAR ACTUALIZACION SEMANAL.cmd` la elimina.

El horario tambien se puede activar, desactivar o modificar desde **Recursos y servidor**. Telegram no ejecuta el calendario: la tarea del sistema solo despierta el servidor y una marca semanal persistente evita corridas duplicadas.

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

También importa el catálogo Marvel de Panini España. Cada producto se identifica por su URL para no duplicarlo. El servidor abre su ficha, lee **Contiene** y **Páginas**, relaciona los números declarados con el catálogo USA y solo publica en la lista las ediciones que tienen al menos una coincidencia. Los productos que todavía no publican **Contiene** quedan pendientes para la siguiente revisión semanal.

Un issue USA puede pertenecer a varias ediciones españolas. En ese caso se conservan todas y se marca como prioritaria la edición con más páginas; las demás se muestran como alternativas. La primera importación recorre el catálogo completo y es reanudable; las siguientes revisan novedades y pendientes.

La lista editable de **Seguimiento complementario** es la fuente de las sugerencias semanales y sus alias. No es idéntica al catálogo histórico de personajes: este último es mucho más amplio y se obtiene de las categorías de Marvel Fandom.

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
- El flujo actual arranca en la semana vigente y solo revisa la semana actual. El backfill de comics viejos se hara en un proceso separado mas adelante.
- La UI no fuerza auto-refresh luego de una corrida. Queda a proposito un boton `Actualizar vista`, como pediste.
- Si Telegram no esta configurado, los casos ambiguos quedan como pendientes en la base, pero no se manda notificacion.
- Los pendientes se pueden aprobar o rechazar directamente desde la pagina. Si Telegram esta configurado, el bot corre dentro del mismo servidor local y refleja tambien las decisiones tomadas desde la web.
- El boton **Recursos y servidor** muestra CPU, RAM, disco, tamano de la base, backups, tiempo activo, operaciones y estado seguro de Telegram.
- Si hay dudas sobre si un numero es material nuevo o una reedicion, el mensaje de Telegram explica la razon concreta de esa duda.
- El proceso intenta mantenerse liviano: no usa dependencias externas, scrapea en serie y solo consulta la pagina del volumen cuando detecta senales de posible reedicion o recopilatorio.
- Aunque Telegram general soporte archivos mucho mas grandes, el Bot API oficial permite enviar documentos nuevos de hasta 50 MB por `sendDocument`, asi que los backups solo se adjuntan si el archivo comprimido entra en ese limite.

## Scripts

```bash
npm test
```
