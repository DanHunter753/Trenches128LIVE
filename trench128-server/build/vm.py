# Viewmodel renderer for Trench 128: z-buffered, perspective, flat-shaded triangle meshes -> 360x240 pixel frames.
# Frames share the screen's centre (CX, CY), so the client can stretch one frame over the whole screen height and
# the hip gun, the sights and the crosshair all line up. Rendered at 2x, then reduced to 1x with coverage voting.
import math
import numpy as np
from PIL import Image

W, H = 360, 240
CX, CY = W / 2, H / 2
F = 205.0                      # focal length in output pixels (about 60 degrees vertical field of view)
NEAR = .08
SS = 2                         # supersampling factor
LIGHT = np.array([-.35, .85, -.40]); LIGHT /= np.linalg.norm(LIGHT)

# ---------------------------------------------------------------- palette
WOOD = (126, 60, 34); WOOD_D = (100, 46, 26); STEEL = (72, 80, 92); STEEL_D = (44, 48, 56); STEEL_L = (110, 118, 128)
BRASS = (196, 156, 72); SKIN = (214, 156, 118); SKIN_D = (176, 120, 88); WOOL = (84, 86, 68); WOOL_D = (64, 66, 52)
LENS = (60, 90, 96); RED = (150, 38, 30); BLACK = (24, 24, 26)

def rotm(rx=0, ry=0, rz=0):
    """same convention as g3d.rot: x-rotation, then y, then z (degrees)"""
    a, b, c = map(math.radians, (rx, ry, rz))
    Rx = np.array([[1, 0, 0], [0, math.cos(a), -math.sin(a)], [0, math.sin(a), math.cos(a)]])
    Ry = np.array([[math.cos(b), 0, math.sin(b)], [0, 1, 0], [-math.sin(b), 0, math.cos(b)]])
    Rz = np.array([[math.cos(c), -math.sin(c), 0], [math.sin(c), math.cos(c), 0], [0, 0, 1]])
    return Rz @ Ry @ Rx

class Mesh:
    def __init__(s, tris, cols): s.tris = np.asarray(tris, float).reshape(-1, 3, 3); s.cols = np.asarray(cols, float).reshape(-1, 3)

