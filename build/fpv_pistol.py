"""v0.41 revolver (last stand) from the owner's reference art: build/ref/pistol_side.jpg (hip) and pistol_rear.jpg (aim).
Output public/assets/gun_pistol.png: two 360x240 frames side by side, 0 = hip, 1 = aiming. Run: python3 build/fpv_pistol.py"""
import os
import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage
HERE = os.path.dirname(__file__); REF = os.path.join(HERE, 'ref'); OUT = os.path.join(HERE, '..', 'public', 'assets', 'gun_pistol.png')
FW, FH = 360, 240
def cut(im, tol=34):   # clear only the grey backdrop connected to the border, so dark metal inside the gun stays solid
    a = np.asarray(im.convert('RGB')).astype(np.int32)
    bg = np.median(np.concatenate([a[:4].reshape(-1, 3), a[-4:].reshape(-1, 3), a[:, :4].reshape(-1, 3), a[:, -4:].reshape(-1, 3)]), 0)
    d = np.abs(a - bg).sum(2); sat = a.max(2) - a.min(2)
    bgl = (d < tol) | ((sat < 12) & (np.abs(a.mean(2) - bg.mean()) < 20))
    lab, n = ndimage.label(bgl); edge = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    mask = ~np.isin(lab, list(edge))
    sizes = ndimage.sum(np.ones_like(d), lab, index=np.arange(n + 1)); means = ndimage.mean(d, lab, index=np.arange(n + 1))
    clear = [i for i in range(1, n + 1) if i not in edge and sizes[i] > 900 and means[i] < 14]   # the gap inside the trigger guard
    if clear: mask &= ~np.isin(lab, clear)
    mask = ndimage.binary_opening(mask, iterations=1)
    out = im.convert('RGBA'); out.putalpha(Image.fromarray((mask * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(.6))); return out
def place(name, scale, anchor_src, anchor_dst, solid=None):
    """scale the cut-out and put it so the source point anchor_src lands on anchor_dst in a 360x240 frame (the sleeve runs off
    the right/bottom edge)"""
    a = np.asarray(Image.open(os.path.join(REF, name)).convert('RGB'))
    h0, w0 = a.shape[:2]; P = 24   # pad first so the cut doesn't nibble the picture's own border, then carry the sleeve on along its edge
    r = np.asarray(cut(Image.fromarray(np.pad(a, ((P, P), (P, P), (0, 0)), mode='edge'))))[P:P + h0, P:P + w0]
    im = Image.fromarray(np.pad(r, ((0, 500), (0, 800), (0, 0)), mode='edge'))   # runs off the right and bottom of the screen
    w, h = im.size; im = im.resize((round(w * scale), round(h * scale)), Image.LANCZOS)
    fr = Image.new('RGBA', (FW, FH), (0, 0, 0, 0))
    fr.alpha_composite(im, (0, 0)) if False else None
    ox, oy = round(anchor_dst[0] - anchor_src[0] * scale), round(anchor_dst[1] - anchor_src[1] * scale)
    big = Image.new('RGBA', (FW + 800, FH + 800), (0, 0, 0, 0)); big.alpha_composite(im, (ox + 400, oy + 400))
    fr = np.asarray(big.crop((400, 400, 400 + FW, 400 + FH))).copy()
    if solid:   # backdrop-coloured shadow folds at the sleeve's far edge came out see-through: fill them from the pixels beside them
        x0, y0 = solid
        for x in range(FW - 1, x0 - 1, -1):
            for y in range(y0, FH):
                if fr[y, x, 3] < 255 and fr[y, x - 6, 3] > 200: fr[y, x] = fr[y, x - 6]
    return Image.fromarray(fr)
sheet = Image.new('RGBA', (FW * 2, FH), (0, 0, 0, 0))
sheet.alpha_composite(place('pistol_side.jpg', .2, (1024, 1024), (FW - 6, FH + 34), solid=(300, 150)), (0, 0))      # hip: bottom-right corner of the picture on the frame's corner
sheet.alpha_composite(place('pistol_rear.jpg', .2, (512, 285), (FW // 2, 112)), (FW, 0))  # aim: the front sight sits at the screen centre
sheet.save(OUT, optimize=True); print(OUT, os.path.getsize(OUT))
