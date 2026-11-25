import sys,colorsys,json
sys.path.insert(0,'/home/claude/build')
from comp import *
from PIL import ImageDraw
import importlib.util
spec=importlib.util.spec_from_file_location('b','/home/claude/build/build.py')
src=open('/home/claude/build/build.py').read()
ns={}; exec(src[src.index('CL=['):src.index('CROP=')],ns)   # CL + LOOK tables
CL,LOOK=ns['CL'],ns['LOOK']
CV=(512,780)
SK=(224,178,140,255); BOOT=(38,30,26,255)
def shade(c,k): return tuple(max(0,min(255,int(v*k))) for v in c[:3])+(255,)
def avg(im,box):
    px=[p for p in im.crop(box).getdata() if p[3]>200 and sum(p[:3])>60]
    if not px: return (70,80,80,255)
    return tuple(sum(p[i] for p in px)//len(px) for i in range(3))+(255,)
def poly(d,pts,fill): d.polygon(pts,fill=fill); d.line(pts+[pts[0]],fill=INK,width=4,joint='curve')
def limbs(view,pose,uni_col):
    """returns (legs layer drawn under uniform, arms layer drawn over uniform). pose 0 idle,1 stride A,2 stride B"""
    legs=Image.new('RGBA',CV,(0,0,0,0)); arms=Image.new('RGBA',CV,(0,0,0,0)); dl=ImageDraw.Draw(legs); da=ImageDraw.Draw(arms)
    pants=shade(uni_col,.8); sleeve=shade(uni_col,.95); hi=shade(uni_col,1.15)
    sw=[0,1,-1][pose]    # +1: left leg forward
    if view in ('south','north'):
        for side in (-1,1):
            lift=-sw*side*22 if pose else 0       # stride: one leg shorter in the sprite plane (foot raised)
            x0=256+side*30
            poly(dl,[(x0-26,430),(x0+26,430),(x0+24,598+lift),(x0-24,598+lift)],pants)
            poly(dl,[(x0-30,598+lift),(x0+30,598+lift),(x0+34,646+lift),(x0-34,646+lift)],BOOT)
        for side in (-1,1):
            sh=(256+side*84,318); hand=(256+side*(98+(8 if pose else 0)),402+(sw*side*-14 if pose else 0))
            a,b=(sh[0]-side*8,sh[1]),(hand[0],hand[1]-8)
            poly(da,[(a[0]-18,a[1]),(a[0]+18,a[1]),(b[0]+15,b[1]),(b[0]-15,b[1])],sleeve)
            da.ellipse((hand[0]-17,hand[1]-12,hand[0]+17,hand[1]+24),fill=SK,outline=INK,width=3)
    else:   # east (facing right); near arm swings, legs scissor
        for k,(dx,col) in enumerate(((-1,shade(pants,.8)),(1,pants))):
            off=sw*dx*30 if pose else dx*8
            x0=262+off*(1 if k else 1)
            poly(dl,[(x0-26,430),(x0+26,430),(x0+22+off*.4,598),(x0-22+off*.4,640)],col)
            poly(dl,[(x0-26+off*.4,598),(x0+44+off*.4,598),(x0+48+off*.4,646),(x0-26+off*.4,646)],BOOT)
        swing=(-sw*34 if pose else 0)
        a=(262,322); b=(262+30+swing,398)
        poly(da,[(a[0]-20,a[1]),(a[0]+20,a[1]),(b[0]+16,b[1]),(b[0]-16,b[1])],sleeve)
        da.ellipse((b[0]-17,b[1]-10,b[0]+17,b[1]+24),fill=SK,outline=INK,width=3)
    return legs,arms
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
def build(team,cls,view,pose):
    u,e,h=LOOK[team][cls]; out=Image.new('RGBA',CV,(0,0,0,0)); parts=[]
    base=Image.new('RGBA',CV,(0,0,0,0)); tmp=Image.new('RGBA',(512,512),(0,0,0,0))
    layers=[L(n,view) for n in (u,e) if n]
    uni=layers[0]; uc=avg(uni,(210,320,300,400))
    legs,arms=limbs(view,pose,uc)
    body=Image.new('RGBA',CV,(0,0,0,0)); body.alpha_composite(head(view),(0,0))
    for l in layers: body.alpha_composite(l,(0,0))
    hat=L(h,view) if h else None
    out.alpha_composite(legs); out.alpha_composite(body); out.alpha_composite(arms)
    if hat: out.alpha_composite(hat,(0,0))
    tint(out,team)
    return out
FW,FH=96,150
CROP=(72,100,440,670)   # 368x630  ->  96x164 would distort; resize uniformly below
def frame(team,cls,view,pose):
    s=build(team,cls,view,pose).crop(CROP); sc=FW/ s.width; s=s.resize((FW,round(s.height*sc)),Image.LANCZOS)
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
atl=Image.new('RGBA',(FW*12,FH*12))
for t in (0,1):
    keys=[];frs=[]
    for ci,c in enumerate(CL):
        for pose in (0,1,2):
            fr={v:frame(t,c,v,pose) for v in ('south','east','north')}; fr['west']=fr['east'].transpose(Image.FLIP_LEFT_RIGHT)
            for vi,v in enumerate(VIEWS): keys.append(((pose*4+vi)*FW,(t*6+ci)*FH)); frs.append(fr[v])
    for (pos,f),(cls,vi) in zip(zip(keys,crunch(frs)),[(c,vi) for c in CL for pose in (0,1,2) for vi in range(4)]):
        if cls=='medic' and vi in (0,2):
            d=ImageDraw.Draw(f); cx,cy=48,50
            d.rectangle((cx-8,cy-8,cx+8,cy+8),fill=(240,240,235,255),outline=(41,36,24,255)); d.rectangle((cx-2,cy-6,cx+2,cy+6),fill=(200,30,30,255)); d.rectangle((cx-6,cy-2,cx+6,cy+2),fill=(200,30,30,255))
        atl.paste(f,pos)
OUT='/home/claude/mp/public/assets'
atl.save(f'{OUT}/soldiers.png'); json.dump({'fw':FW,'fh':FH,'views':4,'poses':3,'classes':CL,'rows':'team*6+class','cols':'pose*4+view'},open(f'{OUT}/soldiers.json','w'))
prev=Image.new('RGBA',(FW*12,FH*4),(120,110,90,255))
for k,(t,c) in enumerate(((0,0),(1,0),(0,3),(1,5))): prev.alpha_composite(atl.crop((0,(t*6+c)*FH,FW*12,(t*6+c)*FH+FH)),(0,k*FH))
prev.resize((prev.width*2,prev.height*2),Image.NEAREST).save('/tmp/prev/soldiers2.png'); print('ok')
