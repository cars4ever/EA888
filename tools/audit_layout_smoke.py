#!/usr/bin/env python3
import json
from pathlib import Path
from playwright.sync_api import sync_playwright
from browser_smoke import serve_assets,APP_ORIGIN
import browser_env
out=Path('reports/audit-repair/layout');out.mkdir(parents=True,exist_ok=True)
with sync_playwright() as pw:
 b=pw.chromium.launch(**browser_env.launch_kwargs(pw,['--no-sandbox','--enable-unsafe-swiftshader']));c=b.new_context(viewport={'width':412,'height':892});serve_assets(c,Path('build/web').resolve());p=c.new_page();p.goto(APP_ORIGIN+'/assets/index.html?profile=vehicle-qa');p.wait_for_function('!!window.__EA888_DEBUG__');p.evaluate('__EA888_DEBUG__.qaDrive("crc12_jackstand_240")');p.locator('[data-nav=dyno]').click();p.locator('[data-action=start-dyno]').click();p.wait_for_selector('[data-action=abort-dyno]',state='detached',timeout=90000);p.evaluate('__EA888_DEBUG__.qaStartRun()');p.wait_for_function('__EA888_DEBUG__.race().distanceM>15',timeout=60000)
 r=p.evaluate('''()=>Object.fromEntries(['#v7-run-rpm','#v7-run-gear','.v7-tach-readout','#v7-run-tach','.v15-throttle-dock','.v14-n2o-dock','.v10-drive-controls'].map(sel=>{const e=document.querySelector(sel),r=e.getBoundingClientRect(),c=getComputedStyle(e);return [sel,{text:e.textContent,rect:{x:r.x,y:r.y,width:r.width,height:r.height},style:{position:c.position,display:c.display,visibility:c.visibility,color:c.color,fontSize:c.fontSize,top:c.top,left:c.left,transform:c.transform}}]}))''');assert r['#v7-run-gear']['text'].strip().isdigit(); assert r['#v7-run-rpm']['rect']['y'] + r['#v7-run-rpm']['rect']['height'] <= r['#v7-run-gear']['rect']['y']; assert r['.v15-throttle-dock']['rect']['x'] + r['.v15-throttle-dock']['rect']['width'] < r['.v14-n2o-dock']['rect']['x']; assert p.locator('.v7-tach-numbers').is_hidden(); (out/'report.json').write_text(json.dumps({'ok':True,'elements':r},indent=2)); print(json.dumps(r,indent=2));p.screenshot(path=str(out/'hud.png'));b.close()
