'use strict';
// v0.47.1 /stuck: a player ends his own life to respawn (chat command or the class-page button). Not under fire, once a minute,
// no killer credited, never broadcast as chat.
process.argv = ['node', 'x', '--port', '8091', '--fill', '0', '--no-fetch', '--data', require('fs').mkdtempSync(require('path').join(require('os').tmpdir(), 't128st-'))];
process.env.T128_TEST = '1';
const S = require('../server.js'), X = S._test, P = X.pkt;
const sleep = ms => new Promise(r => setTimeout(r, ms)), R = {}, ck = (k, v) => { R[k] = !!v; };
let nid = 9950;
const mk = name => { const out = [], p = { id: nid++, team: 0, bot: false, name, cls: 'rifleman', w: 'bolt', u: 'bandage', sq: 0, spawnPick: null, usePost: false, xp: 0, sp: [0, 0], deployed: true, q: [], ack: 0, msgs: out };
  p.ws = { open: true, socket: { writableLength: 0, write(b) { try { const n = b[1] & 127, off = n === 126 ? 4 : n === 127 ? 10 : 2; if ((b[0] & 15) === 1) out.push(JSON.parse(b.subarray(off).toString('utf8'))); } catch (e) { } }, cork() { }, uncork() { } } };
  X.ents.set(p.id, p); X.humans.add(p); X.spawnEnt(p); return p; };
const said = (p, re) => p.msgs.some(m => (m.t === 'msg' || m.t === 'tell') && re.test(m.m));
(async () => {
  await sleep(600); const a = mk('Stucky'), b = mk('Watcher');
  a.hurtAt = X.tickNo ? 0 : 0; a.hurtAt = undefined;
  P.chatMsg(a, { m: '/stuck' }); ck('respawns', !a.alive && a.rt > 0); ck('notBroadcast', !b.msgs.some(m => m.t === 'chat'));
  ck('feedSaysRespawned', b.msgs.some(m => m.t === 'kf' && m.w === 'stuck' && !m.a));
  a.alive = true; a.hp = 100; P.chatMsg(a, { m: '/respawn' }); ck('onceAMinute', a.alive && a.msgs.some(m => /Once a minute/.test(m.m || '')));
  const c = mk('Shot'); P.damage(c, 5, b, false, null); X.onAct(c, 'stuck', {}); ck('notUnderFire', c.alive && c.msgs.some(m => /Not under fire/.test(m.m || '')));
  P.chatMsg(c, { m: '/help' }); ck('help', c.msgs.some(m => /\/stuck/.test(m.m || '')));
  console.log(JSON.stringify(R)); const bad = Object.keys(R).filter(k => R[k] === false); console.log(bad.length ? 'FAILED: ' + bad.join(', ') : 'ALL ' + Object.keys(R).filter(k => typeof R[k] === 'boolean').length + ' CHECKS PASSED'); process.exit(bad.length ? 1 : 0);
})().catch(e => { console.log('TEST ERROR', e); process.exit(1); });
