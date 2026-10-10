import json
from pathlib import Path
from playwright.sync_api import sync_playwright
from browser_smoke import serve_assets,APP_ORIGIN
import browser_env
out=Path('reports/audit2/ui');out.mkdir(parents=True,exist_ok=True)
with sync_playwright() as pw:
 b=pw.chromium.launch(**browser_env.launch_kwargs(pw,['--no-sandbox','--enable-unsafe-swiftshader']));c=b.new_context(viewport={'width':412,'height':892});serve_assets(c,Path('build/web').resolve());p=c.new_page();errors=[];p.on('pageerror',lambda e:errors.append(str(e)));p.goto(APP_ORIGIN+'/assets/index.html?profile=vehicle-qa');p.wait_for_function('!!window.__EA888_DEBUG__')
 for car in ['eagle','crc12_jackstand_240','scirocco']:
  p.evaluate('(id)=>__EA888_DEBUG__.qaDrive(id)',car);p.locator('[data-nav=tune]').click();p.locator('[data-tune-panel=gearing]').click();p.wait_for_selector('[data-tune-content=gearing]');assert p.locator('.gear-table tbody tr').count()==(3 if car=='eagle' else 2 if car.startswith('crc') else 6);p.screenshot(path=str(out/f'{car}-gear.png'));p.locator('[data-nav=dyno]').click();p.screenshot(path=str(out/f'{car}-dyno.png'))
 p.locator('[data-nav=tune]').click();tabs={}
 for tab in ['boost','tables','als','fuel','cams','gearing','safety']:
  p.locator('[data-tune-panel='+tab+']').click();assert 'active' in p.locator('[data-tune-panel='+tab+']').get_attribute('class');tabs[tab]=p.locator('#content h2').all_text_contents();assert tabs[tab]
 assert len({tuple(v)for v in tabs.values()})==7
 (out/'report.json').write_text(json.dumps({'ok':not errors,'errors':errors,'tabs':tabs}));assert not errors; b.close()
