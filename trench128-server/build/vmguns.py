# First-person guns for Trench 128, built as triangle meshes and rendered by vm.py.
# Bolt rifle, carbine and marksman rifle use the LP Weapons Pack rifle mesh; the SMG (MP18-style), trench shotgun
# (Winchester 1897-style) and LMG (Lewis-style) are modelled here. Hands are mitts with fingers, thumb and a wool sleeve.
# Frame layout per gun (32): idle 0, fire 1-4, reload 5-20, ADS idle 21, ADS fire 22-25, sprint 26, melee 27-31
# (bayonet thrust for the rifles and the trench gun, a butt/gun-bash for the others).
import math, os, sys
import numpy as np
from PIL import Image, ImageDraw
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import vm
from vm import MB, Part, rotm, WOOD, WOOD_D, STEEL, STEEL_D, STEEL_L, BRASS, SKIN, SKIN_D, WOOL, WOOL_D, LENS, RED, BLACK

X = .1
def T(dx=0, dy=0, dz=0, rx=0, ry=0, rz=0): return (dx, dy, dz, rx, ry, rz)
def lerp(a, b, t): return tuple(x + (y - x) * t for x, y in zip(a, b))
def ease(t): return t * t * (3 - 2 * t)
def interp(keys, t):
    names = set(); [names.update(p) for _, p in keys]; out = {}
    for n in names:
        ks = [(tt, p.get(n, T())) for tt, p in keys]
        if t <= ks[0][0]: out[n] = ks[0][1]; continue
        if t >= ks[-1][0]: out[n] = ks[-1][1]; continue
        for (t0, a), (t1, b) in zip(ks, ks[1:]):
            if t0 <= t <= t1: out[n] = lerp(a, b, ease((t - t0) / (t1 - t0) if t1 > t0 else 1)); break
    return out
def comb(a, b): return tuple(x + y for x, y in zip(a, b))
HIDE = T(0, -9, 0)

# ---------------------------------------------------------------- hands
def _dirR(d):
    """rotation taking +z to direction d (for finger/sleeve orientation)"""
    d = np.asarray(d, float); d /= np.linalg.norm(d); z = np.array([0, 0, 1.])
    v = np.cross(z, d); s = np.linalg.norm(v); c = z @ d
    if s < 1e-9: return np.eye(3) if c > 0 else np.diag([1, -1, -1])
    K = np.array([[0, -v[2], v[1]], [v[2], 0, -v[0]], [-v[1], v[0], 0]])
    return np.eye(3) + K + K @ K * ((1 - c) / s ** 2)

def hand(name, grip, gw, kind, arm):
    """grip: centre of the part being held; gw: its half width; kind 'fore' (supporting hand under a forend) or 'wrist'
    (firing hand round the stock wrist); arm: direction from the wrist back toward the shoulder"""
    g = np.asarray(grip, float); m = MB()
    if kind == 'fore':
        palm = g + np.array([0, -gw * .95 - .025, 0])
        m.ellip(palm, (.05, .026, .068), SKIN)                                   # palm cupped under the forend
        for k in range(4):                                                       # fingers curl up the left side
            z = g[2] + .05 - k * .033
            m.ellip((g[0] - gw - .012, g[1] - gw * .25, z), (.014, .032, .015), SKIN if k % 2 else SKIN_D)
        m.ellip((g[0] + gw + .006, g[1] - gw * .45, g[2] - .015), (.013, .02, .04), SKIN, R=rotm(-25, 0, 0))   # thumb on the right
        wrist = palm + np.array([-.012, -.03, -.06])
    else:
        palm = g + np.array([gw + .012, -.01, 0])
        m.ellip(palm, (.03, .055, .062), SKIN_D)                                 # palm against the right side
        for k in range(4):                                                       # fingers wrap round the near (left) side
            m.ellip((g[0] - gw - .011, g[1] - .025, g[2] + .045 - k * .03), (.014, .036, .014), SKIN if k % 2 == 0 else SKIN_D)
        m.ellip((g[0], g[1] - gw - .02, g[2]), (gw + .02, .02, .06), SKIN)       # wrapped under the wrist
        m.ellip((g[0] - gw * .3, g[1] + gw + .008, g[2] + .03), (.04, .014, .016), SKIN, R=rotm(0, 25, 0))   # thumb over the top
        wrist = palm + np.array([.02, -.045, -.055])
    a = np.asarray(arm, float); a /= np.linalg.norm(a)
    m.tube(wrist + a * -.01, wrist + a * .055, .034, .04, 8, SKIN_D)              # wrist
    m.lathe(wrist + a * .05, a, [(0, .05), (.05, .052), (.056, .058), (.75, .086)], 9, WOOL,
            colfn=lambda k, i: WOOL_D if k == 0 else WOOL)                       # cuff + sleeve
    return Part(name, [m], pivot=g)

