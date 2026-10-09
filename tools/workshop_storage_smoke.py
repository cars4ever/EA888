#!/usr/bin/env python3
"""Actual browser quota and round-trip with all six full histories, plus corrupt-save preservation."""
import json,subprocess,tempfile,os
from pathlib import Path
from playwright.sync_api import sync_playwright
import browser_env
from browser_smoke import serve_assets,APP_ORIGIN
out=Path('reports/workshop-storage');out.mkdir(parents=True,exist_ok=True)
with tempfile.TemporaryDirectory() as tmp:
 f=Path(tmp)/'save.json'
 subprocess.run(['node','tests/test_save_codec.js'],env={**os.environ,'EA888_SAVE_STRESS_OUT':str(f)},check=True,stdout=(out/'node.log').open('w'))
 with sync_playwright() as pw:
  b=pw.chromium.launch(**browser_env.launch_kwargs(pw,['--no-sandbox','--disable-dev-shm-usage','--enable-unsafe-swiftshader']))
  c=b.new_context();serve_assets(c,Path('build/web').resolve());p=c.new_page();p.goto(APP_ORIGIN+'/assets/index.html');p.wait_for_function('!!window.__EA888_DEBUG__')
  key='ea888_lab_v120_state';p.evaluate('k=>localStorage.setItem(k,"{broken")',key);p.reload();p.wait_for_function('!!window.__EA888_DEBUG__')
  assert p.evaluate('k=>localStorage.getItem(k)',key)=='{broken';assert 'niet overschreven' in p.locator('#content').inner_text()
  raw=f.read_text();p.evaluate('([k,s])=>{localStorage.setItem("stress_backup","x".repeat(1000000));localStorage.setItem(k,s)}',[key,raw])
  p.reload();p.wait_for_function('!!window.__EA888_DEBUG__',timeout=90000)
  counts=p.evaluate('''()=>{const s=EA888SaveCodec.parse(localStorage.getItem('ea888_lab_v120_state'));return {active:s.garage.active,bank:s.bank,scirocco:[s.dynoRuns.length,s.dragRuns.length],cars:Object.fromEntries(Object.entries(s.garage.cars).map(([id,c])=>[id,[c.build.dynoRuns.length,c.build.dragRuns.length]]))};}''')
  assert counts['active']=='crc12_jackstand_240';assert counts['scirocco']==[20,30];assert all(x==[20,30] for x in counts['cars'].values())
  assert p.evaluate('__EA888_DEBUG__.errors().length')==0
  p.screenshot(path=str(out/'restored-histories.png'))
  report={'ok':True,'platform':'Chromium localStorage, isolated origin','corruptBytesPreserved':True,'storedCharacters':len(raw),'additionalBackupCharacters':1000000,'counts':counts}
  (out/'report.json').write_text(json.dumps(report,indent=2));print(json.dumps(report));b.close()
