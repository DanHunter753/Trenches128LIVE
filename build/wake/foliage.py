"""Cut the owner's palm and foliage pictures (build/wake/palm_src.jpg, foliage_src.jpg) into transparent sprites:
public/assets/palm0.png (standing), palm1.png (shattered), plant0..N.png (grass tufts, bushes, flowers, stones).
The backdrop is a flat grey: everything not near that grey, grouped by connected component. Run: python3 -I build/wake/foliage.py"""
import os, numpy as np
from PIL import Image
from scipy import ndimage
HERE = os.path.dirname(os.path.abspath(__file__)); OUT = os.path.join(HERE, '..', '..', 'public', 'assets')
def cut(path, tol=26):
    a = np.asarray(Image.open(path).convert('RGB')).astype(np.int32); bg = np.median(a[:6].reshape(-1, 3), 0)
    d = np.abs(a - bg).sum(2); fg = d > tol
    for r in np.where(fg.mean(1) > .45)[0]:   # the sheets' ground rules: erase the line where no plant crosses it
        lo, hi = max(0, r - 10), min(fg.shape[0], r + 11); band = fg[lo:hi].copy(); band[max(0, r - 3 - lo):r + 4 - lo] = False
        free = ~band.any(0); fg[max(0, r - 3):r + 4, free] = False
    # the dividing lines in the sheets are thin dark rules: drop components that are very wide and short
    lab, n = ndimage.label(ndimage.binary_dilation(fg, iterations=6))
    out = []
    for i in range(1, n + 1):
        ys, xs = np.where(lab == i); h, w = ys.max() - ys.min() + 1, xs.max() - xs.min() + 1
        if w > 6 * h or (w * h) < 900: continue
        box = (xs.min(), ys.min(), xs.max() + 1, ys.max() + 1); m = (lab == i) & fg
        rgba = np.dstack([a.astype(np.uint8), (m * 255).astype(np.uint8)])[box[1]:box[3], box[0]:box[2]]
        out.append((box, Image.fromarray(rgba)))
    return out
palms = sorted(cut(os.path.join(HERE, 'palm_src.jpg')), key=lambda t: t[0][1])
palms[0][1].save(os.path.join(OUT, 'palm0.png')); palms[-1][1].save(os.path.join(OUT, 'palm1.png')); print('palms', [p[1].size for p in palms])
plants = sorted(cut(os.path.join(HERE, 'foliage_src.jpg')), key=lambda t: (t[0][1] // 150, t[0][0]))
n = 0
for box, im in plants:
    if im.size[0] < 24 or im.size[1] < 24: continue
    im.save(os.path.join(OUT, 'plant%d.png' % n)); n += 1
print('plants', n, [p[1].size for p in plants])
