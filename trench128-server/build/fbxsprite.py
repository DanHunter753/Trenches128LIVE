# FBX mesh -> tris for glbsprite.render (flat normals, unshared vertices)
import sys; sys.path.insert(0,'/home/claude/tools')
import numpy as np
from fbx import scene
from PIL import Image
LP='/home/claude/packs/lpw/LP_WeaponsPack (UNITY)/'
TEX=np.asarray(Image.open(LP+'Textures/Assets_Texture.png').convert('RGBA'))
def tris(path,scale=.01,tex=TEX,flipv=True):
    out=[]
    for m in scene(path):
        P=m['V'][m['tri']].reshape(-1,3)*scale; U=m['uv'].reshape(-1,2).copy()
        if flipv: U[:,1]=1-U[:,1]
        a,b,c=P[0::3],P[1::3],P[2::3]; n=np.cross(b-a,c-a); n/=np.linalg.norm(n,axis=1,keepdims=True)+1e-9
        N=np.repeat(n,3,axis=0); I=np.arange(len(P)).reshape(-1,3)
        out.append((P,N,U,I,tex))
    return out
