'use strict';
// In-process test (v0.26): field guns and mortars (crew, seats, shells, range), tanks (seats, driving, armour vs bullets,
// anti-tank rifle and bundle charges, crushing, knock-out and bail-out, wire), AI gun crews, Operations ground loss,
// elite kits (crates, pickup, flamethrower burn, sentry cannot sprint, kit lost on death, bots fetch crates),
// weather (sight, flares, rain mud, flare pistol, star shells) and the officer's tank call-in.
const fs = require('fs'), path = require('path');
fs.writeFileSync(path.join(__dirname, '..', 'xp.json'), JSON.stringify({ vha: 400, vhb: 400, vhoff: 900 }));
process.argv = ['node', 'x', '--port', '8087', '--fill', '10']; process.env.T128_WX = 'overcast';
const S = require('../server.js'); const T = require('../shared.js');
fs.unlinkSync(path.join(__dirname, '..', 'xp.json'));
const sleep = ms => new Promise(r => setTimeout(r, ms)); const R = {}; const ck = (k, v) => { R[k] = !!v; };
function client(name, team, join) {
  return new Promise(res => {
    const c = { name, msgs: [] }; const ws = new WebSocket('ws://localhost:8087'); ws.binaryType = 'arraybuffer';
    ws.onopen = () => ws.send(JSON.stringify({ t: 'hello', name }));
    ws.onmessage = ev => { if (typeof ev.data !== 'string') return; const m = JSON.parse(ev.data); c.msgs.push(m);
      if (m.t === 'prof') { const e = [...S._test.humans].find(h => h.name === name); e.team = team; ws.send(JSON.stringify({ t: 'join', ...join })); }
      if (m.t === 'w') res(c); };
    c.send = o => ws.send(JSON.stringify(o)); c.ent = () => [...S._test.humans].find(h => h.name === name);
    c.got = (t, f) => c.msgs.filter(m => m.t === t && (!f || f(m)));
  });
}
const place = (e, x, z, y) => { e.x = x; e.z = z; e.y = y != null ? y : T.hAt(S._test.terrH(), x, z); e.vy = 0; e.cl = null; e.pitch = 0; };
let seq = 1000;
const input = (c, f, s, bits, yaw, pitch, n) => { const cmds = []; for (let i = 0; i < (n || 1); i++) cmds.push([seq++, 33, f, s, bits, yaw, pitch]); c.send({ t: 'in', c: cmds, rt: 0 }); };
(async () => {
  const A = await client('VhA', 0, { cls: 'rifleman', w: 'bolt', u: 'flare', sq: 0 });
  const B = await client('VhB', 0, { cls: 'rifleman', w: 'carbine', u: 'bandage', sq: 0 });
  const D = await client('VhD', 1, { cls: 'rifleman', w: 'bolt', u: 'bandage', sq: 0 });
  const O = await client('VhOff', 0, { cls: 'officer', w: 'carbine', u: 'bandage', sq: 0 });
  await sleep(1500); const X = S._test, V = X.VEHM(), a = A.ent(), b = B.ent(), d = D.ent();
  for (let i = 0; i < 20 && !(a.alive && b.alive && d.alive); i++) await sleep(250);
  X.setSupply(0, 300); X.setSupply(1, 300);
  // ---- emplacements
  const guns = V.V.filter(v => v.k === 'fgun' || v.k === 'mortar');   // (v0.33: planes are vehicles too)
  ck('emplacements', guns.filter(v => v.k === 'fgun').length === 4 && guns.filter(v => v.k === 'mortar').length === 4 && guns.every(v => v.crew && v.crew.gun === v && v.crew.mg === true));
  ck('joinGetsVehicles', A.got('vh', m => m.full && m.l.length >= 8).length >= 1);
  const fg = guns.find(v => v.k === 'fgun' && v.team === 0);
  place(a, fg.seat.x, fg.seat.z); A.send({ t: 'act', a: 'mg' }); await sleep(200);
  ck('enterFieldGun', a.veh === fg && A.got('veh', m => m.k === 'fgun').length === 1 && fg.crew.manned === true);
  { const s0 = X.supply()[0], n0 = A.got('shl').length; fg.rl = 0; input(A, 0, 0, 8, fg.base.yaw, .2, 2); await sleep(250); input(A, 0, 0, 0, fg.base.yaw, .2, 1);
    ck('fieldGunFires', A.got('shl').length === n0 + 1 && X.supply()[0] === s0 - 1 && Math.abs(fg.gp - .2) < .01);
    await sleep(3500); ck('shellBursts', A.got('shx').length >= 1); }
  A.send({ t: 'act', a: 'mg' }); await sleep(1500); A.send({ t: 'act', a: 'mg' }); await sleep(200);
  ck('leaveGun', !a.veh && fg.crew.manned === false || a.veh === fg);   // the second F may re-enter: either state is consistent
  if (a.veh) { A.send({ t: 'act', a: 'mg' }); await sleep(1400); }
  if (a.veh) { a.mgCd = 0; X.onAct(a, 'mg', {}); }
  const mo = guns.find(v => v.k === 'mortar' && v.team === 0);
  place(a, mo.seat.x, mo.seat.z); a.mgCd = 0; X.onAct(a, 'mg', {});
  input(A, 0, 0, 0, mo.base.yaw, .6, 1); await sleep(150); const rmax = mo.rng; input(A, 0, 0, 0, mo.base.yaw, -.5, 1); await sleep(150);
  ck('mortarRange', a.veh === mo && rmax === T.VEH.mortar.rmax && mo.rng === T.VEH.mortar.rmin);
  { input(A, 0, 0, 0, mo.base.yaw, .05, 1); await sleep(100); const want = mo.rng, n0 = A.got('cr').length; mo.rl = 0; input(A, 0, 0, 8, mo.base.yaw, .05, 1); await sleep(100); input(A, 0, 0, 0, mo.base.yaw, .05, 1);
    const yw = mo.base.yaw + mo.gy, px = mo.x - Math.sin(yw) * want, pz = mo.z - Math.cos(yw) * want;
    let cr = null; for (let i = 0; i < 40 && !cr; i++) { await sleep(150); cr = A.got('cr').slice(n0).find(m => Math.hypot(m.c[0] - px, m.c[1] - pz) < 25); }
    const dd = cr ? Math.hypot(cr.c[0] - mo.x, cr.c[1] - mo.z) : 0; ck('mortarLandsAtRange', cr && Math.abs(dd - want) < want * .15); }
  a.mgCd = 0; X.onAct(a, 'mg', {}); ck('leftMortar', !a.veh && !mo.crew.manned);
  // ---- tanks
  for (const v of V.tanks()) if (!v.dead) V.hurt(v, 1e9, null, 'test');
  await sleep(300); for (let i = V.V.length - 1; i >= 0; i--) if (V.V[i].k === 'tank') V.V.splice(i, 1);
  const tk = V.spawnTank(0, 'test'); place(tk, 0, 120); tk.y = T.hAt(X.terrH(), 0, 120); tk.yaw = 0; tk.order = { x: 0, z: 120 };
  ck('tankSpawned', tk && tk.crew && tk.crew.manned && tk.hp === T.VEH.tank.hp && V.spawnTank(0, 'again') === null);
  place(a, 3.5, 121); a.mgCd = 0; X.onAct(a, 'mg', {}); await sleep(150);
  ck('enterTank', a.veh === tk && a.seat === 0 && a.inV === true && A.got('veh', m => m.k === 'tank').length === 1);
  { const hp0 = a.hp; X.damage(a, 50, d); ck('crewProtected', a.hp === hp0 && a.alive); }
  { const x0 = tk.x, z0 = tk.z, y0 = tk.yaw; for (let i = 0; i < 22; i++) { input(A, 1, 0, 0, tk.yaw, 0, 3); await sleep(100); } const moved = Math.hypot(tk.x - x0, tk.z - z0);
    for (let i = 0; i < 12; i++) { input(A, 0, 1, 0, tk.yaw, 0, 3); await sleep(100); }
    ck('tankDrives', moved > 1.2 && Math.abs(tk.yaw - y0) > .2); input(A, 0, 0, 0, tk.yaw, 0, 2); await sleep(300); }
  ck('tankSnapshotHidesCrew', !d.sent || !d.sent.has(a.id));
  place(d, tk.x - Math.sin(tk.yaw) * 9, tk.z - Math.cos(tk.yaw) * 9); d.hp = 100;
  { const hp0 = tk.hp, nb = X.bullets.length, oy = tk.y + 1.4; const yaw = Math.atan2(-(tk.x - d.x), -(tk.z - d.z)), pt = Math.atan2(tk.y + 1.3 - oy, 9);
    let stopped = 0; for (let k = 0; k < 5; k++) { const b0 = X.fireBullet(d, d.x, oy, d.z, yaw, pt, 100, 50, 'bolt', 420); for (let i = 0; i < 10 && X.bullets.includes(b0); i++) X.bulletsTick(); if (!X.bullets.includes(b0) && Math.hypot(b0.x - d.x, b0.z - d.z) > 4) stopped++; }
    ck('bulletsBounce', tk.hp === hp0 && stopped === 5);
    X.giveElite(d, 'atr'); ck('eliteGiven', d.elite === 'atr' && d.w === 'atr' && d.hp === T.ELITE.atr.hp && (X.lookByte(d) & 7) === 7);
    const b0 = X.fireBullet(d, d.x, oy, d.z, yaw, pt, 260, 150, 'atr', 780); for (let i = 0; i < 20 && X.bullets.includes(b0); i++) X.bulletsTick();
    ck('atrPierces', Math.abs(tk.hp - (hp0 - T.WPN.atr.at)) < 1);
    const h1 = tk.hp; X.explode(tk.x + Math.sin(tk.yaw) * 4.6, tk.z + Math.cos(tk.yaw) * 4.6, [...X.ents.values()].find(e => e.bot && e.team === 1), 1); const plain = h1 - tk.hp;
    const h2 = tk.hp; X.explode(tk.x + Math.sin(tk.yaw) * 4.6, tk.z + Math.cos(tk.yaw) * 4.6, d, 1); const bundle = h2 - tk.hp;
    ck('bundleCharge', plain > 0 && bundle > plain * 2); }
  { const v = [...X.ents.values()].find(e => e.bot && e.team === 1 && e.alive && !e.mg); v.guard = null; const fx = -Math.sin(tk.yaw), fz = -Math.cos(tk.yaw);
    place(v, tk.x + fx * 3, tk.z + fz * 3); tk.v = 2; tk.thr = 1; await sleep(120); ck('tankCrushes', !v.alive && v.lastHit === 'tank'); input(A, 0, 0, 0, tk.yaw, 0, 2); }
  { const fx = -Math.sin(tk.yaw), fz = -Math.cos(tk.yaw), wx = tk.x + fx * 6, wz = tk.z + fz * 6; const f = { id: 99001, k: 'wire', team: 1, x: wx, z: wz, yaw: 0, y: T.hAt(X.terrH(), wx, wz), done: 1, hp: 120, by: d, spawn: 0 }; T.addFort(f);
    for (let i = 0; i < 50 && T.FORTS.has(f.id); i++) { input(A, 1, 0, 0, tk.yaw, 0, 3); await sleep(100); } ck('wireCrushed', !T.FORTS.has(f.id)); input(A, 0, 0, 0, tk.yaw, 0, 2); await sleep(200); }
  { const xp0 = d.xp || 0; V.hurt(tk, 1e9, d, 'atr'); await sleep(400);
    ck('tankKnockedOut', tk.dead && !a.veh && !a.inV && a.hp < 100 && A.got('kf', m => m.veh === 1).length >= 1 && (d.xp || 0) >= xp0 + 100 && !X.ents.has(tk.crew ? tk.crew.id : -1)); }
  // ---- AI gun crews: a spotted cluster of enemies in range gets shelled
  { const g = guns.find(v => v.k === 'mortar' && v.team === 1 && !v.dead); for (const v of guns) v.aiT = 999; g.aiT = 0; g.rl = 0;
    const fx = -Math.sin(g.base.yaw), fz = -Math.cos(g.base.yaw), cx = g.x + fx * 90, cz = g.z + fz * 90; const mine = [...X.ents.values()].filter(e => e.bot && e.team === 0 && e.alive && !e.mg).slice(0, 4);
    for (const e of mine) { e.guard = null; place(e, cx + (Math.random() - .5) * 6, cz + (Math.random() - .5) * 6); e.sp[1] = X.tickNo() + 400; }
    for (const e of X.ents.values()) if (e.team === 1 && e.alive && Math.hypot(e.x - cx, e.z - cz) < 16) place(e, -140, -140);
    const n0 = V.shells.filter(s => s.src === g).length + D.got('shl', m => m.src === g.id).length; await sleep(600);
    ck('aiCrewShells', D.got('shl', m => m.src === g.id).length >= 1 || V.shells.some(s => s.src === g)); for (const v of guns) v.aiT = 5; }
  // ---- Operations: guns left on lost ground are spiked; reset brings them back
  V.groundLost(1, (x, z) => z < -100);
  ck('gunsLostWithGround', V.V.filter(v => v.k === 'fgun' && v.team === 1).every(v => v.dead && v.lost) && V.V.filter(v => v.k === 'mortar' && v.team === 1).every(v => !v.lost));
  V.reset(); ck('vehReset', V.V.every(v => v.k !== 'tank' && !v.dead && !v.lost) && V.V.length === 8);
  // ---- elite kits
  if (a.down > 0) A.send({ t: 'act', a: 'giveup' }); for (let i = 0; i < 50 && !a.alive; i++) await sleep(200); a.hp = 100;
  X.ekits.length = 0; X.eliteStock(0, true);
  ck('cratesStocked', X.ekits.filter(c => c.team === 0).length === 2);
  { const c = X.ekits.find(q => q.team === 0); place(a, c.x, c.z); a.mgCd = 0; X.onAct(a, 'mg', {});
    await sleep(150); ck('takeElite', a.elite === c.k && a.w === T.ELITE[c.k].w && a.hp === T.ELITE[c.k].hp && !X.ekits.includes(c) && A.got('elite').length === 1); }
  { const p = { x: 0, y: T.hAt(X.terrH(), 0, 130), z: 130, vy: 0, elite: 'hmg', cls: 'rifleman', w: 'hmg' }, q = { ...p, elite: null };
    for (let i = 0; i < 10; i++) { T.step(p, { dt: .05, f: 1, s: 0, bits: 1, yaw: 0 }, X.terrH(), T.spOf(p)); T.step(q, { dt: .05, f: 1, s: 0, bits: 0, yaw: 0 }, X.terrH(), T.spOf(p)); }
    ck('sentryCannotSprint', Math.abs(p.z - q.z) < .01); }
  { X.giveElite(b, 'flame'); d.elite = null; d.hp = 100; d.alive = true; d.inV = false; place(b, 60, 20); place(d, 60, 14); b.yaw = 0; b.pitch = 0; await sleep(120);
    const f0 = X.fires.length; for (let k = 0; k < 4; k++) X.flameJet(b, 0, 0); const h1 = d.hp; await sleep(150);
    ck('flameBurns', h1 < 100 && d.burn > X.tickNo() && X.fires.length > f0 && D.got('fi').length >= 1);
    await sleep(1100); ck('keepsBurning', d.hp < h1 || !d.alive); }
  { const w0 = a.w0; X.damage(a, 999, d, true); await sleep(300); for (let i = 0; i < 50 && !a.alive; i++) await sleep(200);
    ck('eliteLostOnDeath', a.alive && !a.elite && a.w === w0); }
  { X.ekits.length = 0; X.eliteStock(1, true); const c = X.ekits.find(q => q.team === 1); c.at = X.tickNo() - 30 * 20;
    for (const p of [a, b, d]) if (p.team === 1) place(p, 140, 140);
    { const fb = [...X.ents.values()].find(e => e.bot && e.team === 1 && e.alive && !e.mg && !e.elite && !e.para); fb.guard = null; fb.kit = false; fb.buildF = null; fb.depot = null; place(fb, c.x + 15, c.z); }
    X.eliteErrands(); const bot = c.bot; ck('botSentForCrate', bot && bot.goTo && Math.hypot(bot.goTo.x - c.x, bot.goTo.z - c.z) < .1);
    if (bot) { place(bot, c.x, c.z); X.eliteErrands(); } ck('botTakesKit', bot && bot.elite === c.k); }
  // ---- weather
  X.setWx('night'); await sleep(150);
  ck('nightBroadcast', A.got('wx', m => m.k === 'night').length >= 1 && T.WX.k === 'night' && X.sightAt(0, 0, 0) < .5);
  { const e = [...X.ents.values()].find(q => q.team === 1 && q.alive && !q.mg && q.bot); place(e, 10, 5); e.sp[0] = 0; X.flareAt(10, 5, 0); await sleep(150);
    ck('flareLights', X.sightAt(0, 10, 5) === 1 && e.sp[0] > X.tickNo() && A.got('flr').length >= 1); }
  { X.setWx('rain'); const p = { x: 0, y: T.hAt(X.terrH(), 0, 130), z: 130, vy: 0, cls: 'rifleman', w: 'bolt' }; for (let i = 0; i < 10; i++) T.step(p, { dt: .05, f: 1, s: 0, bits: 1, yaw: 0 }, X.terrH(), 1); const wet = 130 - p.z;
    X.setWx('overcast'); const q = { x: 0, y: T.hAt(X.terrH(), 0, 130), z: 130, vy: 0, cls: 'rifleman', w: 'bolt' }; for (let i = 0; i < 10; i++) T.step(q, { dt: .05, f: 1, s: 0, bits: 1, yaw: 0 }, X.terrH(), 1); const dry = 130 - q.z;
    ck('rainMud', wet < dry * .9 && wet > dry * .8); }
  { a.bd = 3; a.gCd = 0; const n0 = A.got('flr').length; X.onAct(a, 'heal', {}); await sleep(150); ck('flarePistol', a.u === 'flare' && a.bd === 2 && A.got('flr').length === n0 + 1); }
  { const o = O.ent(); X.setCmd(0, 200); const f0 = X.flares.length; X.callSupport(o, { s: 'star', x: 0, z: 0 }); await sleep(4000); ck('starShells', X.flares.length >= f0 + 3); }
  { const o = O.ent(); X.DP[0].owner = 0; X.DP[2].owner = 0; X.setCmd(0, 200); for (const v of V.tanks()) if (!v.dead) V.hurt(v, 1e9, null, 'test');
    X.callSupport(o, { s: 'tank', x: 0, z: 40 }); const t = V.tanks().find(v => v.team === 0 && !v.dead); ck('tankCallIn', t && t.order && t.order.z === 40); }
  console.log(JSON.stringify(R, null, 1));
  const bad = Object.keys(R).filter(k => !R[k]);
  console.log(bad.length ? 'FAILED: ' + bad.join(', ') : 'ALL ' + Object.keys(R).length + ' CHECKS PASSED');
  process.exit(bad.length ? 1 : 0);
})().catch(e => { console.log('TEST ERROR', e); process.exit(1); });
