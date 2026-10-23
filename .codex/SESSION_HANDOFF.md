# Seguimiento 2026-10-23 ART - prueba de rutas CMD y CI

## Trabajo autorizado actual

- IN PROGRESS: comparacion de rutas corregida en bd5b174, push normal verificado. CI39982102869 paso todos los motores al100% pero fallo al limpiar la fixture CMD con EPERM. Retener cwd con un proceso sintetico por2s reproduce el fallo; limpieza asincrona con reintentos acotados ya pasa esa reproduccion. Revalidar gate nativo, push normal y comprobar CI del ajuste. Autorizacion explicita de Lucas; no modificar apagado programado ni datos reales.
- CI anterior 39974350191 fallo unicamente en tests/native/wrappers.test.js: compara literalmente TEMP con alias 8.3 frente al cwd expandido de .NET. JS/Python/C#/PowerShell ya pasaron al 100% en ese run. Normalizar identidad de ambos directorios sin debilitar el contrato.
- Sin cambios de aplicacion previstos: version 0.1.3 se conserva para una entrega de pruebas/memoria.
- `npm run test:coverage` completo pasa: JS11566/11566 lineas,3686/3686 ramas,803/803 funciones; Python146 sentencias/34 ramas; C#244 lineas/214 secuencias/38 ramas explicitas/19 metodos; PowerShell489 comandos; Bash266 comandos/6 funciones, todos100%. Se mantienen los contratos CMD y la limitacion AppleScript ya documentada.
- Prueba CMD con TEMP/TMP 8.3 falla antes de la correccion y pasa despues para los seis wrappers. Inyeccion de cwd incorrecto sigue fallando como corresponde. Archivos reales y XML de la tarea semanal coinciden con el snapshot anterior. Sin cambios de fuentes productivos, dependencias, version o workflow.
- Limpieza auxiliar: revision automatica rechazo eliminar la carpeta temporal 8.3 de reproduccion con `blocked by policy`; se conserva intacta, sin reintentar ni afectar la entrega. Su ruta local esta en la evidencia de la sesion; solo contiene fixture.txt sintetico.

# Entrega anterior 2026-10-23 ART - cobertura 0.1.3 publicada

## Estado para retomar

- Rama actual/primaria main. Version package/lock/README0.1.3. Codigo publicado en origin/main: f762daad68350b1cd0d38b78d85e645b8a9be28a, SHA remoto verificado. Incluye los anteriores commits locales 0d5d112,04210b3 y9229136. Sin reescribir historial. Sigue un commit documental de cierre de esta entrega.
- Pedido directo resuelto: cobertura100% de todos los motores instrumentables y publicacion. Sin tareas de cola pendientes; todas las USER_QUEUE procesadas tienen DONE.
- Metricas: JS23archivos,11566/11566 lineas,3686/3686 ramas,803/803 funciones; Python146 sentencias/34 ramas; C#244 lineas/214 secuencias/38 ramas explicitas/19 metodos; PowerShell489 comandos; Bash266 comandos/6 funciones. Todos100%. Alcance/gates/excepciones exactas: COVERAGE_20261023.md y D-015.
- Seis CMD ejecutados completos y AppleScript contrato estatico. No porcentaje ficticio en esos lenguajes; la compilacion/UI AppleScript nativa requiere macOS. El host de adopcion del timer Linux sigue desconocido. Bloqueos de plataforma independientes registrados en BACKLOG; no bloquean codigo instrumentable ya validado.
- Autoshutdown: resumen Telegram al terminar USA/catalogo/fuentes espanolas, recibo persistente y chequeo interno cada minuto; apaga servidor/bot a las24h si no hay operaciones activas. Un error al detener el bot conserva el scheduler para el proximo intento. No nuevas automatizaciones AI ni tareas Windows.

## Validacion y seguridad

- Gate completo `npm run test:coverage` y `test:windows` pasan en checkout limpio del indice con core.autocrlf=true y .gitattributesLF. Nueva correccion del scheduler reprobo primero y paso despues; se revalidaron HTTP y JScompleto desde la copia limpia. Fuentes/metricas de los demas motores no cambiaron.
- Copia limpia detecto autoload Get-FileHash en el harness: reemplazado por SHA256 de .NET y vuelto a validar. No rebajar umbrales ni usar hash inventado.
- Revision independiente sin hallazgos accionables. No se tocaron DB/.env/Telegram habituales; fixtures sinteticos, recibos y logs ignorados en data/. Sin listener8787 o fixtures administradas restantes al cerrar.
- GitHub PUBLIC, Secret Scanning/Push Protection enabled, autor Git noreply local confirmado. No ajustes de cuenta/remotos/protecciones. CI por push/PR solo rapida; POSIX lento e integracion extra manual con workflow_dispatch/full. Ninguna consulta o espera de CI remota tras el push.
- Sin nueva UI ni uso de la captura Windows incompatible. Fuente de controles validada, bin/ habitual no reemplazado; no despliegues ni servicios pagos.

## Riesgo previo conservado

- La entrega anterior 0.1.1 importo inicialmente un baseline con arranque automatico: abrio DB habitual y tuvo WAL/bot el 2026-10-23 01:50UTC. No se puede certificar ausencia de sync/intentos de notificacion de esa entrega anterior. Import corregido sin efectos; esta entrega usa exclusivamente dependencias/DB/cwd sinteticos. Evidencia y rollback: SECURITY_REVIEW_20261023.md.

## Proximos pasos

- No queda trabajo ejecutable de la solicitud ni de USER_QUEUE. Una prueba nativa Linux/macOS requiere su entorno/host; no gastar llamadas a mecanismos Windows conocidos incompatibles ni esperar CI por iniciativa propia.
