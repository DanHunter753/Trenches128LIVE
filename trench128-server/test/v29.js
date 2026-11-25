'use strict';
// In-process test (v0.29): bullets and sight never pass through blockhouse walls (only through the firing slits), HQ shelters
// (solid posts, a roof that stops bullets), trench floors survive shelling, text chat (to everyone / to your side, plain text,
// rate limit), quick spotting of several enemies at once, bots preferring spotted enemies.
const fs = require('fs'), os = require('os');
process.argv = ['node', 'x', '--port', '8062', '--fill', '6', '--no-fetch', '--data', fs.mkdtempSync(os.tmpdir() + '/t128v29-')];
const S = require('../server.js'); const T = require('../shared.js');
const sleep = ms => new Promise(r => setTimeout(r, ms)); const R = { checks: {} }; const ck = (k, v) => { R.checks[k] = !!v; };
function client(name, team, join) {
  return new Promise(res => {
    const c = { name, msgs: [] }; const ws = new WebSocket('ws://localhost:8062'); ws.binaryType = 'arraybuffer';
    ws.onopen = () => ws.send(JSON.stringify({ t: 'hello', name }));
    ws.onmessage = ev => { if (typeof ev.data !== 'string') return; const m = JSON.parse(ev.data); c.msgs.push(m);
      if (m.t === 'prof') { const e = [...S._test.humans].find(h => h.name === name); e.team = team; ws.send(JSON.stringify({ t: 'join', ...join })); }
      if (m.t === 'w') res(c); };
    c.send = o => ws.send(JSON.stringify(o)); c.ent = () => [...S._test.humans].find(h => h.name === name);
    c.got = (t, f) => c.msgs.filter(m => m.t === t && (!f || f(m)));
  });
}
const place = (e, x, z, y) => { e.x = x; e.z = z; e.y = y != null ? y : T.hAt(S._test.terrH(), x, z); e.vy = 0; e.cl = null; e.pitch = 0; e.goTo = null; };
(async () => {
  const A = await client('ChatA', 0, { cls: 'rifleman', w: 'bolt', u: 'bandage', sq: 0 });
  const B = await client('ChatB', 0, { cls: 'rifleman', w: 'bolt', u: 'bandage', sq: 0 });
  const D = await client('ChatD', 1, { cls: 'rifleman', w: 'bolt', u: 'bandage', sq: 0 });
  await sleep(1500); const X = S._test, H = () => X.terrH(), a = A.ent(), d = D.ent();
  for (let i = 0; i < 20 && !(a.alive && d.alive); i++) await sleep(250);

  // 1. blockhouse walls stop bullets; the firing slits do not
  { let gx = 0, gz = 2, bestF = 1e9;   // a flat spot (blockhouses can only be built on flat ground)
    for (let x = -120; x <= 120; x += 4) for (let z = -18; z <= 18; z += 2) { const h0 = T.hAt(H(), x, z); let dv = 0; for (let dz = -13; dz <= 4; dz += 1) for (const dx of [-2, -.9, 0, 1.75, 2]) dv = Math.max(dv, Math.abs(T.hAt(H(), x + dx, z + dz) - h0)); if (dv < bestF) { bestF = dv; gx = x; gz = z; } }
    R.flatSpot = [gx, gz, +bestF.toFixed(2)]; const gy = T.hAt(H(), gx, gz); const f = T.addFort({ id: 990001, k: 'blockhouse', team: 1, x: gx, z: gz, yaw: 0, y: gy, done: 1, hp: 900, spawn: 0 });
    const pickT = () => [...X.ents.values()].find(e => e.bot && e.team === 1 && e.alive && !e.mg && !e.inV && !e.tank && !e.veh && !e.manned && !e.crew && !e.gun); let tgt = pickT(); tgt.hp = 1e9; a.rw = 0; tgt.hist = null; /* no lag-compensation rewind in this test */ const shoot = async (tx, ty, n) => { let hits = 0;
      for (let i = 0; i < n; i++) { if (X.ents.get(tgt.id) !== tgt) { tgt = pickT(); tgt.hp = 1e9; }   /* bots get trimmed when players join: never shoot at a stale one */
        for (const o of X.ents.values()) if (o !== tgt && o !== a && !o.inV && !o.tank && !o.gun && !o.mg) { o.x = 150; o.z = (o.team ? -150 : 150); }   /* nobody else in the line of fire */
        for (const v of X.VEHM().V) if (v.k === 'tank' && Math.hypot(v.x - gx, v.z - gz) < 30) { v.x = -150; v.z = v.team ? -120 : 120; }
        place(tgt, tx, gz, tx === gx + 8 ? undefined : gy); await sleep(55); place(tgt, tx, gz, tx === gx + 8 ? undefined : gy); tgt.hist = null; tgt.alive = true; tgt.down = 0; tgt.crouch = false; tgt.peek = false; const hp0 = tgt.hp;   /* standing (a crouching man is below the slit) */   /* (one tick so the hit grid knows where he is) */ const ox = tx, oz = gz - 12, oy = ty; const yaw = Math.atan2(-(tgt.x - ox), -(tgt.z - oz)) + (Math.random() - .5) * .01;
        const b = X.fireBullet(a, ox, oy, oz, yaw, 0, 60, 30, 'bolt', 300); for (let k = 0; k < 20 && !X.bulletStep(b, 1 / 20); k++); const j = X.bullets.indexOf(b); if (j >= 0) X.bullets.splice(j, 1); if (tgt.hp < hp0) hits++; else if (tx === gx + 8 && !R.missWhy) R.missWhy = { rw: b.rw, arw: a.rw, team: [a.team, tgt.team, b.team], cr: tgt.crouch, y: +tgt.y.toFixed(2), oy: +oy.toFixed(2), hp: tgt.hp, cmd: !!tgt.cmd, man: !!tgt.manned, inV: !!tgt.inV, id: tgt.id, d: +b.d.toFixed(1), b: [+b.x.toFixed(1), +b.y.toFixed(2), +b.z.toFixed(1)], t: [+tgt.x.toFixed(1), +tgt.z.toFixed(1)], para: !!tgt.para, alive: tgt.alive, down: tgt.down }; } return hits; };
    // local frame: yaw 0, front wall (slits at x = -2.6 / -0.9 / 0.9 / 2.6, 1.3-1.75 m) faces -z; the shooter stands 12 m out
    R.wallHits = await shoot(gx + 1.75, gy + 1.0, 80); R.slitHits = await shoot(gx - .9, gy + 1.5, 40); R.openHits = await shoot(gx + 8, T.hAt(H(), gx + 8, gz) + 1.0, 10);
    ck('openShotsHit', R.openHits >= 9); ck('wallStopsBullets', R.wallHits === 0); ck('slitLetsBulletsThrough', R.slitHits > 30);
    ck('wallBlocksSight', !T.los(H(), gx + 1.75, gy + 1.2, gz - 12, gx + 1.75, gy + 1.2, gz + 1));
    T.delFort(f.id); }
  // 2. HQ shelters: posts block walking, the roof stops bullets from above but lets men walk in under its edge
  { const q = T.HQS[0]; ck('hqPostSolid', !!T.fortHit(q.x + 5, q.gy, q.z + 3.5, .3, true)); ck('hqRoofBlocksSight', !T.los(H(), q.x, q.gy + 9, q.z, q.x + .5, q.gy + 1.2, q.z + .5));
    ck('hqRoofNotAWall', !T.fortHit(q.x + 5.3, q.gy + .9, q.z, .3, true)); }
  // 3. trench floors survive a barrage (walls and open ground still crater)
  { const F0 = T.makeTerrain().F0; let worst = 0, open = 0; const pts = [];
    for (let i = 0; i < 40; i++) { const x = -110 + i * 5.5, z = T.trenchC(-64, x) + .2; pts.push([x, z]); X.explode(x, z, null, 1, 'arty'); }
    for (const [x, z] of pts) { const k = Math.round((z + T.W) / T.ST) * (T.N + 1) + Math.round((x + T.W) / T.ST); if (T.isFloor(k) && !T.BAYS.has(-64 * 1000 + Math.floor((x + T.W) / 9))) worst = Math.max(worst, Math.abs(H()[k] - F0[k])); }   // (a blown-in bay fills with a spoil ramp by design)
    R.baysBlown = T.BAYS.size;
    X.explode(0, -12, null, 1, 'arty'); { const k = Math.round((-12 + T.W) / T.ST) * (T.N + 1) + Math.round(T.W / T.ST); open = F0[k] - H()[k]; }
    { const cx = -20, cz = 12; for (let i = 0; i < 30; i++) X.explode(cx + (Math.random() - .5) * 3, cz + (Math.random() - .5) * 3, null, 1, 'arty'); let lo = 0, hi = 0;
      for (let x = cx - 8; x <= cx + 8; x += .5) for (let z = cz - 8; z <= cz + 8; z += .5) { const k = Math.round((z + T.W) / T.ST) * (T.N + 1) + Math.round((x + T.W) / T.ST); lo = Math.min(lo, H()[k] - F0[k]); hi = Math.max(hi, H()[k] - F0[k]); }
      R.pit = [+lo.toFixed(2), +hi.toFixed(2)]; ck('noDeepPits', lo >= -T.DIG_MAX - 1e-6 && hi <= T.RIM_MAX + 1e-6); }
    R.floorWorst = +worst.toFixed(3); R.openCrater = +open.toFixed(2); ck('trenchFloorHolds', worst <= T.FLOOR_GIVE + 1e-6); ck('openGroundStillCraters', open > .5); }
  // 4. chat
  { A.send({ t: 'chat', m: 'all <b>hello</b>‮\u0007  there' }); await sleep(250);
    const toB = B.got('chat').pop(), toD = D.got('chat').pop();
    ck('chatReachesEveryone', toB && toD && toB.m === toD.m && toB.n === 'ChatA' && toB.tc === 0);
    ck('chatPlainTextCleaned', toB && toB.m === 'all <b>hello</b> there');
    A.send({ t: 'chat', m: 'side only', team: true }); await sleep(250);
    ck('teamChatStaysOnSide', B.got('chat').some(m => m.m === 'side only' && m.tc === 1) && !D.got('chat').some(m => m.m === 'side only'));
    const n0 = B.got('chat').length; for (let i = 0; i < 8; i++) A.send({ t: 'chat', m: 'spam ' + i }); await sleep(300);
    R.spamDelivered = B.got('chat').length - n0; ck('chatRateLimited', R.spamDelivered <= 3 && A.got('msg', m => /Slow down/.test(m.m)).length > 0);
    A.send({ t: 'chat', m: 'x'.repeat(500) }); A.send({ t: 'chat', m: { evil: 1 } }); A.send({ t: 'chat' }); await sleep(1700); A.send({ t: 'chat', m: 'y'.repeat(300) }); await sleep(250);
    ck('chatLengthCapped', B.got('chat').every(m => m.m.length <= 120)); }
  // 5. quick spotting: five enemies in front of you are spotted with one tap; taps are 0.4 s apart
  { const ay = T.hAt(H(), 40, 10); place(a, 40, 10); a.yaw = 0; a.pitch = 0; a.spotCd = 0; a.markCd = 0;
    const foes = [...X.ents.values()].filter(e => e.team === 1 && e.alive && !e.mg && !e.cmd && !e.inV && !e.tank && !e.veh && !e.manned && !e.crew && !e.gun).slice(0, 5); for (const e of foes) { e.hp = 1e9; e.sp[0] = 0; }
    const lay = () => foes.forEach((e, i) => place(e, 40 + (i - 2) * 1.2, 10 - 25));
    lay(); A.send({ t: 'act', a: 'mark' }); await sleep(60); lay(); await sleep(60);
    const tk = X.tickNo(); R.spottedOneTap = foes.filter(e => e.sp[0] > tk).length; ck('spotsSeveralAtOnce', R.spottedOneTap >= 4);
    ck('spotSoundSent', A.got('spt').length > 0); ck('noBigMarkPerSpot', A.got('mk').length <= 1);
    const s0 = A.got('spt').length; for (const e of foes) e.sp[0] = 0; lay(); A.send({ t: 'act', a: 'mark' }); await sleep(80); ck('spotCooldown', A.got('spt').length === s0);   /* (our bots spot too: count only this player's confirmations) */
    await sleep(500); for (const e of foes) e.sp[0] = 0; lay(); A.send({ t: 'act', a: 'mark' }); await sleep(120); ck('spotAgainAfterCooldown', A.got('spt').length > s0); }
  // 6. bots go for spotted enemies first
  { const bot = [...X.ents.values()].find(e => e.bot && e.team === 0 && e.alive && !e.mg && !e.kit && !e.crew && !e.gun && (e.cls === 'rifleman' || e.cls === 'assault')) || [...X.ents.values()].find(e => e.bot && e.team === 0 && e.alive && !e.mg && !e.kit); const foes = [...X.ents.values()].filter(e => e.team === 1 && e.alive && !e.mg && !e.cmd && !e.inV && !e.tank && !e.veh && !e.manned && !e.crew && !e.gun).slice(0, 2);
    X.alarms.length = 0; R.botState = { kit: bot.kit, cls: bot.cls, mg: bot.mg, gun: bot.gun };
    let picks = 0, n = 0; for (let k = 0; k < 20; k++) { bot.shelter = null; bot.charging = false; bot.climb = null; bot.down = 0; place(bot, -40, 8); bot.hp = 1e9; place(foes[0], -40, 8 - 18); place(foes[1], -40 + 6, 8 - 26); foes[0].sp[0] = 0; foes[1].sp[0] = X.tickNo() + 200; bot.scan = 0; await sleep(60); if (bot.tgt) { n++; if (bot.tgt === foes[1]) picks++; } }
    R.spottedPicks = picks + '/' + n; ck('botsPreferSpotted', n > 5 && picks >= n * .7); }
  // 7. no bot spins on the spot: idle bots never swing more than 0.5 rad in a tick
  { const prev = new Map(); let worst = 0, n = 0; for (let k = 0; k < 80; k++) { await sleep(50);
      for (const e of X.ents.values()) { if (!e.bot || !e.alive || e.tgt || e.mg || e.charging) { prev.delete(e.id); continue; } const p = prev.get(e.id);
        if (p != null) { const d = Math.abs(Math.atan2(Math.sin(e.yaw - p), Math.cos(e.yaw - p))); worst = Math.max(worst, d); n++; } prev.set(e.id, e.yaw); } }
    R.idleTurnMax = +worst.toFixed(2); ck('idleBotsDontTwitch', n > 50 && worst <= .52); }
  console.log(JSON.stringify(R, null, 1)); const bad = Object.entries(R.checks).filter(([, v]) => !v).map(e => e[0]);
  console.log(bad.length ? 'FAILED ' + bad : 'ALL ' + Object.keys(R.checks).length + ' CHECKS PASSED'); process.exit(bad.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
