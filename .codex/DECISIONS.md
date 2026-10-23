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


## D-015 - Cobertura de todo el codigo instrumentable y contratos de lanzadores

- Fecha: 2026-10-23. Pedido directo: resolver el bloqueo global sin rebajar el 100% y publicar en GitHub.
- Decision: Node V8 + inventario/LCOV exacto para los 23 archivos JS completos de src/public/scripts; coverage.py para Python; Pester 5.7.1 para los diez scripts PowerShell; AltCover 9.0.145 para cada punto/metodo del fuente C# completo; DEBUG de Bash con inventario estatico de comandos y hashes para los cinco .sh.
- Toda metrica expuesta debe tener todos los contadores cubiertos; se rechazan archivos ausentes y redondeo engañoso. No excluir codigo alcanzable que esos motores puedan instrumentar. Los dobles solo sustituyen fronteras externas, sin reescribir ni recortar los fuentes medidos.
- Excepciones tecnicas explicitas de instrumentacion: CMD carece de motor de cobertura y tiene seis wrappers sin ramas, ejecutados completos byte por byte con verificacion estructural/cwd/argumentos. AppleScript no tiene runtime/compilador ni motor de cobertura utilizable en este Windows: contrato estatico separado, porcentaje null, compilacion/UI nativa macOS pendiente. No atribuir cobertura ejecutable a esa plantilla ni a una frontera simulada de osacompile.
- C# se decide con los registros OpenCover SequencePoint/BranchPoint/Method reales. AltCover suma ramas ficticias a metodos sin bifurcaciones en sus porcentajes resumidos; no se borra ni modifica el reporte para elevarlo. Integracion real de WinForms/procesos sinteticos sigue separada.
- Solo se retiraron guardas privadas demostrablemente imposibles segun sus llamadores: HTML sin lineas vacias, resultados de agregacion SQL siempre presentes, arrays internos garantizados y partes Intl requeridas. Adicionalmente se corrigieron tres fallos reproducidos: campos wiki vacios absorbían el siguiente campo, cierre PowerShell usaba ErrorRecord.Cancel y Linux no citaba rutas con espacios.
- CI Windows rapida por push/PR con cache/timeout/concurrency; POSIX lento e integracion real adicional solo manual. Validar local y subir sin esperar CI. No servicios nuevos ni pagos.

- Seguimiento D-015 en la misma entrega: una regresion adicional demostro que el cierre HTTP cancelaba el scheduler antes de detener Telegram. Si fallaba esa detencion no quedaba proximo intento. Se mueve la cancelacion del intervalo despues del stop exitoso; prueba con reloj simulado verifica que sigue activo tras fallo y se cancela tras exito. Umbrales HTTP100% conservados.
- La copia limpia encontro una dependencia del autoload Get-FileHash del harness. El calculo de hashes ahora usa SHA256 de .NET, tanto en bootstrap como en verificacion de fuentes, sin depender de modulos o scopes de Pester.

- Cierre verificado de D-015: integrado por fast-forward y publicado en origin/main como f762daa el 2026-10-23. Se completaron checkout limpio con core.autocrlf=true/LF, gate local completo y WinForms/procesos reales sinteticos. Tras la correccion final del scheduler, gate HTTP y todo JS volvieron a pasar al 100% desde la copia limpia. Sin modificar protecciones ni observar CI remota.

## D-016 - Identidad de directorios Windows en el contrato CMD

