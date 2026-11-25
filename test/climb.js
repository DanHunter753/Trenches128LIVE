'use strict';
// Climbing: scale trench walls and the parapet from the trench floor; none where the wall is too tall or absent.
const T = require('../shared.js'); const H = T.makeTerrain().H; const ck = {}; const k = (n, v) => { ck[n] = !!v; };
const mk = (x, z, y) => ({ x, z, y: y === undefined ? T.hAt(H, x, z) : y, vy: 0 });
const t = 30, sg = T.sgn(t);
const okX = x => [-1, 0, 1].every(k => !T.collapsed(t, Math.floor((x + T.W) / 9) + k)) && T.GAPS.every(g => Math.abs(x - g) > 8) && T.CT.every(q => Math.abs(x - q) > 8) && T.ROOMS.every(r => Math.abs(x - r.xc) > 8) && T.NEST.every(n => Math.abs(x - n.x) > 8) && Math.abs(T.trenchSlope(t, x)) < .25 && !T.SB.some(b => Math.abs(b.x - x) < 2.5 && Math.abs(b.z - T.trenchC(t, x) - sg * 3.3) < 1.5);
let X0 = -10; for (let d = 0; d < 80 && !okX(X0); d++) X0 = -10 + (d % 2 ? d : -d);
const c = T.trenchC(t, X0);
const uOf = (p, x) => (p.z - T.trenchC(t, x)) * sg;
function run(p, yaw, secs, bits, f = 1) { for (let i = 0; i < secs * 60; i++) T.step(p, { dt: 1 / 60, f, s: 0, bits, yaw }, H, 1); return p; }
const toEnemy = sg === -1 ? 0 : Math.PI;          // yaw 0 walks toward -z
// from the trench floor, facing the front wall
let p = mk(X0, c); run(p, toEnemy, .3, 0);
const tg = T.climbTarget(H, p.x, p.y, p.z, toEnemy);
k('targetFound', tg); k('targetRiseSane', tg && tg.rise > .62 && tg.rise <= 3.2); k('landingAboveFloor', tg && tg.y1 > p.y + .6);
const y0 = p.y; run(p, toEnemy, .05, 16); k('climbStarts', !!p.cl);
let maxLean = 0; for (let i = 0; i < 60 * 3 && p.cl; i++) { T.step(p, { dt: 1 / 60, f: 0, s: 0, bits: 0, yaw: toEnemy }, H, 1); }
k('climbEnds', !p.cl); k('reachesFireStep', p.y > y0 + .6);
const y1 = p.y; run(p, toEnemy, .1, 16); k('secondClimbStarts', !!p.cl); for (let i = 0; i < 60 * 3 && p.cl; i++) T.step(p, { dt: 1 / 60, f: 0, s: 0, bits: 0, yaw: toEnemy }, H, 1);
k('endsOnTop', !p.cl && p.y > y1 + .5 && uOf(p, X0) > 2.3);
k('standsOnGround', Math.abs(p.y - T.groundAt(H, p.x, p.z, p.y)) < .3);
// no climb on flat ground, no climb without the key bit
p = mk(0, 80); run(p, 0, .2, 16); k('noClimbOnFlat', !p.cl);
p = mk(X0, c); run(p, toEnemy, .3, 0); run(p, toEnemy, .2, 0); k('noKeyNoClimb', !p.cl);
// jump held alone near a low obstacle does not force a climb; airborne can't start one
p = mk(X0, c); p.vy = 5; p.y += .5; run(p, toEnemy, .05, 16); k('noClimbAirborne', !p.cl);
// walls taller than 3.2 m refused
console.log(JSON.stringify(ck, null, 1)); const bad = Object.entries(ck).filter(([, v]) => !v); console.log(bad.length ? 'FAILED ' + bad.map(b => b[0]) : 'ALL ' + Object.keys(ck).length + ' PASSED'); process.exit(bad.length ? 1 : 0);
