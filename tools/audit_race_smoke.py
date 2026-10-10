#!/usr/bin/env python3
"""Audit regressions in the actual game at a portrait mobile viewport (not an Android device)."""
import json,time,sys
from pathlib import Path
from playwright.sync_api import sync_playwright
from browser_smoke import serve_assets,APP_ORIGIN
import browser_env
OUT=Path('reports/audit-repair/race');OUT.mkdir(parents=True,exist_ok=True)
with sync_playwright() as pw:
 b=pw.chromium.launch(**browser_env.launch_kwargs(pw,['--no-sandbox','--disable-dev-shm-usage','--enable-unsafe-swiftshader']))
 c=b.new_context(viewport={'width':412,'height':892},device_scale_factor=1,is_mobile=True,has_touch=True,record_video_dir=str(OUT/'video'),record_video_size={'width':412,'height':892});serve_assets(c,Path('build/web').resolve())
 p=c.new_page();errors=[];p.on('pageerror',lambda e:errors.append(str(e)));report={'platform':'Chromium mobile emulation / SwiftShader','runs':{},'errors':errors}
 if '--inputs-only' in sys.argv and (OUT/'report.json').exists():report['runs']=json.loads((OUT/'report.json').read_text())['runs']
 p.goto(APP_ORIGIN+'/assets/index.html?profile=vehicle-qa');p.wait_for_function('!!window.__EA888_DEBUG__')
 def click(sel):p.locator(sel).first.evaluate('(e)=>e.click()')
 def dyno():
  click('[data-nav=dyno]');click('[data-action=start-dyno]');p.wait_for_selector('[data-action=abort-dyno]',state='detached',timeout=90000);p.wait_for_function('__EA888_DEBUG__.dyno()?.status==="completed"&&__EA888_DEBUG__.dyno()?.current',timeout=90000);p.evaluate('__EA888_DEBUG__.flushSave()');click('[data-nav=drag]');click('[data-race-panel=tree]')
 for car in ([] if '--inputs-only' in sys.argv else ['crc12_jackstand_240','eagle','mullet','mcflurry','lumberjack','scirocco']):
  print('START',car,flush=True);assert p.evaluate('id=>__EA888_DEBUG__.qaDrive(id)',car)
  p.wait_for_function('__EA888_DEBUG__.vehicle().showroom?.state==="ready"',timeout=60000)
  p.evaluate('__EA888_DEBUG__.showroomView(0)');p.screenshot(path=str(OUT/(car+'-rear.png')))
  dyno();p.screenshot(path=str(OUT/(car+'-overview.png')));assert p.evaluate('__EA888_DEBUG__.qaStartRun()')
  p.wait_for_function('__EA888_DEBUG__.vehicle().race?.player?.state==="ready"',timeout=60000)
  p.wait_for_function('__EA888_DEBUG__.race().distanceM>35',timeout=90000);p.screenshot(path=str(OUT/(car+'-run.png')))
  r=p.evaluate('__EA888_DEBUG__.vehicle()');assert r['active']==r['simId']==r['race']['player']['carId']==car
  p.wait_for_function('__EA888_DEBUG__.race().finished',timeout=180000);result=p.evaluate('__EA888_DEBUG__.lastDrag()');assert result['valid'] and result['quarter']>0,result
  assert (result['rosterId'] or 'scirocco')==car
  report['runs'][car]={'quarter':result['quarter'],'trapKmh':result['trapKmh'],'distanceM':result['distanceM'],'model':r['race']['player'],'thermal':result['thermalLog']}
  p.screenshot(path=str(OUT/(car+'-finish.png')));click('[data-action=finish-replay]');p.wait_for_function('__EA888_DEBUG__.vehicle().replay?.player?.state==="ready"',timeout=60000);p.screenshot(path=str(OUT/(car+'-replay.png')));click('[data-action=replay-close]');p.evaluate('__EA888_DEBUG__.qaCloseRace()');print('PASS',car,result['quarter'],flush=True)
  (OUT/'report.json').write_text(json.dumps(report,indent=2))
 # Steer outside the actual lane at speed, then verify no invented finish and no record update.
 p.evaluate('__EA888_DEBUG__.qaDrive("crc12_jackstand_240")');dyno();record=p.evaluate('JSON.stringify(__EA888_DEBUG__.garage().cars.crc12_jackstand_240.best)');assert p.evaluate('__EA888_DEBUG__.qaStartRun()');p.evaluate('__EA888_DEBUG__.setDriverAssistForTest(false)')
 p.wait_for_function('__EA888_DEBUG__.race().distanceM>100',timeout=90000)
 p.dispatch_event('[data-v7-control=steerRight]','pointerdown',{'pointerId':71,'pointerType':'touch','isPrimary':True,'button':0})
 p.wait_for_function('__EA888_DEBUG__.race().finished',timeout=90000);r=p.evaluate('__EA888_DEBUG__.lastDrag()');assert r['laneDnf'] and not r['valid'] and r['quarter'] is None and r['trapKmh'] is None,r
 assert p.evaluate('JSON.stringify(__EA888_DEBUG__.garage().cars.crc12_jackstand_240.best)')==record
 assert 'DNF' in p.locator('.v8-finish-card').inner_text();p.screenshot(path=str(OUT/'dnf.png'));report['dnf']=r;(OUT/'report.json').write_text(json.dumps(report,indent=2))
 p.evaluate('__EA888_DEBUG__.qaCloseRace()');dyno();p.evaluate('__EA888_DEBUG__.setPreRace3dForTest(false)');click('[data-action=open-drag-game]');p.evaluate('__EA888_DEBUG__.enterStageForTest()')
 p.dispatch_event('[data-v7-control=creep]','pointerdown',{'pointerId':72,'pointerType':'touch','isPrimary':True,'button':0});p.wait_for_function('__EA888_DEBUG__.stageState().progress>=60',timeout=30000);p.dispatch_event('[data-v7-control=creep]','pointerup',{'pointerId':72,'pointerType':'touch'})
 p.wait_for_timeout(650);assert not p.evaluate('__EA888_DEBUG__.stageState().treeStarted')
 p.dispatch_event('[data-v7-control=throttle]','pointerdown',{'pointerId':73,'pointerType':'touch','isPrimary':True,'button':0});p.wait_for_function('__EA888_DEBUG__.stageState().treeStarted',timeout=15000)
 p.screenshot(path=str(OUT/'hold-release.png'));p.dispatch_event('[data-v7-control=throttle]','pointerup',{'pointerId':73,'pointerType':'touch'});p.wait_for_function('__EA888_DEBUG__.race().phase==="run"');assert p.evaluate('__EA888_DEBUG__.raceReaction().redLight');p.screenshot(path=str(OUT/'redlight.png'));report['redlight']=p.evaluate('__EA888_DEBUG__.raceReaction()')
 # Native pause has the same input-clearing and invalidation path as backgrounding Android.
 p.evaluate('__ea888OnNativePause()');p.wait_for_function('__EA888_DEBUG__.race().finished');assert not p.evaluate('__EA888_DEBUG__.lastDrag().valid');report['pauseInvalidates']=True;assert not any(p.evaluate('__EA888_DEBUG__.controls').values())
 # Cancellation is not a launch. Repeat with two simultaneous fingers and then a valid release.
 p.evaluate('__EA888_DEBUG__.qaCloseRace()');dyno();click('[data-action=open-drag-game]');p.evaluate('__EA888_DEBUG__.enterStageForTest()')
 def stage():
  p.dispatch_event('[data-v7-control=creep]','pointerdown',{'pointerId':81,'pointerType':'touch','button':0});p.wait_for_function('__EA888_DEBUG__.stageState().progress>=60',timeout=30000);p.dispatch_event('[data-v7-control=creep]','pointerup',{'pointerId':81,'pointerType':'touch'})
 stage();p.dispatch_event('[data-v7-control=throttle]','pointerdown',{'pointerId':82,'pointerType':'touch','button':0});p.wait_for_function('__EA888_DEBUG__.stageState().treeStarted',timeout=15000);p.dispatch_event('[data-v7-control=throttle]','pointercancel',{'pointerId':82,'pointerType':'touch'});assert p.evaluate('__EA888_DEBUG__.race().phase')=='stage';assert not p.evaluate('__EA888_DEBUG__.stageState().treeStarted');report['pointerCancelDoesNotLaunch']=True
 stage();p.dispatch_event('[data-v7-control=throttle]','pointerdown',{'pointerId':83,'pointerType':'touch','button':0});p.wait_for_function('__EA888_DEBUG__.stageState().green',timeout=15000);p.dispatch_event('[data-v7-control=throttle]','pointerup',{'pointerId':83,'pointerType':'touch'});p.wait_for_function('__EA888_DEBUG__.race().phase==="run"');rt=p.evaluate('__EA888_DEBUG__.raceReaction()');assert not rt['redLight'] and rt['reactionTime']>=0;report['greenRelease']=rt
 p.dispatch_event('[data-v7-control=steerLeft]','pointerdown',{'pointerId':84,'pointerType':'touch','button':0});p.locator('#v7-throttle-slider').evaluate("e=>{e.value=55;e.dispatchEvent(new Event('input',{bubbles:true}));}");assert p.evaluate('__EA888_DEBUG__.controls.steerLeft&&__EA888_DEBUG__.race().pedal===.55');report['simultaneousThrottleSteer']=True;p.dispatch_event('[data-v7-control=steerLeft]','pointerup',{'pointerId':84,'pointerType':'touch'});p.screenshot(path=str(OUT/'final-hud.png'));p.evaluate('__ea888OnNativePause()')
 p.evaluate('__EA888_DEBUG__.flushSave()');p.reload();p.wait_for_function('!!window.__EA888_DEBUG__');assert p.evaluate('__EA888_DEBUG__.vehicle().active')=='crc12_jackstand_240';report['restart']=True
 assert not errors,errors;report['ok']=True;(OUT/'report.json').write_text(json.dumps(report,indent=2));c.close();b.close();print('PASS audit races',flush=True)
