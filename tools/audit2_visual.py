import json,sys
from pathlib import Path
from playwright.sync_api import sync_playwright
from browser_smoke import serve_assets,APP_ORIGIN
import browser_env
before='--before' in sys.argv
out=Path('reports/audit2/visual-before' if before else 'reports/audit2/visual');out.mkdir(parents=True,exist_ok=True)
with sync_playwright() as pw:
 b=pw.chromium.launch(**browser_env.launch_kwargs(pw,['--no-sandbox','--enable-unsafe-swiftshader']));c=b.new_context(viewport={'width':412,'height':892});serve_assets(c,Path('build/web').resolve());
 if before:c.route('**/models/eagle.glb*',lambda r:r.fulfill(status=200,body=Path('../work/audit-1.31/eagle-backup/eagle.glb').read_bytes(),content_type='model/gltf-binary'))
 p=c.new_page();errors=[];p.on('pageerror',lambda e:errors.append(str(e)));p.goto(APP_ORIGIN+'/assets/index.html?profile=vehicle-qa');p.wait_for_function('!!window.__EA888_DEBUG__');p.evaluate('__EA888_DEBUG__.qaDrive("eagle")');p.wait_for_function('__EA888_DEBUG__.vehicle().showroom?.state==="ready"');p.evaluate('__EA888_DEBUG__.showroomView(0)');p.wait_for_timeout(500);p.locator('#vehicle-showroom').screenshot(path=str(out/'eagle-rear-beauty.png'));p.evaluate('__EA888_DEBUG__.showroomClay(true)');p.wait_for_timeout(500);p.locator('#vehicle-showroom').screenshot(path=str(out/'eagle-rear-clay.png'))
 for w in [360,390,412,430]:
  p.set_viewport_size({'width':w,'height':892});p.locator('[data-nav=tune]').click()
  for tab in ['gearing','safety','gearing']:
   p.locator('[data-tune-panel='+tab+']').click()
  assert p.locator('[data-tune-content=gearing]').count()==1
  p.screenshot(path=str(out/f'gear-{w}.png'));assert p.evaluate('document.documentElement.scrollWidth<=innerWidth+1')
 p.evaluate('document.documentElement.style.fontSize="120%"');p.screenshot(path=str(out/'gear-text120.png'));assert not errors
 (out/'report.json').write_text(json.dumps({'ok':True,'widths':[360,390,412,430],'errors':errors}));b.close()
