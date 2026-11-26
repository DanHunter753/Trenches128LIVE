'use strict';
// v0.31 wrecked guns, in-process: an enemy grenade/shell knocks out a trench MG nest (gunner thrown off, XP, event to
// clients), a friendly one doesn't; holding E beside the wreck repairs it (a sapper in about 8 s, a rifleman more slowly);
// unrepaired nests come back on their own; field guns are repaired the same way; anti-tank rounds wreck guns.
process.argv = ['node', 'x', '--port', '8074', '--fill', '4', '--no-fetch', '--data', require('fs').mkdtempSync(require('path').join(require('os').tmpdir(), 't128wr-'))];
process.env.T128_TEST = '1';
const S = require('../server.js'), T = require('../shared.js'), X = S._test;
const sleep = ms => new Promise(r => setTimeout(r, ms)), R = {}, ck = (k, v) => { R[k] = !!v; };
function client(name, team) { return new Promise(res => { const ws = new WebSocket('ws://localhost:8074'), c = { ws, msgs: [] }; ws.binaryType = 'arraybuffer';
  ws.onopen = () => ws.send(JSON.stringify({ t: 'hello', name, team })); ws.onmessage = ev => { if (typeof ev.data === 'string') { const m = JSON.parse(ev.data); c.msgs.push(m); if (m.t === 'prof') res(c); } }; }); }
(async () => {
  await sleep(500);
  const A = await client('Sapper', 0); A.ws.send(JSON.stringify({ t: 'join', cls: 'sapper', w: 'carbine', u: 'bandage', sq: 1 })); await sleep(700);
  const me = [...X.humans].find(p => p.name === 'Sapper'); const n0 = X.NESTS.findIndex((n, i) => n.team === 0 && i < 6), nest = X.NESTS[n0];
  const enemy = [...X.ents.values()].find(e => e.team === 1 && e.alive) || { team: 1, bot: true, id: -1 };
  // a friendly grenade in the nest does nothing
  X.explode(nest.x + .5, nest.z, me, 1); ck('friendlyNoWreck', !nest.dead);
  // put the sapper on the gun, then an enemy grenade lands in the nest
  me.x = nest.x; me.z = nest.z; A.ws.send(JSON.stringify({ t: 'act', a: 'mg' })); await sleep(400); const wasOn = me.mg === nest.idx;
  X.explode(nest.x + .4, nest.z + .3, enemy, 1); await sleep(200);
  ck('enemyWrecks', nest.dead); ck('gunnerThrownOff', wasOn && me.mg == null); ck('clientsTold', A.msgs.some(m => m.t === 'nd' && m.i === n0 && m.d === 1));
  A.ws.send(JSON.stringify({ t: 'act', a: 'mg' })); await sleep(300); ck('cantMountWreck', me.mg == null);
  // repair by hand: a sapper holding E (work every 0.2 s) for about 8 s
  R.joinedAs = me.cls; me.cls = 'sapper';   /* (sappers need a rank; this test player has none) */
  me.alive = true; me.x = nest.x + 1; me.z = nest.z; let t = 0; while (nest.dead && t < 12000) { A.ws.send(JSON.stringify({ t: 'act', a: 'work' })); await sleep(200); t += 200; me.x = nest.x + 1; me.z = nest.z; }
  { const w = A.msgs.filter(m => m.t === 'wk'); R.wkMsgs = w.length; R.lastP = w.length ? +w[w.length - 1].p.toFixed(2) : 0; R.fix = nest.fix; R.dist = +Math.hypot(me.x - nest.x, me.z - nest.z).toFixed(2); R.alive = me.alive; R.mg = me.mg; }
  R.sapperSeconds = +(t / 1000).toFixed(1); ck('sapperRepairs', !nest.dead && t >= 6000 && t <= 11000); ck('repairToldClients', A.msgs.some(m => m.t === 'nd' && m.i === n0 && m.d === 0)); ck('repairProgressShown', A.msgs.some(m => m.t === 'wk' && /machine gun/.test(m.n)));
  // left alone, a wreck comes back after its timer
  X.nestWreck(n0, enemy); nest.fixAt = X.tickNo(); X.nestAutofix(); ck('autofix', !nest.dead);
  // field gun: wrecked by an enemy shell, repaired by hand
  const gun = X.VEHM().V.find(v => v.k === 'fgun' && v.team === 0); for (let k = 0; k < 4 && !gun.dead; k++) X.explode(gun.x, gun.z, enemy, 1); ck('gunWrecked', gun.dead);
  me.x = gun.x + 1.5; me.z = gun.z; t = 0; while (gun.dead && t < 12000) { A.ws.send(JSON.stringify({ t: 'act', a: 'work' })); await sleep(200); t += 200; me.x = gun.x + 1.5; me.z = gun.z; }
  ck('gunRepaired', !gun.dead && gun.hp === gun.hpMax);
  // a rifleman repairs more slowly (about 20 s)
  me.cls = 'rifleman'; X.nestWreck(n0, enemy); me.x = nest.x + 1; me.z = nest.z; t = 0; while (nest.dead && t < 26000) { A.ws.send(JSON.stringify({ t: 'act', a: 'work' })); await sleep(200); t += 200; me.x = nest.x + 1; me.z = nest.z; }
  R.riflemanSeconds = +(t / 1000).toFixed(1); ck('riflemanSlower', !nest.dead && t >= 16000);
  // anti-tank rifle rounds hurt guns
  const hp0 = gun.hp; X.VEHM().bulletHit({ wk: 'atr', by: enemy }, gun.x + .3, gun.y + 1, gun.z); ck('atrHurtsGun', gun.hp < hp0);
  console.log(JSON.stringify(R)); const bad = Object.keys(R).filter(k => R[k] === false); console.log(bad.length ? 'FAILED: ' + bad.join(', ') : 'ALL ' + Object.keys(R).filter(k => typeof R[k] === 'boolean').length + ' CHECKS PASSED'); process.exit(bad.length ? 1 : 0);
})().catch(e => { console.log('TEST ERROR', e); process.exit(1); });
