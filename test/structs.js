'use strict';
// v0.32 bigger map and battlefield structures: the map is 400 x 400 m; every map gets shelled-out buildings and wrecked
// vehicles (tank hulks and a downed plane in no-man's land) built the same way from the seed on server and clients; each
// piece is solid (stops a body, a bullet and a sight line); none sits in a trench, the home camp or on an objective; the
// bots' nav grid routes around them; a soldier spawned on top of one is moved clear.
const T = require('../shared.js'), R = {}, ck = (k, v) => { R[k] = !!v; };
ck('size400', T.S === 400 && T.W === 200);
const seeds = [0, 4242, 77, 31337]; let allOk = true, nmlTank = true, home = true, trench = true, det = true, cnt = [];
for (const sd of seeds) {
  T.setMap(sd); const a = JSON.stringify(T.STRUCT.map(s => [s.k, s.x.toFixed(2), s.z.toFixed(2), s.parts.length]));
  T.setMap(sd ? sd + 1 : 5); T.setMap(sd); if (JSON.stringify(T.STRUCT.map(s => [s.k, s.x.toFixed(2), s.z.toFixed(2), s.parts.length])) !== a) det = false;
  cnt.push(T.STRUCT.length); if (T.STRUCT.length < 25) allOk = false;
  if (!T.STRUCT.some(s => s.k === 'tank' && Math.abs(s.z) < 15)) nmlTank = false;
  for (const b of T.SBOX) if (b.st) { if (T.FL.some(t => Math.abs(b.cz - T.trenchC(t, b.cx)) < 4)) trench = false; if (Math.abs(Math.abs(b.cz) - T.HOME_Z) < 10 && Math.abs(b.cx) < 70) home = false; }
}
R.count = cnt; ck('manyStructures', allOk); ck('tankHulksInNoMansLand', nmlTank); ck('notInTrenches', trench); ck('homeCampClear', home); ck('sameEverywhere', det);
T.setMap(0); const terr = T.makeTerrain();
const w = T.SBOX.find(b => b.st && b.mat === 'brick' && b.y1 - b.y0 > 2), mid = (w.y0 + w.y1) / 2;
ck('wallStopsBody', !!T.fortHit(w.cx, w.y0 + .3, w.cz, .3, true));
const t = T.fortSeg(w.cx - w.s * 2, mid, w.cz - w.c * 2, w.cx + w.s * 2, mid, w.cz + w.c * 2); ck('wallStopsBullet', t >= 0 && t <= 1);
const NAV = require('../botai.js')(T, () => terr.H); NAV.rebuild(); NAV.tick(); const f = NAV.field(0, T.HOME_Z - 8, Date.now(), true);
const hull = T.STRUCT.find(q => q.k === 'tank').parts[0], ci = Math.floor(hull.cx + T.W), cj = Math.floor(hull.cz + T.W);   // (a hull: thick enough to cover whole 1 m nav cells) R.navCell = f[cj * T.S + ci]; ck('navAvoidsWall', !(f[cj * T.S + ci] < 1e8));
// server: spawning on a wall moves you clear
process.argv = ['node', 'x', '--port', '8079', '--fill', '2', '--no-fetch', '--data', require('fs').mkdtempSync(require('path').join(require('os').tmpdir(), 't128st-'))]; process.env.T128_TEST = '1';
const S = require('../server.js'), X = S._test;
setTimeout(() => {
  const hut = T.SBOX.find(b => b.st && b.mat === 'brick' && b.y1 - b.y0 > 1.5 && Math.abs(b.cz) > 105), p = { id: 9902, team: hut.cz > 0 ? 0 : 1, bot: false, name: 'P', cls: 'rifleman', w: 'bolt', u: 'bandage', sq: 0, spawnPick: null, usePost: false, xp: 0, ws: null };
  X.spawnEnt(p); const before = [p.x, p.z]; p.x = hut.cx; p.z = hut.cz;   // spawnEnt reads home(); force the spot through a fake home pick
  X.setHome(() => ({ x: hut.cx, z: hut.cz }));
  X.spawnEnt(p); R.spawn = [+p.x.toFixed(1), +p.z.toFixed(1)]; ck('spawnClearOfWalls', !T.fortHit(p.x, p.y, p.z, .3, true));
  console.log(JSON.stringify(R)); const bad = Object.keys(R).filter(k => R[k] === false); console.log(bad.length ? 'FAILED: ' + bad.join(', ') : 'ALL ' + Object.keys(R).filter(k => typeof R[k] === 'boolean').length + ' CHECKS PASSED'); process.exit(bad.length ? 1 : 0);
}, 1500);
