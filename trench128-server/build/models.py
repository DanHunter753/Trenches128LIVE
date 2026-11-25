# PSX Tools + Ammo packs -> pixel prop sprites (adds sizes to props.json)
import sys,json; sys.path.insert(0,'/home/claude/tools')
from glbsprite import mesh,render
T='/home/claude/packs/9e91923f-PSX_Tools_GLTF/PSX_Tools_GLTF/'
G='/home/claude/packs/b30872c3-Ammo/Ammo/Ammo_glb.glb'
O='/home/claude/mp/public/assets/'
S={'ammobox':render(mesh(G,'Ammo_Box_Closed'),35,25,size=(40,32)),
   'ammobox_open':render(mesh(G,'Ammo_Box_Open'),35,25,size=(40,38)),
   'shovel':render(mesh(T+'Shovel.glb',tex=T+'Texture/Shovel_DefaultMaterial_BaseColor.png'),80,0,195,size=(22,64)),
   'pickaxe':render(mesh(T+'Pickaxe.glb',tex=T+'Texture/Pickaxe_DefaultMaterial_BaseColor.png'),80,0,0,size=(40,48))}
pj=json.load(open(O+'props.json'))
for n,im in S.items(): im.save(O+n+'.png'); pj[n]=list(im.size)
pj['_new']=sorted(set(pj.get('_new',[]))|set(S))
json.dump(pj,open(O+'props.json','w')); print(pj)
