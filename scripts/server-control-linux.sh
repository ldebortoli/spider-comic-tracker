#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
CONTROL="$SCRIPT_DIR/server-control-posix.sh"

if ! command -v zenity >/dev/null 2>&1; then
  echo "Falta Zenity. Instalá 'zenity' con el gestor de paquetes de tu distribución." >&2
  exit 1
fi

while true; do
  status="$($CONTROL status 2>/dev/null || true)"
  action="$(zenity --list \
    --title="Spider Tracker - Servidor" \
    --text="Estado: $status" \
    --column="Acción" \
    "Encender" "Apagar" "Abrir aplicación" "Actualizar estado" "Cerrar" \
    --height=360 --width=460 2>/dev/null || true)"

  case "$action" in
    "Encender") message="$($CONTROL open 2>&1 || true)"; zenity --info --text="$message" --width=420 ;;
    "Apagar") message="$($CONTROL stop 2>&1 || true)"; zenity --info --text="$message" --width=420 ;;
    "Abrir aplicación") $CONTROL open ;;
    "Actualizar estado") ;;
    *) exit 0 ;;
  esac
done
