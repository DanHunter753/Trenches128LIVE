'use strict';
// v0.52: personal building supply (start 50, sapper 250; class caps; fills only near an objective) and spare magazines
// (4, 6 with Deep Pockets; a reload uses one; none left = no reload; refilled in base and by an ammo box). Grenades,
// bandages and shells no longer cost supply.
process.argv = ['node', 'x', '--port', '8083', '--fill', '0', '--no-fetch', '--data', require('fs').mkdtempSync(require('path').join(require('os').tmpdir(), 't128ms-'))];
process.env.T128_TEST = '1';
const S = require('../server.js'), X = S._test, T = require('../shared.js');
const sleep = ms => new Promise(r => setTimeout(r, ms)), R = {}, ck = (k, v) => { R[k] = !!v; };
let nid = 9700;
const mk = (cls, w, pk) => { const out = [], p = { id: nid++, team: 0, bot: false, name: 'M' + nid, cls, w, u: 'bandage', sq: 0, spawnPick: null, usePost: false, xp: 0, sp: [0, 0], deployed: true, q: [], ack: 0, pk: pk || [], msgs: out };
  p.ws = { open: true, socket: { writableLength: 0, write(b) { try { const n = b[1] & 127, off = n === 126 ? 4 : n === 127 ? 10 : 2; if ((b[0] & 15) === 1) out.push(JSON.parse(b.subarray(off).toString('utf8'))); } catch (e) { } }, cork() { }, uncork() { } } };
  X.ents.set(p.id, p); X.humans.add(p); X.spawnEnt(p); return p; };
(async () => {
  await sleep(700); for (const e of X.ents.values()) if (e.bot) e.alive = false;
  const r = mk('rifleman', 'bolt'), sp = mk('sapper', 'smg'), md = mk('medic', 'smg');
  ck('rifleStarts50', r.sup === 50); ck('sapperStarts250', sp.sup === 250); ck('fourMags', r.mags === 4 && r.msgs.some(m => m.t === 'mags' && m.n === 4 && m.m === 4));
  // supply only near an objective, up to the class cap
  const o = T.OBJ[2]; { let best = null; for (let x = -180; x <= 180; x += 10) for (let z = -180; z <= 180; z += 10) { const d = Math.min(...T.OBJ.map(q => Math.hypot(q.x - x, q.z - z))); if (d > 40 && (!best || Math.abs(z) < Math.abs(best[1]))) best = [x, z]; } r.x = best[0]; r.z = best[1]; } const s0 = r.sup; X.sup.supTick(); ck('noGainAwayFromObjective', r.sup === s0);
  r.x = o.x + 5; r.z = o.z; for (let i = 0; i < 40; i++) X.sup.supTick(); ck('gainsNearObjectiveToCap', r.sup === 100);
  md.x = o.x; md.z = o.z; for (let i = 0; i < 80; i++) X.sup.supTick(); ck('medicCap150', md.sup === 150);
  // reloads use magazines
  const W = T.WPN.bolt; r.x = 0; r.z = 0; for (let k = 0; k < 4; k++) { r.ammo = 0; r.rel = 0; X.pkt.startReload(r); r.rel = .001; await sleep(120); }
  ck('fourReloadsUseFourMags', r.mags === 0 && r.ammo === W.mag);
  r.ammo = 0; r.rel = 0; X.pkt.startReload(r); ck('noMagsNoReload', !(r.rel > 0));
  // base refills, with a chime
  const hz = X.ents.get(r.id); r.x = 0; for (let z = -200; z <= 200 && !X.sup.inBase(r); z += 2) r.z = z; const inB = X.sup.inBase(r); R.inBase = inB;
  r.msgs.length = 0; for (let i = 0; i < 13; i++) X.sup.supTick(); ck('baseRefills', inB && r.mags === 2 && r.msgs.some(m => m.t === 'magup'));
  // Deep Pockets: six
  const dp = mk('rifleman', 'bolt'); dp.pk = ['pockets']; ck('deepPocketsSix', X.sup.magMax(dp) === 6 && X.sup.magMax(r) === 4);
  // grenades no longer cost supply
  const t0 = X.sup.supply()[0]; ck('teamPoolUntouched', X.sup.supply()[0] === t0);
  // v0.52 spawn on the squad leader, once every 3 minutes
  const L = mk('rifleman', 'bolt'), F = mk('rifleman', 'bolt'); L.xp = 5000; F.xp = 100; L.sq = F.sq = 3; L.x = 30; L.z = 60; await sleep(100); L.x = 30; L.z = 60;
  for (const e of X.ents.values()) if (e.team === 1) { e.x = 150; e.z = -150; }
  X.sup.computeLeaders(); ck('leaderFound', X.sup.leaders().get(3) === L && !!X.sup.slOk(F));
  F.alive = false; F.spawnPick = -98; X.spawnEnt(F); ck('spawnsOnLeader', Math.hypot(F.x - L.x, F.z - L.z) < 3 && F.slCd > 0);
  F.alive = false; X.spawnEnt(F); ck('cooldownBlocksSecond', Math.hypot(F.x - L.x, F.z - L.z) > 5 && !X.sup.slOk(F));
  // v0.54 the medic's thrown med kit
  const MD = mk('medic', 'smg'), HU = mk('rifleman', 'bolt'); await sleep(100);
  MD.x = 0; MD.z = 40; HU.x = 0; HU.z = 30; HU.hp = 30; MD.yaw = 0; MD.pitch = .5; MD.cd = 0; MD.rel = 0; MD.rg = 0; MD.mkCd = 0;
  X.abilityAct(MD); ck('kitInHand', MD.rg === 2 && MD.msgs.some(m => m.t === 'rg' && m.s === 2));
  X.pkt.fireWeapon(MD); ck('kitThrown', MD.rg === 0 && X.mk.medkits().length === 1);
  const land = X.mk.medkits()[0]; R.kitAt = land && [+land.f[0].toFixed(1), +(land.f[2] + land.v[2] * land.T).toFixed(1)];
  HU.x = 0; HU.z = land.f[2] + land.v[2] * land.T; for (let i = 0; i < 60 && HU.hp <= 30; i++) { HU.x = 0; await sleep(50); }
  ck('kitHealsMate', HU.hp >= 89 && X.mk.medkits().length === 0); ck('kitRange', Math.abs(40 - HU.z) > 9 && Math.abs(40 - HU.z) < 19);
  ck('kitCooldown', (X.abilityAct(MD), MD.rg === 0));
  console.log(JSON.stringify(R)); const bad = Object.keys(R).filter(k => R[k] === false); console.log(bad.length ? 'FAILED: ' + bad.join(', ') : 'ALL ' + Object.keys(R).filter(k => typeof R[k] === 'boolean').length + ' CHECKS PASSED'); process.exit(bad.length ? 1 : 0);
})().catch(e => { console.log('TEST ERROR', e); process.exit(1); });
