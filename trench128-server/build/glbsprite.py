# render a GLB mesh (textured) to a small pixel sprite: orthographic, z-buffer, nearest UV, lambert, inked edge
import json,struct,io,math,sys
import numpy as np
from PIL import Image
CT={5126:np.float32,5123:np.uint16,5125:np.uint32,5121:np.uint8}
NC={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}
def load(path):
    b=open(path,'rb').read(); n=struct.unpack('<I',b[12:16])[0]; j=json.loads(b[20:20+n]); o=20+n
    bl=struct.unpack('<I',b[o:o+4])[0]; binc=b[o+8:o+8+bl]
    def acc(i):
        a=j['accessors'][i]; v=j['bufferViews'][a['bufferView']]; st=v.get('byteOffset',0)+a.get('byteOffset',0)
        k=NC[a['type']]; dt=CT[a['componentType']]; cnt=a['count']
        return np.frombuffer(binc,dtype=dt,count=cnt*k,offset=st).reshape(cnt,k) if k>1 else np.frombuffer(binc,dtype=dt,count=cnt,offset=st)
    def img(i):
        im=j['images'][i]; v=j['bufferViews'][im['bufferView']]; s=v.get('byteOffset',0)
        return Image.open(io.BytesIO(binc[s:s+v['byteLength']])).convert('RGBA')
    return j,acc,img
def quat(q):
    x,y,z,w=q; return np.array([[1-2*(y*y+z*z),2*(x*y-z*w),2*(x*z+y*w)],[2*(x*y+z*w),1-2*(x*x+z*z),2*(y*z-x*w)],[2*(x*z-y*w),2*(y*z+x*w),1-2*(x*x+y*y)]])
def mesh(path,node=None,tex=None):
    j,acc,img=load(path); tris=[]
    for nd in j['nodes']:
        if 'mesh' not in nd or (node and nd.get('name')!=node): continue
        R=quat(nd.get('rotation',[0,0,0,1])); S=np.array(nd.get('scale',[1,1,1])); Tt=np.array(nd.get('translation',[0,0,0]))
        for p in j['meshes'][nd['mesh']]['primitives']:
            P=acc(p['attributes']['POSITION']).astype(float)*S@R.T+Tt; N=acc(p['attributes']['NORMAL']).astype(float)@R.T
            U=acc(p['attributes']['TEXCOORD_0']).astype(float); I=acc(p['indices']).astype(int).reshape(-1,3)
            t=tex
            if t is None and 'material' in p:
                m=j['materials'][p['material']].get('pbrMetallicRoughness',{}); bt=m.get('baseColorTexture')
                if bt: t=img(j['textures'][bt['index']]['source'])
            if isinstance(t,str): t=Image.open(t).convert('RGBA')
            tris.append((P,N,U,I,np.asarray(t) if t is not None else None))
    return tris
def rot(yaw,pitch,roll=0):
    a,b,c=map(math.radians,(yaw,pitch,roll))
    Ry=np.array([[math.cos(a),0,math.sin(a)],[0,1,0],[-math.sin(a),0,math.cos(a)]]); Rx=np.array([[1,0,0],[0,math.cos(b),-math.sin(b)],[0,math.sin(b),math.cos(b)]]); Rz=np.array([[math.cos(c),-math.sin(c),0],[math.sin(c),math.cos(c),0],[0,0,1]])
    return Rx@Ry@Rz
def render(tris,yaw=30,pitch=-20,roll=0,size=(48,48),ss=4,light=(-.4,.8,.5),ink=(30,24,18)):
    M=rot(yaw,pitch,roll); allp=np.vstack([t[0] for t in tris])@M.T
    lo=allp[:,:2].min(0); hi=allp[:,:2].max(0); W,H=size[0]*ss,size[1]*ss
    k=min((W-2*ss)/(hi[0]-lo[0]),(H-2*ss)/(hi[1]-lo[1]))
    img=np.zeros((H,W,4),np.uint8); zb=np.full((H,W),-1e9); L=np.array(light)/np.linalg.norm(light)
    for P,N,U,I,T in tris:
        Q=P@M.T; NN=N@M.T; sx=(Q[:,0]-lo[0])*k+(W-(hi[0]-lo[0])*k)/2; sy=H-((Q[:,1]-lo[1])*k+(H-(hi[1]-lo[1])*k)/2)
        for a,b,c in I:
            x0,x1,x2=sx[[a,b,c]]; y0,y1,y2=sy[[a,b,c]]
            den=(y1-y2)*(x0-x2)+(x2-x1)*(y0-y2)
            if abs(den)<1e-9: continue
            minx=max(int(min(x0,x1,x2)),0); maxx=min(int(max(x0,x1,x2))+1,W); miny=max(int(min(y0,y1,y2)),0); maxy=min(int(max(y0,y1,y2))+1,H)
            if minx>=maxx or miny>=maxy: continue
            X,Y=np.meshgrid(np.arange(minx,maxx)+.5,np.arange(miny,maxy)+.5)
            w0=((y1-y2)*(X-x2)+(x2-x1)*(Y-y2))/den; w1=((y2-y0)*(X-x2)+(x0-x2)*(Y-y2))/den; w2=1-w0-w1
            m=(w0>=-1e-4)&(w1>=-1e-4)&(w2>=-1e-4)
            if not m.any(): continue
            z=w0*Q[a,2]+w1*Q[b,2]+w2*Q[c,2]; zs=zb[miny:maxy,minx:maxx]; m&=z>zs
            if not m.any(): continue
            n=w0[...,None]*NN[a]+w1[...,None]*NN[b]+w2[...,None]*NN[c]; n/=np.linalg.norm(n,axis=-1,keepdims=True)+1e-9
            sh=np.clip(.45+.75*np.clip(n@L,0,1),0,1.15)
            if T is not None:
                u=w0*U[a,0]+w1*U[b,0]+w2*U[c,0]; v=w0*U[a,1]+w1*U[b,1]+w2*U[c,1]
                th,tw=T.shape[:2]; tx=(np.mod(u,1)*tw).astype(int).clip(0,tw-1); ty=(np.mod(v,1)*th).astype(int).clip(0,th-1)
                col=T[ty,tx,:3].astype(float)
            else: col=np.full(X.shape+(3,),150.)
            col=np.clip(col*sh[...,None],0,255)
            reg=img[miny:maxy,minx:maxx]; reg[m,:3]=col[m]; reg[m,3]=255; zs[m]=z[m]
    im=Image.fromarray(img,'RGBA').resize(size,Image.NEAREST)
    a=np.array(im); al=a[...,3]>0; edge=np.zeros_like(al)
    for dy,dx in ((1,0),(-1,0),(0,1),(0,-1)): edge|=np.roll(al,(dy,dx),(0,1))
    edge&=~al; a[edge]=list(ink)+[255]
    return Image.fromarray(a,'RGBA')
