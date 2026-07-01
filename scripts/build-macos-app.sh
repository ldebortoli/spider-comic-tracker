#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
DIST_DIR="$PROJECT_ROOT/dist/macos"
APP_PATH="$DIST_DIR/Spider Tracker Server.app"
SOURCE_TEMPLATE="$PROJECT_ROOT/packaging/macos/SpiderTrackerServer.applescript.in"
GENERATED_SOURCE="$DIST_DIR/SpiderTrackerServer.applescript"

command -v osacompile >/dev/null 2>&1 || { echo "Este build debe ejecutarse en macOS." >&2; exit 1; }

mkdir -p "$DIST_DIR"
escaped_root="$(printf '%s' "$PROJECT_ROOT" | sed 's/[&|]/\\&/g')"
sed "s|__PROJECT_ROOT__|$escaped_root|g" "$SOURCE_TEMPLATE" > "$GENERATED_SOURCE"
rm -rf "$APP_PATH"
osacompile -o "$APP_PATH" "$GENERATED_SOURCE"

ICONSET="$DIST_DIR/SpiderTracker.iconset"
mkdir -p "$ICONSET"
for spec in "16 icon_16x16" "32 icon_16x16@2x" "32 icon_32x32" "64 icon_32x32@2x" "128 icon_128x128" "256 icon_128x128@2x" "256 icon_256x256" "512 icon_256x256@2x" "512 icon_512x512" "1024 icon_512x512@2x"; do
  size="${spec%% *}"
  name="${spec#* }"
  sips -z "$size" "$size" "$PROJECT_ROOT/assets/spider-tracker-icon.png" --out "$ICONSET/$name.png" >/dev/null
done
iconutil -c icns "$ICONSET" -o "$APP_PATH/Contents/Resources/applet.icns"
rm -rf "$ICONSET"

echo "$APP_PATH"
