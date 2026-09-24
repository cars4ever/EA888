#!/usr/bin/env python3
"""Dev tool: screenshots the procedural 3D car (src/web/race3d.js buildCar) from fixed views."""
import argparse, pathlib, subprocess, sys, tempfile
from playwright.sync_api import sync_playwright

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import browser_env

ROOT = pathlib.Path(__file__).resolve().parent.parent

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', default='/tmp/car-preview')
    ap.add_argument('--views', default='rear,chase,side,front34,rear34,top')
    a = ap.parse_args()
    out = pathlib.Path(a.out); out.mkdir(parents=True, exist_ok=True)
    tmp = pathlib.Path(tempfile.mkdtemp())
    subprocess.run([str(ROOT / 'node_modules/.bin/esbuild'), str(ROOT / 'tools/car_preview/preview.js'), '--bundle', '--format=iife', f'--outfile={tmp}/p.js'], check=True, cwd=ROOT)
    (tmp / 'index.html').write_text('<html><body style="margin:0"><canvas id="c" width="1000" height="600"></canvas><script src="p.js"></script></body></html>')
    with sync_playwright() as p:
        b = p.chromium.launch(**browser_env.launch_kwargs(p, ['--no-sandbox', '--disable-dev-shm-usage', '--enable-unsafe-swiftshader']))
        pg = b.new_page(viewport={'width': 1000, 'height': 600})
        pg.goto((tmp / 'index.html').as_uri())
        pg.wait_for_function('window.previewReady === true', timeout=60000)
        for v in a.views.split(','):
            pg.evaluate(f'renderView("{v}")')
            pg.locator('#c').screenshot(path=str(out / f'{v}.png'))
        b.close()
    print(out)

if __name__ == '__main__':
    sys.exit(main())
