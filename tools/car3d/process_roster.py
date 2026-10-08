#!/usr/bin/env python3
"""Bounded, resumable orchestration of the existing local image/Blender toolchain.
No runtime server, dependency installation, model download or other-job cancellation.
"""
import argparse,hashlib,json,subprocess,time
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
IDS=['crc12_jackstand_240','eagle','mullet','mcflurry','lumberjack']
p=argparse.ArgumentParser();p.add_argument('stage',choices=['shape','paint','fit']);p.add_argument('cars',nargs='*',choices=IDS)
p.add_argument('--work',type=Path,default=ROOT.parent/'work/cleetus');a=p.parse_args();cars=a.cars or IDS;work=a.work.resolve();failed=[]
if a.stage in ('shape','paint'):
 cmd=['docker','run','--rm','--name','ea888-roster-'+a.stage,'--gpus','device=0','--network','none','--shm-size','8g',
      '-e','HF_HUB_OFFLINE=1','-e','TRANSFORMERS_OFFLINE=1','-e','PYTHONPATH=/workspace/app:/workspace/app/hy3dshape:/workspace/app/hy3dpaint:/opt/hunyuan-scripts',
      '-v','/home/scirockoe/n8n-docker/hf-cache:/hf-cache:ro','-v',str(work)+':/work','-v',str(ROOT/'tools/car3d')+':/pipeline:ro',
      'hunyuan3d-21:2.1-cu124','python3','/pipeline/roster_'+a.stage+'.py',*cars]
 with (work/('batch-'+a.stage+'.log')).open('a') as log:
  try:subprocess.run(cmd,stdout=log,stderr=subprocess.STDOUT,timeout=1800,check=True)
  except (subprocess.TimeoutExpired,subprocess.CalledProcessError) as e:
   if isinstance(e,subprocess.TimeoutExpired):subprocess.run(['docker','stop','ea888-roster-'+a.stage],capture_output=True)
   for car in cars:
    status=work/car/(a.stage+'-status.json')
    if status.exists():
     info=json.loads(status.read_text())
     if info.get('status')=='running':info.update(status='failed',error=type(e).__name__);status.write_text(json.dumps(info,indent=2))
   raise SystemExit('Pipeline failed; see '+str(log.name))
else:
 config=work/'visual-config.json'
 config.write_text(subprocess.check_output(['node','-e',"console.log(JSON.stringify(require('./src/assets/vehicle-assets.js').vehicles))"],cwd=ROOT,text=True))
 for car in cars:
  folder=work/car;stamp=folder/'runtime-status.json'
  signature=hashlib.sha256((ROOT/'tools/car3d/fit_roster.py').read_bytes()+config.read_bytes()+(folder/'painted.glb').read_bytes()).hexdigest()
  outputs=[ROOT/'src/assets/models'/(car+suffix+'.glb') for suffix in ('','-low')]
  if stamp.exists() and all(o.exists() for o in outputs) and json.loads(stamp.read_text()).get('signature')==signature:
   print(car,'reusing fitted runtime');continue
  started=time.time();info={'status':'running','signature':signature};stamp.write_text(json.dumps(info))
  try:
   with (folder/'fit.log').open('w') as log:
    subprocess.run(['blender','-b','-t','4','-P',str(ROOT/'tools/car3d/fit_roster.py'),'--','--car',car,'--work',str(work),'--config',str(config)],stdout=log,stderr=subprocess.STDOUT,timeout=180,check=True)
   for i,output in enumerate(outputs):
    dest=folder/('runtime-low.glb' if i else 'runtime.glb')
    with (folder/('optimize-low.log' if i else 'optimize.log')).open('w') as log:
     subprocess.run(['gltf-transform','optimize',str(output),str(dest),'--compress','meshopt','--flatten','false','--join','false','--instance','false','--palette','false','--simplify','false','--texture-size','512' if i else '1024','--texture-compress','webp'],stdout=log,stderr=subprocess.STDOUT,timeout=180,check=True)
    output.write_bytes(dest.read_bytes())
   info.update(status='complete',outputs=[{'file':str(o.relative_to(ROOT)),'bytes':o.stat().st_size,'sha256':hashlib.sha256(o.read_bytes()).hexdigest()} for o in outputs])
  except Exception as e:info.update(status='failed',error=str(e));failed.append(car)
  info['seconds']=time.time()-started;stamp.write_text(json.dumps(info,indent=2));print(car,info['status'],flush=True)
 if failed:raise SystemExit('Failed cars: '+', '.join(failed))
