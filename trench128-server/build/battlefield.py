# procedural pixel sprites for the video look: splintered trunks, knife-rest wire, smoke columns
import json,random
from PIL import Image,ImageDraw
O='/home/claude/mp/public/assets/'; R=random.Random(11)
INK=(26,22,18,255)
def ink(im):
    px=im.load(); w,h=im.size; e=[]
    for y in range(h):
        for x in range(w):
            if px[x,y][3]==0 and any(0<=x+dx<w and 0<=y+dy<h and px[x+dx,y+dy][3]>0 and px[x+dx,y+dy]!=INK for dx,dy in((1,0),(-1,0),(0,1),(0,-1))): e.append((x,y))
    for p in e: px[p]=INK
    return im
def trunk(seed,w=28,h=120):
    r=random.Random(seed); im=Image.new('RGBA',(w,h),(0,0,0,0)); d=ImageDraw.Draw(im)
    cx=w//2; tw=r.randint(5,7); top=r.randint(4,30)
    base=[(70,62,54),(58,51,44),(84,75,64),(46,40,35)]
    sl=r.uniform(-.04,.04)
    for y in range(top,h):
        lean=int((h-y)*sl); hw=tw//2+(1 if y>h-10 else 0)+(2 if y>h-4 else 0)
        for x in range(cx-hw+lean,cx+hw+lean+1):
            c=base[0] if x<cx+lean-1 else base[1] if x>cx+lean+1 else base[2]
            if r.random()<.12: c=base[3]
            d.point((x,y),fill=c+(255,))
    # splintered top: jagged spikes
    for k in range(r.randint(3,5)):
        x=cx-tw//2+r.randint(0,tw); L=r.randint(4,14)
        d.line((x,top,x+r.randint(-2,2),top-L),fill=(96,86,72,255))
    # a couple of snapped branches
    for k in range(r.randint(0,2) if h-40>top+8 else 0):
        y=r.randint(top+8,h-40); s=r.choice((-1,1)); L=r.randint(5,10)
        d.line((cx+s*tw//2,y,cx+s*(tw//2+L),y-r.randint(3,8)),fill=base[1]+(255,),width=2)
    return ink(im)
def knife():
    im=Image.new('RGBA',(64,30),(0,0,0,0)); d=ImageDraw.Draw(im); wood=(74,58,40,255)
    for x in (6,32,58):
        d.line((x-6,29,x+6,5),fill=wood,width=2); d.line((x+6,29,x-6,5),fill=wood,width=2)
    d.line((0,17,63,17),fill=wood,width=2)
    for y in (8,13,21,25):
        for x in range(0,64):
            if (x+y)%3: im.putpixel((x,y+((x//5)%2)),(58,56,52,255))
        for x in range(2,64,7): d.point((x,y-1),fill=(90,88,82,255)); d.point((x+1,y+1),fill=(90,88,82,255))
    return ink(im)
def smoke(seed,w=48,h=110):
    r=random.Random(seed); im=Image.new('RGBA',(w,h),(0,0,0,0)); px=im.load()
    blobs=[(w/2+r.uniform(-4,4)+(h-y)*.06, y, 6+ (h-y)*.13*r.uniform(.8,1.2)) for y in range(h-4,4,-7)]
    for y in range(h):
        for x in range(w):
            best=0
            for bx,by,br in blobs:
                dd=((x-bx)**2+(y-by)**2)**.5/br
                if dd<1: best=max(best,1-dd)
            if best>0:
                dens=min(1,best*1.6)*(.55+.45*y/h)
                if ((x*3+y*5)%7)/7 < dens:    # ordered dither: crisp retro translucency under alphaTest
                    g=int(70+60*(1-y/h)+r.randint(-6,6)); px[x,y]=(g,g-2,g-6,255)
    return im
S={'splinter0':trunk(1),'splinter1':trunk(2,24,140),'splinter2':trunk(3,30,96),'stump0':trunk(4,24,40),'knife':knife(),'smoke0':smoke(5),'smoke1':smoke(6,56,130)}
pj=json.load(open(O+'props.json'))
for n,im in S.items(): im.save(O+n+'.png'); pj[n]=list(im.size)
pj['_new']=sorted(set(pj.get('_new',[]))|set(S)); json.dump(pj,open(O+'props.json','w'))
c=Image.new('RGBA',(sum(i.width*3+8 for i in S.values()),420),(120,118,112,255)); x=0
for i in S.values(): c.alpha_composite(i.resize((i.width*3,i.height*3),Image.NEAREST),(x,0)); x+=i.width*3+8
c.save('/tmp/bf.png'); print('ok')
# --- parachute canopy, bell tents and team flags for the home bases
def chute():
    im=Image.new('RGBA',(56,44),(0,0,0,0)); d=ImageDraw.Draw(im)
    d.pieslice((2,2,54,46),180,360,fill=(196,190,170,255))
    for x in range(6,52,8): d.line((x,24,x+3,6 if 14<x<44 else 14),fill=(160,154,134,255))
    d.rectangle((2,22,54,25),fill=(150,144,124,255))
    for x in (6,18,38,50): d.line((x,25,28,43),fill=(60,56,50,255))
    return ink(im)
def tent():
    im=Image.new('RGBA',(60,40),(0,0,0,0)); d=ImageDraw.Draw(im)
    d.polygon([(30,2),(58,38),(2,38)],fill=(120,116,90,255)); d.polygon([(30,2),(58,38),(40,38)],fill=(96,92,70,255))
    d.polygon([(30,14),(36,38),(24,38)],fill=(44,40,32,255)); d.line((30,0,30,6),fill=(70,56,40,255),width=2)
    for x,y in ((6,36),(54,36)): d.point((x,y),fill=(60,50,36,255))
    return ink(im)
def flag(col):
    im=Image.new('RGBA',(30,96),(0,0,0,0)); d=ImageDraw.Draw(im)
    d.rectangle((3,2,5,95),fill=(80,66,48,255)); d.polygon([(6,4),(28,8),(26,16),(29,24),(6,22)],fill=col+(255,)); d.line((6,13,27,15),fill=tuple(max(0,c-40) for c in col)+(255,))
    return ink(im)
S2={'chute':chute(),'tent':tent(),'flag0':flag((60,96,170)),'flag1':flag((70,130,64))}
pj=json.load(open(O+'props.json'))
for n,im in S2.items(): im.save(O+n+'.png'); pj[n]=list(im.size)
pj['_new']=sorted(set(pj.get('_new',[]))|set(S2)); json.dump(pj,open(O+'props.json','w'))
c=Image.new('RGBA',(sum(i.width*3+8 for i in S2.values()),300),(120,118,112,255)); x=0
for i in S2.values(): c.alpha_composite(i.resize((i.width*3,i.height*3),Image.NEAREST),(x,0)); x+=i.width*3+8
c.save('/tmp/bf2.png')
