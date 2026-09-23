#!/usr/bin/env python3
"""Launcher icon: Randy's blue Scirocco from behind on the night strip.

Full-bleed square (no transparent corners, no own frame): launchers mask legacy icons into their own shape
(Samsung squircle, Pixel circle), so everything important sits inside the central ~80 % safe zone.
Rendered at 1024 px and downsampled for clean edges.
"""
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageEnhance, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / 'src' / 'assets' / 'images' / 'randy-scirocco-rear-photo.png'
ASSET_OUT = ROOT / 'src' / 'assets' / 'images' / 'scirocco-app-icon.png'
RES_OUT = ROOT / 'res' / 'mipmap' / 'app_icon.png'
ANDROID_RES = ROOT / 'android' / 'app' / 'src' / 'main' / 'res'
DENSITIES = {'mdpi': 108, 'hdpi': 162, 'xhdpi': 216, 'xxhdpi': 324, 'xxxhdpi': 432}
S = 1024


def radial(size, cx, cy, rx, ry, color, strength=1.0, power=1.6):
    y, x = np.mgrid[0:size, 0:size].astype(float)
    r = np.sqrt(((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2)
    a = np.clip(1 - r, 0, 1) ** power * strength
    img = np.zeros((size, size, 4))
    img[..., :3] = color
    img[..., 3] = a * 255
    return Image.fromarray(img.astype(np.uint8), 'RGBA')


def background():
    y = np.linspace(0, 1, S)[:, None]
    top, mid, bot = np.array([14, 30, 58]), np.array([7, 13, 26]), np.array([3, 5, 9])
    col = np.where(y < .55, top + (mid - top) * (y / .55), mid + (bot - mid) * ((y - .55) / .45))
    img = np.repeat(col[:, None, :], S, axis=1).reshape(S, S, 3)
    bg = Image.fromarray(img.astype(np.uint8), 'RGB').convert('RGBA')
    # Strip flood lights on the horizon, soft bokeh.
    lights = Image.new('RGBA', (S, S))
    d = ImageDraw.Draw(lights)
    for i, x in enumerate(np.linspace(40, S - 40, 11)):
        r = 10 + (i % 3) * 3
        d.ellipse((x - r, 270 - r, x + r, 270 + r), fill=(255, 214, 140, 150))
    bg.alpha_composite(lights.filter(ImageFilter.GaussianBlur(9)))
    bg.alpha_composite(radial(S, S / 2, 270, 620, 120, (255, 170, 70), .35))
    # Orange glow on the wet asphalt below the car.
    bg.alpha_composite(radial(S, S / 2, 900, 520, 170, (255, 120, 20), .55))
    return bg


def car_layer():
    car = Image.open(SRC).convert('RGBA')
    arr = np.array(car).astype(float)
    # Clean the cut-out edge: drop faint speckles, firm up the silhouette.
    arr[..., 3] = np.clip((arr[..., 3] - 60) * 1.35, 0, 255)
    car = Image.fromarray(arr.astype(np.uint8), 'RGBA').crop((16, 15, 957, 638))
    # The cut-out still carries a light fringe from the original photo background: shrink the silhouette by
    # a few pixels and darken what remains of the edge so it sits cleanly on the night background.
    alpha = car.getchannel('A').filter(ImageFilter.MinFilter(7)).filter(ImageFilter.GaussianBlur(1.4))
    edge = np.array(car.getchannel('A').filter(ImageFilter.MinFilter(15))).astype(float) / 255
    rgbf = np.array(car.convert('RGB')).astype(float)
    rgbf *= (0.55 + 0.45 * edge)[..., None]
    car = Image.fromarray(rgbf.astype(np.uint8), 'RGB').convert('RGBA')
    car.putalpha(alpha)
    rgb = ImageEnhance.Contrast(car.convert('RGB')).enhance(1.12)
    rgb = ImageEnhance.Color(rgb).enhance(1.18)
    car = Image.merge('RGBA', (*rgb.split(), car.getchannel('A')))
    w = 930
    return car.resize((w, round(car.height * w / car.width)), Image.Resampling.LANCZOS)


def place_car(icon, car, x, y):
    """Car with wet-strip reflection, contact shadow and tailpipe glow, composited onto icon."""
    # Reflection on the wet strip.
    refl = car.transpose(Image.Transpose.FLIP_TOP_BOTTOM).filter(ImageFilter.GaussianBlur(5))
    fade = np.linspace(.32, 0, refl.height)[:, None]
    ra = np.array(refl).astype(float)
    ra[..., 3] *= fade
    icon.alpha_composite(Image.fromarray(ra.astype(np.uint8), 'RGBA'), (x, y + car.height - round(18 * car.width / 930)))
    # Contact shadow.
    k = car.width / 930
    icon.alpha_composite(radial(S, x + car.width / 2, y + car.height - 10 * k, 470 * k, 38 * k, (0, 0, 0), .85, 1.2))
    icon.alpha_composite(car, (x, y))
    # Anti-lag glow at the two tailpipes (photo coordinates: 20 % / 80 % width, 87 % height).
    for px in (.197, .816):
        cx, cy = x + px * car.width, y + .872 * car.height
        icon.alpha_composite(radial(S, cx, cy, 70 * k, 46 * k, (255, 120, 20), .9, 1.4))
        icon.alpha_composite(radial(S, cx, cy, 30 * k, 20 * k, (255, 236, 190), 1.0, 1.2))


def adaptive_layers(car):
    """Android adaptive icon (108 dp canvas; the launcher mask keeps the central 66 dp circle, 61 %).
    Background: the night strip. Foreground: the car, 54 % of the canvas wide, inside the safe zone."""
    bg = background()
    w = round(S * .54)
    small = car.resize((w, round(car.height * w / car.width)), Image.Resampling.LANCZOS)
    fg = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    x, y = (S - small.width) // 2, round(S * .53 - small.height / 2)
    place_car(fg, small, x, y)
    for dens, px in DENSITIES.items():
        folder = ANDROID_RES / f'mipmap-{dens}'
        folder.mkdir(parents=True, exist_ok=True)
        bg.convert('RGB').resize((px, px), Image.Resampling.LANCZOS).save(folder / 'ic_launcher_background.png', optimize=True)
        fg.resize((px, px), Image.Resampling.LANCZOS).save(folder / 'ic_launcher_foreground.png', optimize=True)
    print(ANDROID_RES / 'mipmap-*')


def main():
    icon = background()
    car = car_layer()
    x, y = (S - car.width) // 2, 300
    place_car(icon, car, x, y)
    # Soft vignette keeps the corners calm under any launcher mask.
    yy, xx = np.mgrid[0:S, 0:S].astype(float)
    r = np.sqrt(((xx - S / 2) / (S / 2)) ** 2 + ((yy - S / 2) / (S / 2)) ** 2)
    vig = np.zeros((S, S, 4))
    vig[..., 3] = np.clip((r - .75) / .6, 0, 1) ** 1.5 * 200
    icon.alpha_composite(Image.fromarray(vig.astype(np.uint8), 'RGBA'))
    out = icon.convert('RGB').resize((512, 512), Image.Resampling.LANCZOS)
    for path in (ASSET_OUT, RES_OUT):
        path.parent.mkdir(parents=True, exist_ok=True)
        out.save(path, optimize=True)
        print(path)
    adaptive_layers(car)


if __name__ == '__main__':
    main()
