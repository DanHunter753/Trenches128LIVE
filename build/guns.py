from g3d import *
import os as _os; sys_path=__import__('sys').path; sys_path.insert(0,_os.path.dirname(_os.path.abspath(__file__)))
import numpy as _np
from PIL import Image as _Img
LPM=_os.environ.get('LP_PACK','/home/claude/packs/lpw/LP_WeaponsPack (UNITY)')+'/'   # unzip LP_WeaponsPack_UNITY.zip and point LP_PACK at it
_LPT=None
def lp_mesh(name,butt,tip,bore_y=-.01,x=None,tint=None,cull=True):
    """LP Weapons Pack mesh fitted into the gun frame: muzzle at z=tip, butt at z=butt, bore at bore_y; one texture colour per triangle"""
    global _LPT
    from fbx import scene
    if _LPT is None: _LPT=_np.asarray(_Img.open(LPM+'Textures/Assets_Texture.png').convert('RGB'))
    m=scene(LPM+'Models/'+name+'.fbx')[0]; V=m['V']; z0,z1=V[:,2].min(),V[:,2].max(); s=(tip-butt)/(z1-z0)
    near=V[V[:,2]<z0+(z1-z0)*.05]; yb=_np.median(near[:,1]); xc=(V[:,0].min()+V[:,0].max())/2
    X0=X if x is None else x
    W=_np.c_[-(V[:,0]-xc)*s+X0,(V[:,1]-yb)*s+bore_y,butt+(z1-V[:,2])*s]
    th,tw=_LPT.shape[:2]; tris=[]; cols=[]
    for k,(a,b,c) in enumerate(m['tri']):
        tris.append([tuple(W[a]),tuple(W[b]),tuple(W[c])])
        u,v=m['uv'][k].mean(0); col=tuple(int(q) for q in _LPT[min(th-1,max(0,int((1-v%1)*th))),min(tw-1,max(0,int(u%1*tw)))])
        if tint: col=tint(V[[a,b,c]].mean(0),(z0,z1),col)
        r_,g_,b_=col
        if r_>g_+8 and g_>b_:   # wood: push the pack's tan toward the reddish walnut of the user's reference shots
            col=(min(255,int(r_*1.18)),int(g_*.78),int(b_*.62))
        cols.append(col)
    return MeshSolid(tris,cols,cull=cull)
import g3d, sys
def B(c,s,m,**k): return Solid(c,s,m,**k)
def O(c,r,l,m,taper=1.0): return Solid(c,(2*r,2*r,l),m,sides=8,taper=taper)
def hand(name,c):
    return Part(name,[B(c,(.095,.075,.13),'glove'),B((c[0]-.01,c[1]-.06,c[2]-.18),(.115,.09,.3),'sleeve')],pivot=c)
def lerp(a,b,t): return tuple(x+(y-x)*t for x,y in zip(a,b))
def ease(t): return t*t*(3-2*t)
def interp(keys,t):
    names=set(); [names.update(p) for _,p in keys]; out={}
    for n in names:
        ks=[(tt,p.get(n,T())) for tt,p in keys]
        if t<=ks[0][0]: out[n]=ks[0][1]; continue
        if t>=ks[-1][0]: out[n]=ks[-1][1]; continue
        for (t0,a),(t1,b) in zip(ks,ks[1:]):
            if t0<=t<=t1: out[n]=lerp(a,b,ease((t-t0)/(t1-t0) if t1>t0 else 1)); break
    return out
