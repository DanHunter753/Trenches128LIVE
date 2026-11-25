'use strict';
// In-process test of the RTS officer layer: fog of war, squad morale (break, fall back, rally), order queues,
// creeping barrage (+ squads advance behind it), requisition tiers, spotter marks (discount, XP), strike warnings, alerts.
const fs = require('fs'), path = require('path');
fs.writeFileSync(path.join(__dirname, '..', 'xp.json'), JSON.stringify({ rtsoff: 800 }));
process.argv = ['node', 'x', '--port', '8095', '--fill', '16'];
const S = require('../server.js'); const T = require('../shared.js');
fs.unlinkSync(path.join(__dirname, '..', 'xp.json'));
const sleep = ms => new Promise(r => setTimeout(r, ms)); const R = {}; const ck = (k, v) => { R[k] = !!v; };
function client(name, team, join) {
  return new Promise(res => {
    const c = { name, msgs: [] }; const ws = new WebSocket('ws://localhost:8095'); ws.binaryType = 'arraybuffer';
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
  const O = await client('rtsoff', 0, { cls: 'officer', w: 'carbine', u: 'bandage', sq: 0 });
  const A = await client('rtsA', 0, { cls: 'rifleman', w: 'bolt', u: 'bandage', sq: 0 });
  const D = await client('rtsD', 1, { cls: 'rifleman', w: 'bolt', u: 'bandage', sq: 0 });
  await sleep(2500); const X = S._test, a = A.ent(), d = D.ent();
  // fog of war: an enemy far from every friendly soldier is hidden from the officer, close to one he shows
  for (const e of X.ents.values()) if (e.bot && e.team === 0) { e.alive = false; e.rt = 999; }
  place(a, -100, 100); place(d, 100, -100); d.sp[0] = 0; X.visTick(); ck('fogHidesEnemy', !X.vis[0].has(d.id));
  place(a, 100, -70); d.sp[0] = 0; await sleep(300); X.visTick(); ck('fogRevealsNearFriendly', X.vis[0].has(d.id));
  place(a, -100, 100); for (const e of X.ents.values()) if (e.bot && e.team === 0) { e.rt = .3; }
  await sleep(2500);
  // morale: a squad that drops below 25 breaks, falls back and is reported; a boost rallies it
  { X.moraleTick(); const m = X.sqmOf(0, 100); m.m = 10; X.moraleTick(); const b = [...X.ents.values()].find(e => e.bot && e.team === 0 && e.squad === 0 && e.alive && !e.mg && !e.fortNest);
    ck('squadBreaks', m.broken && O.got('al', q => q.k === 'broken').length === 0 ? true : m.broken); await sleep(200);
    ck('brokenAlert', O.got('al', q => q.k === 'broken').length > 0);
    if (b) { b.guard = null; b.depot = null; b.hold = null; const g = X.goal(b); ck('brokenFallsBack', g.line && g.z > g.line.z + 3); } else ck('brokenFallsBack', false);
    X.moraleBoost(0, 60); ck('rallied', !m.broken && m.m >= 55); }
  // order queue: attack, then (shift) move; when the first is done the next takes over
  O.send({ t: 'cmd', k: 'order', sq: 100, ty: 'attack', x: 0, z: -60 }); await sleep(400);
  O.send({ t: 'cmd', k: 'order', sq: 100, ty: 'move', x: 40, z: 10, q: 1 }); await sleep(400);
  { const o = X.orders[0].get(100); ck('orderQueued', o && o.ty === 'attack' && o.q.length === 1);
    ck('queueSentToOfficer', (O.last('ords').l.find(r => r[0] === 100) || [])[6].length === 1);
    o.done = true; X.aiOrderTick(0); const n = X.orders[0].get(100); ck('queueAdvances', n.ty === 'move' && Math.abs(n.x - 40) < 1 && n.q.length === 0); }
  // tiers
  X.setCmd(0, 250); ck('tier1', X.tierOf(0) === 1);
  O.send({ t: 'cmd', k: 'sup', s: 'creep', x: 0, z: 30, sqs: [100, 101] }); await sleep(250); ck('creepLockedAtTier1', O.got('msg', m => /Locked/.test(m.m)).length > 0);
  X.DP[0].owner = 0; X.DP[1].owner = 0; ck('tier2', X.tierOf(0) === 2);
  const sw0 = A.got('sw').length;
  O.send({ t: 'cmd', k: 'sup', s: 'creep', x: 0, z: 30, sqs: [100, 101] }); await sleep(300);
  { const o = X.orders[0].get(101); ck('creepOrdersSquadsBehind', o && o.ty === 'attack' && o.n === 'behind the barrage' && o.z < 30 && o.at > 0);
    const w = A.got('sw').slice(sw0).find(m => m.k === 'creep'); ck('creepWarnsSoldiers', w && w.dz === -1 && w.len === 30 && w.d === 3 && !D.got('sw').length); }
  O.send({ t: 'cmd', k: 'sup', s: 'heavy', x: 0, z: -60 }); await sleep(250); ck('heavyLockedAtTier2', O.got('msg', m => /tier 3/.test(m.m)).length > 0);
  for (const q of X.DP) q.owner = 0; ck('tier3', X.tierOf(0) === 3);
  O.send({ t: 'cmd', k: 'sup', s: 'heavy', x: 0, z: -60 }); await sleep(300); ck('heavyFires', A.got('sw', m => m.k === 'heavy').length === 1);
  // spotter mark: look at the ground ahead and mark it; a barrage there is 30% cheaper, tighter and pays the spotter
  place(a, 0, 40); a.yaw = 0; a.pitch = -.25; a.markCd = 0; A.send({ t: 'act', a: 'mark' }); await sleep(300);
  const mk = X.marks.find(q => q.team === 0); ck('markCreated', !!mk && mk.z < 40 && mk.z > 25);
  ck('markShownToTeam', A.got('mk').length === 1 && O.got('mk').length === 1 && !D.got('mk').length); ck('markAlert', O.got('al', q => q.k === 'mark').length === 1);
  { X.setCmd(0, 200); const xp0 = a.xp || 0; O.send({ t: 'cmd', k: 'sup', s: 'barrage', x: mk.x + 6, z: mk.z, }); await sleep(300); const diff = 200 - X.cmdPts()[0];
    ck('markDiscount', diff === 11 || diff === 4); ck('spotterXp', (a.xp || 0) >= xp0 + 10);
    const w = A.got('sw', m => m.k === 'barrage').pop(); ck('markTightens', w && Math.abs(w.r - 6.5) < .01 && Math.abs(w.x - mk.x) < .1); }
  ck('sqsCards', (() => { const m = O.last('sqs'); const r = m && m.l.find(q => q[0] === 100); return r && r.length >= 13 && typeof r[5] === 'number' && m.tier === 3 && Array.isArray(m.mk); })());
  const bad = Object.entries(R).filter(([, v]) => !v).map(([k]) => k);
  console.log(JSON.stringify(R)); console.log(bad.length ? 'FAILED: ' + bad.join(', ') : 'ALL ' + Object.keys(R).length + ' CHECKS PASSED'); process.exit(bad.length ? 1 : 0);
})().catch(e => { console.log('TEST ERROR', e.stack); process.exit(1); });
