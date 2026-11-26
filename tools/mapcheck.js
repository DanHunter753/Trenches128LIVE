'use strict';
// v0.30: checks many random maps with the bots' own pathfinding. For every seed: each line objective, depot, MG nest and gun
// must be reachable on foot from both home lines, and the two sides' walks to their targets should be about as long.
// Usage: node tools/mapcheck.js [count=12] [firstSeed]     (each map takes about a second to build)
const T = require('../shared.js'); let terr = null; const NAV = require('../botai.js')(T, () => terr && terr.H);
const n = +process.argv[2] || 12, first = +process.argv[3] || 1 + Math.floor(Math.random() * 1e9), rows = []; let bad = 0;
const at = (d, x, z) => { let b = 1e9; for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) { const i = Math.floor(x + dx + T.W), j = Math.floor(z + dz + T.W); if (i >= 0 && j >= 0 && i < T.S && j < T.S) b = Math.min(b, d[j * T.S + i]); } return b; };
for (let k = 0; k < n; k++) {
  const seed = T.setMap(first + k * 7919); terr = T.makeTerrain(); NAV.rebuild(); const t = Date.now() + k * 1e6;
  NAV.tick(); const h0 = NAV.field(0, T.HOME_Z - 8, t, true); NAV.tick(); const home = [h0, NAV.field(0, -T.HOME_Z + 8, t, true)];   // walking fields from each side's home area
  const probs = [], walk = [[], []];
  for (const [i, o] of T.OBJ.entries()) for (const s of [0, 1]) { const d = at(home[s], o.x, o.z); if (d > 1e8) probs.push('objective ' + i + ' unreachable from side ' + s); else if ((s === 0) === (i >= 3)) walk[s].push(d); }   // attackers walk to the other side's lines
  for (const d of T.DEPOTS) for (const s of [0, 1]) if (at(home[s], d.x, d.z) > 1e8) probs.push('depot ' + d.n + ' unreachable from ' + s);
  for (const q of T.NEST) if (at(home[q.team], q.x, q.z) > 1e8) probs.push('nest ' + q.x + ' unreachable');
  for (const q of T.EMPL) if (at(home[q.team], q.x - Math.sin(q.yaw) * -1.8, q.z - Math.cos(q.yaw) * -1.8) > 1e8) probs.push(q.k + ' ' + q.x + ' unreachable');
  const sum = a => a.reduce((x, y) => x + y, 0), w0 = sum(walk[0]), w1 = sum(walk[1]), skew = Math.abs(w0 - w1) / Math.max(w0, w1);
  if (skew > .25) probs.push('uneven: attack walks ' + Math.round(w0) + ' m vs ' + Math.round(w1) + ' m');
  if (probs.length) bad++;
  rows.push({ seed, check: T.mapCheck() || 'ok', rooms: T.ROOMS.length, walk: [Math.round(w0), Math.round(w1)], skew: +skew.toFixed(2), probs });
}
for (const r of rows) console.log(JSON.stringify(r));
console.log(bad ? bad + ' of ' + n + ' maps have problems' : 'ALL ' + n + ' MAPS OK');
process.exit(bad ? 1 : 0);
