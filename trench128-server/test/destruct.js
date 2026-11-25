'use strict';
// In-process test (v0.27): heavy shells blow trench bays in. Terrain fill, sandbags gone, men buried, once per bay, protected
// bays (dugouts, gaps, objectives) never; grenades and mortar bombs never; the crater log replays to an identical terrain.
process.argv = ['node', 'x', '--port', '8086', '--fill', '6']; process.env.T128_WX = 'overcast';
const S = require('../server.js'); const T = require('../shared.js');
const sleep = ms => new Promise(r => setTimeout(r, ms)); const R = {}; const ck = (k, v) => { R[k] = !!v; };
(async () => {
  await sleep(2500); const X = S._test, H = () => X.terrH();
  const officer = { id: 0, team: 0, cmd: true, bot: false, name: 'arty' }, soldier = [...X.ents.values()].find(e => e.bot && e.team === 0);
  // a free bay on green's front line (t = -30), away from dugouts, gaps and objectives
  let cell = -1; for (let c = 3; c < 32; c++) if (T.bayOK(-30, c)) { cell = c; break; }
  const xc = cell * 9 - T.W + 4.5, zc = T.trenchC(-30, xc), h0 = T.hAt(H(), xc, zc + .3 * T.sgn(-30));
  ck('foundBay', cell >= 0);
  for (let i = 0; i < 20; i++) X.explode(xc + 1, zc, soldier, 1);   // grenades: never
  for (let i = 0; i < 20; i++) X.explode(xc + 1, zc, officer, .75, 'shell');   // mortar bombs: never
  ck('grenadesAndMortarsDont', !T.BAYS.has(-30 * 1000 + cell));
  const sb = T.SB.filter(b => b.t === -30 && b.cell === cell);
  const man = [...X.ents.values()].find(e => e.bot && e.team === 1 && !e.mg); man.alive = true; man.guard = null; man.hp = 100; man.x = xc + 2; man.z = zc; man.y = T.hAt(H(), xc + 2, zc);
  const y0 = man.y;
  for (let i = 0; i < 30 && !T.BAYS.has(-30 * 1000 + cell); i++) X.blowBay(xc, zc, officer);
  const h1 = T.hAt(H(), xc, zc + .3 * T.sgn(-30));
  ck('bayCollapses', T.BAYS.has(-30 * 1000 + cell) && h1 > h0 + .6);
  ck('sandbagsGone', sb.length > 0 && sb.every(b => b.gone) && !T.sbHit(H(), sb[0].x, T.hAt(H(), sb[0].x, sb[0].z) + .3, sb[0].z));
  ck('manBuried', man.y > y0 + .5 && man.hp < 100);
  ck('loggedOnce', X.craters().filter(c => c[0] === 'b' && c[1] === -30 && c[2] === cell).length === 1);
  { const n = X.craters().length; for (let i = 0; i < 10; i++) X.blowBay(xc, zc, officer); ck('oncePerBay', X.craters().length === n); }
  { let room = T.ROOMS.find(r => r.t === 30), c2 = Math.floor((room.xc + T.W) / 9); ck('dugoutBaysProtected', !T.bayOK(30, c2)); }
  { const gc = Math.floor((T.GAPS[0] + T.W) / 9); ck('gapBaysProtected', !T.bayOK(30, gc) && !T.bayOK(-30, gc)); }
  // field-gun shell bursting in another bay
  let c3 = -1; for (let c = cell + 2; c < 34; c++) if (T.bayOK(-30, c)) { c3 = c; break; }
  { const x3 = c3 * 9 - T.W + 4.5, z3 = T.trenchC(-30, x3); for (let i = 0; i < 30 && !T.BAYS.has(-30 * 1000 + c3); i++) X.explode(x3, z3, soldier, 1, 'shell'); ck('fieldGunShellCan', T.BAYS.has(-30 * 1000 + c3)); }
  // replaying the crater log on a fresh terrain gives the server's terrain exactly (what a late joiner does)
  { const bays = new Set(T.BAYS), gone = T.SB.map(b => b.gone); T.resetBays(); const t2 = T.makeTerrain(); for (const c of X.craters()) T.applyEv(t2, c);
    const a = H(), b = t2.H; let diff = 0; for (let i = 0; i < a.length; i++) diff = Math.max(diff, Math.abs(a[i] - b[i]));
    ck('replayIdentical', diff < 1e-5 && T.BAYS.size === bays.size && T.SB.every((q, i) => q.gone === gone[i])); }
  console.log(JSON.stringify(R, null, 1));
  const bad = Object.keys(R).filter(k => !R[k]); console.log(bad.length ? 'FAILED: ' + bad.join(', ') : 'ALL ' + Object.keys(R).length + ' CHECKS PASSED'); process.exit(bad.length ? 1 : 0);
})().catch(e => { console.log('TEST ERROR', e); process.exit(1); });
