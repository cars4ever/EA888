#!/usr/bin/env python3
"""Build and v1-sign the offline EA888 Lab v1.3.1 Android APK.

No Android SDK is required. The builder patches the binary manifest/resource
table, installs a real Scirocco launcher icon, generates a tiny WebView DEX,
and packages the simulator under android_asset.
"""
from __future__ import annotations

import argparse
import hashlib
import shutil
import struct
import subprocess
import sys
import os
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT / 'base'
DIST = ROOT / 'dist'
ASSETS = ROOT / 'src' / 'assets'
TOOLS = ROOT / 'tools'
ICON = ROOT / 'res' / 'mipmap' / 'app_icon.png'
KEYSTORE = Path(os.environ.get('EA888_KEYSTORE', '/mnt/data/EA888-Lab-stable-signing/ea888-lab-stable.jks'))
ALIAS = os.environ.get('EA888_KEY_ALIAS', 'ea888labstable')
PASSWORD = os.environ.get('EA888_KEY_PASSWORD')
PACKAGE = 'nl.randy.ea888lab.stabl'
APP_ICON_RESOURCE_ID = 0x7F010000

PRODUCTION_ASSETS = [
    'index.html', 'styles.css', 'turbo-data.js', 'turbo.js', 'sim.js', 'audio-bank.js', 'app.js',
    'images/scirocco-app-icon.png',
    'images/randy-scirocco-hero.jpg',
    'images/randy-scirocco-garage.jpg',
    'images/randy-scirocco-side.png',
    'images/randy-scirocco-cutout.png',
    'images/randy-scirocco-rear.svg',
    'images/rival-scirocco.svg',
    'images/randy-scirocco-rear-photo.png',
    'images/randy-scirocco-race-v10.png',
    'images/track-horizon-v10.webp',
    'images/engine-realistic.webp',
    'images/part-piston.webp',
    'images/part-head.webp',
    'images/part-turbo.webp',
    'images/part-intercooler.webp',
    'images/part-fuel.webp',
    'images/part-transmission.webp',
    'images/car-race.webp',
    'images/drag-strip-panorama.webp',
    'images/drag-track-chase.webp',
    'images/drag-burnout-box.webp',
    'images/drag-v8-burnout.webp',
    'images/drag-v8-stage.webp',
    'images/drag-v8-race.webp',
]

ALIGNED_STORED = {'AndroidManifest.xml', 'classes.dex', 'resources.arsc', 'res/mipmap/app_icon.png'}


def run(cmd: list[str], **kwargs) -> None:
    print('+', ' '.join(map(str, cmd)))
    subprocess.run(cmd, check=True, **kwargs)


def aligned_extra(current_offset: int, filename: str) -> bytes:
    """Return a valid unknown ZIP extra field that aligns file data to 4 bytes."""
    base = current_offset + 30 + len(filename.encode('utf-8'))
    needed = (-base) % 4
    if needed == 0:
        return b''
    return struct.pack('<HH', 0xFFFF, needed) + b'\x00' * needed


def add_file(zf: zipfile.ZipFile, arcname: str, path: Path, compress: int, align4: bool = False) -> None:
    info = zipfile.ZipInfo(arcname, date_time=(2026, 9, 19, 12, 0, 0))
    info.compress_type = compress
    info.external_attr = 0o644 << 16
    if align4:
        info.extra = aligned_extra(zf.fp.tell(), arcname)
    zf.writestr(info, path.read_bytes())