X=.1
MESH=True
# ---------------- models (barrel along +z, shooter at z=0) ----------------
def rifle_parts(scope=False,short=False):
    bt=1.62 if short else 1.88            # barrel tip
    hgl=.36 if short else .66
    body=[B((X,-.075,.90),(.082,.1,.36),'steel'),                       # receiver
          B((X,-.02,.86),(.05,.03,.3),'dark'),                            # ejection slot
          O((X,-.01,(.99+bt)/2),.021,bt-.99,'steel'),                     # barrel
          B((X,-.045,1.04+hgl/2),(.078,.075,hgl),'wood'),                 # handguard
          B((X,.007,1.04+hgl/2),(.05,.028,hgl*.92),'wood'),
          B((X,-.045,1.04+hgl+.02),(.083,.08,.025),'steel'),              # band
          B((X,.03,bt-.02),(.012,.04,.014),'steel'),                      # front sight post
          B((X,.0,bt-.04),(.045,.045,.04),'steel'),
          B((X,.0,.78),(.06,.03,.08),'steel'),                            # rear sight base
          B((X-.02,.027,.78),(.012,.03,.012),'steel'),B((X+.02,.027,.78),(.012,.03,.012),'steel'),
          B((X,-.125,.84),(.02,.03,.13),'steel'),                         # trigger guard
          B((X,-.105,.86),(.012,.04,.02),'dark')]
    stock=[B((X,-.1,.6),(.066,.12,.34),'wood',taper=.6),B((X,-.125,.74),(.058,.1,.12),'wood')]
    bolt=[B((X,-.02,.83),(.034,.034,.22),'steel'),B((X+.045,-.02,.78),(.07,.016,.016),'steel'),B((X+.085,-.02,.78),(.03,.03,.03),'steel',sides=8)]
    if scope:
        body+= [O((X,.075,.98),.032,.5,'blue'),O((X,.075,1.2),.022,.12,'steel'),B((X,.034,.84),(.02,.05,.04),'steel'),B((X,.034,1.12),(.02,.05,.04),'steel'),O((X,.075,.72),.04,.05,'lens')]
    if MESH:   # LP Weapons Pack rifle (wooden, Springfield/Garand-like) replaces the block body; the stock runs past the camera
        body=[lp_mesh('Wep_USRifle',-.25 if short else -.35,1.78 if short else 1.95)]+([s_ for s_ in body if getattr(s_,'mat','') in('blue','lens') or (scope and s_ in body[-5:])] if scope else []); stock=[]
    p=[Part('stock',stock),Part('body',body),Part('bolt',bolt,pivot=(X,-.02,.83)),
       Part('mag',[B((X,-.14,.92),(.065,.06,.2),'steel')]),
       Part('clip',[B((0,0,0),(.05,.03,.15),'brass'),B((0,.012,0),(.04,.014,.13),'brass')]),
       hand('hl',(X,-.115,1.0+hgl*.6)),hand('hr',(X+.02,-.16,.68))]
    return p
def carbine_parts():
    p=rifle_parts(short=True)
    p[3]=Part('mag',[B((X,-.19,.92),(.06,.15,.1),'blue'),B((X,-.12,.92),(.065,.04,.12),'dark')],pivot=(X,-.11,.92))
    p.append(Part('nmag',[B((0,0,0),(.06,.15,.1),'blue')]))
    return p
def shotgun_parts():
    body=[B((X,-.07,.84),(.09,.11,.42),'steel'),B((X,-.03,.84),(.05,.03,.2),'dark'),B((X+.047,-.06,.84),(.01,.04,.1),'dark'),
          O((X,0,1.7),.026,1.0,'steel'),O((X,-.055,1.55),.022,.78,'steel'),B((X,-.055,1.97),(.05,.05,.03),'steel'),   # barrel + tube
          B((X,.04,1.99),(.012,.04,.014),'steel'),B((X,-.125,.8),(.02,.03,.14),'steel')]
    stock=[B((X,-.105,.6),(.066,.12,.34),'wood',taper=.6),B((X,-.13,.74),(.06,.1,.12),'wood')]
    pump=[B((X,-.075,1.25),(.1,.085,.34),'wood'),B((X,-.075,1.25),(.108,.04,.28),'dark')]
    return [Part('stock',stock),Part('body',body),Part('pump',pump,pivot=(X,-.075,1.25)),
      Part('shell',[B((0,0,0),(.05,.05,.15),'brass'),B((0,0,-.055),(.05,.05,.04),'steel')]),
      hand('hl',(X,-.135,1.25)),hand('hr',(X+.02,-.16,.7))]
