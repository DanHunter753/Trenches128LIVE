'use strict';
// v0.43 Wake Atoll + Domination: the imported island loads as an 800 m world, both sides spawn on land at their start zones,
// bots head for flags and stay out of deep water, flags change hands by majority, points accrue, and a rally fires when the
// leader passes a mark.
process.argv = ['node', 'x', '--port', '8082', '--fill', '24', '--no-fetch', '--maps', 'wake', '--data', require('fs').mkdtempSync(require('path').join(require('os').tmpdir(), 't128wk-'))];
process.env.T128_TEST = '1';
const S = require('../server.js'), X = S._test, T = require('../shared.js');
const sleep = ms => new Promise(r => setTimeout(r, ms)), R = {}, ck = (k, v) => { R[k] = !!v; };
let nid = 9600;
const mk = (cls, w, team, name) => { const out = [], p = { id: nid++, team: team || 0, bot: false, name: name || cls, cls, w, u: 'bandage', sq: 0, spawnPick: null, usePost: false, xp: 0, ws: null, sp: [0, 0], deployed: true, q: [], ack: 0, msgs: out };
  p.ws = { open: true, socket: { writableLength: 0, write(b) { try { const n = b[1] & 127, off = n === 126 ? 4 : n === 127 ? 10 : 2; if ((b[0] & 15) === 1) out.push(JSON.parse(b.subarray(off).toString('utf8'))); } catch (e) { } }, cork() { }, uncork() { } } };
  X.ents.set(p.id, p); X.humans.add(p); X.spawnEnt(p); return p; };
(async () => {
  await sleep(1500); const H = X.terr().H;
  ck('worldIs800', T.W === 400 && T.N === 800 && T.MP.kind === 'wake' && T.FL.length === 0);
  ck('fiveFlags', T.OBJ.length === 6 && new Set(T.OBJ.map(o => o.n)).size === 5 && T.OBJ[0].n === 'Airfield');
  const d0 = X.domState(); ck('startFlagsHeld', d0 && d0.flags.filter(f => f[1] === 0).length === 1 && d0.flags.filter(f => f[1] === 1).length === 1 && d0.flags.find(f => f[0] === 'Airfield')[1] === 1);
  const a = mk('rifleman', 'bolt', 0, 'Tommy'), b = mk('rifleman', 'bolt', 1, 'Fritz');
  ck('spawnsOnLand', T.hAt(H, a.x, a.z) > .3 && T.hAt(H, b.x, b.z) > .3 && Math.hypot(a.x - (-31.3), a.z - (-185.9)) < 45 && Math.hypot(b.x - 253.6, b.z - 220.5) < 55);
  // deep water is a wall: walk a man off the beach and he stops at wading depth
  const fl = T.OBJ.find(o => o.n === 'Wilkes Landing'); a.x = fl.x; a.z = fl.z; a.y = T.hAt(H, a.x, a.z);
  let yaw = 0, best = -1; for (let k = 0; k < 16; k++) { const y = k / 16 * Math.PI * 2, x = a.x - Math.sin(y) * 40, z = a.z - Math.cos(y) * 40; const h = T.hAt(H, x, z); if (h < best || best < 0 && h < 0) { if (h < 0 && (best < 0 || h < best)) { best = h; yaw = y; } } }
  for (let i = 0; i < 60 * 8; i++) T.step(a, { dt: 1 / 60, f: 1, s: 0, bits: 1, yaw }, H, 1);
  R.wadeDepth = +T.hAt(H, a.x, a.z).toFixed(2); ck('stopsAtWadingDepth', T.hAt(H, a.x, a.z) >= T.SEA_WADE - .05 && T.hAt(H, a.x, a.z) < .5);
  ck('navBlocksDeepWater', !X.navPassable(0, 0) && X.navPassable(fl.x, fl.z));
  // bots go for flags and stay out of the deep
  await sleep(25000);
  const bots = [...X.ents.values()].filter(e => e.bot && e.alive), deep = bots.filter(e => T.hAt(H, e.x, e.z) < T.SEA_WADE - .3).length, moving = bots.filter(e => e.goal || e.nav || true).length;
  const F = T.OBJ.slice(0, 5), atF = bots.filter(e => F.some(o => Math.hypot(e.x - o.x, e.z - o.z) < 30)).length;
  R.bots = { n: bots.length, deep, atFlags: atF }; ck('botsStayOutOfDeepWater', deep <= 1); ck('botsReachFlags', atF >= 6);
  // capture: three blue men at a neutral flag take it in about 20 s; the score ticks for the holders
  const ds0 = X.domState().flags; let nf = ds0.findIndex(f => f[1] < 0); if (nf < 0) nf = ds0.findIndex(f => f[1] === 1); const o = T.OBJ[nf]; const men = [0, 1, 2].map(i => { const m = mk('rifleman', 'bolt', 0, 'Cap' + i); m.x = o.x + i; m.z = o.z; m.y = T.hAt(H, m.x, m.z); m.hp = 1e9; return m; });
  const shoo = () => { for (const e of X.ents.values()) if (e.bot && e.team === 1 && Math.hypot(e.x - o.x, e.z - o.z) < 24) { e.alive = false; e.rt = 60; } };
  const s0 = X.domState().score.slice(); for (let i = 0; i < 20; i++) { shoo(); await sleep(2000); } const d1 = X.domState();
  R.cap = [ds0[nf], d1.flags[nf]]; ck('majorityCaptures', d1.flags[nf][1] === 0);
  ck('scoreTicks', d1.score[0] > s0[0] || d1.score[1] > s0[1]);
  // rally: push blue to 25 with red behind -> red gets a rally (supply up, bots respawn, paratroops ordered)
  const sup1 = X.supplyOf(1); X.domSet({ score: [24, 3] }); await sleep(9000); const d2 = X.domState();
  R.rally = { score: d2.score, mk: d2.mk, sup: [sup1, X.supplyOf(1)] }; ck('rallyAt25', d2.mk[1] >= 1 && X.supplyOf(1) >= sup1 + 20);
  console.log(JSON.stringify(R)); const bad = Object.keys(R).filter(k => R[k] === false); console.log(bad.length ? 'FAILED: ' + bad.join(', ') : 'ALL ' + Object.keys(R).filter(k => typeof R[k] === 'boolean').length + ' CHECKS PASSED'); process.exit(bad.length ? 1 : 0);
})().catch(e => { console.log('TEST ERROR', e); process.exit(1); });
