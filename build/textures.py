# builds tx_*.png world textures from the Jestan PixelTexturePack + Aquilarius Retro Textures, graded to the trench palette
import sys; sys.path.insert(0,'/home/claude/tools')
from grade import grade,J,A
from PIL import Image, ImageDraw, ImageStat
import random
O='/home/claude/mp/public/assets/'
R=random.Random(7)
def norm(im,mean=200):           # ground map is multiplied by vertex colour: keep it light and near-neutral
    g=im.convert('L'); m=ImageStat.Stat(g).mean[0]; k=mean/m
    im=im.point(lambda v:min(255,int(v*k))); return im
def tile(src,w,h):
    out=Image.new('RGB',(w,h))
    for y in range(0,h,src.height):
        for x in range(0,w,src.width): out.paste(src,(x,y))
    return out
def mud_splat(im,frac):           # darker wet mud creeping up the bottom of a wall
    d=ImageDraw.Draw(im); w,h=im.size; y0=int(h*(1-frac))
    for x in range(w):
        top=y0+R.randint(-3,3)
        for y in range(top,h):
            r,g,b=im.getpixel((x,y)); t=.55 if (x+y)%5 else .45
            im.putpixel((x,y),(int(r*t+92*(1-t)),int(g*t+76*(1-t)),int(b*t+54*(1-t))))
    return im
def posts(im,col=(36,28,20)):
    d=ImageDraw.Draw(im); w,h=im.size
    for x in (0,w-4): d.rectangle((x,0,x+3,h),fill=col); d.line((x+1,0,x+1,h),fill=(58,46,32))
    return im
# ground: pixel dirt, desaturated toward grey, normalised so vertex colours still drive light/dark
g=grade(Image.open(J+'Rocks/DIRT.png'),sat=.2,bri=.9,con=.55,tint=(1,.97,.92))
norm(g,200).save(O+'tx_mud.png')
# revetments: dark horizontal planks + posts + mud splash (front wall 2 m x 1.4 m, back wall 2 m x 2.7 m, 32 px per metre)
pl=grade(Image.open(A+'t22.png'),sat=.45,bri=.72,con=1.2,tint=(1,.9,.75)).resize((64,64),Image.NEAREST)
mud_splat(posts(tile(pl,64,45)),.22).save(O+'tx_revet_f.png')
pl2=grade(Image.open(A+'t22.png'),sat=.45,bri=.6,con=1.2,tint=(1,.9,.75)).resize((64,64),Image.NEAREST)
mud_splat(posts(tile(pl2,64,86)),.15).save(O+'tx_revet_b.png')
# duckboards: Aquilarius slatted panel, graded
grade(Image.open(A+'t7.png'),sat=.4,bri=1.05,con=1.1).resize((64,64),Image.NEAREST).save(O+'tx_duck.png')
# heavy timber (posts, beams, roofs)
grade(Image.open(J+'Wood/TRUNKS.png'),sat=.4,bri=.9).save(O+'tx_timber.png')
# burlap for sandbags (kept light: instanced colours tint it)
norm(grade(Image.open(J+'Elements/SANDMARKS.png'),sat=.15,bri=.9,con=1.3),190).save(O+'tx_burlap.png')
# ruins backdrop bricks
grade(Image.open(J+'Bricks/REDBRICKS.png'),sat=.3,bri=.7,con=1.1).save(O+'tx_brick.png')
grade(Image.open(A+'t12.png'),sat=.4,bri=.95).resize((64,64),Image.NEAREST).save(O+'tx_stone.png')
print('ok')
# puddle: grey sky-reflecting water with a dark muddy rim, ellipse alpha (for flat decals)
from PIL import ImageFilter
w=grade(Image.open(J+'Elements/WATER.png'),sat=.1,bri=1.05,con=.7,tint=(.95,.96,.97)).resize((48,24),Image.NEAREST).convert('RGBA')
px=w.load()
for y in range(24):
    for x in range(48):
        e=((x-23.5)/23.5)**2+((y-11.5)/11.5)**2+.12*R.random()
        if e>1: px[x,y]=(0,0,0,0)
        elif e>.72: px[x,y]=(58,50,38,255)
w.save(O+'tx_puddle.png')
