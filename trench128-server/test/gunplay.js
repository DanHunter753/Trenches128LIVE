'use strict';
// In-process test of the gunplay pack: travelling bullets with drop, sweet spot, hit-marker detail, damage direction,
// suppression, bayonet/club melee, bayonet charge (speed, stamina, armour), sprint-to-fire block, bloom, tracer velocity.
process.argv = ['node', 'x', '--port', '8093', '--fill', '4'];
const S = require('../server.js'); const T = require('../shared.js');
const sleep = ms => new Promise(r => setTimeout(r, ms)); const R = {}; const ck = (k, v) => { R[k] = !!v; };
function client(name, team, join) {
  return new Promise(res => {
    const c = { name, msgs: [] }; const ws = new WebSocket('ws://localhost:8093'); ws.binaryType = 'arraybuffer';
    ws.onopen = () => ws.send(JSON.stringify({ t: 'hello', name }));
    ws.onmessage = ev => { if (typeof ev.data !== 'string') { const dv = new DataView(ev.data); if (dv.getUint8(0) === 4) { const n = dv.getUint16(1, true), l = []; for (let i = 0, o = 3; i < n; i++, o += 18) l.push({ id: dv.getUint16(o + 13, true), w: dv.getUint8(o + 15), vel: dv.getUint16(o + 16, true) }); c.msgs.push({ t: 'shb', l }); } return; } const m = JSON.parse(ev.data); c.msgs.push(m);
      if (m.t === 'prof') { const e = [...S._test.humans].find(h => h.name === name); e.team = team; ws.send(JSON.stringify({ t: 'join', ...join })); }
      if (m.t === 'w') res(c); };
    c.send = o => ws.send(JSON.stringify(o)); c.ent = () => [...S._test.humans].find(h => h.name === name);
    c.got = (t, f) => c.msgs.filter(m => m.t === t && (!f || f(m)));
  });
}
const place = (e, x, y, z, yaw) => { e.x = x; e.y = y; e.z = z; e.vy = 0; e.cl = null; if (yaw != null) e.yaw = yaw; e.pitch = 0; };
const yawTo = (a, b) => Math.atan2(-(b.x - a.x), -(b.z - a.z));
(async () => {
  const A = await client('GunA', 0, { cls: 'rifleman', w: 'bolt', u: 'bandage', sq: 0 });
  const D = await client('GunD', 1, { cls: 'assault', w: 'smg', u: 'bandage', sq: 0 });
  await sleep(1500); const a = A.ent(), d = D.ent(), X = S._test;
  for (let i = 0; i < 20 && !(a.alive && d.alive); i++) await sleep(250);
  d.w = 'smg'; d.ammo = 32;   // a new account's assault gets the shotgun; the SMG is the no-bayonet case here
  // high above the far flank so no bot or terrain gets in the way
  place(a, 100, 60, 30, 0); place(d, 100, 60, -30); a.yaw = yawTo(a, d); d.hp = 1000; d.supp = 0;
  const hp0 = d.hp, aim = Math.atan2((d.y + 1.2) - (a.y + 1.6), 60);
  X.fireBullet(a, a.x, a.y + 1.6, a.z, a.yaw, aim, 130, 50, 'bolt', 420, T.WPN.bolt.sw);
  ck('bulletInFlight', X.bullets.length >= 1 && d.hp === hp0);
  await sleep(400);
  ck('bulletArrives', d.hp < hp0); ck('sweetSpot60m', hp0 - d.hp === 100);
  ck('hitMarkerDetail', A.got('hm').some(m => m.h === 0 && m.k === 0 && m.m === 0));
  ck('damageDirection', D.got('dd').some(m => Math.abs(m.x - a.x) < 1 && Math.abs(m.z - a.z) < 1));
  // drop: a level shot loses height on the way
  { const b = X.fireBullet(a, 0, 200, 0, 0, 0, 200, 1, 'bolt', 420); X.bullets.splice(X.bullets.indexOf(b), 1); for (let i = 0; i < 6; i++) X.bulletStep(b, .05);
    ck('bulletDrops', b.y < 200 - .35 && b.y > 200 - .6 && b.d > 120); }
  // near miss: 1.6 m to the side suppresses
  { d.supp = 0; const n0 = D.got('sup').length, off = Math.atan2(1.6, 60); X.fireBullet(a, a.x, a.y + 1.6, a.z, a.yaw + off, aim, 130, 50, 'lmg', 400); await sleep(400);
    ck('nearMissSuppresses', d.supp > .1 && D.got('sup').length > n0); ck('suppressionMsg', D.got('sup').some(m => m.v > 0 && Math.abs(m.x - a.x) < 1)); }
  // suppression widens the cone (seeded check on the formula path: spread is used, supp decays)
  { const s0 = d.supp; await sleep(600); ck('suppressionDecays', d.supp < s0); }
  // tracers carry muzzle velocity
  { d.cd = 0; d.ammo = 30; d.sprOut = 0; d.charging = false; X.fireWeapon(d); await sleep(200); ck('tracerVelocity', A.got('shb').some(m => m.l.some(s => s.id === d.id && s.w === 3 && s.vel === T.WPN.smg.vel))); }
  // automatic bloom
  { d.bloom = 0; for (let i = 0; i < 5; i++) { d.cd = 0; X.fireWeapon(d); } ck('autoBloom', d.bloom > .015); }
  // can't fire while sprinting / charging
  { const am = a.ammo; a.cd = 0; a.rel = 0; a.sprOut = .1; X.fireWeapon(a); ck('noFireWhileSprinting', a.ammo === am); a.sprOut = 0; a.charging = true; X.fireWeapon(a); ck('noFireWhileCharging', a.ammo === am); a.charging = false; }
  // charge armour
  { a.charging = true; a.hp = 100; X.damage(a, 50, d); ck('chargeArmour', a.hp === 70); a.charging = false; a.hp = 100; }
  // bayonet: one stab kills, outright (no knockdown)
  { place(d, 100, 60, 28.5); d.hp = 100; a.yaw = yawTo(a, d); a.mcd = 0; const n = A.got('hm').length; A.send({ t: 'act', a: 'melee' }); await sleep(250);
    ck('bayonetKills', !d.alive && !(d.down > 0)); ck('meleeHitMarker', A.got('hm').slice(n).some(m => m.m === 1 && m.k === 1)); }
  for (let i = 0; i < 40 && !d.alive; i++) await sleep(250);
  // smg club: 60 damage, cooldown
  { place(a, 100, 60, 30); place(d, 100, 60, 28.6); d.yaw = yawTo(d, a); a.hp = 100; d.mcd = 0; X.meleeStrike(d, false); ck('clubHits60', a.hp === 40);
    X.meleeStrike(d, false); ck('meleeCooldown', a.hp === 40); a.hp = 100; }
  // charge movement: faster than sprint, burns stamina, only with a bayonet weapon
  { const p = { x: 0, y: T.groundAt(X.terrH(), 0, 0, 0), z: 0, vy: 0, w: 'bolt' }, H = X.terrH();
    for (let i = 0; i < 20; i++) T.step(p, { dt: .05, f: 1, s: 0, bits: 1 | 64, yaw: 0 }, H, 1);
    ck('chargeBurnsStamina', p.chg < T.CHG_MAX - .9 && p.charging);
    const q = { x: 0, y: p.y, z: 0, vy: 0, w: 'smg' }; T.step(q, { dt: .05, f: 1, s: 0, bits: 1 | 64, yaw: 0 }, H, 1); ck('noChargeWithoutBayonet', !q.charging);
    const r = { x: 0, y: p.y, z: 0, vy: 0, w: 'bolt', chg: 0 }; T.step(r, { dt: .05, f: 1, s: 0, bits: 1 | 64, yaw: 0 }, H, 1); ck('noChargeWhenSpent', !r.charging); }
  // a charging soldier stabs automatically on contact
  { place(a, 100, 60, 30); place(d, 100, 60, 28.4); d.hp = 100; d.alive = true; a.yaw = yawTo(a, d); a.mcd = 0; a.charging = true; await sleep(150); ck('chargeAutoStab', !d.alive); a.charging = false; }
  const bad = Object.entries(R).filter(([, v]) => !v).map(([k]) => k);
  console.log(JSON.stringify(R)); console.log(bad.length ? 'FAILED: ' + bad.join(', ') : 'ALL ' + Object.keys(R).length + ' CHECKS PASSED'); process.exit(bad.length ? 1 : 0);
})().catch(e => { console.log('TEST ERROR', e.stack); process.exit(1); });
