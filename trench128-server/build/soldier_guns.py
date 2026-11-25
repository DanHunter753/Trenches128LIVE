# Weapon overlays for the third-person soldier sprites: each gun rendered from its first-person model, laid out to meet
# the hands in soldiers3.py for every view (south/east/north/west) and state (hold/aim), then crunched like the bodies.
# Atlas: rows = weapon (bolt, carbine, shotgun, smg, lmg, mark, then the v0.26 elite flame, atr, hmg), cols = state*4 + view; frames 96x150 aligned with soldiers.png.
import sys, os, math, json
import numpy as np
from PIL import Image, ImageDraw
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import vm, vmguns as V
from soldiers3 import HANDS, CV, CROP, FW, FH, VIEWS

WEAPONS = ['bolt', 'carbine', 'shotgun', 'smg', 'lmg', 'mark', 'flame', 'atr', 'hmg']
GRIP = {'bolt': .46, 'carbine': .46, 'mark': .46, 'shotgun': .52, 'smg': .52, 'lmg': .6, 'flame': .55, 'atr': .53, 'hmg': .5}
PXM = 150            # canvas px per model unit (a model unit is ~0.5 m; the figure is ~500 px tall)

def view_render(name, ry, rx=0):
    """render the gun alone; returns image + function mapping a model point to image coords"""
    parts, G = V.GUNS[name]['m']()
    keep = [p for p in parts if p.name not in ('hl', 'hr', 'clip', 'shell', 'nmag', 'npan')]
    old = (vm.W, vm.H, vm.CX, vm.CY, vm.F)
    vm.W, vm.H = 900, 500; vm.CX, vm.CY = 450, 250; vm.F = 6000.0      # long lens: nearly orthographic
    root = V.T(-V.X, 0, 20.0 - .8, rx, ry, 0); piv = np.array((V.X, 0, .8))
    img = vm.render(keep, {}, root, piv)
    W_, CX_, CY_, F_ = vm.W, vm.CX, vm.CY, vm.F
    def at(p):
        q = vm.xf(np.asarray(p, float)[None], root, piv)[0]; z = max(vm.NEAR, q[2]); return (CX_ + F_ * q[0] / z, CY_ - F_ * q[1] / z)
    vm.W, vm.H, vm.CX, vm.CY, vm.F = old
    return img, at, G

def scaled(img, at, s):
    im = img.resize((max(1, int(img.width * s)), max(1, int(img.height * s))), Image.LANCZOS)
    return im, (lambda p: tuple(v * s for v in at(p)))

def place(canvas, im, anchor_img, anchor_canvas, angle=0):
    """rotate im about anchor_img by angle (degrees, CCW) and paste so the anchor lands on anchor_canvas"""
    ax, ay = anchor_img; big = Image.new('RGBA', (im.width * 3, im.height * 3), (0, 0, 0, 0))
    big.paste(im, (im.width, im.height)); cx, cy = ax + im.width, ay + im.height
    rot = big.rotate(angle, resample=Image.BICUBIC, center=(cx, cy))
    canvas.alpha_composite(rot, (int(anchor_canvas[0] - cx), int(anchor_canvas[1] - cy)))

def overlay(name):
    side, at_s, G = view_render(name, 90)            # muzzle to the right
    front, at_f, _ = view_render(name, 160, -14)      # muzzle toward the viewer, seen slightly from above
    back, at_b, _ = view_render(name, 0, 8)          # butt toward the viewer
    k = PXM / 6000.0 * 20.0                          # image px per model unit at the render distance -> canvas px
    s = PXM / (6000.0 / 20.0)
    side, at_s = scaled(side, at_s, s); front, at_f = scaled(front, at_f, s * 1.5); back, at_b = scaled(back, at_b, s * .9)
    grip = (V.X, -.08, GRIP[name]); tip = G['tip']
    out = {}
    for st in ('hold', 'aim'):
        for view in ('south', 'east', 'north'):
            c = Image.new('RGBA', CV, (0, 0, 0, 0)); h1, h2 = HANDS[(view, st)]
            if view == 'east':
                place(c, side, at_s(grip), h1, 12 if st == 'hold' else 0)
            elif view == 'south':
                if st == 'hold': place(c, side, at_s(grip), h1, 38)
                else: place(c, front, at_f(tip), (h1[0] + 30, h1[1] + 8))
            else:
                if st == 'hold': place(c, side.transpose(Image.FLIP_LEFT_RIGHT), (side.width - at_s(grip)[0], at_s(grip)[1]), h1, -38)
                else: place(c, back, at_b(grip), (h1[0] - 10, h1[1] - 6))
            out[(st, view)] = c
    return out