# ---------------------------------------------------------------- rifles (LP Weapons Pack mesh)
def lp_rifle(butt, tip):
    import guns   # fits the FBX into the gun frame and samples its texture colours
    ms = guns.lp_mesh('Wep_USRifle', butt, tip)
    P = np.array(ms.tris, float); C = np.array(ms.fcols, float)
    P[:, :, 0] = X - (P[:, :, 0] - .128)                  # mirror: the pack mesh is left-handed in our frame
    hz = (P[:, :, 0].max(1) > X + .075) & (P[:, :, 2].mean(1) > .3) & (P[:, :, 2].mean(1) < .7)
    g = (C.max(1) - C.min(1)) < 22                        # the pack's flat greys -> blued steel like the other guns
    C[g] = np.clip(np.array(STEEL, float)[None] * (C[g].mean(1, keepdims=True) / 118.0), 0, 255)
    return vm.Mesh(P[~hz], C[~hz])                        # drop the static operating handle; an animated bolt replaces it

def rifle_parts(kind='bolt'):
    short = kind == 'carbine'; s = .88 if short else 1.0
    butt, tip = (-.15, 1.78) if short else (-.35, 1.95)
    Z = lambda z: butt + (z - (-.35)) * (tip - butt) / 2.3   # map long-rifle z positions onto the (shorter) carbine
    body = [lp_rifle(butt, tip)]
    if kind == 'mark':                                    # 4x telescope on two rings
        sc = MB(); sc.lathe((X, .1, Z(.3)), (0, 0, 1), [(0, .03), (.06, .03), (.09, .022), (.55, .022), (.6, .03), (.68, .032)], 10, STEEL_D)
        sc.ellip((X, .1, Z(.3) - .001), (.024, .024, .004), LENS); sc.ellip((X, .1, Z(.98)), (.026, .026, .004), LENS)
        for z in (Z(.45), Z(.82)): sc.box((X, .055, z), (.03, .06, .03), STEEL)
        body.append(sc)
    sg = MB()
    sg.box((X, .02, Z(.85)), (.05, .03, .08), STEEL_D)                                   # rear sight base
    for sx in (-1, 1): sg.box((X + sx * .017, .05, Z(.85)), (.018, .03, .008), STEEL)    # leaf with a notch between
    sg.box((X, .039, Z(.85)), (.052, .008, .008), STEEL)
    sg.box((X, .012, Z(1.88)), (.03, .02, .04), STEEL_D)                                 # front sight base
    sg.box((X, .036, Z(1.88)), (.012, .032, .01), STEEL_D)                               # front post
    for sx in (-1, 1): sg.box((X + sx * .02, .036, Z(1.88)), (.006, .036, .03), STEEL)  # protective ears
    body.append(sg)
    bolt = MB().tube((X + .03, .0, Z(.48)), (X + .1, -.035, Z(.46)), .009, .009, 6, STEEL_L).ellip((X + .11, -.04, Z(.46)), (.018, .018, .018), STEEL_D)
    bolt.tube((X, .012, Z(.4)), (X, .012, Z(.58)), .011, .011, 8, STEEL_L)
    parts = [Part('body', body), Part('bolt', [bolt], pivot=(X, .01, Z(.48)))]
    if short:   # detachable box magazine and the operating handle
        mag = MB().box((X, -.2, Z(.5)), (.06, .16, .1), STEEL_D).box((X, -.285, Z(.5)), (.066, .018, .108), STEEL)
        parts += [Part('mag', [mag], pivot=(X, -.12, Z(.5))), Part('nmag', [MB().box((0, 0, 0), (.06, .16, .1), STEEL_D)])]
    clip = MB().box((0, 0, 0), (.05, .025, .13), BRASS)
    for k in range(5): clip.tube((-.0, .012, -.05 + k * .025), (0, .06, -.05 + k * .025), .009, .006, 6, BRASS)
    parts.append(Part('clip', [clip]))
    parts.append(hand('hl', (X, -.07, Z(1.08)), .045, 'fore', (.05, -.8, -1)))
    parts.append(hand('hr', (X, -.12, Z(.46)), .045, 'wrist', (.5, -.75, -1)))
    sights = ((X, .043, Z(.85)), (X, .05, Z(1.88)))
    return parts, dict(tip=(X, .0, tip), sights=sights, port=(X, .07, Z(.47)), magport=(X, -.2, Z(.5)))

# ---------------------------------------------------------------- MP18-style submachine gun
def smg_parts():
    b = MB()
    b.tube((X, 0, .52), (X, 0, 1.06), .027, .027, 10, STEEL)                       # receiver tube
    b.ellip((X, 0, .52), (.026, .026, .008), STEEL)
    holes = lambda k, i: STEEL_D if (k % 2 == 1 and i % 2 == 0) else STEEL
    b.lathe((X, 0, 1.06), (0, 0, 1), [(0, .036)] + [(t * .06, .036) for t in range(1, 11)], 10, STEEL, colfn=holes)   # perforated jacket
    b.tube((X, 0, 1.66), (X, 0, 1.76), .013, .013, 8, STEEL_D)                     # muzzle
    b.box((X, .046, 1.62), (.008, .03, .016), STEEL_D)                              # front sight
    b.box((X, .04, .86), (.03, .018, .03), STEEL_D)                                 # rear sight block
    b.extrude([(-.4, -.13), (.0, -.1), (.3, -.07), (.5, -.035), (.62, -.025), (1.06, -.026), (1.08, -.05), (1.0, -.07), (.62, -.07),
               (.5, -.1), (.3, -.15), (.1, -.22), (-.4, -.33)], X, .03, WOOD, hwfn=lambda z, y: .028 + max(0, -z) * .02)   # wooden stock
    b.tube((X, -.08, .72), (X, -.11, .74), .006, .006, 5, STEEL_D)                  # trigger
    b.extrude([(.66, -.07), (.82, -.07), (.82, -.085), (.7, -.12), (.66, -.12)], X, .008, STEEL_D)   # trigger guard
    b.box((X - .05, 0, .97), (.06, .03, .045), STEEL_D)                            # magazine housing (left side)
    mag = MB().box((X - .16, -.005, .97), (.18, .028, .042), STEEL_D).box((X - .25, -.005, .97), (.012, .034, .05), STEEL)
    charge = MB().tube((X + .02, .0, .72), (X + .07, .0, .72), .008, .008, 6, STEEL_L).ellip((X + .075, 0, .72), (.014, .014, .014), STEEL_D)
    parts = [Part('body', [b]), Part('mag', [mag], pivot=(X - .05, 0, .97)), Part('nmag', [MB().box((-.09, 0, 0), (.18, .028, .042), STEEL_D)]),
             Part('charge', [charge], pivot=(X, 0, .72)),
             hand('hl', (X, -.05, 1.0), .033, 'fore', (.05, -.8, -1)), hand('hr', (X, -.075, .52), .03, 'wrist', (.55, -.65, -1))]
    return parts, dict(tip=(X, 0, 1.76), sights=((X, .05, .86), (X, .061, 1.62)), magport=(X - .05, 0, .97))

