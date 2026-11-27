"""Bake the Wake Island data (build/wake/*) into the game's map files.
  public/maps/wake.hm   801 x 801 int16 little-endian, height in cm, row-major by z then x, 1 m grid over an 800 m world (centre 0,0)
  public/maps/wake.json flags, start zones, props, bridges, sea level, in game metres (x east, z south; y up, sea at 0)
  (the server builds maps/wake.js for the browser from these two at run time)
Source units: GEM map units, 1 unit = 0.1 m in play terms; the game uses SCALE m per unit (0.08: an 800 m world with the island about 710 m across).
Run: python3 -I build/wake/bake.py"""
import json, base64, struct, os, numpy as np
from PIL import Image
HERE = os.path.dirname(os.path.abspath(__file__)); OUT = os.path.join(HERE, '..', '..', 'public', 'maps'); os.makedirs(OUT, exist_ok=True)
SCALE = 0.08; WATER = 30.0; S = 800; N = 800; OX, OY = 588, -372   # source-unit offsets that centre the land on the world
u16 = np.asarray(Image.open(os.path.join(HERE, 'height_1024_u16.png'))).astype(np.float32); H = u16 / 100 - 70   # GEM units; row 0 = y +5016 (north in the file's terms)
# game coords: gx = SCALE*ex, gz = SCALE*ey (so the map reads like the archive's minimap), gy = SCALE*(h - WATER)
# the height array's row r holds y = 5016 - r*10032/1023 -> gz = SCALE*(5016 - r*9.806); so row for gz: r = (5016 - gz/SCALE)/9.806
from scipy.ndimage import map_coordinates
gz = np.linspace(-S / 2, S / 2, N + 1); gx = np.linspace(-S / 2, S / 2, N + 1); GX, GZ = np.meshgrid(gx, gz)
r = (5016 - (GZ / SCALE + OY)) / (10032 / 1023); c = ((GX / SCALE + OX) + 5016) / (10032 / 1023)
Hg = map_coordinates(H, [r, c], order=1, mode='nearest'); Hg = (Hg - WATER) * SCALE
# outside the source square: deep sea
Hg[(r < 0) | (r > 1023) | (c < 0) | (c > 1023)] = -6
# soften: the mesh has 10 m facets; a light blur at 1 m keeps beaches smooth, then keep the sea floor from going absurdly deep
from scipy.ndimage import gaussian_filter
Hg = gaussian_filter(Hg, 1.2); Hg = np.maximum(Hg, -7)
E = json.load(open(os.path.join(HERE, 'entities.json')))
# fords where the original has its two wooden bridges (the bridges themselves come with the restyle): the seabed is raised to
# wading depth along a 60 x 10 m strip so the islets connect
for e in E:
    if e['t'] != 'bridge_wood': continue
    bx, bz = SCALE * (e['x'] - OX), SCALE * (e['y'] - OY); a = -e.get('rot', 0) * np.pi / 180
    d = np.hypot(GX - bx, GZ - bz); m = d < 22; Hg[m] = np.maximum(Hg[m], -0.8)   # a sandbar: the angle in the file does not match the channel, a round shoal does
    m2 = (d < 30) & ~m; Hg[m2] = np.maximum(Hg[m2], -1.6)
cm = np.round(Hg * 100).clip(-32767, 32767).astype('<i2'); open(os.path.join(OUT, 'wake.hm'), 'wb').write(cm.tobytes())
land = Hg > 0; print('land fraction', land.mean().round(3), 'height range', Hg.min().round(2), Hg.max().round(2), 'land median', np.median(Hg[land]).round(2))
def G(e): return [round(SCALE * (e['x'] - OX), 1), round(SCALE * (e['y'] - OY), 1)]
flags = [e for e in E if e['t'] == 'skirmish_flag']
names = {'0x41b': 'Airfield', '0x41c': 'North Camp', '0x41d': 'Peale Point', '0x41e': 'South Battery', '0x41f': 'Wilkes Landing'}
letters = 'ABCDE'
F = sorted(flags, key=lambda e: e['x'], reverse=True)
flags_out = [{'id': letters[i], 'n': names.get(e['id'], 'Flag ' + letters[i]), 'x': G(e)[0], 'z': G(e)[1]} for i, e in enumerate(F)]
props = []
KEEP = {'palm_chamaerops': 'palm', 'bush9': 'bush', 'house_ru_141': 'hut', 'house_wood_4': 'hut', 'h_w_4_cut3': 'hut', 'eg_omaha2': 'obstacle', 'sandbag3': 'bags', 'sandbag2_round': 'bagring', 'type99lmg': 'nest', 'watch_tower_1': 'tower', 'mg34_tower': 'mgtower', 'dot2_v': 'bunker', 'dot_small': 'bunker', '120mm_l50': 'gun', 'type2_20mm_stand': 'aa', 'np_type95': 'wreck', 'np_type94': 'wreck', 'chi-ha57': 'tank', 'a6m_m21_86': 'plane', 'a6m_m21_86_xx': 'planewreck', 'ho-ha3mgun': 'wreck', 'radar_mount': 'radar', 'dok_build3': 'pier', 'shellhole_dead_car2': 'wreck', 'wires': 'wire', 'trench_ground': 'trench', 'trench_ground_exit2': 'trench', 'road_sand5w1': 'road', 'road_sand5w1_k': 'road', 'road_sand5f1': 'road', 'aerostrip': 'strip', 'bridge_wood': 'bridge'}
for e in E:
    k = KEEP.get(e['t']);
    if not k: continue
    x, z = G(e); p = {'k': k, 'x': x, 'z': z}
    if 'rot' in e: p['r'] = round(-e['rot'] * 3.14159265 / 180, 3)
    if 'scale' in e: p['s'] = e['scale']
    if 'player' in e: p['team'] = e['player']
    props.append(p)
meta = {'name': 'Wake Atoll', 'S': S, 'N': N, 'sea': 0, 'scale': SCALE, 'flags': flags_out,
        'start': [dict(team=0, n='Landing force', r=40, **{k: v for k, v in next(f for f in flags_out if f['n'] == 'Wilkes Landing').items() if k in ('x', 'z')}), dict(team=1, n='Garrison', r=50, **{k: v for k, v in next(f for f in flags_out if f['n'] == 'Airfield').items() if k in ('x', 'z')})],
        'props': props}
json.dump(meta, open(os.path.join(OUT, 'wake.json'), 'w'), separators=(',', ':'))
print('flags', flags_out); print('props', len(props), {k: sum(1 for p in props if p['k'] == k) for k in set(p['k'] for p in props)})
print('sizes', os.path.getsize(os.path.join(OUT, 'wake.hm')), os.path.getsize(os.path.join(OUT, 'wake.json')))
# preview
im = np.zeros((N + 1, N + 1, 3), np.uint8); k = np.clip(Hg / 12, 0, 1)
im[~land] = (30, 60, 100); sh = (Hg <= 0) & (Hg > -2); im[sh] = (70, 130, 160)
im[land] = np.stack([205 - 80 * k, 190 - 60 * k, 130 - 70 * k], -1)[land].astype(np.uint8)
Image.fromarray(im).save(os.path.join(HERE, 'baked_preview.png'))
