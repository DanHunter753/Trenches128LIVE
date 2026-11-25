'use strict';
// In-process test (v0.25): kill feed (who / weapon / range-limited for bot kills), bot names, assists, scoreboard on request,
// after-action report, quick-chat pings (team only, rate limit, artillery request reaches the officer), gas masks (put-on time,
// 90% less gas damage, no ADS), smoke / gas utility grenades.
const fs = require('fs'), path = require('path');
fs.writeFileSync(path.join(__dirname, '..', 'xp.json'), JSON.stringify({ cmsa: 400, cmsb: 400, cmsoff: 800 }));
process.argv = ['node', 'x', '--port', '8088', '--fill', '10'];
const S = require('../server.js'); const T = require('../shared.js');
fs.unlinkSync(path.join(__dirname, '..', 'xp.json'));
const sleep = ms => new Promise(r => setTimeout(r, ms)); const R = {}; const ck = (k, v) => { R[k] = !!v; };
function client(name, team, join) {
  return new Promise(res => {
    const c = { name, msgs: [] }; const ws = new WebSocket('ws://localhost:8088'); ws.binaryType = 'arraybuffer';
    ws.onopen = () => ws.send(JSON.stringify({ t: 'hello', name }));
    ws.onmessage = ev => { if (typeof ev.data !== 'string') return; const m = JSON.parse(ev.data); c.msgs.push(m);
      if (m.t === 'prof') { const e = [...S._test.humans].find(h => h.name === name); e.team = team; ws.send(JSON.stringify({ t: 'join', ...join })); }
      if (m.t === 'w') res(c); };
    c.send = o => ws.send(JSON.stringify(o)); c.ent = () => [...S._test.humans].find(h => h.name === name);
    c.got = (t, f) => c.msgs.filter(m => m.t === t && (!f || f(m)));
  });
}
const place = (e, x, y, z) => { e.x = x; e.y = y; e.z = z; e.vy = 0; e.cl = null; e.pitch = 0; };
(async () => {
  const A = await client('CmsA', 0, { cls: 'rifleman', w: 'bolt', u: 'smokenade', sq: 0 });
  const B = await client('CmsB', 0, { cls: 'rifleman', w: 'carbine', u: 'gasnade', sq: 0 });
  const D = await client('CmsD', 1, { cls: 'rifleman', w: 'bolt', u: 'bandage', sq: 0 });
  const O = await client('CmsOff', 0, { cls: 'officer', w: 'carbine', u: 'bandage', sq: 0 });
  await sleep(2000); const X = S._test, a = A.ent(), b = B.ent(), d = D.ent();
  for (let i = 0; i < 20 && !(a.alive && b.alive && d.alive); i++) await sleep(250);
  ck('botNames', [...X.ents.values()].filter(e => e.bot).every(e => /^(Sdt\.|Gefr\.|Can\.|Kan\.) \S|^(Tank|Panzer) crew$/.test(e.bname)));
  // assist + kill feed
  place(a, 120, 60, 40); place(b, 122, 60, 40); place(d, 120, 60, 10); d.hp = 100;
  X.damage(d, 30, b); X.damage(d, 200, a, false); await sleep(250);
  const kf = D.got('kf').find(m => m.v === 'CmsD');
  ck('killFeed', kf && kf.a === 'CmsA' && kf.at === 0 && kf.vt === 1 && kf.w === 'bolt' && A.got('kf').length >= 1);
  ck('assistCounted', X.st(b).a === 1 && X.st(a).k === 1 && X.st(d).d === 1);
  // a bot-on-bot kill far from every player isn't sent to anyone
  { place(a, 140, 60, 140); place(b, 140, 60, 138); place(d, -140, 60, -140); const n0 = A.got('kf').length; const v = [...X.ents.values()].find(e => e.bot && e.team === 1 && e.alive), k = [...X.ents.values()].find(e => e.bot && e.team === 0 && e.alive);
    place(v, -140, 60, 120); X.damage(v, 999, k); await sleep(200); ck('farBotKillNotSent', A.got('kf').length === n0); }
  // scoreboard on request
  A.send({ t: 'sbq' }); await sleep(250); { const m = A.got('sb').pop(); const row = m && m.s[0].l.find(r => r[0] === 'CmsA'); ck('scoreboard', row && row[4] === 1 && row[9] === 1 && m.s[0].k >= 1 && m.s[1].d >= 1); }
  A.send({ t: 'sbq' }); A.send({ t: 'sbq' }); await sleep(200); ck('scoreboardRateLimited', A.got('sb').length === 1);
  // quick chat
  a.pingAt = 0; A.send({ t: 'act', a: 'ping', k: 'medic' }); await sleep(200);
  ck('pingToTeam', B.got('png', m => m.k === 'medic' && m.n === 'CmsA').length === 1 && !D.got('png').length);
  A.send({ t: 'act', a: 'ping', k: 'attack' }); await sleep(200); ck('pingRateLimit', B.got('png').length === 1);
  await sleep(900); place(a, 0, T.hAt(X.terrH(), 0, 100), 100); a.yaw = 0; a.pitch = -.3; A.send({ t: 'act', a: 'ping', k: 'arty' }); await sleep(200);
  ck('artyRequestToOfficer', O.got('al', m => m.k === 'req' && /requests artillery/.test(m.m)).length === 1 && B.got('png', m => m.k === 'arty' && m.z < a.z).length === 1);
  // gas mask
  place(a, 0, 60, 120); a.hp = 100; X.gases.push({ x: 0, z: 120, r: 6, from: 0, until: 1e9, by: d });
  await sleep(1000); const lossBare = 100 - a.hp; a.hp = 100;
  A.send({ t: 'act', a: 'mask' }); await sleep(150); ck('maskMsg', A.got('mask', m => m.on === 1 && m.d === 1.5).length === 1);
  a.cd = 0; a.ammo = 5; X.fireWeapon(a); ck('noFireWhilePuttingOn', a.ammo === 5);
  await sleep(1600); a.hp = 100; await sleep(1000); const lossMasked = 100 - a.hp;
  ck('maskCutsGas', lossBare >= 4 && lossMasked <= lossBare * .2);
  A.send({ t: 'in', c: [[900, 16, 0, 0, 32, 0, 0]] }); await sleep(150); ck('noAdsInMask', a.ads === false);
  X.gases.length = 0; A.send({ t: 'act', a: 'mask' }); await sleep(150); ck('maskOff', !X.masked(a));
  // utility grenades (bandage key)
  { const n = X.smokes.length, bd = a.bd; a.gCd = 0; A.send({ t: 'act', a: 'heal' }); await sleep(1800); ck('smokeGrenade', X.smokes.length === n + 1 && a.bd === bd - 1 && a.bd === 1); }
  { place(b, 10, 60, 120); const n = X.gases.length; b.gCd = 0; B.send({ t: 'act', a: 'heal' }); await sleep(1800); ck('gasGrenade', X.gases.length === n + 1 && X.gases[X.gases.length - 1].r === 5.5 && A.got('gas').length >= 1); }
  // after-action report
  X.endRound(0); await sleep(250);
  { const m = A.got('end').pop(); ck('afterActionReport', m && m.rep && m.rep.mvp && m.rep.teams.length === 2 && Array.isArray(m.me) && m.me[0] === 1 && m.rep.cards.length >= 1); }
  const bad = Object.entries(R).filter(([, v]) => !v).map(([k]) => k);
  console.log(JSON.stringify(R)); console.log(bad.length ? 'FAILED: ' + bad.join(', ') : 'ALL ' + Object.keys(R).length + ' CHECKS PASSED'); process.exit(bad.length ? 1 : 0);
})().catch(e => { console.log('TEST ERROR', e.stack); process.exit(1); });
