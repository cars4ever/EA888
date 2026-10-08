#!/usr/bin/env python3
"""Existing Hunyuan 2.1 PBR stage, one car at a time; separate process from shape."""
import argparse, fcntl, json, time, traceback
from pathlib import Path
import torch
from torchvision_fix import apply_fix
apply_fix()
from hy3dpaint.textureGenPipeline import Hunyuan3DPaintPipeline, Hunyuan3DPaintConfig
from low_vram import move_paint
from hy3dpaint.convert_utils import create_glb_with_pbr_materials

p=argparse.ArgumentParser(); p.add_argument('cars',nargs='+'); p.add_argument('--work',type=Path,default=Path('/work')); a=p.parse_args()
lock=(a.work/'generation.lock').open('w'); fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
free,total=torch.cuda.mem_get_info()
if free < 11*1024**3: raise RuntimeError(f'Paint blocked: only {free/1024**3:.2f} GiB free; other jobs untouched')
# Leave at least 1 GiB beyond the measured free space for driver/native raster allocations.
torch.cuda.set_per_process_memory_fraction(min(.85,(free-1024**3)/total))
conf=Hunyuan3DPaintConfig(max_num_view=6,resolution=512)
conf.realesrgan_ckpt_path='hy3dpaint/ckpt/RealESRGAN_x4plus.pth'
conf.multiview_cfg_path='hy3dpaint/cfgs/hunyuan-paint-pbr.yaml'; conf.custom_pipeline='hy3dpaint/hunyuanpaintpbr'
pipe=None
for car in a.cars:
    dest=a.work/car; status=dest/'paint-status.json'
    if status.exists() and json.loads(status.read_text()).get('status')=='complete' and (dest/'painted.glb').exists(): continue
    start=time.time(); info=dict(status='running',reference='input/front_3q.png',views=6,resolution=512,seed=0)
    status.write_text(json.dumps(info,indent=2))
    try:
        existing=all((dest/name).exists() for name in ('painted.obj','painted.jpg','painted_metallic.jpg','painted_roughness.jpg'))
        if pipe is None and not existing:
            pipe=Hunyuan3DPaintPipeline(conf)
            mv=pipe.models['multiview_model']
            mv.pipeline.enable_vae_slicing()
            mv.pipeline.enable_vae_tiling()
            # DINO is used once before diffusion, not at every denoising step.
            dino=mv.dino_v2
            original_forward=dino.forward
            def offloaded_dino(*args,**kwargs):
                dino.to('cuda')
                try: return original_forward(*args,**kwargs)
                finally:
                    dino.to('cpu'); torch.cuda.empty_cache()
            dino.forward=offloaded_dino
            dino.to('cpu')
            info['offload']='DINO after conditioning; VAE slicing/tiling; allocator bounded by free VRAM'
        torch.manual_seed(0); torch.cuda.reset_peak_memory_stats()
        if not existing:
            pipe(mesh_path=str(dest/'raw.glb'),image_path=str(dest/'input/front_3q.png'),output_mesh_path=str(dest/'painted.obj'),save_glb=False)
        create_glb_with_pbr_materials(str(dest/'painted.obj'),{
            'albedo':str(dest/'painted.jpg'),'metallic':str(dest/'painted_metallic.jpg'),
            'roughness':str(dest/'painted_roughness.jpg')},str(dest/'painted.glb'))
        assert (dest/'painted.glb').exists()
        info.update(status='complete',seconds=time.time()-start,peakAllocatedMiB=torch.cuda.max_memory_allocated()/1024**2)
    except Exception:
        info.update(status='failed',error=traceback.format_exc()); raise
    finally:
        info['seconds']=time.time()-start
        info['peakAllocatedMiB']=torch.cuda.max_memory_allocated()/1024**2
        status.write_text(json.dumps(info,indent=2)); print(json.dumps(info),flush=True)
if pipe is not None: move_paint(pipe,'cpu')
