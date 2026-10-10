#!/usr/bin/env python3
"""Capture the actual app's WebAudio output at unchanged mixer settings, before/after.
Signals are simulated RPM/load sequences (not real vehicle recordings)."""
import base64,json,subprocess
from pathlib import Path
from playwright.sync_api import sync_playwright
from browser_smoke import serve_assets,APP_ORIGIN
import browser_env
OUT=Path('reports/audit2/audio');OUT.mkdir(parents=True,exist_ok=True)
HOOK='''qaAudioClip: async()=>{
 state.settings.sound=true;activeTab='drag';startEngineAudio('race');await engineAudio.readyPromise;await engineAudio.ctx.resume();
 const a=engineAudio,taps={},tapNodes=[];let phaseName='settle',phaseStart=0;for(const [name,node]of [['preMasterBus',a.master],['postCompressor',a.compressor]]){const tap=a.ctx.createScriptProcessor(512,1,1);node.connect(tap);tap.connect(a.ctx.destination);tap.onaudioprocess=e=>{if(a.ctx.currentTime-phaseStart<.3)return;const key=name+':'+phaseName,r=taps[key]||={n:0,sum:0,squares:0,peak:0};for(const x of e.inputBuffer.getChannelData(0)){r.n++;r.sum+=x;r.squares+=x*x;r.peak=Math.max(r.peak,Math.abs(x));}};tapNodes.push([node,tap]);}const dest=a.ctx.createMediaStreamDestination();a.compressor.connect(dest);
 const rec=new MediaRecorder(dest.stream,{mimeType:'audio/webm;codecs=opus'}),chunks=[];rec.ondataavailable=e=>chunks.push(e.data);
 const done=new Promise(ok=>rec.onstop=async()=>{const blob=new Blob(chunks,{type:rec.mimeType}),reader=new FileReader();reader.onload=()=>ok(reader.result);reader.readAsDataURL(blob);});rec.start();
 const phases=[['idle-strip',900,.12,'drag'],['load-dyno',4500,1,'dyno'],['load-strip',8000,1,'drag'],['shift',6500,1,'drag'],['coast',2200,0,'drag']];
 for(const [name,rpm,load,tab] of phases){activeTab=tab;phaseName=name;phaseStart=a.ctx.currentTime;if(name==='shift')completeRealtimeShift({shifting:{grade:'perfect'},autoShift:true,converter:true,gearboxTempC:80,drivelineStress:0,rt:{state:{shiftLog:[{}]}}});for(let i=0;i<40;i++){updateEngineAudio(rpm,load,name==='load-strip'?.6:0,{boostBar:2,mapBar:3,cutFraction:0});await new Promise(r=>setTimeout(r,50));}}
 stopEngineAudio();await new Promise(r=>setTimeout(r,650));rec.stop();const data=await done;a.compressor.disconnect(dest);for(const [node,tap]of tapNodes){try{node.disconnect(tap);}catch(e){}tap.disconnect();}stopEngineAudio({hard:true});return {data,taps:Object.fromEntries(Object.entries(taps).map(([k,r])=>[k,{mean:r.sum/r.n,rms:Math.sqrt(r.squares/r.n),peak:r.peak,n:r.n}])),phases:phases.map((p,i)=>({name:p[0],start:i*2,end:i*2+2})),carId:activeRosterId(),mixer:state.settings.mix};},
'''
with sync_playwright() as pw:
 b=pw.chromium.launch(**browser_env.launch_kwargs(pw,['--no-sandbox','--autoplay-policy=no-user-gesture-required','--enable-unsafe-swiftshader']))
 report={}
 for tag in ['before','after']:
  c=b.new_context(viewport={'width':412,'height':892});serve_assets(c,Path('build/web').resolve())
  source=subprocess.check_output(['git','show','bfbb29e:src/assets/app.js'],text=True) if tag=='before' else Path('build/web/app.js').read_text()
  source=source.replace('window.__EA888_DEBUG__ = {','window.__EA888_DEBUG__ = {'+HOOK)
  c.route('**/assets/app.js*',lambda route:route.fulfill(status=200,body=source,content_type='text/javascript'))
  if tag=='before':
   voice=subprocess.check_output(['git','show','bfbb29e:src/assets/engine-voice.js'],text=True);c.route('**/assets/engine-voice.js*',lambda route:route.fulfill(status=200,body=voice,content_type='text/javascript'))
  p=c.new_page();p.goto(APP_ORIGIN+'/assets/index.html?profile=vehicle-qa');p.wait_for_function('!!window.__EA888_DEBUG__');p.evaluate('__EA888_DEBUG__.qaDrive("eagle")')
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
  phase['mean']=float(np.mean(a));phase['rmsDbfs']=round(20*np.log10(max(1e-10,np.sqrt(np.mean(a*a)))),2);phase['peakDbfs']=round(20*np.log10(max(1e-10,np.max(np.abs(a)))),2)
(OUT/'capture.json').write_text(json.dumps(report,indent=2));print(json.dumps(report,indent=2))
# Measure reconstructed true peak; loudness matching uses constant gain, not compression.
import re
metrics={}
for tag in report:
 r=subprocess.run(['ffmpeg','-hide_banner','-i',str(OUT/(tag+'.wav')),'-af','loudnorm=I=-20:TP=-2:LRA=11:print_format=json','-f','null','-'],capture_output=True,text=True,check=True)
 m=json.loads(re.findall(r'\{[^{}]*"input_i"[^{}]*\}',r.stderr)[-1]);gain=-20-float(m['input_i']);m['matchedConstantGainDb']=gain;metrics[tag]=m
 subprocess.run(['ffmpeg','-v','error','-y','-i',str(OUT/(tag+'.wav')),'-af',f'volume={gain}dB',str(OUT/(tag+'-matched.wav'))],check=True)
(OUT/'loudness-truepeak.json').write_text(json.dumps(metrics,indent=2))
assert all(abs(v['mean'])<.001 for v in report['after']['taps'].values()), 'DC returned in actual app bus'
assert all(v['peak']<1 for k,v in report['after']['taps'].items() if k.startswith('postCompressor:')), 'Digital master clipping'
