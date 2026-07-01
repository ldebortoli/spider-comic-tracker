#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
APPLICATIONS_DIR="$HOME/.local/share/applications"
SYSTEMD_DIR="$HOME/.config/systemd/user"

command -v node >/dev/null 2>&1 || { echo "Node.js 22 o superior es obligatorio." >&2; exit 1; }
command -v zenity >/dev/null 2>&1 || { echo "Instalá Zenity antes de continuar." >&2; exit 1; }

mkdir -p "$APPLICATIONS_DIR" "$SYSTEMD_DIR"
chmod +x "$PROJECT_ROOT/scripts/server-control-posix.sh" "$PROJECT_ROOT/scripts/server-control-linux.sh"

schedule_day="WEDNESDAY"
schedule_hour="12"
schedule_minute="00"
schedule_enabled="true"
if [[ -f "$PROJECT_ROOT/.env" ]]; then
  schedule_enabled="$(sed -n 's/^SCHEDULE_ENABLED=//p' "$PROJECT_ROOT/.env" | tail -1)"; schedule_enabled="${schedule_enabled:-true}"
  schedule_day="$(sed -n 's/^SCHEDULE_DAY=//p' "$PROJECT_ROOT/.env" | tail -1)"; schedule_day="${schedule_day:-WEDNESDAY}"
  schedule_hour="$(sed -n 's/^SCHEDULE_HOUR=//p' "$PROJECT_ROOT/.env" | tail -1)"; schedule_hour="${schedule_hour:-12}"
  schedule_minute="$(sed -n 's/^SCHEDULE_MINUTE=//p' "$PROJECT_ROOT/.env" | tail -1)"; schedule_minute="${schedule_minute:-0}"
fi
case "$schedule_day" in
  MONDAY) calendar_day="Mon" ;; TUESDAY) calendar_day="Tue" ;; WEDNESDAY) calendar_day="Wed" ;;
  THURSDAY) calendar_day="Thu" ;; FRIDAY) calendar_day="Fri" ;; SATURDAY) calendar_day="Sat" ;; SUNDAY) calendar_day="Sun" ;;
  *) echo "SCHEDULE_DAY no válido: $schedule_day" >&2; exit 1 ;;
esac
schedule_time="$(printf '%02d:%02d' "$schedule_hour" "$schedule_minute")"

sed "s|__PROJECT_ROOT__|$PROJECT_ROOT|g" \
  "$PROJECT_ROOT/packaging/linux/spider-tracker-server.desktop.in" \
  > "$APPLICATIONS_DIR/spider-tracker-server.desktop"
chmod +x "$APPLICATIONS_DIR/spider-tracker-server.desktop"

if [[ "$schedule_enabled" == "true" ]]; then
  sed "s|__PROJECT_ROOT__|$PROJECT_ROOT|g" \
    "$PROJECT_ROOT/packaging/linux/spider-tracker-weekly.service.in" \
    > "$SYSTEMD_DIR/spider-tracker-weekly.service"
  sed -e "s|__DAY__|$calendar_day|g" -e "s|__TIME__|$schedule_time|g" \
    "$PROJECT_ROOT/packaging/linux/spider-tracker-weekly.timer" \
    > "$SYSTEMD_DIR/spider-tracker-weekly.timer"
  systemctl --user daemon-reload
  systemctl --user enable --now spider-tracker-weekly.timer
else
  systemctl --user disable --now spider-tracker-weekly.timer 2>/dev/null || true
  rm -f "$SYSTEMD_DIR/spider-tracker-weekly.timer" "$SYSTEMD_DIR/spider-tracker-weekly.service"
  systemctl --user daemon-reload
fi

echo "Lanzador gráfico instalado. Automatización semanal: $schedule_enabled."
