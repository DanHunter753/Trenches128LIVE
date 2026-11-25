'use strict';
// In-process physics test of the walled trenches: fire step, wall blocking, scaling ramps, dugout rooms + roofs.
const T = require('../shared.js'); const H = T.makeTerrain().H; const R = { checks: {} }; const ck = (k, v) => { R.checks[k] = !!v; };
const FWD = 0, BACK = Math.PI;                         // yaw 0 walks toward -z, yaw PI toward +z
function run(p, yaw, secs, bits = 0, f = 1) { for (let i = 0; i < secs * 60; i++) T.step(p, { dt: 1 / 60, f, s: 0, bits, yaw }, H, 1); return p; }
const mk = (x, z, y) => ({ x, z, y: y === undefined ? T.hAt(H, x, z) : y, vy: 0 });
const t = 30, sg = T.sgn(t);                           // blue front line: enemy is toward -z, so u>0 means smaller z
// an intact stretch of the line (not a blown-in bay, wire gap, communication trench, dugout or MG nest)
const okX = x => !T.collapsed(t, Math.floor((x + T.W) / 9)) && !T.collapsed(t, Math.floor((x + T.W) / 9) + 1) && !T.collapsed(t, Math.floor((x + T.W) / 9) - 1) && T.GAPS.every(g => Math.abs(x - g) > 8) && T.CT.every(q => Math.abs(x - q) > 8) && T.ROOMS.every(r => Math.abs(x - r.xc) > 8) && T.NEST.every(n => Math.abs(x - n.x) > 8) && Math.abs(T.trenchSlope(t, x)) < .25;
let X0 = -10; for (let d = 0; d < 60 && !okX(X0); d++) X0 = -10 + (d % 2 ? d : -d);
const G = T.GAPS.reduce((a, g) => Math.abs(g) < Math.abs(a) ? g : a);
const uOf = (p, x) => (p.z - T.trenchC(t, x)) * sg;
// 1. scaling ramp at a wire gap: from the rear straight across the line and out the other side
let p = mk(G, T.trenchC(t, G) + 12); run(p, FWD, 12); ck('rampCrossesLine', p.z < T.trenchC(t, G) - 7);
// 2. no ramp: walking in drops you onto the trench floor and the front wall stops you
p = mk(X0, T.trenchC(t, X0) + 12); run(p, FWD, 8);
const c = T.trenchC(t, X0);
ck('fallsIntoTrench', p.y < T.base(X0, p.z) - .8); ck('frontWallBlocksWalking', uOf(p, X0) < 2.7 && p.y < -0.2 + T.base(X0, p.z));
// 3. fire step: top of the step, eye above the parapet but a crouching head below it
p = mk(X0, c + 1.8 * sg); const stepTop = p.y, nat = T.base(X0, p.z);
ck('fireStepHeight', stepTop - nat > -1.15 && stepTop - nat < -.85);
const parapet = T.hAt(H, X0, c + 3.0 * sg);
ck('standingEyeClearsParapet', stepTop + 1.65 > parapet + .1); ck('crouchedEyeBehindParapet', stepTop + 1.0 < parapet);
// 4. you can climb the fire step from the floor, and clamber out over the top from it with a jump
p = mk(X0, c); run(p, FWD, 1.5); ck('walksUpFireStep', p.y - T.base(X0, p.z) > -1.3);
// find a breach in the sandbag line (no bag within 3 m of the exit path) and not a gap ramp
let bx = null; for (let x = -100; x <= 100 && bx === null; x += 1) if (okX(x) && !T.SB.some(b => Math.abs(b.x - x) < 3 && Math.abs(b.z - T.trenchC(t, x) - sg * 3.3) < 1)) bx = x;
ck('sandbagLineHasBreaches', bx !== null);
p = mk(bx, T.trenchC(t, bx) + 1.8 * sg); run(p, FWD, 0.2, 4); run(p, FWD, 1.2, 0);
ck('clamberOutFromStep', (p.z - T.trenchC(t, bx)) * sg > 3.0);
const full = T.SB.find(b => okX(b.x) && Math.abs(b.z - T.trenchC(t, b.x) - sg * 3.3) < .2 && T.SB.filter(q => Math.abs(q.x - b.x) < 3).length >= 3); p = mk(full.x, T.trenchC(t, full.x) + 1.8 * sg); run(p, FWD, 0.2, 4); run(p, FWD, 1.2, 0);
ck('sandbagsBlockClamberWhereIntact', (p.z - T.trenchC(t, full.x)) * sg < 3.4);
// 5. cannot walk out of the trench from the floor elsewhere (back wall, no ramp)
p = mk(X0, c); run(p, BACK, 3); ck('backWallBlocks', uOf(p, X0) > -2.0);
// 6. dugouts
const room = T.ROOMS.find(r => r.t === 30 && Math.abs(T.trenchSlope(30, r.xc)) < .3) || T.ROOMS.find(r => r.t === 30), rsg = room.sg;
p = mk(room.xc, room.c); run(p, rsg > 0 ? FWD : BACK, 0.001);   // stand in the trench at the door
p = mk(room.xc, room.c, T.hAt(H, room.xc, room.c));
run(p, rsg > 0 ? BACK : FWD, 0);                                // (rsg is the enemy direction; the room lies on the opposite side)
const toRoomYaw = rsg === -1 ? BACK : FWD;                      // blue (sg=-1): rear is +z => yaw PI
run(p, toRoomYaw, 3); const inside = T.roomAt(p.x, p.z) && T.inRoom(p.x, p.y, p.z);
ck('walksIntoDugoutThroughDoor', !!inside); ck('headroomUnderRoof', p.y + 1.8 <= room.rb + 1e-6);
run(p, toRoomYaw, 0.1, 4); ck('jumpClampedByCeiling', p.y + 1.8 <= room.rb + 1e-6);
// 7. walk over the roof from behind
const bz = room.c - room.sg * 11; p = mk(room.xc, bz); run(p, rsg === -1 ? FWD : BACK, 1.3);
ck('canStepOntoRoof', p.y > room.rt - .05 && !!T.roomAt(p.x, p.z));
// 8. roof blocks line of sight and bullets
const mid = (room.z0 + room.z1) / 2; ck('roofBlocksLos', !T.los(H, room.xc, room.rt + 2, mid, room.xc, room.fy + 1.5, mid)); ck('inRoofSlab', T.inRoof(room.xc, room.rt - .2, mid));
{ const ox = 0, oz = T.HOME_Z - 10; ck('openGroundLos', T.los(H, ox, T.hAt(H, ox, oz) + 1.6, oz, ox + 3, T.hAt(H, ox + 3, oz) + 1.6, oz)); }
console.log(JSON.stringify(R, null, 1)); const bad = Object.entries(R.checks).filter(([, v]) => !v).map(([k]) => k);
console.log(bad.length ? 'FAILED: ' + bad.join(', ') : 'ALL ' + Object.keys(R.checks).length + ' CHECKS PASSED'); process.exit(bad.length ? 1 : 0);
