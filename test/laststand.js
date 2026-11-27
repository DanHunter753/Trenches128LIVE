'use strict';
// v0.40 last stand: a downed player crawls and fires a slow six-round revolver; enemies can finish a downed man off with
// bullets, a bayonet or a blast (teammates cannot); a medic's revive still works.
process.argv = ['node', 'x', '--port', '8088', '--fill', '0', '--no-fetch', '--data', require('fs').mkdtempSync(require('path').join(require('os').tmpdir(), 't128ls-'))];
process.env.T128_TEST = '1';
const S = require('../server.js'), X = S._test, T = require('../shared.js');
const sleep = ms => new Promise(r => setTimeout(r, ms)), R = {}, ck = (k, v) => { R[k] = !!v; };
let nid = 9600, seq = 1;
const mk = (cls, w, team, name) => { const out = [], p = { id: nid++, team: team || 0, bot: false, name: name || cls, cls, w, u: 'bandage', sq: 0, spawnPick: null, usePost: false, xp: 0, ws: null, sp: [0, 0], deployed: true, q: [], ack: 0, msgs: out };
  p.ws = { open: true, socket: { writableLength: 0, write(b) { try { const n = b[1] & 127, off = n === 126 ? 4 : n === 127 ? 10 : 2; if ((b[0] & 15) === 1) out.push(JSON.parse(b.subarray(off).toString('utf8'))); } catch (e) { } }, cork() { }, uncork() { } } };
  X.ents.set(p.id, p); X.humans.add(p); X.spawnEnt(p); return p; };
const at = (p, x, z, yaw) => { p.x = x; p.z = z; p.y = T.hAt(X.terr().H, x, z); p.vy = 0; if (yaw != null) p.yaw = yaw; };
const feed = async (p, n, f, bits, yaw, pitch) => { for (let i = 0; i < n; i++) { p.q.push([++seq, 50, f, 0, bits, yaw, pitch || 0]); await sleep(50); } };   // one 50 ms input per tick, like a real client
  const pull = async (p, yaw, pitch) => { await feed(p, 1, 0, 0, yaw, pitch); await feed(p, 2, 0, 8, yaw, pitch); };
(async () => {
  await sleep(1500); X.setSupply(0, 100); X.setSupply(1, 100);
  const a = mk('rifleman', 'bolt', 0, 'Tommy'), red = mk('rifleman', 'bolt', 1, 'Fritz'), red2 = mk('rifleman', 'bolt', 1, 'Hans'), mate = mk('rifleman', 'bolt', 0, 'Bert'), med = mk('medic', 'carbine', 0, 'Doc');
  at(a, 0, 125, -Math.PI / 2); at(red, 12, 125, Math.PI / 2); at(red2, 60, 140); at(mate, -6, 125, -Math.PI / 2); at(med, 0, 140);
  X.downEnt(a, red); ck('downWithRevolver', a.down > 0 && !a.alive && a.ps && a.ps.ammo === 6 && a.dhp === X.DOWN_HP);
  // crawl: 2 s of "forward" moves him about 1.2 m (0.6 m/s), not the 9 m a walk would
  const x0 = a.x; await feed(a, 40, 1, 0, -Math.PI / 2); await sleep(150); R.crawled = +(a.x - x0).toFixed(2); ck('crawls', a.x - x0 > .8 && a.x - x0 < 1.6);
  // the revolver: a held trigger fires once; shots are 1.1 s apart; an enemy 11 m off is hit for 30
  red.x = a.x + 11; red.z = a.z; red.y = T.hAt(X.terr().H, red.x, red.z); await sleep(120); const hp0 = red.hp, aim = Math.atan2((red.y + 1.1) - (a.y + .45), 11), Y = -Math.PI / 2;
  await feed(a, 1, 0, 0, Y, aim); await feed(a, 8, 0, 8, Y, aim); await sleep(100); ck('oneShotPerPull', a.ps.ammo === 5);
  await pull(a, Y, aim); ck('slowRateOfFire', a.ps.ammo === 5);                       // 0.15 s later: still cooling down
  await feed(a, 22, 0, 0, Y, aim); await pull(a, Y, aim); await sleep(300); ck('secondShotAfterDelay', a.ps.ammo === 4);
  R.redHp = red.hp; ck('revolverHits', hp0 - red.hp >= X.PISTOL.dmg && (hp0 - red.hp) % X.PISTOL.dmg === 0);
  a.ps.ammo = 0; a.ps.cd = 0; await pull(a, Y, aim); ck('emptyStartsLongReload', a.ps.rel > 3 && a.ps.ammo === 0);
  await feed(a, 60, 0, 0, Y, aim); ck('stillReloadingAt3s', a.ps.rel > 0 && a.ps.ammo === 0); await feed(a, 24, 0, 0, Y, aim); ck('reloaded', a.ps.ammo === 6 && a.ps.rel === 0);
  // finishing off: a teammate's bullets do nothing; an enemy's two rifle hits do it
  ck('teammateCannotFinish', X.finishHit(a, 100, mate) === false && a.down > 0);
  at(red, a.x + 8, a.z, Math.PI / 2); await sleep(120); red.cd = 0; red.rel = 0; red.ammo = 8; red.sprOut = 0; red.pitch = Math.atan2((a.y + .25) - (red.y + 1.65), 8); const sc0 = red.st ? red.st.sc : 0;
  X.fireWeapon(red); await sleep(300); R.dhp = a.dhp; ck('enemyBulletWounds', a.down > 0 && a.dhp === X.DOWN_HP - 50);
  red.cd = 0; X.fireWeapon(red); await sleep(300); ck('secondHitFinishes', !(a.down > 0) && !a.alive && a.msgs.some(m => m.t === 'dead' && /Fritz, who finished you off/.test(m.by)) && red.msgs.some(m => m.t === 'msg' && /Finished off Tommy/.test(m.m)) && red.st.sc === sc0 + 3);
  // bayonet and blast
  const b = mk('rifleman', 'bolt', 0, 'Alf'); at(b, 20, 150); at(red2, 21.2, 150, Math.PI / 2); X.downEnt(b, red2); await sleep(120); red2.mcd = 0; X.meleeStrike(red2); ck('bayonetFinishes', !(b.down > 0));
  const c = mk('rifleman', 'bolt', 0, 'Sid'); at(c, -40, 150); X.downEnt(c, red2); await sleep(120); X.explode(c.x + 1, c.z, red2); ck('blastFinishes', !(c.down > 0));
  // a medic can still revive a man who is making his last stand
  const d = mk('rifleman', 'bolt', 0, 'Reg'); at(d, 0, 160); X.downEnt(d, red2); X.reviveEnt(d, med); ck('reviveStillWorks', d.alive && d.down === 0);
  console.log(JSON.stringify(R)); const bad = Object.keys(R).filter(k => R[k] === false); console.log(bad.length ? 'FAILED: ' + bad.join(', ') : 'ALL ' + Object.keys(R).filter(k => typeof R[k] === 'boolean').length + ' CHECKS PASSED'); process.exit(bad.length ? 1 : 0);
})().catch(e => { console.log('TEST ERROR', e); process.exit(1); });