def build_unsigned(apk: Path) -> None:
    DIST.mkdir(parents=True, exist_ok=True)
    manifest = DIST / 'AndroidManifest.xml'
    resources = DIST / 'resources.arsc'
    dex = DIST / 'classes.dex'
    run([sys.executable, str(TOOLS / 'generate_app_icon.py')])
    run([sys.executable, str(TOOLS / 'patch_manifest.py'), str(BASE / 'AndroidManifest.xml'), str(manifest)])
    run([sys.executable, str(TOOLS / 'patch_resources_icon.py'), str(BASE / 'resources.arsc'), str(resources), '--package', PACKAGE])
    run([sys.executable, str(TOOLS / 'make_webview_dex.py'), str(dex)])

    if apk.exists():
        apk.unlink()
    with zipfile.ZipFile(apk, 'w', allowZip64=False) as zf:
        add_file(zf, 'AndroidManifest.xml', manifest, zipfile.ZIP_STORED, align4=True)
        add_file(zf, 'classes.dex', dex, zipfile.ZIP_STORED, align4=True)
        add_file(zf, 'resources.arsc', resources, zipfile.ZIP_STORED, align4=True)
        add_file(zf, 'res/mipmap/app_icon.png', ICON, zipfile.ZIP_STORED, align4=True)
        for rel in PRODUCTION_ASSETS:
            src = ASSETS / rel
            if not src.is_file():
                raise FileNotFoundError(src)
            add_file(zf, f'assets/{rel}', src, zipfile.ZIP_DEFLATED, align4=False)


def ensure_keystore() -> None:
    if not PASSWORD:
        raise RuntimeError('EA888_KEY_PASSWORD is required; keep signing credentials outside the repository')
    if KEYSTORE.exists():
        return
    KEYSTORE.parent.mkdir(parents=True, exist_ok=True)
    run([
        'keytool', '-genkeypair', '-v',
        '-keystore', str(KEYSTORE), '-storepass', PASSWORD, '-keypass', PASSWORD,
        '-alias', ALIAS, '-dname', 'CN=EA888 Lab Stable,O=Randy,C=NL',
        '-keyalg', 'RSA', '-keysize', '2048', '-validity', '10000',
    ])


def align_signed_apk(path: Path) -> None:
    """Repack without changing entry contents; v1/JAR signatures remain valid."""
    temp = path.with_suffix('.aligned.tmp.apk')
    with zipfile.ZipFile(path, 'r') as src, zipfile.ZipFile(temp, 'w', allowZip64=False) as dst:
        for old in src.infolist():
            data = src.read(old.filename)
            info = zipfile.ZipInfo(old.filename, date_time=old.date_time)
            info.compress_type = old.compress_type
            info.external_attr = old.external_attr
            info.internal_attr = old.internal_attr
            info.comment = old.comment
            info.create_system = old.create_system
            if old.filename in ALIGNED_STORED:
                info.extra = aligned_extra(dst.fp.tell(), old.filename)
            dst.writestr(info, data)
    temp.replace(path)


def sign_apk(unsigned: Path, signed: Path) -> None:
    if not PASSWORD:
        raise RuntimeError('EA888_KEY_PASSWORD is required; keep signing credentials outside the repository')
    ensure_keystore()
    shutil.copy2(unsigned, signed)
    run([
        'jarsigner', '-verbose', '-sigalg', 'SHA256withRSA', '-digestalg', 'SHA-256',
        '-keystore', str(KEYSTORE), '-storepass', PASSWORD, '-keypass', PASSWORD,
        str(signed), ALIAS,
    ], stdout=subprocess.DEVNULL)
    align_signed_apk(signed)
    run(['jarsigner', '-verify', '-verbose', '-certs', str(signed)], stdout=subprocess.DEVNULL)


def entry_offset(zf: zipfile.ZipFile, name: str) -> tuple[int, int]:
    info = zf.getinfo(name)
    zf.fp.seek(info.header_offset)
    header = zf.fp.read(30)
    if header[:4] != b'PK\x03\x04':
        raise RuntimeError(f'Bad local header for {name}')
    name_len, extra_len = struct.unpack_from('<HH', header, 26)
    return info.header_offset + 30 + name_len + extra_len, info.compress_type


