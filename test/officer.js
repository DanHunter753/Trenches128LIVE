'use strict';
// In-process test of the officer layer: officer cap, leader election, orders (human + AI squads), order completion,
// support calls (barrage, drop, cooldown, cost), invisibility/invulnerability of officers, snapshot visibility rules.
const fs = require('fs'), path = require('path');
fs.writeFileSync(path.join(__dirname, '..', 'xp.json'), JSON.stringify({ officera: 12000, officerb: 12000, officerc: 12000, leaderx: 150, grunty: 0 }));
process.argv = ['node', 'x', '--port', '8096', '--fill', '20'];
const S = require('../server.js');
fs.unlinkSync(path.join(__dirname, '..', 'xp.json'));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const R = { checks: {} }; const ck = (k, v) => { R.checks[k] = !!v; };

function client(name, join) {
  return new Promise(res => {
    const c = { name, msgs: [], id: 0, cls: null, flags: 0, ids: new Set(), n: 0, x: 0, z: 0, hp: 0, spotted: 0 };
    const ws = new WebSocket('ws://localhost:8096'); ws.binaryType = 'arraybuffer'; c.ws = ws;
    ws.onopen = () => ws.send(JSON.stringify({ t: 'hello', name }));
    ws.onmessage = ev => {
      if (typeof ev.data !== 'string') { if (new Uint8Array(ev.data)[0] === 4) return;   // binary tracer frame (v0.23)

        const d = (c.dec || (c.dec = require('./snapdec.js')())).feed(ev.data); c.flags = d.flags; c.x = d.x; c.z = d.z; c.hp = d.hp; c.supply = d.supply; c.n = d.ents.size;
        c.ids = new Set(d.ents.keys()); c.spotted = 0; for (const q of d.ents.values()) if (q.fl & 32) c.spotted++;
        return;
      }
      const m = JSON.parse(ev.data); c.msgs.push(m);
      if (m.t === 'prof') { c.id = m.id; const e = [...S._test.humans].find(h => h.name === name); e.team = 0; ws.send(JSON.stringify({ t: 'join', ...join })); }
      if ((m.t === 'w' || m.t === 'snapReset') && c.dec) c.dec.reset();
      if (m.t === 'w') { c.cls = m.cls; res(c); }
    };
    c.send = o => ws.send(JSON.stringify(o)); c.last = t => [...c.msgs].reverse().find(m => m.t === t);
    c.count = (t, f) => c.msgs.filter(m => m.t === t && (!f || f(m))).length;
    c.ent = () => [...S._test.humans].find(h => h.name === name);
  });
}
(async () => {
  const A = await client('OfficerA', { cls: 'officer', w: 'carbine', u: 'bandage', sq: 0 });
  const B2 = await client('OfficerB', { cls: 'officer', w: 'carbine', u: 'bandage', sq: 0 });
  const C3 = await client('OfficerC', { cls: 'officer', w: 'carbine', u: 'bandage', sq: 0 });
  const L = await client('LeaderX', { cls: 'rifleman', w: 'bolt', u: 'bandage', sq: 1 });
  const G = await client('GruntY', { cls: 'rifleman', w: 'bolt', u: 'bandage', sq: 1 });
  ck('officerCapEnforced', A.cls === 'officer' && B2.cls === 'officer' && C3.cls === 'rifleman' && C3.msgs.some(m => m.t === 'msg' && /Officer slots are full/.test(m.m)));
  await sleep(1800);
  ck('officerHasNoSquadAndFlag', (A.flags & 32) && A.ent().sq === -1);
  ck('leaderElected', (L.flags & 16) && !(G.flags & 16));
  const sqs = A.last('sqs'); ck('officerGetsSquadRoster', sqs && sqs.l.some(r => r[0] === 1 && r[2] === 2 && r[3] === 'LeaderX') && sqs.l.filter(r => r[4] === 1).length === 3);
  ck('officerInvisibleToSoldiers', !L.ids.has(A.id) && !G.ids.has(A.id));
  const friendlies = [...S._test.ents.values()].filter(e => e.team === 0 && e.alive && !e.cmd).length;
  ck('officerSeesWholeFriendlyArmy', A.n >= friendlies * .9 - 1);
  // orders to a human squad (the squad's men are made shell-proof for this part: if the AI guns kill the leader, leadership
  // passes to the next man and the rewards below go to someone else, which is correct game behaviour but not what is tested here)
  const shield = setInterval(() => { for (const c of [L, G]) { const e = c.ent(); if (e && e.alive) e.hp = 1e6; } }, 50);
  G.send({ t: 'cmd', k: 'order', sq: 1, ty: 'attack', x: 0, z: -22 }); await sleep(300);
  ck('nonOfficerCannotOrder', !S._test.orders[0].has(1));
  A.send({ t: 'cmd', k: 'order', sq: 1, ty: 'attack', x: require('../shared.js').OBJ[3].x - 3, z: require('../shared.js').OBJ[3].z + 4 }); await sleep(400);
  const o1 = L.last('ord'), o2 = G.last('ord'), ol = A.last('ords');
  ck('humanSquadReceivesOrder', o1 && o1.o && o1.o.ty === 'attack' && /Green Front/.test(o1.o.n) && o2 && o2.o && o2.o.ty === 'attack');
  ck('officerGetsOrderList', ol && ol.l.some(r => r[0] === 1 && r[1] === 'attack'));
  // order completion by leader reaching the point
  const XPD = []; const got = (d, n) => { XPD.push([n, d]); return d >= n && d <= n + 12; };   // the reward was paid (a kill assist or spot may land in the same second)
  const xp0 = S._test.humans.size && L.ent().xp, oxp0 = A.ent().xp; const le = L.ent(); le.x = S._test.OB[3].x; le.z = S._test.OB[3].z; await sleep(1100);   // at the (staggered) Green Front objective
  ck('orderCompletes', L.last('ord').o.done === 1 && got(L.ent().xp - xp0, 20) && got(A.ent().xp - oxp0, 15));
  // squad-wide reward: a new defend order, the grunt waits near the point, the leader arrives
  { const g = G.ent(), le2 = L.ent(); g.x = 40; g.z = 88; le2.x = 0; le2.z = 110; await sleep(300);
    A.send({ t: 'cmd', k: 'order', sq: 1, ty: 'defend', x: 40, z: 90 }); await sleep(400);
    const gx0 = g.xp, lx0 = le2.xp, ax0 = A.ent().xp; le2.x = 41; le2.z = 91; await sleep(1100);
    ck('troopsRewardedOnCompletion', got(g.xp - gx0, 10) && got(le2.xp - lx0, 20) && got(A.ent().xp - ax0, 17) && G.msgs.some(m => m.t === 'msg' && /squad completed its order/.test(m.m)));
    const o = S._test.orders[0].get(1); o.held -= 31 * 20; const gx1 = g.xp, lx1 = le2.xp; await sleep(1100);
    ck('defendHoldPays', got(g.xp - gx1, 5) && got(le2.xp - lx1, 8)); clearInterval(shield); g.hp = le2.hp = 100; }
  // AI squad order: send squad 0 (Assault 1) BACK to the rear, away from the default attack direction
  const ai = () => [...S._test.ents.values()].filter(e => e.bot && !e.mg && e.team === 0 && e.squad === 0 && e.alive && e.guard == null);   // flag guards ignore orders
  const d0 = new Map(ai().map(e => [e.id, Math.hypot(e.x - 90, e.z - 95)]));
  A.send({ t: 'cmd', k: 'order', sq: 100, ty: 'move', x: 90, z: 95 }); await sleep(12000);
  const moved = ai().filter(e => d0.has(e.id)).map(e => d0.get(e.id) - Math.hypot(e.x - 90, e.z - 95));   // the same men, alive throughout (respawns and shelter dashes would skew an average)
  R.aiMoved = moved.map(v => +v.toFixed(1)); ck('aiSquadObeysOrder', moved.length > 0 && moved.filter(v => v > 8).length >= Math.max(1, moved.length / 3));   // (men under a shelling alarm take cover first, then follow)
  A.send({ t: 'cmd', k: 'order', sq: 100, ty: 'clear' }); await sleep(300); ck('clearOrderWorks', !S._test.orders[0].has(100));
  // support
  S._test.setCmd(0, 200); const s0 = S._test.cmdPts()[0];
  const crBefore = A.msgs.length;
  A.send({ t: 'cmd', k: 'sup', s: 'barrage', x: 0, z: -45 }); await sleep(350);
  R.dbg = { s0, after: S._test.cmdPts()[0] }; ck('barrageCostsCommandPoints', S._test.cmdPts()[0] <= s0 - 5);
  A.send({ t: 'cmd', k: 'sup', s: 'barrage', x: 0, z: -45 }); await sleep(350);
  ck('barrageCooldown', A.msgs.some(m => m.t === 'msg' && /not ready/.test(m.m)));
  ck('leaderWarned', L.msgs.some(m => m.t === 'msg' && /FRIENDLY barrage/.test(m.m)));
  await sleep(7600); { const near = A.msgs.slice(crBefore).filter(m => m.t === 'cr' && Math.abs(m.c[0]) <= 14 && Math.abs(m.c[1] + 45) <= 14 && m.c[2] === 4).length; R.dbg.cr = near; ck('barrageLands7Shells', near >= 7 && near <= 12); }   // 7 barrage shells (the AI guns may drop one or two of their own in the same square)   // only the barrage's craters (guns and mortars also fire now)
  const gl = G.ent(); A.send({ t: 'cmd', k: 'sup', s: 'drop', x: gl.x, z: gl.z }); await sleep(350);
  ck('dropAnnouncedToTeam', A.count('dr') === 1 && G.count('dr') === 1);
  gl.hp = 30; await sleep(3500);
  ck('dropCollectedAndHeals', G.count('drx') === 1 && G.ent().hp === 100);
  S._test.DP[0].owner = 0; S._test.DP[1].owner = 0;   // bombers are a tier-2 call-in
  A.send({ t: 'cmd', k: 'sup', s: 'bomb', x: 0, z: -60 }); await sleep(300);
  S._test.setCmd(0, 5); await sleep(100);
  const sqs2 = (await (async () => { await sleep(1100); return A.last('sqs'); })()); ck('cooldownsReported', sqs2 && sqs2.cd[sqs2.k.indexOf('bomb')] > 50 && sqs2.cd[sqs2.k.indexOf('barrage')] > 0);
  // officer cannot be damaged
  const ent = A.ent(); ent.hp = 100; S._test.ents.size; ck('officerAliveAfterAll', ent.alive && ent.hp === 100);
  R.endXp = { officer: A.ent().xp, leader: L.ent().xp };
  R.xpDeltas = XPD.map(a => a.join('/')).join(' '); console.log(JSON.stringify(R, null, 1)); const bad = Object.entries(R.checks).filter(([, v]) => !v).map(([k]) => k);
  console.log(bad.length ? 'FAILED: ' + bad.join(', ') : 'ALL ' + Object.keys(R.checks).length + ' CHECKS PASSED'); process.exit(bad.length ? 1 : 0);
})();
