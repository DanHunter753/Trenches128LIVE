'use strict';
// v0.38: medics see and bandage hurt teammates and earn XP from the kills of the men they revive; a building's respawn point
// is a small radio in a back corner and its doorway is wide enough to walk out of; ping reaches the scoreboard.
process.argv = ['node', 'x', '--port', '8087', '--fill', '0', '--no-fetch', '--data', require('fs').mkdtempSync(require('path').join(require('os').tmpdir(), 't128v38-'))];
process.env.T128_TEST = '1';
const S = require('../server.js'), X = S._test, T = require('../shared.js');
const sleep = ms => new Promise(r => setTimeout(r, ms)), R = {}, ck = (k, v) => { R[k] = !!v; };
let nid = 9700;
const mk = (cls, w, team, name) => { const out = [], p = { id: nid++, team: team || 0, bot: false, name: name || cls, cls, w, u: 'bandage', sq: 0, spawnPick: null, usePost: false, xp: 0, ws: null, sp: [0, 0], deployed: true, q: [], ack: 0, msgs: out };
  p.ws = { open: true, socket: { write(b) { try { const n = b[1] & 127, off = n === 126 ? 4 : n === 127 ? 10 : 2; if ((b[0] & 15) === 1) out.push(JSON.parse(b.subarray(off).toString('utf8'))); } catch (e) { } }, cork() { }, uncork() { } } };
  X.ents.set(p.id, p); X.humans.add(p); X.spawnEnt(p); return p; };
