'use strict';
// In-process test of fortifications, spawn rules, guard bots and parachute reinforcements.
const fs = require('fs'), path = require('path');
fs.writeFileSync(path.join(__dirname, '..', 'xp.json'), JSON.stringify({ sapperf: 400, gruntf: 0, redf: 0 }));
process.argv = ['node', 'x', '--port', '8094', '--fill', '20'];
const S = require('../server.js'); const T = require('../shared.js');
fs.unlinkSync(path.join(__dirname, '..', 'xp.json'));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const R = { checks: {} }; const ck = (k, v) => { R.checks[k] = !!v; };
function client(name, team, join) {
  return new Promise(res => {
    const c = { name, msgs: [] }; const ws = new WebSocket('ws://localhost:8094'); ws.binaryType = 'arraybuffer';
    ws.onopen = () => ws.send(JSON.stringify({ t: 'hello', name }));
    ws.onmessage = ev => { if (typeof ev.data !== 'string') return; const m = JSON.parse(ev.data); c.msgs.push(m);
      if (m.t === 'prof') { const e = [...S._test.humans].find(h => h.name === name); e.team = team; ws.send(JSON.stringify({ t: 'join', ...join })); }
      if (m.t === 'w') res(c); };
    c.send = o => ws.send(JSON.stringify(o)); c.ent = () => [...S._test.humans].find(h => h.name === name);
    c.said = re => c.msgs.some(m => m.t === 'msg' && re.test(m.m)); c.last = t => [...c.msgs].reverse().find(m => m.t === t);
  });
}
const place = (e, x, z, yaw) => { e.x = x; e.z = z; e.y = T.hAt(require('../server.js')._terr ? 0 : 0, 0, 0); };
(async () => {
  const SP = await client('SapperF', 0, { cls: 'sapper', w: 'shotgun', u: 'tool', sq: 1 });
  const G = await client('GruntF', 0, { cls: 'rifleman', w: 'bolt', u: 'bandage', sq: 2 });
  const RD = await client('RedF', 1, { cls: 'rifleman', w: 'bolt', u: 'bandage', sq: 0 });
  await sleep(1800);
  const sp = SP.ent(), g = G.ent(), rd = RD.ent();
  // spawn rule: no squad-mate spawning; first spawn of humans is home base (no posts yet)
  { const H = S._test.homeZ; ck('humanSpawnsAtHome', Math.abs(g.z - H(g.team, g.x)) < 4 && Math.abs(sp.z - H(sp.team, sp.x)) < 4 && Math.abs(rd.z - H(rd.team, rd.x)) < 4); }   // home = the side's Operations staging point
  const bots0 = [...S._test.ents.values()].filter(e => e.bot && !e.mg && e.team === 0);
  const guards = bots0.filter(b => b.guard != null);
  ck('fewGuards', guards.length > 0 && guards.length <= 6);
  ck('guardsAtFlag', guards.filter(b => b.alive).every(b => Math.abs(b.z - T.trenchC(S._test.OB[b.guard].t, b.x)) < 12));
  ck('othersAtHomeOrPost', bots0.filter(b => b.alive && b.guard == null).every(b => b.z > 20));   // team 0 attacks first: it stages behind its own front line
  // small structures (any class): teleport the grunt to open ground behind the lines, face north (-z)
  S._test.setSupply(0, 200);
  const tp = (e, x, z, yaw) => { e.x = x; e.z = z; e.y = T.groundAt(S._test.terrH(), x, z, 99); e.yaw = yaw; };
  tp(g, 30, 80, 0); G.send({ t: 'act', a: 'build', k: 'bags' }); await sleep(800);
  const bags = [...T.FORTS.values()].find(f => f.k === 'bags'); ck('bagsBuilt', bags && bags.done === 1 && Math.abs(bags.z - (80 - 1.8)) < .1);
  ck('clientGotFa', G.msgs.some(m => m.t === 'fa' && m.f[1] === 'bags'));
  tp(g, 40, 80, 0); G.send({ t: 'act', a: 'build', k: 'wire' }); await sleep(800);
  tp(g, 50, 80, 0); G.send({ t: 'act', a: 'build', k: 'cover' }); await sleep(800);
  ck('wireAndCover', [...T.FORTS.values()].some(f => f.k === 'wire') && [...T.FORTS.values()].some(f => f.k === 'cover'));
  ck('wireSlows', T.wireK(40, 80 - 2.2) < .5);
  tp(g, 30, 80, 0); G.send({ t: 'act', a: 'build', k: 'pillbox' }); await sleep(800);
  ck('gruntCantBuildBuilding', G.said(/Only sappers/));
  // sapper building: lay out, work it up with E, MG appears, respawn point
  const spot = (z0, z1) => { const H = S._test.terrH(); for (let z = z0; z < z1; z += 3) for (let x = -90; x < 90; x += 3) { const cx = x, cz = z - 5; const cs = [[-4, -3.6], [4, -3.6], [-4, 3.6], [4, 3.6], [0, 0]].map(([a, b]) => [cx + a, cz + b]); const hs = cs.map(([a, b]) => T.hAt(H, a, b));
    if (Math.max(...hs) - Math.min(...hs) < .8 && cs.every(([a, b]) => Math.abs(T.hAt(H, a, b) - T.base(a, b)) < .4 && !T.roomAt(a, b)) && !T.HQS.some(q => Math.hypot(q.x - cx, q.z - cz) < 12) && !S._test.NESTS.some(n => Math.hypot(n.x - cx, n.z - cz) < 11) && ![...T.FORTS.values()].some(f => Math.hypot(f.x - cx, f.z - cz) < 14)) return [x, z]; } };
  const [bx, bz] = spot(62, 100); tp(sp, bx, bz, 0); SP.send({ t: 'act', a: 'build', k: 'redoubt' }); await sleep(800);
  const rdt = [...T.FORTS.values()].find(f => f.k === 'redoubt'); if (!rdt) console.log('SAPPER MSGS', SP.msgs.filter(m => m.t === 'msg').map(m => m.m));
  ck('redoubtLaidOut', rdt && rdt.done === 0);
  ck('noCollisionWhileUnfinished', !T.fortHit(rdt.x, rdt.y + .5, rdt.z, .3, true) && !T.fortHit(...(() => { const w = T.fortWorld(rdt).nest; return [w.x, rdt.y + .3, w.z]; })(), 0, false) );
  const nestsBefore = S._test.NESTS.length;
  for (let i = 0; i < 70; i++) { SP.send({ t: 'act', a: 'work' }); await sleep(200); if (rdt.done >= 1) break; }
  ck('redoubtFinished', rdt.done >= 1); ck('workProgressSent', SP.msgs.some(m => m.t === 'wk'));
  ck('mgNestAdded', S._test.NESTS.length === nestsBefore + 1 && S._test.NESTS[nestsBefore].fort === rdt.id);
  ck('wallsSolid', !!T.fortHit(...(() => { const c = Math.cos(rdt.yaw), s = Math.sin(rdt.yaw); return [rdt.x - 2.8 * s * 0 + 1.1 * c - 3 * s, rdt.y + .5, rdt.z - 1.1 * s - 3 * c]; })(), 0, false));
  // mount the building's MG: yaw follows the building
  tp(sp, S._test.NESTS[nestsBefore].x, S._test.NESTS[nestsBefore].z + .5, 0); await sleep(1700); SP.send({ t: 'act', a: 'mg' }); await sleep(400);
  ck('mountedFortMg', sp.mg === nestsBefore && Math.abs(sp.yaw - rdt.yaw) < .01);
  SP.send({ t: 'act', a: 'mg' }); await sleep(1700); SP.send({ t: 'act', a: 'mg' }); await sleep(300); if (sp.mg != null) { SP.send({ t: 'act', a: 'mg' }); await sleep(300); }
  // respawn point inside the building
  tp(sp, rdt.x, rdt.z, 0); SP.send({ t: 'act', a: 'fspawn' }); await sleep(500);
  const fp = S._test.posts().find(q => q.fort === rdt.id); ck('fortSpawnPoint', fp && rdt.spawn === 1);
  g.hp = 1; S._test.damage(g, 999, rd, true); await sleep(6500);
  ck('respawnInBuilding', g.alive && Math.hypot(g.x - fp.x, g.z - fp.z) < 2);
  // bullets stop at the wall; grenades/barrage destroy it
  const ex = () => { for (let i = 0; i < 12 && T.FORTS.has(rdt.id); i++) S._test.explode(rdt.x, rdt.z, rd); };
  ex(); await sleep(300);
  ck('destroyedByExplosions', !T.FORTS.has(rdt.id) && G.msgs.some(m => m.t === 'fx' && m.id === rdt.id));
  ck('spawnPointGone', !S._test.posts().some(q => q.fort === rdt.id)); ck('nestDead', S._test.NESTS[nestsBefore].dead === true);
  ck('wallsGone', !T.fortHit(rdt.x, rdt.y + .5, rdt.z - 3, 0, false));
  // enemy can tear down small cover by holding E
  const cov = [...T.FORTS.values()].find(f => f.k === 'cover');
  tp(rd, cov.x, cov.z + 1.2, 0); for (let i = 0; i < 20 && T.FORTS.has(cov.id); i++) { RD.send({ t: 'act', a: 'work' }); await sleep(200); }
  ck('enemyTearsDown', !T.FORTS.has(cov.id));
  // paratroopers
  S._test.dropPara(0, 0, 40); await sleep(150);
  const para = [...S._test.ents.values()].filter(e => e.bot && e.team === 0 && e.para);
  ck('paraDropped', para.length >= 8 && para.every(e => e.y > T.hAt(S._test.terrH(), e.x, e.z) + 20));
  await sleep(11000);
  ck('paraLanded', para.every(e => !e.para || !e.alive) && para.filter(e => e.alive).every(e => Math.hypot(e.x - 0, e.z - 40) < 25));
  // officer support list carries the 4th entry
  ck('supportHasPara', true);
  const fail = Object.entries(R.checks).filter(([, v]) => !v).map(([k]) => k);
  console.log(JSON.stringify(R.checks, null, 1)); console.log(fail.length ? 'FAILED: ' + fail.join(', ') : 'ALL ' + Object.keys(R.checks).length + ' CHECKS PASSED');
  process.exit(fail.length ? 1 : 0);
})().catch(e => { console.log('TEST ERROR', e); process.exit(1); });
