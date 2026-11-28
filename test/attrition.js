'use strict';
// v0.49 Attrition: like Operations but both sides attack. At the start only each side's home line is held, the four lines between
// are neutral. A side can take the line next to its front (neutral or enemy); an enemy line goes neutral first; lines can be
// retaken; taking the enemy's home line wins.
process.argv = ['node', 'x', '--port', '8092', '--fill', '0', '--no-fetch', '--maps', 'classic', '--data', require('fs').mkdtempSync(require('path').join(require('os').tmpdir(), 't128at-'))];
process.env.T128_TEST = '1';
const S = require('../server.js'), X = S._test, V = X.vt, T = require('../shared.js');
const sleep = ms => new Promise(r => setTimeout(r, ms)), R = {}, ck = (k, v) => { R[k] = !!v; };
let nid = 9800;
const mk = (team, o) => { const p = { id: nid++, team, bot: false, name: 'A' + nid, cls: 'rifleman', w: 'bolt', u: 'bandage', sq: 0, spawnPick: null, usePost: false, xp: 0, sp: [0, 0], deployed: true, q: [], ack: 0, ws: { open: true, socket: { writableLength: 0, write() { }, cork() { }, uncork() { } } } };
  X.ents.set(p.id, p); X.humans.add(p); X.spawnEnt(p); p.hp = p.hp0 = 1e9; return p; };
const put = (men, o) => men.forEach((m, k) => { m.alive = true; m.hp = 1e9; m.x = o.x - 6 + k * 3; m.z = X.lineZ ? X.lineZ(o, m.x) : o.z; m.y = T.hAt(X.terr().H, m.x, m.z); });
const own = () => X.OB.map(o => o.owner).join(',');
(async () => {
  await sleep(800); V.setMode('attrition'); X.resetRound(); await sleep(300);
  R.start = own(); ck('startHomeOnly', own() === '0,-1,-1,-1,-1,1' && !V.op() && V.gameMode() === 'attr');
  ck('chainRule', V.canCap(1, 0) && !V.canCap(2, 0) && V.canCap(4, 1) && !V.canCap(3, 1));
  ck('botsPushNext', V.attrNext(0) === X.OB[1] && V.attrNext(1) === X.OB[4]);
  const blue = [mk(0), mk(0), mk(0)], red = [mk(1), mk(1), mk(1)];
  for (const e of X.ents.values()) if (e.bot) e.alive = false;
  red.forEach(m => { m.alive = false; m.x = 999; });
  put(blue, X.OB[1]); for (let i = 0; i < 80 && X.OB[1].owner !== 0; i++) { put(blue, X.OB[1]); await sleep(100); }
  ck('blueTakesLine2', X.OB[1].owner === 0); R.after1 = own();
  // red retakes it: neutral first, then red
  blue.forEach(m => { m.alive = false; m.x = 999; }); X.OB[2].owner = 1; X.OB[2].p = -1; X.OB[1].lock = 0;
  let wentNeutral = false; for (let i = 0; i < 160 && X.OB[1].owner !== 1; i++) { put(red, X.OB[1]); await sleep(100); if (X.OB[1].owner === -1) wentNeutral = true; }
  ck('neutralFirst', wentNeutral); ck('redRetakes', X.OB[1].owner === 1); R.after2 = own();
  // blue takes everything up to red's home: the round ends with blue winning
  red.forEach(m => { m.alive = false; m.x = 999; });
  X.OB.forEach((o, i) => { if (i < 5) { o.owner = 0; o.p = 1; o.lock = 0; } }); X.OB[5].lock = 0;
  for (let i = 0; i < 160 && V.round().state === 'play'; i++) { put(blue, X.OB[5]); await sleep(100); }
  ck('homeLineWins', V.round().state === 'ended' && V.round().win === 0);
  console.log(JSON.stringify(R)); const bad = Object.keys(R).filter(k => R[k] === false); console.log(bad.length ? 'FAILED: ' + bad.join(', ') : 'ALL ' + Object.keys(R).filter(k => typeof R[k] === 'boolean').length + ' CHECKS PASSED'); process.exit(bad.length ? 1 : 0);
})().catch(e => { console.log('TEST ERROR', e); process.exit(1); });
