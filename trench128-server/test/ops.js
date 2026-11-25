'use strict';
// In-process test of Operations: tickets, stalls, battalions + regroup, sector falls (fallback, lost posts, forward HQ), defeat, side swap.
process.argv = ['node', 'x', '--port', '8092', '--fill', '6'];
const S = require('../server.js'); const T = require('../shared.js');
const sleep = ms => new Promise(r => setTimeout(r, ms)); const R = {}; const ck = (k, v) => { R[k] = !!v; };
function client(name, team, join) {
  return new Promise(res => {
    const c = { name, msgs: [] }; const ws = new WebSocket('ws://localhost:8092'); ws.binaryType = 'arraybuffer';
    ws.onopen = () => ws.send(JSON.stringify({ t: 'hello', name }));
    ws.onmessage = ev => { if (typeof ev.data !== 'string') return; const m = JSON.parse(ev.data); c.msgs.push(m);
      if (m.t === 'prof') { const e = [...S._test.humans].find(h => h.name === name); e.team = team; ws.send(JSON.stringify({ t: 'join', ...join })); }
      if (m.t === 'w') res(c); };
    c.send = o => ws.send(JSON.stringify(o)); c.ent = () => [...S._test.humans].find(h => h.name === name);
    c.opn = k => c.msgs.some(m => m.t === 'opn' && m.k === k);
  });
}
(async () => {
  const A = await client('OpAtt', 0, { cls: 'rifleman', w: 'bolt', u: 'bandage', sq: 0 });
  const D = await client('OpDef', 1, { cls: 'rifleman', w: 'bolt', u: 'bandage', sq: 0 });
  await sleep(1800); const op = S._test.op, a = A.ent(), d = D.ent();
  ck('blueAttacksFirst', op().att === 0 && op().sector === 0 && op().tk === op().tkMax);
  ck('firstSpawnFree', a.alive && a.died === false);
  const om = A.msgs.filter(m => m.t === 'o').pop(); ck('opInObjectiveMsg', om && Array.isArray(om.op) && om.op[0] === 0 && om.op[9] === 3);
  // a respawn after death costs a ticket
  const tk0 = op().tk; a.hp = 1; S._test.damage(a, 999, d, true); await sleep(5600);
  ck('respawnCostsTicket', a.alive && op().tk <= tk0 - 1);
  // no tickets: the attacker can't respawn and the attack stalls
  op().tk = 0; a.hp = 1; S._test.damage(a, 999, d, true); for (const b of S._test.ents.values()) if (b.team === 0 && b.bot && b.alive) { b.hp = 1; S._test.damage(b, 999, d, true); }
  await sleep(6000);
  ck('stalls', op().stall > 0 || op().bat > 0); ck('stallBanner', A.opn('stall'));
  ck('noRespawnWithoutTickets', !a.alive || op().bat > 0);
  // everyone dead -> battalion lost -> 15 s regroup -> fresh battalion with full tickets and a barrage
  for (let i = 0; i < 40 && op().bat === 0; i++) await sleep(250);
  ck('battalionLost', op().bat === 1 && A.opn('bat'));
  ck('regrouping', op().regroup > 0 && op().tk === 0);
  await sleep((S._test.OPS.regroup + 2) * 1000);
  ck('freshBattalion', op().regroup === 0 && op().tk > op().tkMax - 20 && A.opn('fresh'));
  for (let i = 0; i < 20 && !a.alive; i++) await sleep(250);
  ck('attackerBackAfterRegroup', a.alive);
  // sector falls: defender post in the lost ground removed, defender told to fall back, attackers' HQ moves up
  S._test.posts().push({ id: 8801, team: 1, x: 10, z: -30, y: T.hAt(S._test.terrH(), 10, -30), hp: 300, by: null });
  d.x = 5; d.z = -30; d.y = T.hAt(S._test.terrH(), 5, -30);
  S._test.OB[3].owner = 0; S._test.OB[3].p = 1; S._test.sectorFalls(3); await sleep(300);
  ck('sectorAdvances', op().sector === 1 && op().tk === op().tkMax && A.opn('fall'));
  ck('lostPostRemoved', !S._test.posts().some(q => q.id === 8801));
  ck('defenderToldToFallBack', D.msgs.some(m => m.t === 'oob' && m.s > 0));
  await sleep((S._test.OPS.oobGrace + 1.5) * 1000);
  ck('stayingBehindKills', !d.alive || d.died);
  a.hp = 1; S._test.damage(a, 999, d, true); await sleep(5600);
  ck('forwardHQ', a.alive && Math.abs(a.z - (T.trenchC(S._test.OB[3].t, a.x) + 9)) < 3);
  // two more battalions lost -> defenders win -> next round the sides swap
  S._test.battalionLost(); op().regroup = 0; S._test.battalionLost(); await sleep(400);
  ck('defendersWin', A.msgs.some(m => m.t === 'end' && m.win === 1) && A.opn('lost'));
  for (let i = 0; i < 80 && !A.msgs.some(m => m.t === 'reset'); i++) await sleep(250);
  ck('sidesSwap', op().att === 1 && op().sector === 0 && S._test.OB.map(o => o.owner).join('') === '000111');
  const fail = Object.entries(R).filter(([, v]) => !v).map(([k]) => k); console.log(JSON.stringify(R, null, 1));
  console.log(fail.length ? 'FAILED: ' + fail.join(', ') : 'ALL ' + Object.keys(R).length + ' CHECKS PASSED'); process.exit(fail.length ? 1 : 0);
})().catch(e => { console.log('TEST ERROR', e); process.exit(1); });
