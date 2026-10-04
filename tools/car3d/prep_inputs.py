#!/usr/bin/env python3
"""Cuts the car out of the reference photos and squares them up for Hunyuan3D."""
import os, pathlib, sys
from PIL import Image, ImageOps
from rembg import remove, new_session

ROOT = pathlib.Path(__file__).resolve().parents[2]
SRC = ROOT / 'src' / 'assets' / 'images'
# generated models and inputs stay out of the repo (see README.md)
WORK = pathlib.Path(os.environ.get('EA888_CAR3D_WORK', ROOT.parent / 'work'))
OUT = WORK / 'input'
OUT.mkdir(parents=True, exist_ok=True)

JOBS = [
    ('left',   'randy-scirocco-side.png'),
    ('left2',  'randy-scirocco-cutout.png'),
    ('back',   'randy-scirocco-rear-photo.png'),
    ('hero',   'randy-scirocco-hero.jpg'),
]

def largest_blob(img, min_frac=0.02):
    """Drops rembg leftovers (grass, kerb) that are not connected to the car."""
    import numpy as np
    from scipy import ndimage
    a = np.array(img)
    solid = a[:, :, 3] > 40
    lab, n = ndimage.label(solid)
    if n <= 1:
        return img
    sizes = ndimage.sum(solid, lab, range(1, n + 1))
    keep = 1 + int(np.argmax(sizes))
    a[:, :, 3] = np.where(lab == keep, a[:, :, 3], 0)
    dropped = int((sizes.sum() - sizes.max()))
    if dropped:
        print(f'  dropped {n - 1} loose blob(s), {dropped} px')
    return Image.fromarray(a)


def square(img, pad=0.06):
    """Crops to the alpha bounding box, then pads to a square on transparency."""
    bbox = img.getbbox()
    if bbox:
        img = img.crop(bbox)
    w, h = img.size
    side = int(max(w, h) * (1 + 2 * pad))
    canvas = Image.new('RGBA', (side, side), (0, 0, 0, 0))
    canvas.paste(img, ((side - w) // 2, (side - h) // 2), img)
    return canvas

def main():
    session = new_session('isnet-general-use')
    for name, fn in JOBS:
        src = SRC / fn
        img = Image.open(src).convert('RGBA')
        cut = remove(img, session=session, alpha_matting=True,
                     alpha_matting_foreground_threshold=250,
                     alpha_matting_background_threshold=15,
                     alpha_matting_erode_size=8)
        cut = largest_blob(cut)
        sq = square(cut)
        sq.save(OUT / f'{name}.png')
        print(f'{name}: {src.name} {img.size} -> {sq.size}')
        if name == 'left':
            ImageOps.mirror(sq).save(OUT / 'right.png')
            print('right: mirrored from left')

if __name__ == '__main__':
    sys.exit(main())
