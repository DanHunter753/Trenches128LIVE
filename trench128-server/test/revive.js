'use strict';
// In-process test: knockdown (non-headshot) vs instant death (headshot), medic revive + XP, revived-kill XP share,
// hold-to-respawn, bleed-out, friendly bots with med kits (safe vs unsafe).
const fs = require('fs'), path = require('path');
fs.writeFileSync(path.join(__dirname, '..', 'xp.json'), JSON.stringify({ medicr: 200, gruntr: 0, bluer: 0 }));
process.argv = ['node', 'x', '--port', '8096', '--fill', '10'];
const S = require('../server.js');
fs.unlinkSync(path.join(__dirname, '..', 'xp.json'));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const R = { checks: {} }; const ck = (k, v) => { R.checks[k] = !!v; };
function client(name, team, join) {
  return new Promise(res => {
    const c = { name, msgs: [] }; const ws = new WebSocket('ws://localhost:8096'); ws.binaryType = 'arraybuffer';
    ws.onopen = () => ws.send(JSON.stringify({ t: 'hello', name }));
    ws.onmessage = ev => {
      if (typeof ev.data !== 'string') return;
      const m = JSON.parse(ev.data); c.msgs.push(m);
      if (m.t === 'prof') { const e = [...S._test.humans].find(h => h.name === name); e.team = team; ws.send(JSON.stringify({ t: 'join', ...join })); }
      if (m.t === 'w') res(c);
    };
    c.send = o => ws.send(JSON.stringify(o)); c.ent = () => [...S._test.humans].find(h => h.name === name);
    c.has = t => c.msgs.some(m => m.t === t); c.last = t => [...c.msgs].reverse().find(m => m.t === t);
  });
}
const place = (e, x, z) => { e.x = x; e.z = z; e.y = 0; };
(async () => {
  const MED = await client('MedicR', 0, { cls: 'medic', w: 'carbine', u: 'bandage', sq: 1 });
  const G = await client('GruntR', 0, { cls: 'rifleman', w: 'bolt', u: 'bandage', sq: 2 });
  const RD = await client('BlueR', 1, { cls: 'rifleman', w: 'bolt', u: 'bandage', sq: 0 });
  await sleep(1500);
  S._test.setSupply(0, 60); place(MED.ent(), 0, 80); place(G.ent(), 1.2, 80); place(RD.ent(), 0, -95);
  const g = G.ent(), m = MED.ent(), enemy = [...S._test.ents.values()].find(e => e.bot && e.team === 1);
  // 1. lethal body shot knocks down; headshot kills
  S._test.damage(g, g.hp + 10, enemy, false); await sleep(200);
  ck('lethalBodyShotDowns', !g.alive && g.down > 0 && G.has('down')); ck('downIsNotDeath', !G.has('dead'));
  place(g, 1.2, 80);
  g.alive = true; g.down = 0; g.hp = 100; g.rt = 0; // reset to test headshot
  S._test.damage(g, g.hp + 10, enemy, true); await sleep(200);
  ck('headshotKills', !g.alive && !(g.down > 0) && G.has('dead'));
  // wait for respawn, then down again for the revive tests
  for (let i = 0; i < 80 && !g.alive; i++) await sleep(100);
  place(g, 1.2, 80); S._test.damage(g, g.hp + 10, enemy, false); await sleep(100);
  ck('downedAgain', g.down > 0);
  for (const e of S._test.ents.values()) if (e.bot) { e.kit = false; e.rvTgt = null; }   // keep bot medics from reviving the test soldier first (was a flake)
  // 2. non-medic cannot revive; medic too far cannot
  const bud = await client('BudR', 0, { cls: 'rifleman', w: 'bolt', u: 'bandage', sq: 2 }); place(bud.ent(), 2, 80);
  for (let i = 0; i < 20; i++) { bud.send({ t: 'act', a: 'revive' }); await sleep(200); }
  ck('nonMedicCantRevive', g.down > 0 && !g.alive);
  place(m, 0, 60); for (let i = 0; i < 6; i++) { MED.send({ t: 'act', a: 'revive' }); await sleep(200); } ck('tooFarCantRevive', g.down > 0);
  // 3. medic revives: progress, XP, supply, state
  place(m, 0, 80); const xp0 = m.xp || 0, sup0 = S._test.supply()[0];
  const t0 = Date.now(); let done = false;
  for (let i = 0; i < 40 && !done; i++) { MED.send({ t: 'act', a: 'revive' }); await sleep(200); done = g.alive; }
  const secs = (Date.now() - t0) / 1000;
  ck('reviveTakesAbout3s', done && secs > 2.4 && secs < 5); ck('revivedAtPartialHp', g.alive && g.hp > 30 && g.hp < 60);
  ck('medicGotReviveXp', (m.xp || 0) >= xp0 + 30);   ck('medicGotProgress', MED.has('rvp')); ck('revivedGotSpMsg', G.msgs.some(x => x.t === 'sp' && x.rv === 1));
  ck('revBySet', g.revBy === m);
  // 3b. needs supplies
  place(g, 1.2, 80); S._test.damage(g, g.hp + 10, enemy, false); await sleep(100); S._test.setSupply(0, 0); MED.send({ t: 'act', a: 'revive' }); await sleep(120);
  ck('reviveNeedsSupply', g.down > 0 && MED.msgs.some(x => x.t === 'msg' && /2 supplies/.test(x.m))); S._test.setSupply(0, 60); g.alive = true; g.down = 0; g.hp = 100; g.revBy = m;
  // 4. kill share: the revived soldier's kill pays the medic 4
  const gx0 = g.xp || 0, mx1 = m.xp; const victim = [...S._test.ents.values()].find(e => e.bot && e.team === 1 && e.alive);
  S._test.damage(victim, 999, g, true); await sleep(150);
  ck('killerPaid10', (g.xp || 0) === gx0 + 10); ck('medicPaidShare', m.xp === mx1 + 4); ck('shareMessage', /revived soldier/.test((MED.msgs.filter(x => x.t === 'msg').pop() || {}).m || ''));
  // 5. hold-to-respawn (giveup) and bleed-out
  place(g, 1.2, 80); S._test.damage(g, g.hp + 10, enemy, false); await sleep(100); ck('downedForGiveup', g.down > 0);
  G.send({ t: 'act', a: 'giveup' }); await sleep(300); ck('giveupEndsDown', !(g.down > 0) && G.has('dead'));
  for (let i = 0; i < 60 && !g.alive; i++) await sleep(100); ck('respawnsQuicklyAfterGiveup', g.alive); ck('revBySetCleared', g.revBy == null);
  place(g, 1.2, 80); S._test.damage(g, g.hp + 10, enemy, false); await sleep(100); g.down = .1; await sleep(400); ck('bleedOutEnds', !(g.down > 0) && !g.alive);
  for (let i = 0; i < 60 && !g.alive; i++) await sleep(100); ck('respawnsAfterBleedOut', g.alive);
  // 6. friendly med-kit bots revive a downed human when safe
  place(g, 0, 90); S._test.damage(g, g.hp + 10, enemy, false); await sleep(100);
  const blue = [...S._test.ents.values()].filter(e => e.bot && e.team === 0 && e.alive && !e.mg);
  for (const b of blue) b.kit = true; const reviveBot = blue.sort((a, b) => Math.hypot(a.x, a.z - 90) - Math.hypot(b.x, b.z - 90))[0]; place(reviveBot, 0, 80);
  for (const b of blue) if (b !== reviveBot) place(b, 60, 60);
  for (const r of [...S._test.ents.values()].filter(e => e.team === 1)) { r.x = 90; r.z = -90; }
  let bot = false; for (let i = 0; i < 250 && !bot; i++) { await sleep(100); bot = g.alive; }
  if (!bot) console.log('DBG revive bot', JSON.stringify({ alive: reviveBot.alive, down: reviveBot.down, rvTgt: reviveBot.rvTgt && reviveBot.rvTgt.id, gid: g.id, gdown: g.down, galive: g.alive, pos: [reviveBot.x, reviveBot.z], g: [g.x, g.z], sup: S._test.supply && S._test.supply[0], kit: reviveBot.kit, cls: reviveBot.cls }));
  ck('botReviveWhenSafe', bot); ck('botReviveMessage', G.msgs.some(x => x.t === 'msg' && /patched you up/.test(x.m)));
  ck('botReviveNoRevBy', g.revBy == null);
  // 7. unsafe: an enemy right next to the medic stops the attempt
  place(g, 0, 90); S._test.damage(g, g.hp + 10, enemy, false); await sleep(100);
  const b2 = reviveBot; b2.kit = true; place(b2, 0, 80); b2.rvTgt = null; b2.kitScan = 0;
  const foe = [...S._test.ents.values()].find(e => e.bot && e.team === 1 && e.alive && !e.manned && !e.inV && !e.mg && !e.tank && !e.gun);   /* a rifleman on the ground, not a hidden tank crewman */ foe.hp = 1e6; place(foe, 3, 76); await sleep(120); b2.rvTgt = null; b2.kitScan = 0; place(foe, 3, 76); place(b2, 0, 80); b2.fortNest = null;   // (and shell-proof: if he dies the medic is right to go)   // 5 m: inside every bot's "too close" radius, whether or not it has spotted him yet
  const r = S._test.kitTick(b2); R.unsafeDbg = { r, b2p: [b2.x, b2.z].map(v => +v.toFixed(1)), foep: [foe.x, foe.z].map(v => +v.toFixed(1)), rvTgt: !!b2.rvTgt, cls: b2.cls, kit: b2.kit, nest: !!b2.fortNest, mg: b2.mg, d: +Math.hypot(foe.x - b2.x, foe.z - b2.z).toFixed(1), foeAlive: foe.alive, near: S._test.enemiesNear(b2, 7).length, b2alive: b2.alive, down: g.down };
  ck('unsafeBotDoesNotGo', r === false && !b2.rvTgt);
  console.log(JSON.stringify(R, null, 1)); const bad = Object.entries(R.checks).filter(([, v]) => !v).map(e => e[0]);
  console.log(bad.length ? 'FAILED ' + bad : 'ALL ' + Object.keys(R.checks).length + ' CHECKS PASSED'); process.exit(bad.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
