#!/usr/bin/env python3
from pathlib import Path
import cv2
import numpy as np

ROOT = Path('/mnt/data')
OUT = Path('/mnt/data/ea888-lab-v020/src/assets/images')
OUT.mkdir(parents=True, exist_ok=True)

# Hero image: crop around Randy's Scirocco, darken slightly for readable overlays.
hero = cv2.imread(str(ROOT / '1000024855.jpg'), cv2.IMREAD_COLOR)
if hero is None:
    raise SystemExit('hero image missing')
h, w = hero.shape[:2]
# Wide crop emphasizing the car and retaining some atmosphere.
y1, y2 = int(h * 0.12), int(h * 0.80)
x1, x2 = int(w * 0.04), int(w * 0.96)
hero = hero[y1:y2, x1:x2]
max_w = 1280
if hero.shape[1] > max_w:
    scale = max_w / hero.shape[1]
    hero = cv2.resize(hero, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)
# Gentle cinematic contrast/darken; UI adds another CSS gradient.
hero = cv2.convertScaleAbs(hero, alpha=0.92, beta=-8)
cv2.imwrite(str(OUT / 'randy-scirocco-hero.jpg'), hero, [cv2.IMWRITE_JPEG_QUALITY, 88])

# Secondary garage image from the low-angle photo.
garage = cv2.imread(str(ROOT / '1000049024.jpg'), cv2.IMREAD_COLOR)
if garage is None:
    garage = cv2.imread(str(ROOT / '1000099192.jpg'), cv2.IMREAD_COLOR)
if garage is not None:
    gh, gw = garage.shape[:2]
    # Keep car, crop excess sky/ground.
    garage = garage[int(gh*.10):int(gh*.92), int(gw*.03):int(gw*.98)]
    if garage.shape[1] > 1280:
        s = 1280 / garage.shape[1]
        garage = cv2.resize(garage, None, fx=s, fy=s, interpolation=cv2.INTER_AREA)
    cv2.imwrite(str(OUT / 'randy-scirocco-garage.jpg'), garage, [cv2.IMWRITE_JPEG_QUALITY, 86])

# Side-view transparent cutout used on the drag strip.
img = cv2.imread(str(ROOT / '1000025116.jpg'), cv2.IMREAD_COLOR)
if img is None:
    raise SystemExit('side image missing')
h, w = img.shape[:2]
mask = np.full((h, w), cv2.GC_BGD, np.uint8)

# Broad probable foreground polygon follows the outer car silhouette.
poly = np.array([
    [8, 414], [12, 330], [42, 220], [94, 135], [188, 87], [330, 52],
    [535, 28], [710, 31], [835, 52], [910, 93], [975, 143],
    [1060, 166], [1275, 194], [1415, 238], [1490, 292], [1518, 355],
    [1490, 423], [1440, 470], [1340, 503], [1265, 515], [1225, 548],
    [1160, 585], [1074, 600], [996, 586], [935, 548], [908, 515],
    [330, 515], [300, 548], [235, 579], [150, 573], [86, 548], [43, 507], [20, 460]
], dtype=np.int32)
cv2.fillPoly(mask, [poly], cv2.GC_PR_FGD)

# Definite foreground seeds on paint, glass, wheels and lower body.
fg_polys = [
    np.array([[80,220],[250,95],[700,45],[970,80],[1200,150],[1320,240],[1230,285],[850,260],[460,270],[180,330]], np.int32),
    np.array([[150,285],[520,245],[900,245],[1330,300],[1420,390],[1300,455],[1000,500],[500,495],[160,470]], np.int32),
    np.array([[330,105],[700,55],[930,90],[1040,175],[700,185],[390,175]], np.int32),
]
for p in fg_polys:
    cv2.fillPoly(mask, [p], cv2.GC_FGD)
cv2.circle(mask, (175, 422), 115, cv2.GC_FGD, -1)
cv2.circle(mask, (1085, 432), 135, cv2.GC_FGD, -1)

# Run grab cut from the seeded mask.
bgd = np.zeros((1,65), np.float64)
fgd = np.zeros((1,65), np.float64)
cv2.grabCut(img, mask, None, bgd, fgd, 7, cv2.GC_INIT_WITH_MASK)
alpha = np.where((mask == cv2.GC_FGD) | (mask == cv2.GC_PR_FGD), 255, 0).astype(np.uint8)