def smg_parts():
    body=[B((X,-.065,.88),(.09,.11,.5),'blue'),B((X,-.01,.88),(.05,.03,.44),'dark'),
          O((X,-.01,1.5),.04,.78,'steel'),B((X,.0,1.5),(.044,.07,.06),'dark'),B((X,.0,1.35),(.044,.07,.06),'dark'),B((X,.0,1.65),(.044,.07,.06),'dark'),
          O((X,-.01,1.97),.014,.34,'steel'),B((X,.035,1.99),(.012,.04,.014),'steel'),B((X,-.12,.9),(.02,.03,.12),'steel'),B((X,.03,.78),(.05,.025,.06),'steel')]
    stock=[B((X,-.095,.6),(.064,.12,.34),'wood',taper=.6),B((X,-.11,.74),(.055,.09,.12),'wood')]
    return [Part('stock',stock),Part('body',body),
      Part('mag',[B((X,-.2,.99),(.052,.3,.07),'blue'),B((X,-.34,.99),(.058,.025,.08),'dark')],pivot=(X,-.1,.99)),
      Part('nmag',[B((0,0,0),(.052,.3,.07),'blue')]),
      Part('charge',[B((X+.06,.0,.8),(.07,.025,.025),'steel'),B((X+.1,.0,.8),(.028,.028,.028),'steel',sides=8)],pivot=(X,0,.8)),
      hand('hl',(X,-.12,1.25)),hand('hr',(X+.02,-.15,.7))]
def lmg_parts():
    body=[B((X,-.065,.9),(.1,.12,.52),'blue'),O((X,.0,1.62),.052,.9,'steel'),O((X,.0,1.62),.056,.7,'dark'),
          O((X,.0,2.1),.019,.2,'steel'),B((X,.045,2.12),(.012,.04,.014),'steel'),
          B((X,-.065,1.23),(.09,.09,.3),'wood'),B((X,-.125,.9),(.02,.03,.13),'steel'),
          B((X-.045,-.1,1.88),(.012,.15,.012),'steel'),B((X+.045,-.1,1.88),(.012,.15,.012),'steel'),   # bipod
          B((X-.05,-.17,1.95),(.012,.012,.12),'steel'),B((X+.05,-.17,1.95),(.012,.012,.12),'steel')]
    stock=[B((X,-.1,.6),(.066,.12,.34),'wood',taper=.6),B((X,-.125,.74),(.055,.1,.12),'wood')]
    return [Part('stock',stock),Part('body',body),
      Part('cover',[B((X,.1,.9),(.11,.02,.3),'steel'),B((X,.115,.9),(.09,.02,.2),'dark')],pivot=(X,.09,.76)),
      Part('pan',[B((X,.135,.9),(.24,.07,.24),'blue',sides=8),B((X,.17,.9),(.1,.03,.1),'steel',sides=8)],pivot=(X,.1,.9)),
      Part('npan',[B((0,0,0),(.24,.07,.24),'blue',sides=8)]),
      Part('charge',[B((X+.07,.01,.95),(.07,.026,.026),'steel'),B((X+.11,.01,.95),(.03,.03,.03),'steel',sides=8)],pivot=(X,.01,.95)),
      hand('hl',(X,-.115,1.25)),hand('hr',(X+.02,-.16,.7))]
# ---------------- reload timelines ----------------
def reload_bolt(port):
    px,py,pz=port; sway={'root':T(-.03,-.04,0,0,0,-14)}
    def K(t,**p): d=dict(sway); d.update(p); return (t,d)
    return [(0,{'clip':T(px,-9,pz)}),
     K(.15,bolt=T(0,.06,0,0,0,-70),hr=T(0,.1,-.02,0,0,-30),clip=T(px,-9,pz)),
     K(.28,bolt=T(0,.06,-.14,0,0,-70),hr=T(0,.1,-.16,0,0,-30),clip=T(px-.12,py-.28,pz-.3),hl=T(-.1,-.06,-.4)),
     K(.45,bolt=T(0,.06,-.14,0,0,-70),hr=T(0,.1,-.16,0,0,-30),clip=T(px,py+.2,pz),hl=T(-.0,.0,-.35)),
     K(.6,bolt=T(0,.06,-.14,0,0,-70),hr=T(0,.1,-.16,0,0,-30),clip=T(px,py-.02,pz),hl=T(.0,-.03,-.35)),
     K(.72,bolt=T(0,.06,-.14,0,0,-70),hr=T(0,.1,-.16,0,0,-30),clip=T(px,-9,pz),hl=T(0,0,0)),
     (.85,{'root':T(-.02,-.03,0,0,0,-8),'bolt':T(0,.03,0,0,0,-30),'hr':T(0,.04,0,0,0,-10),'clip':T(px,-9,pz)}),
     (1,{'clip':T(px,-9,pz)})]
