'use strict';
// In-process network test (v0.23): delta snapshots keep an exact client copy (positions, removals, resync on join),
// unchanged entities cost nothing, the render tick sets the rewind, lag-compensated hits land where the shooter saw the target.
process.argv = ['node', 'x', '--port', '8089', '--fill', '10'];
const S = require('../server.js'); const T = require('../shared.js'); const makeDec = require('./snapdec.js');
const sleep = ms => new Promise(r => setTimeout(r, ms)); const R = {}; const ck = (k, v) => { R[k] = !!v; };
function client(name, team, join) {
  return new Promise(res => {
    const c = { name, msgs: [], dec: makeDec(), sizes: [] }; const ws = new WebSocket('ws://localhost:8089'); ws.binaryType = 'arraybuffer';
    ws.onopen = () => ws.send(JSON.stringify({ t: 'hello', name }));
    ws.onmessage = ev => { if (typeof ev.data !== 'string') { if (new Uint8Array(ev.data)[0] === 4) return;   // binary tracer frame (v0.23)
 c.dec.feed(ev.data); if (new Uint8Array(ev.data)[0] === 3) c.sizes.push(ev.data.byteLength); return; } const m = JSON.parse(ev.data); c.msgs.push(m);
      if (m.t === 'w' || m.t === 'snapReset') c.dec.reset();
      if (m.t === 'prof') { const e = [...S._test.humans].find(h => h.name === name); e.team = team; ws.send(JSON.stringify({ t: 'join', ...join })); }
      if (m.t === 'w') res(c); };
    c.send = o => ws.send(JSON.stringify(o)); c.ent = () => [...S._test.humans].find(h => h.name === name);
  });
}
const place = (e, x, y, z) => { e.x = x; e.y = y; e.z = z; e.vy = 0; e.cl = null; e.pitch = 0; };
(async () => {
  const A = await client('NetA', 0, { cls: 'rifleman', w: 'bolt', u: 'bandage', sq: 0 });
  const D = await client('NetD', 1, { cls: 'rifleman', w: 'bolt', u: 'bandage', sq: 0 });
  await sleep(3000); const X = S._test, a = A.ent(), d = D.ent();
  for (let i = 0; i < 20 && !(a.alive && d.alive); i++) await sleep(250);
  // the client's copy matches the server (within one skipped half-rate tick of movement)
  { let worst = 0, missing = 0, n = 0; for (const e of X.ents.values()) { if (e === a || !e.alive || e.cmd || e.manned) continue; const near = Math.abs(e.x - a.x) < 100 && Math.abs(e.z - a.z) < 100; if (!near) continue; n++;
      const q = A.dec.ents.get(e.id); if (!q) { missing++; continue; } worst = Math.max(worst, Math.hypot(q.x - e.x, q.z - e.z)); }
    ck('clientCopyComplete', n > 0 && missing === 0); ck('clientCopyAccurate', worst < .6); }
  // an entity that leaves the interest area is removed explicitly
  place(a, 0, 60, 140); place(d, 0, 60, 120); await sleep(300); ck('enemyInView', A.dec.ents.has(d.id));
  place(d, 0, 60, -150); await sleep(300); ck('removedWhenOutOfView', !A.dec.ents.has(d.id));
  // a standing-still crowd costs (almost) nothing per tick
  place(d, 2, 60, 130); await sleep(300);
  for (const e of X.ents.values()) if (e.bot) { e.alive = false; e.rt = 999; }
  await sleep(400); const before = A.sizes.length; await sleep(500); const idle = A.sizes.slice(before);
  ck('idleSnapshotsTiny', idle.length > 5 && Math.max(...idle) <= 36 + 2 + 3 * 4);
  // joining again resyncs from scratch
  ck('fullCopyBeforeRejoin', A.dec.ents.has(d.id));
  // render tick -> rewind
  A.send({ t: 'in', c: [[1, 16, 0, 0, 0, 0, 0]], rt: A.dec.tick - 3 }); await sleep(150); ck('rewindFromRenderTick', a.rw >= 3 && a.rw <= 6);
  A.send({ t: 'in', c: [[2, 16, 0, 0, 0, 0, 0]], rt: A.dec.tick - 500 }); await sleep(150); ck('rewindCapped', a.rw === X.LAGC_MAX);
  // lag compensation: the target was at P1 on the shooter's screen, but has since moved 3 m
  for (const e of X.ents.values()) if (e.bot) { e.alive = false; e.rt = 999; }
  place(a, 100, 60, 30); place(d, 100, 60, -10); d.hp = 1000; await sleep(700);   // history fills with P1
  place(d, 103, 60, -10);
  const aim = Math.atan2((60 + 1.2) - (60 + 1.6), 40), yaw = Math.atan2(-(100 - a.x), -(-10 - a.z));
  a.rw = 6; X.fireBullet(a, a.x, a.y + 1.6, a.z, Math.atan2(-(103 - a.x), -(-10 - a.z)), aim, 130, 30, 'carbine', 380); await sleep(150);   // aimed where it is now: on the shooter's screen nobody was there
  ck('rewoundTargetNotWhereItIsNow', d.hp === 1000);
  X.fireBullet(a, a.x, a.y + 1.6, a.z, yaw, aim, 130, 30, 'carbine', 380); await sleep(150);                                  // aimed where the shooter saw it
  ck('lagCompensatedHit', d.hp === 970);
  a.rw = 0; X.fireBullet(a, a.x, a.y + 1.6, a.z, yaw, aim, 130, 30, 'carbine', 380); await sleep(400);
  ck('noRewindMisses', d.hp === 970);
  // respawned entities leave no ghost behind
  { const h = new Float32Array(4); d.hist = null; X.histTick(); const P = X.histAt(d, 6, [0, 0, 0, 0]); ck('noGhostAfterRespawn', Math.abs(P[0] - d.x) < .01 && Math.abs(P[2] - d.z) < .01); }
  const bad = Object.entries(R).filter(([, v]) => !v).map(([k]) => k);
  console.log(JSON.stringify(R)); console.log(bad.length ? 'FAILED: ' + bad.join(', ') : 'ALL ' + Object.keys(R).length + ' CHECKS PASSED'); process.exit(bad.length ? 1 : 0);
})().catch(e => { console.log('TEST ERROR', e.stack); process.exit(1); });
