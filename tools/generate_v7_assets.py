from PIL import Image, ImageDraw, ImageFilter
from pathlib import Path
import random, math

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'src' / 'assets' / 'images'
OUT.mkdir(parents=True, exist_ok=True)
W,H = 1080,1920
random.seed(888)

def gradient_bg(top, bottom):
    im=Image.new('RGB',(W,H),top)
    px=im.load()
    for y in range(H):
        t=y/(H-1)
        # smoothstep
        t=t*t*(3-2*t)
        c=tuple(int(top[i]*(1-t)+bottom[i]*t) for i in range(3))
        for x in range(W): px[x,y]=c
    return im

def glow_layer(points, size=24, color=(255,210,115,180)):
    layer=Image.new('RGBA',(W,H),(0,0,0,0)); d=ImageDraw.Draw(layer)
    for x,y,r in points:
        d.ellipse((x-r,y-r,x+r,y+r), fill=color)
    return layer.filter(ImageFilter.GaussianBlur(size))

def draw_city(d, horizon=600):
    x=-20
    while x<W+20:
        bw=random.randint(40,100); bh=random.randint(70,260)
        y=horizon-bh
        fill=(8+random.randint(0,8),13+random.randint(0,8),22+random.randint(0,10))
        d.rectangle((x,y,x+bw,horizon),fill=fill)
        for wy in range(y+14,horizon-10,18):
            for wx in range(x+10,x+bw-8,16):
                if random.random()<.24:
                    col=random.choice([(255,190,92),(255,229,166),(91,171,255)])
                    d.rectangle((wx,wy,wx+4,wy+6), fill=col)
        x += bw+random.randint(8,24)

def draw_grandstand(d, side, horizon=620, bottom=1050):
    if side=='left':
        poly=[(0,horizon-60),(290,horizon+20),(320,bottom),(0,bottom+120)]
    else:
        poly=[(W,horizon-60),(W-290,horizon+20),(W-320,bottom),(W,bottom+120)]
    d.polygon(poly,fill=(10,15,24))
    # supports
    for i in range(8):
        t=i/7
        if side=='left':
            x=int(15+t*280); y=int(horizon-35+t*35)
        else:
            x=int(W-15-t*280); y=int(horizon-35+t*35)
        d.line((x,y,x+(-35 if side=='left' else 35),bottom+70),fill=(50,60,74),width=5)
    # crowd points
    for _ in range(280):
        if side=='left':
            x=random.randint(8,300)
        else:
            x=random.randint(W-300,W-8)
        y=random.randint(horizon-15,bottom)
        if random.random()<.6:
            d.ellipse((x,y,x+2,y+2),fill=random.choice([(235,238,245),(255,177,70),(96,170,255),(120,130,145)]))

def add_lights(im, d, vp_y=650):
    glows=[]
    for side in ('left','right'):
        for i in range(10):
            t=i/9
            y=int(vp_y+45 + (t**1.8)*(H-vp_y-170))
            # x converges to center at horizon
            edge=120 if side=='left' else W-120
            van=390 if side=='left' else W-390
            x=int(van + (edge-van)*(t**1.15))
            pole_top=y-int(110+260*t)
            d.line((x,y,x,pole_top),fill=(80,91,107),width=max(2,int(3+4*t)))
            r=max(4,int(5+8*t))
            d.ellipse((x-r,pole_top-r,x+r,pole_top+r),fill=(255,231,176))
            glows.append((x,pole_top,r*2))
    glow=glow_layer(glows, size=22, color=(255,202,102,125))
    im.alpha_composite(glow)

