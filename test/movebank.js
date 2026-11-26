'use strict';
// v0.32.1 movement time bank: inputs that arrive bunched up (jitter, or after a slow server tick) are all applied, so the
// server ends where the player's own prediction did (no snap-back while sprinting); but a burst of fake time (speed hack)
// is still held to what the clock allows.
process.argv = ['node', 'x', '--port', '8081', '--fill', '0', '--no-fetch', '--data', require('fs').mkdtempSync(require('path').join(require('os').tmpdir(), 't128mb-'))];
process.env.T128_TEST = '1';
const S = require('../server.js'), T = require('../shared.js'), X = S._test;
const sleep = ms => new Promise(r => setTimeout(r, ms)), R = {}, ck = (k, v) => { R[k] = !!v; };
function client(name) { return new Promise(res => { const ws = new WebSocket('ws://localhost:8081'), c = { ws, msgs: [] }; ws.binaryType = 'arraybuffer';
  ws.onopen = () => ws.send(JSON.stringify({ t: 'hello', name, team: 0 })); ws.onmessage = ev => { if (typeof ev.data === 'string') { const m = JSON.parse(ev.data); c.msgs.push(m); if (m.t === 'prof') res(c); } }; }); }
(async () => {
  await sleep(800); const A = await client('Runner'); A.ws.send(JSON.stringify({ t: 'join', cls: 'rifleman', w: 'bolt', u: 'bandage', sq: 0 })); await sleep(1200);
  const me = [...X.humans].find(p => p.name === 'Runner'); let seq = 1000;
  // stand somewhere flat and open behind the home camp, facing along x
  const place = () => { me.x = 0; me.z = T.HOME_Z - 20; me.y = T.hAt(X.terr().H, me.x, me.z); me.vy = 0; me.cl = null; me.alive = true; };
  place(); await sleep(300); place(); await sleep(400);   // let the bank settle at its normal level
  // 12 sprint frames (192 ms) arrive in one message: the old cap applied only 120 ms of them
  const cmds = []; for (let i = 0; i < 12; i++) cmds.push([++seq, 16, 1, 0, 1, Math.PI / 2, 0]);
  const sim = { x: me.x, y: me.y, z: me.z, vy: 0, w: me.w, cls: me.cls }; for (const c of cmds) T.step(sim, { dt: .016, f: 1, s: 0, bits: 1, yaw: Math.PI / 2 }, X.terr().H, T.spOf(me));
  const x0 = me.x; A.ws.send(JSON.stringify({ t: 'in', c: cmds, rt: X.tickNo() })); await sleep(250);
  R.server = +(me.x - x0).toFixed(2); R.predicted = +(sim.x - x0).toFixed(2); ck('burstFullyApplied', Math.abs(me.x - sim.x) < .05 && Math.abs(R.predicted) > .6);   // (a slow machine gunner covers ~0.9 m)
  // a speed hack: 3 s of 50 ms frames in one go
  place(); await sleep(400); const x1 = me.x; for (let m = 0; m < 3; m++) { const c = []; for (let i = 0; i < 20; i++) c.push([++seq, 50, 1, 0, 1, Math.PI / 2, 0]); A.ws.send(JSON.stringify({ t: 'in', c, rt: X.tickNo() })); }
  await sleep(120); R.hackMoved = +Math.abs(me.x - x1).toFixed(2); ck('speedHackCapped', Math.abs(me.x - x1) < 7 * 1 * (.6 + .2) + .5);   // sprint 7 m/s x (bank + a few ticks)
  console.log(JSON.stringify(R)); const bad = Object.keys(R).filter(k => R[k] === false); console.log(bad.length ? 'FAILED: ' + bad.join(', ') : 'ALL ' + Object.keys(R).filter(k => typeof R[k] === 'boolean').length + ' CHECKS PASSED'); process.exit(bad.length ? 1 : 0);
})().catch(e => { console.log('TEST ERROR', e); process.exit(1); });
