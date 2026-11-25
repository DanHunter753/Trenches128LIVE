'use strict';
// v0.31 aircraft, in-process: the officer's bomber, recon and strafing runs are flown by biplanes that cross from their own
// side; a bomber drops 8 bombs along its path over the target; a strafing run hurts soldiers under it; bullets hit planes
// and a plane shot down stops its job (a recon plane stops spotting); each side's AA guns wear enemy planes down, and an
// AA gun is wrecked by enemy shells and repaired by hand.
process.argv = ['node', 'x', '--port', '8077', '--fill', '4', '--no-fetch', '--data', require('fs').mkdtempSync(require('path').join(require('os').tmpdir(), 't128pl-'))];
process.env.T128_TEST = '1';
const S = require('../server.js'), T = require('../shared.js'), X = S._test;
const sleep = ms => new Promise(r => setTimeout(r, ms)), R = {}, ck = (k, v) => { R[k] = !!v; };
function client(name, team) { return new Promise(res => { const ws = new WebSocket('ws://localhost:8077'), c = { ws, msgs: [] }; ws.binaryType = 'arraybuffer';
  ws.onopen = () => ws.send(JSON.stringify({ t: 'hello', name, team })); ws.onmessage = ev => { if (typeof ev.data === 'string') { const m = JSON.parse(ev.data); c.msgs.push(m); if (m.t === 'prof') res(c); } }; }); }
const lines = t => T.PHONES.map((L, l) => [L, l]).filter(([L]) => L.team === t);
const mid = (l, s) => { const a = T.PHONES[l].pts[s], b = T.PHONES[l].pts[s + 1]; return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; };
async function hold(c, me, x, z, ms, done) { let t = 0; while (!done() && t < ms) { me.alive = true; me.x = x; me.z = z; c.ws.send(JSON.stringify({ t: 'act', a: 'work' })); await sleep(200); t += 200; } return t; }
(async () => {
  await sleep(500);
  const A = await client('Flak', 0); A.ws.send(JSON.stringify({ t: 'join', cls: 'rifleman', w: 'rifle', u: 'bandage', sq: 1 })); await sleep(800);
  const me = [...X.humans].find(p => p.name === 'Flak'), off1 = { team: 1, bot: true, id: -71, name: 'Off' }, off0 = { team: 0, bot: true, id: -70, name: 'Off0' };
  ck('twoAAperSide', X.AAS.filter(a => a.team === 0).length === 2 && X.AAS.filter(a => a.team === 1).length === 2);
  const run = s => { for (let t = 0; t < s; t += .05) X.planesTick(); };   // advance the planes directly (the live tick also runs them)
  const hold = X.AAS.map(a => a.dead); X.AAS.forEach(a => { a.dead = true; });   // AA off for the clean runs
  // bomber from team 0: starts on its own side, 8 craters in a line over the target
  const n0 = X.craters().length, b = X.planeLaunch(0, 'bomb', 10, -40, off0); ck('startsOwnSide', b.z > -40 + 100);
  run(6); await sleep(900); const cr = X.craters().slice(n0).filter(c => typeof c[0] === 'number' && Math.abs(c[0] - 10) < 3 && Math.abs(c[1] + 40) < 34);
  R.bombCraters = cr.length; ck('bombsDropped', cr.length === 8); ck('clientsSeePlane', A.msgs.some(m => m.t === 'pl' && m.l.some(q => q[2] === 'bomb')));
  run(8); ck('planeLeaves', !X.planes.includes(b));
  // strafing run over an enemy soldier
  const e = [...X.ents.values()].find(q => q.team === 1 && q.bot); e.alive = true; e.hp = 100; e.down = 0; e.x = -20; e.z = -45; e.vx = e.vz = 0;
  const hp0 = e.hp; for (let pass = 0; pass < 5 && e.alive && e.hp === hp0; pass++) { X.planeLaunch(0, 'strafe', -20, -45, off0); let tt = 0; while (tt < 6) { e.x = -20; e.z = -45; e.cr = 0; if (!e.alive) break; X.planesTick(); tt += .05; } }   // (70% a pass)
  R.strafeHp = e.alive ? e.hp : 'dead'; ck('strafeHurts', !e.alive || e.hp < hp0);
  // recon plane circles and spots; shot down, it stops spotting and tells the clients
  const r = X.planeLaunch(0, 'recon', 0, -50, off0); run(4); ck('reconCircles', r.ph === 'circle' && r.rc && r.rc.until > X.tickNo());
  // a rifle bullet from below hits the plane
  const hp1 = r.hp, bl = { x: r.x, y: r.y - 2, z: r.z, vx: 0, vy: 300, vz: 0, d: 0, rng: 400, team: 1, by: off1, dmg: 40, wk: 'bolt' };
  ck('bulletHitsPlane', X.bulletStep(bl, .05) === true && r.hp < hp1);
  X.planeHurt(r, 999, off1); await sleep(200); ck('shotDown', r.ph === 'down' && r.rc.until === 0); ck('downTold', A.msgs.some(m => m.t === 'pd' && m.id === r.id));
  X.planesTick(); ck('removed', !X.planes.includes(r));
  // AA guns: with both enemy guns up, a deep bomber run takes flak
  X.AAS.forEach((a, i) => { a.dead = hold[i]; }); const ea = X.AAS.find(a => a.team === 1);
  const b2 = X.planeLaunch(0, 'bomb', ea.x, ea.z, off0); for (let t = 0; t < 9 && X.planes.includes(b2) && b2.ph !== 'down'; t += .05) X.planesTick();
  R.flakHp = Math.round(b2.hp); ck('aaHurtsPlanes', b2.hp < 120);
  // enemy shell wrecks an AA gun; holding E beside it repairs it
  const mine = X.AAS.findIndex(a => a.team === 0), aa = X.AAS[mine]; for (let k = 0; k < 3 && !aa.dead; k++) X.explode(aa.x + .5, aa.z, off1, 1); await sleep(200);
  ck('aaWrecked', aa.dead && A.msgs.some(m => m.t === 'aad' && m.i === mine && m.d === 1));
  me.cls = 'sapper'; let t = 0; while (aa.dead && t < 12000) { me.alive = true; me.x = aa.x + 1.2; me.z = aa.z; A.ws.send(JSON.stringify({ t: 'act', a: 'work' })); await sleep(200); t += 200; }
  ck('aaRepaired', !aa.dead && A.msgs.some(m => m.t === 'aad' && m.i === mine && m.d === 0));
  X.planeLaunch(1, 'strafe', 0, 0, off1); X.resetRound(); ck('resetClears', X.planes.length === 0 && X.AAS.every(a => !a.dead));
  console.log(JSON.stringify(R)); const bad = Object.keys(R).filter(k => R[k] === false); console.log(bad.length ? 'FAILED: ' + bad.join(', ') : 'ALL ' + Object.keys(R).filter(k => typeof R[k] === 'boolean').length + ' CHECKS PASSED'); process.exit(bad.length ? 1 : 0);
})().catch(e => { console.log('TEST ERROR', e); process.exit(1); });
