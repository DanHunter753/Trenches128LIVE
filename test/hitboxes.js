'use strict';
// v0.41 hit boxes match the drawn soldier: head shots register as headshots on the head and not on the chest, for standing
// and kneeling men and for men on a machine gun; a kneeling man's whole head (up to 1.38 m) can be hit.
process.argv = ['node', 'x', '--port', '8085', '--fill', '0', '--no-fetch', '--data', require('fs').mkdtempSync(require('path').join(require('os').tmpdir(), 't128hb-'))];
process.env.T128_TEST = '1';
const S = require('../server.js'), X = S._test, T = require('../shared.js');
const sleep = ms => new Promise(r => setTimeout(r, ms)), R = {}, ck = (k, v) => { R[k] = !!v; };
let nid = 9600;
const mk = (cls, w, team, name) => { const out = [], p = { id: nid++, team: team || 0, bot: false, name: name || cls, cls, w, u: 'bandage', sq: 0, spawnPick: null, usePost: false, xp: 0, ws: null, sp: [0, 0], deployed: true, q: [], ack: 0, msgs: out };
  p.ws = { open: true, socket: { writableLength: 0, write(b) { try { const n = b[1] & 127, off = n === 126 ? 4 : n === 127 ? 10 : 2; if ((b[0] & 15) === 1) out.push(JSON.parse(b.subarray(off).toString('utf8'))); } catch (e) { } }, cork() { }, uncork() { } } };
  X.ents.set(p.id, p); X.humans.add(p); X.spawnEnt(p); return p; };
const at = (p, x, z) => { p.x = x; p.z = z; p.y = T.hAt(X.terr().H, x, z); p.vy = 0; };
(async () => {
  await sleep(1500);
  const sh = mk('rifleman', 'bolt', 0, 'Shooter'), tg = mk('rifleman', 'bolt', 1, 'Target');
  // a flat, open spot with no trench or parapet in the way
  const shoot = async h => { await sleep(100); tg.hp = 100; sh.msgs.length = 0; X.fireBullet(sh, tg.x + 20, tg.y + h, tg.z, Math.PI / 2, 0, 60, 10, 'carbine', 700); for (let i = 0; i < 40; i++) X.bulletsTick(); X.bullets.length = 0; return tg.hp < 100 ? (sh.msgs.some(m => m.t === 'hm' && m.h === 1) ? 'head' : 'body') : 'miss'; };
  at(tg, 0, 100); tg.crouch = false;
  const st = {}; for (const h of [1.0, 1.3, 1.5, 1.6, 1.75, 1.82]) st[h] = await shoot(h); R.stand = st;
  ck('standChestIsBody', st[1.0] === 'body' && st[1.3] === 'body' && st[1.5] === 'body');
  ck('standHeadIsHead', st[1.6] === 'head' && st[1.75] === 'head' && st[1.82] === 'head');
  tg.crouch = true; const kn = {};
  for (const h of [.9, 1.0, 1.05, 1.15, 1.3, 1.36]) kn[h] = await shoot(h); R.kneel = kn;
  ck('kneelChestIsBody', kn[.9] === 'body' && kn[1.0] === 'body' && kn[1.05] === 'body');
  ck('kneelHeadIsHead', kn[1.15] === 'head' && kn[1.3] === 'head' && kn[1.36] === 'head');
  tg.crouch = false; const nest = T.NEST.find(n => n.team === 1); at(tg, nest.x, nest.z); tg.mg = T.NEST.indexOf(nest); const mgs = {};
  for (const h of [1.0, 1.4, 1.7]) mgs[h] = await shoot(h); R.nest = mgs;
  ck('nestGunnerSameBoxes', mgs[1.0] === 'body' && mgs[1.4] === 'body' && mgs[1.7] === 'head');
  console.log(JSON.stringify(R)); const bad = Object.keys(R).filter(k => R[k] === false); console.log(bad.length ? 'FAILED: ' + bad.join(', ') : 'ALL ' + Object.keys(R).filter(k => typeof R[k] === 'boolean').length + ' CHECKS PASSED'); process.exit(bad.length ? 1 : 0);
})().catch(e => { console.log('TEST ERROR', e); process.exit(1); });
