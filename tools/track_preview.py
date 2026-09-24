#!/usr/bin/env python3
"""Dev tool: screenshots the 3D track (src/web/race3d.js) at fixed points on the strip."""
import argparse, pathlib, subprocess, sys, tempfile
from playwright.sync_api import sync_playwright

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import browser_env

ROOT = pathlib.Path(__file__).resolve().parent.parent
SHOTS = 'burnout,staging,tree,launch,mid,finish,side,high'


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', default='/tmp/track-preview')
    ap.add_argument('--shots', default=SHOTS)
    ap.add_argument('--quality', default='high', help='high | medium | low')
    ap.add_argument('--width', type=int, default=1000)
    ap.add_argument('--height', type=int, default=560)
    a = ap.parse_args()
    out = pathlib.Path(a.out); out.mkdir(parents=True, exist_ok=True)
    tmp = pathlib.Path(tempfile.mkdtemp())
    subprocess.run([str(ROOT / 'node_modules/.bin/esbuild'), str(ROOT / 'tools/track_preview/preview.js'),
                    '--bundle', '--format=iife', f'--outfile={tmp}/p.js'], check=True, cwd=ROOT)
    (tmp / 'index.html').write_text(
        f'<html><body style="margin:0"><canvas id="c" width="{a.width}" height="{a.height}" '
        f'style="width:{a.width}px;height:{a.height}px"></canvas><script src="p.js"></script></body></html>')
    with sync_playwright() as p:
        b = p.chromium.launch(**browser_env.launch_kwargs(
            p, ['--no-sandbox', '--disable-dev-shm-usage', '--enable-unsafe-swiftshader']))
        pg = b.new_page(viewport={'width': a.width, 'height': a.height})
        errors = []
        pg.on('pageerror', lambda e: errors.append(str(e)))
        pg.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
        pg.goto((tmp / 'index.html').as_uri())
        pg.wait_for_function('window.previewReady === true', timeout=60000)
        if not pg.evaluate(f'buildTrackPreview({a.quality!r})'):
            sys.exit('race3d.create() returned null (no WebGL?)')
        for shot in a.shots.split(','):
            if not pg.evaluate(f'renderShot({shot!r})'):
                sys.exit(f'unknown shot {shot}')
            pg.locator('#c').screenshot(path=str(out / f'{shot}.png'))
        print('quality:', pg.evaluate('previewQuality()'))
        print('info   :', pg.evaluate('previewInfo()'))
        b.close()
    if errors:
        print('page errors:', *errors, sep='\n  ')
        return 1
    print(out)
    return 0


if __name__ == '__main__':
    sys.exit(main())
