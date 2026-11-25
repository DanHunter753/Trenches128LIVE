# Daggerfall-style finish for the first-person gun sheets: half resolution, surface grain, limited palette, inked silhouette, x2 nearest upscale
import sys,math
from PIL import Image
W,H=264,224
def h2(x,y):
    v=math.sin(x*12.9898+y*78.233)*43758.5453; return v-math.floor(v)
def grain(f):
    px=f.load(); w,h=f.size
    for y in range(h):
        for x in range(w):
            r,g,b,a=px[x,y]
            if a<128 or (r>230 and g>200): continue          # skip transparent + muzzle flash
            wood=r>g+12 and g>b                               # warm wood/skin
            steel=abs(r-g)<14 and b>=g-6 and not wood
            if wood: k=1+.13*(h2(x//6,(y-x*.55)//1.5)-.5)+.06*(h2(x,y)-.5)   # streaky grain along the stock
            elif steel: k=1+.10*(h2(x,y)-.5)+(.08 if h2(x//2,y//2)>.93 else 0)  # speckle + glints
            else: k=1+.07*(h2(x,y)-.5)
            px[x,y]=(min(255,int(r*k)),min(255,int(g*k)),min(255,int(b*k)),255)
    return f
def ink(f,col=(22,18,14,255)):
    px=f.load(); w,h=f.size; edge=[]
    for y in range(h):
        for x in range(w):
            if px[x,y][3]>=128: continue
            for dx,dy in ((1,0),(-1,0),(0,1),(0,-1)):
                X,Y=x+dx,y+dy
                if 0<=X<w and 0<=Y<h and px[X,Y][3]>=128 and not (px[X,Y][0]>200 and px[X,Y][2]<200 and px[X,Y][1]>180) and px[X,Y][0]<235:
                    edge.append((x,y)); break
    for p in edge: px[p]=col
    return f
def crunch(sheet,colors=40):
    n=sheet.width//W; small=[]
    for i in range(n):
        f=sheet.crop((i*W,0,(i+1)*W,H)).resize((W//2,H//2),Image.NEAREST)
        small.append(grain(f))
    # one shared palette per gun keeps frames from flickering
    strip=Image.new('RGBA',(W//2*n,H//2)); [strip.paste(f,(i*W//2,0)) for i,f in enumerate(small)]
    rgb=strip.convert('RGB'); pal=rgb.quantize(colors,method=Image.MEDIANCUT)
    q=rgb.quantize(palette=pal,dither=Image.Dither.NONE).convert('RGB')
    out=Image.new('RGBA',(W*n,H))
    for i in range(n):
        f=q.crop((i*W//2,0,(i+1)*W//2,H//2)).convert('RGBA'); a=small[i].split()[3].point(lambda v:255 if v>=128 else 0); f.putalpha(a)
        out.paste(ink(f).resize((W,H),Image.NEAREST),(i*W,0))
    return out
if __name__=='__main__':
    for nm in sys.argv[1:]:
        crunch(Image.open(f'/tmp/g_{nm}.png').convert('RGBA')).save(f'/home/claude/mp/public/assets/gun_{nm}.png'); print(nm)
