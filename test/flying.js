'use strict';
// v0.33 flyable biplanes, in-process: each side has one parked on its airfield; a player climbs in with [F], throttles up
// and pulls back to take off; the server flies it with the same shared model his screen uses (it answers every tick with
// the state and the last input it applied); the guns fire bullets, the bombsight drops bombs that land where predicted;
// enemy bullets and AA flak hurt it; he can't get out in the air; diving into the ground kills him and wrecks the plane;
// a new plane appears on the strip later; landing on the strip rearms.
process.argv = ['node', 'x', '--port', '8082', '--fill', '2', '--no-fetch', '--data', require('fs').mkdtempSync(require('path').join(require('os').tmpdir(), 't128fl-'))];
process.env.T128_TEST = '1';
const S = require('../server.js'), T = require('../shared.js'), X = S._test;
const sleep = ms => new Promise(r => setTimeout(r, ms)), R = {}, ck = (k, v) => { R[k] = !!v; };
function client(name) { return new Promise(res => { const ws = new WebSocket('ws://localhost:8082'), c = { ws, msgs: [] }; ws.binaryType = 'arraybuffer';
  ws.onopen = () => ws.send(JSON.stringify({ t: 'hello', name, team: 0 })); ws.onmessage = ev => { if (typeof ev.data === 'string') { const m = JSON.parse(ev.data); c.msgs.push(m); if (m.t === 'prof') res(c); } }; }); }
(async () => {
  await sleep(800); const A = await client('Pilot'); A.ws.send(JSON.stringify({ t: 'join', cls: 'rifleman', w: 'bolt', u: 'bandage', sq: 0 })); await sleep(1200);
  const me = [...X.humans].find(p => p.name === 'Pilot'), VE = X.VEHM(), pl = () => VE.planes().find(v => v.team === 0);
  ck('onePlanePerSide', VE.planes().length === 2 && pl().x === T.AIRF[0].x && !pl().air);
  me.x = pl().x + 3; me.z = pl().z; me.y = T.hAt(X.terr().H, me.x, me.z); A.ws.send(JSON.stringify({ t: 'act', a: 'mg' })); await sleep(300);
  ck('climbsIn', me.veh === pl() && A.msgs.some(m => m.t === 'veh' && m.k === 'plane'));
  let seq = me.ack || 0; const send = (n, f, s, bits, yaw, pitch, dt) => { const c = []; for (let i = 0; i < n; i++) c.push([++seq, dt || 16, f, s, bits, yaw, pitch]); A.ws.send(JSON.stringify({ t: 'in', c, rt: X.tickNo() })); };
  const yaw0 = T.AIRF[0].yaw; for (let i = 0; i < 90 && !pl().air; i++) { send(6, 1, 0, 0, yaw0, i > 20 ? .3 : 0); await sleep(100); } R.tookOffAt = +(pl().x).toFixed(0);
  ck('takesOff', pl().air); const pls = A.msgs.filter(m => m.t === 'pls'); ck('stateWithAck', pls.length > 10 && pls[pls.length - 1].a > 0 && pls[pls.length - 1].s.length === 9);
  for (let i = 0; i < 45; i++) { send(6, 1, 0, 0, yaw0, .3); await sleep(100); } R.alt = Math.round(pl().y - T.hAt(X.terr().H, pl().x, pl().z));
  ck('climbs', R.alt > 15);
  // prediction: the client's own flyStep from the acked state matches the server
  { const v = pl(), sim = { x: v.x, y: v.y, z: v.z, yaw: v.yaw, pitch: v.pitch, roll: v.roll, spd: v.spd, thr: v.thr, air: v.air }; for (let i = 0; i < 6; i++) T.flyStep(sim, { dt: .016, f: 1, s: 0, yaw: yaw0 + .3, pitch: .1 }, X.terr().H);
    send(6, 1, 0, 0, yaw0 + .3, .1); await sleep(150); R.predErr = +Math.hypot(sim.x - v.x, sim.y - v.y, sim.z - v.z).toFixed(3); ck('predictionMatches', R.predErr < .01); }
  ck('cantBailInAir', (A.ws.send(JSON.stringify({ t: 'act', a: 'mg' })), await sleep(200), me.veh === pl()));
  const b0 = X.bullets ? X.bullets.length : 0; const s0 = pl().shots || 0; send(12, 1, 0, 8, yaw0, 0); await sleep(150); R.shots = (pl().shots || 0) - s0; ck('gunsFire', R.shots >= 2);   // 192 ms of trigger: two or three rounds
  const sh0 = VE.shells.length, imp = T.bombImpact(pl(), X.terr().H); send(1, 1, 0, 0, yaw0, 0); send(2, 1, 0, 40, yaw0, 0); await sleep(60); ck('bombDropped', pl().bombs === 3 && VE.shells.length > sh0);
  // the bomb lands where the sight said (the plane kept flying; the prediction was taken just before the drop)
  { const n0 = X.craters().length; await sleep(4500); const cr = X.craters().slice(n0).filter(c => typeof c[0] === 'number'); R.bombMiss = cr.length && imp ? +Math.min(...cr.map(c => Math.hypot(c[0] - imp.x, c[1] - imp.z))).toFixed(1) : -1; ck('bombLandsOnSight', R.bombMiss >= 0 && R.bombMiss < 6); }
  // enemy fire and flak
  { const v = pl(), hp0 = v.hp, en = [...X.ents.values()].find(e => e.team === 1); const b = { x: v.x, y: v.y + .3, z: v.z + 1, vx: 0, vy: 0, vz: 1, d: 0, rng: 100, team: 1, by: en, dmg: 30, wk: 'bolt' }; X.bulletStep(b, .001); ck('bulletsHurt', v.hp < hp0);
    const ea = X.AAS.find(a => a.team === 1); const hp1 = v.hp; v.x = ea.x; v.z = ea.z; v.y = 80; v.air = true; for (let i = 0; i < 20; i++) VE.tick(); ck('flakHurts', v.hp < hp1); }
  // dive into the ground
  { const v = pl(); v.y = T.hAt(X.terr().H, v.x, v.z) + 30; v.pitch = -.6; v.spd = 45; for (let i = 0; i < 40 && !v.dead; i++) { send(6, 1, 0, 0, v.yaw, -.75); await sleep(100); }
    ck('crashKills', v.dead && !me.alive && !me.veh); }
  { const v = pl(); v.deadAt -= 61 * 20; VE.tick(); await sleep(100); const n = pl(); ck('respawnsOnStrip', n && n !== v && !n.dead && n.x === T.AIRF[0].x); }
  console.log(JSON.stringify(R)); const bad = Object.keys(R).filter(k => R[k] === false); console.log(bad.length ? 'FAILED: ' + bad.join(', ') : 'ALL ' + Object.keys(R).filter(k => typeof R[k] === 'boolean').length + ' CHECKS PASSED'); process.exit(bad.length ? 1 : 0);
})().catch(e => { console.log('TEST ERROR', e); process.exit(1); });
