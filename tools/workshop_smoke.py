#!/usr/bin/env python3
"""Buy/build/tune/bench/dyno/service/save acceptance on an isolated browser origin.
The 10M normal-career fixture is test-only; real storage and QA remain separate.
"""
import json,time
from pathlib import Path
from playwright.sync_api import sync_playwright
import browser_env
from browser_smoke import serve_assets,APP_ORIGIN

OUT=Path('reports/workshop-ui');OUT.mkdir(parents=True,exist_ok=True)
CARS=['crc12_jackstand_240','lumberjack','mcflurry','mullet','eagle']
KEY='ea888_lab_v120_state'
def main():
 report={'platform':'desktop Chromium / SwiftShader; isolated origin, no Android device','cars':{},'errors':[]};start=time.time()
 with sync_playwright() as pw:
  b=pw.chromium.launch(**browser_env.launch_kwargs(pw,['--no-sandbox','--disable-dev-shm-usage','--enable-unsafe-swiftshader']))
  ctx=b.new_context(viewport={'width':1100,'height':900},device_scale_factor=1);serve_assets(ctx,Path('build/web').resolve())
  p=ctx.new_page();p.on('pageerror',lambda e:report['errors'].append(str(e)))
  p.goto(APP_ORIGIN+'/assets/index.html');p.wait_for_function('!!window.__EA888_DEBUG__')
  # An isolated test fixture authorizes no change to the game's normal 50K career rule.
  p.evaluate('''k=>{const s=EA888Core.createCareerSelection();s.bank=10000000;s.settings.reducedMotion=true;localStorage.setItem(k,JSON.stringify(s));}''',KEY)
  p.reload();p.wait_for_selector('[data-starter-car]')
  p.locator('[data-starter-car=crc12_jackstand_240]').click();p.locator('[data-action=confirm-starter]').click()
  assert p.evaluate('__EA888_DEBUG__.career().bank')==9987769
  p.reload();p.wait_for_function('!!window.__EA888_DEBUG__');assert p.evaluate('__EA888_DEBUG__.career().bank')==9987769
  for car in CARS[1:]:p.locator(f'[data-buy-car="{car}"]').click()
  assert p.evaluate('__EA888_DEBUG__.career().bank')==9236167
  report['fivePurchasedOnce']=True
  base=p.evaluate('k=>JSON.parse(localStorage.getItem(k))',KEY);sci=base['garage']['scirocco']
  def save():return p.evaluate('k=>JSON.parse(localStorage.getItem(k))',KEY)
  def edit(sel,value):
   p.locator(sel).evaluate('(e,v)=>{e.value=v;e.dispatchEvent(new Event("input",{bubbles:true}));e.dispatchEvent(new Event("change",{bubbles:true}));}',str(value))
  for car in CARS:
   print('WORKSHOP',car,flush=True);r={};report['cars'][car]=r
   p.locator('[data-nav=bank]').click()
   if p.evaluate('__EA888_DEBUG__.garage().active')!=car:p.locator(f'[data-drive-car="{car}"]').click()
   p.wait_for_function('__EA888_DEBUG__.vehicle().showroom?.state==="ready"',timeout=90000)
   assert p.evaluate('__EA888_DEBUG__.vehicle().simId')==car
   p.screenshot(path=str(OUT/(car+'-garage.png')))
   p.locator('[data-nav=build]').click();p.locator('[data-cat=head]').click()
   ids=p.locator('[data-part-row^="head:"]').evaluate_all('(xs)=>xs.map(e=>e.dataset.partRow.split(":")[1])')
   assert len(ids)==2 and all(x.startswith('ws_') for x in ids)
   new=next(x for x in ids if x.endswith('_race'));before=save()['bank']
   p.locator(f'[data-part-cat=head][data-part-id="{new}"]').click()
   after=save();assert after['bank']<before and after['garage']['cars'][car]['build']['selections']['head']==new
   paid=before-after['bank'];p.screenshot(path=str(OUT/(car+'-shop.png')))
   # Refit the included heads and the purchased ones: no second deduction.
   old=new.replace('_race','_base');p.locator(f'[data-part-cat=head][data-part-id="{old}"]').click();p.locator(f'[data-part-cat=head][data-part-id="{new}"]').click()
   assert save()['bank']==after['bank'];r['headsPaidOnce']=paid
   p.locator('[data-motor-panel=bench]').click()
   for test in p.locator('[data-run-bench]').evaluate_all('(xs)=>xs.map(e=>e.dataset.runBench)'):p.locator(f'[data-run-bench="{test}"]').click()
   r['bench']=save()['garage']['cars'][car]['build']['bench']['results'];assert len(r['bench'])>=4
   p.locator('[data-nav=tune]').click()
   for panel in ['boost','cams','gearing','safety','tables','als','fuel']:
    p.locator(f'[data-tune-panel="{panel}"]').click();assert p.locator('.roster-workshop').count()==0
   pressure=p.locator('[data-tune=railTargetBar]');assert float(pressure.get_attribute('max'))<=10
   target=.80 if car=='crc12_jackstand_240' else .72 if car in ['eagle','mullet'] else .78
   edit('[data-tune=lambda]',target);p.screenshot(path=str(OUT/(car+'-tune.png')))
   p.locator('[data-nav=dyno]').click()
   assert p.evaluate('(id)=>EA888Core.rosterCarData(id).displayName',car).lower() in p.locator('.dyno-watermark').inner_text().lower()
   p.locator('[data-action=start-dyno]').click()
   p.wait_for_function('__EA888_DEBUG__.dyno()?.current && __EA888_DEBUG__.dyno()?.status === "completed"',timeout=90000)
   r['dyno']=p.evaluate('__EA888_DEBUG__.dyno()');p.screenshot(path=str(OUT/(car+'-dyno.png')))
   p.locator('[data-nav=service]').click();before=save()['bank'];p.locator('[data-action=oil-change]').click();assert save()['bank']<before
   assert save()['garage']['cars'][car]['build']['service']['oilAgeKm']==0
   before=save()['bank'];p.locator('[data-action=open-rebuild]').click();p.locator('[data-action=confirm-rebuild]').click();assert save()['bank']<before
   assert save()['garage']['cars'][car]['build']['wear']['engine']==0;r['service']=True
   p.reload();p.wait_for_function('!!window.__EA888_DEBUG__');snap=save()
   assert snap['garage']['active']==car and snap['garage']['cars'][car]['build']['selections']['head']==new
   assert snap['garage']['cars'][car]['build']['tune']['lambda']==target
   assert snap['garage']['scirocco']==sci,'V8 work changed Scirocco'
   r['restartAndIsolation']=True
   (OUT/'report.json').write_text(json.dumps(report,indent=2))
  # The v2 import/export format can be reopened and switched repeatedly without losing builds.
  saved=save()
  for car in ['scirocco',*CARS,'scirocco']:
   p.locator(f'[data-drive-car="{car}"]').click()
  assert save()['bank']==saved['bank'];assert save()['garage']['scirocco']==sci
  career=p.evaluate('k=>localStorage.getItem(k)',KEY)
  p.goto(APP_ORIGIN+'/assets/index.html?profile=vehicle-qa');p.wait_for_function('!!window.__EA888_DEBUG__')
  assert p.evaluate('__EA888_DEBUG__.career().bank')==10000000
  assert p.evaluate('k=>localStorage.getItem(k)',KEY)==career
  report['qaSeparateTenMillion']=True
  assert not report['errors'],report['errors'];b.close()
 report.update(ok=True,seconds=time.time()-start);(OUT/'report.json').write_text(json.dumps(report,indent=2));print('PASS workshop UI',round(report['seconds']),flush=True)
if __name__=='__main__':main()
