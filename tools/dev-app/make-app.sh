#!/bin/bash
# Builds tools/dev-app and assembles dist/Terrainist Dev.app (ad-hoc signed).
# Requires only Swift from CommandLineTools — no Xcode, no xcodebuild.
set -euo pipefail

cd "$(dirname "$0")"
APP="dist/Terrainist Dev.app"

swift build -c release

rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS"

BIN="$(swift build -c release --show-bin-path)/TerrainistDev"
cp "$BIN" "$APP/Contents/MacOS/TerrainistDev"

cat > "$APP/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key><string>Terrainist Dev</string>
  <key>CFBundleDisplayName</key><string>Terrainist Dev</string>
  <key>CFBundleIdentifier</key><string>com.terrainist.dev</string>
  <key>CFBundleExecutable</key><string>TerrainistDev</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>0.1</string>
  <key>CFBundleVersion</key><string>1</string>
  <key>LSMinimumSystemVersion</key><string>14.0</string>
  <key>NSHighResolutionCapable</key><true/>
</dict>
</plist>
PLIST

codesign --force -s - "$APP"
echo "built: $(pwd)/$APP"
