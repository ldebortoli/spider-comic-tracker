# TODO

- P2: aclarar el resumen Telegram semanal cuando USA termina sin errores y las fuentes espanolas tienen advertencias: mostrar el motivo y los errores por etapa, sin presentar el contador USA como total del pipeline. Hallazgo del diagnostico 2026-W44; correccion de producto no solicitada en esta consulta.
- [BLOCKED 2026-10-23] Adopcion Linux timer: host desconocido; no desplegar. Cierre nativo Linux/macOS y compilacion AppleScript requieren esos entornos.

# IN PROGRESS

No hay tareas en curso.

# DONE

- [2026-10-28] Diagnosticar el aviso semanal2026-W44 con Errores0: sync20/USA completo34/6/25/3/0 y catalogo12 importados/0 errores; Panini sala de espera y Universo Marvel7 HTTP404/1 timeout. El titulo compara todas las etapas pero el cuerpo solo muestra errores USA; no se armo apagado24h. SQLite solo lectura y aserciones de consistencia aprobadas; npm run test:shutdown9/9 y100% lineas/ramas/funciones en copia sintetica. D-019; mejora de productoP2, sin modificar aplicacion/version/datos, repetir sync o enviar Telegram. Cierre documental en main, sin monitorear CI remota.
- [2026-10-23] DONE: adopcion habitual Windows0.1.4 completada19:53UTC con autorizacion especifica de Lucas para pausar/restaurar solo la tarea semanal. Fuente validada15ca121 y EXE0.1.4.0/45056bytes/SHA9f190824e7a6654ae38bab3ba022257022af7f3d6997ebd89abb03767336d4a0 instalados; tarea Ready/habilitada, XML byte-identico y calendario original. 42archivos protegidos identicos antes/despues, incluso tras reactivar; backups cifrados DPAPI verificados. Primer intento hizo rollback real correcto por lectura JSON del instalador; corregido/reproducido antes de retomar. Sin ejecucion de produccion ni procesos cerrados, sin restaurar datos o cambiar otras tareas. Ver ADOPTION_20261023.md; limites nativos Linux/macOS independientes conservados.