def draw_chase():
    base=gradient_bg((3,7,15),(17,23,34)).convert('RGBA'); d=ImageDraw.Draw(base)
    draw_city(d,640)
    # distant pit buildings
    d.rectangle((0,570,W,670),fill=(9,14,22))
    draw_grandstand(d,'left',620,1040); draw_grandstand(d,'right',620,1040)
    # vanishing road and barriers
    vp=(540,625)
    road=[(55,H),(1025,H),(720,vp[1]),(360,vp[1])]
    d.polygon(road,fill=(20,24,30))
    # wet road gradient stripes
    for y in range(vp[1],H,8):
        t=(y-vp[1])/(H-vp[1])
        c=int(28+18*t)
        d.line((int(360-(305*t)),y,int(720+(305*t)),y),fill=(c,c+2,c+6),width=1)
    # center rubber strips
    d.polygon([(430,H),(505,H),(525,vp[1]),(500,vp[1])],fill=(8,10,13))
    d.polygon([(575,H),(650,H),(580,vp[1]),(555,vp[1])],fill=(8,10,13))
    # lane boundaries and center guide
    for bx,vx in [(165,402),(915,678),(540,540)]:
        d.polygon([(bx-7,H),(bx+7,H),(vx+1,vp[1]),(vx-1,vp[1])],fill=(216,221,226,230))
    # dashed lane marks perspective
    for i in range(14):
        t0=i/14; t1=min(1,t0+.035+.02*t0)
        y0=int(vp[1]+(t0**1.75)*(H-vp[1])); y1=int(vp[1]+(t1**1.75)*(H-vp[1]))
        if i%2==0:
            for side in (-1,1):
                x0=int(540+side*(28+210*(t0**1.25))); x1=int(540+side*(28+210*(t1**1.25)))
                w=max(1,int(2+6*t0))
                d.line((x0,y0,x1,y1),fill=(196,203,211),width=w)
    # barriers
    d.polygon([(0,H),(55,H),(360,vp[1]),(315,vp[1])],fill=(207,211,214))
    d.polygon([(W,H),(1025,H),(720,vp[1]),(765,vp[1])],fill=(207,211,214))
    # barrier panels
    for side in ('left','right'):
        for i in range(12):
            t0=i/12; t1=(i+1)/12
            y0=int(vp[1]+(t0**1.55)*(H-vp[1])); y1=int(vp[1]+(t1**1.55)*(H-vp[1]))
            if side=='left':
                x0=int(315-(315*t0)); x1=int(315-(315*t1))
                d.line((x0,y0,x1,y1),fill=(72,80,92),width=max(1,int(2+4*t0)))
            else:
                x0=int(765+(315*t0)); x1=int(765+(315*t1))
                d.line((x0,y0,x1,y1),fill=(72,80,92),width=max(1,int(2+4*t0)))
    # orange banners
    for side in ('left','right'):
        for i in range(3):
            t=.22+i*.22
            y=int(vp[1]+(t**1.55)*(H-vp[1])); w=int(50+140*t); h=int(12+24*t)
            x=int(250-220*t) if side=='left' else int(830+220*t-w)
            d.rounded_rectangle((x,y,x+w,y+h),radius=max(3,int(5*t)),fill=(17,20,25),outline=(255,159,25),width=max(1,int(2*t)))
    add_lights(base,d,vp_y=650)
    # wet reflections
    ref=Image.new('RGBA',(W,H),(0,0,0,0)); rd=ImageDraw.Draw(ref)
    for _ in range(120):
        y=random.randint(720,H-20); t=(y-650)/(H-650)
        x=random.randint(int(220-140*t),int(860+140*t))
        col=random.choice([(255,171,62,40),(255,235,190,35),(74,159,255,28)])
        rd.rounded_rectangle((x,y,x+random.randint(2,8),y+random.randint(12,75)),radius=3,fill=col)
    base.alpha_composite(ref.filter(ImageFilter.GaussianBlur(3)))
    # vignette
    vign=Image.new('L',(W,H),0); vd=ImageDraw.Draw(vign)
    vd.ellipse((-350,-240,W+350,H+380),fill=220)
    vign=vign.filter(ImageFilter.GaussianBlur(140))
    black=Image.new('RGBA',(W,H),(0,0,0,255)); black.putalpha(Image.eval(vign,lambda p:255-p))
    base=Image.alpha_composite(base,black)
    base.convert('RGB').save(OUT/'drag-track-chase.webp','WEBP',quality=91,method=6)


def draw_burnout():
    base=gradient_bg((4,7,13),(18,22,28)).convert('RGBA'); d=ImageDraw.Draw(base)
    draw_city(d,590)
    # grandstand/pit background
    d.rectangle((0,560,W,820),fill=(10,14,21))
    # upper stands
    d.polygon([(0,520),(W,520),(W,870),(0,760)],fill=(11,16,24))
    for x in range(30,W,55):
        d.line((x,535,x-50,800),fill=(48,56,69),width=4)
    for _ in range(420):
        x=random.randint(0,W-1); y=random.randint(545,790)
        if random.random()<.72:
            d.ellipse((x,y,x+2,y+2),fill=random.choice([(230,236,245),(255,181,76),(88,159,255),(120,128,140)]))
    # barrier
    d.rectangle((0,790,W,930),fill=(205,210,215))
    for x in range(0,W,180):
        d.rounded_rectangle((x+10,815,x+165,880),radius=8,fill=(22,27,34),outline=(255,163,25),width=3)
    # track foreground
    d.polygon([(0,900),(W,900),(W,H),(0,H)],fill=(20,24,29))
    for y in range(910,H,6):
        c=28+int((y-910)/(H-910)*13)
        d.line((0,y,W,y),fill=(c,c+2,c+6),width=1)
    # lane/rubber
    d.polygon([(0,1120),(W,1040),(W,1250),(0,1330)],fill=(8,10,13))
    d.line((0,1390,W,1310),fill=(230,232,234),width=8)
    d.line((0,1540,W,1460),fill=(230,232,234),width=5)
    # floodlights
    glows=[]
    for x in [80,260,500,760,1000]:
        y=480-random.randint(0,30)
        d.line((x,810,x,y),fill=(73,84,100),width=5)
        d.ellipse((x-10,y-10,x+10,y+10),fill=(255,232,180))
        glows.append((x,y,22))
    base.alpha_composite(glow_layer(glows,24,(255,204,115,135)))
    # wet reflections
    ref=Image.new('RGBA',(W,H),(0,0,0,0)); rd=ImageDraw.Draw(ref)
    for _ in range(150):
        x=random.randint(0,W); y=random.randint(920,H)
        col=random.choice([(255,168,45,45),(255,239,202,35),(56,145,255,35)])
        rd.rounded_rectangle((x,y,x+random.randint(3,11),y+random.randint(15,95)),radius=3,fill=col)
    base.alpha_composite(ref.filter(ImageFilter.GaussianBlur(3)))
    # vignette
    vign=Image.new('L',(W,H),0); vd=ImageDraw.Draw(vign); vd.ellipse((-300,-180,W+300,H+300),fill=215); vign=vign.filter(ImageFilter.GaussianBlur(150))
    black=Image.new('RGBA',(W,H),(0,0,0,255)); black.putalpha(Image.eval(vign,lambda p:255-p)); base=Image.alpha_composite(base,black)
    base.convert('RGB').save(OUT/'drag-burnout-box.webp','WEBP',quality=91,method=6)

if __name__=='__main__':
    draw_chase(); draw_burnout(); print('wrote assets to',OUT)