# ---------------------------------------------------------------- Winchester 1897-style trench shotgun
def shotgun_parts():
    b = MB()
    b.tube((X, 0, .9), (X, 0, 2.0), .02, .02, 10, STEEL)                            # barrel
    b.tube((X, -.042, .98), (X, -.042, 1.9), .015, .015, 8, STEEL_D)               # magazine tube
    b.ellip((X, -.042, 1.9), (.016, .016, .01), STEEL)
    shield = lambda k, i: STEEL_D if (k % 2 == 0 and i % 3 == 1) else STEEL
    b.lathe((X, 0, 1.08), (0, 0, 1), [(t * .07, .031) for t in range(10)], 10, STEEL, colfn=shield, cap0=False, cap1=False)   # perforated heat shield
    b.extrude([(.62, -.075), (.62, .02), (.66, .035), (.95, .035), (.98, .02), (.98, -.075)], X, .033, STEEL)   # receiver
    b.box((X + .034, .0, .82), (.004, .03, .1), BLACK)                              # ejection port
    b.box((X, .045, .64), (.012, .03, .02), STEEL_D, R=rotm(-25, 0, 0))             # hammer
    b.ellip((X, .027, 1.98), (.007, .007, .007), BRASS)                              # front bead
    b.box((X, -.03, 1.93), (.03, .012, .05), STEEL_D)                               # bayonet lug
    b.extrude([(-.4, -.14), (.2, -.08), (.5, -.02), (.63, .01), (.63, -.075), (.5, -.1), (.2, -.2), (-.4, -.32)], X, .03, WOOD,
              hwfn=lambda z, y: .026 + max(0, -z) * .02)                            # stock
    b.extrude([(.66, -.075), (.82, -.075), (.82, -.09), (.7, -.125), (.66, -.12)], X, .008, STEEL_D)   # trigger guard
    grooves = lambda k, i: WOOD_D if k % 2 == 1 else WOOD
    pump = MB().lathe((X, -.042, 1.16), (0, 0, 1), [(t * .035, .03) for t in range(9)], 10, WOOD, colfn=grooves)
    shell = MB().tube((0, 0, -.03), (0, 0, .035), .012, .012, 8, RED).tube((0, 0, -.045), (0, 0, -.03), .0125, .0125, 8, BRASS)
    parts = [Part('body', [b]), Part('pump', [pump], pivot=(X, -.042, 1.3)), Part('shell', [shell]),
             hand('hl', (X, -.042, 1.3), .03, 'fore', (.05, -.8, -1)), hand('hr', (X, -.06, .52), .03, 'wrist', (.55, -.65, -1))]
    return parts, dict(tip=(X, 0, 2.0), sights=((X, .038, .8), (X, .03, 1.98)), port=(X, -.08, .78))

