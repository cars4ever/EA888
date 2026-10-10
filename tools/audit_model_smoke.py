#!/usr/bin/env python3
import json,subprocess,tempfile
from pathlib import Path
from playwright.sync_api import sync_playwright
from browser_smoke import serve_assets,APP_ORIGIN
import browser_env
OUT=Path('reports/audit-repair/models');OUT.mkdir(parents=True,exist_ok=True)
with tempfile.TemporaryDirectory() as tmp:
 bundle=Path(tmp)/'harness.js';subprocess.run(['node_modules/.bin/esbuild','tests/vehicle_runtime_harness.js','--bundle','--format=iife','--outfile='+str(bundle)],check=True)
 with sync_playwright() as pw:
  b=pw.chromium.launch(**browser_env.launch_kwargs(pw,['--no-sandbox','--enable-unsafe-swiftshader']));c=b.new_context(viewport={'width':412,'height':892});serve_assets(c,Path('build/web').resolve());p=c.new_page();errors=[];p.on('pageerror',lambda e:errors.append(str(e)))
  p.goto(APP_ORIGIN+'/assets/index.html?profile=vehicle-qa');p.wait_for_function('!!window.__EA888_DEBUG__');p.locator('[data-nav=service]').click();p.add_script_tag(content=bundle.read_text())
  report={'resources':p.evaluate('checkVehicleResources()'),'wheelSetup':p.evaluate('checkWheelSetup()')}
  p.evaluate('()=>{for(const id of ["eagle","mullet","mcflurry","lumberjack","crc12_jackstand_240"])__EA888_DEBUG__.qaDrive(id);}')
  p.wait_for_function('__EA888_DEBUG__.vehicle().showroom?.state==="ready"');assert p.evaluate('__EA888_DEBUG__.vehicle().showroom.carId')=='crc12_jackstand_240';report['rapidSwitch']=True
  p.evaluate('__EA888_DEBUG__.showroomView(0)');p.locator('#vehicle-showroom').screenshot(path=str(OUT/'jackstand-final-rear.png'))
  p.locator('[data-nav=tune]').click();p.locator('[data-tune-panel=als]').click();assert 'Geen turbo' in p.locator('#content').inner_text();assert p.locator('[data-als]').count()==0
  p.screenshot(path=str(OUT/'na-no-als.png'));report['naControls']=True
  p.locator('[data-tune-panel=safety]').click();assert 'Failsafe' in p.locator('#content').inner_text();p.screenshot(path=str(OUT/'full-tab-names.png'))
  c.route('**/models/eagle.glb*',lambda route:route.fulfill(status=404,body=''));p.evaluate('__EA888_DEBUG__.qaDrive("eagle")');p.wait_for_function('__EA888_DEBUG__.vehicle().showroom?.state==="fallback"');assert 'MODEL ONTBREEKT' in p.locator('#vehicle-model-status').inner_text();p.screenshot(path=str(OUT/'missing-model.png'));report['missingExplicit']=True
  report['errors']=errors;assert not errors;report['ok']=True;(OUT/'report.json').write_text(json.dumps(report,indent=2));b.close();print('PASS resource isolation, five wheel setups, rapid switch, missing model and NA controls')
