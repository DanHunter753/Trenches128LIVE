'use strict';
// Dugouts under shellfire (v0.28.1): craters, rim spoil and blown-in bays must never raise a dugout floor or block its door,
// and a soldier in any dugout must be able to walk out after a heavy bombardment. Also: never pinned between floor and roof.
const T = require('../shared.js');
const R = { checks: {} }, ck = (k, v) => R.checks[k] = !!v;
let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const terr = T.makeTerrain(), H = terr.H;
const floorOf = r => T.hAt(H, r.xc, (r.fz0 + r.fz1) / 2);
const before = T.ROOMS.map(r => { const a = []; for (let x = r.x0; x <= r.x1; x += .5) for (let z = r.z0; z <= r.z1; z += .5) a.push(T.hAt(H, x, z)); return a; });

// heavy bombardment: 40 shells of every size on and around each dugout, plus every blowable bay
let shells = 0;
for (const r of T.ROOMS) for (let i = 0; i < 40; i++) {
  const x = r.xc + (rnd() - .5) * 16, z = (r.z0 + r.z1) / 2 + (rnd() - .5) * 16, rad = 1.5 + rnd() * 3, dep = .6 + rnd() * 1.6;
  T.dig(terr, +x.toFixed(2), +z.toFixed(2), +rad.toFixed(2), +dep.toFixed(2)); shells++;
}
for (const t of T.FL) for (let c = 0; c < Math.floor(T.S / 9); c++) if (T.bayOK(t, c)) T.collapseBay(terr, t, c);
ck('roomsExist', T.ROOMS.length > 20);
ck('floorsUntouched', T.ROOMS.every((r, k) => { let i = 0; for (let x = r.x0; x <= r.x1; x += .5) for (let z = r.z0; z <= r.z1; z += .5) if (Math.abs(T.hAt(H, x, z) - before[k][i++]) > .02) return false; return true; }));
ck('headroomEverywhere', T.ROOMS.every(r => { const za = Math.min(r.fz0, r.fz1) + .5, zb = Math.max(r.fz0, r.fz1) - .5; for (let x = r.fx0 + .5; x <= r.fx1 - .5; x += .25) for (let z = za; z <= zb; z += .25) if (T.hAt(H, x, z) + 1.8 > r.rb + .01) return false; return true; }));

// walk out of every dugout: room centre -> door -> trench
function walkOut(r, sx, sz, dbg) {
  const p = { x: sx, z: sz, y: T.hAt(H, sx, sz), vy: 0, alive: true, cls: 'rifleman', chg: T.CHG_MAX };
  const goals = [[r.xc, r.c - r.sg * 2.2], [r.xc, r.c]]; let gi = 0;
  for (let i = 0; i < 300 && gi < goals.length; i++) {   // 10 s at 30 Hz
    const [gx, gz] = goals[gi], dx = gx - p.x, dz = gz - p.z; if (Math.hypot(dx, dz) < .6) { gi++; continue; }
    const yaw = Math.atan2(-dx, -dz), ox = p.x, oz = p.z; T.step(p, { dt: 1 / 30, f: 1, s: 0, bits: p.stall > 8 ? 16 | 4 : 0, yaw, pitch: 0 }, H, 1);   // blocked for a moment: climb / jump, like players and bots do
    p.stall = Math.hypot(p.x - ox, p.z - oz) < .02 ? (p.stall || 0) + 1 : 0;
  }
  if (dbg && gi < goals.length) console.log('stuck in', r.xc, r.t, 'at', p.x.toFixed(2), p.z.toFixed(2), 'y', (p.y - r.fy).toFixed(2), 'goal', gi, 'door z', (r.c - r.sg * 2.2).toFixed(2), 'trench c', r.c.toFixed(2));
  return gi >= goals.length;
}
const stuck = T.ROOMS.filter(r => !walkOut(r, r.xc + (rnd() - .5) * 3, (r.fz0 + r.fz1) / 2, process.env.DBG));
ck('everyoneWalksOut', stuck.length === 0);

// safety net: ground forced up under a roof (old saves, future map edits) must not pin anyone
{ const r = T.ROOMS[3], t2 = T.makeTerrain(), H2 = t2.H;
  for (let j = 0; j <= T.N; j++) for (let i = 0; i <= T.N; i++) { const x = -T.W + i * T.ST, z = -T.W + j * T.ST; if (x > r.xc - 1 && x < r.xc + 1 && z > Math.min(r.fz0, r.fz1) && z < Math.max(r.fz0, r.fz1)) H2[j * (T.N + 1) + i] = r.rb - 1.2; }
  const p = { x: r.xc, z: (r.fz0 + r.fz1) / 2, y: r.rb - 1.2, vy: 0, alive: true, cls: 'rifleman', chg: T.CHG_MAX };
  for (let i = 0; i < 30; i++) T.step(p, { dt: 1 / 30, f: 0, s: 0, bits: 0, yaw: 0, pitch: 0 }, H2, 1);
  ck('notPinnedUnderRoof', p.y >= T.hAt(H2, p.x, p.z) - .05); }
R.stuckRooms = stuck.map(r => [r.xc, r.t]); R.shells = shells;
console.log(JSON.stringify(R, null, 1)); const bad = Object.entries(R.checks).filter(([, v]) => !v).map(e => e[0]);
console.log(bad.length ? 'FAILED ' + bad : 'ALL ' + Object.keys(R.checks).length + ' CHECKS PASSED'); process.exit(bad.length ? 1 : 0);
