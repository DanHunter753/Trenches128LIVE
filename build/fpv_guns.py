"""v0.29 first-person rifle and trench gun from the owner's reference art (build/ref/fpv_*.jpg).
Sheet layout (as before): 360x240 frames, 6 columns, 36 slots: 0 idle (hip), 1-4 hip fire, 5-20 reload, 21 aim, 22-25 aim fire,
26 sprint, 27-31 bayonet. Rifle: hip d4deb927, aim 4cd7af12, aim fire strip 480f2700 (4), reload strip e6cff9ba (5).
Trench gun: hip 309195b2, aim f91b8111 (fire / reload made from the rifle's flash and smoke and a dip-and-raise).
Run: python3 build/fpv_guns.py"""
import os, sys
import numpy as np
from PIL import Image, ImageFilter, ImageChops
sys.path.insert(0, os.path.dirname(__file__)); from fpv_reg import register
REF = os.path.join(os.path.dirname(__file__), 'ref'); OUT = os.path.join(os.path.dirname(__file__), '..', 'public', 'assets')
FW, FH, COLS, SLOTS = 360, 240, 6, 36
def img(n): return Image.open(os.path.join(REF, 'fpv_' + n + '.jpg')).convert('RGB')

from scipy import ndimage
def cut(im, tol=30):
    """remove only the grey backdrop that is connected to the picture's border (flood fill), so dark gun metal inside the
    silhouette can never turn see-through; one pixel of edge softening"""
    a = np.asarray(im.convert('RGB')).astype(np.int32); bg = np.median(np.concatenate([a[:4].reshape(-1, 3), a[-4:].reshape(-1, 3), a[:, :4].reshape(-1, 3), a[:, -4:].reshape(-1, 3)]), 0)
    d = np.abs(a - bg).sum(2); sat = a.max(2) - a.min(2)
    bgl = (d < tol) | ((sat < 12) & (np.abs(a.mean(2) - bg.mean()) < 20))
    lab, n = ndimage.label(bgl); edge = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    mask = ~np.isin(lab, list(edge))
    # enclosed backdrop (the gap between arm and rifle, inside a trigger guard): large and the backdrop's exact colour -> clear;
    # small specks of near-grey metal stay solid
    sizes = ndimage.sum(np.ones_like(d), lab, index=np.arange(n + 1)); means = ndimage.mean(d, lab, index=np.arange(n + 1))
    clear = [i for i in range(1, n + 1) if i not in edge and sizes[i] > 900 and means[i] < 12]
    if clear: mask &= ~np.isin(lab, clear)
    mask = ndimage.binary_opening(mask, iterations=1)
    out = im.convert('RGBA'); out.putalpha(Image.fromarray((mask * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(.6))); return out

def alpha_of(im, bg=None, lo=16, hi=40):   # cut the flat grey backdrop away (soft edge over lo..hi of colour distance)
    a = np.asarray(im).astype(np.int32); bg = np.array(bg if bg is not None else a[3, 3]); d = np.abs(a - bg).sum(2)
    al = np.clip((d - lo) * 255 / (hi - lo), 0, 255).astype(np.uint8); out = im.convert('RGBA'); out.putalpha(Image.fromarray(al).filter(ImageFilter.MedianFilter(3))); return out

EXT = 520
def extend_left(rgba, px=EXT):
    """continue whatever touches the picture's left edge (the arm) off to the left along its own slope, so it runs off-screen
    instead of ending in mid-air: the edge column is copied leftwards, shifted by the arm's measured slope, slightly darkened"""
    w, h = rgba.size; a = np.asarray(rgba).copy(); out = np.zeros((h, w + px, 4), np.uint8); out[:, px:] = a
    def span(x):
        ys = np.where(a[:, x, 3] > 128)[0]; return (ys.min(), ys.max()) if len(ys) else None
    s0, s1 = span(2), span(42)
    if not s0: return Image.fromarray(out)
    slope = 0 if not s1 else ((s0[0] - s1[0]) + (s0[1] - s1[1])) / 2 / 40   # rows per column, going left
    col = a[:, 2].astype(np.float32)
    for d in range(1, px + 1):
        sh = int(round(slope * d)); x = px - d
        src = np.zeros_like(col)
        if sh >= 0: src[sh:] = col[:h - sh] if sh < h else 0
        else: src[:h + sh] = col[-sh:]
        k = max(.55, 1 - d / px * .45); m = src[:, 3] > 128
        out[m, x, :3] = (src[m, :3] * k).astype(np.uint8); out[m, x, 3] = 255
    return Image.fromarray(out)

def feather(p, f=14):   # soft left/right/bottom edges so a strip panel blends into the full picture under it
    w, h = p.size; m = np.ones((h, w), np.float32)
    ramp = np.linspace(0, 1, f)
    m[:, :f] *= ramp; m[:, -f:] *= ramp[::-1]; m[-f:, :] *= ramp[::-1, None]
    a = np.asarray(p.split()[3]).astype(np.float32) / 255 * m; out = p.copy(); out.putalpha(Image.fromarray((a * 255).astype(np.uint8))); return out

def top_y(rgba, x0, x1):   # first row with solid pixels between columns x0..x1 (the sight tip)
    a = np.asarray(rgba.split()[3])[:, x0:x1]; ys = np.where(a.max(1) > 128)[0]; return int(ys[0]) if len(ys) else 0

class View:
    """maps a 1024-wide reference picture into a 360x240 frame: scale k, offset (ox, oy)"""
    def __init__(self, k, ox, oy): self.k, self.ox, self.oy = k, ox, oy
    def frame(self, layers, dx=0, dy=0, rot=0, zoom=1, pivot=None):
        big = Image.new('RGBA', (int(FW / self.k), int(FH / self.k)), (0, 0, 0, 0)); bx, by = -self.ox / self.k, -self.oy / self.k
        for L, (x, y) in layers: big.alpha_composite(L, (int(x - bx), int(y - by))) if x - bx >= 0 and y - by >= 0 else big.paste(L, (int(x - bx), int(y - by)), L)
        if rot or zoom != 1:
            px, py = pivot if pivot else (big.size[0] * .75, big.size[1])
            big = big.rotate(rot, resample=Image.BICUBIC, center=(px, py)) if rot else big
            if zoom != 1:
                z = big.resize((int(big.size[0] * zoom), int(big.size[1] * zoom)), Image.LANCZOS); c = Image.new('RGBA', big.size, (0, 0, 0, 0))
                c.alpha_composite(z, (int(px - px * zoom), int(py - py * zoom))) if px - px * zoom >= 0 else c.paste(z, (int(px - px * zoom), int(py - py * zoom)), z); big = c
        f = big.resize((FW, FH), Image.LANCZOS); a = f.split()[3].point(lambda v: 255 if v > 110 else 0)
        q = f.copy(); q.putalpha(a)   # full colour (no palette: it speckled the sleeves)
        if dx or dy: s = Image.new('RGBA', (FW, FH), (0, 0, 0, 0)); s.alpha_composite(q, (max(0, dx), max(0, dy))) if dx >= 0 and dy >= 0 else s.paste(q, (dx, dy), q); q = s
        return q

# the player's own chest / webbing / pouches at the bottom of some pictures: first person never looks down at the body.
# R: the chest cut away. fills: (F polygon, fold directions, arm-sample polygon, options) where the arm is continued in
# sleeve cloth so no hole is left (see fpv_fill.py)
BODY = {
 'd4deb927': dict(   # v0.30.1: pouches covered with sleeve, then one straight cut under the forearm (open space between the arms, as on the shotgun)
   pre=[([(100,1024),(140,935),(215,850),(330,810),(440,755),(530,700),(560,700),(560,760),(240,1024)],
         [(.47,.88),(.8,.6),(1,.1)], [(0,560),(560,560),(560,1024),(0,1024)], dict(P=110, shade=.1, reach=300, over=10, cover=True))],
   R=[(545,690),(605,790),(650,830),(700,845),(760,862),(800,900),(830,960),(855,1024),(205,1024)], fills=[], edge=True),
 '309195b2': dict(R=[(160,1024),(180,935),(420,915),(640,925),(705,945),(750,972),(775,1010),(780,1024)],
   fills=[([(60,1024),(90,930),(170,880),(300,860),(375,850),(352,950),(330,1024)], [(-.4,.92),(0,1)], [(0,720),(420,720),(420,1024),(0,1024)],
           dict(P=100, shade=.15, reach=200, over=10))]),
 'a02': dict(R=[(140,1024),(155,935),(260,922),(420,915),(690,925),(790,945),(835,1024)],
   fills=[([(100,1024),(120,930),(200,890),(262,850),(262,940),(250,1024)], [(-.45,.9),(0,1)], [(0,800),(275,800),(275,925),(0,925)],
           dict(P=90, shade=.15, reach=200, over=8))]),
 'a20': dict(R=[(195,1024),(220,880),(290,762),(360,736),(520,726),(760,775),(795,860),(812,1024)], fills=[])}
def body_off(name, rgba):
    if name not in BODY: return rgba
    import fpv_fill as ff
    b = rgba
    for F, dirs, A, kw in BODY[name].get('pre', []): b = ff.sleeve_fill(b, F, dirs, A, **kw)
    b = ff.remove(b, BODY[name]['R'])
    for F, dirs, A, kw in BODY[name]['fills']: b = ff.sleeve_fill(b, F, dirs, A, **kw)
    return ff.dark_edge(b) if BODY[name].get('edge') else b

HIP_H, AIM_K, ITEM_H = 86, .19, 80   # v0.29 sizes: hip content height (frame rows), aiming scale, item content height
def hip_view(rgba, h=HIP_H, xr=None):
    """fit a hip picture by its content: h rows tall, standing on the bottom edge, against the right edge if the art reaches it"""
    bb = rgba.getbbox(); k = h / (bb[3] - bb[1]); right = FW if bb[2] >= rgba.size[0] - 3 else (xr or FW - 8)
    return View(k, right - bb[2] * k, FH - bb[3] * k)

def flash_and_smoke():
    """the muzzle flash (panel 2) and the smoke (panel 3) from the rifle's fire strip, as cut-out sprites"""
    st = img('480f2700'); f = alpha_of(st.crop((380, 110, 580, 290)), lo=30, hi=80); s = alpha_of(st.crop((690, 20, 900, 270)), lo=14, hi=40)
    # keep only the bright, warm flash / the pale smoke (not the rifle under them)
    fa = np.asarray(f).astype(np.int32); keep = (fa[..., 0] > 150) & (fa[..., 0] > fa[..., 2] + 30); fa[..., 3] = np.where(keep, fa[..., 3], 0)
    sa = np.asarray(s).astype(np.int32); lum = sa[..., :3].mean(2); sa[..., 3] = np.where((lum > 110) & (np.abs(sa[..., 0] - sa[..., 2]) < 25), np.minimum(sa[..., 3], 200), 0)
    return Image.fromarray(fa.astype(np.uint8)).crop(Image.fromarray(fa.astype(np.uint8)).getbbox()), Image.fromarray(sa.astype(np.uint8)).crop(Image.fromarray(sa.astype(np.uint8)).getbbox())

def build(kind, out=None, m=1.0):
    hip_n = 'd4deb927' if kind == 'bolt' else '309195b2'; aim_src = img('4cd7af12') if kind == 'bolt' else img('f91b8111'); hip_src = img(hip_n)
    hip, aim = body_off(hip_n, cut(hip_src)), cut(aim_src)
    # aim view: the whole width, the sight tip on row 121 (just under the centre dot)
    tip = top_y(aim, 492, 532); k = AIM_K * m; AIM = View(k, FW / 2 - 512 * k, 121 - tip * k)
    HIP = hip_view(hip, HIP_H * m); muz = (470, 350) if kind == 'bolt' else (190, 300)
    flash, smoke = flash_and_smoke(); frames = [None] * SLOTS
    base_hip = [(extend_left(hip), (-EXT, 0))]; base_aim = [(aim, (0, 0))]
    frames[0] = HIP.frame(base_hip)
    fl = flash.resize((int(flash.size[0] * 1.1), int(flash.size[1] * 1.1)))
    fpos = (muz[0] - fl.size[0] // 2, muz[1] - fl.size[1] // 2)
    kick = [(6, -10, 2.5), (9, -7, 2), (5, -3, 1), (2, -1, .4)]
    for i, (dx, dy, r) in enumerate(kick): frames[1 + i] = HIP.frame(base_hip + ([(fl, fpos)] if i < 2 else []), dx=dx, dy=dy, rot=-r)
    frames[21] = AIM.frame(base_aim)
    atip = (512, tip)
    if kind == 'bolt':
        st = img('480f2700'); boxes = [(7, 30, 321, 636), (330, 30, 633, 636), (641, 30, 950, 636), (959, 30, 1274, 636)]
        reg = register(aim_src, st.crop((7, 240, 321, 636)))   # the idle panel fixes scale and offset for the whole strip
        s, ox, oy = reg[1], reg[2], reg[3] - 210 * reg[1]
        pan = [feather(cut(st.crop(b))).resize((int((b[2] - b[0]) * s), int((b[3] - b[1]) * s)), Image.LANCZOS) for b in boxes]
        dxs = [boxes[i][0] - boxes[0][0] for i in range(4)]
        def fire_layer(i): return base_aim + [(pan[i], (int(ox + 0 * dxs[i]), int(oy)))]
        frames[22], frames[23], frames[24], frames[25] = AIM.frame(fire_layer(1)), AIM.frame(fire_layer(2)), AIM.frame(fire_layer(2), dy=-1), AIM.frame(fire_layer(3))
        rl = img('e6cff9ba'); rb = [(0, 206, 255, 535), (260, 206, 510, 535), (515, 206, 766, 535), (770, 206, 1021, 535), (1026, 206, 1280, 535)]
        r0 = register(aim_src, rl.crop(rb[0])); rs, rx, ry = r0[1], r0[2], r0[3]
        rp = [feather(cut(rl.crop(b))).resize((int((b[2] - b[0]) * rs), int((b[3] - b[1]) * rs)), Image.LANCZOS) for b in rb]
        seq = [0, 0, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 4, 4, 0, 0]   # raise, open bolt, clip in, strip / case out, close, lower
        for i, p in enumerate(seq): frames[5 + i] = AIM.frame(base_aim + [(rp[p], (rx, ry))], dy=[6, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3, 6][i])
    else:
        sm = smoke.resize((int(smoke.size[0] * .9), int(smoke.size[1] * .9)))
        frames[22] = AIM.frame(base_aim + [(fl, (atip[0] - fl.size[0] // 2, atip[1] - fl.size[1] // 2 - 10))], dy=-12)
        frames[23] = AIM.frame(base_aim + [(sm, (atip[0] - sm.size[0] // 2, atip[1] - sm.size[1] + 20))], dy=-7)
        frames[24] = AIM.frame(base_aim + [(sm, (atip[0] - sm.size[0] // 2, atip[1] - sm.size[1] - 10))], dy=-3)
        frames[25] = AIM.frame(base_aim, dy=-1)
        dip = [(4, 8, -6), (8, 18, -12), (12, 30, -18), (14, 38, -22)] + [(14, 38 + (3 if i % 2 else 0), -22) for i in range(8)] + [(12, 30, -18), (8, 18, -12), (4, 8, -6), (1, 2, -2)]
        for i, (dx, dy, r) in enumerate(dip): frames[5 + i] = HIP.frame(base_hip, dx=dx, dy=dy, rot=r)
    frames[26] = HIP.frame(base_hip, dx=26, dy=34, rot=-24)
    for i, (z, dy) in enumerate([(1.06, -4), (1.2, -12), (1.32, -18), (1.18, -10), (1.05, -3)]): frames[27 + i] = HIP.frame(base_hip, dy=dy, zoom=z, pivot=(muz[0], muz[1]))
    sheet = Image.new('RGBA', (FW * COLS, FH * (SLOTS // COLS)), (0, 0, 0, 0))
    for i, f in enumerate(frames):
        if f is None: f = frames[0]
        sheet.paste(f, ((i % COLS) * FW, (i // COLS) * FH))
    sheet.save(os.path.join(OUT, 'gun_' + (out or kind) + '.png')); print('gun_' + (out or kind) + '.png', sheet.size)

def img2(n): return Image.open(os.path.join(os.path.dirname(__file__), 'ref2', n + '.jpg')).convert('RGB')
def build_simple(kind, hip_n, fire_n, aim_n, m=1.0, muz=None, am=None):
    """Lewis gun / scoped rifle: hip picture, a matching fire picture (same framing), an aiming picture (or None: hip raised)"""
    hip0 = cut(img2(hip_n)); HIP = hip_view(hip0, HIP_H * m); hip = extend_left(hip0)
    if fire_n: fire = extend_left(cut(img2(fire_n)))
    else:   # no firing picture: the hip picture with the rifle's muzzle flash at the muzzle
        fl0, _ = flash_and_smoke(); fl0 = fl0.resize((int(fl0.size[0] * .8), int(fl0.size[1] * .8))); fire = hip.copy(); fire.alpha_composite(fl0, (EXT + muz[0] - fl0.size[0] // 2, muz[1] - fl0.size[1] // 2))
    frames = [None] * SLOTS; frames[0] = HIP.frame([(hip, (-EXT, 0))])
    frames[1] = HIP.frame([(fire, (-EXT, 0))], dx=5, dy=-8, rot=-2); frames[2] = HIP.frame([(fire, (-EXT, 0))], dx=7, dy=-5, rot=-1.5)
    frames[3] = HIP.frame([(hip, (-EXT, 0))], dx=4, dy=-3, rot=-.8); frames[4] = HIP.frame([(hip, (-EXT, 0))], dx=1, dy=-1)
    if aim_n:
        aim = cut(img2(aim_n)); tip = top_y(aim, 492, 532); ka = AIM_K * (am if am is not None else m); AIM = View(ka, FW / 2 - 512 * ka, 121 - tip * ka)
        flash, smoke = flash_and_smoke(); fl = flash.resize((int(flash.size[0] * .9), int(flash.size[1] * .9)))
        frames[21] = AIM.frame([(aim, (0, 0))])
        frames[22] = AIM.frame([(aim, (0, 0)), (fl, (512 - fl.size[0] // 2, tip - fl.size[1] // 2 - 6))], dy=-6)
        frames[23] = AIM.frame([(aim, (0, 0)), (fl, (512 - fl.size[0] // 2, tip - fl.size[1] // 2 - 6))], dy=-4)
        frames[24] = AIM.frame([(aim, (0, 0))], dy=-2); frames[25] = AIM.frame([(aim, (0, 0))], dy=-1)
    else:
        for i, d in enumerate([-40, -43, -41, -40, -40]): frames[21 + i] = HIP.frame([(hip if i != 1 else fire, (-EXT, 0))], dx=-60, dy=d)
    dip = [(4, 8, -6), (8, 18, -12), (12, 30, -18), (14, 38, -22)] + [(14, 38 + (3 if i % 2 else 0), -22) for i in range(8)] + [(12, 30, -18), (8, 18, -12), (4, 8, -6), (1, 2, -2)]
    for i, (dx, dy, r) in enumerate(dip): frames[5 + i] = HIP.frame([(hip, (-EXT, 0))], dx=dx, dy=dy, rot=r)
    frames[26] = HIP.frame([(hip, (-EXT, 0))], dx=26, dy=34, rot=-24)
    for i, (z, dy) in enumerate([(1.04, -3), (1.12, -8), (1.18, -12), (1.1, -7), (1.03, -2)]): frames[27 + i] = HIP.frame([(hip, (-EXT, 0))], dy=dy, zoom=z, pivot=(300, 300))
    sheet = Image.new('RGBA', (FW * COLS, FH * (SLOTS // COLS)), (0, 0, 0, 0))
    for i, f in enumerate(frames): sheet.paste(f if f is not None else frames[0], ((i % COLS) * FW, (i // COLS) * FH))
    sheet.save(os.path.join(OUT, 'gun_' + kind + '.png')); print('gun_' + kind + '.png', sheet.size)

def build_items():
    """hands-and-item frames (owner's art): 0 bandage pouch, 1 field kit, 2 bandaging the wrist, 3 bandaged, 4-5 syringe,
    6 grenade in hand, 7 hand after the throw. Same 360x240 frame as the guns, 4 columns."""
    names = ['a00', 'a02', 'a20', 'a44', 'a04', 'a04', 'a05', 'a03']
    sheet = Image.new('RGBA', (FW * 4, FH * 2), (0, 0, 0, 0))
    for i, n in enumerate(names):
        im = body_off(n, cut(img2(n))); bb = im.getbbox(); kk = ITEM_H / (bb[3] - bb[1]); V = View(kk, FW * .56 - (bb[0] + bb[2]) / 2 * kk, FH - bb[3] * kk); L = extend_left(im); R = extend_left(L.transpose(Image.FLIP_LEFT_RIGHT)).transpose(Image.FLIP_LEFT_RIGHT)
        f = V.frame([(R, (-EXT, 0))], dy=6 if i == 5 else 0); sheet.paste(f, ((i % 4) * FW, (i // 4) * FH))
    sheet.save(os.path.join(OUT, 'fpv_items.png')); print('fpv_items.png', sheet.size)

if __name__ == '__main__':
    build_items()
    for k in ('bolt', 'shotgun'): build(k)
    build_simple('lmg', 'a01', 'a09', 'a43')
    build_simple('mark', 'a16', 'a23', None)
    # weapons without their own art, made from the closest one we have (sizes tell them apart)
    build('bolt', 'carbine', .9)            # carbine: a shorter rifle
    build('bolt', 'atr', 1.18)              # anti-tank rifle: a big, long rifle
    build_simple('smg', 'smg_hip', None, 'smg_ads', 1.3, muz=(345, 290), am=.9)   # SMG: the owner's MP18 (hip and aiming)
    build_simple('hmg', 'a01', 'a09', 'a43', 1.12)  # heavy MG: a bigger Lewis
