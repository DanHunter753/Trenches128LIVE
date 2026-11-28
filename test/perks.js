'use strict';
// v0.47 perk tree: accounts only, points = level, free starter perk, costs, slots by level, class limits, respec for 500 XP
// (never below the current level), the record survives a restart (accounts.json), and the effects work on the server.
const fs = require('fs'), os = require('os'), path = require('path');
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 't128pk-'));
process.argv = ['node', 'x', '--port', '8087', '--fill', '0', '--no-fetch', '--data', DATA];
process.env.T128_TEST = '1';
const S = require('../server.js'), X = S._test, P = X.pkt, T = require('../shared.js');
const sleep = ms => new Promise(r => setTimeout(r, ms)), R = {}, ck = (k, v) => { R[k] = !!v; };
let nid = 9900;
const mk = (cls, w, team, acct, u) => { const out = [], p = { id: nid++, team: team || 0, bot: false, name: 'P' + nid, cls, w, u: u || 'bandage', sq: 0, spawnPick: null, usePost: false, xp: acct ? acct.xp || 0 : 0, acct: acct || null, sp: [0, 0], deployed: true, q: [], ack: 0, msgs: out };
  p.ws = { open: true, socket: { writableLength: 0, write(b) { try { const n = b[1] & 127, off = n === 126 ? 4 : n === 127 ? 10 : 2; if ((b[0] & 15) === 1) out.push(JSON.parse(b.subarray(off).toString('utf8'))); } catch (e) { } }, cork() { }, uncork() { } } };
  X.ents.set(p.id, p); X.humans.add(p); X.spawnEnt(p); return p; };
