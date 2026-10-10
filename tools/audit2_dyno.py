"""Real browser dyno timing, audio readiness and terminal UI evidence."""
import json,time
from pathlib import Path
from playwright.sync_api import sync_playwright
from browser_smoke import serve_assets,APP_ORIGIN
import browser_env
out=Path('reports/audit2/dyno');out.mkdir(parents=True,exist_ok=True)
source=Path('src/assets/app.js').read_text().replace('function dynoFrame(samples, idx) {','function dynoFrame(samples, idx) { (window.qaDynoFrames ||= []).push({wall:performance.now(),idx,rpm:samples[idx].rpm,t:samples[idx].tS,audio:audioDiagnostics()});')
source=source.replace('function finishDyno(result) {','function finishDyno(result) { window.qaDynoEnd={wall:performance.now(),status:document.querySelector("[data-action=start-dyno]")?.textContent};')
report=[]
with sync_playwright() as pw:
 b=pw.chromium.launch(**browser_env.launch_kwargs(pw,['--no-sandbox','--autoplay-policy=no-user-gesture-required','--enable-unsafe-swiftshader']))
 for rate,abort in [(250,False),(1000,False),(550,True)]:
  c=b.new_context(viewport={'width':412,'height':892},record_video_dir=str(out/'video'));serve_assets(c,Path('build/web').resolve());c.route('**/assets/app.js*',lambda r:r.fulfill(status=200,body=source,content_type='text/javascript'));p=c.new_page();errors=[];p.on('pageerror',lambda e:errors.append(str(e)));p.goto(APP_ORIGIN+'/assets/index.html?profile=vehicle-qa');p.wait_for_function('!!window.__EA888_DEBUG__');p.evaluate('__EA888_DEBUG__.qaDrive("eagle")');p.locator('[data-nav=dyno]').click();slider=p.locator('[data-dyno-config=rampRpmPerSec]');slider.fill(str(rate));slider.dispatch_event('input');slider.dispatch_event('change');p.locator('[data-nav=dyno]').click();p.locator('[data-action=start-dyno]').click();p.wait_for_function('window.qaDynoFrames?.length>3',timeout=60000);p.screenshot(path=str(out/f'{rate}-running.png'))
  if abort:p.locator('[data-action=abort-dyno]').click()
  p.wait_for_function('!!window.qaDynoEnd',timeout=90000);p.wait_for_selector('[data-action=abort-dyno]',state='detached');r=p.evaluate('({frames:qaDynoFrames,end:qaDynoEnd,result:__EA888_DEBUG__.dyno(),audio:__EA888_DEBUG__.audio()})');r.update(rate=rate,aborted=abort,errors=errors);assert not errors
  if not abort:
   duration=(r['frames'][-1]['wall']-r['frames'][0]['wall'])/1000;expected=r['frames'][-1]['t']-r['frames'][0]['t'];assert abs(duration-expected)<1.5,(duration,expected);r.update(duration=duration,expected=expected)
  assert not r['audio']['active'];p.screenshot(path=str(out/f'{rate}-finished.png'));report.append(r);c.close()
 b.close()
(out/'report.json').write_text(json.dumps(report,indent=2));print('PASS real slow/fast dyno timing and operator abort')
