import sys, re, json
src, out = sys.argv[1], sys.argv[2]
s = open(src, encoding='utf-8', errors='replace').read()
ents = []
for m in re.finditer(r'\{Entity "([^"]+)" (0x[0-9a-f]+)((?:\n\t\t[^\n]*)*)', s):
    name, eid, body = m.groups()
    pm = re.search(r'\{Position ([-\d.]+) ([-\d.]+)(?: ([-\d.]+))?\}', body)
    if not pm: continue
    e = {'t': name, 'id': eid, 'x': float(pm.group(1)), 'y': float(pm.group(2))}
    if pm.group(3): e['h'] = float(pm.group(3))
    zl = re.search(r'zl ([-\d.]+)', body); sc = re.search(r'scale ([-\d.]+)', body); pl = re.search(r'\{Player (\d)\}', body); mid = re.search(r'\{MID (\d+)\}', body)
    if zl: e['rot'] = float(zl.group(1))
    if sc: e['scale'] = float(sc.group(1))
    if pl: e['player'] = int(pl.group(1))
    if mid: e['mid'] = int(mid.group(1))
    ents.append(e)
json.dump(ents, open(out, 'w'), indent=0)
print(len(ents))
for e in ents:
    if e['t'] in ('skirmish_flag', '120mm_l50', 'a6m_m21_86', 'a6m_m21_86_xx', 'chi-ha57', 'watch_tower_1', 'radar_mount', 'dok_build3', 'bridge_wood', 'water_sea_iwo', 'ho-ha3mgun', 'np_type95', 'np_type94', 'type2_20mm_stand', 'mg34_tower', 'dot2_v'): print(e)
