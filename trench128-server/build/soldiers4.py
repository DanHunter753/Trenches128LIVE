"""v0.29 soldier atlas from the owner's reference art (build/ref/*.jpg, 2x2 sheets on a flat grey background).
Blue team: blue helmet band, collar tabs, chevrons and webbing pack; green team: green band and tabs, buttoned tunic.
Layout kept from v0.22: rows team*7+class, cols pose*4+view (views south, east, north, west; poses idle, strideA, strideB,
aim). Cells are 160x150 (wider than before so an aiming rifle fits). Feet on row 144, helmet top near row 10.
Run: python3 build/soldiers4.py"""
import colorsys, json, os
from collections import deque
from PIL import Image, ImageDraw, ImageFilter
REF = os.path.join(os.path.dirname(__file__), 'ref'); OUT = os.path.join(os.path.dirname(__file__), '..', 'public', 'assets')
FW, FH, FEET, FIG_H = 160, 150, 144, 134
CL = ['rifleman', 'assault', 'gunner', 'medic', 'sapper', 'officer', 'recon']; NC = len(CL)

def load(name): return Image.open(os.path.join(REF, name + '-image.jpg')).convert('RGB')
def quad(im, q):   # q: 0 TL, 1 TR, 2 BL, 3 BR
    w, h = im.size; x, y = (q % 2) * w // 2, (q // 2) * h // 2; return im.crop((x, y, x + w // 2, y + h // 2))

def cutout(im):
    """flood the flat grey background (and the soft floor shadow) in from the border; everything else is the figure"""
    im = im.filter(ImageFilter.MedianFilter(3)); w, h = im.size; px = im.load()
    bg = [sorted(px[x, y][i] for x, y in ((2, 2), (w - 3, 2), (2, h - 3), (w - 3, h - 3)))[1] for i in range(3)]
    def isbg(p):
        d = sum((p[i] - bg[i]) ** 2 for i in range(3)) ** .5; mx, mn = max(p), min(p)
        return d < 30 or (mx - mn < 14 and abs(sum(p) / 3 - sum(bg) / 3) < 26)   # grey, close to the backdrop (shadow included)
    mask = Image.new('L', (w, h), 255); mp = mask.load(); seen = bytearray(w * h); q = deque()
    for x in range(w): q.extend(((x, 0), (x, h - 1)))
    for y in range(h): q.extend(((0, y), (w - 1, y)))
    while q:
        x, y = q.popleft()
        if x < 0 or y < 0 or x >= w or y >= h or seen[y * w + x]: continue
        seen[y * w + x] = 1
        if not isbg(px[x, y]): continue
        mp[x, y] = 0; q.extend(((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)))
    mask = mask.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.MaxFilter(3))   # drop speckles left by the JPEG
    out = im.convert('RGBA'); out.putalpha(mask); return out.crop(mask.getbbox())

def body_height(fig):   # rows that hold the body, ignoring a rifle poking out sideways: helmet top to boot sole
    return fig.size[1]