# ---------------------------------------------------------------- Lewis-style light machine gun
def lmg_parts():
    b = MB()
    fins = lambda k, i: STEEL_D if i % 2 else STEEL
    b.lathe((X, 0, .98), (0, 0, 1), [(0, .068), (.82, .068), (.9, .05), (.96, .03)], 14, STEEL, colfn=fins)   # finned cooling shroud
    b.tube((X, 0, 1.94), (X, 0, 2.04), .014, .014, 8, STEEL_D)                      # muzzle
    b.box((X, .1, 1.86), (.012, .07, .016), STEEL_D)                                 # front sight post
    b.extrude([(.5, -.06), (.5, .04), (.56, .055), (.98, .055), (.98, -.06)], X, .042, STEEL)   # receiver
    b.box((X, .1, .58), (.04, .08, .016), STEEL_D)                                   # rear sight leaf
    b.extrude([(-.4, -.13), (.2, -.07), (.5, -.02), (.5, -.06), (.3, -.12), (-.4, -.3)], X, .03, WOOD, hwfn=lambda z, y: .026 + max(0, -z) * .02)   # butt
    b.extrude([(.56, -.06), (.66, -.06), (.62, -.2), (.54, -.2)], X, .022, WOOD)    # pistol grip
    b.extrude([(.66, -.06), (.78, -.06), (.78, -.075), (.68, -.11), (.66, -.1)], X, .008, STEEL_D)
    for sx in (-1, 1): b.tube((X + sx * .03, -.05, 1.72), (X + sx * .09, -.34, 1.86), .008, .008, 5, STEEL_D)   # bipod
    ribs = lambda k, i: STEEL_D if (i % 2 and k == 0) else STEEL
    pan = MB().lathe((X, .058, .82), (0, 1, 0), [(0, .165), (.045, .165)], 16, STEEL, colfn=ribs).tube((X, .103, .82), (X, .12, .82), .035, .035, 8, STEEL_D)
    npan = MB().lathe((0, 0, 0), (0, 1, 0), [(0, .165), (.045, .165)], 16, STEEL, colfn=ribs).tube((0, .045, 0), (0, .065, 0), .035, .035, 8, STEEL_D)
    latch = MB().box((X, .07, .62), (.05, .02, .07), STEEL_D)
    charge = MB().tube((X + .04, -.02, .72), (X + .09, -.02, .72), .008, .008, 6, STEEL_L).ellip((X + .095, -.02, .72), (.015, .015, .015), STEEL_D)
    parts = [Part('body', [b]), Part('pan', [pan], pivot=(X, .06, .82)), Part('npan', [npan]), Part('cover', [latch], pivot=(X, .06, .6)),
             Part('charge', [charge], pivot=(X, -.02, .72)),
             hand('hl', (X, -.0, 1.12), .068, 'fore', (.05, -.8, -1)), hand('hr', (X, -.12, .6), .022, 'wrist', (.55, -.65, -1))]
    return parts, dict(tip=(X, 0, 2.04), sights=((X, .14, .58), (X, .135, 1.86)), panc=(X, .058, .82))

# ---------------------------------------------------------------- animation (keyframes per weapon)
def anim_bolt(G):
    px, py, pz = G['port']; far = HIDE
    up = T(0, 0, 0, 0, 0, -75); back = T(0, 0, -.13, 0, 0, -75)
    hr_up = T(.06, .11, .13, 0, 0, -25); hr_back = T(.06, .11, 0, 0, 0, -25); r = T(-.02, -.02, 0, 0, 0, -12)
    rl = [(0, {'clip': far}), (.1, {'root': r, 'bolt': up, 'hr': hr_up, 'clip': far}), (.2, {'root': r, 'bolt': back, 'hr': hr_back, 'clip': far}),
          (.32, {'root': r, 'bolt': back, 'hr': hr_back, 'hl': T(.02, -.08, -.55), 'clip': T(px - .15, py - .25, pz + .1)}),
          (.45, {'root': r, 'bolt': back, 'hr': hr_back, 'hl': T(.0, .06, -.72), 'clip': T(px, py + .14, pz)}),
          (.6, {'root': r, 'bolt': back, 'hr': hr_back, 'hl': T(.0, .02, -.72), 'clip': T(px, py + .01, pz)}),
          (.72, {'root': r, 'bolt': back, 'hr': hr_back, 'hl': T(0, 0, 0), 'clip': far}),
          (.84, {'root': r, 'bolt': up, 'hr': hr_up, 'clip': far}), (1, {'clip': far})]
    cyc = ({'bolt': up, 'hr': hr_up}, {'bolt': back, 'hr': hr_back})
    return rl, cyc

def anim_mag(G, ch='charge'):
    px, py, pz = G['magport']; far = HIDE; r = T(0, -.02, 0, 0, 0, 12)
    rl = [(0, {'nmag': far}), (.12, {'root': r, 'hl': T(0, -.1, -.15)}),
          (.26, {'root': r, 'mag': T(0, -.5, 0), 'hl': T(-.02, -.12, -.35), 'nmag': far}),
          (.42, {'root': r, 'mag': HIDE, 'hl': T(-.05, -.35, -.35), 'nmag': T(px, py - .45, pz)}),
          (.58, {'root': r, 'mag': HIDE, 'hl': T(-.02, -.12, -.35), 'nmag': T(px, py - .12, pz)}),
          (.68, {'root': r, 'mag': T(0, 0, 0), 'nmag': far, 'hl': T(0, 0, 0)}),
          (.8, {ch: T(0, 0, -.14) if ch == 'charge' else T(0, 0, -.13, 0, 0, -75), 'hr': T(.03, .08, -.12)}),
          (.92, {ch: T(0, 0, 0), 'hr': T(0, 0, 0)}), (1, {'nmag': far})]
    return rl, ({}, {})

def anim_shotgun(G):
    px, py, pz = G['port']; far = HIDE; r = T(0, -.02, 0, 0, 0, -16)
    def K(t, **p): d = {'root': r}; d.update(p); return (t, d)
    rl = [(0, {'shell': far})]
    for k in range(3):
        t0 = .06 + k * .2
        rl += [K(t0, shell=far, hr=T(.02, -.06, .0)), K(t0 + .07, shell=T(px + .1, py - .22, pz - .05), hr=T(.04, -.14, .12)),
               K(t0 + .14, shell=T(px, py - .01, pz), hr=T(.0, -.05, .22))]
    rl += [K(.7, shell=far, hr=T(0, 0, 0)), (.8, {'root': T(0, -.01, 0), 'shell': far, 'pump': T(0, 0, -.16), 'hl': T(0, 0, -.16)}),
           (.92, {'pump': T(), 'hl': T()}), (1, {'shell': far})]
    cyc = ({'pump': T(0, 0, -.16), 'hl': T(0, 0, -.16)}, {'pump': T(0, 0, -.06), 'hl': T(0, 0, -.06)})
    return rl, cyc

