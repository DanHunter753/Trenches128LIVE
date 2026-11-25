'use strict';
// Sandbag collision, item limits/cooldowns (grenades, bandages), ADS accuracy plumbing, finer line-of-sight.
const fs = require('fs'), path = require('path');
process.argv = ['node', 'x', '--port', '8094', '--fill', '6'];
const S = require('../server.js'); const T = require('../shared.js');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const R = { checks: {} }; const ck = (k, v) => { R.checks[k] = !!v; };
const H = T.makeTerrain().H;
// ---- sandbags (pure shared)
const b = T.SB[0], gy = T.hAt(H, b.x, b.z);
const mkp = (x, z, y) => ({ x, z, y, vy: 0 });
function run(p, yaw, secs, bits = 0) { for (let i = 0; i < secs * 60; i++) T.step(p, { dt: 1 / 60, f: 1, s: 0, bits, yaw }, H, 1); return p; }
ck('sandbagsExist', T.SB.length > 40);
// approach from whichever side is level with the bag (no-man's-land side), walking toward it
const side = Math.abs(T.hAt(H, b.x, b.z + 2.4) - gy) < Math.abs(T.hAt(H, b.x, b.z - 2.4) - gy) ? 1 : -1, yawIn = side > 0 ? 0 : Math.PI;
const start = () => mkp(b.x, b.z + side * 2.4, T.groundAt(H, b.x, b.z + side * 2.4, 99));
let p = start(); run(p, yawIn, 0.9); ck('sandbagBlocksWalking', side * (p.z - b.z) > b.hz - .05);
p = start(); run(p, yawIn, 0.4); run(p, yawIn, 0.1, 4); run(p, yawIn, 1.4); ck('canJumpOverSandbag', side * (p.z - b.z) < -b.hz);
ck('sandbagBlocksSight', !T.los(H, b.x, gy + .7, b.z + 3, b.x, gy + .7, b.z - 3) && T.los(H, b.x, gy + 2.6, b.z + 3, b.x, gy + 2.6, b.z - 3));
ck('sandbagNotSolidAbove', !T.sbHit(H, b.x, gy + 1.2, b.z) && !!T.sbHit(H, b.x, gy + .3, b.z));
// stuck protection: a player already inside a bag can walk out
p = mkp(b.x, b.z, T.groundAt(H, b.x, b.z, 99)); const z0 = p.z; run(p, 0, .5); ck('notStuckInside', Math.abs(p.z - z0) > .3);
// finer LOS: a 50 m ray over a ridge that the old 10-sample test would have skipped
let found = false; for (let z = -50; z < 50 && !found; z += 1) { const x = 5; if (!T.los(H, x, T.hAt(H, x, z) + 1.6, z, x, T.hAt(H, x, z + 50) + 1.6, z + 50)) found = true; } ck('losSeesTerrain', found);
// ---- ADS plumbing
const W = T.WPN; ck('everyGunHipSpreadWorseThanAds', Object.values(W).every(w => w.spr * .35 < w.spr + (w.hip || 0) && w.hip > 0));
(async () => {
  function client(name, join) {
    return new Promise(res => {
      const c = { name, msgs: [] }; const ws = new WebSocket('ws://localhost:8094'); ws.binaryType = 'arraybuffer';
      ws.onopen = () => ws.send(JSON.stringify({ t: 'hello', name }));
      ws.onmessage = ev => { if (typeof ev.data !== 'string') { if (new Uint8Array(ev.data)[0] === 4) return;   // binary tracer frame (v0.23)
 c.snap = new DataView(ev.data); return; } const m = JSON.parse(ev.data); c.msgs.push(m); if (m.t === 'prof') { const e = [...S._test.humans].find(h => h.name === name); e.team = 0; ws.send(JSON.stringify({ t: 'join', ...join })); } if (m.t === 'w') res(c); };
      c.send = o => ws.send(JSON.stringify(o)); c.ent = () => [...S._test.humans].find(h => h.name === name);
    });
  }
  const C = await client('LimitR', { cls: 'rifleman', w: 'bolt', u: 'bandage', sq: 1 });
  await sleep(1200); const e = C.ent(); S._test.setSupply(0, 200); e.x = 0; e.z = 90; e.y = 0;
  // grenades: start with 2, spam 6 times
  const g0 = e.gr; for (let i = 0; i < 4; i++) { C.send({ t: 'act', a: 'grenade' }); await sleep(1150); }
  await sleep(100); ck('startsWithTwoGrenades', g0 === 2); ck('grenadesRunOut', e.gr === 0); ck('outOfGrenadesMessage', C.msgs.some(m => m.t === 'msg' && /Out of grenades/.test(m.m)));
  ck('grenadeCountInSnapshot', C.snap && (C.snap.getUint16(34, true) & 255) === 0);
  // grenade cooldown: respawn-like reset then two quick throws only the first counts
  e.gr = 3; e.gCd = 0; C.send({ t: 'act', a: 'grenade' }); C.send({ t: 'act', a: 'grenade' }); await sleep(150); ck('grenadeCooldown', e.gr === 2);
  // bandages: 3 per life, 6 s cooldown, spam does nothing extra
  e.hp = 20; const bd0 = e.bd; for (let i = 0; i < 8; i++) { C.send({ t: 'act', a: 'heal' }); await sleep(40); } await sleep(150);
  ck('bandageSpamHealsOnce', bd0 === 3 && e.bd === 2 && e.hp === 60); ck('bandageCountInSnapshot', C.snap && (C.snap.getUint16(34, true) >> 8) === 2);
  e.healCd = 0; e.bd = 0; e.hp = 20; C.send({ t: 'act', a: 'heal' }); await sleep(150); ck('noBandagesNoHeal', e.hp === 20 && C.msgs.some(m => m.t === 'msg' && /No bandages/.test(m.m)));
  // ADS bit reaches the server and is cleared again
  C.send({ t: 'in', c: [[1, 16, 0, 0, 32, 0, 0]] }); await sleep(120); ck('adsFlagSet', e.ads === true);
  C.send({ t: 'in', c: [[2, 16, 0, 0, 0, 0, 0]] }); await sleep(120); ck('adsFlagCleared', e.ads === false);
  // bots no longer snipe through cover: aim point drops when crouched; hit chance lowered
  console.log(JSON.stringify(R, null, 1)); const bad = Object.entries(R.checks).filter(([k, v]) => !v).map(x => x[0]);
  console.log(bad.length ? 'FAILED ' + bad : 'ALL ' + Object.keys(R.checks).length + ' CHECKS PASSED'); process.exit(bad.length ? 1 : 0);
})().catch(err => { console.error(err); process.exit(1); });
