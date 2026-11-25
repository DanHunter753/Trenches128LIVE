'use strict';
// In-process test: weapon + aim bits, blast bodies, respawn picker, bots crewing building MGs, bot sappers building, bots climbing out of trenches.
const fs = require('fs'), path = require('path');
fs.writeFileSync(path.join(__dirname, '..', 'xp.json'), JSON.stringify({ aitester: 400 }));
process.argv = ['node', 'x', '--port', '8093', '--fill', '24'];
const S = require('../server.js'); const T = require('../shared.js');
fs.unlinkSync(path.join(__dirname, '..', 'xp.json'));
const sleep = ms => new Promise(r => setTimeout(r, ms)); const R = {}; const ck = (k, v) => { R[k] = !!v; };
function client(name, team, join) {
  return new Promise(res => {
    const c = { name, msgs: [], bins: [] }; const ws = new WebSocket('ws://localhost:8093'); ws.binaryType = 'arraybuffer';
    ws.onopen = () => ws.send(JSON.stringify({ t: 'hello', name }));
    ws.onmessage = ev => { if (typeof ev.data !== 'string') { if (new Uint8Array(ev.data)[0] === 4) return;   // binary tracer frame (v0.23)
 c.bins.push(ev.data); if (c.bins.length > 5) c.bins.shift(); return; } const m = JSON.parse(ev.data); c.msgs.push(m);
      if (m.t === 'prof') { const e = [...S._test.humans].find(h => h.name === name); e.team = team; ws.send(JSON.stringify({ t: 'join', ...join })); }
      if (m.t === 'w') res(c); };
    c.send = o => ws.send(JSON.stringify(o)); c.ent = () => [...S._test.humans].find(h => h.name === name);
  });
}
const ents = () => [...S._test.ents.values()];
(async () => {
  const A = await client('AiTester', 0, { cls: 'sapper', w: 'shotgun', u: 'tool', sq: 1 }); await sleep(1500);
  // snapshot look byte: class in bits 0-2, weapon in bits 3-5; entity flag 128 = aiming
  let dec = null, sawW = new Set(), aimBit = false;
  for (let w = 0; w < 12; w++) { dec = require('./snapdec.js')(); for (const b of A.bins) dec.feed(b);   /* (the client keeps the last 5 snapshots) */ for (const q of dec.ents.values()) { sawW.add((q.lk >> 3) & 7); if (q.fl & 128) aimBit = true; } if (sawW.size >= 2) break; await sleep(250); }   /* (wait for a few snapshots with more soldiers in view) */
  ck('weaponBitsVary', sawW.size >= 2); if (sawW.size < 2) console.log('WDBG', JSON.stringify({ saw: [...sawW], n: dec.ents.size, bins: A.bins.length })); const bots = ents().filter(e => e.bot && !e.mg);
  ck('botClassMix', new Set(bots.map(b => b.w)).size >= 4);
  // blast bodies: a kill by explosion is thrown away from the blast
  const v = bots.find(b => b.alive && b.team === 1); v.hp = 1; S._test.bodies.length = 0;
  const ex = v.x - 2, ez = v.z; S._test.explode(ex, ez, A.ent()); await sleep(150);
  const bd = A.msgs.filter(m => m.t === 'bd').flatMap(m => m.b).find(b => b[0] === v.id);
  ck('blastBodySent', !!bd); ck('thrownAway', bd && bd[4] > 2 && bd[5] > 3);
  const v2 = bots.find(b => b.alive && b.team === 1 && b !== v); S._test.killEnt(v2, A.ent()); await sleep(150);
  const bd2 = A.msgs.filter(m => m.t === 'bd').flatMap(m => m.b).find(b => b[0] === v2.id); ck('shotBodyFallsInPlace', bd2 && bd2[4] === 0 && bd2[6] === 0);
  // respawn picker: choose home even with a post available, then choose the post
  const me = A.ent(); S._test.setSupply(0, 400);
  S._test.posts().push({ id: 9001, team: 0, x: 30, z: 60, y: T.hAt(S._test.terrH(), 30, 60), hp: 300, by: null });
  A.send({ t: 'act', a: 'spawnAt', id: 0 }); await sleep(200); me.hp = 1; S._test.damage(me, 999, null, true); await sleep(6200);
  ck('spawnHomeWhenChosen', me.alive && Math.abs(me.z - S._test.homeZ(me.team, me.x)) < 4);
  A.send({ t: 'act', a: 'spawnAt', id: 9001 }); await sleep(200); me.hp = 1; S._test.damage(me, 999, null, true); await sleep(6200);
  ck('spawnAtChosenPost', me.alive && Math.hypot(me.x - 30, me.z - 60) < 3);
  // building MG crewed by a bot
  const H = S._test.terrH(); let spot = null;
  for (let z = 62; z < 100 && !spot; z += 3) for (let x = -90; x < 90 && !spot; x += 3) { const cs = [[-4, -3.6], [4, -3.6], [-4, 3.6], [4, 3.6], [0, 0]].map(([a, b]) => [x + a, z - b]); const hs = cs.map(([a, b]) => T.hAt(H, a, b));
    if (Math.max(...hs) - Math.min(...hs) < .8 && cs.every(([a, b]) => Math.abs(T.hAt(H, a, b) - T.base(a, b)) < .4 && !T.roomAt(a, b)) && !T.HQS.some(q => Math.hypot(q.x - x, q.z - z) < 12) && !S._test.NESTS.some(n => Math.hypot(n.x - x, n.z - z) < 11)) spot = [x, z]; }
  const f = { id: 77001, k: 'redoubt', team: 0, x: spot[0], z: spot[1], yaw: 0, y: T.hAt(H, spot[0], spot[1]), done: 1, hp: 900, by: null, spawn: 0 };
  T.addFort(f); S._test.fortComplete(f); const nest = S._test.NESTS[S._test.NESTS.length - 1];
  const crew = ents().find(e => e.bot && e.alive && e.team === 0 && !e.mg && !e.kit); crew.x = nest.x + 3; crew.z = nest.z + 6; crew.y = T.hAt(H, crew.x, crew.z); crew.guard = null; crew.climb = null; crew.cov = null; crew.buildF = null; crew.depot = null; crew.shelter = null; crew.charging = false; crew.hold = null; crew.fortNest = null;   /* (raiders, sheltering and charging bots are left alone by design) */
  const held = S._test.NESTS.filter(n => n !== nest && n.occ == null); for (const n of held) n.occ = -1; S._test.crewForts(); for (const n of held) n.occ = null;   /* (only this nest: an empty trench nest nearer the bot would take him first) */
  ck('crewAssigned', nest.bot && nest.bot.fortNest === nest); if (!(nest.bot && nest.bot.fortNest === nest)) console.log('CRDBG', JSON.stringify({ nb: nest.bot && nest.bot.id, dead: nest.dead, occ: nest.occ, c: { id: crew.id, alive: crew.alive, mg: crew.mg, fn: !!crew.fortNest, kit: crew.kit, para: crew.para, hold: crew.hold, sh: !!crew.shelter, dp: crew.depot, ch: crew.charging, sq: crew.squad, d: Math.hypot(crew.x - nest.x, crew.z - nest.z) } }));
  for (let i = 0; i < 40 && !(nest.bot && nest.bot.mg === true); i++) await sleep(250);
  ck('botMansBuildingMg', nest.bot && nest.bot.mg === true && Math.hypot(nest.bot.x - nest.x, nest.bot.z - nest.z) < .1); if (!R.botMansBuildingMg) { const b = nest.bot || crew; const tr = []; for (let k = 0; k < 16; k++) { await sleep(500); tr.push([+b.x.toFixed(1), +b.z.toFixed(1), +b.y.toFixed(1), b.mg === true ? 'M' : b.cl ? 'C' : '']); } console.log('TRACK', JSON.stringify({ nest: [nest.x, nest.z], tr, swapped: crew.fortNest === nest, crewD: Math.hypot(crew.x - nest.x, crew.z - nest.z), crewAlive: crew.alive, crewDp: crew.depot, crewHold: crew.hold })); console.log('MGDBG', JSON.stringify({ same: nest.bot === crew, id: b.id, alive: b.alive, mg: b.mg, fn: !!b.fortNest, d: Math.hypot(b.x - nest.x, b.z - nest.z), y: b.y, ny: T.hAt(H, nest.x, nest.z), tgt: !!b.tgt, ch: b.charging, sh: !!b.shelter, cl: !!b.cl })); }
  // bot sapper lays out and works up a building
  S._test.setSupply(0, 200); S._test.setSupply(1, 0);
  const sap = ents().find(e => e.bot && e.alive && e.team === 0 && e.cls === 'sapper') || (() => { const b = ents().find(e => e.bot && e.alive && e.team === 0 && !e.mg && !e.fortNest); b.cls = 'sapper'; return b; })();
  const own = S._test.OB.filter(o => o.owner === 0).pop(); sap.x = 0; sap.z = own.z + 3; sap.y = T.hAt(H, sap.x, sap.z); sap.tgt = null; sap.buildF = null; sap.climb = null; sap.cov = null;
  for (const q of [...T.FORTS.values()]) if (q.team === 0 && q.id !== 77001 && !T.FORT[q.k].small) T.delFort(q.id);   // a bot may already have started one on its own (bigger map: it happens early)
  for (const e of ents()) if (e.buildF) e.buildF = null;
  const before = [...T.FORTS.values()].filter(q => q.team === 0 && !T.FORT[q.k].small).length;
  const builder = () => ents().find(e => e.bot && e.team === 0 && e.buildF);
  for (let i = 0; i < 10 && !builder(); i++) { for (const e of ents()) if (e.bot && e.team === 0 && e.cls === 'sapper') { e.tgt = null; if (e.fortNest && !e.mg) e.fortNest = null; } S._test.setSupply(0, Math.max(S._test.supply()[0], 120)); S._test.botBuildTick(); }   /* (a sapper on his way to man an MG is not free to build; supplies may have gone on earlier checks) */
  const bb = builder();
  if (!bb) console.log('SAPDBG', JSON.stringify({ forts: [...T.FORTS.values()].filter(q => q.team === 0 && !T.FORT[q.k].small).map(q => [q.k, q.done]), sup: S._test.supply()[0], saps: ents().filter(e => e.bot && e.team === 0 && e.cls === 'sapper').map(e => ({ id: e.id, alive: e.alive, tgt: !!e.tgt, bf: !!e.buildF, fn: !!e.fortNest, mg: e.mg, z: +e.z.toFixed(1), x: +e.x.toFixed(1) })) }));
  ck('botSapperLaysOut', bb && [...T.FORTS.values()].filter(q => q.team === 0 && !T.FORT[q.k].small).length === before + 1);
  const bf = bb && bb.buildF; for (let i = 0; i < 120 && bf && bf.done < 1; i++) { bb.tgt = null; bb.scan = 99; if (!bb.alive) { bb.alive = true; bb.hp = 100; } if (!bb.buildF) bb.buildF = bf; await sleep(250); }
  ck('botSapperFinishes', bf && bf.done >= 1); if (bf && bf.done < 1) console.log('BLDDBG', JSON.stringify({ done: bf.done, hp: bf.hp, inForts: T.FORTS.has(bf.id), bb: { alive: bb.alive, bf: bb.buildF === bf, d: Math.hypot(bb.x - bf.x, bb.z - bf.z), y: bb.y, fy: bf.y, cl: !!bb.cl, fn: !!bb.fortNest, mg: bb.mg } }));
  // pathing: a bot dropped in a trench reaches a point beyond the wall by climbing out
  const tb = ents().find(e => e.bot && e.alive && e.team === 0 && !e.mg && !e.fortNest && !e.buildF && e !== sap && e !== bb); const z0 = T.trenchC(22, 0);
  tb.x = 0; tb.z = z0; tb.y = T.hAt(H, 0, z0); tb.climb = null; tb.cov = null; let climbed = false; const gz = z0 - 14;
  for (let i = 0; i < 400; i++) { S._test.NAV.tick(); S._test.navMove(tb, 0, gz, 3.2); if (tb.climb) climbed = true; tb.y = tb.climb ? tb.y : T.groundAt(H, tb.x, tb.z, tb.y + .3); if (Math.hypot(tb.x, tb.z - gz) < 1.5) break; }
  ck('botClimbsOutOfTrench', climbed && Math.hypot(tb.x, tb.z - gz) < 2);
  const fail = Object.entries(R).filter(([, v]) => !v).map(([k]) => k); console.log(JSON.stringify(R, null, 1));
  console.log(fail.length ? 'FAILED: ' + fail.join(', ') : 'ALL ' + Object.keys(R).length + ' CHECKS PASSED'); process.exit(fail.length ? 1 : 0);
})().catch(e => { console.log('TEST ERROR', e); process.exit(1); });