def anim_lmg(G):
    cx, cy, cz = G['panc']; far = HIDE
    rl = [(0, {'npan': far}), (.12, {'cover': T(0, 0, 0, -60, 0, 0), 'hl': T(-.02, .12, -.25)}),
          (.26, {'cover': T(0, 0, 0, -60, 0, 0), 'pan': T(0, .22, 0, 0, 0, 10), 'hl': T(-.02, .3, -.3), 'npan': far}),
          (.4, {'cover': T(0, 0, 0, -60, 0, 0), 'pan': HIDE, 'hl': T(.05, -.3, -.4), 'npan': far}),
          (.54, {'cover': T(0, 0, 0, -60, 0, 0), 'pan': HIDE, 'hl': T(-.02, .3, -.3), 'npan': T(cx, cy + .25, cz)}),
          (.66, {'cover': T(0, 0, 0, -60, 0, 0), 'pan': HIDE, 'hl': T(-.02, .14, -.3), 'npan': T(cx, cy, cz)}),
          (.74, {'cover': T(0, 0, 0, -10, 0, 0), 'pan': T(), 'npan': far, 'hl': T()}),
          (.84, {'charge': T(0, 0, -.16), 'hr': T(.03, .05, -.14)}), (.95, {'charge': T(), 'hr': T()}), (1, {'npan': far})]
    return rl, ({}, {})


# ---------------------------------------------------------------- v0.26 elite kits
RUBBER = (40, 38, 34); RUBBER_L = (62, 58, 50); FLAME = (255, 150, 40)
def flame_parts():
    """Kleif / Wex-style flamethrower lance: long steel tube, two wooden grips, igniter at the nozzle, hose back to the fuel tank"""
    b = MB()
    b.tube((X, 0, .45), (X, 0, 1.86), .021, .021, 10, STEEL_D)                     # lance tube
    b.lathe((X, 0, 1.86), (0, 0, 1), [(0, .028), (.06, .03), (.14, .018)], 10, BRASS)   # nozzle
    b.box((X, -.045, 1.8), (.03, .025, .06), STEEL)                                # igniter housing under the nozzle
    b.ellip((X, -.045, 1.86), (.012, .012, .012), FLAME)                           # pilot light
    b.box((X, .03, 1.2), (.008, .012, .02), STEEL_D)                               # crude sight blade
    b.box((X, .03, .62), (.02, .015, .02), STEEL_D)
    b.lathe((X, 0, .9), (0, 0, 1), [(0, .032), (.1, .032)], 10, STEEL)              # valve body
    b.tube((X + .03, 0, .95), (X + .085, .02, .93), .009, .009, 6, STEEL_L)        # valve lever
    b.extrude([(1.05, -.03), (1.11, -.03), (1.13, -.19), (1.05, -.19)], X, .022, WOOD)   # forward grip
    b.extrude([(.5, -.03), (.6, -.03), (.62, -.2), (.5, -.2)], X, .024, WOOD)        # rear grip
    b.tube((X, -.08, .58), (X, -.1, .6), .006, .006, 5, STEEL_D)                    # trigger
    hose = MB()
    pts = [(X, -.02, .45), (X - .01, -.09, .3), (X - .04, -.2, .16), (X - .09, -.36, .04), (X - .14, -.55, -.08)]
    for a, c in zip(pts, pts[1:]): hose.tube(a, c, .024, .024, 8, RUBBER)
    for a in pts[1:-1]: hose.ellip(a, (.03, .03, .03), RUBBER_L)
    parts = [Part('body', [b, hose]), Part('charge', [MB().box((X + .06, .01, .93), (.012, .012, .012), STEEL_D)], pivot=(X, 0, .93)),
             hand('hl', (X, -.11, 1.09), .03, 'fore', (.05, -.8, -1)), hand('hr', (X, -.11, .55), .03, 'wrist', (.55, -.65, -1))]
    return parts, dict(tip=(X, 0, 2.0), sights=((X, .045, .62), (X, .045, 1.2)))

