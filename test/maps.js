'use strict';
// v0.30 procedural maps, in-process: a random layout per round, generated in a worker during the end screen and swapped in at
// the reset; objectives, depots, nests and guns follow it; players get a rejoin ticket that keeps their side; bots still find
// their way on the new map; seed 0 is the classic map.
process.argv = ['node', 'x', '--port', '8075', '--fill', '10', '--no-fetch', '--maps', 'random', '--data', require('fs').mkdtempSync(require('path').join(require('os').tmpdir(), 't128mp-'))];
const S = require('../server.js'), T = require('../shared.js'), X = S._test;
const sleep = ms => new Promise(r => setTimeout(r, ms)), R = {}, ck = (k, v) => { R[k] = !!v; };
function client(name, extra) {
  return new Promise(res => { const ws = new WebSocket('ws://localhost:8075'), c = { ws, msgs: [] }; ws.binaryType = 'arraybuffer';
    ws.onopen = () => ws.send(JSON.stringify({ t: 'hello', name, ...(extra || {}) }));
    ws.onmessage = ev => { if (typeof ev.data !== 'string') return; const m = JSON.parse(ev.data); c.msgs.push(m); if (m.t === 'prof') res(c); if (m.t === 'err') res({ err: m.m, ws }); };
    setTimeout(() => res(c), 3000); });
}
(async () => {
  await sleep(600);
  const s0 = X.mapSeed(); ck('randomFirstMap', s0 > 0 && T.MP.seed === s0);
  const h = await (await fetch('http://localhost:8075/health')).json(); ck('healthShowsMap', h.map === s0);
  const A = await client('MapTester'); const pr = A.msgs.find(m => m.t === 'prof'); ck('profCarriesMap', pr && pr.map === s0);
  A.ws.send(JSON.stringify({ t: 'join', cls: 'rifleman', w: 'bolt', u: 'bandage', sq: 2 })); await sleep(500);
  const me = [...X.humans].find(p => p.name === 'MapTester'), team0 = me.team, sq0 = me.sq;
  const ob0 = X.OB.map(o => [o.x, o.z]);
  // end of round: the next map is built off the main thread
  X.endRound(0); for (let i = 0; i < 40 && !(X.nextMap() && X.nextMap().H); i++) await sleep(100);
  ck('workerBuiltNextMap', X.nextMap() && X.nextMap().H instanceof Float32Array);
  const t0 = Date.now(); X.resetRound(); const resetMs = Date.now() - t0; R.resetMs = resetMs; ck('resetIsQuick', resetMs < 400);
  const s1 = X.mapSeed(); ck('newMap', s1 > 0 && s1 !== s0 && T.MP.seed === s1);
  const ref = T.terrainFor(s1); T.setMap(s1); T.adoptTerrain(ref.H, ref.F);   // (the worker's map must equal one built here)
  let diff = 0; const H = X.terrH(); for (let i = 0; i < H.length; i += 7) diff = Math.max(diff, Math.abs(H[i] - ref.H[i])); ck('workerMapIdentical', diff === 0);
  ck('objectivesMoved', X.OB.every((o, i) => o.x === T.OBJ[i].x && o.z === T.OBJ[i].z) && X.OB.some((o, i) => o.x !== ob0[i][0]));
  ck('depotsMoved', X.DP.every((d, i) => d.x === T.DEPOTS[i].x && d.n === T.DEPOTS[i].n));
  ck('nestsMoved', T.NEST.every((n, i) => X.NESTS[i].x === n.x && X.NESTS[i].z === n.z));
  const guns = X.VEHM().V.filter(v => v.k !== 'tank'); ck('gunsMoved', guns.length === T.EMPL.length && guns.every((v, i) => v.x === T.EMPL[i].x && v.z === T.EMPL[i].z));
  await sleep(200); const rs = A.msgs.filter(m => m.t === 'reset').pop(); ck('resetSaysMapAndTicket', rs && rs.map === s1 && typeof rs.rj === 'string' && rs.rj.length === 24);
  // the client reloads: old socket closes, a new one comes back with the ticket and keeps its side
  A.ws.close(); await sleep(400);
  const B = await client('MapTester', { rj: rs.rj }); const pb = B.msgs && B.msgs.find(m => m.t === 'prof'); ck('rejoinKeepsSide', pb && pb.team === team0 && pb.back === sq0 && pb.map === s1);
  B.ws.close(); await sleep(300);
  const C = await client('MapTester', { rj: rs.rj }); ck('ticketSingleUse', C.msgs && C.msgs.find(m => m.t === 'prof') && !X.rejoins.has(rs.rj)); C.ws.close();
  const D = await client('Imposter', { rj: X.rejoinTicket ? 'x' : 'nope' }); ck('badTicketIgnored', D.msgs && D.msgs.find(m => m.t === 'prof')); D.ws.close();
  // bots fight on the new map: alive and moving after a few seconds
  const pos = new Map([...X.ents.values()].filter(e => e.bot).map(e => [e.id, [e.x, e.z]])); await sleep(9000);
  const bots = [...X.ents.values()].filter(e => e.bot), alive = bots.filter(e => e.alive), moved = alive.filter(e => { const p = pos.get(e.id); return p && Math.hypot(e.x - p[0], e.z - p[1]) > 3; });
  R.bots = alive.length + ' alive, ' + moved.length + ' moved'; ck('botsPlayOnNewMap', alive.length >= bots.length * .6 && moved.length >= alive.length * .4);
  // seed 0 is the classic map
  T.setMap(0); ck('classicSeed', T.OBX.join() === '-52,34,-18,22,-44,58' && T.NEST[0].x === -84);
  console.log(JSON.stringify(R)); const bad = Object.keys(R).filter(k => R[k] === false); console.log(bad.length ? 'FAILED: ' + bad.join(', ') : 'ALL ' + Object.keys(R).filter(k => typeof R[k] === 'boolean').length + ' CHECKS PASSED'); process.exit(bad.length ? 1 : 0);
})().catch(e => { console.log('TEST ERROR', e); process.exit(1); });
