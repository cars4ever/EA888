#!/usr/bin/env python3
"""Build the web app into build/web (the Android assets and the browser test target).

  python3 tools/build_web.py            build
  python3 tools/build_web.py --no-images  skip image recompression (faster local iterations)

Steps:
  1. copy src/assets (without the unused raw WAV sources; the sound bank is embedded in audio-bank.js)
  2. bundle src/web/platform.js with esbuild (morphdom + the Android bridge wrapper)
  3. stamp the version from version.json into app.js
  4. recompress large PNG/JPEG images to WebP when that saves at least 15 %, and rewrite references
"""
from __future__ import annotations

import argparse
import json
import re
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / 'src' / 'assets'
OUT = ROOT / 'build' / 'web'
ESBUILD = ROOT / 'node_modules' / '.bin' / 'esbuild'
TEXT_FILES = ('app.js', 'styles.css', 'index.html')
# The launcher/favicon PNG stays PNG (the legacy APK pipeline and some launchers expect it).
KEEP_FORMAT = {'scirocco-app-icon.png'}


def copy_assets() -> None:
    if OUT.exists():
        shutil.rmtree(OUT)
    shutil.copytree(SRC, OUT, ignore=shutil.ignore_patterns('*.wav'))
    audio = OUT / 'audio'
    if audio.exists() and not any(audio.iterdir()):
        audio.rmdir()


def bundle_platform() -> None:
    if not ESBUILD.exists():
        sys.exit('esbuild missing: run `npm install` first')
    subprocess.run([str(ESBUILD), str(ROOT / 'src' / 'web' / 'platform.js'), '--bundle', '--format=iife',
                    '--target=chrome90', '--minify', '--legal-comments=none', f'--outfile={OUT / "platform.js"}'],
                   check=True)


def stamp_version() -> str:
    version = json.loads((ROOT / 'version.json').read_text())['versionName']
    app = OUT / 'app.js'
    text, n = re.subn(r"const APP_VERSION = '[^']*';", f"const APP_VERSION = '{version}';", app.read_text(encoding='utf-8'))
    if n != 1:
        sys.exit('APP_VERSION constant not found in app.js')
    app.write_text(text, encoding='utf-8')
    return version


def recompress_images() -> tuple[int, int]:
    from PIL import Image
    before = after = 0
    renames: dict[str, str] = {}
    for path in sorted((OUT / 'images').iterdir()):
        if path.suffix.lower() not in ('.png', '.jpg', '.jpeg') or path.name in KEEP_FORMAT:
            continue
        size = path.stat().st_size
        target = path.with_suffix('.webp')
        if target.exists():
            continue
        with Image.open(path) as im:
            im.load()
            has_alpha = im.mode in ('RGBA', 'LA') or (im.mode == 'P' and 'transparency' in im.info)
            im = im.convert('RGBA' if has_alpha else 'RGB')
            im.save(target, 'WEBP', quality=88, method=6, alpha_quality=92)
        new = target.stat().st_size
        if new <= size * 0.85:
            path.unlink()
            renames[path.name] = target.name
            before += size
            after += new
        else:
            target.unlink()
    if renames:
        pattern = re.compile(r'images/(' + '|'.join(re.escape(k) for k in renames) + r')\b')
        for name in TEXT_FILES:
            f = OUT / name
            f.write_text(pattern.sub(lambda m: 'images/' + renames[m.group(1)], f.read_text(encoding='utf-8')), encoding='utf-8')
    return before, after


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('--no-images', action='store_true')
    args = ap.parse_args()
    copy_assets()
    bundle_platform()
    version = stamp_version()
    saved = (0, 0) if args.no_images else recompress_images()
    total = sum(f.stat().st_size for f in OUT.rglob('*') if f.is_file())
    print(f'build/web v{version}: {total / 1e6:.2f} MB' + (f'; images {saved[0] / 1e6:.2f} -> {saved[1] / 1e6:.2f} MB' if saved[0] else ''))


if __name__ == '__main__':
    main()