def atr_parts():
    """Mauser 1918 T-Gewehr: 13 mm single-shot anti-tank rifle, long heavy barrel, pistol grip, bipod"""
    b = MB()
    b.tube((X, 0, 1.0), (X, 0, 2.55), .026, .021, 10, STEEL)                       # barrel
    b.lathe((X, 0, 2.5), (0, 0, 1), [(0, .028), (.08, .028)], 8, STEEL_D)           # muzzle band
    b.extrude([(.45, -.06), (.45, .045), (.5, .055), (1.02, .055), (1.06, .03), (1.06, -.06)], X, .04, STEEL)   # receiver
    b.extrude([(-.4, -.16), (.15, -.08), (.45, -.02), (.45, -.07), (.3, -.13), (-.4, -.33)], X, .032, WOOD, hwfn=lambda z, y: .03 + max(0, -z) * .02)   # butt
    b.extrude([(.52, -.06), (.62, -.06), (.58, -.24), (.48, -.24)], X, .024, WOOD)  # pistol grip
    b.extrude([(.62, -.06), (.76, -.06), (.76, -.075), (.66, -.12), (.62, -.11)], X, .008, STEEL_D)
    b.extrude([(1.06, -.05), (1.06, .0), (1.6, -.0), (1.6, -.05)], X, .03, WOOD)    # forend
    b.box((X, .075, .92), (.04, .02, .03), STEEL_D); b.box((X, .1, .92), (.012, .03, .008), STEEL)   # rear sight
    b.box((X, .05, 2.4), (.01, .035, .012), STEEL_D)                                # front post
    for sx in (-1, 1): b.tube((X + sx * .02, -.03, 1.62), (X + sx * .11, -.06, 1.25), .01, .01, 5, STEEL_D)   # bipod, folded back
    bolt = MB().tube((X + .03, .02, .62), (X + .13, -.03, .6), .011, .011, 6, STEEL_L).ellip((X + .14, -.04, .6), (.024, .024, .024), STEEL_D)
    bolt.tube((X, .025, .52), (X, .025, .72), .016, .016, 8, STEEL_L)
    rnd_ = MB().tube((0, 0, -.06), (0, 0, .07), .016, .016, 8, BRASS).lathe((0, 0, .07), (0, 0, 1), [(0, .013), (.05, .002)], 8, STEEL_D)   # one big cartridge
    parts = [Part('body', [b]), Part('bolt', [bolt], pivot=(X, .02, .62)), Part('clip', [rnd_]),
             hand('hl', (X, -.07, 1.32), .045, 'fore', (.05, -.8, -1)), hand('hr', (X, -.1, .53), .028, 'wrist', (.55, -.65, -1))]
    return parts, dict(tip=(X, 0, 2.58), sights=((X, .112, .92), (X, .085, 2.4)), port=(X, .09, .66))

def hmg_parts():
    """MG 08/15: water-cooled jacket, box receiver, pistol grip and butt, belt drum on the right"""
    b = MB()
    b.lathe((X, 0, .98), (0, 0, 1), [(0, .062), (.04, .066), (.62, .066), (.66, .062)], 14, STEEL, colfn=lambda k, i: STEEL_D if k in (1, 3) else STEEL)   # water jacket
    b.tube((X, .066, 1.2), (X, .085, 1.2), .016, .016, 6, STEEL_D)                 # filler cap
    b.lathe((X, 0, 1.64), (0, 0, 1), [(0, .03), (.1, .034), (.16, .02)], 10, STEEL_D)   # muzzle booster
    b.extrude([(.42, -.07), (.42, .05), (.47, .065), (1.0, .065), (1.0, -.07)], X, .05, STEEL)   # receiver box
    b.box((X + .052, 0, .74), (.004, .04, .2), STEEL_D)                             # side plate lines
    b.extrude([(-.4, -.14), (.15, -.08), (.42, -.03), (.42, -.08), (.3, -.13), (-.4, -.3)], X, .03, WOOD, hwfn=lambda z, y: .028 + max(0, -z) * .02)   # butt
    b.extrude([(.46, -.07), (.56, -.07), (.53, -.23), (.44, -.23)], X, .022, WOOD)  # pistol grip
    b.box((X, .09, .56), (.035, .03, .014), STEEL_D)                                # rear sight
    b.box((X, .1, 1.55), (.01, .04, .012), STEEL_D)                                 # front sight
    for sx in (-1, 1): b.tube((X + sx * .03, -.06, 1.5), (X + sx * .1, -.36, 1.62), .009, .009, 5, STEEL_D)   # bipod
    ribs = lambda k, i: STEEL_D if i % 3 == 0 else STEEL
    drum = MB().lathe((X + .14, -.07, .8), (1, 0, 0), [(0, .11), (.09, .11)], 16, STEEL, colfn=ribs).box((X + .09, -.02, .8), (.05, .04, .06), STEEL_D)
    ndrum = MB().lathe((0, 0, 0), (1, 0, 0), [(0, .11), (.09, .11)], 16, STEEL, colfn=ribs)
    belt = MB()
    for k in range(5): belt.tube((X + .06, -.0 + k * .004, .7 + k * .045), (X + .06, .025 + k * .004, .7 + k * .045), .007, .005, 6, BRASS)
    cover = MB().box((X, .07, .7), (.055, .015, .14), STEEL_D)
    charge = MB().tube((X + .055, .0, .9), (X + .12, -.02, .88), .008, .008, 6, STEEL_L).ellip((X + .125, -.025, .88), (.016, .016, .016), STEEL_D)
    parts = [Part('body', [b, belt]), Part('pan', [drum], pivot=(X + .14, -.07, .8)), Part('npan', [ndrum]), Part('cover', [cover], pivot=(X, .07, .58)),
             Part('charge', [charge], pivot=(X, 0, .9)),
             hand('hl', (X, -.03, 1.1), .066, 'fore', (.05, -.8, -1)), hand('hr', (X, -.12, .5), .022, 'wrist', (.55, -.65, -1))]
    return parts, dict(tip=(X, 0, 1.8), sights=((X, .12, .56), (X, .14, 1.55)), panc=(X + .14, -.07, .8))

