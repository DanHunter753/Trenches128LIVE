# minimal binary FBX reader: node tree, meshes (positions, UVs, polygons) and model transforms
import struct,zlib,sys
import numpy as np
AT={'f':('f',4),'d':('d',8),'l':('q',8),'i':('i',4),'b':('?',1)}
class Node:
    __slots__=('name','props','kids')
    def __init__(s,n,p,k): s.name=n; s.props=p; s.kids=k
    def find(s,n): return next((k for k in s.kids if k.name==n),None)
    def all(s,n): return [k for k in s.kids if k.name==n]
def read(path):
    b=open(path,'rb').read(); assert b[:20]==b'Kaydara FBX Binary  ',path
    ver=struct.unpack('<I',b[23:27])[0]; big=ver>=7500; nul=25 if big else 13
    def prop(i):
        t=chr(b[i]); i+=1
        if t in 'YCIFDL': fm={'Y':'h','C':'?','I':'i','F':'f','D':'d','L':'q'}[t]; sz=struct.calcsize(fm); return struct.unpack('<'+fm,b[i:i+sz])[0],i+sz
        if t in 'SR': n=struct.unpack('<I',b[i:i+4])[0]; v=b[i+4:i+4+n]; return (v.decode('utf8','replace') if t=='S' else v),i+4+n
        n,enc,cl=struct.unpack('<III',b[i:i+12]); raw=b[i+12:i+12+cl]
        if enc: raw=zlib.decompress(raw)
        fm,sz=AT[t]; return np.frombuffer(raw,dtype='<'+fm,count=n),i+12+cl
    def node(i):
        if big: end,np_,pl=struct.unpack('<QQQ',b[i:i+24]); i+=24
        else: end,np_,pl=struct.unpack('<III',b[i:i+12]); i+=12
        if end==0: return None,i
        nl=b[i]; name=b[i+1:i+1+nl].decode(); i+=1+nl; props=[]
        for _ in range(np_): v,i=prop(i); props.append(v)
        kids=[]
        while i<end-nul if end-i>=nul else False:
            k,i=node(i)
            if k is None: break
            kids.append(k)
        return Node(name,props,kids),end
    i=27; top=[]
    while i<len(b)-nul:
        n,i=node(i)
        if n is None: break
        top.append(n)
    return Node('root',[],top)
def p70(n):
    out={}; P=n.find('Properties70')
    if P:
        for p in P.all('P'): out[p.props[0]]=p.props[4:]
    return out
def eul(r):   # FBX default XYZ euler (degrees): R = Rz*Ry*Rx
    x,y,z=np.radians(r)
    Rx=np.array([[1,0,0],[0,np.cos(x),-np.sin(x)],[0,np.sin(x),np.cos(x)]]); Ry=np.array([[np.cos(y),0,np.sin(y)],[0,1,0],[-np.sin(y),0,np.cos(y)]]); Rz=np.array([[np.cos(z),-np.sin(z),0],[np.sin(z),np.cos(z),0],[0,0,1]])
    return Rz@Ry@Rx
def scene(path):
    R=read(path); O=R.find('Objects'); C=R.find('Connections')
    objs={n.props[0]:n for n in O.kids}
    par={}; geo_of={}
    for c in C.all('C'):
        if c.props[0]!='OO': continue
        ch,pa=c.props[1],c.props[2]
        if ch in objs and objs[ch].name=='Geometry': geo_of.setdefault(pa,[]).append(ch)
        elif ch in objs and objs[ch].name=='Model': par[ch]=pa
    def local(mid):
        P=p70(objs[mid]); T=np.array(P.get('Lcl Translation',[0,0,0]),float); Rr=np.array(P.get('Lcl Rotation',[0,0,0]),float); S=np.array(P.get('Lcl Scaling',[1,1,1]),float)
        pre=np.array(P.get('PreRotation',[0,0,0]),float)
        M=np.eye(4); M[:3,:3]=eul(pre)@eul(Rr)@np.diag(S); M[:3,3]=T; return M
    def world(mid):
        M=local(mid); p=par.get(mid)
        while p in objs and objs[p].name=='Model': M=local(p)@M; p=par.get(p)
        return M
    meshes=[]
    for mid,gids in geo_of.items():
        if mid not in objs: continue
        name=objs[mid].props[1].split('\x00')[0]; W=world(mid)
        for gid in gids:
            g=objs[gid]; V=np.array(g.find('Vertices').props[0],float).reshape(-1,3); PI=np.array(g.find('PolygonVertexIndex').props[0])
            V=(np.c_[V,np.ones(len(V))]@W.T)[:,:3]
            uvl=g.find('LayerElementUV'); UV=None
            if uvl is not None:
                uv=np.array(uvl.find('UV').props[0],float).reshape(-1,2); ui=uvl.find('UVIndex'); mt=uvl.find('MappingInformationType').props[0]
                UV=(uv,np.array(ui.props[0]) if ui is not None else None,mt)
            tris=[]; poly=[]; corner=0; cs=[]
            for k,ix in enumerate(PI):
                last=ix<0; ix=~ix if last else ix; poly.append(ix); cs.append(k)
                if last:
                    for t in range(1,len(poly)-1): tris.append(((poly[0],cs[0]),(poly[t],cs[t]),(poly[t+1],cs[t+1])))
                    poly=[]; cs=[]
            tri_v=np.array([[a[0],b[0],c[0]] for a,b,c in tris]); tri_c=np.array([[a[1],b[1],c[1]] for a,b,c in tris])
            if UV:
                uv,ui,mt=UV
                if mt=='ByPolygonVertex': idx=ui[tri_c] if ui is not None else tri_c
                else: idx=ui[tri_v] if ui is not None else tri_v
                tuv=uv[idx]
            else: tuv=np.zeros(tri_v.shape+(2,))
            meshes.append(dict(name=name,V=V,tri=tri_v,uv=tuv))
    return meshes
if __name__=='__main__':
    for p in sys.argv[1:]:
        ms=scene(p); print(p.split('/')[-1], [(m['name'],len(m['tri']),np.round(m['V'].min(0),2).tolist(),np.round(m['V'].max(0),2).tolist()) for m in ms])
