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

## D-009 - Los errores semanales por ficha tienen cola persistente

- Estado: vigente; complementa D-006.
- Fecha: 2026-07-15.
- Decision: reintentar hasta tres veces el HTML `action=render` de Marvel Fandom y usar la API `action=parse` como alternativa. Todo error individual se guarda en `weekly_fetch_failures` con semana original, cantidad de intentos y último mensaje. Las revisiones posteriores procesan primero esa cola, preservan la semana original del cómic y marcan la entrada como resuelta al completar todo el flujo.
- Motivo: una corrida semanal puede completarse aunque Cloudflare bloquee fichas aisladas; sin una cola separada, avanzar el corte semanal dejaba esos títulos sin una nueva oportunidad automática.

## D-010 - Encender desde un panel abre la aplicación al quedar disponible

- Estado: vigente.
- Fecha: 2026-07-19.
- Decision: la acción gráfica **Encender** inicia el servidor, mantiene el estado `INICIANDO` hasta que el puerto local responde y recién entonces abre `http://localhost:8787` en el navegador predeterminado. Los arranques no interactivos y programados siguen sin abrir ventanas.
- Motivo: evita mostrar una página de error durante el arranque y no interrumpe al usuario cuando una tarea automática solo necesita despertar el servidor.

## D-011 - Proteccion preventiva de secretos en GitHub

- Estado: vigente.
- Fecha: 2026-08-20.
- Decision: mantener habilitados Secret Scanning y Push Protection en `ldebortoli/spider-comic-tracker`; la preferencia global de Push Protection del usuario no se modifica desde este proyecto.
- Motivo: detectar credenciales conocidas ya publicadas y bloquear futuros pushes que contengan secretos, sin ampliar cambios a otros repositorios.

## D-012 - Validacion local y CI remota solo a pedido

- Estado: vigente. Fecha: 2026-10-23.
- Decision: validar localmente y hacer push cuando corresponda. No esperar, mirar, sondear ni monitorear GitHub Actions u otra CI remota despues del push salvo pedido explicito en la solicitud actual. Un resultado ya disponible puede informarse sin esperarlo.
- Motivo: pedido autentico de USER_QUEUE; sin cambios a workflows, cuentas ni protecciones.

## D-013 - Sesion HTTP local por proceso (candidato 0.1.1)

- Fecha: 2026-10-23. Estado: implementado en candidato; adopcion pendiente del gate registrado.
- Decision: loopback IPv4, Host/Origin exactos y Fetch Metadata; token aleatorio por proceso en header para API, bootstrap del mismo origen para UI y entorno del hijo para bridge. Cuerpo JSON streaming de 64 KiB y errores inesperados genericos. Sin cambios de cuentas, credenciales Telegram o esquema DB.
- Motivo: endurecer control HTTP local conservando integraciones. No es aislamiento de procesos hostiles del mismo usuario. Importar server.js no arranca servicios; pruebas siempre con dependencias/cwd sinteticos.


## D-014 - Apagar 24 horas despues del envio semanal confirmado

- Fecha: 2026-10-23. Estado: implementado y validado localmente en 0.1.2; publicacion bloqueada por el gate global heredado.
- Pedido directo de Lucas: si no existia mecanismo equivalente, comprobar al dia siguiente del envio semanal completo y apagar si seguia encendido. Auditoria real: solo tarea Windows de encendido; ninguna automatizacion Codex coincidente.
- Decision: reutilizar el temporizador interno de un minuto. Mover el resumen agregado al final de los tres pasos; persistir el recibo Telegram (chat/mensaje/confirmacion/vencimiento/corrida), sin secretos. Interpretar dia siguiente como 24 horas desde la confirmacion.
- No armar por warnings, fallos de fichas/catalogos/backups ni acuses incompletos. Diferir mientras cualquiera de las cinco operaciones largas esta activa. Una corrida mas nueva invalida el recibo anterior; uno consumido no apaga un arranque posterior. Un recibo pendiente conserva el plazo si se reinicia antes de consumirse.
- Reutilizar el cierre existente de HTTP, bot y SQLite. Sin tareas AI, nuevos procesos de monitorizacion ni inicio del servidor para apagarlo. No inferir confirmaciones historicas ni enviar mensajes Telegram reales durante la validacion.