def anim_flame(G):   # swing a fresh fuel tank into place: the lance dips, the left hand works the valve
    r = T(.02, -.08, -.05, 0, 0, 18)
    rl = [(0, {}), (.15, {'root': r, 'hl': T(-.02, -.05, -.25)}), (.35, {'root': T(.04, -.2, -.1, 6, 0, 30), 'hl': T(-.05, -.2, -.55)}),
          (.6, {'root': T(.04, -.2, -.1, 6, 0, 30), 'hl': T(-.02, -.06, -.5)}), (.75, {'root': r, 'charge': T(0, 0, 0, 0, 80, 0), 'hl': T(.04, .05, -.2)}),
          (.9, {'root': T(0, -.02, 0), 'charge': T(), 'hl': T()}), (1, {})]
    return rl, ({}, {})

GUNS = {
    'bolt': dict(m=lambda: rifle_parts('bolt'), anim=anim_bolt, fire='bolt'),
    'carbine': dict(m=lambda: rifle_parts('carbine'), anim=lambda G: anim_mag(G, 'bolt'), fire='semi'),
    'mark': dict(m=lambda: rifle_parts('mark'), anim=anim_bolt, fire='bolt'),
    'shotgun': dict(m=shotgun_parts, anim=anim_shotgun, fire='pump'),
    'smg': dict(m=smg_parts, anim=anim_mag, fire='auto'),
    'lmg': dict(m=lmg_parts, anim=anim_lmg, fire='auto'),
    'flame': dict(m=flame_parts, anim=anim_flame, fire='flame'),
    'atr': dict(m=atr_parts, anim=anim_bolt, fire='bolt'),
    'hmg': dict(m=hmg_parts, anim=anim_lmg, fire='auto'),
}
# hip: the gun sits low and right, parallel to the view so its lines run into the screen centre (like the reference shots)
ROOT_HIP = T(.115, -.115, .0, 3, -1, 0); HIP_PIVOT = (.1, -.1, .5)   # gun low and right: the crosshair area stays clear
HIP_OVR = {'flame': T(.13, -.13, .0, 4, -3, 0), 'atr': T(.13, -.13, .05, 3, -3, 0), 'hmg': T(.15, -.16, .07, 3, -5, 0), 'lmg': T(.14, -.15, .06, 3, -5, 0), 'shotgun': T(.115, -.12, .0, 3, -2, 0), 'smg': T(.115, -.11, .0, 3, -1, 0)}
ADS_DIST = {'flame': 1.6, 'atr': 2.4, 'hmg': 1.7, 'bolt': 1.95, 'carbine': 1.8, 'mark': 1.95, 'shotgun': 1.75, 'smg': 1.55, 'lmg': 1.75}

def ads_root(G, name):
    """rotate the gun about its front sight so the sight line runs along the view axis, then put the front sight on the screen centre"""
    (rx_, ry_, rz_), (fx, fy, fz) = G['sights']
    a = math.degrees(math.atan((ry_ - fy) / (rz_ - fz))) if rz_ != fz else 0
    return T(-fx, -fy, ADS_DIST[name] - fz, -a, 0, 0), (fx, fy, fz)

def muzzle_fx(img, p, r, ads):
    d = ImageDraw.Draw(img); x, y = vm.project(p)
    for rr, col in ((r, (255, 206, 96, 255)), (r * .55, (255, 248, 214, 255))):
        pts = []
        for i in range(8):
            a = math.pi / 4 * i - math.pi / 2 + .2; q = rr if i % 2 == 0 else rr * .32
            pts.append((x + math.cos(a) * q, y + math.sin(a) * q))
        d.polygon(pts, fill=col)
    if not ads:
        d.ellipse((x - 22, y - 16, x - 8, y - 6), fill=(178, 176, 168, 255)); d.ellipse((x - 34, y - 24, x - 22, y - 15), fill=(146, 144, 138, 255))

def frames(name):
    g = GUNS[name]; parts, G = g['m'](); rl, cyc = g['anim'](G)
    if name in BAYO: parts = parts + [Part('bayo', [bayonet(G['tip'], *BAYO[name])])]
    hide0 = {n: HIDE for n in ('clip', 'shell', 'nmag', 'npan') if any(p.name == n for p in parts)}
    out = []
    def R(pose, extra=T(), fl=False, ads=False):
        pp = dict(hide0); pp.update({k: v for k, v in pose.items() if k != 'root'})
        if ads:
            root, piv = ads_root(G, name); root = comb(root, extra); root = comb(root, pose.get('root', T()))
            for hh in ('hl', 'hr'): pp[hh] = comb(pp.get(hh, T()), T(0, -.02, 0))
        else:
            root = comb(comb(HIP_OVR.get(name, ROOT_HIP), pose.get('root', T())), extra); piv = HIP_PIVOT
        img = vm.render(parts, pp, root, piv)
        if fl and g['fire'] != 'flame':
            tip = np.asarray(G['tip'], float)
            tw = vm.xf(tip[None], root, np.asarray(piv, float))[0]
            muzzle_fx(img, tw, 15 if ads else 18, ads)
        return img
    def fireset(ads):
        k = .45 if ads else 1
        if g['fire'] in ('bolt', 'pump'): c0, c1 = cyc
        elif g['fire'] in ('auto', 'flame'): c0, c1 = {'charge': T(0, 0, -.05)} if g['fire'] == 'auto' else {}, {}
        else: c0, c1 = {}, {}
        return [R({}, T(0, .018 * k, -.06 * k, -5 * k, 0, 0), fl=True, ads=ads), R({}, T(0, .012 * k, -.04 * k, -3 * k, 0, 0), ads=ads),
                R(c0, T(0, .006 * k, -.02 * k, -1.5 * k, 0, 0), ads=ads), R(c1, T(0, 0, -.006 * k), ads=ads)]
    out.append(R({})); out += fireset(False)
    for i in range(16): out.append(R(interp(rl, i / 15)))
    out.append(R({}, ads=True)); out += fireset(True)
    out.append(R({}, SPRINT))
    for k in (MELEE_STAB if name in BAYO else MELEE_BASH): out.append(R({}, k))
    return out

