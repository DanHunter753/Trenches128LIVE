'use strict';
// In-process test (v0.27 smarter bots): grenades into trenches (not at a lone man in the open, never near friends), bayonet
// charges (and the war cry), dugouts under shellfire (call-ins raise the alarm; a creeping barrage only for the enemy),
// bots going down when a medic is near and being revived, dying outright otherwise, players reviving bots, a downed player
// shouting for a medic, bots bandaging themselves, smoke ahead of a push, and the enemiesNear() distance fix.
const fs = require('fs'), path = require('path');
fs.writeFileSync(path.join(__dirname, '..', 'xp.json'), JSON.stringify({ bt27med: 400, bt27off: 900 }));
process.argv = ['node', 'x', '--port', '8085', '--fill', '14']; process.env.T128_WX = 'overcast';
const S = require('../server.js'); const T = require('../shared.js');
fs.unlinkSync(path.join(__dirname, '..', 'xp.json'));
const sleep = ms => new Promise(r => setTimeout(r, ms)); const R = {}; const ck = (k, v) => { R[k] = !!v; };
function client(name, team, join) {
  return new Promise(res => {
    const c = { name, msgs: [] }; const ws = new WebSocket('ws://localhost:8085'); ws.binaryType = 'arraybuffer';
    ws.onopen = () => ws.send(JSON.stringify({ t: 'hello', name }));
    ws.onmessage = ev => { if (typeof ev.data !== 'string') return; const m = JSON.parse(ev.data); c.msgs.push(m);
      if (m.t === 'prof') { const e = [...S._test.humans].find(h => h.name === name); e.team = team; ws.send(JSON.stringify({ t: 'join', ...join })); }
      if (m.t === 'w') res(c); };
    c.send = o => ws.send(JSON.stringify(o)); c.ent = () => [...S._test.humans].find(h => h.name === name);
    c.got = (t, f) => c.msgs.filter(m => m.t === t && (!f || f(m)));
  });
}
(async () => {
  const M = await client('Bt27Med', 0, { cls: 'medic', w: 'carbine', u: 'bandage', sq: 0 });
  const O = await client('Bt27Off', 0, { cls: 'officer', w: 'carbine', u: 'bandage', sq: 0 });
  await sleep(2500); const X = S._test, H = () => X.terrH(), m = M.ent();
  for (let i = 0; i < 20 && !m.alive; i++) await sleep(250);
  X.setSupply(0, 300); X.setSupply(1, 300);
  const bots = t => [...X.ents.values()].filter(e => e.bot && e.team === t && !e.mg && !e.gun);
  const park = () => { for (const e of X.ents.values()) if (e.bot && !e.mg && !e.gun) { e.guard = null; e.depot = null; e.kit = false; e.cls = e.cls === 'medic' ? 'rifleman' : e.cls; e.alive = true; e.down = 0; e.tgt = null; e.hp = 100; e.shelter = null; e.charging = false; const x = (e.team ? -1 : 1) * (60 + (e.id % 20) * 3), z = e.team ? -150 : 150; put(e, x, z); } };
  const put = (e, x, z) => { e.x = x; e.z = z; e.y = T.groundAt(H(), x, z, 99); e.vy = 0; e.climb = null; e.cov = null; };
  park(); put(m, 140, 140); await sleep(150);
  const [b, b2] = bots(0), [d, d2] = bots(1);
  // ---- grenades
  { const t = 30, x = 70, c = T.trenchC(t, x); put(d, x, c); put(b, x, c + 16); await sleep(120); b.climb = null; b.gr = 2; b.tgt = d; b.td = 16; b.seen = null; const g0 = X.BSTAT.nades;
    let threw = false; for (let i = 0; i < 40 && !threw; i++) { b.gCd = 0; threw = X.botGrenade(b); }
    ck('grenadeIntoTrench', threw && X.BSTAT.nades === g0 + 1 && b.gr === 1); }
  { put(d, 60, 128); put(b, 60, 144); b.gr = 2; b.tgt = d; b.td = 16; let threw = false; for (let i = 0; i < 40 && !threw; i++) { b.gCd = 0; threw = X.botGrenade(b); } ck('noGrenadeAtLoneManInOpen', !threw); }
  { const t = 30, x = 70, c = T.trenchC(t, x); put(d, x, c); put(b2, x + 3, c); put(b, x, c + 16); await sleep(120); b.gr = 2; b.tgt = d; b.td = 16; let threw = false; for (let i = 0; i < 40 && !threw; i++) { b.gCd = 0; threw = X.botGrenade(b); } ck('noGrenadeNearFriends', !threw); put(b2, 100, 150); }
  { put(d, 60, 128); put(b, 60, 150); await sleep(120); ck('enemiesNearIsDistance', X.enemiesNear(b, 10).length === 0 && X.enemiesNear(b, 30).length >= 1); }
  // ---- bayonet charge
  { put(d, 30, 132); put(b, 30, 142); d.hp = 100; b.w = 'bolt'; b.tgt = d; b.td = 10; b.supp = 0; b.chgCd = 0; b.yaw = 0; put(m, 36, 140); await sleep(120);
    for (let i = 0; i < 60 && !b.charging; i++) { b.chgCd = 0; X.botChargeStart(b); }
    const z0 = b.z; ck('chargeStarts', b.charging && M.got('cry').length >= 0); await sleep(1200);
    ck('chargeRuns', !b.charging || Math.abs(b.z - z0) > 4); for (let i = 0; i < 20 && d.alive; i++) await sleep(150);
    await sleep(200); ck('warCry', M.got('cry').length >= 1); ck('chargeKills', !d.alive || d.down > 0); }
  park(); await sleep(150);
  // ---- shelter in a dugout under a barrage
  { const r = T.ROOMS.find(q => q.t === 64 && Math.abs(q.xc) < 60); const zr = r.c + 4 * (r.c > 0 ? 1 : -1); put(b, r.xc + 6, r.c); b.tgt = null; b.td = 99;
    X.raiseAlarm(r.xc, r.c, 40, 12, null); const s = X.shelterFor(b); ck('shelterFound', s && s.room === r);
    b.shelter = s; for (let i = 0; i < 40 && T.roomAt(b.x, b.z) !== r; i++) { await sleep(150); } ck('takesShelter', T.roomAt(b.x, b.z) === r && b.y < r.rb); if (!(T.roomAt(b.x, b.z) === r && b.y < r.rb)) console.log('SHDBG', JSON.stringify({ fn: !!b.fortNest, mg: b.mg, sh: !!b.shelter, x: b.x, z: b.z, tgt: !!b.tgt, td: b.td, alive: b.alive, y: b.y, rb: r.rb, fy: r.fy, r: [r.xc, r.c] })); X.alarms.length = 0; b.shelter = null; }
  { const n0 = X.alarms.length, o = O.ent(); X.setCmd(0, 200); X.DP[0].owner = 0; X.DP[2].owner = 0; X.callSupport(o, { s: 'barrage', x: 0, z: -40 }); X.callSupport(o, { s: 'creep', x: 30, z: -40 });
    ck('callInsRaiseAlarm', X.alarms.length >= n0 + 2 && X.alarms.some(a => a.team == null && a.x === 0) && X.alarms.some(a => a.team === 1 && a.x === 30)); X.alarms.length = 0; }
  // ---- downed bots and medics
  park(); await sleep(150);
  { const md = bots(0)[2]; md.kit = true; md.cls = 'medic'; put(md, 20, 150); put(b, 30, 150); b.hp = 50; X.damage(b, 70, d); ck('botGoesDown', b.down > 0 && !b.alive);
    for (let i = 0; i < 60 && !b.alive; i++) await sleep(200); ck('medicBotRevives', b.alive && b.hp > 0 && X.BSTAT.revives >= 1); md.kit = false; md.cls = 'rifleman'; put(md, 100, 150); }
  { put(b2, -100, 150); b2.hp = 50; X.damage(b2, 70, d); ck('noMedicNoDown', !b2.alive && !(b2.down > 0)); }
  { const v = bots(0)[3]; const md = bots(0)[2]; md.kit = true; put(md, 40, 160); put(v, 50, 150); put(m, 51, 150); v.hp = 30; X.damage(v, 60, d); md.kit = false; put(md, 100, 150);
    const xp0 = m.xp; for (let i = 0; i < 40 && !v.alive; i++) { X.reviveAct(m); await sleep(150); } ck('playerRevivesBot', v.alive && m.xp >= xp0 + 15); }
  { const md = bots(0)[4]; md.kit = true; md.rvTgt = null; put(md, 120, 150); put(m, 130, 150); m.hp = 20; X.damage(m, 40, d); await sleep(100); ck('playerDown', m.down > 0);
    M.send({ t: 'act', a: 'ping', k: 'medic' }); await sleep(300); ck('shoutForMedic', md.rvTgt === m && M.got('msg', q => /heard you|coming to you/.test(q.m)).length >= 1);
    for (let i = 0; i < 60 && !m.alive; i++) await sleep(200); ck('botRevivesPlayer', m.alive && M.got('msg', q => /patched you up/.test(q.m)).length >= 1); md.kit = false; }
  // ---- bandage, smoke for the push
  { put(b, 0, 150); b.alive = true; b.hp = 40; b.tgt = null; b.bandaged = false; await sleep(3500); ck('selfBandage', b.hp >= 70 && b.bandaged); }
  { const mem = bots(0).filter(e => e.squad === 0); for (const e of mem) { put(e, (e.id % 10) * 2, 140); e.tgt = null; } const s0 = X.smokes.length; X.SQS()[0][0].smokeAt = 0; X.pushSmoke(0, 0, mem); ck('smokeForPush', X.smokes.length === s0 + 1); }
  console.log(JSON.stringify(R, null, 1));
  const bad = Object.keys(R).filter(k => !R[k]); console.log(bad.length ? 'FAILED: ' + bad.join(', ') : 'ALL ' + Object.keys(R).length + ' CHECKS PASSED'); process.exit(bad.length ? 1 : 0);
})().catch(e => { console.log('TEST ERROR', e); process.exit(1); });
