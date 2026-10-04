#!/usr/bin/env bash
# Installs the Android SDK pieces the Gradle build needs (idempotent). Usage: tools/setup_android_sdk.sh [sdk-dir]
set -euo pipefail
SDK="${1:-${ANDROID_HOME:-/opt/android-sdk}}"
if [ ! -x "$SDK/cmdline-tools/latest/bin/sdkmanager" ]; then
  mkdir -p "$SDK/cmdline-tools"
  ZIP=$(curl -fsS https://dl.google.com/android/repository/repository2-3.xml | grep -o 'commandlinetools-linux-[0-9]*_latest.zip' | sort -t- -k3 -n | tail -1)
  curl -fsS -o /tmp/android-cmdline-tools.zip "https://dl.google.com/android/repository/$ZIP"
  unzip -q -o /tmp/android-cmdline-tools.zip -d "$SDK/cmdline-tools"
  rm -rf "$SDK/cmdline-tools/latest" && mv "$SDK/cmdline-tools/cmdline-tools" "$SDK/cmdline-tools/latest"
fi
yes | "$SDK/cmdline-tools/latest/bin/sdkmanager" --licenses > /dev/null 2>&1 || true
"$SDK/cmdline-tools/latest/bin/sdkmanager" "platforms;android-35" "build-tools;35.0.0" "platform-tools" > /dev/null
echo "sdk.dir=$SDK" > "$(dirname "$0")/../android/local.properties"
echo "Android SDK ready in $SDK"
