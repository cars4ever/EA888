#!/usr/bin/env python3
"""Capture the actual app's WebAudio output at unchanged mixer settings, before/after.
Signals are simulated RPM/load sequences (not real vehicle recordings)."""
import base64,json,subprocess
from pathlib import Path
from playwright.sync_api import sync_playwright
from browser_smoke import serve_assets,APP_ORIGIN
import browser_env
OUT=Path('reports/audit-repair/audio');OUT.mkdir(parents=True,exist_ok=True)
HOOK='''qaAudioClip: async()=>{
 state.settings.sound=true;activeTab='drag';startEngineAudio('race');await engineAudio.readyPromise;await engineAudio.ctx.resume();
 const a=engineAudio,dest=a.ctx.createMediaStreamDestination();a.compressor.connect(dest);
 const rec=new MediaRecorder(dest.stream,{mimeType:'audio/webm;codecs=opus'}),chunks=[];rec.ondataavailable=e=>chunks.push(e.data);
 const done=new Promise(ok=>rec.onstop=async()=>{const blob=new Blob(chunks,{type:rec.mimeType}),reader=new FileReader();reader.onload=()=>ok(reader.result);reader.readAsDataURL(blob);});rec.start();
 const phases=[['idle-strip',900,.12,'drag'],['load-dyno',4500,1,'dyno'],['load-strip',4500,1,'drag'],['shift',3000,.15,'drag'],['coast',2200,0,'drag']];
 for(const [name,rpm,load,tab] of phases){activeTab=tab;for(let i=0;i<40;i++){updateEngineAudio(rpm,load,0,{boostBar:0,mapBar:1,cutFraction:name==='shift'&&i<3?1:0});await new Promise(r=>setTimeout(r,50));}}
 stopEngineAudio();await new Promise(r=>setTimeout(r,650));rec.stop();const data=await done;a.compressor.disconnect(dest);stopEngineAudio({hard:true});return {data,phases:phases.map((p,i)=>({name:p[0],start:i*2,end:i*2+2})),carId:activeRosterId(),mixer:state.settings.mix};},
'''
with sync_playwright() as pw:
 b=pw.chromium.launch(**browser_env.launch_kwargs(pw,['--no-sandbox','--autoplay-policy=no-user-gesture-required','--enable-unsafe-swiftshader']))
 report={}
 for tag in ['before','after']:
  c=b.new_context(viewport={'width':412,'height':892});serve_assets(c,Path('build/web').resolve())
  source=subprocess.check_output(['git','show','ccf4d067:src/assets/app.js'],text=True) if tag=='before' else Path('build/web/app.js').read_text()
  source=source.replace('window.__EA888_DEBUG__ = {','window.__EA888_DEBUG__ = {'+HOOK)
  c.route('**/assets/app.js*',lambda route:route.fulfill(status=200,body=source,content_type='text/javascript'))
  p=c.new_page();p.goto(APP_ORIGIN+'/assets/index.html?profile=vehicle-qa');p.wait_for_function('!!window.__EA888_DEBUG__');p.evaluate('__EA888_DEBUG__.qaDrive("crc12_jackstand_240")')
  # Dispose the showroom while measuring audio so software rendering cannot alter scheduling.
  p.locator('[data-nav=service]').click();r=p.evaluate('__EA888_DEBUG__.qaAudioClip()')
  (OUT/(tag+'.webm')).write_bytes(base64.b64decode(r.pop('data').split(',',1)[1]));report[tag]=r;c.close()
 b.close()
(OUT/'capture.json').write_text(json.dumps(report,indent=2))
for tag in report:
 subprocess.run(['ffmpeg','-y','-v','error','-i',str(OUT/(tag+'.webm')),'-ar','32000',str(OUT/(tag+'.wav'))],check=True)
import numpy as np
from scipy.io import wavfile
for tag,r in report.items():
 sr,x=wavfile.read(OUT/(tag+'.wav'));x=x.astype(float)/32768
 for phase in r['phases']:
  a=x[int((phase['start']+.25)*sr):int((phase['end']-.1)*sr)]
  phase['rmsDbfs']=round(20*np.log10(max(1e-10,np.sqrt(np.mean(a*a)))),2);phase['peakDbfs']=round(20*np.log10(max(1e-10,np.max(np.abs(a)))),2)
(OUT/'capture.json').write_text(json.dumps(report,indent=2));print(json.dumps(report,indent=2))
