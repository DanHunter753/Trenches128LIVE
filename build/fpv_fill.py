"""v0.29.1: fill the place where the player's chest was cut out of a first-person picture with sleeve cloth copied from
the arm, so the arm reads as one piece (no hole between the arms)."""
import numpy as np
from PIL import Image, ImageDraw, ImageChops, ImageFilter
from scipy.ndimage import binary_erosion
def poly_mask(size, pts):
    m = Image.new('L', size, 0); ImageDraw.Draw(m).polygon(pts, fill=255); return np.asarray(m) > 127
def remove(rgba, pts):
    m = Image.new('L', rgba.size, 255); ImageDraw.Draw(m).polygon(pts, fill=0); m = m.filter(ImageFilter.GaussianBlur(1.2))
    o = rgba.copy(); o.putalpha(ImageChops.multiply(rgba.split()[3], m)); return o
def sleeve_fill(base, F, dirs, A, P=110, shade=.4, reach=260, over=0, cover=False):
    """Paint polygon F under `base` with sleeve cloth copied from the arm (mask A): each pixel takes the arm's colour a whole
    number of periods P back along the fold direction (two copies half a period apart, cross-faded so no seams show), darkened
    with distance from the arm. dirs: fold directions to try in order (later ones for pixels the first never reaches)."""
    a = np.asarray(base).astype(np.float32); H, W = a.shape[:2]
    arm = (a[..., 3] > 200) & poly_mask((W, H), A); r, gg, bb = a[..., 0], a[..., 1], a[..., 2]; lum0 = a[..., :3].mean(2)
    skin = (r > gg + 22) & (r > bb + 40); backdrop = (np.abs(r - gg) < 7) & (np.abs(gg - bb) < 7) & (lum0 > 55); bluish = bb > r + 4
    cloth = ~skin & ~backdrop & ~bluish
    fm = poly_mask((W, H), F)
    if cover: arm = arm & ~fm   # cover mode: whatever is inside F (pouches, straps) is replaced, so sample cloth only from outside it
    inner = binary_erosion(arm, iterations=16) & cloth
    ys, xs = np.nonzero(fm & ~inner); tex = np.zeros((len(xs), 3), np.float32); dist = np.zeros(len(xs), np.float32); todo = np.ones(len(xs), bool)
    for n in dirs:
        n = np.array(n, np.float32); n /= np.linalg.norm(n); t = np.full(len(xs), -1.0, np.float32)
        for s in range(0, 900, 2):
            px = np.round(xs - n[0] * s).astype(int); py = np.round(ys - n[1] * s).astype(int)
            ok = (px >= 0) & (px < W) & (py >= 0) & (py < H); hit = np.zeros(len(xs), bool); hit[ok] = arm[py[ok], px[ok]]
            t[hit & (t < 0)] = s
            if (t[todo] >= 0).all(): break
        got = todo & (t >= 0)  # (pixels whose copies all miss the cloth are dropped below)
        def samp(off):
            d0 = (np.floor((t + off) / P) + 1) * P + 16 - off; col = np.zeros((len(xs), 3), np.float32); ok = np.zeros(len(xs), bool)
            for k in range(6):   # a copy that lands on a seam, buckle or gap in the cloth steps one more period back
                d = d0 + k * P; sx = np.clip(np.round(xs - n[0] * d), 0, W - 1).astype(int); sy = np.clip(np.round(ys - n[1] * d), 0, H - 1).astype(int)
                hit = inner[sy, sx] & ~ok; col[hit] = a[sy[hit], sx[hit], :3]; ok |= hit
            return col, ok
        c1, k1 = samp(0); c2, k2 = samp(P / 2)
        w = np.abs(((t / P) % 1) - .5) * 2; w = np.where(k1 & ~k2, 0, np.where(k2 & ~k1, 1, w))
        got &= k1 | k2; tex[got] = (c1 * (1 - w[:, None]) + c2 * w[:, None])[got]; dist[got] = t[got]; todo &= ~got
    keep = ~todo; ys, xs, tex, dist = ys[keep], xs[keep], tex[keep], dist[keep]
    u = np.zeros_like(a); u[ys, xs, :3] = tex * (1 - shade * np.minimum(dist / reach, 1))[:, None]; u[ys, xs, 3] = 255
    # the arm's own dark outline inside F would show as stitching across the new cloth: let the cloth cover it
    lum = a[..., :3].mean(2); grey = (a[..., :3].max(2) - a[..., :3].min(2)) < 14
    hide = fm & ((lum < 45) | (a[..., 3] < 250) | grey | (a[..., 2] > a[..., 0] + 4)) & (u[..., 3] > 0)
    b2 = a.copy(); b2[hide, 3] = 0
    # a dark pixel-art outline where the new cloth meets empty space
    al = (u[..., 3] > 0) | (b2[..., 3] > 128)
    edge = (u[..., 3] > 0) & ~(np.roll(al, 1, 0) & np.roll(al, -1, 0) & np.roll(al, 1, 1) & np.roll(al, -1, 1)); edge[-1, :] = False
    ring = edge | (np.roll(edge, 1, 0) & (u[..., 3] > 0)) | (np.roll(edge, 1, 1) & (u[..., 3] > 0))
    u[ring, :3] = u[ring, :3] * .3 + np.array([22, 17, 11]) * .7
    out = Image.fromarray(u.astype(np.uint8)); out.alpha_composite(Image.fromarray(b2.astype(np.uint8)))
    if over:   # the new cloth also goes over the arm inside F, blended in over `over` px so no edge shows
        fo = Image.fromarray((u[..., 3] > 0).astype(np.uint8) * 255).filter(ImageFilter.MinFilter(2 * over + 1)).filter(ImageFilter.GaussianBlur(over / 2))
        top = Image.fromarray(u.astype(np.uint8)); top.putalpha(ImageChops.multiply(top.split()[3], fo)); out.alpha_composite(top)
    return out

def dark_edge(im, ymin=640, xmax=870):
    """a pixel-art outline along the lower edge left by a cut (below ymin, left of xmax)"""
    a = np.asarray(im).copy(); al = a[..., 3] > 128
    e = al & ~(np.roll(al, -1, 0) & np.roll(al, -2, 0) & np.roll(al, -3, 0)); e[-4:, :] = False
    yy, xx = np.nonzero(e); k = (yy > ymin) & (xx < xmax)
    a[yy[k], xx[k], :3] = (a[yy[k], xx[k], :3] * .3 + np.array([20, 16, 10]) * .7).astype(np.uint8)
    return Image.fromarray(a)
