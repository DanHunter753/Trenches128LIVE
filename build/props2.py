import glob,json,os,random,math
from PIL import Image, ImageDraw
OUT='/home/claude/mp/public/assets'; F='/home/claude/assets_raw/WW1 Assets/Sprites'
INK=(41,36,24,255)
def find(p):
    g=glob.glob(f'{F}/**/{p}',recursive=True); assert g,p; return g[0]
def outline(im):
    w,h=im.size; px=im.load(); out=Image.new('RGBA',(w+2,h+2),(0,0,0,0)); o=out.load(); out.paste(im,(1,1))
    for y in range(h+2):
        for x in range(w+2):
            if o[x,y][3]==0:
                for dx,dy in ((1,0),(-1,0),(0,1),(0,-1)):
                    xx,yy=x+dx,y+dy
                    if 0<=xx<w+2 and 0<=yy<h+2 and o[xx,yy][3]>0 and o[xx,yy]!=INK and px_in(im,xx-1,yy-1): o[x,y]=INK; break
    return out
def px_in(im,x,y):
    return 0<=x<im.width and 0<=y<im.height and im.getpixel((x,y))[3]>0
def pixelate(im,maxdim,colors=28,edge=True):
    im=im.crop(im.getbbox()); s=maxdim/max(im.size)
    if s<1: im=im.resize((max(1,round(im.width*s)),max(1,round(im.height*s))),Image.BOX)
    a=im.getchannel('A').point(lambda v:255 if v>110 else 0)
    rgb=im.convert('RGB').quantize(colors,dither=Image.NONE).convert('RGBA'); rgb.putalpha(a)
    if edge:   # darken silhouette edge pixels a little (reads as an inked pixel-art edge)
        px=rgb.load(); w,h=rgb.size; src=rgb.copy(); sp=src.load()
        for y in range(h):
            for x in range(w):
                if sp[x,y][3]:
                    for dx,dy in ((1,0),(-1,0),(0,1),(0,-1)):
                        xx,yy=x+dx,y+dy
                        if not(0<=xx<w and 0<=yy<h) or sp[xx,yy][3]==0:
                            r,g,b,_=sp[x,y]; px[x,y]=(int(r*.55),int(g*.55),int(b*.55),255); break
    return rgb
meta={}
# --- existing art, crunched
for i,p in enumerate(['TreeDeadA','TreeDeadC','TreeDeadF','TreeDeadH','TreeOak_LeaflessA','TreeBirchA_Leafless*']):
    im=Image.open(find(p+'.png')).convert('RGBA'); im=pixelate(im,112,30); im.save(f'{OUT}/tree{i}.png'); meta[f'tree{i}']=im.size
for i,p in enumerate('abcd'):
    im=Image.open(find(f'Mashed_Ashlands_AshlandGrass_{p}.png')).convert('RGBA'); im=pixelate(im,40,16); im.save(f'{OUT}/grass{i}.png'); meta[f'grass{i}']=im.size
im=Image.open(find('CrateLong.png')).convert('RGBA'); im=pixelate(im,64,20); im.save(f'{OUT}/crate.png'); meta['crate']=im.size
# --- new procedural pixel props
WOOD=[(141,107,67,255),(110,95,82,255),(82,72,57,255)]; MET=[(120,125,126,255),(71,72,72,255),(43,54,52,255)]; RUST=(138,90,58,255); SAND=[(180,160,112,255),(138,122,82,255),(98,86,58,255)]; DIRT=[(110,92,64,255),(82,68,46,255)]
def canvas(w,h): im=Image.new('RGBA',(w,h),(0,0,0,0)); return im,ImageDraw.Draw(im)
def save(name,im,ol=True):
    if ol: im=outline(im)
    im.save(f'{OUT}/{name}.png'); meta[name]=im.size
