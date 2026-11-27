'use strict';
// v0.45 Wake restyle: structures from the map are solid (walking and bullets), trenches are carved at every flag (and men can
// climb or walk out of them), beach obstacles are wire that slows you, the AA stands are working AA guns, lanterns are lit.
process.argv = ['node', 'x', '--port', '8084', '--fill', '12', '--no-fetch', '--maps', 'wake', '--data', require('fs').mkdtempSync(require('path').join(require('os').tmpdir(), 't128wk3-'))];
process.env.T128_TEST = '1';
const S = require('../server.js'), X = S._test, T = require('../shared.js');
const sleep = ms => new Promise(r => setTimeout(r, ms)), R = {}, ck = (k, v) => { R[k] = !!v; };
(async () => {
  await sleep(1200); const H = X.terr().H, K = {}; for (const s of T.STRUCT) K[s.k] = (K[s.k] || 0) + 1; R.kinds = K;
  ck('structures', K.hut >= 15 && K.bunker >= 3 && K.tower >= 3 && K.cring >= 4 && K.bagring >= 8 && K.bags >= 25 && K.bridge === 2);
  // a hut wall stops a bullet and a man
  const hut = T.STRUCT.find(s => s.k === 'hut' && s.parts.length > 12), w = hut.parts.find(b => !b.nb && b.y1 - b.y0 > 2), y = w.y0 + 1.3;
  const nx = Math.cos(w.yaw), nz = -Math.sin(w.yaw);   // the wall's thin axis
  ck('wallStopsBullet', T.fortSeg(w.cx - nz * 0 + nx * -3, y, w.cz + nz * -3, w.cx + nx * 3, y, w.cz + nz * 3) >= 0);
  ck('wallStopsMan', !!T.fortHit(w.cx, w.y0 + .3, w.cz, .3, true));
  // trenches at the flags: about 1.1 m deep with a spoil bank; a man climbs out, and can walk out of the ramped end
  R.trenches = T.WTR.length; const tr = T.WTR[0], mid = tr.pts[5], end = tr.pts[0], fl = T.OBJ.find(o => Math.hypot(o.x - mid[0], o.z - mid[1]) < 14);
  const floor = T.hAt(H, mid[0], mid[1]), rim = Math.max(...[-1.8, 1.8].map(d => { const a = tr.pts[4], b = tr.pts[6], dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz); return T.hAt(H, mid[0] - dz / L * d, mid[1] + dx / L * d); }));
  R.depth = +(rim - floor).toFixed(2); ck('trenchAtFlag', T.WTR.length >= 12 && fl && rim - floor > .9 && rim - floor < 1.8);
  const man = { x: mid[0], y: floor, z: mid[1], vy: 0, cls: 'rifleman', hp: 100 }, out = Math.atan2(-(mid[0] - fl.x), -(mid[1] - fl.z));   // yaw that faces away from the flag
  for (let i = 0; i < 60 * 4; i++) T.step(man, { dt: 1 / 60, f: 1, s: 0, bits: 1 | (i % 20 === 0 ? 16 : 0), yaw: out }, H, 1);
  R.climb = [+floor.toFixed(2), +man.y.toFixed(2), +Math.hypot(man.x - mid[0], man.z - mid[1]).toFixed(1)]; ck('climbsOut', man.y > floor + .7 && Math.hypot(man.x - mid[0], man.z - mid[1]) > 1.5);
  ck('rampedEnd', T.hAt(H, end[0], end[1]) > floor + .6);
  ck('navCrossesTrenchEnds', X.navPassable(end[0], end[1]));
  // wire
  const wb = T.WWIRE[0]; ck('wireSlows', T.WWIRE.length >= 30 && T.wireK(wb.cx, wb.cz) < .5 && T.wireK(wb.cx + 20, wb.cz + 20) === 1);
  // AA guns and lights
  ck('aaGuns', T.AA.length === 5 && X.AAS.length === 5 && T.AA.every(a => a.team === 1));
  ck('lanterns', T.LIGHTS.length >= 15 && T.litAt(T.OBJ[0].x + .3, T.OBJ[0].z) > .5);
  // nobody spawns inside a building, and the start zones are still usable
  const bad = [...X.ents.values()].filter(e => e.alive && T.fortHit(e.x, e.y, e.z, .3, true)).length; R.inside = bad; ck('noneInsideWalls', bad === 0);
  console.log(JSON.stringify(R)); const fails = Object.keys(R).filter(k => R[k] === false); console.log(fails.length ? 'FAILED: ' + fails.join(', ') : 'ALL ' + Object.keys(R).filter(k => typeof R[k] === 'boolean').length + ' CHECKS PASSED'); process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log('TEST ERROR', e); process.exit(1); });
