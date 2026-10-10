#!/usr/bin/env python3
"""Large real IndexedDB snapshots and corrupt legacy import, on isolated origins."""
import json,subprocess,tempfile,os
from pathlib import Path
from playwright.sync_api import sync_playwright
from browser_smoke import serve_assets,APP_ORIGIN
import browser_env
OUT=Path('reports/audit-repair/storage-stress');OUT.mkdir(parents=True,exist_ok=True)
with tempfile.TemporaryDirectory() as tmp:
 f=Path(tmp)/'save.json'
 with (OUT/'fixture.log').open('w') as log:subprocess.run(['node','tests/test_save_codec.js'],env={**os.environ,'EA888_SAVE_STRESS_OUT':str(f)},stdout=log,stderr=subprocess.STDOUT,check=True)
 with sync_playwright() as pw:
  b=pw.chromium.launch(**browser_env.launch_kwargs(pw,['--no-sandbox','--enable-unsafe-swiftshader']))
  c=b.new_context();serve_assets(c,Path('build/web').resolve());c.add_init_script("localStorage.setItem('ea888_lab_v120_state','{broken');")
  p=c.new_page();p.goto(APP_ORIGIN+'/assets/index.html');p.wait_for_function('!!window.__EA888_DEBUG__');assert p.evaluate('!!__EA888_DEBUG__.saveSnapshot().saveRecoveryError');assert p.evaluate('async()=> (await __EA888_DEBUG__.saveStore().list()).length')==0;assert p.evaluate("localStorage.getItem('ea888_lab_v120_state')")=='{broken';c.close()
  c=b.new_context();serve_assets(c,Path('build/web').resolve());p=c.new_page();p.goto(APP_ORIGIN+'/assets/index.html');p.wait_for_function('!!window.__EA888_DEBUG__')
  result=p.evaluate('''async raw=>{
   const d=__EA888_DEBUG__,store=d.saveStore(),s=EA888SaveCodec.parse(raw);s.gameMode='workshop';s.workshopBudgetVersion=1;
   const profile=await store.create('Alle volledige histories','workshop',s);await store.activate(profile.id);
   const loaded=await store.read(profile.id),text=JSON.stringify({app:'EA888-LAB',kind:'full-backup',formatVersion:1,state:loaded.state});
   if(text.length<5000000)throw Error('fixture too small');const imported=EA888Saves.decodeImport(text,EA888SaveCodec);
   const counts=x=>({root:[x.dynoRuns.length,x.dragRuns.length],cars:Object.fromEntries(Object.entries(x.garage.cars).map(([id,c])=>[id,[c.build.dynoRuns.length,c.build.dragRuns.length]]))});
   if(JSON.stringify(counts(imported))!==JSON.stringify(counts(s)))throw Error('large export changed histories');
   await store.commit(profile.id,loaded.state,'Handmatig',4,'Volledige histories');return {ok:true,exportCharacters:text.length,compressedCharacters:raw.length,counts:counts(imported)};
  }''',f.read_text())
  p.reload();p.wait_for_function('!!window.__EA888_DEBUG__',timeout=90000);assert p.evaluate('__EA888_DEBUG__.profile().name')=='Alle volledige histories'
  counts=p.evaluate('''()=>{const s=__EA888_DEBUG__.saveSnapshot();return {root:[s.dynoRuns.length,s.dragRuns.length],cars:Object.fromEntries(Object.entries(s.garage.cars).map(([id,c])=>[id,[c.build.dynoRuns.length,c.build.dragRuns.length]]))};}''');assert counts==result['counts'];assert all(x==[20,30] for x in counts['cars'].values());assert counts['root']==[20,30]
  result.update(restart=True,corruptLegacyNotOverwritten=True,platform='Chromium IndexedDB');(OUT/'report.json').write_text(json.dumps(result,indent=2));print(result);b.close()
