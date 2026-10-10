import json
from pathlib import Path
from playwright.sync_api import sync_playwright
from browser_smoke import serve_assets,APP_ORIGIN
import browser_env
out=Path('reports/audit2/loading');out.mkdir(parents=True,exist_ok=True)
with sync_playwright() as pw:
 b=pw.chromium.launch(**browser_env.launch_kwargs(pw,['--no-sandbox','--enable-unsafe-swiftshader']));c=b.new_context(viewport={'width':412,'height':892});serve_assets(c,Path('build/web').resolve());c.route('**/models/eagle*.glb*',lambda r:r.fulfill(status=404,body=''));p=c.new_page();p.goto(APP_ORIGIN+'/assets/index.html?profile=vehicle-qa');p.wait_for_function('!!window.__EA888_DEBUG__');p.evaluate('__EA888_DEBUG__.qaDrive("eagle")');p.locator('[data-nav=dyno]').click();p.locator('[data-action=start-dyno]').click();p.wait_for_selector('[data-action=abort-dyno]',state='detached',timeout=90000);p.evaluate('__EA888_DEBUG__.qaStartPreparation()');p.wait_for_function('__EA888_DEBUG__.vehicle().race?.player?.state==="fallback"');p.dispatch_event('[data-v7-control=burnout]','pointerdown',{'pointerId':88,'pointerType':'touch'});p.wait_for_timeout(1000);r=p.evaluate('__EA888_DEBUG__.preparation()');assert not r['assetsReady'];assert r['physical']['distanceM']==-30;assert r['physical']['t']==0;p.screenshot(path=str(out/'missing-model-paused.png'));(out/'report.json').write_text(json.dumps({'ok':True,'clock':r['physical']['t'],'worldM':r['physical']['distanceM'],'assetsReady':False}));b.close()