def verify_manifest_icon(raw: bytes) -> None:
    # Use the same battle-tested parser as the patcher to verify package/icon.
    sys.path.insert(0, str(TOOLS))
    from patch_manifest import find_string_pool, iter_chunks, u16, u32, RES_XML_START_ELEMENT_TYPE  # type: ignore
    data = bytearray(raw)
    pool = find_string_pool(data)
    if PACKAGE not in pool.strings or 'EA888 LAB' not in pool.strings:
        raise RuntimeError('manifest package/label was not patched')
    found = False
    for off, ctype, _hs, _size in iter_chunks(data):
        if ctype != RES_XML_START_ELEMENT_TYPE or pool.get(u32(data, off + 20)) != 'application':
            continue
        attrs_off = off + 16 + u16(data, off + 24)
        attr_size = u16(data, off + 26)
        for i in range(u16(data, off + 28)):
            aoff = attrs_off + i * attr_size
            if pool.get(u32(data, aoff + 4)) == 'icon':
                found = data[aoff + 15] == 0x01 and u32(data, aoff + 16) == APP_ICON_RESOURCE_ID
    if not found:
        raise RuntimeError('android:icon does not reference the Scirocco resource')


def verify_resource_icon(raw: bytes) -> None:
    sys.path.insert(0, str(TOOLS))
    from patch_resources_icon import StringPool, u16, u32  # type: ignore
    data = bytearray(raw)
    global_pool = StringPool(data, 12)
    if global_pool.get(0) != 'res/mipmap/app_icon.png':
        raise RuntimeError('resource table icon path missing')
    package_off = 12 + u32(data, 12 + 4)
    package_name = bytes(data[package_off + 12:package_off + 12 + 256]).decode('utf-16-le').split('\x00', 1)[0]
    if package_name != PACKAGE:
        raise RuntimeError(f'wrong resource package: {package_name}')
    type_pool = StringPool(data, package_off + u32(data, package_off + 268))
    key_pool = StringPool(data, package_off + u32(data, package_off + 276))
    if type_pool.get(0) != 'mipmap' or key_pool.get(0) != 'app_icon':
        raise RuntimeError('mipmap/app_icon resource missing')


def verify_apk(path: Path) -> None:
    required = {
        'AndroidManifest.xml', 'classes.dex', 'resources.arsc', 'res/mipmap/app_icon.png',
        *[f'assets/{x}' for x in PRODUCTION_ASSETS],
    }
    with zipfile.ZipFile(path) as zf:
        names = set(zf.namelist())
        missing = required - names
        if missing:
            raise RuntimeError(f'Missing APK entries: {sorted(missing)}')
        bad = zf.testzip()
        if bad:
            raise RuntimeError(f'Corrupt ZIP entry: {bad}')
        if zf.read('classes.dex')[:8] != b'dex\n035\x00':
            raise RuntimeError('Bad DEX magic')
        if not zf.read('assets/index.html').startswith(b'<!doctype html>'):
            raise RuntimeError('Bad index.html')
        icon = zf.read('res/mipmap/app_icon.png')
        if not icon.startswith(b'\x89PNG\r\n\x1a\n') or len(icon) < 10000:
            raise RuntimeError('Bad Scirocco icon PNG')
        verify_manifest_icon(zf.read('AndroidManifest.xml'))
        verify_resource_icon(zf.read('resources.arsc'))

    with zipfile.ZipFile(path) as zf:
        for name in ALIGNED_STORED:
            off, method = entry_offset(zf, name)
            if off % 4:
                raise RuntimeError(f'{name} is not 4-byte aligned: {off}')
            if method != 0:
                raise RuntimeError(f'{name} must be stored/uncompressed')

    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    print(f'APK OK: {path} ({path.stat().st_size} bytes)')
    print('Launcher icon: mipmap/app_icon -> Scirocco PNG')
    print(f'SHA-256: {digest}')


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('--output', type=Path, default=DIST / 'EA888-Lab-v1.3.1-Precision-ALS-debug.apk')
    args = ap.parse_args()
    DIST.mkdir(parents=True, exist_ok=True)
    unsigned = DIST / 'EA888-Lab-v1.3.1-unsigned.apk'
    build_unsigned(unsigned)
    sign_apk(unsigned, args.output)
    verify_apk(args.output)


if __name__ == '__main__':
    main()