OW = 160   # overlay frames are wider than the body frames (same scale, same centre) so long barrels are never clipped
def to_frame(c):
    sc = FW / (CROP[2] - CROP[0]); pad = (OW - FW) / 2 / sc
    big = Image.new('RGBA', (CV[0] + 2 * int(pad) + 2, CV[1]), (0, 0, 0, 0)); big.alpha_composite(c, (int(pad), 0))
    s = big.crop((CROP[0], CROP[1], CROP[2] + 2 * int(pad), CROP[3])); s = s.resize((OW, round(s.height * sc)), Image.LANCZOS)
    o = Image.new('RGBA', (OW, FH), (0, 0, 0, 0)); o.alpha_composite(s.crop((0, 0, OW, min(FH, s.height))), (0, max(0, FH - s.height))); return o

if __name__ == '__main__':
    import soldiers3 as S3
    atl = Image.new('RGBA', (OW * 8, FH * len(WEAPONS)), (0, 0, 0, 0)); frs = []; keys = []
    for wi, w in enumerate(WEAPONS):
        ov = overlay(w)
        for si, st in enumerate(('hold', 'aim')):
            fr = {v: to_frame(ov[(st, v)]) for v in ('south', 'east', 'north')}; fr['west'] = fr['east'].transpose(Image.FLIP_LEFT_RIGHT)
            for vi, v in enumerate(VIEWS): frs.append(fr[v]); keys.append(((si * 4 + vi) * OW, wi * FH))
    S3.FW = OW
    for pos, f in zip(keys, S3.crunch(frs, 40)): atl.paste(f, pos)
    S3.FW = FW
    OUT = '/home/claude/mp/public/assets'
    atl.save(f'{OUT}/soldier_guns.png'); json.dump({'fw': OW, 'bodyw': FW, 'fh': FH, 'weapons': WEAPONS, 'cols': 'state*4+view', 'states': ['hold', 'aim']}, open(f'{OUT}/soldier_guns.json', 'w'))
    sol = Image.open(f'{OUT}/soldiers.png'); prev = Image.new('RGBA', (FW * 16, FH * 2), (120, 110, 90, 255))
    for r, (row, w) in enumerate(((0, 0), (8, 4))):
        for pi in range(4):
            for vi in range(4):
                x = (pi * 4 + vi) * FW; prev.alpha_composite(sol.crop((x, row * FH, x + FW, row * FH + FH)), (x, r * FH))
                st = 1 if pi == 3 else 0; gx = (st * 4 + vi) * OW + (OW - FW) // 2; g = atl.crop((gx, w * FH, gx + FW, w * FH + FH))
                if vi == 2: under = prev.crop((x, r * FH, x + FW, r * FH + FH)); tmp = Image.new('RGBA', (FW, FH), (120, 110, 90, 255)); tmp.alpha_composite(g); tmp.alpha_composite(sol.crop((x, row * FH, x + FW, row * FH + FH))); prev.paste(tmp, (x, r * FH))
                else: prev.alpha_composite(g, (x, r * FH))
    prev.resize((prev.width * 2, prev.height * 2), Image.NEAREST).save('/tmp/prev/armed.png'); print('ok')