BAYO = {'bolt': (-.035, .6), 'carbine': (-.035, .56), 'shotgun': (-.035, .52)}   # 1907 / M1917-style blades: lug offset below the bore, length
def bayonet(tip, dy, ln):
    x, y, z = tip; y += dy; b = MB()
    b.box((x, y, z - .02), (.026, .03, .06), STEEL_D)                     # muzzle ring and lug
    b.box((x, y - .012, z + .02), (.06, .012, .016), STEEL_D)             # crossguard
    b.lathe((x, y, z + .03), (0, 0, 1), [(0, .02), (ln * .78, .016), (ln, .001)], 4, STEEL_L)   # diamond-section blade
    b.tube((x, y + .006, z + .03), (x, y + .006, z + ln * .85), .002, .002, 4, (200, 206, 212))   # bright edge catches the light
    return b
SPRINT = T(.05, -.06, -.02, -30, -26, 38)          # port arms while running: gun diagonal, muzzle up and to the left (as in the reference video)
MELEE_STAB = [T(.06, -.05, -.1, 2, -22, 14), T(.0, .0, .15, 1, -14, 8), T(-.02, .01, .42, -1, -10, 6), T(.02, -.02, .2, 1, -14, 8), T(.04, -.04, 0, 2, -18, 10)]   # charge/wind-up, lunge, full thrust, recover
MELEE_BASH = [T(.08, -.06, -.12, 6, -10, -20), T(.03, -.02, .1, 2, -4, -26), T(.0, .0, .3, 0, 0, -30), T(.03, -.02, .15, 2, -4, -22), T(.05, -.04, 0, 3, -4, -10)]   # gun-bash jab

COLS = 6
def icon(name):
    """HUD icon: side view of the gun alone (the client only uses its alpha), muzzle to the right"""
    parts, G = GUNS[name]['m']()
    keep = [p for p in parts if p.name not in ('hl', 'hr', 'clip', 'shell', 'nmag', 'npan')]
    im = vm.render(keep, {}, T(-X, 0, 3.0, 0, 90, 0), (X, 0, .8))
    bb = im.getbbox(); return im.crop(bb) if bb else im
def sheet(frs):
    rows = (len(frs) + COLS - 1) // COLS; sh = Image.new('RGBA', (vm.W * COLS, vm.H * rows), (0, 0, 0, 0))
    for i, f in enumerate(frs): sh.paste(f, ((i % COLS) * vm.W, (i // COLS) * vm.H))
    return sh

def finish(frs, colors=48):
    """1998 pixel finish at native 360x240: grain, one palette shared by all frames of the gun, dark silhouette ink"""
    import crunch_guns as cg
    frs = [cg.grain(f.copy()) for f in frs]
    strip = Image.new('RGBA', (vm.W * len(frs), vm.H)); [strip.paste(f, (i * vm.W, 0)) for i, f in enumerate(frs)]
    rgb = strip.convert('RGB'); pal = rgb.quantize(colors, method=Image.MEDIANCUT)
    q = rgb.quantize(palette=pal, dither=Image.Dither.NONE).convert('RGB'); out = []
    for i, f in enumerate(frs):
        g = q.crop((i * vm.W, 0, (i + 1) * vm.W, vm.H)).convert('RGBA'); g.putalpha(f.split()[3]); out.append(cg.ink(g))
    return out

if __name__ == '__main__':
    import time
    import json
    args = [a for a in sys.argv[1:] if not a.startswith('--')]; outdir = next((a[6:] for a in sys.argv[1:] if a.startswith('--out=')), None)
    for nm in (args or list(GUNS)):
        t0 = time.time(); fr = finish(frames(nm)); sh = sheet(fr)
        if outdir: sh.save(os.path.join(outdir, f'gun_{nm}.png'), optimize=True)
        else: sh.save(f'/tmp/v_{nm}.png')
        print(nm, len(fr), f'{time.time() - t0:.1f}s')
    if outdir:
        for nm in (args or list(GUNS)): icon(nm).save(os.path.join(outdir, f'w_{nm}.png'))
    if outdir: json.dump({'w': vm.W, 'h': vm.H, 'cols': COLS, 'n': 32, 'sprint': 26, 'melee': [27, 28, 29, 30, 31], 'idle': 0, 'fire': [1, 2, 3, 4], 'rl': [5, 20], 'ads': 21, 'afire': [22, 23, 24, 25]}, open(os.path.join(outdir, 'gun_frames.json'), 'w'))
