"""Ten real app WebAudio start/menu-close cycles; not ten physical races."""
import json
from pathlib import Path
from playwright.sync_api import sync_playwright
from browser_smoke import serve_assets,APP_ORIGIN
import browser_env
out=Path('reports/audit2/audio');source=Path('build/web/app.js').read_text().replace('window.__EA888_DEBUG__ = {','''window.__EA888_DEBUG__ = {qaAudioLifetime:async()=>{const rows=[];state.settings.sound=true;for(let i=0;i<10;i++){activeTab='drag';startEngineAudio('race');await engineAudio.readyPromise;await engineAudio.ctx.resume();const ctx=engineAudio.ctx;updateEngineAudio(4500,.8,.3,{boostBar:1});await new Promise(r=>setTimeout(r,150));activeTab='service';stopEngineAudio({hard:true});await new Promise(r=>setTimeout(r,100));rows.push({cycle:i,context:ctx.state,after:audioDiagnostics()});}return rows;},''')
with sync_playwright() as pw:
 b=pw.chromium.launch(**browser_env.launch_kwargs(pw,['--no-sandbox','--autoplay-policy=no-user-gesture-required']));c=b.new_context();serve_assets(c,Path('build/web').resolve());c.route('**/assets/app.js*',lambda r:r.fulfill(status=200,body=source,content_type='text/javascript'));p=c.new_page();p.goto(APP_ORIGIN+'/assets/index.html?profile=vehicle-qa');p.wait_for_function('!!window.__EA888_DEBUG__');p.evaluate('__EA888_DEBUG__.qaDrive("eagle")');p.locator('[data-nav=service]').click();r=p.evaluate('__EA888_DEBUG__.qaAudioLifetime()');assert all(x['context']=='closed' and not x['after']['exists'] for x in r);(out/'lifetime.json').write_text(json.dumps({'ok':True,'cycles':r},indent=2));b.close();print('PASS ten real AudioContext lifecycle cycles')
