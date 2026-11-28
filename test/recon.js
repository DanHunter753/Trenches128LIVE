'use strict';
// In-process test of the recon / sniper class: loadout rules, scoped headshots kill outright (body shots don't),
// other classes' headshots unchanged, spotting (T): cone spot for the team + officer mark, cooldown, passive scoped spotting,
// spot-assist XP, bot snipers in the mix.
const fs = require('fs'), path = require('path');
fs.writeFileSync(path.join(__dirname, '..', 'xp.json'), JSON.stringify({ recona: 150, reconb: 150 }));
process.argv = ['node', 'x', '--port', '8090', '--fill', '6'];
const S = require('../server.js'); const T = require('../shared.js');
fs.unlinkSync(path.join(__dirname, '..', 'xp.json'));
const sleep = ms => new Promise(r => setTimeout(r, ms)); const R = {}; const ck = (k, v) => { R[k] = !!v; };
function client(name, team, join) {
  return new Promise(res => {
    const c = { name, msgs: [] }; const ws = new WebSocket('ws://localhost:8090'); ws.binaryType = 'arraybuffer';
    ws.onopen = () => ws.send(JSON.stringify({ t: 'hello', name }));
    ws.onmessage = ev => { if (typeof ev.data !== 'string') { if (new Uint8Array(ev.data)[0] === 4) return;   // binary tracer frame (v0.23)
 const d = (c.dec || (c.dec = require('./snapdec.js')())).feed(ev.data); c.ids = new Set(d.ents.keys()); c.snaps = (c.snaps || 0) + 1; return; } const m = JSON.parse(ev.data); c.msgs.push(m);
      if (m.t === 'prof') { const e = [...S._test.humans].find(h => h.name === name); e.team = team; ws.send(JSON.stringify({ t: 'join', ...join })); }
      if ((m.t === 'w' || m.t === 'snapReset') && c.dec) c.dec.reset();
      if (m.t === 'w') res(c); };
    c.send = o => ws.send(JSON.stringify(o)); c.ent = () => [...S._test.humans].find(h => h.name === name);
    c.got = (t, f) => c.msgs.filter(m => m.t === t && (!f || f(m)));
  });
}
const place = (e, x, y, z) => { e.x = x; e.y = y; e.z = z; e.vy = 0; e.cl = null; e.pitch = 0; };
const yawTo = (a, b) => Math.atan2(-(b.x - a.x), -(b.z - a.z));
(async () => {
  ck('loadoutRules', T.fixLoadout(150, { cls: 'recon', w: 'sniper', u: 'bandage' }).w === 'sniper' && T.fixLoadout(0, { cls: 'recon', w: 'sniper' }).cls === 'rifleman' && T.fixLoadout(5000, { cls: 'rifleman', w: 'mark' }).w === 'bolt');
  const A = await client('ReconA', 0, { cls: 'recon', w: 'sniper', u: 'bandage', sq: 0 });
  const B = await client('ReconB', 0, { cls: 'recon', w: 'sniper', u: 'bandage', sq: 0 });
  const D = await client('Target', 1, { cls: 'rifleman', w: 'bolt', u: 'bandage', sq: 0 });
  await sleep(1500); const X = S._test, a = A.ent(), b = B.ent(), d = D.ent();
  for (let i = 0; i < 20 && !(a.alive && d.alive); i++) await sleep(250);
  ck('reconSpawned', a.cls === 'recon' && a.w === 'sniper' && a.hp === 90);
  // scoped headshot from 60 m: dead outright, no knockdown
  const shoot = (who, wk, h) => { place(who, 140, 60, 30); place(d, 140, 60, -30); const aim = Math.atan2((d.y + h) - (who.y + 1.6), 60); X.fireBullet(who, who.x, who.y + 1.6, who.z, yawTo(who, d), aim, 230, T.WPN[wk].dmg, wk, T.WPN[wk].vel, T.WPN[wk].sw); };
  d.hp = 100; shoot(a, 'sniper', 1.75); await sleep(400);
  ck('scopedHeadshotKills', !d.alive && !(d.down > 0)); ck('headshotMarker', A.got('hm').some(m => m.h === 1 && m.k === 1));
  for (let i = 0; i < 40 && !d.alive; i++) await sleep(250);
  d.hp = 100; shoot(a, 'sniper', 1.1); await sleep(400); ck('bodyShotNotInstant', !d.alive && d.down > 0);   // v0.49: a sniper body shot (100) downs a player: no instant kill, but he's out of the fight
  d.down = .05; for (let i = 0; i < 40 && !d.alive; i++) await sleep(250);
  d.hp = 100; a.cls = 'rifleman'; shoot(a, 'carbine', 1.75); await sleep(400); a.cls = 'recon'; ck('otherClassHeadshotUnchanged', d.alive && d.hp === 66);
  for (let i = 0; i < 40 && !d.alive; i++) await sleep(250);
  // spotting: look at the enemy and press T
  place(a, 140, 60, 30); place(d, 141, 60, -10); d.hp = 100; d.sp[0] = 0; a.yaw = yawTo(a, d); a.pitch = Math.atan2(d.y + 1.2 - (a.y + 1.65), 40); a.spotCd = 0; a.markCd = 0;
  A.send({ t: 'act', a: 'mark' }); await sleep(250);
  ck('spotsEnemy', d.sp[0] > 0 && d.spBy === a && A.got('spt').length === 1);
  ck('spotMarksForOfficer', A.got('mk').length === 1 && B.got('mk').length === 1 && !D.got('mk').length);
  A.send({ t: 'act', a: 'mark' }); await sleep(250); ck('spotCooldown', A.got('spt').length === 1);
  // passive spotting while scoped
  d.sp[0] = 0; a.ads = true; await sleep(800); ck('passiveScopedSpot', d.sp[0] > 0); a.ads = false;
  // spot assist: a teammate kills the spotted enemy
  d.sp[0] = 1e9; d.spBy = a; const xp0 = a.xp; X.damage(d, 999, b, true); await sleep(200);
  ck('spotAssistXp', a.xp >= xp0 + 5 && A.got('msg', m => /Spot assist/.test(m.m)).length === 1);
  // bots: snipers in the mix, look byte carries class 6 / weapon 6
  // a scoped recon is sent enemies out to 240 m (others stop at 100 m)
  for (let i = 0; i < 40 && !d.alive; i++) await sleep(250);
  place(a, 0, 60, 120); place(b, 0, 60, 118); place(d, 0, 60, -60); d.hp = 100; a.ads = true; b.ads = false; b.cls = 'rifleman';
  let seenA = 0, seenB = 0; for (let i = 0; i < 20; i++) { await sleep(60); if (A.ids && A.ids.has(d.id)) seenA++; if (B.ids && B.ids.has(d.id)) seenB++; }
  ck('scopedReconSeesFar', seenA > 0 && seenB === 0); a.ads = false; b.cls = 'recon';
  const bad = Object.entries(R).filter(([, v]) => !v).map(([k]) => k);
  console.log(JSON.stringify(R)); console.log(bad.length ? 'FAILED: ' + bad.join(', ') : 'ALL ' + Object.keys(R).length + ' CHECKS PASSED'); process.exit(bad.length ? 1 : 0);
})().catch(e => { console.log('TEST ERROR', e.stack); process.exit(1); });
