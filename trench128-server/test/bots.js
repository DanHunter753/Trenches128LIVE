'use strict';
// Headless test clients: node test/bots.js [url] [count] [seconds]
// Connects N fake players, walks them at the enemy, fires, and checks the server's replies.
const T = require('../shared.js');
const url = process.argv[2] || 'ws://localhost:8080', COUNT = +process.argv[3] || 2, SECS = +process.argv[4] || 12;
const stats = { snaps: 0, bytes: 0, shots: 0, hm: 0, kills: 0, msgs: [], spawned: 0, objs: 0, craters: 0, xp: 0, maxEnts: 0, err: [] };
let done = 0;

function client(i) {
  const ws = new WebSocket(url); ws.binaryType = 'arraybuffer';
  const me = { id: 0, x: 0, y: 0, z: 0, vy: 0, alive: false, team: 0, yaw: 0, seq: 0, pending: [], ack: 0, ammo: 0, hp: 0, cls: 'rifleman', corr: 0 };
  let H = null, lastT = Date.now(), timer = null;
  ws.onopen = () => ws.send(JSON.stringify({ t: 'hello', name: 'TestBot' + i }));
  ws.onmessage = ev => {
    if (typeof ev.data !== 'string') {
      const dv = new DataView(ev.data); stats.bytes += ev.data.byteLength; if (dv.getUint8(0) === 4) { stats.shots += dv.getUint16(1, true); return; } stats.snaps++;
      const ack = dv.getUint32(5, true), x = dv.getFloat32(9, true), y = dv.getFloat32(13, true), z = dv.getFloat32(17, true), vy = dv.getFloat32(21, true);
      const hp = dv.getUint8(25), fl = dv.getUint8(26), ammo = dv.getUint16(27, true), n = (me.dec || (me.dec = require('./snapdec.js')())).feed(ev.data).ents.size;
      stats.maxEnts = Math.max(stats.maxEnts, n);
      // reconcile: authoritative state, then replay unacked commands
      const before = { x: me.x, z: me.z };
      me.alive = !!(fl & 1); me.hp = hp; me.ammo = ammo; me.x = x; me.y = y; me.z = z; me.vy = vy;
      me.pending = me.pending.filter(c => c.seq > ack);
      for (const c of me.pending) T.step(me, c, H, T.CLS[me.cls].sp);
      me.corr = Math.max(me.corr, Math.hypot(before.x - me.x, before.z - me.z));
      if (me.alive && !me.spawnedSeen) { me.spawnedSeen = true; stats.spawned++; }
      return;
    }
    const m = JSON.parse(ev.data);
    if (m.t === 'prof') { me.id = m.id; me.team = m.team; ws.send(JSON.stringify({ t: 'join', cls: 'rifleman', w: 'bolt', u: 'bandage', sq: 0 })); }
    else if (m.t === 'w') { H = T.makeTerrain().H; for (const c of m.craters) T.dig({ H, D: new Float32Array(T.NV) }, c[0], c[1], c[2], c[3]); timer = setInterval(frame, 33); }
    else if (m.t === 'sp') { me.x = m.x; me.y = m.y; me.z = m.z; me.vy = 0; me.pending = []; me.cls = m.cls; }
    else if (m.t === 'hm') stats.hm++;
    else if (m.t === 'k') stats.kills++;
    else if (m.t === 'sh') stats.shots += m.s.length;
    else if (m.t === 'o') stats.objs++;
    else if (m.t === 'cr') { stats.craters++; T.dig({ H, D: new Float32Array(T.NV) }, m.c[0], m.c[1], m.c[2], m.c[3]); }
    else if (m.t === 'xp') stats.xp = m.xp;
    else if (m.t === 'msg') stats.msgs.push(m.m);
    else if (m.t === 'err') stats.err.push(m.m);
  };
  function frame() {
    if (!me.alive) { ws.send(JSON.stringify({ t: 'in', c: [] })); return; }
    const now = Date.now(), dtms = Math.min(50, now - lastT); lastT = now;
    // walk toward the enemy (blue walks -z, red walks +z), always firing
    const dirz = me.team === 0 ? -1 : 1; me.yaw = me.team === 0 ? 0 : Math.PI;
    const c = { seq: ++me.seq, dt: dtms / 1000, f: 1, s: 0, bits: 8 | (me.seq % 40 === 0 ? 4 : 0) | 1, yaw: me.yaw, pitch: 0 };
    T.step(me, c, H, T.CLS[me.cls].sp); me.pending.push(c);
    ws.send(JSON.stringify({ t: 'in', c: [[c.seq, dtms, c.f, c.s, c.bits, c.yaw, c.pitch]] }));
    if (me.seq % 90 === 0) ws.send(JSON.stringify({ t: 'act', a: 'grenade' }));
    if (me.seq % 150 === 0) ws.send(JSON.stringify({ t: 'act', a: 'reload' }));
  }
  ws.onclose = () => { clearInterval(timer); if (++done === COUNT) report(); };
  setTimeout(() => ws.close(), SECS * 1000);
  return me;
}
const me = []; for (let i = 0; i < COUNT; i++) me.push(client(i));
function report() {
  const maxCorr = Math.max(...me.map(m => m.corr));
  console.log(JSON.stringify({ ...stats, avgSnapBytes: Math.round(stats.bytes / Math.max(1, stats.snaps)), msgs: stats.msgs.slice(0, 6), maxPredictionCorrection: +maxCorr.toFixed(2) }, null, 1));
  const ok = stats.spawned >= COUNT && !stats.err.length && stats.snaps > COUNT * SECS * 5 && maxCorr < 1;   // every client spawned and kept receiving snapshots
  console.log(ok ? 'BOTS OK' : 'BOTS FAIL'); process.exit(ok ? 0 : 1);
}
