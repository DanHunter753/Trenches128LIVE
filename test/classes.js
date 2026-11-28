'use strict';
// v0.36 class abilities: the machine gunner's ammo box (restocks teammates who walk over it), the assault man's morphine
// (faster, 40% less damage for 10 s, two per life), quicker assault reloads, and the gunner bracing his gun when crouched.
process.argv = ['node', 'x', '--port', '8086', '--fill', '0', '--no-fetch', '--data', require('fs').mkdtempSync(require('path').join(require('os').tmpdir(), 't128cl-'))];
process.env.T128_TEST = '1';
const S = require('../server.js'), X = S._test, T = require('../shared.js');
const sleep = ms => new Promise(r => setTimeout(r, ms)), R = {}, ck = (k, v) => { R[k] = !!v; };
let nid = 9800; const mk = (cls, w, team) => { const p = { id: nid++, team: team || 0, bot: false, name: cls, cls, w, u: 'bandage', sq: 0, spawnPick: null, usePost: false, xp: 0, ws: null, sp: [0, 0] }; X.ents.set(p.id, p); X.spawnEnt(p); return p; };
(async () => {
  await sleep(1500); X.setSupply(0, 100);
  const g = mk('gunner', 'lmg'), m = mk('rifleman', 'bolt'), a = mk('assault', 'smg'), red = mk('rifleman', 'bolt', 1);
  // ---- ammo box
  X.abilityAct(g); const bx = X.aboxes()[0]; ck('boxDropped', X.aboxes().length === 1 && bx.team === 0 && g.sup === 47);   // v0.52: from the gunner's own supply
  X.abilityAct(g); ck('boxCooldown', X.aboxes().length === 1);
  for (const p of [m, red]) { p.x = bx.x + .5; p.z = bx.z; p.y = T.hAt(X.terrH(), p.x, p.z); p.ammo = 0; p.gr = 0; p.bd = 0; }
  await sleep(800);
  ck('mateRestocked', m.ammo === T.WPN.bolt.mag && m.gr === X.grMax(m) && m.bd === X.bdMax(m) && bx.uses === 9);
  ck('enemyNotRestocked', red.ammo === 0 && red.gr === 0);
  m.gr = 0; await sleep(800); ck('oncePer25s', m.gr === 0);
  for (let i = 0; i < 3; i++) { g.aboxCd = 0; X.abilityAct(g); } ck('twoBoxesEach', X.aboxes().filter(b => b.by === g).length === 2);
  bx.until = 0; // expiry
  // ---- morphine
  const s0 = T.spOf(a); a.hp = 100; ck('assaultFaster', s0 >= 1.1);
  X.abilityAct(a); ck('morphineOn', a.mph && a.mphN === 1 && a.hp === 115 && Math.abs(T.spOf(a) / s0 - 1.2) < 1e-6);
  a.hp = 100; X.damage(a, 50, red, false, null, 'bolt'); ck('morphineArmour', Math.abs(a.hp - 70) < 1e-6);
  X.abilityAct(a); ck('noDoubleDose', a.mphN === 1);
  await sleep(10600); ck('morphineWearsOff', !a.mph && T.spOf(a) === s0);
  X.abilityAct(a); X.abilityAct(a); a.mph = false; a.mphU = 0; X.abilityAct(a); ck('twoPerLife', a.mphN === 0 && !a.mph);
  // ---- assault reload
  a.ammo = 0; a.rel = 0; a.cd = 0; X.setSupply(0, 50); X.fireWeapon(a); ck('quickReload', Math.abs(a.rel - T.WPN.smg.rl * .7) < 1e-6);
  // ---- gunner braces when crouched
  const bloom = cr => { g.crouch = cr; g.bloom = 0; g.cd = 0; g.rel = 0; g.ammo = 50; g.sprOut = 0; X.fireWeapon(g); return g.bloom; };
  const b1 = bloom(true), b2 = bloom(false); R.bloom = [b1, b2]; ck('bracedSteadier', b1 > 0 && b1 < b2);
  // ---- assault slide (shared movement, so server and the player's own prediction agree)
  { const H = X.terrH(), mkp = c => { const p = { x: 0, y: 0, z: 125, vy: 0, cls: c, w: 'smg' }; p.y = T.groundAt(H, 0, 125, 60); return p; },   // flat ground, running along +x
      run = (p, bits, f, n) => { const x0 = p.x; for (let i = 0; i < n; i++) T.step(p, { dt: .05, f, s: 0, bits, yaw: -Math.PI / 2 }, H, T.spOf(p)); return p.x - x0; };
    const p = mkp('assault'); run(p, 1, 1, 10); const spr = run(p, 1, 1, 6); const sl = run(p, 3, 1, 6); R.slide = [+spr.toFixed(2), +sl.toFixed(2)];
    ck('slideStarts', p.sld > 0); ck('slideBurst', sl > spr * 1.15); run(p, 3, 1, 20); ck('slideEnds', p.sld === 0 && p.sldCd > 0); ck('crouchAfter', run(p, 3, 1, 4) < .5);
    ck('slideCooldown', (() => { run(p, 1, 1, 2); run(p, 3, 1, 1); return !(p.sld > 0); })());
    const c = mkp('assault'), go = () => { c.x = 0; c.z = 125; c.y = T.groundAt(H, 0, 125, 60); c.vy = 0; c.pb = 0; run(c, 1, 1, 10); c.sldCd = 0; run(c, 3, 1, 1); return c.sld > 0; };
    ck('cancelByJump', go() && (run(c, 7, 1, 1), c.sld === 0 && c.vy > 0)); 
    ck('cancelByStanding', go() && (run(c, 1, 1, 1), c.sld === 0)); 
    ck('cancelByPullingBack', go() && (run(c, 3, -1, 1), c.sld === 0));
    const r = mkp('rifleman'); r.w = 'bolt'; run(r, 1, 1, 10); run(r, 3, 1, 1); ck('onlyAssault', !(r.sld > 0)); }
  // ---- rifleman: bolt rifle is his alone, faster bolt, nerve, longer charge, rifle grenades
  ck('boltRiflemanOnly', Object.keys(T.CLS).every(k => (k === 'rifleman') === T.CLS[k].w.includes('bolt')) && T.fixLoadout(5000, { cls: 'sapper', w: 'bolt' }).w !== 'bolt');
  const rf = mk('rifleman', 'bolt'), md = mk('medic', 'carbine'); rf.cd = 0; rf.rel = 0; rf.ammo = 8; rf.sprOut = 0; X.fireWeapon(rf); ck('fasterBolt', Math.abs(rf.cd - T.WPN.bolt.cd * .8) < 1e-6);
  rf.supp = 0; md.supp = 0; X.suppress(rf, 'mg', red); X.suppress(md, 'mg', red); ck('keepsNerve', rf.supp > 0 && Math.abs(rf.supp * 2 - md.supp) < 1e-6);
  ck('longerCharge', T.chgMax(rf) === T.CHG_MAX * 1.5 && T.chgMax(md) === T.CHG_MAX && rf.chg === T.chgMax(rf));
  { const H = X.terrH(), y = T.hAt(H, 0, 125) + 1.6, a80 = X.rgAim(80, T.hAt(H, 80, 125) - y), P = T.rgPath(H, 0, y, 125, -Math.PI / 2, a80); R.rg80 = +P.x.toFixed(1);
    ck('rgAimLands', Math.abs(P.x - 80) < 4); const far = T.rgPath(H, 0, y, 125, -Math.PI / 2, .7); R.rgMax = +far.x.toFixed(0); ck('rgReach', far.x > 100 && far.x < 125); }
  X.setSupply(0, 50); rf.gr = 2; rf.cd = 0; X.abilityAct(rf); ck('rgFitted', rf.rg === 1);
  const ng = X.grenades.length; rf.cd = 0; X.fireWeapon(rf); ck('rgNotBeforeFitted', X.grenades.length === ng && rf.rg === 1);
  X.abilityAct(rf); ck('rgUnload', rf.rg === 0 && rf.gr === 2); X.abilityAct(rf); await sleep(1150);
  rf.cd = 0; rf.pitch = .3; const sup0 = X.supply()[0], am0 = rf.ammo; X.fireWeapon(rf); const g1 = X.grenades[X.grenades.length - 1];
  ck('rgLaunched', X.grenades.length === ng + 1 && g1.pow === T.RG.pow && g1.t > 1 && rf.gr === 1 && rf.rg === 0 && rf.ammo === am0 && X.supply()[0] === sup0);
  // a bot rifleman lobs one onto a manned enemy gun 70 m off
  { const H = X.terrH(), b = mk('rifleman', 'bolt'), gn = mk('gunner', 'lmg', 1); b.gr = 2; b.rgCd = 0; X.setSupply(0, 50);
    b.x = 0; b.z = 125; b.y = T.hAt(H, 0, 125); gn.x = 70; gn.z = 125; gn.y = T.hAt(H, 70, 125); gn.mg = 0; gn.manned = true; await sleep(200);
    const n0 = X.grenades.length; b.bot = true; X.botAbility(b); b.bot = false; const gg = X.grenades[X.grenades.length - 1]; R.botRg = gg && [+gg.tx.toFixed(1), +gg.tz.toFixed(1)];
    ck('botRifleGrenade', X.grenades.length === n0 + 1 && Math.hypot(gg.tx - 70, gg.tz - 125) < 8); gn.mg = null; gn.manned = false; }
  // ---- bots use them
  const ab = mk('assault', 'smg'); ab.bot = true; ab.tgt = red; ab.hp = 50; X.botAbility(ab); ck('botMorphine', ab.mph);
  console.log(JSON.stringify(R)); const bad = Object.keys(R).filter(k => R[k] === false); console.log(bad.length ? 'FAILED: ' + bad.join(', ') : 'ALL ' + Object.keys(R).filter(k => typeof R[k] === 'boolean').length + ' CHECKS PASSED'); process.exit(bad.length ? 1 : 0);
})().catch(e => { console.log('TEST ERROR', e); process.exit(1); });
