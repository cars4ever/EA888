#!/usr/bin/env python3
"""Vehicle acceptance in the real built app, isolated browser/QA storage; software WebGL, not a device test."""
import argparse, json, math, sys, time
from pathlib import Path
from playwright.sync_api import sync_playwright
sys.path.insert(0,str(Path(__file__).resolve().parent))
import browser_env
from browser_smoke import serve_assets, APP_ORIGIN

def main():
 p=argparse.ArgumentParser();p.add_argument('--cars',default='crc12_jackstand_240,eagle,mullet,mcflurry,lumberjack');p.add_argument('--out',default='reports/vehicles');p.add_argument('--video',action='store_true');p.add_argument('--preview-only',action='store_true');a=p.parse_args()
 out=Path(a.out);out.mkdir(parents=True,exist_ok=True);assets=Path('build/web').resolve();report={'platform':'desktop Chromium / SwiftShader; no Android device','cars':{},'errors':[]};start=time.time()
 with sync_playwright() as pw:
  browser=pw.chromium.launch(**browser_env.launch_kwargs(pw,['--no-sandbox','--disable-dev-shm-usage','--enable-unsafe-swiftshader']))
  opts=dict(viewport={'width':1000,'height':850},device_scale_factor=1)
  if a.video:opts.update(record_video_dir=str(out/'video'),record_video_size={'width':1000,'height':850})
  ctx=browser.new_context(**opts);serve_assets(ctx,assets);page=ctx.new_page();page.on('pageerror',lambda e:report['errors'].append(str(e)))
  page.goto(APP_ORIGIN+'/assets/index.html?profile=vehicle-qa');page.wait_for_function('!!window.__EA888_DEBUG__')
  original=page.evaluate('localStorage.getItem("ea888_lab_v120_state")')
  for car in a.cars.split(','):
   folder=out/car;folder.mkdir(exist_ok=True);r={};report['cars'][car]=r
   print('CAR',car,flush=True)
   assert page.evaluate('(id)=>__EA888_DEBUG__.qaDrive(id)',car)
   page.wait_for_function('__EA888_DEBUG__.vehicle().showroom?.state === "ready"',timeout=60000)
   r['identity']=page.evaluate('__EA888_DEBUG__.vehicle()');assert r['identity']['active']==r['identity']['simId']==car
   for name,angle in [('front',math.pi),('front34',-2.35),('side',-math.pi/2),('rear34',-.75),('rear',0)]:
    page.evaluate('(a)=>__EA888_DEBUG__.showroomView(a)',angle);page.locator('#vehicle-showroom').screenshot(path=str(folder/(name+'.png')))
   page.evaluate('__EA888_DEBUG__.showroomClay(true)');page.locator('#vehicle-showroom').screenshot(path=str(folder/'clay.png'));page.evaluate('__EA888_DEBUG__.showroomClay(false)')
   # A full 360 degree preview of the actual runtime model through the game's showroom.
   frames=folder/'turntable';frames.mkdir(exist_ok=True)
   for i in range(36):
    page.evaluate('(a)=>__EA888_DEBUG__.showroomView(a)',i*math.tau/36);page.locator('#vehicle-showroom').screenshot(path=str(frames/f'{i:03d}.png'))
   if a.preview_only:continue
   before=page.evaluate('JSON.parse(localStorage.getItem("ea888_vehicle_qa_v1"))')
   for tab in ['build','tune','dyno','service']:
    page.locator(f'[data-nav="{tab}"]').click();page.wait_for_selector('.roster-workshop')
    assert page.locator('[data-tune]').count()==0
   after=page.evaluate('JSON.parse(localStorage.getItem("ea888_vehicle_qa_v1"))')
   for field in ['selections','tune','wear','damage','service']:assert before[field]==after[field],field
   r['workshopProtected']=True
   page.reload();page.wait_for_function('__EA888_DEBUG__.vehicle().showroom?.state === "ready"',timeout=60000);assert page.evaluate('__EA888_DEBUG__.vehicle().active')==car
   r['restartSelection']=True
   page.evaluate('__EA888_DEBUG__.holdFinishForTest(true)')
   page.locator('[data-nav="drag"]').click()
   page.locator('[data-action="auto-drag-game"]').click()
   page.wait_for_function('__EA888_DEBUG__.vehicle().race?.player?.state === "ready"',timeout=60000)
   page.screenshot(path=str(folder/'burnout.png'))
   r['raceIdentity']=page.evaluate('__EA888_DEBUG__.vehicle()');assert r['raceIdentity']['race']['player']['carId']==car
   page.wait_for_function('__EA888_DEBUG__.race().distanceM > 35',timeout=90000)
   page.screenshot(path=str(folder/'race.png'))
   page.wait_for_function('__EA888_DEBUG__.race().finished === true',timeout=180000)
   r['race']=page.evaluate('__EA888_DEBUG__.race()');r['result']=page.evaluate('__EA888_DEBUG__.lastDrag()')
   assert r['race']['distanceM']>=402.336, r['race']
   assert r['result']['rosterId']==car and r['result']['quarter']>0,r['result']
   print('FINISH',car,r['result']['quarter'],flush=True)
   page.wait_for_selector('[data-action="finish-replay"]',timeout=30000);page.locator('[data-action="finish-replay"]').click()
   page.wait_for_function('__EA888_DEBUG__.vehicle().replay?.player?.state === "ready"',timeout=60000)
   r['replayIdentity']=page.evaluate('__EA888_DEBUG__.vehicle().replay');assert r['replayIdentity']['player']['carId']==car
   page.screenshot(path=str(folder/'replay.png'));page.locator('[data-action="replay-close"]').click();page.evaluate('__EA888_DEBUG__.qaCloseRace()')
   assert page.evaluate('localStorage.getItem("ea888_lab_v120_state")')==original,'QA changed career storage'
   (out/'smoke.json').write_text(json.dumps(report,indent=2))
  ctx.close();browser.close()
 report['seconds']=time.time()-start;report['ok']=not report['errors'];(out/'smoke.json').write_text(json.dumps(report,indent=2));print(json.dumps({'ok':report['ok'],'seconds':report['seconds'],'errors':report['errors']}),flush=True)

if __name__=='__main__':main()
