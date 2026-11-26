'use strict';
// v0.31 tunnel mines, in-process: two shafts per side; holding E at your shaft head digs the gallery (a sapper about 75 s,
// others three times slower, diggers stack); half-way the enemy hears it, and holding E at the listening post above the
// charge countermines it; a finished gallery blows craters under the enemy front trench and then needs time before reuse.
process.argv = ['node', 'x', '--port', '8076', '--fill', '4', '--no-fetch', '--data', require('fs').mkdtempSync(require('path').join(require('os').tmpdir(), 't128tn-'))];
process.env.T128_TEST = '1';
const S = require('../server.js'), T = require('../shared.js'), X = S._test;
const sleep = ms => new Promise(r => setTimeout(r, ms)), R = {}, ck = (k, v) => { R[k] = !!v; };
function client(name, team) { return new Promise(res => { const ws = new WebSocket('ws://localhost:8076'), c = { ws, msgs: [] }; ws.binaryType = 'arraybuffer';
  ws.onopen = () => ws.send(JSON.stringify({ t: 'hello', name, team })); ws.onmessage = ev => { if (typeof ev.data === 'string') { const m = JSON.parse(ev.data); c.msgs.push(m); if (m.t === 'prof') res(c); } }; }); }
const lines = t => T.PHONES.map((L, l) => [L, l]).filter(([L]) => L.team === t);
const mid = (l, s) => { const a = T.PHONES[l].pts[s], b = T.PHONES[l].pts[s + 1]; return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; };
async function hold(c, me, x, z, ms, done) { let t = 0; while (!done() && t < ms) { me.alive = true; me.x = x; me.z = z; c.ws.send(JSON.stringify({ t: 'act', a: 'work' })); await sleep(200); t += 200; } return t; }
(async () => {
  await sleep(500);
  ck('twoPerSide', T.TUNNELS.filter(q => q.team === 0).length === 2 && T.TUNNELS.filter(q => q.team === 1).length === 2);
  ck('shaftInFrontTrench', T.TUNNELS.every(q => Math.sign(q.z) !== Math.sign(q.tz) && Math.abs(q.z) > 15 && Math.abs(q.tz) > 15));
  const A = await client('Miner', 0), B = await client('Listener', 1);
  A.ws.send(JSON.stringify({ t: 'join', cls: 'rifleman', w: 'rifle', u: 'bandage', sq: 1 })); B.ws.send(JSON.stringify({ t: 'join', cls: 'rifleman', w: 'rifle', u: 'bandage', sq: 1 })); await sleep(800);
  const me = [...X.humans].find(p => p.name === 'Miner'), en = [...X.humans].find(p => p.name === 'Listener'); me.cls = 'sapper';
  const i = T.TUNNELS.findIndex(q => q.team === 0), q = T.TUNNELS[i], u = X.TUN[i];
  // dig by calling the work action directly (75 s of sapper work in 0.2 s steps)
  const work = (p, x, z, s) => { for (let t = 0; t < s; t += .2) { p.alive = true; p.x = x; p.z = z; p.wkAt = 0; X.tunnelAct(p, .2); } };
  work(me, q.x + .5, q.z, 30); R.p30 = +u.p.toFixed(2); ck('sapperRate', u.p > .35 && u.p < .45); ck('notHeardYet', !u.heard);
  await sleep(200); ck('enemySeesNothing', !B.msgs.some(m => m.t === 'tn' && m.i === i && m.p > 0)); ck('ownSeesProgress', A.msgs.some(m => m.t === 'tn' && m.i === i && m.p > .3));
  work(me, q.x + .5, q.z, 10); await sleep(200); ck('heardHalfway', u.heard && B.msgs.some(m => m.t === 'msg' && /Digging heard/.test(m.m)));
  // countermine: the defender holds E at the listening post
  work(en, q.tx + 1, q.tz, 9.6); ck('countermineTakesTime', u.p > .5);
  work(en, q.tx + 1, q.tz, .8); ck('countermineCollapses', u.p === 0 && !u.heard && u.cd > X.tickNo());
  work(me, q.x + .5, q.z, 2); ck('shaftCooldown', u.p === 0);
  // dig it out fully: it blows under the enemy trench
  u.cd = 0; const n0 = X.craters().length; work(me, q.x + .5, q.z, 76); await sleep(200);
  const cr = X.craters().slice(n0).filter(c => typeof c[0] === 'number' && Math.abs(c[1] - q.tz) < 1 && Math.abs(c[0] - q.tx) < 6);
  R.craters = cr.length; ck('mineBlows', cr.length >= 3 && u.p === 0); ck('blastTold', A.msgs.some(m => m.t === 'tb' && m.i === i));
  // a rifleman digs three times slower
  u.cd = 0; me.cls = 'rifleman'; work(me, q.x + .5, q.z, 30); ck('riflemanSlower', u.p > .1 && u.p < .16);
  X.resetRound(); ck('resetClears', X.TUN.every(v => v.p === 0));
  console.log(JSON.stringify(R)); const bad = Object.keys(R).filter(k => R[k] === false); console.log(bad.length ? 'FAILED: ' + bad.join(', ') : 'ALL ' + Object.keys(R).filter(k => typeof R[k] === 'boolean').length + ' CHECKS PASSED'); process.exit(bad.length ? 1 : 0);
})().catch(e => { console.log('TEST ERROR', e); process.exit(1); });