const TK = () => X.tickNo ? (typeof X.tickNo === 'function' ? X.tickNo() : X.tickNo) : 0;
const last = (p, t) => p.msgs.filter(m => m.t === t).pop();
(async () => {
  await sleep(800);
  const reg = await X.ACC.register('PerkTester', 'longpassword1', '1.2.3.4', 0); const u = X.ACC.session(reg.token);
  // guests are told to register
  const g = mk('rifleman', 'bolt', 0, null); P.perkMsg(g, { a: 'buy', id: 'quick' }); ck('guestRefused', /Register or log in/.test(last(g, 'perks').err || ''));
  // level 1: the starter is free, then 1 point
  u.xp = 0; const a = mk('rifleman', 'bolt', 0, u);
  P.perkMsg(a, { a: 'buy', id: 'quick' }); let st = last(a, 'perks'); ck('starterFree', !st.err && st.pk.own.includes('quick') && st.pts === 1);
  P.perkMsg(a, { a: 'buy', id: 'bayonet' }); ck('costEnforced', /Not enough perk points/.test(last(a, 'perks').err || ''));
  P.perkMsg(a, { a: 'eq', cls: 'rifleman', ids: ['quick'] }); ck('noSlotAtLevel1', /level 2/.test(last(a, 'perks').err || ''));
  // level 20 (3 slots, 20 points)
  u.xp = T.lvXp(20) + 50; a.xp = u.xp;
  for (const id of ['bayonet', 'breath', 'thick', 'steady', 'triage']) P.perkMsg(a, { a: 'buy', id });
  st = last(a, 'perks'); R.pts = st.pts; ck('pointsCounted', !st.err && st.pts === 20 - (2 + 2 + 3 + 2 + 2) && st.slots === 3);
  P.perkMsg(a, { a: 'eq', cls: 'rifleman', ids: ['quick', 'bayonet', 'thick', 'breath'] }); ck('maxThree', /Only 3 slots/.test(last(a, 'perks').err || ''));
  P.perkMsg(a, { a: 'eq', cls: 'rifleman', ids: ['triage'] }); ck('classLimited', /Medic/.test(last(a, 'perks').err || ''));
  P.perkMsg(a, { a: 'eq', cls: 'rifleman', ids: ['quick', 'bayonet', 'thick'] }); ck('equipped', !last(a, 'perks').err);
  // effects, applied at the next spawn
  a.alive = false; X.spawnEnt(a); const sp = last(a, 'sp'); ck('spawnSendsPerks', sp && sp.pk && sp.pk.join() === 'quick,bayonet,thick');
  ck('chargeLonger', Math.abs(T.chgMax(a) / T.chgMax({ cls: 'rifleman' }) - 1.15) < 1e-9);
  ck('thickSlower', Math.abs(T.spOf(a) / T.spOf({ cls: 'rifleman' }) - .97) < 1e-9);
  a.ammo = 0; a.rel = 0; X.supply()[0] = 50; P.startReload(a); ck('quickReload', Math.abs(a.rel - T.WPN.bolt.rl * .92) < 1e-6);
  a.hp = 100; P.damage(a, 50, null, false, [a.x + 2, a.z]); ck('thickBlast', Math.abs(a.hp - (100 - 46)) < 1e-6);
  a.hp = 100; P.damage(a, 50, null, false, null); ck('bulletsUnchanged', a.hp === 50);
  // more effects on fresh soldiers
  const m = mk('medic', 'carbine', 0, u); m.pk = ['triage', 'fieldkit']; X.spawnEnt(m); m.pk = ['triage', 'fieldkit'];
  ck('fieldKit', X.bdMax(m) === 7);
  const as = mk('assault', 'shotgun', 0, u); as.pk = ['bomber', 'light']; ck('grenadesNet', X.grMax(as) === 4);
  const lw = mk('rifleman', 'bolt', 0, u); lw.pk = ['lastwords']; P.downEnt(lw, null); ck('lastWords', lw.ps.ammo === 8 && lw.dhp === 75 && Math.abs(lw.down - 24) < 1e-9);
  const gm = mk('rifleman', 'bolt', 0, u); gm.pk = ['gasdrill']; gm.mask = 0; P.maskAct(gm); ck('gasDrill', Math.abs(gm.mask - TK() - .9 * 20) <= 1);
  const pkt = mk('rifleman', 'bolt', 0, u); pkt.pk = ['pockets']; ck('deepPockets', X.sup.magMax(pkt) === 6);   // v0.52: six spare magazines
  // Scrounger: a body refills the magazine once
  const sc = mk('rifleman', 'bolt', 0, u); sc.pk = ['scrounger']; P.kits().length = 0; P.kits().push({ x: sc.x + .5, z: sc.z, until: TK() + 999, by: new Set() }); sc.ammo = 1;
  await sleep(400); ck('scrounger', sc.ammo === T.WPN.bolt.mag); sc.ammo = 1; await sleep(400); ck('scroungeOnce', sc.ammo === 1);
  // Wire Cutter in the shared movement step (prediction uses it too)
  const wc = { x: 0, y: 0, z: 0, vy: 0, cls: 'sapper', pk: ['cutter'] }; T.WWIRE.push({ cx: 0, cz: 0, c: 1, s: 0, hx: 50, hz: 50 }); const H = X.terr().H;
  const run = q => { q.x = 0; q.z = 0; q.y = T.hAt(H, 0, 0); for (let i = 0; i < 30; i++) T.step(q, { dt: 1 / 30, f: 1, s: 0, bits: 0, yaw: 0 }, H, 1); return Math.abs(q.z); };
  const dCut = run(wc), dNo = run({ x: 0, y: 0, z: 0, vy: 0, cls: 'sapper' }); T.WWIRE.pop(); R.wire = [+dCut.toFixed(2), +dNo.toFixed(2)]; ck('wireCutter', dCut > dNo * 1.3);
  // respec: 500 XP, only if the level holds
  u.xp = T.lvXp(20) + 50; a.xp = u.xp; P.perkMsg(a, { a: 'respec' }); ck('respecNeedsXp', /earn \d+ more XP/.test(last(a, 'perks').err || ''));
  u.xp = T.lvXp(21) - 10; a.xp = u.xp; P.perkMsg(a, { a: 'respec' }); st = last(a, 'perks'); R.rs = [st.err, st.xp, st.lv, st.pk.own.length, T.lvXp(20)]; ck('respec', !st.err && st.pk.own.length === 0 && st.xp === T.lvXp(21) - 510 && u.xp === st.xp && st.lv === 20);
  // persistence: rebuy one, flush, read the file back
  P.perkMsg(a, { a: 'buy', id: 'dress' }); X.ACC.flush(); const j = JSON.parse(fs.readFileSync(path.join(DATA, 'accounts.json'), 'utf8'));
  const rec = j.users.perktester.perks; ck('persisted', rec && rec.own.includes('dress') && rec.st === 'dress');
  console.log(JSON.stringify(R)); const bad = Object.keys(R).filter(k => R[k] === false); console.log(bad.length ? 'FAILED: ' + bad.join(', ') : 'ALL ' + Object.keys(R).filter(k => typeof R[k] === 'boolean').length + ' CHECKS PASSED'); process.exit(bad.length ? 1 : 0);
})().catch(e => { console.log('TEST ERROR', e); process.exit(1); });
