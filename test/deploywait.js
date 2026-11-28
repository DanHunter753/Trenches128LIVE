'use strict';
// v0.50: a player (current page) respawns only when he presses Deploy, after the respawn wait, so he has time to pick a spot or
// change class. Older pages (and test soldiers) still respawn on the timer.
process.argv = ['node', 'x', '--port', '8079', '--fill', '0', '--no-fetch', '--data', require('fs').mkdtempSync(require('path').join(require('os').tmpdir(), 't128dw-'))];
process.env.T128_TEST = '1';
const S = require('../server.js'), X = S._test;
const sleep = ms => new Promise(r => setTimeout(r, ms)), R = {}, ck = (k, v) => { R[k] = !!v; };
let nid = 9500;
const mk = rdy => { const p = { id: nid++, team: 0, bot: false, name: 'D' + nid, cls: 'rifleman', w: 'bolt', u: 'bandage', sq: 0, spawnPick: null, usePost: false, xp: 0, sp: [0, 0], deployed: true, q: [], ack: 0, rdy, ws: { open: true, socket: { writableLength: 0, write() { }, cork() { }, uncork() { } } } };
  X.ents.set(p.id, p); X.humans.add(p); X.spawnEnt(p); return p; };
(async () => {
  await sleep(600); const a = mk(true), old = mk(false);
  a.hurtAt = old.hurtAt = undefined; X.onAct(a, 'stuck', {}); X.onAct(old, 'stuck', {});
  await sleep(6500); ck('waitsForDeploy', !a.alive); ck('oldPageStillAuto', old.alive);
  X.onAct(a, 'deploy', { id: 0 }); await sleep(400); ck('deployRespawns', a.alive);
  // pressing Deploy early: respawns as soon as the wait is over
  a.stuckAt = 0; a.hurtAt = undefined; X.onAct(a, 'stuck', {}); X.onAct(a, 'deploy', {}); await sleep(1500); ck('earlyDeployWaits', !a.alive); await sleep(4500); ck('earlyDeployThenSpawns', a.alive);
  console.log(JSON.stringify(R)); const bad = Object.keys(R).filter(k => R[k] === false); console.log(bad.length ? 'FAILED: ' + bad.join(', ') : 'ALL ' + Object.keys(R).filter(k => typeof R[k] === 'boolean').length + ' CHECKS PASSED'); process.exit(bad.length ? 1 : 0);
})().catch(e => { console.log('TEST ERROR', e); process.exit(1); });
