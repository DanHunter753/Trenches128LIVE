import sys, struct, numpy as np, json, os
import matplotlib; matplotlib.use('Agg'); import matplotlib.tri as mtri
from PIL import Image
src, out = sys.argv[1], sys.argv[2]; os.makedirs(out, exist_ok=True)
d = open(src, 'rb').read(); o = d.find(b'VERT'); n, st = struct.unpack('<2I', d[o+4:o+12]); s0 = o + 12
v = np.frombuffer(d[s0:s0+n*st], dtype=np.uint8).reshape(n, st); pos = v[:, :12].copy().view('<f4').reshape(n, 3)
oi = d.find(b'IND4'); ni = struct.unpack('<I', d[oi+4:oi+8])[0]; idx = np.frombuffer(d[oi+8:oi+8+ni*4], dtype='<u4')
print('verts', n, 'indices', ni, 'max idx', idx.max())
tri = idx.reshape(-1, 3).astype(np.int64)
T = mtri.Triangulation(pos[:, 0], pos[:, 1], tri); f = mtri.LinearTriInterpolator(T, pos[:, 2])
R = 1024; xs = np.linspace(-5016, 5016, R); X, Y = np.meshgrid(xs, xs)
H = f(X, Y).filled(np.nan); print('nan', np.isnan(H).sum(), 'min', np.nanmin(H), 'max', np.nanmax(H))
H = np.where(np.isnan(H), -65, H)
np.save(os.path.join(out, 'height_1024.npy'), H.astype(np.float32))
water = 30
land = H > water; ys, xs_ = np.where(land); print('land bbox (world units)', xs[xs_.min()], xs[xs_.max()], xs[ys.min()], xs[ys.max()], 'land cells', land.sum(), 'of', R*R)
# previews
g = np.clip((H - (-65)) / (236 + 65), 0, 1); im = np.zeros((R, R, 3), np.uint8)
deep = H < water - 15; shallow = (H >= water - 15) & (H <= water)
im[deep] = (20, 50, 90); im[shallow] = (60, 120, 150)
k = np.clip((H - water) / 40, 0, 1)
im[land] = np.stack([200 - 90 * k, 190 - 70 * k, 120 - 60 * k], -1)[land].astype(np.uint8)
Image.fromarray(im).save(os.path.join(out, 'height_preview.png'))
Image.fromarray(((H - H.min()) / (H.max() - H.min()) * 255).astype(np.uint8)).save(os.path.join(out, 'height_gray.png'))