const at = (p, x, z, yaw) => { p.x = x; p.z = z; p.y = T.hAt(X.terr().H, x, z); if (yaw != null) p.yaw = yaw; };
(async () => {
  await sleep(1500); X.setSupply(0, 100); X.setSupply(1, 100);
  // ---- medic: sees hurt teammates, bandages the one in front of him
  const med = mk('medic', 'carbine', 0, 'Doc'), mate = mk('rifleman', 'bolt', 0, 'Tommy'), far = mk('rifleman', 'bolt', 0, 'Faraway'), red = mk('rifleman', 'bolt', 1, 'Fritz');
  at(med, 0, 125, -Math.PI / 2); at(mate, 1.6, 125); at(far, 30, 125); at(red, 60, 125); mate.hp = 35; far.hp = 50; await sleep(700);
  const mh = [...med.msgs].reverse().find(m => m.t === 'mh'); R.mh = mh && mh.l;
  ck('medicSeesHurt', mh && mh.l.some(r => r[0] === mate.id && r[1] === 35) && mh.l.some(r => r[0] === far.id && r[1] === 50) && !mh.l.some(r => r[0] === red.id));
  ck('othersDoNot', !mate.msgs.some(m => m.t === 'mh'));
  ck('targetInFront', X.medicTarget(med) === mate); med.yaw = Math.PI / 2; ck('notBehind', X.medicTarget(med) == null); med.yaw = -Math.PI / 2;
  const bd0 = med.bd, sc0 = med.st ? med.st.sc : 0; med.hp = 60; X.onAct(med, 'heal', {});
  ck('mateBandaged', mate.hp === 100 && med.hp === 60 && med.bd === bd0 - 1 && med.msgs.some(m => m.t === 'mhd' && m.id === mate.id && m.hp === 65) && mate.msgs.some(m => m.t === 'msg' && /Doc bandaged you/.test(m.m)));
  ck('healXp', med.st && med.st.sc === sc0 + 8);
  med.healCd = 0; X.onAct(med, 'heal', {}); ck('thenHimself', med.hp === 100 && med.bd === bd0 - 2);   // nobody hurt in reach any more
  const rf = mk('rifleman', 'bolt', 0, 'Plain'); at(rf, 0, 128, -Math.PI / 2); at(mate, 1.5, 128); mate.hp = 40; rf.hp = 50; X.onAct(rf, 'heal', {}); ck('onlyMedicsHealOthers', mate.hp === 40 && rf.hp === 90);
  // ---- the medic earns XP for each kill his revived man makes, until that man dies
  X.downEnt(mate, red); await sleep(100); X.reviveEnt(mate, med); const s1 = med.st.sc; X.creditKill(red, mate, false); ck('reviveKillXp', med.st.sc === s1 + 4 && med.msgs.some(m => m.t === 'msg' && /revived soldier got a kill/.test(m.m)));
  X.spawnEnt(mate); const s2 = med.st.sc; X.creditKill(red, mate, false); ck('untilHeDies', med.st.sc === s2);
  // ---- ping on the scoreboard
  med.ping = 57; const row = X.scoreRows(0, med).l.find(r => r[0] === 'Doc'); ck('pingOnScoreboard', row && row[11] === 57);
  // ---- buildings: doorway and radio
  const H = X.terr().H; let doors = true, radios = true, spawns = true; R.forts = {};
  for (const [i, k] of ['redoubt', 'blockhouse', 'pillbox'].entries()) {
    const fx = -60 + i * 40, fz = 150, f = { id: 9000 + i, k, team: 0, x: fx, z: fz, yaw: .4 * i, y: T.hAt(H, fx, fz), done: 1, hp: T.FORT[k].hp, by: null, spawn: 0 }; T.addFort(f);
    const w = T.fortWorld(f), toW = (lx, lz) => { const c = Math.cos(f.yaw), s = Math.sin(f.yaw); return [f.x + lx * c - lz * s, f.z - lx * s - lz * c]; }, out = toW(0, -6.5), door = toW(0, -3);
    for (const [ox, oz] of [[-.5, -.5], [.5, -.5], [-.5, .5], [.5, .5], [0, 0]]) {   // from every corner of the spawn spot: walk to the doorway, then out
      const p = { x: w.sp.x + ox, z: w.sp.z + oz, y: 0, vy: 0, cls: 'rifleman', w: 'bolt' }; p.y = T.groundAt(H, p.x, p.z, 99); if (T.fortHit(p.x, p.y, p.z, .3, true)) spawns = false;
      for (let n = 0; n < 260; n++) { const tg = Math.hypot(p.x - door[0], p.z - door[1]) > .35 && !p.past ? door : (p.past = 1, out); T.step(p, { dt: .05, f: 1, s: 0, bits: 0, yaw: Math.atan2(-(tg[0] - p.x), -(tg[1] - p.z)) }, H, 1); }
      if (Math.hypot(p.x - out[0], p.z - out[1]) > 1) { doors = false; R.forts[k + ox + ',' + oz] = [+p.x.toFixed(1), +p.z.toFixed(1)]; } }
    if (!w.radio || T.fortHit(w.radio.x, f.y, w.radio.z, .2, true) || Math.hypot(w.radio.x - w.sp.x, w.radio.z - w.sp.z) < 1.4 || Math.hypot(w.radio.x - f.x, w.radio.z - f.z) > 4.6) radios = false;
    const sap = mk('sapper', 'shotgun', 0, 'Sap' + i); at(sap, fx, fz); X.fortSpawn(sap); const q = X.posts().find(q => q.fort === f.id);
    if (!q || !q.radio) radios = false; else for (let n = 0; n < 12; n++) { sap.spawnPick = q.id; X.spawnEnt(sap); if (Math.hypot(sap.x - w.sp.x, sap.z - w.sp.z) > .8 || T.fortHit(sap.x, sap.y, sap.z, .3, true)) spawns = false; }
  }
  ck('canWalkOutOfEveryBuilding', doors); ck('radioInACorner', radios); ck('spawnsClearOfWalls', spawns);
  console.log(JSON.stringify(R)); const bad = Object.keys(R).filter(k => R[k] === false); console.log(bad.length ? 'FAILED: ' + bad.join(', ') : 'ALL ' + Object.keys(R).filter(k => typeof R[k] === 'boolean').length + ' CHECKS PASSED'); process.exit(bad.length ? 1 : 0);
})().catch(e => { console.log('TEST ERROR', e); process.exit(1); });
