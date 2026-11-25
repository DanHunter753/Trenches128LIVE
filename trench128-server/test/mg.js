'use strict';
// Teleports a test player next to the nearest friendly MG nest (needs T128_TEST=1),, mans it, fires until it overheats, then dismounts.
const T = require('../shared.js');
const url = process.argv[2] || 'ws://localhost:8080';
const ws = new WebSocket(url); ws.binaryType = 'arraybuffer';
const me = { x: 0, y: 0, z: 0, vy: 0, alive: false, team: 0, yaw: 0, seq: 0, cls: 'rifleman' }; let H, timer, nest, phase = 'walk', t0 = 0;
const log = { phase: [], minBelt: 999, maxHeat: 0, sawOver: false, mountedPos: null, hm: 0, msgs: [] };
ws.onopen = () => ws.send(JSON.stringify({ t: 'hello', name: 'MGTester' }));
ws.onmessage = ev => {
  if (typeof ev.data !== 'string') { if (new Uint8Array(ev.data)[0] === 4) return;   // binary tracer frame (v0.23)

    const dv = new DataView(ev.data), fl = dv.getUint8(26), val = dv.getUint16(27, true), heat = dv.getUint8(31);
    me.alive = !!(fl & 1); me.x = dv.getFloat32(9, true); me.y = dv.getFloat32(13, true); me.z = dv.getFloat32(17, true); me.vy = dv.getFloat32(21, true);
    if (fl & 2) { log.mountedPos = [+me.x.toFixed(2), +me.z.toFixed(2)]; log.minBelt = Math.min(log.minBelt, val); log.maxHeat = Math.max(log.maxHeat, heat); if (fl & 8) log.sawOver = true; if (phase === 'walk') { phase = 'fire'; t0 = Date.now(); log.phase.push('mounted'); } }
    else if (phase === 'dismount') { phase = 'done'; log.phase.push('dismounted'); log.after = [+me.x.toFixed(2), +me.z.toFixed(2)]; finish(); }
    return;
  }
  const m = JSON.parse(ev.data);
  if (m.t === 'prof') { me.team = m.team; ws.send(JSON.stringify({ t: 'join', cls: 'rifleman', w: 'bolt', u: 'bandage', sq: 0 })); }
  else if (m.t === 'w') { H = T.makeTerrain().H; timer = setInterval(frame, 33); }
  else if (m.t === 'sp') { me.x = m.x; me.z = m.z; me.y = m.y; nest = T.NEST.filter(n => n.team === me.team).sort((a, b) => Math.hypot(a.x - me.x, a.z - me.z) - Math.hypot(b.x - me.x, b.z - me.z))[0];
    // everyone spawns at home base now (85 m back, across trenches): jump to the nest with the test-mode teleport (server needs T128_TEST=1)
    if (nest) { const tz = nest.z + (me.team === 0 ? 2.2 : -2.2); ws.send(JSON.stringify({ t: 'tp', x: nest.x, z: tz })); me.x = nest.x; me.z = tz; me.y = T.hAt(H, me.x, me.z); } }
  else if (m.t === 'hm') log.hm++; else if (m.t === 'msg') log.msgs.push(m.m);
};
let last = Date.now(), tries = 0;
function frame() {
  if (!me.alive || !nest) return; const now = Date.now(), ms = Math.min(50, now - last); last = now;
  if (phase === 'walk') {
    const dx = nest.x - me.x, dz = nest.z - me.z, d = Math.hypot(dx, dz);
    if (d < 3 && ++tries % 10 === 1) { ws.send(JSON.stringify({ t: 'act', a: 'mg' })); }
    me.yaw = Math.atan2(-dx, -dz);
    const c = { seq: ++me.seq, dt: ms / 1000, f: d > 2 ? 1 : 0, s: 0, bits: 1, yaw: me.yaw, pitch: 0 }; T.step(me, c, H, 1);
    ws.send(JSON.stringify({ t: 'in', c: [[c.seq, ms, c.f, c.s, c.bits, c.yaw, 0]] }));
  } else if (phase === 'fire') {
    const yaw = me.team ? Math.PI : 0; ws.send(JSON.stringify({ t: 'in', c: [[++me.seq, ms, 0, 0, 8, yaw, 0.05]] }));
    if (log.sawOver || Date.now() - t0 > 9000) { phase = 'dismount'; ws.send(JSON.stringify({ t: 'act', a: 'mg' })); }
  } else if (phase === 'dismount') ws.send(JSON.stringify({ t: 'in', c: [[++me.seq, ms, 0, 0, 0, 0, 0]] }));
}
function finish() { clearInterval(timer); console.log(JSON.stringify({ nest: [nest.x, nest.z], ...log }, null, 1)); process.exit(0); }
setTimeout(() => { console.log('TIMEOUT in phase', phase, JSON.stringify(log), 'pos', me.x.toFixed(1), me.z.toFixed(1), 'nest', nest && [nest.x, nest.z]); process.exit(1); }, 60000);