class MB:
    """mesh builder: accumulate triangles with one colour each"""
    def __init__(s): s.t = []; s.c = []
    def tri(s, a, b, c, col): s.t.append((a, b, c)); s.c.append(col)
    def quad(s, a, b, c, d, col): s.tri(a, b, c, col); s.tri(a, c, d, col)
    def add(s, other):
        m = other.build() if isinstance(other, MB) else other
        s.t += [tuple(map(tuple, t)) for t in m.tris]; s.c += [tuple(c) for c in m.cols]; return s
    def build(s): return Mesh(s.t if s.t else np.zeros((0, 3, 3)), s.c if s.c else np.zeros((0, 3)))
    # ---- primitives
    def lathe(s, p0, axis, prof, n, col, colfn=None, cap0=True, cap1=True, phase=0.0):
        """surface of revolution: prof = [(t, r)] along axis from p0; colfn(seg, i) -> colour"""
        p0 = np.asarray(p0, float); u = np.asarray(axis, float); u = u / np.linalg.norm(u)
        ref = np.array([0, 1, 0]) if abs(u[1]) < .9 else np.array([1, 0, 0])
        e1 = np.cross(u, ref); e1 /= np.linalg.norm(e1); e2 = np.cross(u, e1)
        ang = [2 * math.pi * (i + .5 + phase) / n for i in range(n)]
        rings = [[p0 + u * t + (math.cos(a) * e1 + math.sin(a) * e2) * r for a in ang] for t, r in prof]
        for k in range(len(rings) - 1):
            for i in range(n):
                j = (i + 1) % n; cc = colfn(k, i) if colfn else col
                s.quad(rings[k][i], rings[k][j], rings[k + 1][j], rings[k + 1][i], cc)
        for cap, ring, t in ((cap0, rings[0], prof[0][0]), (cap1, rings[-1], prof[-1][0])):
            if cap and prof[0][1] > 0:
                c0 = p0 + u * t
                for i in range(n): s.tri(c0, ring[i], ring[(i + 1) % n], col)
        return s
    def tube(s, a, b, r0, r1=None, n=8, col=STEEL, **k):
        a = np.asarray(a, float); b = np.asarray(b, float); L = np.linalg.norm(b - a)
        return s.lathe(a, b - a, [(0, r0), (L, r0 if r1 is None else r1)], n, col, **k)
    def ellip(s, c, r, col, nu=8, nv=5, R=None):
        c = np.asarray(c, float); R = np.eye(3) if R is None else R
        def P(i, j):
            th = math.pi * j / nv; ph = 2 * math.pi * i / nu
            v = np.array([math.sin(th) * math.cos(ph) * r[0], math.cos(th) * r[1], math.sin(th) * math.sin(ph) * r[2]])
            return c + R @ v
        for j in range(nv):
            for i in range(nu):
                a, b, cc, d = P(i, j), P(i + 1, j), P(i + 1, j + 1), P(i, j + 1)
                if j == 0: s.tri(a, cc, d, col)
                elif j == nv - 1: s.tri(a, b, cc, col)
                else: s.quad(a, b, cc, d, col)
        return s
    def box(s, c, size, col, R=None, cols=None):
        c = np.asarray(c, float); R = np.eye(3) if R is None else R; w, h, d = [v / 2 for v in size]
        v = [c + R @ np.array(p) for p in [(-w, -h, -d), (w, -h, -d), (w, h, -d), (-w, h, -d), (-w, -h, d), (w, -h, d), (w, h, d), (-w, h, d)]]
        for k, f in enumerate([(0, 1, 2, 3), (5, 4, 7, 6), (4, 0, 3, 7), (1, 5, 6, 2), (3, 2, 6, 7), (4, 5, 1, 0)]):
            s.quad(v[f[0]], v[f[1]], v[f[2]], v[f[3]], cols[k] if cols else col)
        return s
    def extrude(s, prof, x, hw, col, side_col=None, hwfn=None):
        """side profile [(z, y)] (simple polygon) extruded across x = x +- half width; hwfn(z, y) varies the half width"""
        pts = [(float(z), float(y)) for z, y in prof]
        if _area(pts) < 0: pts = pts[::-1]
        hwv = [hwfn(z, y) if hwfn else hw for z, y in pts]
        L = [np.array([x - w, y, z]) for (z, y), w in zip(pts, hwv)]; Rr = [np.array([x + w, y, z]) for (z, y), w in zip(pts, hwv)]
        n = len(pts)
        for i in range(n):
            j = (i + 1) % n; s.quad(L[i], L[j], Rr[j], Rr[i], side_col or col)
        for a, b, c in _earclip(pts):
            s.tri(L[a], L[b], L[c], col); s.tri(Rr[a], Rr[c], Rr[b], col)
        return s

def _area(p): return sum(p[i][0] * p[(i + 1) % len(p)][1] - p[(i + 1) % len(p)][0] * p[i][1] for i in range(len(p))) / 2
def _earclip(p):
    idx = list(range(len(p))); out = []
    def inside(a, b, c, q):
        def sgn(p1, p2, p3): return (p1[0] - p3[0]) * (p2[1] - p3[1]) - (p2[0] - p3[0]) * (p1[1] - p3[1])
        d1, d2, d3 = sgn(q, a, b), sgn(q, b, c), sgn(q, c, a)
        return not ((d1 < 0 or d2 < 0 or d3 < 0) and (d1 > 0 or d2 > 0 or d3 > 0))
    guard = 0
    while len(idx) > 3 and guard < 2000:
        guard += 1
        for k in range(len(idx)):
            i0, i1, i2 = idx[k - 1], idx[k], idx[(k + 1) % len(idx)]
            a, b, c = p[i0], p[i1], p[i2]
            if (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]) <= 0: continue
            if any(inside(a, b, c, p[j]) for j in idx if j not in (i0, i1, i2)): continue
            out.append((i0, i1, i2)); idx.pop(k); break
        else: break
    if len(idx) == 3: out.append(tuple(idx))
    return out

class Part:
    def __init__(s, name, meshes, pivot=(0, 0, 0)):
        s.name = name; s.pivot = np.asarray(pivot, float)
        ms = [m.build() if isinstance(m, MB) else m for m in meshes]
        s.tris = np.concatenate([m.tris for m in ms]) if ms else np.zeros((0, 3, 3))
        s.cols = np.concatenate([m.cols for m in ms]) if ms else np.zeros((0, 3))

def xf(P, t, pivot):
    dx, dy, dz, rx, ry, rz = t
    return (P - pivot) @ rotm(rx, ry, rz).T + pivot + np.array([dx, dy, dz])

