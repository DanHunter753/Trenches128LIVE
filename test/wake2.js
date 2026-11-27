'use strict';
// v0.44 Wake stage 2: bot plan (two assault squads on two different front flags, garrison holds; a flag under attack pulls
// defenders), the rally barrage + paratroop drop, respawning around a held flag on dry land, the landing force's missing
// airfield, and the Domination section of the after-action report.
process.argv = ['node', 'x', '--port', '8083', '--fill', '24', '--no-fetch', '--maps', 'wake', '--data', require('fs').mkdtempSync(require('path').join(require('os').tmpdir(), 't128wk2-'))];
process.env.T128_TEST = '1';
const S = require('../server.js'), X = S._test, T = require('../shared.js');
const sleep = ms => new Promise(r => setTimeout(r, ms)), R = {}, ck = (k, v) => { R[k] = !!v; };
let nid = 9700;
const mk = (cls, w, team, name, pick) => { const out = [], p = { id: nid++, team: team || 0, bot: false, name: name || cls, cls, w, u: 'bandage', sq: 0, spawnPick: pick == null ? null : pick, usePost: false, xp: 0, ws: null, sp: [0, 0], deployed: true, q: [], ack: 0, msgs: out };
  p.ws = { open: true, socket: { writableLength: 0, write(b) { try { const n = b[1] & 127, off = n === 126 ? 4 : n === 127 ? 10 : 2; if ((b[0] & 15) === 1) out.push(JSON.parse(b.subarray(off).toString('utf8'))); } catch (e) { } }, cork() { }, uncork() { } } };
  X.ents.set(p.id, p); X.humans.add(p); X.spawnEnt(p); return p; };
(async () => {
  await sleep(1500); const H = X.terr().H, F = X.OB.slice(0, 5), dom = X.dom();
  // plan: with three flags neutral, assault squads 0 and 1 aim at different flags; the garrison squad holds its own flag
  const bots = [...X.ents.values()].filter(e => e.bot && !e.mg && e.team === 0);
  const tgt = sq => { const b = bots.find(e => (e.squad | 0) === sq); const g = b && X.domGoal(b); return g && g.line; };
  const t0 = tgt(0), t1 = tgt(1), t2 = tgt(2);
  R.plan = [t0 && t0.n, t1 && t1.n, t2 && t2.n]; ck('assaultSquadsSplit', t0 && t1 && t0 !== t1 && t0.owner !== 0 && t1.owner !== 0);
  ck('garrisonHolds', t2 && t2.owner === 0);
  // goal spots are spread inside the circle and on dry passable ground
  const spots = bots.filter(e => (e.squad | 0) === 0).slice(0, 8).map(e => X.domGoal(e));
  ck('spotsInsideCircle', spots.every(g => Math.hypot(g.x - g.line.x, g.z - g.line.z) <= 12.5 && T.hAt(H, g.x, g.z) > .1));
  ck('spotsSpread', new Set(spots.map(g => Math.round(g.x) + ',' + Math.round(g.z))).size >= Math.min(5, spots.length));
  // threat: enemies on blue's flag -> the garrison squad goes to defend it
  const own = F.find(o => o.owner === 0), red = [0, 1, 2].map(i => { const m = mk('rifleman', 'bolt', 1, 'Raider' + i); m.x = own.x + i; m.z = own.z + 1; m.y = T.hAt(H, m.x, m.z); m.hp = 1e9; return m; });
  await sleep(1200); const th = dom.plan[0] && dom.plan[0].threat;
  ck('threatSpotted', th === own); ck('garrisonDefends', tgt(2) === own);
  red.forEach(m => { m.alive = false; X.ents.delete(m.id); X.humans.delete(m); });
  // respawn around a held flag, on land; the landing force (blue) has no airfield, so -99 sends it home
  const fi = F.indexOf(own); own.p = 1; for (const e of X.ents.values()) if (e.team === 1 && Math.hypot(e.x - own.x, e.z - own.z) < 40) { e.alive = false; e.rt = 60; } await sleep(300);
  const sp = mk('rifleman', 'bolt', 0, 'Flagger', -(fi + 1));
  R.flagSpawn = [X.flagSpawnOk(0, fi), Math.round(Math.hypot(sp.x - own.x, sp.z - own.z)), +T.hAt(H, sp.x, sp.z).toFixed(1)];
  ck('spawnAtHeldFlag', Math.hypot(sp.x - own.x, sp.z - own.z) < 14 && T.hAt(H, sp.x, sp.z) > .3 && X.navPassable(sp.x, sp.z));
  const ap = mk('rifleman', 'bolt', 0, 'Airman', -99), st0 = T.MP.meta.start.find(q => q.team === 0);
  ck('noAirfieldForLandingForce', Math.hypot(ap.x - st0.x, ap.z - st0.z) < st0.r + 5 && T.hAt(H, ap.x, ap.z) > .3);
  // rally: barrage on the target flag, then paratroopers, and every trailing bot heads there
  const cr0 = X.craters().length; X.domRally(1, 25); const rl = dom.rally[1];
  ck('rallyTarget', rl && rl.o.owner !== 1);
  await sleep(6000); const cr1 = X.craters().length; R.shells = cr1 - cr0; ck('rallyBarrage', cr1 - cr0 >= 6 && X.craters().slice(cr0).every(c => Math.hypot(c[0] - rl.o.x, c[1] - rl.o.z) < 20));
  await sleep(1500); const paras = [...X.ents.values()].filter(e => e.bot && e.team === 1 && e.para).length; R.paras = paras; ck('rallyParas', paras >= 4);
  const gb = [...X.ents.values()].filter(e => e.bot && !e.mg && e.team === 1 && e.alive).slice(0, 10).map(e => X.domGoal(e)).filter(Boolean);
  ck('rallyEveryoneForward', gb.length && gb.every(g => g.line === rl.o));
  ck('rallyCounted', dom.rl[1] === 1);
  // report: domination section with time held per flag
  await sleep(2000); const rep = X.report(0); R.rep = rep.dom && rep.dom.f.map(f => f[0] + ':' + f[2] + '/' + f[3]).join(' ');
  ck('reportDom', rep.dom && rep.dom.f.length === 5 && rep.dom.f.every(f => /^[A-E]$/.test(f[0])) && rep.dom.f.some(f => f[2] + f[3] > 0) && rep.dom.rl[1] === 1 && rep.dom.win === 100);
  console.log(JSON.stringify(R)); const bad = Object.keys(R).filter(k => R[k] === false); console.log(bad.length ? 'FAILED: ' + bad.join(', ') : 'ALL ' + Object.keys(R).filter(k => typeof R[k] === 'boolean').length + ' CHECKS PASSED'); process.exit(bad.length ? 1 : 0);
})().catch(e => { console.log('TEST ERROR', e); process.exit(1); });
