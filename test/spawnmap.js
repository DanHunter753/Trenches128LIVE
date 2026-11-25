'use strict';
// v0.31.1 spawn map, in-process: a soldier can respawn at a flag his side fully holds (in that trench); a flag being taken
// or with an enemy within 25 m can't be picked (he spawns elsewhere and is told); an enemy flag never.
process.argv = ['node', 'x', '--port', '8078', '--fill', '4', '--no-fetch', '--data', require('fs').mkdtempSync(require('path').join(require('os').tmpdir(), 't128sm-'))];
process.env.T128_TEST = '1';
const S = require('../server.js'), T = require('../shared.js'), X = S._test;
const sleep = ms => new Promise(r => setTimeout(r, ms)), R = {}, ck = (k, v) => { R[k] = !!v; };
(async () => {
  await sleep(500);
  const o = X.OB.findIndex(q => q.owner === 0), ob = X.OB[o], en = X.OB.findIndex(q => q.owner === 1);
  const far = () => { for (const e of X.ents.values()) if (e.team === 1 && Math.hypot(e.x - ob.x, e.z - T.trenchC(ob.t, e.x)) < 30) { e.x = 0; e.z = -150; } };
  far(); ck('ownHeldFlagOk', X.flagSpawnOk(0, o)); ck('enemyFlagNo', !X.flagSpawnOk(0, en));
  const p0 = ob.p; ob.p = .5; ck('beingTakenNo', !X.flagSpawnOk(0, o)); ob.p = p0;
  const bad = [...X.ents.values()].find(e => e.team === 1 && e.bot); const bx = bad.x, bz = bad.z, ba = bad.alive;
  bad.alive = true; bad.x = ob.x + 5; bad.z = T.trenchC(ob.t, ob.x + 5) + 10; ck('enemyNearNo', !X.flagSpawnOk(0, o)); bad.x = bx; bad.z = bz; bad.alive = ba; far();
  // a (fake) human soldier who picked the flag spawns in that trench
  const told = []; const p = { id: 9901, team: 0, bot: false, name: 'P', cls: 'rifleman', w: 'bolt', u: 'bandage', sq: 0, spawnPick: -(o + 1), xp: 0, ws: null };
  X.spawnEnt(p); R.d = +Math.hypot(p.x - ob.x, p.z - T.trenchC(ob.t, p.x)).toFixed(1); ck('spawnsAtFlag', Math.abs(p.x - ob.x) <= 7.5 && Math.abs(p.z - T.trenchC(ob.t, p.x)) < 1);
  p.spawnPick = -(en + 1); X.spawnEnt(p); ck('enemyPickFallsBack', Math.abs(p.z - T.trenchC(X.OB[en].t, p.x)) > 5);
  console.log(JSON.stringify(R)); const b = Object.keys(R).filter(k => R[k] === false); console.log(b.length ? 'FAILED: ' + b.join(', ') : 'ALL ' + Object.keys(R).filter(k => typeof R[k] === 'boolean').length + ' CHECKS PASSED'); process.exit(b.length ? 1 : 0);
})().catch(e => { console.log('TEST ERROR', e); process.exit(1); });
