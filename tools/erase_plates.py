#!/usr/bin/env python3
"""Erase the registration from every Dutch (yellow) number plate in the car images.

The plate stays (yellow with the blue NL strip) but the characters are painted out with the plate's own
yellow, sampled around them, then softened so no stroke edges remain. Plates are found as compact yellow
regions with a plate-like aspect ratio; the blue EU strip on the left is kept.

    python3 tools/erase_plates.py --dry <image>...        # list detected plate boxes
    python3 tools/erase_plates.py <image>=x0,y0,x1,y1 ...  # erase the plate in that box
    python3 tools/erase_plates.py <image>=x0,y0,x1,y1:blur # edge-on plate: blur the box instead

Detection only proposes boxes (UI elements and grass can look yellow); the boxes used for the shipped
images are listed in PLATES below and were checked by eye.
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage


def plate_boxes(rgb):
    r, g, b = (rgb[..., i].astype(int) for i in range(3))
    yellow = (r > 150) & (g > 110) & (b < 110) & (r - b > 90) & (g - b > 60) & (np.abs(r - g) < 90)
    yellow = ndimage.binary_closing(yellow, iterations=3)
    lab, n = ndimage.label(yellow)
    boxes = []
    for sl in ndimage.find_objects(lab):
        h, w = sl[0].stop - sl[0].start, sl[1].stop - sl[1].start
        if h < 6 or w < 20:
            continue
        aspect = w / h
        fill = yellow[sl].mean()
        if 2.2 < aspect < 7.5 and fill > 0.45 and w * h > 150:
            boxes.append(sl)
    return boxes


PLATES = {
    'randy-scirocco-rear-photo.png': [(386, 396, 648, 455)],
    'randy-scirocco-race-v10.png': [(213, 253, 366, 287)],
    'rival-scirocco.png': [(213, 253, 366, 287)],
    'drag-v8-burnout.webp': [(592, 893, 725, 925)],
    'drag-v8-race.webp': [(402, 1037, 555, 1071)],
    'drag-v8-stage.webp': [(400, 905, 565, 941)],
    'randy-scirocco-hero.jpg': [(97, 410, 118, 462, 'blur')],
}


def erase(path, boxes_px, out=None):
    im = Image.open(path)
    mode = im.mode
    rgba = im.convert('RGBA')
    arr = np.array(rgba)
    rgb = arr[..., :3]
    boxes = []
    for b in boxes_px:
        x0, y0, x1, y1 = b[:4]
        if len(b) > 4 and b[4] == 'blur':
            reg = Image.fromarray(rgb[y0:y1, x0:x1]).filter(ImageFilter.GaussianBlur(max(3, (x1 - x0) / 2)))
            rgb[y0:y1, x0:x1] = np.array(reg)
            continue
        boxes.append((slice(y0, y1), slice(x0, x1)))
    for sl in boxes:
        y0, y1, x0, x1 = sl[0].start, sl[0].stop, sl[1].start, sl[1].stop
        # grow the box a little (the characters touch the plate edge in small images)
        py, px = max(1, (y1 - y0) // 10), max(1, (x1 - x0) // 40)
        y0, y1, x0, x1 = max(0, y0 - py), min(arr.shape[0], y1 + py), max(0, x0 - px), min(arr.shape[1], x1 + px)
        patch = rgb[y0:y1, x0:x1].astype(float)
        r, g, b = patch[..., 0], patch[..., 1], patch[..., 2]
        yellow = (r > 150) & (g > 110) & (b < 110) & (r - b > 90)
        blue = (b > r + 25) & (b > g)
        # keep the blue EU strip: columns on the left that are mostly blue
        blue_cols = blue.mean(axis=0) > 0.35
        strip_end = 0
        for i, c in enumerate(blue_cols[: max(1, len(blue_cols) // 5)]):
            if c:
                strip_end = i + 1
        base = np.median(patch[yellow], axis=0) if yellow.any() else np.array([242, 194, 26], float)
        # characters: everything inside the plate interior that is not yellow (dark strokes, anti-aliasing)
        inner = np.zeros_like(yellow)
        iy0, iy1 = int((y1 - y0) * 0.14), int((y1 - y0) * 0.88)
        ix0, ix1 = strip_end + max(1, (x1 - x0) // 40), int((x1 - x0) * 0.97)
        inner[iy0:iy1, ix0:ix1] = True
        text = inner & ~yellow
        text = ndimage.binary_dilation(text, iterations=max(1, (y1 - y0) // 25))
        text &= inner
        out_patch = patch.copy()
        out_patch[text] = base
        # soft shading of the plate kept: blend in the local brightness of the yellow around each stroke
        smooth = np.array(Image.fromarray(out_patch.astype(np.uint8)).filter(ImageFilter.GaussianBlur(max(1, (y1 - y0) / 12))), float)
        out_patch[inner] = smooth[inner]
        rgb[y0:y1, x0:x1] = np.clip(out_patch, 0, 255).astype(np.uint8)
    arr[..., :3] = rgb
    res = Image.fromarray(arr, 'RGBA')
    if mode != 'RGBA':
        res = res.convert('RGB')
    target = Path(out or path)
    kw = {}
    if target.suffix.lower() == '.webp':
        kw = {'quality': 90, 'method': 6}
    elif target.suffix.lower() in ('.jpg', '.jpeg'):
        kw = {'quality': 92}
    res.save(target, **kw)
    return boxes_px


if __name__ == '__main__':
    dry = '--dry' in sys.argv
    for p in [a for a in sys.argv[1:] if not a.startswith('--')]:
        if dry:
            rgb = np.array(Image.open(p).convert('RGB'))
            print(p, [(s[1].start, s[0].start, s[1].stop, s[0].stop) for s in plate_boxes(rgb)])
        elif '=' in p:
            path, spec = p.split('=', 1)
            boxes = []
            for part in spec.split(';'):
                nums, _, kind = part.partition(':')
                boxes.append((*map(int, nums.split(',')), *([kind] if kind else [])))
            print(path, erase(path, boxes))
        else:
            name = Path(p).name
            if name in PLATES:
                print(p, erase(p, PLATES[name]))
            else:
                print(p, 'no plate listed')
