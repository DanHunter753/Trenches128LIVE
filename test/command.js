'use strict';
// In-process test of side objectives (flank depots: capture, neutralise, command-point income, bot raiders)
// and the officer's call-ins paid in command points (smoke, gas, recon, rally, over-the-top, not-enough-CP).
const fs = require('fs'), path = require('path');
fs.writeFileSync(path.join(__dirname, '..', 'xp.json'), JSON.stringify({ cmdoff: 800 }));
process.argv = ['node', 'x', '--port', '8094', '--fill', '16'];
const S = require('../server.js'); const T = require('../shared.js');
fs.unlinkSync(path.join(__dirname, '..', 'xp.json'));
const sleep = ms => new Promise(r => setTimeout(r, ms)); const R = {}; const ck = (k, v) => { R[k] = !!v; };
function client(name, team, join) {
  return new Promise(res => {
    const c = { name, msgs: [] }; const ws = new WebSocket('ws://localhost:8094'); ws.binaryType = 'arraybuffer';
    ws.onopen = () => ws.send(JSON.stringify({ t: 'hello', name }));
    ws.onmessage = ev => { if (typeof ev.data !== 'string') return; const m = JSON.parse(ev.data); c.msgs.push(m);
      if (m.t === 'prof') { const e = [...S._test.humans].find(h => h.name === name); e.team = team; ws.send(JSON.stringify({ t: 'join', ...join })); }
      if (m.t === 'w') res(c); };
    c.send = o => ws.send(JSON.stringify(o)); c.ent = () => [...S._test.humans].find(h => h.name === name);
    c.got = (t, f) => c.msgs.filter(m => m.t === t && (!f || f(m))); c.last = t => [...c.msgs].reverse().find(m => m.t === t);
  });
}
const place = (e, x, z) => { e.x = x; e.z = z; e.y = T.hAt(S._test.terrH(), x, z); e.vy = 0; e.cl = null; };
(async () => {
  const O = await client('cmdoff', 0, { cls: 'officer', w: 'carbine', u: 'bandage', sq: 0 });
  const A = await client('cmdA', 0, { cls: 'rifleman', w: 'bolt', u: 'bandage', sq: 0 });
  const D = await client('cmdD', 1, { cls: 'rifleman', w: 'bolt', u: 'bandage', sq: 0 });
  await sleep(2500); const X = S._test, DP = X.DP, a = A.ent(), d = D.ent(), o = O.ent();
  ck('officerDeployed', o && o.cmd);
  const om = A.last('o'); ck('depotsInObjectiveMsg', om && Array.isArray(om.dp) && om.dp.length === 4 && om.dp.every(q => q[0] === -1));
  ck('fourDepotsOnFlanks', T.DEPOTS.length === 4 && T.DEPOTS.every(q => Math.abs(q.x) > 80));
  // bots go for the side objectives
  X.assignRaiders(); const raiders = [...X.ents.values()].filter(e => e.bot && e.depot != null);
  ck('botsAssignedAsRaiders', raiders.length >= 3 && raiders.some(e => e.team === 0) && raiders.some(e => e.team === 1));
  { const b = raiders[0], g = X.goal(b), q = DP[b.depot]; ck('raiderGoalIsDepot', Math.hypot(g.x - q.x, g.z - q.z) < 6); }
  // keep enemy bots off depot 0 for the capture test
  for (const e of X.ents.values()) if (e.bot && e.depot === 0) e.depot = null;
  // capture by standing in it
  const cp0 = X.cmdPts()[0]; DP[0].p = .7; place(a, DP[0].x, DP[0].z); place(d, 0, -100);
  for (let i = 0; i < 40 && DP[0].owner !== 0; i++) { place(a, DP[0].x, DP[0].z); await sleep(200); }
  ck('depotCaptured', DP[0].owner === 0); ck('captureBonusCP', X.cmdPts()[0] >= cp0 + 10); ck('captureAnnounced', A.got('msg', m => /Captured Mill Farm/.test(m.m)).length > 0);
  { const c1 = X.cmdPts()[0]; await sleep(4300); ck('passiveIncome', X.cmdPts()[0] >= c1 + 4); }
  ck('sqsReportsCP', (() => { const m = O.last('sqs'); return m && m.cp >= 0 && m.k.length === 14 && m.inc >= 60 && m.r.length === 14 && m.tr.length === 14; })());
  // the enemy neutralises it
  place(a, 0, 100); DP[0].p = .04; for (let i = 0; i < 10 && DP[0].owner === 0; i++) { place(d, DP[0].x, DP[0].z); await sleep(150); }
  ck('depotNeutralised', DP[0].owner === -1); place(d, 0, -100);
  // call-ins
  X.setCmd(0, 250);
  ck('tier1Only', X.tierOf(0) === 1); O.send({ t: 'cmd', k: 'sup', s: 'gas', x: 20, z: -100 }); await sleep(250); ck('tier2Locked', O.got('msg', m => /Locked: needs requisition tier 2/.test(m.m)).length > 0 && !X.gases.length);
  DP[0].owner = 0; DP[1].owner = 0; DP[0].p = 1; DP[1].p = 1; ck('tier2WithTwoDepots', X.tierOf(0) === 2);
  { const n0 = A.got('smk').length; O.send({ t: 'cmd', k: 'sup', s: 'smoke', x: 0, z: 0, yaw: 0 }); await sleep(300);
    const m = A.got('smk').slice(n0).find(q => q.l.length === 3); ck('smokeThreeClouds', X.smokes.filter(q => Math.hypot(q.x, q.z) < 20).length >= 3 && !!m); }   // (bots throw smoke of their own now)
  await sleep(2100); ck('smokeBlocksSight', X.smokeBlocks(0, 20, 0, -20) && !X.smokeBlocks(60, 20, 60, -20));
  place(d, 20, -100); d.hp = 100; const t0 = Date.now();
  O.send({ t: 'cmd', k: 'sup', s: 'gas', x: 20, z: -100 }); await sleep(300);
  ck('gasAnnounced', A.got('gas').length === 1 && D.got('gas').length === 1);
  await sleep(4200); place(d, 20, -100); ck('gasHurts', d.hp < 100 || !d.alive);
  place(d, 40, -110); d.hp = 100; d.sp[0] = 0;
  O.send({ t: 'cmd', k: 'sup', s: 'recon', x: 40, z: -110 }); await sleep(3800);   // (v0.31: the recon plane has to fly there first)
  ck('reconSpots', d.sp[0] > 0 && A.got('rc').length === 1 && !D.got('rc').length);
  O.send({ t: 'cmd', k: 'sup', s: 'rally', x: 10, z: 60 }); await sleep(300);
  { const rp = X.posts().find(q => q.rally && q.team === 0); ck('rallyPost', !!rp); if (rp) { rp.rally = 1; await sleep(200); ck('rallyExpires', !X.posts().includes(rp)); } }
  O.send({ t: 'cmd', k: 'sup', s: 'whistle', x: 0, z: -48 }); await sleep(300);
  ck('overTheTop', [100, 101, 102].every(k => X.orders[0].has(k) && X.orders[0].get(k).ty === 'attack') && A.got('wh').length === 1);
  const cpNow = X.cmdPts()[0]; ck('callInsCostCP', cpNow <= 250 - 8 - 25 - 10 - 20 - 15 + 25);   // (two depots held: +7 per 4 s meanwhile)
  X.setCmd(0, 0); O.send({ t: 'cmd', k: 'sup', s: 'barrage', x: 0, z: -45 }); await sleep(300);
  ck('needsCommandPoints', O.got('msg', m => /Not enough command points/.test(m.m)).length > 0);
  const bad = Object.entries(R).filter(([, v]) => !v).map(([k]) => k);
  console.log(JSON.stringify(R)); console.log(bad.length ? 'FAILED: ' + bad.join(', ') : 'ALL ' + Object.keys(R).length + ' CHECKS PASSED'); process.exit(bad.length ? 1 : 0);
})().catch(e => { console.log('TEST ERROR', e.stack); process.exit(1); });