- [2026-10-23] Integrar fuente0.1.4 del bridge y arnes previo a imports sobre8df19a44: fb58117b314aef56a5a8d92c318ef26989ae117c publicado por push normal en main y SHA remoto comprobado. Gate local completo100% y WinForms/arboles sinteticos aprobados desde checkout exportado sin Git/.env; mutacion ESRCH RED1/GREEN0 y privacidad pasan. CI40006945072 SUCCESS para ese SHA (JS/Python/native); POSIX/WinForms remotos opcionales no disparados, ya cubiertos localmente. Adopcion habitual completada posteriormente en la entrada correspondiente; esta fase de pruebas no uso datos reales y todos los USER_QUEUE historicos siguen DONE.
- [2026-10-23] Eliminar carpeta temporal 8.3 retenida, con autorizacion explicita posterior de Lucas: identidad exacta y unico fixture.txt sintetico verificados; borrado del marcador y directorio vacio sin recursion. Ausencia de carpeta confirmada; hashes de archivos reales y XML de tarea semanal sin diferencias antes/despues. Solo limpieza local y memoria, sin cambios de aplicacion/version ni nuevas pruebas/CI necesarias.
- [2026-10-23] Corregir prueba de rutas CMD y verificar CI: bd5b174 compara directorios resueltos y 544ef36 espera de forma acotada la liberacion de la fixture. Reproducciones TEMP8.3/cwd retenido y rechazo de cwd distinto, gate local completo100% y gate nativo final aprobados; ambos commits publicados por push normal en main. CI39983176683 SUCCESS confirmado para 544ef36 (JS/Python/C#/PowerShell100%, seis CMD). Sin cambios de producto, version0.1.3, apagado programado o datos reales. Cierre documental posterior no dispara CI por su filtro de rutas.
- [2026-10-23] Resolver cobertura global y publicar 0.1.3 en main: commit f762daa, push y SHA remoto verificados. Todos los motores instrumentables al 100%: 23 JS, Python, C#, diez PowerShell y cinco Bash; gates estrictos, checkout limpio LF/core.autocrlf=true y WinForms/arboles sinteticos aprobados. CMD completo y contrato AppleScript separados sin porcentajes inventados; prueba nativa macOS pendiente por entorno. CI rapida por push/PR, suites largas manuales; CI remota no monitoreada.
- [2026-10-23] Completar publicacion del apagado semanal 0.1.2 (9229136) junto con 0.1.1/0.1.3 en main: recibo Telegram final, comprobacion cada minuto y apagado 24 h despues; preserva el scheduler si falla detener Telegram. Solo temporizador interno, ninguna automatizacion AI/tarea Windows duplicada. Sin envios ni DB reales durante validacion.
- [2026-10-23] Implementar candidato HTTP local 0.1.1 con Host/Origin/token, limite streaming, errores/URL seguros, UI/CSV y bridge adaptados, cierre de arbol Windows y fuentes POSIX. Suite local y gates HTTP/Python pasan; limites e incidente inicial registrados en SECURITY_REVIEW_20261023.md. Integrado/publicado en main junto con el cierre del gate amplio en 0.1.3.

- [2026-10-23] Incorporar la politica CI de USER_QUEUE a D-012: validacion local, push cuando corresponda, ninguna consulta de CI remota salvo pedido actual.
- [2026-10-23] Reconciliar privacidad GitHub con DONE del 2026-08-20 sin repetir ajustes. Consulta solo lectura: PUBLIC, Secret Scanning/Push Protection enabled; correo Git local noreply. Sin cambios de identidad, remotos, cuentas o protecciones. Los cuatro pedidos historicos de enemigos siguen DONE.

- [2026-08-20] Habilitar Secret Scanning y Push Protection en `ldebortoli/spider-comic-tracker` e integrar la auditoria de publicacion en `main`; la configuracion global de la cuenta no fue modificada.
- [2026-08-20] Verificar que el repositorio ya es publico y auditar los 32 commits y los 72 archivos de `HEAD`: sin secretos ni archivos sensibles versionados; `.env` y `data/` permanecen locales e ignorados. Retirar del contexto actual la ruta absoluta con el usuario de Windows.
- [2026-07-19] Hacer que **Encender** en los paneles gráficos de Windows, Linux y macOS inicie el servidor, espere a que la aplicación esté disponible y la abra automáticamente, sin modificar los arranques programados.
- [2026-07-15] Robustecer la revisión semanal de Marvel Fandom ante desafíos intermitentes de Cloudflare: reintentar `action=render`, usar `action=parse` como alternativa, conservar el mensaje de error por ficha y reintentar títulos fallidos aunque la semana avance como completada.
- [2026-07-11] Permitir ordenar el selector de enemigos por cantidad de apariciones o alfabeticamente.
- [2026-07-11] Corregir la discrepancia por la que un enemigo con 100+ apariciones podia filtrar solo una variante textual y, por lo tanto, muy pocos comics.
- [2026-07-11] Limpiar comillas exteriores redundantes en nombres de enemigos sin dañar nombres compuestos como `Green Goblin ("Norman Osborn")`.
- [2026-07-11] Reemplazar la carga masiva del dropdown de enemigos por un selector paginado de 50 elementos con prioridad 100+, luego 10+ y carga incremental al hacer scroll.

- [2026-07-11] Hacer que la revision semanal recupere secuencialmente todas las semanas faltantes desde la ultima completada, incluso entre años ISO y sin duplicar comics.
- [2026-07-11] Optimizar la carga del dropdown de enemigos con agregacion SQL, orden alfabetico reutilizable, cache temporal y recargas solo al cambiar personaje o universo.
- [2026-07-11] Cambiar la agrupacion de enemigos de 100+ a 10+ apariciones.
- [2026-07-11] Reemplazar filtro de enemigo libre por dropdown agrupado, backfillear enemigos por issue y mantener descubrimiento futuro basado solo en personajes seguidos.
- [2026-07-11] Completar y validar CONTEXT.md con arquitectura, comandos y convenciones del proyecto.
- [2026-07-11] Hacer que cerrar el panel de Spider Tracker apague el servidor administrado y cancele el cierre si el apagado falla.
- [2026-07-10] Garantizar una sola ventana del panel Spider Tracker con un mutex compartido entre el ejecutable C# y el script PowerShell.
- [2026-07-10] Inicializar la memoria persistente del proyecto.
