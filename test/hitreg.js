'use strict';
// v0.50 hit registration: a player's rifle round is checked against where targets were on his screen when he fired (his lag plus
// the round's flight), so a long shot on a running man lands without leading him. A round that runs out of reach with an enemy
// further down the line tells the shooter "out of range".
process.argv = ['node', 'x', '--port', '8081', '--fill', '0', '--no-fetch', '--maps', 'wake', '--data', require('fs').mkdtempSync(require('path').join(require('os').tmpdir(), 't128hr-'))];
process.env.T128_TEST = '1';
const S = require('../server.js'), X = S._test, T = require('../shared.js');
const sleep = ms => new Promise(r => setTimeout(r, ms)), R = {}, ck = (k, v) => { R[k] = !!v; };
let nid = 9600;
const mk = (team, cls, w) => { const out = [], p = { id: nid++, team, bot: false, name: 'H' + nid, cls, w, u: 'bandage', sq: 0, spawnPick: null, usePost: false, xp: 0, sp: [0, 0], deployed: true, q: [], ack: 0, msgs: out };
  p.ws = { open: true, socket: { writableLength: 0, write(b) { try { const n = b[1] & 127, off = n === 126 ? 4 : n === 127 ? 10 : 2; if ((b[0] & 15) === 1) out.push(JSON.parse(b.subarray(off).toString('utf8'))); } catch (e) { } }, cork() { }, uncork() { } } };
  X.ents.set(p.id, p); X.humans.add(p); X.spawnEnt(p); return p; };
const aimAt = (a, x, y, z) => { const ey = a.y + 1.65; a.yaw = Math.atan2(-(x - a.x), -(z - a.z)); a.pitch = Math.atan2(y - ey, Math.hypot(x - a.x, z - a.z)); };
(async () => {
  await sleep(800); for (const e of X.ents.values()) if (e.bot) e.alive = false;
  const res = [];
  for (const [d, wk, cls] of [[150, 'bolt', 'rifleman'], [250, 'sniper', 'recon'], [350, 'sniper', 'recon'], [200, 'mark', 'recon']]) {
    const a = mk(0, cls, wk), b = mk(1, 'rifleman', 'bolt'); let run = true, bx = -60;
    const mv = setInterval(() => { if (!run) return; bx += .3; b.x = bx; b.z = -100 + d; b.y = 60; b.vy = 0; b.hp = Math.max(b.hp, 1); }, 50);   // running sideways, 6 m/s
    a.x = 0; a.z = -100; a.y = 60; a.vy = 0; await sleep(600);
    a.ads = true; a.crouch = false; a.ammo = 5; a.cd = 0; a.rel = 0; a.supp = 0; a.bloom = 0; a.rw = 2; b.hp = 1000; const hp0 = b.hp;
    aimAt(a, b.x, b.y + 1.25, b.z); X.pkt.fireWeapon(a); await sleep(900); run = false; clearInterval(mv);
    res.push(d + 'm ' + wk + ':' + (hp0 - b.hp)); R[wk + d] = hp0 - b.hp > 0;
    X.ents.delete(a.id); X.humans.delete(a); X.ents.delete(b.id); X.humans.delete(b);
  }
  R.hits = res.join(' '); ck('runningTargetsHitWithoutLead', res.every(r => !/:0$/.test(r)));
  // out of range: an SMG at a man 120 m away
  const s = mk(0, 'assault', 'smg'), t = mk(1, 'rifleman', 'bolt'); s.x = 0; s.z = -100; s.y = 60; t.x = 0; t.z = 20; t.y = 60; await sleep(300); s.x = 0; s.z = -100; s.y = 60; t.x = 0; t.z = 20; t.y = 60;
  s.ads = true; s.ammo = 20; s.cd = 0; s.rel = 0; aimAt(s, t.x, t.y + 1.2, t.z); X.pkt.fireWeapon(s); await sleep(300);
  const far = s.msgs.find(m => m.t === 'far'); R.far = far; ck('outOfRangeNotice', far && far.r === T.WPN.smg.rng && far.d > 100 && far.d < 140 && far.w === 'smg');
  console.log(JSON.stringify(R)); const bad = Object.keys(R).filter(k => R[k] === false); console.log(bad.length ? 'FAILED: ' + bad.join(', ') : 'ALL ' + Object.keys(R).filter(k => typeof R[k] === 'boolean').length + ' CHECKS PASSED'); process.exit(bad.length ? 1 : 0);
})().catch(e => { console.log('TEST ERROR', e); process.exit(1); });
