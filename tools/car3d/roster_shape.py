#!/usr/bin/env python3
"""Run inside the existing 2.1 image. Sequential resumable shape queue, no paint model loaded.

Only front_3q enters the neural reconstruction. Other views are review/material references.
Caller uses `timeout 30m docker run ...` to enforce a hard upper bound.
"""
import argparse, fcntl, hashlib, json, time, traceback
from pathlib import Path
import torch
from PIL import Image
from hy3dshape.pipelines import Hunyuan3DDiTFlowMatchingPipeline

p=argparse.ArgumentParser(); p.add_argument('cars',nargs='+'); p.add_argument('--work',type=Path,default=Path('/work'))
a=p.parse_args()
lock=(a.work/'generation.lock').open('w'); fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
free,total=torch.cuda.mem_get_info()
if free < 11*1024**3: raise RuntimeError(f'GPU blocked: {free/1024**3:.2f} GiB free; need 11 GiB; no other jobs stopped')
revision='0b94677654c57bb9a6b6845cd7b704ccf551d327'
model=f'/hf-cache/hub/models--tencent--Hunyuan3D-2.1/snapshots/{revision}/hunyuan3d-dit-v2-1'
pipe=None
for car in a.cars:
    dest=a.work/car; dest.mkdir(exist_ok=True)
    status=dest/'shape-status.json'; raw=dest/'raw.glb'; src=dest/'input/front_3q.png'
    settings=dict(carId=car,inputSha256=hashlib.sha256(src.read_bytes()).hexdigest(),method='single-image front_3q',
                  checkpoint=revision,upstream='82920d643c0dc2f7bfd7255f45f62d386edfe60c',seed=240,
                  steps=50,octree=384,guidance=5,numChunks=4000,textureModelLoaded=False)
    if status.exists() and raw.exists():
        previous=json.loads(status.read_text())
        if previous.get('status')=='complete' and all(previous.get(k)==v for k,v in settings.items()):
            print(car,'reusing completed raw mesh',flush=True); continue
    start=time.time(); settings.update(status='running',started=start); status.write_text(json.dumps(settings,indent=2))
    try:
        if pipe is None:
            pipe=Hunyuan3DDiTFlowMatchingPipeline.from_single_file(model+'/model.fp16.ckpt',model+'/config.yaml',
                                                                use_safetensors=False,device='cuda')
        torch.cuda.reset_peak_memory_stats()
        mesh=pipe(image=Image.open(src).convert('RGBA'),num_inference_steps=50,guidance_scale=5,
                  generator=torch.Generator(device='cuda').manual_seed(240),octree_resolution=384,num_chunks=4000)[0]
        mesh.export(str(raw))
        settings.update(status='complete',seconds=time.time()-start,vertices=len(mesh.vertices),triangles=len(mesh.faces),
                        peakAllocatedMiB=torch.cuda.max_memory_allocated()/1024**2,rawSha256=hashlib.sha256(raw.read_bytes()).hexdigest())
    except Exception:
        settings.update(status='failed',error=traceback.format_exc()); raise
    finally:
        status.write_text(json.dumps(settings,indent=2)); print(json.dumps(settings),flush=True)
        torch.cuda.empty_cache()
if pipe is not None: pipe.to('cpu')
