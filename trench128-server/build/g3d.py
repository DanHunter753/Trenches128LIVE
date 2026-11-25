"""Tiny software renderer: boxes/prisms -> flat-shaded, inked, palette-limited pixel art (first-person weapon sprites)."""
import math
from PIL import Image, ImageDraw
W,H=264,224; CX,CY=88,36; F=300
INK=(41,36,24,255)
def hx(s): return tuple(int(s[i:i+2],16) for i in (1,3,5))+(255,)
MAT={ # (lit, side, dark)
 'steel':(hx('#8e9aa6'),hx('#566470'),hx('#2c353e')),
 'blue':(hx('#85918d'),hx('#56615e'),hx('#323b39')),
 'wood':(hx('#b0602e'),hx('#7c4220'),hx('#4a2412')),
 'glove':(hx('#d49a74'),hx('#a97250'),hx('#6e452e')),
 'sleeve':(hx('#5b5c4e'),hx('#43443a'),hx('#2c2d26')),
 'brass':(hx('#ecd07a'),hx('#b3913f'),hx('#6e561f')),
 'lens':(hx('#7fa3a3'),hx('#34494a'),hx('#1a2a2a')),
 'dark':(hx('#4a5254'),hx('#2f3638'),hx('#1c2122')),
}
LIGHT=(-.35,.85,-.40); n=math.sqrt(sum(c*c for c in LIGHT)); LIGHT=tuple(c/n for c in LIGHT)
def rot(v,rx,ry,rz):
    x,y,z=v
    a=math.radians(rx); y,z=y*math.cos(a)-z*math.sin(a), y*math.sin(a)+z*math.cos(a)
    a=math.radians(ry); x,z=x*math.cos(a)+z*math.sin(a), -x*math.sin(a)+z*math.cos(a)
    a=math.radians(rz); x,y=x*math.cos(a)-y*math.sin(a), x*math.sin(a)+y*math.cos(a)
    return (x,y,z)
def add(a,b): return (a[0]+b[0],a[1]+b[1],a[2]+b[2])
def sub(a,b): return (a[0]-b[0],a[1]-b[1],a[2]-b[2])
def cross(a,b): return (a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0])
def dot(a,b): return a[0]*b[0]+a[1]*b[1]+a[2]*b[2]
def norm(a):
    l=math.sqrt(dot(a,a)) or 1; return (a[0]/l,a[1]/l,a[2]/l)
class Solid:
    """convex prism: box (sides=4) or n-gon prism along z (barrels, drums)"""
    def __init__(s,c,size,mat,sides=4,axis='z',taper=1.0):
        s.c=c;s.size=size;s.mat=mat;s.sides=sides;s.axis=axis;s.taper=taper
    def faces(s):
        w,h,d=s.size; cx,cy,cz=s.c
        if s.sides==4:
            v=[(-w/2,-h/2,-d/2),(w/2,-h/2,-d/2),(w/2,h/2,-d/2),(-w/2,h/2,-d/2),(-w/2,-h/2,d/2),(w/2,-h/2,d/2),(w/2,h/2,d/2),(-w/2,h/2,d/2)]
            if s.taper!=1.0:
                v=[(x*(s.taper if z>0 else 1),y*(s.taper if z>0 else 1),z) for x,y,z in v]
            F6=[(0,1,2,3),(5,4,7,6),(4,0,3,7),(1,5,6,2),(3,2,6,7),(4,5,1,0)]
            return [[add(v[i],s.c) for i in f] for f in F6]
        # prism along z: ring of n points
        n=s.sides; r1=(w/2,h/2); r0=(w/2,h/2); out=[]
        ring=lambda z,k:[(math.cos(2*math.pi*(i+.5)/n)*w/2*k,math.sin(2*math.pi*(i+.5)/n)*h/2*k,z) for i in range(n)]
        a=ring(-d/2,1.0); b=ring(d/2,s.taper)
        for i in range(n):
            j=(i+1)%n; out.append([a[i],a[j],b[j],b[i]])
        out.append(list(reversed(b))); out.append(a)
        return [[add(p,s.c) for p in f] for f in out]
