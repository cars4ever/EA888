#!/usr/bin/env python3
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter, ImageEnhance, ImageChops

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / 'src' / 'assets' / 'images' / 'randy-scirocco-race-v10.png'
ASSET_OUT = ROOT / 'src' / 'assets' / 'images' / 'scirocco-app-icon.png'
RES_OUT = ROOT / 'res' / 'mipmap' / 'app_icon.png'

size = 512
src = Image.open(SRC).convert('RGBA')
# Build a moody blurred track backdrop from the same scene.
bg = src.convert('RGB').resize((size, size), Image.Resampling.LANCZOS)
bg = bg.filter(ImageFilter.GaussianBlur(18))
bg = ImageEnhance.Brightness(bg).enhance(0.38).convert('RGBA')

# Radial-ish dark vignette.
overlay = Image.new('RGBA', (size, size), (0, 0, 0, 0))
pix = overlay.load()
cx = cy = size / 2
for y in range(size):
    for x in range(size):
        dx = (x - cx) / cx
        dy = (y - cy) / cy
        r = min(1.0, (dx*dx + dy*dy) ** 0.5)
        alpha = int(30 + 130 * (r ** 1.8))
        pix[x, y] = (2, 6, 12, alpha)
bg.alpha_composite(overlay)

# Crop/scale the recognizable Scirocco rear so it reads at launcher size.
car = src.copy()
# Trim a little of the upper background while keeping the full car width.
car = car.crop((0, 38, car.width, car.height))
scale = min(468 / car.width, 352 / car.height)
car = car.resize((round(car.width * scale), round(car.height * scale)), Image.Resampling.LANCZOS)
# Soften the rectangular source edge with a rounded alpha mask.
mask = Image.new('L', car.size, 0)
md = ImageDraw.Draw(mask)
md.rounded_rectangle((0, 0, car.width - 1, car.height - 1), radius=44, fill=255)
mask = mask.filter(ImageFilter.GaussianBlur(1.2))
car.putalpha(ImageChops.multiply(car.getchannel('A'), mask))

# Ground glow behind the car.
glow = Image.new('RGBA', (size, size), (0, 0, 0, 0))
gd = ImageDraw.Draw(glow)
gd.ellipse((55, 285, 457, 486), fill=(0, 101, 255, 74))
glow = glow.filter(ImageFilter.GaussianBlur(34))
bg.alpha_composite(glow)

x = (size - car.width) // 2
y = 112
bg.alpha_composite(car, (x, y))

# Premium EA888 orange ring and inner keyline.
d = ImageDraw.Draw(bg)
d.rounded_rectangle((12, 12, size - 13, size - 13), radius=106, outline=(255, 157, 24, 255), width=15)
d.rounded_rectangle((31, 31, size - 32, size - 32), radius=90, outline=(255, 198, 84, 90), width=3)

# Small orange road stripe at the bottom; no text so the icon stays clear.
d.rounded_rectangle((126, 451, 386, 469), radius=9, fill=(255, 155, 20, 235))
d.rounded_rectangle((191, 476, 321, 486), radius=5, fill=(225, 234, 243, 185))

ASSET_OUT.parent.mkdir(parents=True, exist_ok=True)
RES_OUT.parent.mkdir(parents=True, exist_ok=True)
bg.convert('RGBA').save(ASSET_OUT, optimize=True)
bg.convert('RGBA').save(RES_OUT, optimize=True)
print(ASSET_OUT)
print(RES_OUT)

# Helper avoids importing ImageChops before the main setup on older Pillow builds.
