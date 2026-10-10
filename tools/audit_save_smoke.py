#!/usr/bin/env python3
"""Audit P0: real IndexedDB, full V8 state and transaction failure. Isolated browser only."""
import json,time
from pathlib import Path
from playwright.sync_api import sync_playwright
from browser_smoke import serve_assets,APP_ORIGIN
import browser_env
OUT=Path('reports/audit-repair/saves');OUT.mkdir(parents=True,exist_ok=True)
with sync_playwright() as pw:
 b=pw.chromium.launch(**browser_env.launch_kwargs(pw,['--no-sandbox','--disable-dev-shm-usage','--enable-unsafe-swiftshader']))
 c=b.new_context(viewport={'width':412,'height':892});serve_assets(c,Path('build/web').resolve());p=c.new_page();errors=[];p.on('pageerror',lambda e:errors.append(str(e)))
 p.goto(APP_ORIGIN+'/assets/index.html');p.wait_for_function('!!window.__EA888_DEBUG__')
 result=p.evaluate('''async()=>{
  const C=EA888Core,S=EA888Saves,codec=EA888SaveCodec,assert=(x,m)=>{if(!x)throw new Error(m)};
  const store=await new S.Store(C,codec,'1.31.0','audit-save-test').open();
  let old=C.createVehicleQA();old.bank=3139;old.garage.active='crc12_jackstand_240';old=C.restoreGarageState(old);old.wear.engine=17;old.damage.turbo=3;old.tune.lambda=.83;old.service.oilAgeKm=314;old.nitrous.kg=.7;old.bench.results.test={ok:true};old.records.marker={quarter:9.2};old=C.persistGarageState(old);
  const original=JSON.stringify(old),m=await store.bootstrap(old,false);assert(m.state.bank===10000000,'real grant');assert(JSON.stringify(old)===original,'input mutated');
  const active=C.restoreGarageState(m.state);assert(active.wear.engine===17&&active.nitrous.kg===.7&&active.tune.lambda===.83,'V8 lost');
  const career=await store.read('legacy-career');assert(career.state.bank===3139&&career.state.gameMode==='career','career changed');
  const qa=await store.bootstrap(C.createVehicleQA(),true);assert(qa.profile.mode==='qa','QA separated');
  let s=m.state;s.bank-=650;await store.commit(m.profile.id,s,'Onderhoud');const again=await store.bootstrap(old,false);assert(again.state.bank===9999350,'second grant');
  for(let i=0;i<5;i++){s.bank-=i+1;await store.commit(m.profile.id,s,'slot '+i,i,'Mijn save '+i);}
  const all=await store.read(m.profile.id);assert(all.profile.slots.length===5&&all.profile.autos.length===3,'rotation');
  for(const slot of all.profile.slots){const r=await store.read(m.profile.id,slot.ref);assert(C.restoreGarageState(r.state).service.oilAgeKm===314,'slot lost service');}
  const restored=C.restoreGarageState(all.state),back=C.switchGarageCar(C.switchGarageCar(restored,'scirocco'),'crc12_jackstand_240');assert(JSON.stringify(C.captureBuild(restored))===JSON.stringify(C.captureBuild(back)),'car switch lost build');
  const text=JSON.stringify({app:'EA888-LAB',kind:'full-backup',state:all.state}),copy=await store.create('Import','workshop',S.decodeImport(text,codec));
  assert(JSON.stringify((await store.read(copy.id)).state)===JSON.stringify(all.state),'full import mismatch');
  const write=store.transaction.bind(store);store.transaction=(mode,fn)=>mode==='readwrite'?Promise.reject(new DOMException('test quota','QuotaExceededError')):write(mode,fn);
  let failed=false;try{await store.commit(m.profile.id,{...s,bank:123},'failure');}catch(e){failed=true;}assert(failed,'error hidden');store.transaction=write;
  assert((await store.read(m.profile.id)).state.bank===all.state.bank,'failed write overwrote good save');
  await store.transaction('readwrite',async x=>{const r=x.snapshots.get(all.profile.current);r.onsuccess=()=>{const a=r.result;a.payload+='broken';x.snapshots.put(a);};});
  failed=false;try{await store.read(m.profile.id);}catch(e){failed=true;}assert(failed,'corruption ignored');
  const good=await store.read(m.profile.id,all.profile.lastGood);assert(Number.isFinite(good.state.bank),'no recovery');await store.commit(m.profile.id,good.state,'recovery');
  await store.commit(copy.id,all.state,'repair shared payload');await store.activate(copy.id);await store.remove(m.profile.id,4);assert((await store.read(m.profile.id)).profile.slots[4]===null,'slot delete');
  return {ok:true,grant:10000000,career:career.state.bank,manualSlots:5,autos:3,allV8FieldsPreserved:true,corruptAndFailedWriteProtected:true,fullImport:true};
 }''')
 p.locator('[data-action=game-manager]').first.click();p.wait_for_selector('.save-row');p.screenshot(path=str(OUT/'game-manager.png'))
 p.locator('[data-action=game-new]').click();p.locator('#profile-name').fill('Mijn echte werkplaats');p.locator('[data-action=game-create-confirm]').click();p.wait_for_function('__EA888_DEBUG__.profile().name==="Mijn echte werkplaats"')
 assert p.evaluate('__EA888_DEBUG__.saveSnapshot().bank')==10000000
 p.locator('[data-action=confirm-starter]').click();p.evaluate('__EA888_DEBUG__.flushSave()');p.reload();p.wait_for_function('!!window.__EA888_DEBUG__');assert p.evaluate('__EA888_DEBUG__.profile().name')=='Mijn echte werkplaats'
 p.screenshot(path=str(OUT/'workshop-budget.png'));result['uiProfileSurvivesRestart']=True;result['errors']=errors;assert not errors
 # Real application migration from the old root key, not only the Store API.
 legacy=p.evaluate("()=>{const C=EA888Core;let s=C.switchGarageCar(C.createVehicleQA(),'crc12_jackstand_240');s.bank=3139;s.wear.engine=17;s.service.oilAgeKm=314;return C.persistGarageState(s);}")
 c2=b.new_context(viewport={'width':412,'height':892});serve_assets(c2,Path('build/web').resolve())
 c2.add_init_script("if(!localStorage.getItem('audit-seeded')){localStorage.setItem('ea888_lab_v120_state',"+json.dumps(json.dumps(legacy))+");localStorage.setItem('audit-seeded','1');}")
 q=c2.new_page();q.goto(APP_ORIGIN+'/assets/index.html');q.wait_for_function('!!window.__EA888_DEBUG__')
 migrated=q.evaluate('EA888Core.restoreGarageState(__EA888_DEBUG__.saveSnapshot())');assert migrated['bank']==10000000 and migrated['wear']['engine']==17 and migrated['service']['oilAgeKm']==314
 assert q.evaluate("JSON.parse(localStorage.getItem('ea888_lab_v120_state')).bank")==3139
 q.screenshot(path=str(OUT/'actual-legacy-workshop-migration.png'));result['actualLegacyWorkshop']=True
 # Create a distinct latest snapshot, corrupt it, restart, and recover through visible controls.
 q.evaluate("async()=>{const d=__EA888_DEBUG__,s=d.saveSnapshot();s.bank-=650;await d.saveStore().commit(d.profile().id,s,'Onderhoud');}")
 q.reload();q.wait_for_function('!!window.__EA888_DEBUG__');assert q.evaluate('__EA888_DEBUG__.saveSnapshot().bank')==9999350
 q.evaluate("async()=>{const d=__EA888_DEBUG__,store=d.saveStore(),id=d.profile().current;await store.transaction('readwrite',x=>{const r=x.snapshots.get(id);r.onsuccess=()=>{const s=r.result;s.payload+='broken';x.snapshots.put(s);};});}")
 q.reload();q.wait_for_function('!!window.__EA888_DEBUG__');assert q.evaluate('!!__EA888_DEBUG__.saveSnapshot().saveRecoveryError')
 q.locator('[data-action=game-manager]').first.click();q.wait_for_selector('[data-load-ref]');q.screenshot(path=str(OUT/'corrupt-save-recovery.png'))
 good=q.evaluate('__EA888_DEBUG__.profile().lastGood');q.locator('[data-load-ref="'+good+'"]').first.click();q.locator('[data-confirm-load]').click();q.wait_for_function('!__EA888_DEBUG__.saveSnapshot().saveRecoveryError');assert q.evaluate('__EA888_DEBUG__.saveSnapshot().bank')==10000000
 result['recoveryThroughUI']=True;c2.close()
 (OUT/'report.json').write_text(json.dumps(result,indent=2));print(result);b.close()