- Fecha: 2026-10-23. Lucas autoriza corregir la prueba, ejecutar validaciones, commit/push normal a main y verificar CI esta vez. Conservar apagado programado y datos reales.
- Causa reproducida del run 39974350191: TEMP puede usar un alias 8.3 y Directory.GetCurrentDirectory expandirlo. La igualdad literal de cwd y raiz falla aunque designen el mismo directorio.
- Decision: comparar fs.realpathSync.native en ambos lados de la asercion existente. Conserva igualdad exacta de la identidad resuelta; no quitar el chequeo de cwd, ni relajar argumentos, inventario o bytes de los seis lanzadores.
- Reproduccion local con TEMP/TMP 8.3: prueba original falla; misma prueba corregida pasa. Solo pruebas/memoria, sin incremento de version de aplicacion (continua 0.1.3), cambios de scheduler, tareas, datos o dependencias.
- Validacion previa al push: gate local completo al100% y seis wrappers aprobados; inyectar un cwd distinto conserva el fallo esperado. Snapshot de once archivos locales reales y XML de la tarea semanal sin diferencias; protecciones GitHub habilitadas y autor noreply verificados. CI remoto pendiente de verificar tras publicar.
- Seguimiento: bd5b174 resuelve la identidad de rutas. CI39982102869 paso JS/Python/C#/PowerShell al100% y revelo EPERM al eliminar la fixture del panel asincrono. Un proceso Node sintetico que retiene ese cwd por2s reproduce el mismo error de limpieza; demorar solo la salida de .NET no lo reprodujo en el escritorio local.
- Decision complementaria: limpieza asincrona fs.promises.rm con maxRetries10/retryDelay100ms. Reintentos acotados solo para liberar la fixture propia; no capturar ni ignorar fallos persistentes. No cambiar lanzadores/producto ni agregar esperas a su flujo real.
- La reproduccion con cwd retenido falla antes del ajuste de limpieza y pasa despues; TEMP8.3 y gate nativo completo vuelven a pasar (C#/PowerShell100% y seis CMD). El resto del fuente y suites no cambio desde el gate local completo aprobado; se conserva esa evidencia sin repetir el POSIX lento innecesariamente.
- Cierre: bd5b174 y544ef36 publicados por push normal, SHA de main verificado. CI39983176683 completado SUCCESS para 544ef3654b203480e185b5367427fe9e766ff077: todos los gates rapidos aprobados, suites opcionales lentas sin disparar. Consulta/espera de CI autorizada solo para esta solicitud; la politica D-012 sigue vigente. Resultado: https://github.com/ldebortoli/spider-comic-tracker/actions/runs/39983176683.
- Seguimiento de limpieza: Lucas autoriza expresamente borrar la carpeta temporal previamente bloqueada. Se exige identidad exacta, ausencia de reparse points y un unico fixture.txt con contenido sintetico conocido; se borra el marcador y el directorio vacio sin recursion. Verificada su ausencia y la igualdad antes/despues de hashes de datos reales y XML de tarea semanal. Sin ampliar limpieza, tocar configuracion/apagado/datos, incrementar version o repetir suites/CI por un cierre solo local/documental.

## D-017 - Contencion previa a imports y cierre forzado reintentable

- Fecha: 2026-10-23. Continuacion autorizada de auditoria, merge de correcciones y push normal. Base local/remota 8df19a44 limpia, propietario anterior terminal; conservar sus cambios de apagado, POSIX, rutas8.3 y cleanup EPERM.
- Decision: todas las entradas npm de prueba exportan solo codigo/dependencias antes de cargar aplicacion. Preload JS y guard Python fuerzan configuracion sintetica; bloquean efectos de importacion, accesos a rutas reales, conexiones externas, procesos y SQLite de aplicacion. Fixtures y herramientas nativas existentes conservan sus contratos; no sustituye un sandbox del SO frente a codigo hostil.
- Bridge: capturar el error del timer forzado dentro de su promesa. Tolerar ESRCH; rechazar otros errores sin perder this.process, permitiendo reintento. La regresion debe fallar contra la implementacion anterior y pasar contra la corregida.
- Publicar fuente desde copia temporal sin modificar la instalacion activa. Adopcion del arbol operativo y sustitucion atomica del EXE requieren exclusion vigente verificable. No eludir la inspeccion Scheduler anteriormente denegada, ni cerrar procesos ajenos, iniciar servicios, abrir/copiar DB/config reales o reactivar disparadores para probar.
- El incidente anterior conserva efectos externos indeterminables. No restaurar ni reparar datos. Retener evidencia, backups y temporales propios identificados para posible limpieza recuperable posterior; no borrarlos en esta entrega.