def _clip(tri):
    """clip one triangle against z = NEAR; returns 0..2 triangles"""
    inn = [p for p in tri if p[2] >= NEAR]
    if len(inn) == 3: return [tri]
    if not inn: return []
    poly = []
    for i in range(3):
        a, b = tri[i], tri[(i + 1) % 3]
        if a[2] >= NEAR: poly.append(a)
        if (a[2] >= NEAR) != (b[2] >= NEAR):
            t = (NEAR - a[2]) / (b[2] - a[2]); poly.append(a + (b - a) * t)
    return [np.array([poly[0], poly[k], poly[k + 1]]) for k in range(1, len(poly) - 1)]

def shade(col, n):
    it = float(n @ LIGHT)
    k = 1.16 if it > .6 else .96 if it > .2 else .76 if it > -.25 else .6
    return np.clip(np.asarray(col) * k, 0, 255)

def render(parts, pose, root, root_pivot=(0, -.1, .45)):
    """parts: [Part]; pose: {name: T}; root: T applied to everything about root_pivot. Returns RGBA image W x H"""
    rp = np.asarray(root_pivot, float); T3, C3 = [], []
    for pt in parts:
        if not len(pt.tris): continue
        P = xf(pt.tris.reshape(-1, 3), pose.get(pt.name, (0, 0, 0, 0, 0, 0)), pt.pivot)
        P = xf(P, root, rp).reshape(-1, 3, 3)
        if np.max(P[:, :, 1]) < -5: continue                      # parts parked out of view
        T3.append(P); C3.append(pt.cols)
    if not T3: return Image.new('RGBA', (W, H), (0, 0, 0, 0))
    P = np.concatenate(T3); C = np.concatenate(C3)
    Ws, Hs = W * SS, H * SS; fs, cx, cy = F * SS, CX * SS, CY * SS
    zb = np.zeros((Hs, Ws)); img = np.zeros((Hs, Ws, 3)); cov = np.zeros((Hs, Ws), bool)
    for tri, col in zip(P, C):
        n = np.cross(tri[1] - tri[0], tri[2] - tri[0]); ln = np.linalg.norm(n)
        if ln < 1e-12: continue
        n /= ln; cen = tri.mean(0)
        if n @ cen > 0: n = -n                                    # two-sided: light the side we can see
        cs = shade(col, n)
        for t in _clip(tri):
            z = t[:, 2]; sx = cx + fs * t[:, 0] / z; sy = cy - fs * t[:, 1] / z; iz = 1 / z
            x0 = max(int(math.floor(sx.min())), 0); x1 = min(int(math.ceil(sx.max())) + 1, Ws)
            y0 = max(int(math.floor(sy.min())), 0); y1 = min(int(math.ceil(sy.max())) + 1, Hs)
            if x0 >= x1 or y0 >= y1: continue
            den = (sy[1] - sy[2]) * (sx[0] - sx[2]) + (sx[2] - sx[1]) * (sy[0] - sy[2])
            if abs(den) < 1e-9: continue
            X, Y = np.meshgrid(np.arange(x0, x1) + .5, np.arange(y0, y1) + .5)
            w0 = ((sy[1] - sy[2]) * (X - sx[2]) + (sx[2] - sx[1]) * (Y - sy[2])) / den
            w1 = ((sy[2] - sy[0]) * (X - sx[2]) + (sx[0] - sx[2]) * (Y - sy[2])) / den
            w2 = 1 - w0 - w1
            m = (w0 >= -1e-6) & (w1 >= -1e-6) & (w2 >= -1e-6)
            if not m.any(): continue
            d = w0 * iz[0] + w1 * iz[1] + w2 * iz[2]
            zs = zb[y0:y1, x0:x1]; m &= d > zs
            if not m.any(): continue
            zs[m] = d[m]; img[y0:y1, x0:x1][m] = cs; cov[y0:y1, x0:x1][m] = True
    # 2x2 -> 1 pixel: opaque when at least 2 of 4 samples are covered; colour of the nearest covered sample
    c4 = cov.reshape(H, SS, W, SS).sum((1, 3)); z4 = zb.reshape(H, SS, W, SS).transpose(0, 2, 1, 3).reshape(H, W, SS * SS)
    i4 = img.reshape(H, SS, W, SS, 3).transpose(0, 2, 1, 3, 4).reshape(H, W, SS * SS, 3)
    best = z4.argmax(2); out = np.take_along_axis(i4, best[..., None, None], 2)[:, :, 0]
    a = (c4 >= 2).astype(np.uint8) * 255
    return Image.fromarray(np.dstack([out.astype(np.uint8), a]), 'RGBA')

def project(p):
    p = np.asarray(p, float); z = max(NEAR, p[2]); return (CX + F * p[0] / z, CY - F * p[1] / z)
