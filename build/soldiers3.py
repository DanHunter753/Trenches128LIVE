import sys,colorsys,json
sys.path.insert(0,'/home/claude/build')
from comp import *
from PIL import ImageDraw
import importlib.util
spec=importlib.util.spec_from_file_location('b','/home/claude/build/build.py')
src=open('/home/claude/build/build.py').read()
ns={}; exec(src[src.index('CL=['):src.index('CROP=')],ns)   # CL + LOOK tables
CL,LOOK=ns['CL'],ns['LOOK']
# v0.22: recon / sniper class - soft cap, field kit, binoculars on the chest
CL=CL+['recon']; LOOK[0]['recon']=('IR_InfantryUniform_Thin','IR_InfantryEquipment_Thin','IR_Kepi'); LOOK[1]['recon']=('KB_InfantryUniform_Thin','KB_InfantryEquipment_Thin','KB_Feldmutze')
NC=len(CL)
CV=(512,780)
SK=(224,178,140,255); BOOT=(38,30,26,255)
def shade(c,k): return tuple(max(0,min(255,int(v*k))) for v in c[:3])+(255,)
def avg(im,box):
    px=[p for p in im.crop(box).getdata() if p[3]>200 and sum(p[:3])>60]
    if not px: return (70,80,80,255)
    return tuple(sum(p[i] for p in px)//len(px) for i in range(3))+(255,)
def poly(d,pts,fill): d.polygon(pts,fill=fill); d.line(pts+[pts[0]],fill=INK,width=4,joint='curve')
def arm(d,a,b,col,w=17):
    poly(d,[(a[0]-w,a[1]),(a[0]+w,a[1]),(b[0]+w-2,b[1]),(b[0]-w+2,b[1])],col)
def fist(d,p): d.ellipse((p[0]-16,p[1]-12,p[0]+16,p[1]+20),fill=SK,outline=INK,width=3)
HANDS={   # canvas positions of the hands for each view/state (the weapon overlay is laid out to meet them)
 ('south','hold'):((226,420),(300,372)), ('south','aim'):((232,336),(268,352)),
 ('east','hold'):((284,412),(380,392)), ('east','aim'):((300,338),(396,340)),
 ('north','hold'):((290,418),(220,372)), ('north','aim'):((300,334),(236,348))}
def limbs(view,pose,uni_col,st='hold'):
    """legs layer (under the uniform), back layer (far arm, under the uniform) and arms layer (over it).
    pose 0 idle, 1 stride A, 2 stride B; st 'hold' or 'aim'"""
    legs=Image.new('RGBA',CV,(0,0,0,0)); back=Image.new('RGBA',CV,(0,0,0,0)); arms=Image.new('RGBA',CV,(0,0,0,0))
    dl=ImageDraw.Draw(legs); db=ImageDraw.Draw(back); da=ImageDraw.Draw(arms)
    pants=shade(uni_col,.8); sleeve=shade(uni_col,.95); far=shade(uni_col,.72)
    sw=[0,1,-1][pose]
    if view in ('south','north'):
        for side in (-1,1):
            lift=-sw*side*22 if pose else 0; x0=256+side*30
            poly(dl,[(x0-26,430),(x0+26,430),(x0+24,598+lift),(x0-24,598+lift)],pants)
            poly(dl,[(x0-30,598+lift),(x0+30,598+lift),(x0+34,646+lift),(x0-34,646+lift)],BOOT)
        h1,h2=HANDS[(view,st)]
        if view=='south':
            arm(da,(256-76,322),h1,sleeve); arm(da,(256+76,322),h2,sleeve); fist(da,h1); fist(da,h2)
        else:   # from behind: hands are hidden by the body, elbows show
            e1=(h1[0]+28,(322+h1[1])//2+(-18 if st=='aim' else 0)); e2=(h2[0]-28,(322+h2[1])//2+(-18 if st=='aim' else 0))
            arm(da,(256+76,322),e1,sleeve); arm(da,(256-76,322),e2,sleeve)
    else:   # east (facing right)
        for k,(dx,col) in enumerate(((-1,shade(pants,.8)),(1,pants))):
            off=sw*dx*30 if pose else dx*8; x0=262+off
            poly(dl,[(x0-26,430),(x0+26,430),(x0+22+off*.4,598),(x0-22+off*.4,640)],col)
            poly(dl,[(x0-26+off*.4,598),(x0+44+off*.4,598),(x0+48+off*.4,646),(x0-26+off*.4,646)],BOOT)
        h1,h2=HANDS[('east',st)]
        arm(db,(254,320),h2,far); fist(db,h2)          # far arm reaches for the forend behind the body line
        arm(da,(266,324),h1,sleeve); fist(da,h1)       # near arm on the wrist of the stock
    return legs,back,arms
def tint(im,team):
    px=im.load(); w,h=im.size; hue=(0.60 if team==0 else 0.33)
    for y in range(h):
        for x in range(w):
            r,g,b,a=px[x,y]
            if a<8: continue
            H,Sa,V=colorsys.rgb_to_hsv(r/255,g/255,b/255)
            if V<.17: continue                                   # ink / boots
            if 0.02<H<0.2 and Sa>.08: continue                  # skin, leather, brass
            if (H<.03 or H>.95) and Sa>.45: continue             # red details
            nS=min(.78,max(Sa*1.5,.50)); nV=min(1,V*(1.12 if team==0 else 1.08)+.04)
            r2,g2,b2=colorsys.hsv_to_rgb(hue,nS,nV); px[x,y]=(int(r2*255),int(g2*255),int(b2*255),a)
def build(team,cls,view,pose,st='hold'):
    u,e,h=LOOK[team][cls]; out=Image.new('RGBA',CV,(0,0,0,0)); parts=[]
    base=Image.new('RGBA',CV,(0,0,0,0)); tmp=Image.new('RGBA',(512,512),(0,0,0,0))
    layers=[L(n,view) for n in (u,e) if n]
    uni=layers[0]; uc=avg(uni,(210,320,300,400))
    legs,back,arms=limbs(view,pose,uc,st)
    body=Image.new('RGBA',CV,(0,0,0,0)); body.alpha_composite(head(view),(0,0))
    for l in layers: body.alpha_composite(l,(0,0))
    hat=L(h,view) if h else None
    out.alpha_composite(legs); out.alpha_composite(back); out.alpha_composite(body); out.alpha_composite(arms)
    if hat: out.alpha_composite(hat,(0,0))
    tint(out,team)
    return out
FW,FH=96,150
CROP=(72,100,440,670)   # 368x630  ->  96x164 would distort; resize uniformly below
def frame(team,cls,view,pose,st='hold'):
    s=build(team,cls,view,pose,st).crop(CROP); sc=FW/ s.width; s=s.resize((FW,round(s.height*sc)),Image.LANCZOS)
    out=Image.new('RGBA',(FW,FH),(0,0,0,0)); out.alpha_composite(s.crop((0,0,FW,min(FH,s.height))),(0,max(0,FH-s.height))); return out
VIEWS=('south','east','north','west')
def crunch(frames,colors=48):
    """downscale x2, quantise every frame to one shared palette, hard alpha, inked edge, upscale x2 (nearest) -> chunky pixel art"""
    small=[f.resize((FW//2,FH//2),Image.NEAREST) for f in frames]
    mosaic=Image.new('RGB',(FW//2*len(small),FH//2),(0,0,0))
    for i,f in enumerate(small):
        bg=Image.new('RGB',f.size,(0,0,0)); bg.paste(f,mask=f.getchannel('A')); mosaic.paste(bg,(i*FW//2,0))
    pal=mosaic.quantize(colors,dither=Image.NONE); out=[]
    for f in small:
        a=f.getchannel('A').point(lambda v:255 if v>120 else 0)
        rgb=f.convert('RGB').quantize(palette=pal,dither=Image.NONE).convert('RGBA'); rgb.putalpha(a)
        px=rgb.load(); w,h=rgb.size; sp=rgb.copy().load()
        for y in range(h):
            for x in range(w):
                if sp[x,y][3]:
                    for dx,dy in ((1,0),(-1,0),(0,1),(0,-1)):
                        xx,yy=x+dx,y+dy
                        if not(0<=xx<w and 0<=yy<h) or sp[xx,yy][3]==0:
                            r,g,b,_=sp[x,y]; px[x,y]=(int(r*.62),int(g*.62),int(b*.62),255); break
        out.append(rgb.resize((FW,FH),Image.NEAREST))
    return out
if __name__=='__main__':
    POSES=((0,'hold'),(1,'hold'),(2,'hold'),(0,'aim'))
    atl=Image.new('RGBA',(FW*16,FH*2*NC))
    for t in (0,1):
        keys=[];frs=[];meta=[]
        for ci,c in enumerate(CL):
            for pi,(pose,st) in enumerate(POSES):
                fr={v:frame(t,c,v,pose,st) for v in ('south','east','north')}; fr['west']=fr['east'].transpose(Image.FLIP_LEFT_RIGHT)
                for vi,v in enumerate(VIEWS): keys.append(((pi*4+vi)*FW,(t*NC+ci)*FH)); frs.append(fr[v]); meta.append((c,vi))
        for (pos,f),(cls,vi) in zip(zip(keys,crunch(frs)),meta):
            if cls=='medic' and vi in (0,2):
                d=ImageDraw.Draw(f); cx,cy=48,50
                d.rectangle((cx-8,cy-8,cx+8,cy+8),fill=(240,240,235,255),outline=(41,36,24,255)); d.rectangle((cx-2,cy-6,cx+2,cy+6),fill=(200,30,30,255)); d.rectangle((cx-6,cy-2,cx+6,cy+2),fill=(200,30,30,255))
            if cls=='recon' and vi==0:   # field glasses hanging on the chest
                d=ImageDraw.Draw(f); cx,cy=48,52
                for ox in (-5,3): d.rectangle((cx+ox-1,cy-4,cx+ox+3,cy+5),fill=(34,30,26,255),outline=(14,12,10,255)); d.rectangle((cx+ox,cy+3,cx+ox+2,cy+4),fill=(120,130,140,255))
                d.line((cx-6,cy-4,cx-10,cy-18),fill=(70,48,30,255),width=1); d.line((cx+6,cy-4,cx+10,cy-18),fill=(70,48,30,255),width=1)
            atl.paste(f,pos)
    OUT='/home/claude/mp/public/assets'
    atl.save(f'{OUT}/soldiers.png'); json.dump({'fw':FW,'fh':FH,'views':4,'poses':4,'poseNames':['idle','strideA','strideB','aim'],'classes':CL,'rows':'team*%d+class'%NC,'cols':'pose*4+view'},open(f'{OUT}/soldiers.json','w'))
    prev=Image.new('RGBA',(FW*16,FH*2),(120,110,90,255))
    for k,(t,c) in enumerate(((0,0),(1,2))): prev.alpha_composite(atl.crop((0,(t*6+c)*FH,FW*16,(t*6+c)*FH+FH)),(0,k*FH))
    prev.resize((prev.width*2,prev.height*2),Image.NEAREST).save('/tmp/prev/soldiers2.png'); print('ok')