def to_cell(fig, scale=None, anchor=None):
    """scale the figure so it stands FIG_H tall with its feet on FEET; centre the body (not the rifle) in the cell"""
    k = scale or FIG_H / body_height(fig)
    fw, fh = max(1, round(fig.size[0] * k)), max(1, round(fig.size[1] * k))
    small = fig.resize((fw, fh), Image.LANCZOS)
    a = small.split()[3].point(lambda v: 255 if v > 110 else 0); small.putalpha(a)
    small = small.quantize(48, method=Image.FASTOCTREE).convert('RGBA'); small.putalpha(a)
    # body centre: the column with the most solid pixels in the leg zone (bottom third), so a long rifle doesn't shift him
    ap = a.load(); best, bx = -1, fw // 2
    for x in range(fw):
        n = sum(1 for y in range(fh * 2 // 3, fh) if ap[x, y])
        if n > best: best, bx = n, x
    cx = anchor if anchor is not None else bx
    cell = Image.new('RGBA', (FW, FH), (0, 0, 0, 0)); cell.alpha_composite(small, (FW // 2 - cx, FEET - fh)) if FW // 2 - cx >= 0 and FEET - fh >= 0 else cell.paste(small, (FW // 2 - cx, FEET - fh), small)
    outline(cell); return cell

def outline(cell):   # one dark pixel round the silhouette, like the rest of the game's sprites
    a = cell.split()[3]; grown = a.filter(ImageFilter.MaxFilter(3)); px = cell.load(); g = grown.load(); ap = a.load()
    for y in range(FH):
        for x in range(FW):
            if g[x, y] and not ap[x, y]: px[x, y] = (24, 22, 18, 255)

def blue_to_green(fig):   # the team colour lives in the helmet band, collar tabs and chevrons
    out = fig.copy(); px = out.load(); w, h = out.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if not a: continue
            hh, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
            if .55 < hh < .72 and s > .35 and v > .18:
                r2, g2, b2 = colorsys.hsv_to_rgb(.33, min(1, s * 1.05), v); px[x, y] = (int(r2 * 255), int(g2 * 255), int(b2 * 255), a)
    return out

def mirror(c): return c.transpose(Image.FLIP_LEFT_RIGHT)
def bob(c, dy): o = Image.new('RGBA', c.size, (0, 0, 0, 0)); o.alpha_composite(c, (0, -dy)); return o

def load2(n): return Image.open(os.path.join(os.path.dirname(__file__), 'ref2', n + '.jpg')).convert('RGB')
POSES5 = ['idle', 'strideA', 'strideB', 'aim', 'crouch']
TARGET = {'idle': 1.0, 'strideA': .97, 'strideB': .97, 'aim': .99, 'crouch': .74}   # figure height per pose, as a share of FIG_H
# (view, pose) -> reference picture (ref2 names are blue soldiers; the green team gets them recoloured). None: rifleman fallback.
CLASS_ART = {
 'rifleman': {('south', 'strideA'): 'a38', ('east', 'strideA'): 'a07', ('east', 'strideB'): 'a24', ('north', 'strideA'): 'a06', ('north', 'strideB'): 'a41',
              ('south', 'aim'): 'a14', ('east', 'aim'): 'a29', ('south', 'crouch'): 'a48', ('east', 'crouch'): 'a11'},
 'assault': {('east', 'strideA'): 'a18', ('east', 'aim'): 'a08'},
 'gunner': {('south', 'idle'): 'a17', ('south', 'strideA'): 'a17', ('east', 'idle'): 'a33', ('east', 'strideA'): 'a26', ('south', 'aim'): 'a12', ('east', 'aim'): 'a33', ('east', 'crouch'): 'a27'},
 'medic': {('east', 'strideA'): 'a31'},
 'recon': {('east', 'strideA'): 'a13', ('east', 'aim'): 'a47', ('east', 'crouch'): 'a10', ('south', 'crouch'): 'a46'},
 'officer': {('south', 'strideA'): 'a25', ('south', 'aim'): 'a32', ('east', 'aim'): 'a45', ('east', 'idle'): 'a45', ('south', 'crouch'): 'a19'},
}
_cut = {}
def art(name, team):
    key = (name, team)
    if key not in _cut:
        f = cutout(load2(name)); _cut[key] = blue_to_green(f) if team == 1 else f
    return _cut[key]

def squash(cell, k):   # a crude kneel for the back view (no reference for it): legs shortened
    bb = cell.getbbox(); fig = cell.crop(bb); h = int(fig.size[1] * k); fig = fig.resize((fig.size[0], h), Image.NEAREST)
    out = Image.new('RGBA', cell.size, (0, 0, 0, 0)); out.alpha_composite(fig, (bb[0], FEET - h)); return out

def class_frames(team, base):
    """per class: dict view -> dict pose -> cell; base = the rifleman's frames from frames(team)"""
    out = {}
    for cls in CL:
        m = dict(CLASS_ART['rifleman']); 
        if cls != 'rifleman': m.update(CLASS_ART.get(cls, {}))
        cells = {}
        for v in ('south', 'east', 'north'):
            cells[v] = {}
            for p in POSES5:
                n = m.get((v, p))
                if n: c = to_cell(art(n, team), FIG_H * TARGET[p] / art(n, team).size[1])
                elif p == 'crouch': c = squash(base[v]['idle'], .74) if v == 'north' else None
                else: c = base[v][p] if p in base[v] else None
                cells[v][p] = c
            # strides: B mirrors A front / back (a natural alternate step), side view reuses A one pixel lower if no B art
            if cells[v]['strideB'] is None or (m.get((v, 'strideB')) is None and m.get((v, 'strideA'))):
                a = cells[v]['strideA']; cells[v]['strideB'] = mirror(a) if v in ('south', 'north') else bob(a, -1)
            if cells[v]['crouch'] is None: cells[v]['crouch'] = cells['east']['crouch'] if v == 'south' and 'east' in cells else squash(cells[v]['idle'], .74)
        cells['west'] = {p: mirror(c) for p, c in cells['east'].items()}
        out[cls] = cells
    return out

def frames(team):
    """dict view -> dict pose -> cell, for one team"""
    four = load('f2bd526c') if team == 0 else load('4d945e17')
    aim = load('4bf11b19')
    idle = {'south': cutout(quad(four, 0)), 'north': cutout(quad(four, 1)), 'east': cutout(quad(four, 2))}
    shoot = {'east': cutout(quad(four, 3)), 'south': cutout(quad(aim, 0)), 'north': cutout(quad(aim, 2))}
    if team == 1: shoot['south'] = blue_to_green(shoot['south']); shoot['north'] = blue_to_green(shoot['north'])
    k = FIG_H / idle['south'].size[1]   # one scale for the whole team (taken from the front view), so every view is the same size
    cells = {}
    for v in ('south', 'east', 'north'):
        i = to_cell(idle[v], k * idle['south'].size[1] / idle[v].size[1]); s = to_cell(shoot[v], k * idle['south'].size[1] / shoot[v].size[1])
        cells[v] = {'idle': i, 'strideA': bob(i, 2), 'strideB': bob(mirror(i) if v in ('south', 'north') else i, 1), 'aim': s}
    cells['west'] = {p: mirror(c) for p, c in cells['east'].items()}
    return cells

def mark(cell, cls, view):
    """class markings drawn over the uniform: medic armband cross, recon field glasses, officer collar stars"""
    bb = cell.getbbox();
    if not bb: return
    d = ImageDraw.Draw(cell); cx = (bb[0] + bb[2]) // 2; top = bb[1]; h = bb[3] - bb[1]; cy = top + int(h * .30)
    if cls == 'medic' and view in (0, 2):
        d.rectangle((cx - 7, cy - 7, cx + 7, cy + 7), fill=(240, 240, 235, 255), outline=(41, 36, 24, 255)); d.rectangle((cx - 2, cy - 5, cx + 2, cy + 5), fill=(200, 30, 30, 255)); d.rectangle((cx - 5, cy - 2, cx + 5, cy + 2), fill=(200, 30, 30, 255))
    if cls == 'medic' and view in (1, 3):
        ax = cx + (-10 if view == 1 else 10); d.rectangle((ax - 5, cy - 4, ax + 5, cy + 4), fill=(240, 240, 235, 255), outline=(41, 36, 24, 255)); d.rectangle((ax - 1, cy - 3, ax + 1, cy + 3), fill=(200, 30, 30, 255)); d.rectangle((ax - 3, cy - 1, ax + 3, cy + 1), fill=(200, 30, 30, 255))
    if cls == 'recon' and view == 0:
        for ox in (-5, 3): d.rectangle((cx + ox - 1, cy, cx + ox + 3, cy + 9), fill=(34, 30, 26, 255), outline=(14, 12, 10, 255))
    if cls == 'officer' and view == 0:
        for ox in (-9, 7): d.rectangle((cx + ox, top + int(h * .2), cx + ox + 2, top + int(h * .2) + 2), fill=(230, 196, 90, 255))

DW, DH = 220, 110
def dead_sheet():
    """fallen soldiers (face down, on his back, curled up) from the owner's sheet: 2 rows (team) x 3 cells of DW x DH, lying on row DH-4"""
    src = load('6ac500e6'); figs = [cutout(quad(src, q)) for q in (0, 1, 3)]
    sheet = Image.new('RGBA', (DW * 3, DH * 2), (0, 0, 0, 0))
    for t in (0, 1):
        for i, f in enumerate(figs):
            if t == 1: f = blue_to_green(f)
            k = min((DW - 10) / f.size[0], (DH - 8) / f.size[1]); sm = f.resize((max(1, round(f.size[0] * k)), max(1, round(f.size[1] * k))), Image.LANCZOS)
            a = sm.split()[3].point(lambda v: 255 if v > 110 else 0); sm = sm.quantize(48, method=Image.FASTOCTREE).convert('RGBA'); sm.putalpha(a)
            cell = Image.new('RGBA', (DW, DH), (0, 0, 0, 0)); cell.alpha_composite(sm, ((DW - sm.size[0]) // 2, DH - 4 - sm.size[1]))
            ac = cell.split()[3]; g = ac.filter(ImageFilter.MaxFilter(3)).load(); px = cell.load(); ap = ac.load()
            for y in range(DH):
                for x in range(DW):
                    if g[x, y] and not ap[x, y]: px[x, y] = (24, 22, 18, 255)
            sheet.paste(cell, (i * DW, t * DH))
    sheet.save(os.path.join(OUT, 'soldiers_dead.png')); print('soldiers_dead.png', sheet.size)

if __name__ == '__main__':
    dead_sheet()
    VIEWS = ['south', 'east', 'north', 'west']; POSES = POSES5
    atl = Image.new('RGBA', (FW * 4 * len(POSES), FH * 2 * NC), (0, 0, 0, 0))
    for t in (0, 1):
        base = frames(t); cf = class_frames(t, base)
        for ci, c in enumerate(CL):
            for pi, p in enumerate(POSES):
                for vi, v in enumerate(VIEWS):
                    f = cf[c][v][p].copy(); mark(f, c, vi); atl.paste(f, ((pi * 4 + vi) * FW, (t * NC + ci) * FH))
    atl.save(os.path.join(OUT, 'soldiers.png'))
    json.dump({'fw': FW, 'fh': FH, 'views': 4, 'poses': 4, 'poseNames': POSES, 'classes': CL, 'rows': 'team*%d+class' % NC, 'cols': 'pose*4+view (poses idle, strideA, strideB, aim, crouch)', 'armed': True,
               'source': 'owner-supplied reference art (build/ref), v0.29'}, open(os.path.join(OUT, 'soldiers.json'), 'w'))
    print('soldiers.png', atl.size)
