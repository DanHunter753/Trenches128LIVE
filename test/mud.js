'use strict';
// v0.31 mud and flooding (shared movement): in rain, trench floors are flooded, shell holes hold water and no-man's-land
// is mud, each slowing a soldier by its own amount; dugouts stay dry; nothing changes in other weather.
const T = require('../shared.js'), R = {}, ck = (k, v) => { R[k] = !!v; };
const terr = T.makeTerrain(), H = terr.H;
const o = T.OBJ[2], fx = o.x, fz = o.z;                         // a line objective sits on a trench floor
const walk = (x, z, yaw = 0) => { const p = { x, y: T.groundAt(H, x, z, 9), z, vy: 0 }; for (let i = 0; i < 20; i++) T.step(p, { dt: .05, f: 1, s: 0, bits: 0, yaw }, H, 1); return Math.hypot(p.x - x, p.z - z); };
T.WX.k = 'overcast';
ck('dryWhenNotRaining', T.wetAt(H, fx, fz) === 0 && T.wetAt(H, 0, 0) === 0);
const dryFloor = walk(fx, fz, -Math.PI / 2), dryNml = walk(0, 0);
T.WX.k = 'rain';
ck('trenchFloods', T.wetAt(H, fx, fz) === 2);
ck('noMansLandMud', T.wetAt(H, 10, 2) === 1);
ck('farBehindDry', T.wetAt(H, 0, 130) === 0);
const r = T.ROOMS[0]; ck('dugoutDry', T.wetAt(H, r.xc, (r.fz0 + r.fz1) / 2) === 0);
T.dig(terr, 12, 4, 4, 1.6); ck('shellHoleFills', T.wetAt(H, 12, 4) === 3);
const wetFloor = walk(fx, fz, -Math.PI / 2), wetNml = walk(-12, 8); R.speeds = { dryFloor: +dryFloor.toFixed(2), wetFloor: +wetFloor.toFixed(2), dryNml: +dryNml.toFixed(2), wetNml: +wetNml.toFixed(2) };
ck('wadingSlower', wetFloor < dryFloor * .85);
ck('mudSlower', wetNml < dryNml * .95);
T.WX.k = 'overcast';
console.log(JSON.stringify(R)); const bad = Object.keys(R).filter(k => R[k] === false); console.log(bad.length ? 'FAILED: ' + bad.join(', ') : 'ALL ' + Object.keys(R).filter(k => typeof R[k] === 'boolean').length + ' CHECKS PASSED'); process.exit(bad.length ? 1 : 0);
