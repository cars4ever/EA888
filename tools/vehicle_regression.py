#!/usr/bin/env python3
"""Real UI and WebGL regression checks using isolated origin/storage; no user saves touched."""
import json,subprocess,tempfile
from pathlib import Path
from playwright.sync_api import sync_playwright
import browser_env
from browser_smoke import serve_assets,APP_ORIGIN

def main():
 out=Path('reports/vehicle-regression');out.mkdir(parents=True,exist_ok=True);report={}
 with tempfile.TemporaryDirectory() as tmp:
  bundle=Path(tmp)/'harness.js'
  subprocess.run(['node_modules/.bin/esbuild','tests/vehicle_runtime_harness.js','--bundle','--format=iife',f'--outfile={bundle}'],check=True,capture_output=True)
  with sync_playwright() as pw:
   browser=pw.chromium.launch(**browser_env.launch_kwargs(pw,['--no-sandbox','--enable-unsafe-swiftshader']))
   ctx=browser.new_context(viewport={'width':412,'height':915},device_scale_factor=1,is_mobile=True,has_touch=True)
   serve_assets(ctx,Path('build/web').resolve());page=ctx.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
   page.goto(APP_ORIGIN+'/assets/index.html');page.wait_for_selector('[data-starter-car]');assert page.locator('[data-starter-car]').count()==6
   page.locator('[data-starter-car=eagle]').click();assert page.locator('[data-action=confirm-starter]').is_disabled()
   page.locator('[data-starter-car=crc12_jackstand_240]').click();page.locator('[data-action=confirm-starter]').click()
   key='ea888_lab_v120_state';save=page.evaluate('(k)=>JSON.parse(localStorage.getItem(k))',key)
   assert save['bank']==37769 and save['garage']['active']=='crc12_jackstand_240'
   page.reload();page.wait_for_function('!!window.__EA888_DEBUG__');assert page.locator('.starter-selection').count()==0
   assert page.evaluate('(k)=>JSON.parse(localStorage.getItem(k)).bank',key)==37769
   report['starterPurchaseOnce']=True
   # Existing careers retain money, upgrades and record; unknown active IDs get a visible notice.
   save.pop('vehicleSaveVersion',None);save.pop('starterSelection',None)
   save['garage']['cars']['removed']={'paidEur':123,'record':{'runs':7}};save['garage']['active']='removed'
   page.evaluate('([k,s])=>localStorage.setItem(k,JSON.stringify(s))',[key,save]);page.reload();page.wait_for_function('!!window.__EA888_DEBUG__')
   assert 'niet beschikbaar' in page.locator('#content').inner_text()
   assert page.evaluate('(k)=>!!localStorage.getItem(k+"_before_vehicles_v1")',key)
   real=page.evaluate('(k)=>localStorage.getItem(k)',key)
   report['legacyBackupAndNotice']=True
   page.goto(APP_ORIGIN+'/assets/index.html?profile=vehicle-qa');page.wait_for_function('!!window.__EA888_DEBUG__')
   qa='ea888_vehicle_qa_v1';assert page.evaluate('(k)=>JSON.parse(localStorage.getItem(k)).bank',qa)==10000000
   page.evaluate('()=>{const k="ea888_vehicle_qa_v1",s=JSON.parse(localStorage.getItem(k));s.bank-=1000;localStorage.setItem(k,JSON.stringify(s));}')
   page.reload();page.wait_for_function('!!window.__EA888_DEBUG__');assert page.evaluate('(k)=>JSON.parse(localStorage.getItem(k)).bank',qa)==9999000
   page.evaluate('()=>{for(const id of ["eagle","mullet","mcflurry","lumberjack","crc12_jackstand_240"])__EA888_DEBUG__.qaDrive(id)}')
   page.wait_for_function('__EA888_DEBUG__.vehicle().showroom?.state==="ready"');assert page.evaluate('__EA888_DEBUG__.vehicle().showroom.carId')=='crc12_jackstand_240'
   report['rapidSwitchAndQaCash']=True
   page.locator('[data-nav=tune]').click();before=page.evaluate('(k)=>localStorage.getItem(k)',qa)
   page.evaluate('()=>{const i=document.createElement("input");i.dataset.tune="launchRpm";i.value=9999;document.body.append(i);i.dispatchEvent(new Event("input",{bubbles:true}));i.remove();}')
   assert page.evaluate('(k)=>localStorage.getItem(k)',qa)==before
   report['staleWorkshopEventBlocked']=True
   ctx.route('**/models/eagle.glb*',lambda route:route.fulfill(status=404,body=''))
   page.evaluate('__EA888_DEBUG__.qaDrive("eagle")');page.wait_for_function('__EA888_DEBUG__.vehicle().showroom?.state==="fallback"')
   assert 'MODEL ONTBREEKT' in page.locator('#vehicle-model-status').inner_text();page.screenshot(path=str(out/'missing-model-mobile.png'))
   ctx.unroute('**/models/eagle.glb*');report['missingModelVisible']=True
   page.locator('[data-nav=service]').click() # dispose showroom before resource accounting
   page.add_script_tag(content=bundle.read_text());report['resources']=page.evaluate('checkVehicleResources()')
   report['pairs']=[]
   for a,b in [('eagle','mullet'),('mcflurry','lumberjack'),('crc12_jackstand_240','crc12_jackstand_240')]:
    r=page.evaluate('''async ([a,b])=>{const c=document.createElement('canvas');document.body.append(c);c.style.width='300px';c.style.height='180px';const r=EA888Race3D.create(c,{playerCarId:a,rivalCarId:b,headsUp:true,quality:'low',drivetrain:'RWD'});await r.ready;r.update({distanceM:0,speedKmh:36},.1);r.update({distanceM:1,speedKmh:36,wheelspinPct:35,lateralVelocity:.5},.1);const result={identity:r.vehicles(),rig:r.rig()};r.dispose();c.remove();return result;}''',[a,b])
    assert r['identity']['player']['carId']==a and r['identity']['rival']['carId']==b
    assert all(abs(v)>0 for v in r['rig']['spin']);assert abs(r['rig']['steer'][0])>0 and r['rig']['steer'][2]==0
    report['pairs'].append(r)
   assert page.evaluate('(k)=>localStorage.getItem(k)',key)==real
   # A converter-equipped V8 must show its own transmission and emit eight-cylinder audio.
   page.evaluate('__EA888_DEBUG__.qaDrive("crc12_jackstand_240")');page.locator('[data-nav=dyno]').click();page.locator('[data-action=start-dyno]').click()
   page.wait_for_function('__EA888_DEBUG__.dyno()?.status==="completed" && __EA888_DEBUG__.dyno()?.current',timeout=90000)
   page.locator('[data-nav=drag]').click()
   page.locator('[data-action=auto-drag-game]').click()
   page.wait_for_function('__EA888_DEBUG__.race().distanceM > 1',timeout=90000)
   page.wait_for_function('__EA888_DEBUG__.audio().ready && __EA888_DEBUG__.audio().synthStats?.fired > 0',timeout=30000)
   assert 'AUTOMAAT' in page.locator('#v7-dsg-status').inner_text()
   assert 'DSG' not in page.locator('#v7-dsg-status').inner_text()
   audio=page.evaluate('__EA888_DEBUG__.audio()');assert '8 cilinders' in audio['model']
   report['v8TransmissionAndAudio']={'model':audio['model'],'fired':audio['synthStats']['fired']}
   page.evaluate('__EA888_DEBUG__.qaCloseRace()')
   page.evaluate('__EA888_DEBUG__.qaDrive("scirocco")');page.locator('[data-go=data]').first.click()
   page.locator('[data-action=career-profile]').click();page.wait_for_function('!!window.__EA888_DEBUG__ && !__EA888_DEBUG__.vehicle().qa')
   assert page.evaluate('(k)=>JSON.parse(localStorage.getItem(k)).bank',key)==37769
   report['returnToCareerFromScirocco']=True
   report['careerIsolated']=True;report['errors']=errors;assert not errors,errors
   ctx.close();browser.close()
 report['platform']='Chromium mobile emulation + SwiftShader, not Android';report['ok']=True
 (out/'report.json').write_text(json.dumps(report,indent=2));print(json.dumps(report),flush=True)

if __name__=='__main__':main()
