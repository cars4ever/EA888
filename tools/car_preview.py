#!/usr/bin/env python3
"""Dev tool: screenshots the 3D car (src/web/race3d.js buildCar) from fixed views.

Served from the app's own https origin, as WebViewAssetLoader does on Android: the car's body is a GLB
fetched at runtime, and a file:// page may not fetch it.
"""
import argparse, mimetypes, pathlib, shutil, subprocess, sys, tempfile
from playwright.sync_api import sync_playwright

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import browser_env

ROOT = pathlib.Path(__file__).resolve().parent.parent
APP_ORIGIN = 'https://appassets.androidplatform.net'


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', default='/tmp/car-preview')
    ap.add_argument('--views', default='rear,chase,side,front34,rear34,top')
    ap.add_argument('--procedural', action='store_true', help='the fallback body, without the GLB')
    a = ap.parse_args()
    out = pathlib.Path(a.out); out.mkdir(parents=True, exist_ok=True)
    tmp = pathlib.Path(tempfile.mkdtemp())
    subprocess.run([str(ROOT / 'node_modules/.bin/esbuild'), str(ROOT / 'tools/car_preview/preview.js'),
                    '--bundle', '--format=iife', f'--outfile={tmp}/p.js'], check=True, cwd=ROOT)
    if not a.procedural:
        shutil.copytree(ROOT / 'src' / 'assets' / 'models', tmp / 'models')
    (tmp / 'index.html').write_text(
        '<html><body style="margin:0"><canvas id="c" width="1000" height="600"></canvas>'
        '<script src="p.js"></script></body></html>')
    with sync_playwright() as p:
        b = p.chromium.launch(**browser_env.launch_kwargs(
            p, ['--no-sandbox', '--disable-dev-shm-usage', '--enable-unsafe-swiftshader']))
        ctx = b.new_context(viewport={'width': 1000, 'height': 600})

        def handler(route):
            rel = route.request.url.split('/assets/', 1)[-1].split('?')[0] or 'index.html'
            path = (tmp / rel).resolve()
            if tmp in path.parents and path.is_file():
                route.fulfill(status=200, body=path.read_bytes(),
                              content_type=mimetypes.guess_type(str(path))[0] or 'application/octet-stream')
            else:
                route.fulfill(status=404, body='')
        ctx.route(f'{APP_ORIGIN}/**', handler)
        pg = ctx.new_page()
        errors = []
        pg.on('pageerror', lambda e: errors.append(str(e)))
        pg.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
        pg.goto(f'{APP_ORIGIN}/assets/index.html')
        pg.wait_for_function('window.previewReady === true', timeout=60000)
        # the body arrives asynchronously; wait until it is in place (or the fallback is confirmed)
        pg.wait_for_function('window.previewBodyReady === true', timeout=60000)
        for v in a.views.split(','):
            pg.evaluate(f'renderView("{v}")')
            pg.locator('#c').screenshot(path=str(out / f'{v}.png'))
        print('body:', pg.evaluate('window.previewBodyKind'))
        b.close()
    if errors:
        print('page errors:', *errors, sep='\n  ')
        return 1
    print(out)
    return 0


if __name__ == '__main__':
    sys.exit(main())
