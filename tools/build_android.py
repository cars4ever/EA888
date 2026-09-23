#!/usr/bin/env python3
"""Build EA888 LAB for Android with the Gradle project in android/ (replaces the legacy tools/build_apk.py).

  python3 tools/build_android.py            release APK + AAB, signed with the permanent key
  python3 tools/build_android.py --debug    debug APK (package suffix .dev, debug key; installs next to release)

Signing comes only from the environment (never from the repository):
  EA888_KEYSTORE        path to the release keystore, or
  EA888_KEYSTORE_B64    the keystore as base64 (for cloud environments; decoded to a private temp file)
  EA888_KEY_ALIAS       key alias
  EA888_KEY_PASSWORD    key (and keystore) password
  EA888_STORE_PASSWORD  keystore password, if different
Outputs go to dist/: EA888-Lab-<version>.apk / .aab, and the signing certificate SHA-256 is printed so every
release can be checked against the same key.
"""
from __future__ import annotations

import argparse
import base64
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ANDROID = ROOT / 'android'
DIST = ROOT / 'dist'


def sdk_root() -> Path:
    for key in ('ANDROID_HOME', 'ANDROID_SDK_ROOT'):
        if os.environ.get(key):
            return Path(os.environ[key])
    local = ANDROID / 'local.properties'
    if local.exists():
        m = re.search(r'^sdk\.dir=(.+)$', local.read_text(), re.M)
        if m:
            return Path(m.group(1).strip())
    for guess in (Path('/opt/android-sdk'), Path.home() / 'Android' / 'Sdk'):
        if guess.exists():
            return guess
    sys.exit('Android SDK not found: set ANDROID_HOME')


def build_tool(sdk: Path, name: str) -> str:
    versions = sorted((sdk / 'build-tools').iterdir(), key=lambda p: [int(x) for x in re.findall(r'\d+', p.name)])
    return str(versions[-1] / name)


def signing_env() -> tuple[dict, Path | None]:
    env = dict(os.environ)
    temp = None
    if not env.get('EA888_KEYSTORE') and env.get('EA888_KEYSTORE_B64'):
        fd, name = tempfile.mkstemp(prefix='ea888-', suffix='.keystore')
        with os.fdopen(fd, 'wb') as f:
            f.write(base64.b64decode(re.sub(r'\s+', '', env['EA888_KEYSTORE_B64'])))
        os.chmod(name, 0o600)
        temp = Path(name)
        env['EA888_KEYSTORE'] = name
    return env, temp


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('--debug', action='store_true')
    args = ap.parse_args()
    version = json.loads((ROOT / 'version.json').read_text())
    sdk = sdk_root()

    subprocess.run([sys.executable, str(ROOT / 'tools' / 'build_web.py')], check=True)
    env, temp_key = signing_env()
    env['ANDROID_HOME'] = str(sdk)
    if not args.debug and not (env.get('EA888_KEYSTORE') and env.get('EA888_KEY_PASSWORD')):
        sys.exit('Release signing needs EA888_KEYSTORE (or EA888_KEYSTORE_B64), EA888_KEY_ALIAS and EA888_KEY_PASSWORD.')
    tasks = ['assembleDebug'] if args.debug else ['assembleRelease', 'bundleRelease']
    try:
        subprocess.run([str(ANDROID / 'gradlew'), '--no-daemon', '-q', *tasks], cwd=ANDROID, env=env, check=True)
    finally:
        if temp_key:
            temp_key.unlink(missing_ok=True)

    DIST.mkdir(exist_ok=True)
    name = f"EA888-Lab-{version['versionName']}{'-dev' if args.debug else ''}"
    outputs = ANDROID / 'app' / 'build' / 'outputs'
    apk_src = outputs / 'apk' / ('debug/app-debug.apk' if args.debug else 'release/app-release.apk')
    apk = DIST / f'{name}.apk'
    shutil.copy2(apk_src, apk)
    made = [apk]
    if not args.debug:
        aab = DIST / f'{name}.aab'
        shutil.copy2(outputs / 'bundle' / 'release' / 'app-release.aab', aab)
        made.append(aab)

    verify = subprocess.run([build_tool(sdk, 'apksigner'), 'verify', '--verbose', '--print-certs', str(apk)],
                            capture_output=True, text=True, check=True).stdout
    schemes = [l.split(':')[0].replace('Verified using ', '') for l in verify.splitlines() if l.startswith('Verified using') and l.endswith('true')]
    cert = re.search(r'certificate SHA-256 digest: ([0-9a-f]+)', verify)
    badging = subprocess.run([build_tool(sdk, 'aapt2'), 'dump', 'badging', str(apk)], capture_output=True, text=True, check=True).stdout
    pkg = re.search(r"package: name='([^']+)' versionCode='(\d+)' versionName='([^']+)'", badging)
    target = re.search(r"targetSdkVersion:'(\d+)'", badging)
    for path in made:
        print(f'{path.relative_to(ROOT)}  {path.stat().st_size / 1e6:.2f} MB')
    print(f'package {pkg.group(1)} {pkg.group(3)} ({pkg.group(2)}), targetSdk {target.group(1)}')
    print('signature schemes: ' + ', '.join(schemes))
    print(f'signing certificate SHA-256: {cert.group(1) if cert else "?"}')


if __name__ == '__main__':
    main()
