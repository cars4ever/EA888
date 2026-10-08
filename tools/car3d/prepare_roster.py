#!/usr/bin/env python3
"""Prepare derived, padded RGBA references; never overwrite originals."""
import argparse, hashlib, json
from pathlib import Path
import numpy as np
from PIL import Image
from scipy import ndimage

IDS = {'01_Eagle_1969_Camaro': 'eagle', '02_Mullet_El_Camino': 'mullet',
       '03_McFlurry_Foxbody_Mustang': 'mcflurry', '04_Lumberjack_1973_El_Camino': 'lumberjack',
       '05_Jackstand_1990_240SX_Coupe': 'crc12_jackstand_240'}

def prepare(root, out):
    report = []
    for folder, car in IDS.items():
        dest = out / car / 'input'; dest.mkdir(parents=True, exist_ok=True)
        for view in ('front_3q', 'side', 'rear_3q'):
            src = root / folder / f'{folder}_{view}.png'
            im = Image.open(src).convert('RGBA'); a = np.array(im)
            labels, n = ndimage.label(a[:, :, 3] >= 32)
            sizes = np.bincount(labels.ravel()); sizes[0] = 0
            main = labels == sizes.argmax()
            yy, xx = np.where(main); box = [int(xx.min()), int(yy.min()), int(xx.max()+1), int(yy.max()+1)]
            # Keep nearby detached hardware, discard faint remote matte debris. No colour replacement.
            near = np.zeros_like(main); near[max(0,box[1]-32):box[3]+32,max(0,box[0]-32):box[2]+32] = True
            keep = (sizes[labels] >= 6) & near
            keep = ndimage.binary_dilation(keep, iterations=2)
            a[:, :, 3][~keep] = 0
            cleaned = Image.fromarray(a); bounds = cleaned.getbbox(); cropped = cleaned.crop(bounds)
            side = int(max(cropped.size) / .88)
            canvas = Image.new('RGBA', (side, side)); canvas.paste(cropped, ((side-cropped.width)//2, (side-cropped.height)//2))
            canvas = canvas.resize((1024,1024), Image.Resampling.LANCZOS)
            dst = dest / f'{view}.png'; canvas.save(dst)
            report.append(dict(carId=car, view=view, original=str(src), sha256=hashlib.sha256(src.read_bytes()).hexdigest(),
                               sourceSize=im.size, crop=bounds, mainBounds=box, input=str(dst),
                               inputSha256=hashlib.sha256(dst.read_bytes()).hexdigest(), reconstruction=view=='front_3q'))
    (out/'preparation.json').write_text(json.dumps(report, indent=2))

if __name__ == '__main__':
    p=argparse.ArgumentParser(); p.add_argument('--references',type=Path,required=True); p.add_argument('--out',type=Path,required=True)
    a=p.parse_args(); prepare(a.references,a.out)
