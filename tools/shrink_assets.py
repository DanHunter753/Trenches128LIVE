"""v0.47.1: shrink the game's PNG art for slow connections and phones. Each picture is reduced to a 256-colour palette (with
transparency) when that is invisible: mean colour error under 8/255 and 99% of pixels within 26/255, and only if the file gets at
least 25% smaller. Pixel art usually has few colours, so most sheets pass. Re-run after adding art:
    python3 tools/shrink_assets.py public/assets"""
import sys, os, io
import numpy as np
from PIL import Image
root = sys.argv[1]; before = after = 0
for f in sorted(os.listdir(root)):
    if not f.endswith('.png'): continue
    p = os.path.join(root, f); n0 = os.path.getsize(p); before += n0
    im = Image.open(p); im.load()
    if im.mode == 'P': after += n0; continue
    a = np.array(im.convert('RGBA'))
    q = im.convert('RGBA').quantize(256, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE)
    b = io.BytesIO(); q.save(b, 'PNG', optimize=True); n1 = len(b.getvalue())
    e = np.abs(np.array(q.convert('RGBA')).astype(int) - a).max(axis=2); vis = a[:, :, 3] > 0
    ok = vis.any() and e[vis].mean() < 8 and np.percentile(e[vis], 99) <= 26 and n1 < n0 * .75
    if ok: open(p, 'wb').write(b.getvalue()); after += n1
    else: after += n0
    print(('shrunk ' if ok else 'kept   ') + f'{f:28s} {n0:>9,} -> {n1 if ok else n0:>9,}' + (f'  (err {e[vis].mean():.1f})' if vis.any() else ''))
print(f'total {before:,} -> {after:,} bytes')
