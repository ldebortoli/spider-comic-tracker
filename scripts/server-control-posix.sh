#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
DATA_DIR="$PROJECT_ROOT/data"
PID_FILE="$DATA_DIR/server.pid"
URL="http://localhost:8787"

server_pid() {
  if [[ -f "$PID_FILE" ]]; then
    local pid
    pid="$(tr -d '[:space:]' < "$PID_FILE")"
    if [[ "$pid" =~ ^[0-9]+$ ]] && kill -0 "$pid" 2>/dev/null; then
      printf '%s' "$pid"
      return 0
    fi
  fi
  return 1
}

start_server() {
  local pid
  if pid="$(server_pid)"; then
    echo "El servidor ya está encendido (PID $pid)."
    return 0
  fi

  mkdir -p "$DATA_DIR"
  (
    cd "$PROJECT_ROOT"
    nohup node src/server.js </dev/null >"$DATA_DIR/server.log" 2>"$DATA_DIR/server-error.log" &
    echo $! >"$PID_FILE"
  )
  sleep 1
  if pid="$(server_pid)"; then
    echo "Servidor encendido (PID $pid)."
  else
    echo "El servidor no pudo iniciar. Revisá data/server-error.log." >&2
    return 1
  fi
}

stop_server() {
  local pid
  if pid="$(server_pid)"; then
    kill "$pid"
    rm -f "$PID_FILE"
    echo "Servidor apagado."
  else
    rm -f "$PID_FILE"
    echo "El servidor ya está apagado."
  fi
}

status_server() {
  local pid
  if pid="$(server_pid)"; then
    echo "ENCENDIDO (PID $pid) - $URL"
  else
    echo "APAGADO"
    return 1
  fi
}

open_application() {
  start_server
  if command -v xdg-open >/dev/null 2>&1; then
    xdg-open "$URL" >/dev/null 2>&1 &
  elif command -v open >/dev/null 2>&1; then
    open "$URL"
  else
    echo "$URL"
  fi
}

case "${1:-status}" in
  start|--start) start_server ;;
  stop|--stop) stop_server ;;
  status|--status) status_server ;;
  open|--open) open_application ;;
  *) echo "Uso: $0 {start|stop|status|open}" >&2; exit 2 ;;
esac
