# Construccion e instalacion

Spider Tracker usa el mismo servidor Node.js y la misma interfaz web en Windows, Linux y macOS. Solo cambia el panel que enciende y apaga el servidor. En los tres sistemas, **Encender** desde el panel espera a que la aplicación esté disponible y la abre en el navegador.

## Requisitos comunes

- Node.js 22 o superior.
- Git.
- Ejecutar `npm test` despues de clonar.
- Copiar `.env.example` a `.env` si se va a usar Telegram.

La base SQLite y las marcas personales se guardan en `data/comics.sqlite`. Esa carpeta no debe subirse a un repositorio publico.

## Windows 10/11

```powershell
npm test
powershell -ExecutionPolicy Bypass -File scripts/build-spider-icon.ps1
powershell -ExecutionPolicy Bypass -File scripts/build-server-control.ps1
```

Abrir `PANEL DEL SERVIDOR.cmd`. El boton **Encender** inicia el servidor y abre la aplicacion en el navegador cuando ya esta disponible. Para registrar la ejecucion semanal, abrir `INSTALAR ACTUALIZACION SEMANAL.cmd`.

## Linux

Se requiere Zenity y systemd de usuario. En Debian/Ubuntu:

```bash
sudo apt install nodejs npm zenity
chmod +x scripts/*.sh
./scripts/install-linux.sh
```

El instalador crea `Spider Tracker - Servidor` en el menu de aplicaciones y habilita `spider-tracker-weekly.timer`. Sin instalar, se puede usar:

```bash
./scripts/server-control-posix.sh start
./scripts/server-control-posix.sh open
./scripts/server-control-posix.sh stop
```

Si se cambia el dia u horario desde la interfaz web, volver a ejecutar `./scripts/install-linux.sh` para actualizar tambien el temporizador de systemd.

## macOS

Instalar Node.js 22 o superior, por ejemplo con Homebrew, y ejecutar:

```bash
chmod +x scripts/*.sh
./scripts/install-macos.sh
```

El instalador compila `Spider Tracker Server.app`, la copia a `~/Applications` y registra `com.spidertracker.weekly` como LaunchAgent. La aplicacion no se firma; en la primera apertura puede ser necesario usar clic derecho, **Abrir**.

Si se cambia el dia u horario desde la interfaz web, volver a ejecutar `./scripts/install-macos.sh` para actualizar tambien el LaunchAgent.

## Servidor sin panel grafico

En cualquier sistema:

```bash
npm start
```

Luego abrir `http://localhost:8787`.
