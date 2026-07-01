#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
LAUNCH_AGENTS="$HOME/Library/LaunchAgents"
APP_DIR="$HOME/Applications"
PLIST="$LAUNCH_AGENTS/com.spidertracker.weekly.plist"

command -v node >/dev/null 2>&1 || { echo "Node.js 22 o superior es obligatorio." >&2; exit 1; }
chmod +x "$PROJECT_ROOT/scripts/server-control-posix.sh" "$PROJECT_ROOT/scripts/build-macos-app.sh"
"$PROJECT_ROOT/scripts/build-macos-app.sh"

mkdir -p "$APP_DIR" "$LAUNCH_AGENTS"
rm -rf "$APP_DIR/Spider Tracker Server.app"
cp -R "$PROJECT_ROOT/dist/macos/Spider Tracker Server.app" "$APP_DIR/Spider Tracker Server.app"

schedule_day="WEDNESDAY"
schedule_hour="12"
schedule_minute="0"
schedule_enabled="true"
if [[ -f "$PROJECT_ROOT/.env" ]]; then
  schedule_enabled="$(sed -n 's/^SCHEDULE_ENABLED=//p' "$PROJECT_ROOT/.env" | tail -1)"; schedule_enabled="${schedule_enabled:-true}"
  schedule_day="$(sed -n 's/^SCHEDULE_DAY=//p' "$PROJECT_ROOT/.env" | tail -1)"; schedule_day="${schedule_day:-WEDNESDAY}"
  schedule_hour="$(sed -n 's/^SCHEDULE_HOUR=//p' "$PROJECT_ROOT/.env" | tail -1)"; schedule_hour="${schedule_hour:-12}"
  schedule_minute="$(sed -n 's/^SCHEDULE_MINUTE=//p' "$PROJECT_ROOT/.env" | tail -1)"; schedule_minute="${schedule_minute:-0}"
fi
case "$schedule_day" in
  SUNDAY) weekday="1" ;; MONDAY) weekday="2" ;; TUESDAY) weekday="3" ;; WEDNESDAY) weekday="4" ;;
  THURSDAY) weekday="5" ;; FRIDAY) weekday="6" ;; SATURDAY) weekday="7" ;;
  *) echo "SCHEDULE_DAY no válido: $schedule_day" >&2; exit 1 ;;
esac

escaped_root="$(printf '%s' "$PROJECT_ROOT" | sed 's/[&|]/\\&/g')"
launchctl bootout "gui/$(id -u)" "$PLIST" 2>/dev/null || true
if [[ "$schedule_enabled" == "true" ]]; then
  sed -e "s|__PROJECT_ROOT__|$escaped_root|g" -e "s|__WEEKDAY__|$weekday|g" -e "s|__HOUR__|$schedule_hour|g" -e "s|__MINUTE__|$schedule_minute|g" \
    "$PROJECT_ROOT/packaging/macos/com.spidertracker.weekly.plist.in" > "$PLIST"
  launchctl bootstrap "gui/$(id -u)" "$PLIST"
else
  rm -f "$PLIST"
fi

echo "Aplicación instalada en ~/Applications. Automatización semanal: $schedule_enabled."
