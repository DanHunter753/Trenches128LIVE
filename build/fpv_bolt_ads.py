"""v0.45: the bolt rifle's aim-down-sights frames (21 aim, 22-25 aim + fire) from the owner's picture build/ref/bolt_ads_new.jpg
(gloved hands, bolt handle on the right). The hip, reload, sprint and melee frames of gun_bolt.png are kept. The muzzle flash and
smoke of the old aim-fire frames are lifted (everything above the front sight that differs from the old aim frame) and laid over
the new gun, which kicks down a few pixels on the shot and settles back."""
import sys
import numpy as np
from PIL import Image, ImageFilter
from collections import deque

REF, SHEET = sys.argv[1], sys.argv[2]
FW, FH, COLS = 360, 240, 6
TIP = (178.5, 121)          # where the old frames put the front-sight tip

src = np.array(Image.open(REF).convert('RGB')).astype(int)
h, w, _ = src.shape
bg = np.median(np.concatenate([src[:40].reshape(-1, 3), src[:, :40].reshape(-1, 3)]), axis=0)
near = (np.abs(src - bg).sum(2) < 42)
mask = np.zeros((h, w), bool); q = deque()
for x in range(w):
    for y in (0, h - 1):
        if near[y, x]: mask[y, x] = True; q.append((y, x))
for y in range(h):
    for x in (0, w - 1):
        if near[y, x] and not mask[y, x]: mask[y, x] = True; q.append((y, x))
while q:
    y, x = q.popleft()
    for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        ny, nx = y + dy, x + dx
        if 0 <= ny < h and 0 <= nx < w and near[ny, nx] and not mask[ny, nx]: mask[ny, nx] = True; q.append((ny, nx))
rgba = np.dstack([src, np.where(mask, 0, 255)]).astype(np.uint8)
im = Image.fromarray(rgba, 'RGBA')
# the front-sight tip in the picture: topmost opaque pixel in the middle columns
a = np.array(im)[:, :, 3]; mid = a[:, w // 2 - 40:w // 2 + 40]; ty = int(np.nonzero(mid.max(1) > 0)[0].min())
xs = np.nonzero(a[ty + 4] > 0)[0]; tx = (xs.min() + xs.max()) / 2
s = (FH - TIP[1]) / (h - ty)
small = im.resize((round(w * s), round(h * s)), Image.LANCZOS)
sa = np.array(small); sa[:, :, 3] = np.where(sa[:, :, 3] > 110, 255, 0); small = Image.fromarray(sa, 'RGBA').filter(ImageFilter.UnsharpMask(1, 60, 2))
ox, oy = round(TIP[0] - tx * s), round(TIP[1] - ty * s)

sheet = Image.open(SHEET).convert('RGBA')
def frame(f): return sheet.crop(((f % COLS) * FW, (f // COLS) * FH, (f % COLS) * FW + FW, (f // COLS) * FH + FH))
base = np.array(frame(21)).astype(int)
for f, kick in ((21, 0), (22, 5), (23, 3), (24, 2), (25, 1)):
    old = np.array(frame(f)).astype(int)
    fx = np.zeros_like(old)
    if f != 21:   # flash / smoke: what this frame adds over the old aim frame, above the sight
        diff = (np.abs(old - base).sum(2) > 40) & (old[:, :, 3] > 0)
        diff[int(TIP[1]) + 4:] = False
        diff &= old[:, :, :3].mean(2) > 95   # flash and smoke are bright; leave the old gun's dark sight behind
        fx[diff] = old[diff]
    if f in (23, 24, 25):   # smoke from the muzzle: our own puff (the old one had the old gun's sight baked into it)
        fx = np.zeros_like(old); rng = np.random.default_rng(7); lay = Image.new('RGBA', (FW, FH)); from PIL import ImageDraw; d = ImageDraw.Draw(lay)
        age = {23: 0, 24: 1, 25: 2}[f]
        for k in range(18):
            t = k / 17; y = TIP[1] - 3 - t * (34 + 14 * age); x = TIP[0] + rng.normal(0, 1 + 4 * t) + 3 * age * t
            r = 2.5 + 6 * t + 2 * age; a = int((150 - 60 * age) * (1 - .6 * t)); c = int(200 + 25 * rng.random())
            if a > 0: d.ellipse([x - r, y - r, x + r, y + r], fill=(c, c, c - 6, a))
        lay = lay.filter(ImageFilter.GaussianBlur(1.6)); la = np.array(lay); la[:, :, 3] = (la[:, :, 3] // 32) * 32   # stepped alpha: reads as pixel art
        fx = la.astype(int)
    out = Image.new('RGBA', (FW, FH)); out.alpha_composite(small, (ox, oy + kick))
    out.alpha_composite(Image.fromarray(fx.astype(np.uint8), 'RGBA'))
    sheet.paste(out, ((f % COLS) * FW, (f // COLS) * FH))
sheet.save(SHEET)
print('tip', tx, ty, 'scale', round(s, 4), 'offset', ox, oy)