NEAR=.34
class MeshSolid:
    """triangle mesh with one colour per triangle (sampled from the model's texture); drawn without per-face ink"""
    def __init__(s,tris,cols,mat='steel',cull=True): s.tris=tris;s.fcols=cols;s.mat=mat;s.cull=cull
    def faces(s): return s.tris
def shade(c,it):
    k=1.12 if it>.55 else .86 if it>0 else .62
    return tuple(min(255,int(v*k)) for v in c[:3])+(255,)
class Part:
    def __init__(s,name,solids,pivot=(0,0,0)): s.name=name;s.solids=solids;s.pivot=pivot
def T(dx=0,dy=0,dz=0,rx=0,ry=0,rz=0): return (dx,dy,dz,rx,ry,rz)
def xform(p,t,pivot):
    dx,dy,dz,rx,ry,rz=t
    q=rot(sub(p,pivot),rx,ry,rz); return add(add(q,pivot),(dx,dy,dz))
def project(p):
    z=max(.05,p[2]); return (CX+F*p[0]/z, CY-F*p[1]/z)
def render(parts,pose,root=None,extra=None,flash=None):
    """pose: {partname: T(...)}; root: T applied to everything about origin-ish pivot; parts whose names start with '@' are drawn after (hands)"""
    root=root or T(); faces=[]
    for pt in parts:
        t=pose.get(pt.name,T())
        for so in pt.solids:
            fc=getattr(so,'fcols',None)
            for k,f in enumerate(so.faces()):
                f=[xform(p,t,pt.pivot) for p in f]
                f=[xform(p,root,(0,-.1,.45)) for p in f]
                nrm=norm(cross(sub(f[1],f[0]),sub(f[2],f[1]))); cen=(sum(p[0] for p in f)/len(f),sum(p[1] for p in f)/len(f),sum(p[2] for p in f)/len(f))
                if fc is not None:
                    if min(q[2] for q in f)<NEAR: continue   # near clip: the stock runs past the camera
                    if so.cull and dot(nrm,cen)>=0: continue
                    if not so.cull and dot(nrm,cen)>=0: nrm=(-nrm[0],-nrm[1],-nrm[2])
                    c=shade(fc[k],dot(nrm,LIGHT)); ink=False
                else:
                    if dot(nrm,cen)>=0: continue          # back-face
                    it=dot(nrm,LIGHT); col=MAT[so.mat]
                    c=col[0] if it>.55 else col[1] if it>.0 else col[2]; ink=True
                dist=math.sqrt(dot(cen,cen)); faces.append((dist,[project(p) for p in f],c,pt.name,ink))
    im=Image.new('RGBA',(W,H),(0,0,0,0)); d=ImageDraw.Draw(im)
    faces.sort(key=lambda a:-a[0])
    for dist,poly,c,nm,ink in faces:
        pts=[(round(x),round(y)) for x,y in poly]
        d.polygon(pts,fill=c,outline=None if ink else c)
        if ink: d.polygon(pts,outline=INK,width=2)
    if extra: extra(d,im)
    return im
def starburst(d,cx,cy,r,col_outer,col_inner):
    pts=[]
    for i in range(8):
        a=math.pi/4*i-math.pi/2; rr=r if i%2==0 else r*.3; pts.append((cx+math.cos(a)*rr,cy+math.sin(a)*rr))
    d.polygon([(round(x),round(y)) for x,y in pts],fill=col_outer)
    pts=[]
    for i in range(8):
        a=math.pi/4*i-math.pi/2; rr=r*.55 if i%2==0 else r*.2; pts.append((cx+math.cos(a)*rr,cy+math.sin(a)*rr))
    d.polygon([(round(x),round(y)) for x,y in pts],fill=col_inner)