R=random.Random(7)
# grave cross on a dirt mound
im,d=canvas(20,30); d.polygon([(1,29),(4,24),(16,24),(19,29)],fill=DIRT[0]); d.rectangle((9,3,11,26),fill=WOOD[0]); d.rectangle((9,3,9,26),fill=WOOD[1]); d.rectangle((4,8,16,10),fill=WOOD[0]); d.rectangle((4,10,16,10),fill=WOOD[2])
for _ in range(9): d.point((R.randint(3,17),R.randint(25,28)),fill=DIRT[1])
d.rectangle((13,22,15,24),fill=(90,100,70,255)); save('cross',im)
# barrel
im,d=canvas(18,22); d.ellipse((1,1,16,6),fill=WOOD[1]); d.rectangle((1,3,16,19),fill=WOOD[0]); d.ellipse((1,15,16,21),fill=WOOD[0])
for x in range(3,16,3): d.line((x,4,x,19),fill=WOOD[2])
for y in (6,15): d.rectangle((1,y,16,y+1),fill=MET[1])
d.ellipse((3,2,14,5),fill=(70,60,50,255)); save('barrel',im)
# rubble pile
im,d=canvas(34,16)
for _ in range(26):
    x=R.randint(1,28); y=R.randint(5,12); w=R.randint(3,7); h=R.randint(2,5); c=R.choice([(150,140,125,255),(120,112,100,255),(96,88,78,255),(168,92,70,255),(136,70,52,255)])
    d.polygon([(x,y+h),(x+1,y),(x+w,y+1),(x+w+1,y+h)],fill=c)
d.rectangle((4,13,30,14),fill=(80,72,62,255)); save('rubble',im)
# barbed wire coil
im,d=canvas(36,22)
for k in range(5):
    x=4+k*6; d.ellipse((x-5,2,x+6,19),outline=MET[1],width=1)
d.line((2,11,34,11),fill=MET[2]); 
for x in range(4,34,4): d.point((x,9),fill=RUST); d.point((x+1,13),fill=RUST)
d.rectangle((1,18,3,21),fill=WOOD[1]); d.rectangle((32,18,34,21),fill=WOOD[1]); save('wirecoil',im,False)
# leaning ladder
im,d=canvas(14,44); d.line((2,43,5,1),fill=WOOD[0],width=2); d.line((10,43,13,1),fill=WOOD[0],width=2)
for y in range(5,42,6): xl=2+(43-y)*-3/42*-1; d.line((3+(43-y)*-0.07+0.6,y,11+(43-y)*-0.07+0.6,y),fill=WOOD[2],width=1)
save('ladder',im)
# signpost
im,d=canvas(26,40); d.rectangle((12,6,14,39),fill=WOOD[1]); d.polygon([(2,6),(20,6),(24,10),(20,14),(2,14)],fill=WOOD[0]); d.polygon([(6,18),(24,18),(24,26),(6,26),(2,22)],fill=WOOD[0])
d.line((5,10,16,10),fill=WOOD[2]); d.line((8,22,20,22),fill=WOOD[2]); save('signpost',im)
# loose sandbag pile
im,d=canvas(30,16)
for r,(n,y) in enumerate(((4,10),(3,5),(2,1))):
    for k in range(n):
        x=2+k*7+(r*3); d.ellipse((x,y,x+8,y+5),fill=SAND[(k+r)%2],outline=SAND[2])
save('sandpile',im,False)
# dead shrub
im,d=canvas(28,24)
for _ in range(9):
    x=14; y=23; a=R.uniform(-1.1,1.1); l=R.randint(8,18)
    for t in range(l): d.point((round(x+math.sin(a)*t),round(y-math.cos(a)*t)),fill=WOOD[R.choice((1,2))])
    for t in range(l//2,l,3): d.point((round(x+math.sin(a)*t+R.choice((-1,1))),round(y-math.cos(a)*t)),fill=WOOD[1])
save('shrub',im,False)
# shell casings / rifle in ground with helmet
im,d=canvas(16,34); d.line((8,33,9,6),fill=WOOD[1],width=2); d.rectangle((6,14,11,17),fill=MET[1]); d.ellipse((3,0,14,8),fill=(80,92,84,255),outline=MET[2]); d.line((2,5,15,5),fill=MET[2]); d.polygon([(3,33),(1,31),(14,31),(12,33)],fill=DIRT[0]); save('rifle_helmet',im)
meta['_new']=['cross','barrel','rubble','wirecoil','ladder','signpost','sandpile','shrub','rifle_helmet']
json.dump(meta,open(f'{OUT}/props.json','w')); print(meta)
# preview sheet
names=['cross','barrel','rubble','wirecoil','ladder','signpost','sandpile','shrub','rifle_helmet','crate','tree0','tree4','grass0','grass2']
sheet=Image.new('RGBA',(14*110,130),(120,110,80,255)); x=0
for n in names:
    im=Image.open(f'{OUT}/{n}.png'); s=max(1,min(100//im.width,120//im.height)); im=im.resize((im.width*s,im.height*s),Image.NEAREST); sheet.alpha_composite(im,(x,128-im.height)); x+=110
sheet.save('/tmp/props_prev.png')