# Keep relevant connected components and fill enclosed holes to preserve windows/wheels.
num, labels, stats, _ = cv2.connectedComponentsWithStats((alpha > 0).astype(np.uint8), 8)
keep = np.zeros_like(alpha)
for i in range(1, num):
    x, y, ww, hh, area = stats[i]
    if area > 8000 or (area > 2000 and y > 250):
        keep[labels == i] = 255
alpha = keep

# Constrain GrabCut to a carefully traced outer silhouette. This removes the
# hedge above the roof and most grass below the car while keeping the actual
# glass, body, wheels and spoilers untouched.
sil = np.zeros_like(alpha)
body_outline = np.array([
    [14,374],[18,330],[27,285],[39,246],[58,216],[83,202],
    [103,164],[128,132],[157,106],[194,88],[247,72],[310,57],
    [382,46],[463,36],[544,31],[620,33],[682,42],[722,56],
    [757,77],[793,102],[830,130],[866,151],[908,164],[968,167],
    [1050,177],[1140,192],[1233,210],[1325,230],[1400,246],[1440,263],
    [1461,292],[1471,336],[1472,394],[1465,444],[1454,477],[1434,497],
    [1395,515],[1350,526],[1302,535],[1216,539],[1186,520],[1171,493],
    [1172,469],[918,469],[897,493],[878,509],[301,493],[286,474],
    [283,455],[53,457],[35,435],[22,407]
], dtype=np.int32)
cv2.fillPoly(sil, [body_outline], 255)
# Wheels and wheel-arch regions.
cv2.circle(sil, (112, 398), 112, 255, -1)
cv2.circle(sil, (1048, 421), 145, 255, -1)
# Narrow rocker/floor region between both wheels.
cv2.fillPoly(sil, [np.array([[195,421],[942,421],[943,490],[196,490]], np.int32)], 255)
# Preserve the front splitter and rear mud flap without keeping surrounding grass.
cv2.fillPoly(sil, [np.array([[1170,475],[1468,465],[1462,511],[1360,543],[1190,544]], np.int32)], 255)
cv2.fillPoly(sil, [np.array([[36,414],[84,432],[74,491],[35,471]], np.int32)], 255)

alpha = cv2.bitwise_and(alpha, sil)
# Morphological close + light feathering.
kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7,7))
alpha = cv2.morphologyEx(alpha, cv2.MORPH_CLOSE, kernel, iterations=1)
alpha = cv2.GaussianBlur(alpha, (0,0), 1.0)

rgba = cv2.cvtColor(img, cv2.COLOR_BGR2BGRA)
rgba[:,:,3] = alpha
ys, xs = np.where(alpha > 8)
if not len(xs):
    raise SystemExit('cutout mask empty')
pad = 16
x1, x2 = max(0, xs.min()-pad), min(w, xs.max()+pad+1)
y1, y2 = max(0, ys.min()-pad), min(h, ys.max()+pad+1)
rgba = rgba[y1:y2, x1:x2]
if rgba.shape[1] > 1200:
    s = 1200 / rgba.shape[1]
    rgba = cv2.resize(rgba, None, fx=s, fy=s, interpolation=cv2.INTER_AREA)
cv2.imwrite(str(OUT / 'randy-scirocco-side.png'), rgba, [cv2.IMWRITE_PNG_COMPRESSION, 8])

# Also save a diagnostic preview against a checker/track-like background.
ph, pw = rgba.shape[:2]
preview = np.zeros((ph+80, pw+80, 3), np.uint8)
preview[:] = (25,28,33)
for yy in range(0, preview.shape[0], 40):
    for xx in range(0, preview.shape[1], 40):
        if (xx//40 + yy//40) % 2:
            preview[yy:yy+40, xx:xx+40] = (45,48,54)
a = rgba[:,:,3:4].astype(np.float32)/255.0
rgb = rgba[:,:,:3].astype(np.float32)
roi = preview[40:40+ph,40:40+pw].astype(np.float32)
preview[40:40+ph,40:40+pw] = (rgb*a + roi*(1-a)).astype(np.uint8)
cv2.imwrite(str(OUT / 'cutout-preview.jpg'), preview, [cv2.IMWRITE_JPEG_QUALITY, 88])

for p in sorted(OUT.iterdir()):
    print(p.name, p.stat().st_size)
