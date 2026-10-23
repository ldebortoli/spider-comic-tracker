# External command boundaries for the POSIX packaging/lifecycle fixtures.
# This file is sourced by Bash in a temporary project; it never reads user data.
set -T
trap 'printf "%s\0%s\0%s\0" "${BASH_SOURCE[0]}" "$LINENO" "$BASH_COMMAND" >> "$POSIX_TRACE"' DEBUG

fixture_log() { printf '%s\n' "$*" >> "$POSIX_COMMAND_LOG"; }
command() {
  if [[ "${1:-}" == "-v" ]]; then
    case "${2:-}" in
      node) [[ "$POSIX_NODE" == 1 ]] ;;
      zenity) [[ "$POSIX_ZENITY" == 1 ]] ;;
      osacompile) [[ "$POSIX_MACOS" == 1 ]] ;;
      xdg-open) [[ "$POSIX_OPENER" == xdg ]] ;;
      open) [[ "$POSIX_OPENER" == mac ]] ;;
      *) builtin command "$@" ;;
    esac
  else builtin command "$@"; fi
}
kill() {
  fixture_log "kill $*"
  if [[ "${1:-}" == "-0" ]]; then [[ "$(cat "$POSIX_STATE")" == running ]]; return; fi
  if [[ "$POSIX_STOP_FAIL" != 1 ]]; then printf stopped > "$POSIX_STATE"; fi
}
nohup() {
  fixture_log "nohup $*"
  if [[ "$POSIX_START_FAIL" != 1 ]]; then printf running > "$POSIX_STATE"; fi
}
sleep() { /usr/bin/sleep 0.002; }
xdg-open() { fixture_log "xdg-open $*"; }
open() { fixture_log "open $*"; }
systemctl() {
  fixture_log "systemctl $*"
  if [[ "$POSIX_SYSTEMCTL_FAIL" == disable && "$*" == *disable* ]]; then return 1; fi
  [[ "$POSIX_SYSTEMCTL_FAIL" != 1 ]]
}
launchctl() { fixture_log "launchctl $*"; [[ "$POSIX_LAUNCHCTL_FAIL" != 1 ]]; }
zenity() {
  fixture_log "zenity $*"
  if [[ "${1:-}" == --list ]]; then
    local action
    action="$(head -1 "$POSIX_ACTIONS")"
    tail -n +2 "$POSIX_ACTIONS" > "$POSIX_ACTIONS.next"
    mv "$POSIX_ACTIONS.next" "$POSIX_ACTIONS"
    if [[ "$action" == @cancel ]]; then return 1; fi
    if [[ "$action" == @stop-fails ]]; then
      printf fail > "$POSIX_STATE.fail"
      printf '%s\n' Cerrar
    else
      printf '%s\n' "$action"
    fi
  fi
}
osacompile() {
  fixture_log "osacompile $*"
  mkdir -p "$2/Contents/Resources"
}
sips() {
  fixture_log "sips $*"
  printf 'fixture image' > "$6"
}
iconutil() {
  fixture_log "iconutil $*"
  printf 'fixture icon' > "$5"
}
