# grade third-party tiles into the trench palette (desaturate, darken, warm-grey tint)
from PIL import Image, ImageEnhance, ImageDraw
import sys
J='/home/claude/packs/0cff2114-PixelTexturePack/PixelTexturePack/Textures/'
A='/home/claude/packs/8e58b97b-AquilariusRetroTextures/'
def grade(im,sat=.35,bri=.75,con=1.1,tint=(1.0,.93,.8)):
    im=im.convert('RGB'); im=ImageEnhance.Color(im).enhance(sat); im=ImageEnhance.Brightness(im).enhance(bri); im=ImageEnhance.Contrast(im).enhance(con)
    r,g,b=im.split(); return Image.merge('RGB',(r.point(lambda v:min(255,int(v*tint[0]))),g.point(lambda v:min(255,int(v*tint[1]))),b.point(lambda v:min(255,int(v*tint[2])))))
def L(p): return Image.open(p)
if __name__=='__main__':
    c=[('WOODA',J+'Wood/WOODA.png'),('WOODB',J+'Wood/WOODB.png'),('CREAKY',J+'Wood/CREAKYWOOD.png'),('DARKW',J+'Wood/DARKWOOD.png'),('TRUNKS',J+'Wood/TRUNKS.png'),('DIRT',J+'Rocks/DIRT.png'),('SLIM',J+'Rocks/SLIMROCKS.png'),('PATH',J+'Rocks/PATHROCKS.png'),('BIGB',J+'Bricks/BIGBRICKS.png'),('REDB',J+'Bricks/REDBRICKS.png'),('TALLG',J+'Elements/TALLGRASS.png'),('SAND',J+'Elements/SANDMARKS.png')]+[('t%d'%n,A+'t%d.png'%n) for n in (2,7,18,30,31,33,45,50,52,54,12,22)]
    cell=128; out=Image.new('RGB',(cell*12,(cell+14)*4),(20,20,20)); d=ImageDraw.Draw(out)
    for i,(n,p) in enumerate(c):
        a=L(p).convert('RGB').resize((cell,cell),Image.NEAREST); b=grade(a)
        x=(i%12)*cell; y=(i//12)*2*(cell+14)
        out.paste(a,(x,y)); out.paste(b,(x,y+cell+14)); d.text((x+2,y+cell),n,fill=(255,255,0))
    out.save('/tmp/cands.png')
