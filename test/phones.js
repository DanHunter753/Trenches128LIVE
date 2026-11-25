'use strict';
// v0.31 field telephone lines, in-process: three lines per side run from the HQs to the front trench; a heavy shell cuts the
// wire, an enemy holding E at a pole cuts it, holding E at your own break splices it (a sapper faster); artillery needs at
// least one working line and every cut line lengthens its cooldown; breaks mend themselves; the round reset clears them.
process.argv = ['node', 'x', '--port', '8075', '--fill', '4', '--no-fetch', '--data', require('fs').mkdtempSync(require('path').join(require('os').tmpdir(), 't128ph-'))];
process.env.T128_TEST = '1';
const S = require('../server.js'), T = require('../shared.js'), X = S._test;
const sleep = ms => new Promise(r => setTimeout(r, ms)), R = {}, ck = (k, v) => { R[k] = !!v; };
function client(name, team) { return new Promise(res => { const ws = new WebSocket('ws://localhost:8075'), c = { ws, msgs: [] }; ws.binaryType = 'arraybuffer';
  ws.onopen = () => ws.send(JSON.stringify({ t: 'hello', name, team })); ws.onmessage = ev => { if (typeof ev.data === 'string') { const m = JSON.parse(ev.data); c.msgs.push(m); if (m.t === 'prof') res(c); } }; }); }
const lines = t => T.PHONES.map((L, l) => [L, l]).filter(([L]) => L.team === t);
const mid = (l, s) => { const a = T.PHONES[l].pts[s], b = T.PHONES[l].pts[s + 1]; return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; };
async function hold(c, me, x, z, ms, done) { let t = 0; while (!done() && t < ms) { me.alive = true; me.x = x; me.z = z; c.ws.send(JSON.stringify({ t: 'act', a: 'work' })); await sleep(200); t += 200; } return t; }
(async () => {
  await sleep(500);
  ck('threePerSide', lines(0).length === 3 && lines(1).length === 3 && T.PHONES.every(L => L.pts.length >= 2));
  const A = await client('Linesman', 0); A.ws.send(JSON.stringify({ t: 'join', cls: 'rifleman', w: 'rifle', u: 'bandage', sq: 1 })); await sleep(700);
  const me = [...X.humans].find(p => p.name === 'Linesman'), enemy = [...X.ents.values()].find(e => e.team === 1 && e.alive) || { team: 1, bot: true, id: -1 };
  const [, l0] = lines(0)[0], [x0, z0] = mid(l0, 0);
  // a grenade-sized blast leaves the wire alone, a shell cuts it (whichever side fired it)
  X.explode(x0, z0, enemy, .5); ck('smallBlastNoCut', !X.phoneCut.has(l0 + ':0'));
  X.explode(x0, z0, enemy, 1); await sleep(200); ck('shellCuts', X.phoneCut.has(l0 + ':0')); ck('clientsTold', A.msgs.some(m => m.t === 'ph' && m.l === l0 && m.s === 0 && m.c === 1));
  ck('upCount', X.phoneUp(0) === 2);
  // splice it by hand: a rifleman takes about 5 s
  let t = await hold(A, me, x0 + .5, z0, 9000, () => !X.phoneCut.has(l0 + ':0')); R.riflemanSplice = t / 1000;
  ck('riflemanSplices', !X.phoneCut.has(l0 + ':0') && t >= 4000 && t <= 7000); ck('spliceProgress', A.msgs.some(m => m.t === 'wk' && /Splicing/.test(m.n)));
  // a sapper splices in about 2.5 s
  me.cls = 'sapper'; X.phoneSet(l0, 0, true, enemy); t = await hold(A, me, x0 + .5, z0, 6000, () => !X.phoneCut.has(l0 + ':0')); R.sapperSplice = t / 1000;
  ck('sapperFaster', !X.phoneCut.has(l0 + ':0') && t <= 3600);
  // an enemy can cut a line by hand; your own intact line can't be "cut" by you
  me.cls = 'rifleman'; const [, e0] = lines(1)[0], [ex, ez] = mid(e0, 0);
  t = await hold(A, me, ex + .5, ez, 6000, () => X.phoneCut.has(e0 + ':0')); R.enemyCut = t / 1000;
  ck('cutsEnemyLine', X.phoneCut.has(e0 + ':0') && t >= 2400); ck('cutPrompt', A.msgs.some(m => m.t === 'wk' && /Cutting/.test(m.n)));
  await hold(A, me, x0 + .5, z0, 1500, () => false); ck('cantCutOwn', X.phoneUp(0) === 3);
  // artillery: one cut line lengthens the cooldown, all three cut stops it
  const off = { team: 0, name: 'Off', bot: true, id: -77, officer: true }; X.setCmd(0, 999);
  const cd = X.supCd()[0]; cd.barrage = 0; X.callSupport(off, { s: 'barrage', x: 0, z: 0 }); const full = cd.barrage - X.tickNo();
  cd.barrage = 0; X.phoneSet(lines(0)[1][1], 0, true, enemy); X.callSupport(off, { s: 'barrage', x: 0, z: 0 }); const one = cd.barrage - X.tickNo();
  R.cdFull = full; R.cdOneCut = one; ck('cutLengthensCooldown', full > 0 && one > full * 1.25);
  for (const [, l] of lines(0)) X.phoneSet(l, 0, true, enemy); cd.barrage = 0; const cp0 = X.cmdPts()[0];
  X.callSupport(off, { s: 'barrage', x: 0, z: 0 }); ck('noLineNoArtillery', cd.barrage === 0 && X.cmdPts()[0] === cp0);
  // breaks mend themselves after a while
  for (const k of X.phoneCut.keys()) X.phoneCut.set(k, X.tickNo() - 121 * 20); X.phoneAutofix(); ck('autoSplice', X.phoneCut.size === 0);
  X.phoneSet(l0, 0, true, enemy); X.resetRound(); ck('resetClears', X.phoneCut.size === 0);
  console.log(JSON.stringify(R)); const bad = Object.keys(R).filter(k => R[k] === false); console.log(bad.length ? 'FAILED: ' + bad.join(', ') : 'ALL ' + Object.keys(R).filter(k => typeof R[k] === 'boolean').length + ' CHECKS PASSED'); process.exit(bad.length ? 1 : 0);
})().catch(e => { console.log('TEST ERROR', e); process.exit(1); });
