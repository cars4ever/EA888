#!/usr/bin/env python3
"""Runs shape generation on the local Hunyuan3D-2.1 Gradio app and keeps the GLB."""
import argparse, os, pathlib, shutil, sys, time
from gradio_client import Client, handle_file

ROOT = pathlib.Path(__file__).resolve().parents[2]
WORK = pathlib.Path(os.environ.get('EA888_CAR3D_WORK', ROOT.parent / 'work'))
IN = WORK / 'input'
OUT = WORK / 'hunyuan'

# The mv model needs a 'front'; the only front-ish photo is the 3/4 hero, so it stands in for it.
VARIANTS = {
    'mv':     dict(image=None, front='hero.png', back='back.png', left='left.png', right='right.png'),
    'mv2':    dict(image=None, front='hero.png', back='back.png', left=None, right=None),
    'mv3':    dict(image=None, front='hero.png', back='back.png', left='left2.png', right=None),
    # same views with left/right swapped, in case the photo's side reads the other way round
    'mvswap': dict(image=None, front='hero.png', back='back.png', left='right.png', right='left.png'),
    'mvlr':   dict(image=None, front='hero.png', back=None, left='left.png', right='right.png'),
    'side':   dict(image='left.png', front=None, back=None, left=None, right=None),
    'side2':  dict(image='left2.png', front=None, back=None, left=None, right=None),
    'rear':   dict(image='back.png', front=None, back=None, left=None, right=None),
    'hero':   dict(image='hero.png', front=None, back=None, left=None, right=None),
}

def fileref(name):
    return handle_file(str(IN / name)) if name else None

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('variant', choices=sorted(VARIANTS))
    ap.add_argument('--steps', type=int, default=50)
    ap.add_argument('--guidance', type=float, default=5.0)
    ap.add_argument('--octree', type=int, default=384)
    ap.add_argument('--seed', type=int, default=1234)
    ap.add_argument('--port', type=int, default=7860)
    ap.add_argument('--tag', default='')
    a = ap.parse_args()

    v = VARIANTS[a.variant]
    OUT.mkdir(parents=True, exist_ok=True)
    c = Client(f'http://127.0.0.1:{a.port}/')
    t0 = time.time()
    res = c.predict(
        image=fileref(v['image']),
        mv_image_front=fileref(v['front']),
        mv_image_back=fileref(v['back']),
        mv_image_left=fileref(v['left']),
        mv_image_right=fileref(v['right']),
        steps=a.steps, guidance_scale=a.guidance, seed=a.seed,
        octree_resolution=a.octree, check_box_rembg=False,
        num_chunks=8000, randomize_seed=False,
        api_name='/shape_generation',
    )
    raw = res[0]
    if isinstance(raw, dict):
        raw = raw.get('path') or raw.get('value') or raw.get('name')
    glb = pathlib.Path(raw)
    dst = OUT / f'shape-{a.variant}{a.tag}.glb'
    shutil.copy(glb, dst)
    print(f'{a.variant}: {dst} ({dst.stat().st_size/1e6:.2f} MB) in {time.time()-t0:.0f}s')
    print('stats:', res[2])

if __name__ == '__main__':
    sys.exit(main())
