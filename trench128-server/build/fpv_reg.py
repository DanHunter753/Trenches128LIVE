"""find scale + offset that places a strip panel over the full ADS image (sum-of-squared-differences search)"""
import numpy as np
from PIL import Image
from scipy.signal import fftconvolve
def gray(im): return np.asarray(im.convert('L')).astype(np.float32)
def register(base, panel, scales=np.arange(1.6, 3.6, .04), ds=4):
    B = gray(base.resize((base.size[0] // ds, base.size[1] // ds), Image.BOX)); best = None
    for s in scales:
        pw, ph = int(panel.size[0] * s / ds), int(panel.size[1] * s / ds)
        if pw >= B.shape[1] or ph >= B.shape[0] or pw < 8: continue
        P = gray(panel.resize((pw, ph), Image.BOX)); P = P - P.mean()
        ones = np.ones_like(P); b2 = fftconvolve(B * B, ones[::-1, ::-1], 'valid'); b1 = fftconvolve(B, ones[::-1, ::-1], 'valid')
        corr = fftconvolve(B, P[::-1, ::-1], 'valid'); n = P.size
        ssd = b2 - b1 * b1 / n - 2 * corr + (P * P).sum()   # mean-removed SSD
        i = np.unravel_index(np.argmin(ssd), ssd.shape); v = ssd[i] / n
        if best is None or v < best[0]: best = (v, s, i[1] * ds, i[0] * ds)
    v, s, x, y = best
    # refine at full resolution around the coarse answer
    Bf = gray(base); best2 = None
    for s2 in np.arange(s - .05, s + .051, .01):
        pw, ph = int(panel.size[0] * s2), int(panel.size[1] * s2); P = gray(panel.resize((pw, ph), Image.BOX)); P = P - P.mean()
        for yy in range(max(0, y - 8), min(Bf.shape[0] - ph, y + 9), 2):
            for xx in range(max(0, x - 8), min(Bf.shape[1] - pw, x + 9), 2):
                W = Bf[yy:yy + ph, xx:xx + pw]; d = ((W - W.mean() - P) ** 2).mean()
                if best2 is None or d < best2[0]: best2 = (d, s2, xx, yy)
    return best2
