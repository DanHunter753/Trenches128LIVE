'use strict';
// v0.49 map vote: at the end of a round three cards (Trenches·Operation, Trenches·Attrition, Wake Atoll·Domination) with their
// time and weather; players vote (and can change); the most votes wins; with no votes the map is random between trenches and Wake.
process.argv = ['node', 'x', '--port', '8093', '--fill', '0', '--no-fetch', '--maps', 'vote', '--data', require('fs').mkdtempSync(require('path').join(require('os').tmpdir(), 't128vt-'))];
process.env.T128_TEST = '1';
const S = require('../server.js'), X = S._test, V = X.vt, T = require('../shared.js');
const sleep = ms => new Promise(r => setTimeout(r, ms)), R = {}, ck = (k, v) => { R[k] = !!v; };
let nid = 9700;
const mk = team => { const out = [], p = { id: nid++, team, bot: false, name: 'V' + nid, cls: 'rifleman', w: 'bolt', u: 'bandage', sq: 0, spawnPick: null, usePost: false, xp: 0, sp: [0, 0], deployed: true, q: [], ack: 0, msgs: out };
  p.ws = { open: true, socket: { writableLength: 0, write(b) { try { const n = b[1] & 127, off = n === 126 ? 4 : n === 127 ? 10 : 2; if ((b[0] & 15) === 1) out.push(JSON.parse(b.subarray(off).toString('utf8'))); } catch (e) { } }, cork() { }, uncork() { } } };
  X.ents.set(p.id, p); X.humans.add(p); X.spawnEnt(p); return p; };
(async () => {
  await sleep(800); const a = mk(0), b = mk(1), c = mk(0);
  X.endRound(0); await sleep(100); const v = V.vote(), m = a.msgs.filter(x => x.t === 'vote').pop();
  ck('cards', v && m && m.o.length === 3 && m.o.map(o => o.g).join() === 'OPERATION,ATTRITION,DOMINATION' && m.o.every(o => /\d\d:\d\d/.test(o.tm) && T.WXS[o.wx]) && m.s >= 15);
  V.voteCast(a, 2); V.voteCast(b, 2); V.voteCast(c, 1); V.voteCast(c, 0); await sleep(50);
  const m2 = b.msgs.filter(x => x.t === 'vote').pop(); ck('countsLive', m2.c.join() === '1,0,2' && m2.my === 2);
  const wx = v.opts[2].wx; v.until = Date.now() - 1; await sleep(200);
  ck('winnerPicked', v.done === 2 && a.msgs.filter(x => x.t === 'vote').pop().done === 2);
  for (let i = 0; i < 200 && V.round().state !== 'play'; i++) await sleep(50);
  ck('wakeLoaded', T.MP.kind === 'wake' && V.gameMode() === 'dom' && T.WX.k === wx);
  // next round: Attrition wins the vote
  X.endRound(1); await sleep(100); V.voteCast(a, 1); V.vote().until = Date.now() - 1; for (let i = 0; i < 200 && V.round().state !== 'play'; i++) await sleep(50);
  ck('attritionLoaded', T.MP.kind === 'trench' && V.gameMode() === 'attr' && X.OB.map(o => o.owner).join() === '0,-1,-1,-1,-1,1');
  // nobody votes: the map is random between trenches and Wake
  const seen = { trench: 0, wake: 0 }; for (let k = 0; k < 40; k++) { V.voteStart(); V.vote().until = 0; V.voteTick(); seen[V.vote().opts[V.vote().done].map]++; }
  R.noVotes = seen; ck('randomWhenNoVotes', seen.trench > 8 && seen.wake > 8);
  console.log(JSON.stringify(R)); const bad = Object.keys(R).filter(k => R[k] === false); console.log(bad.length ? 'FAILED: ' + bad.join(', ') : 'ALL ' + Object.keys(R).filter(k => typeof R[k] === 'boolean').length + ' CHECKS PASSED'); process.exit(bad.length ? 1 : 0);
})().catch(e => { console.log('TEST ERROR', e); process.exit(1); });