def reload_shotgun():
    far=T(.1,-9,.6); base={'root':T(0,-.03,0,0,0,-18)}
    def K(t,**p): d=dict(base); d.update(p); return (t,d)
    ld=lambda f:T(.1,-.14-.12*(1-f),.88-.1*(1-f))
    return [(0,{'shell':far}),
      K(.1,shell=far,hr=T(-.05,-.1,-.1)),K(.2,shell=T(.17,-.3,.8),hr=T(.03,-.18,.0)),K(.3,shell=T(.12,-.13,.88),hr=T(.0,-.1,.04)),
      K(.38,shell=far,hr=T(-.05,-.1,-.1)),K(.48,shell=T(.17,-.3,.8),hr=T(.03,-.18,.0)),K(.58,shell=T(.12,-.13,.88),hr=T(.0,-.1,.04)),
      K(.66,shell=far,hr=T(-.05,-.1,-.1)),
      (.8,{'root':T(0,-.01,0),'shell':far,'pump':T(0,0,-.2),'hl':T(0,0,-.2)}),(.92,{'pump':T(0,0,0),'hl':T(0,0,0)}),(1,{'shell':far})]
def reload_mag(port):
    px,py,pz=port; far=T(px,-9,pz)
    return [(0,{'nmag':far}),
     (.15,{'root':T(0,-.03,0,0,0,10),'hl':T(0,-.12,-.1)}),
     (.3,{'root':T(0,-.03,0,0,0,10),'mag':T(0,-.6,0),'hl':T(0,-.12,-.4),'nmag':far}),
     (.5,{'root':T(0,-.03,0,0,0,10),'mag':T(0,-9,0),'hl':T(0,-.4,-.4),'nmag':T(px,py-.45,pz)}),
     (.65,{'root':T(0,-.03,0,0,0,6),'mag':T(0,-9,0),'hl':T(0,-.15,-.4),'nmag':T(px,py-.2,pz)}),
     (.75,{'root':T(0,-.02,0,0,0,3),'mag':T(0,0,0),'nmag':far,'hl':T(0,0,0),'charge':T(0,0,0),'hr':T(0,0,0)}),
     (.88,{'charge':T(0,0,-.16),'hr':T(-.02,.05,-.18)}),(1,{'charge':T(0,0,0),'nmag':far})]
def reload_lmg():
    far=T(X,-9,.9)
    return [(0,{'npan':far}),
     (.12,{'cover':T(0,0,0,-70,0,0),'hl':T(0,0,-.3)}),
     (.25,{'cover':T(0,0,0,-70,0,0),'pan':T(0,.3,0),'hl':T(0,.3,-.55),'npan':far}),
     (.42,{'cover':T(0,0,0,-70,0,0),'pan':T(0,-9,0),'hl':T(.1,-.4,-.5),'npan':far}),
     (.55,{'cover':T(0,0,0,-70,0,0),'pan':T(0,-9,0),'hl':T(0,.1,-.5),'npan':T(X,.4,.9)}),
     (.68,{'cover':T(0,0,0,-70,0,0),'pan':T(0,-9,0),'hl':T(0,0,-.5),'npan':T(X,.135,.9)}),
     (.78,{'cover':T(0,0,0,-20,0,0),'pan':T(0,0,0),'npan':far,'hl':T(0,0,0)}),
     (.88,{'cover':T(0,0,0),'charge':T(0,0,-.18),'hr':T(-.02,.05,-.2)}),(1,{'charge':T(0,0,0),'npan':far})]
