from PIL import Image, ImageSequence, ImageFilter
import colorsys, json
g=Image.open('/mnt/user-data/uploads/bc08cf93-image.gif'); fr=[f.convert('RGB') for f in ImageSequence.Iterator(g)]
def key(im):
    px=im.load(); w,h=im.size; out=Image.new('RGBA',(w,h),(0,0,0,0)); o=out.load()
    for y in range(h):
        for x in range(w):
            r,g,b=px[x,y]; hh,s,v=colorsys.rgb_to_hsv(r/255,g/255,b/255)
            glove=s>.38 and .02<hh<.14 and v>.18
            sleeve=v>.66 and s<.14 and y>150
            if glove or sleeve: o[x,y]=(r,g,b,255)
    return out
idx=list(range(0,188,4)); SW,SH=160,64
sheet=Image.new('RGBA',(SW*len(idx),SH),(0,0,0,0))
for k,i in enumerate(idx):
    im=key(fr[i]).crop((0,150,640,400)).resize((SW,SH),Image.BOX)
    a=im.getchannel('A').point(lambda v:255 if v>110 else 0); im.putalpha(a)
    # posterise to a chunky palette
    rgb=im.convert('RGB').quantize(12,dither=Image.NONE).convert('RGB'); rgb=rgb.convert('RGBA'); rgb.putalpha(a)
    sheet.paste(rgb,(k*SW,0))
sheet.save('/home/claude/mp/public/assets/climb_hands.png')
json.dump({'w':SW,'h':SH,'n':len(idx)},open('/home/claude/mp/public/assets/climb_hands.json','w'))
bg=Image.new('RGBA',(SW*8,SH*2),(90,110,90,255))
for j,k in enumerate([2,8,14,20,26,32,38,44]): bg.alpha_composite(sheet.crop((k*SW,0,k*SW+SW,SH)),(j*SW,0))
bg.resize((bg.width,bg.height)).save('/tmp/hands_prev.png'); print(len(idx))
