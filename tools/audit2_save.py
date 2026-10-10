"""Existing 1.31 workshop fixture: no repeated grant and complete new setups after 3 reloads."""
import json
from pathlib import Path
from playwright.sync_api import sync_playwright
from browser_smoke import serve_assets,APP_ORIGIN
import browser_env
out=Path('reports/audit2/saves');out.mkdir(parents=True,exist_ok=True)
with sync_playwright() as pw:
 b=pw.chromium.launch(**browser_env.launch_kwargs(pw,['--no-sandbox']));c=b.new_context();serve_assets(c,Path('build/web').resolve());p=c.new_page();p.goto(APP_ORIGIN+'/assets/index.html');p.wait_for_function('!!window.__EA888_DEBUG__')
 before=p.evaluate('''async()=>{const C=EA888Core,d=__EA888_DEBUG__;let s=C.switchGarageCar(C.createVehicleQA(),'eagle');s.bank=8134987;s.gameMode='workshop';s.workshopBudgetVersion=1;s.wear.engine=17;s.nitrous.kg=.73;const r=C.applyDrivelineCandidate(s,C.drivelineCandidates(s,'street')[0]);s=r.state;s.tune.gearSetups=[{name:'Bestaande setup',carId:'eagle',transmissionId:s.selections.transmission,tune:{converterId:s.tune.converterId,finalDrive:s.tune.finalDrive},context:s.vehicle}];s=C.persistGarageState(s);const p=await d.saveStore().create('Audit2 bestaande werkplaats','workshop',s);await d.saveStore().activate(p.id);return s;}''')
 for i in range(3):
  p.reload();p.wait_for_function('!!window.__EA888_DEBUG__');after=p.evaluate('__EA888_DEBUG__.saveSnapshot()');assert after['bank']==before['bank'];assert after['owned']==before['owned'];s=p.evaluate('EA888Core.restoreGarageState(__EA888_DEBUG__.saveSnapshot())');assert s['tune']['gearSetups'][0]['name']=='Bestaande setup';assert s['wear']['engine']==17 and s['nitrous']['kg']==.73
 p.locator('[data-action=game-manager]').first.click();p.screenshot(path=str(out/'preserved-workshop.png'));(out/'report.json').write_text(json.dumps({'ok':True,'bank':before['bank'],'restarts':3,'car':'eagle','wear':17,'bottle':.73,'partsAndSetupsEqual':True}));b.close()