GUNS={
 'bolt':   dict(m=lambda:rifle_parts(),tip=1.92,rl=reload_bolt((X,-.1,.92)),fire='bolt'),
 'carbine':dict(m=carbine_parts,tip=1.66,rl=reload_mag((X,-.12,.92)),fire='bolt'),
 'shotgun':dict(m=shotgun_parts,tip=2.0,rl=reload_shotgun(),fire='pump'),
 'smg':    dict(m=smg_parts,tip=2.14,rl=reload_mag((X,-.1,.99)),fire='auto'),
 'lmg':    dict(m=lmg_parts,tip=2.22,rl=reload_lmg(),fire='auto'),
 'mark':   dict(m=lambda:rifle_parts(scope=True),tip=1.92,rl=reload_bolt((X,-.1,.92)),fire='bolt'),
}
ROOT_HIP=T(.16,-.18,.8,0,-4,0); ROOT_ADS=T(-.1,-.098,.55,0,0,0)
def comb(a,b): return tuple(x+y for x,y in zip(a,b))
def frames(name):
    g=GUNS[name]; parts=g['m'](); names=[x.name for x in parts]; out=[]
    def R(pose,rootextra=T(),fl=False,ads=False):
        g3d.CX,g3d.CY,g3d.F=(132,100,380) if ads else (104,58,360)
        r=comb(ROOT_ADS if ads else ROOT_HIP,pose.get('root',T())); r=comb(r,rootextra)
        pp={k:v for k,v in pose.items() if k!='root'}
        for hid in ('clip','shell','nmag','npan'):
            if hid in names and hid not in pp: pp[hid]=T(0,-9,0)
        if ads:
            for hh in ('hl','hr'): pp[hh]=comb(pp.get(hh,T()),T(0,-.35,0))   # hands drop out of the sight picture
        def fx(d,im):
            tp=xform((X,.0,g['tip']),T(),(0,0,0)); tp=xform(tp,r,(0,-.1,.45)); x,y=project(tp)
            starburst(d,round(x),round(y),30 if ads else 26,(255,214,110,255),(255,250,220,255))
            d.ellipse((x-48,y-28,x-24,y-12),fill=(190,190,180,255)); d.ellipse((x-68,y-38,x-48,y-22),fill=(150,150,145,255))
        return render(parts,pp,root=r,extra=(fx if fl else None))
    def fireset(ads):
        if g['fire']=='bolt': cyc=({'bolt':T(0,.06,0,0,0,-70),'hr':T(0,.1,-.02,0,0,-30)},{'bolt':T(0,.06,-.14,0,0,-70),'hr':T(0,.1,-.16,0,0,-30)})
        elif g['fire']=='pump': cyc=({'pump':T(0,0,-.2),'hl':T(0,0,-.2)},{'pump':T(0,0,-.1),'hl':T(0,0,-.1)})
        else: cyc=({'charge':T(0,0,-.1)},{})
        k=.5 if ads else 1
        return [R({},T(0,.03*k,-.07*k,-4*k,0,0),fl=True,ads=ads),R({},T(0,.02*k,-.05*k,-3*k,0,0),ads=ads),R(cyc[0],T(0,.01*k,-.03*k,-2*k,0,0),ads=ads),R(cyc[1],T(0,0,-.01*k),ads=ads)]
    out.append(R({}))
    out+=fireset(False)
    for i in range(16): out.append(R(interp(g['rl'],i/15)))
    out.append(R({},ads=True)); out+=fireset(True)
    return out
if __name__=='__main__':
    names=sys.argv[1:] or list(GUNS)
    for nm in names:
        fr=frames(nm); sheet=Image.new('RGBA',(W*len(fr),H),(0,0,0,0))
        for i,f in enumerate(fr): sheet.paste(f,(i*W,0))
        sheet.save(f'/tmp/g_{nm}.png'); print(nm,len(fr))
