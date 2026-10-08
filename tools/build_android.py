#!/usr/bin/env python3
"""Build EA888 LAB for Android with the Gradle project in android/ (replaces the legacy tools/build_apk.py).

  python3 tools/build_android.py            release APK + AAB, signed with the permanent key
  python3 tools/build_android.py --local-signing  use the existing ~/keys release key and metadata
  python3 tools/build_android.py --debug    debug APK (package suffix .dev, debug key; installs next to release)

Signing comes from the environment (never from the repository):
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


def signing_env(local_signing: bool = False) -> tuple[dict, Path | None]:
    env = dict(os.environ)
    temp = None
    if local_signing:
        key_dir = Path.home() / 'keys'
        metadata = key_dir / 'ea888-lab-release-key.txt'
        try:
            text = metadata.read_text(encoding='utf-8')
        except OSError:
            sys.exit(f'Cannot read existing signing metadata: {metadata}')
        values = {}
        for field in ('Alias', 'Wachtwoord'):
            match = re.search(r'^' + field + r'[ \t]*:[ \t]*([^\r\n]+)$', text, re.M)
            if not match or not match[1].strip():
                sys.exit(f'Signing metadata is missing field: {field}')
            values[field] = match[1].strip()
        # Explicit local mode replaces stale exports from a previous terminal attempt.
        # Passwords only enter the child environment; never print or pass them as arguments.
        env.pop('EA888_KEYSTORE_B64', None)
        env.update(EA888_KEYSTORE=str(key_dir / 'ea888-lab-release.jks'),
                   EA888_KEY_ALIAS=values['Alias'], EA888_KEY_PASSWORD=values['Wachtwoord'],
                   EA888_STORE_PASSWORD=values['Wachtwoord'])
    if not env.get('EA888_KEYSTORE') and env.get('EA888_KEYSTORE_B64'):
        fd, name = tempfile.mkstemp(prefix='ea888-', suffix='.keystore')
        with os.fdopen(fd, 'wb') as f:
            f.write(base64.b64decode(re.sub(r'\s+', '', env['EA888_KEYSTORE_B64'])))
        os.chmod(name, 0o600)
        temp = Path(name)
        env['EA888_KEYSTORE'] = name
    return env, temp


def validate_release_signing(env: dict) -> None:
    missing = [key for key in ('EA888_KEYSTORE', 'EA888_KEY_ALIAS', 'EA888_KEY_PASSWORD') if not env.get(key)]
    if missing:
        sys.exit('Release signing is missing: ' + ', '.join(missing) +
                 '. Use --local-signing for the existing ~/keys files.')
    keystore = Path(env['EA888_KEYSTORE']).expanduser()
    if not keystore.is_file():
        sys.exit(f'Release keystore not found: {keystore}. Check the complete path, including release.jks.')
    env['EA888_KEYSTORE'] = str(keystore.resolve())


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('--debug', action='store_true')
    ap.add_argument('--local-signing', action='store_true', help='Read the existing ~/keys release keystore and metadata; no password prompt')
    ap.add_argument('--skip-web', action='store_true', help='Package the already tested build/web of this version')
    args = ap.parse_args()
    if args.debug and args.local_signing:
        ap.error('--local-signing is for release builds; omit --debug')
    version = json.loads((ROOT / 'version.json').read_text())
    sdk = sdk_root()

    env, temp_key = signing_env(args.local_signing)
    env['ANDROID_HOME'] = str(sdk)
    tasks = ['assembleDebug'] if args.debug else ['assembleRelease', 'bundleRelease']
    try:
        if not args.debug:
            validate_release_signing(env)
        if args.skip_web:
            built = ROOT / 'build/web/app.js'
            if not built.exists() or f"const APP_VERSION = '{version['versionName']}';" not in built.read_text():
                sys.exit('build/web is missing or does not match version.json')
        else:
            subprocess.run([sys.executable, str(ROOT / 'tools' / 'build_web.py')], check=True)
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
