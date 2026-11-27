'use strict';
// Trench 128 - authoritative game server. Zero dependencies (Node 18+).
//   node server.js [--port 8080] [--fill 40] [--slots 128]
// --fill  = each team is topped up with AI soldiers until humans + bots reach this number
// --slots = max human players per team
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const T = require('./shared.js');
const { hAt, WPN, CLS } = T;

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 && isFinite(+process.argv[i + 1]) ? +process.argv[i + 1] : d; };
const PORT = arg('port', process.env.PORT || 8080), FILL = arg('fill', +process.env.T128_FILL || 40), SLOTS = arg('slots', +process.env.T128_SLOTS || 128);
const OFFICERS_MAX = arg('officers', 2);
// ---- v0.27 running it for real: config from --flags or environment variables (see DEPLOY.md)
const sarg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 && process.argv[i + 1] != null && !String(process.argv[i + 1]).startsWith('--') ? String(process.argv[i + 1]) : d; };
const VERSION = (() => { try { return require('./package.json').version; } catch (e) { return '?'; } })();
const CFG = {
  data: path.resolve(sarg('data', process.env.T128_DATA || __dirname)),                 // xp.json, accounts.json live here
  name: sarg('name', process.env.T128_NAME || 'Trench 128').replace(/[^\w \-\[\]\.#:'&()]/g, '').slice(0, 40) || 'Trench 128',
  pub: sarg('public', process.env.T128_PUBLIC || '').replace(/\/+$/, ''),               // this server's public address (https://game.example.com)
  master: sarg('master', process.env.T128_MASTER || '').replace(/\/+$/, ''),            // server-list registry to announce to
  registry: process.argv.includes('--registry') || process.env.T128_REGISTRY === '1',    // this server also keeps a server list
  accounts: ['off', 'optional', 'required'].includes(sarg('accounts', process.env.T128_ACCOUNTS || 'optional')) ? sarg('accounts', process.env.T128_ACCOUNTS || 'optional') : 'optional',
  origins: sarg('origins', process.env.T128_ORIGINS || '').split(',').map(x => x.trim().replace(/\/+$/, '')).filter(Boolean),   // allowed page origins (empty: any)
  perIp: arg('per-ip', +process.env.T128_PER_IP || 8),                                   // simultaneous connections per address
  allowPrivate: process.argv.includes('--list-private'),   // allow LAN / localhost servers in the server list (LAN parties)
  trustProxy: process.argv.includes('--trust-proxy') || process.env.T128_TRUST_PROXY === '1',   // behind nginx / Caddy: use X-Forwarded-For
  region: sarg('region', process.env.T128_REGION || '').slice(0, 16),
  // v0.30 maps: 'random' (a new layout every round), 'classic' (the original map), or a number (always that layout).
  // Default random when run as a server; classic for tests (T128_TEST, or loaded in-process).
  // v0.30.1: where /download sends players when this server holds no installer of its own (public/launcher/latest.yml)
  launcherUrl: (v => /^https:\/\/[^\s"'<>]+$/.test(v) ? v : '')(String(sarg('launcher-url', process.env.T128_LAUNCHER_URL || ''))),
  maps: (v => v === 'random' || v === 'classic' || /^\d{1,10}$/.test(v) ? v : 'random')(String(sarg('maps', process.env.T128_MAPS || (require.main === module && !process.env.T128_TEST ? 'random' : 'classic')))),
};
fs.mkdirSync(CFG.data, { recursive: true });
const ACC = CFG.accounts === 'off' ? null : require('./accounts.js')(CFG.data);
const TICK = 20, DT = 1 / TICK, VIEW_R = 100, SQ_MAX = 8;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rnd = Math.random;

// ------------------------------------------------------------------ world state
const mapPick = () => CFG.maps === 'random' ? T.newSeed() : CFG.maps === 'classic' ? 0 : +CFG.maps;
let mapSeed = T.setMap(mapPick()), nextMap = null;   // v0.30: this round's layout; the next one is generated in a worker during the end screen
let terr = T.makeTerrain(), craters = [];
let posts = [], postId = 1;
// v0.36 class abilities ([N]): the machine gunner drops ammo boxes, the assault man injects morphine
const ABOX_USES = 10, ABOX_LIFE = 150 * TICK, ABOX_CD = 35 * TICK, ABOX_COST = 3, ABOX_R = 2.6, ABOX_RE = 25 * TICK, ABOX_MAX = 2, MPH_T = 10 * TICK, MPH_DOSES = 2, MPH_SPD = 1.2, MPH_ARM = .6;
let aboxes = [], aboxId = 1;
const grMax = e => e.cls === 'assault' ? 4 : e.cls === 'sapper' ? 3 : 2;
const bdMax = e => e.u === 'gasnade' || e.u === 'smokenade' ? 2 : e.u === 'flare' ? 3 : e.cls === 'medic' ? 5 : 3;   // sapper field posts: shared, destructible respawn points
const POST_HP = 300, POST_COST = 10, POST_MAX = 3;
const ents = new Map();      // id -> entity (humans and bots share one id space)
const humans = new Set();
let nextId = 1, tickNo = 0, botSeq = 0;
const OB = T.LINES.map((n, i) => ({ n, t: T.FL[i], x: T.OBJ[i].x, z: T.OBJ[i].z, owner: i < 3 ? 0 : 1, p: i < 3 ? 1 : -1, lock: 0 }));   // objectives staggered along the bending lines
const lineZ = (o, x) => T.trenchC(o.t, x);   // the line's centre at x
let supply = [12, 12], wave = { side: 0, t: 0 }, sT = 0, round = { state: 'play', t: 0, win: -1 };
// ---- Operations: one team attacks the other's three lines (sectors) in order, on a ticket pool, with three battalions
const OPS = { nsec: 3, nbat: 3, regroup: 15, stallMax: 30, oobGrace: 10 };
let op = null;
const defLines = att => att === 0 ? [3, 4, 5] : [2, 1, 0];          // defender lines, front first
const attSide = att => att === 0 ? 1 : -1;                           // +z is blue's side
function newOp(att) {
  const n = [...ents.values()].filter(e => e.team === att && !e.cmd).length + [...humans].filter(h => h.team === att && h.deployed).length;
  const tkMax = Math.max(70, Math.round(Math.max(n, 40) * 1.8));   // v0.27: 1.8 per player; about half of all downed men are now revived, so each ticket goes further   // tuned with fast-forward bot matches on the 320 m map (v0.24)
  return { att, def: 1 - att, sector: 0, tk: tkMax, tkMax, bat: 0, stall: 0, regroup: 0 };
}
const opTarget = () => op && OB[defLines(op.att)[op.sector]];
const grenades = [], shots = [];
const NAV = require('./botai.js')(T, () => terr && terr.H);   // bot navigation grid + shared distance fields
// --- officer layer: orders[team] maps squad key -> order. Human squads use keys 0..15, AI squads 100..102.
const orders = [new Map(), new Map()], crates = [];
let sched = [], leaders = new Map(), crateId = 1, ordId = 1;
// officer call-ins, paid in command points (CP). r = effect radius shown on the officer's targeting ring
// tier: 1 always; 2 = hold 2 depots or one enemy line; 3 = hold all 4 depots or two enemy lines (see tierOf)
const SUP = { barrage: { cost: 15, cd: 30, r: 13, tier: 1 }, drop: { cost: 10, cd: 20, r: 4, tier: 1 }, smoke: { cost: 8, cd: 25, r: 12, tier: 1 }, recon: { cost: 10, cd: 40, r: 50, tier: 1 },
  rally: { cost: 20, cd: 90, r: 3, tier: 1 }, para: { cost: 25, cd: 75, r: 8, tier: 1 },
  bomb: { cost: 30, cd: 60, r: 30, tier: 2 }, gas: { cost: 25, cd: 70, r: 11, tier: 2 }, creep: { cost: 30, cd: 90, r: 15, tier: 2 }, whistle: { cost: 15, cd: 120, r: 20, tier: 2 },
  heavy: { cost: 45, cd: 150, r: 30, tier: 3 }, star: { cost: 8, cd: 25, r: 30, tier: 1 }, tank: { cost: 50, cd: 150, r: 8, tier: 2 }, strafe: { cost: 20, cd: 60, r: 6, tier: 2 } };
const SUPK = Object.keys(SUP), supZero = () => Object.fromEntries(SUPK.map(k => [k, 0]));
// side objectives: depots on the flanks. CP: +1 per 4 s base, +3 per 4 s per depot held; captures pay +10
const DP = T.DEPOTS.map(d => ({ ...d, owner: -1, p: 0 })), CP_MAX = 250, CP_START = 30, RAID_MAX = 8;
let cmdPts = [CP_START, CP_START], dT = 0;
const smokes = [], gases = [], recons = [], marks = [];
let markId = 1; const alertAt = new Map();
// squad morale: key team*1000+squad (AI squads 100-102, human squads 0-15). Broken AI squads fall back and shoot worse.
const SQM = new Map(), sqmOf = (t, k) => { const id = t * 1000 + k; let m = SQM.get(id); if (!m) SQM.set(id, m = { m: 100, broken: false, cas: [] }); return m; };
const vis = [new Set(), new Set()];   // officer fog of war: enemy ids each team can currently see
function tierOf(t) {
  const dep = DP.filter(d => d.owner === t).length, start = t === 0 ? [0, 1, 2] : [3, 4, 5];
  const taken = op ? (op.att === t ? op.sector : 0) : OB.filter((o, i) => o.owner === t && !start.includes(i)).length;
  return 1 + (dep >= 2 || taken >= 1 ? 1 : 0) + (dep >= 4 || taken >= 2 ? 1 : 0);
}
function alert(team, key, k, m, x, z, gap) {   // officer alert feed, throttled per key
  const id = team + ':' + key; if ((alertAt.get(id) || -1e9) > tickNo) return; alertAt.set(id, tickNo + (gap || 15) * TICK);
  for (const p of officersOf(team)) send(p, { t: 'al', k, m, x: x == null ? null : +x.toFixed(1), z: z == null ? null : +z.toFixed(1) });
}
function strikeWarn(team, k, x, z, r, delay, dur, extra) {   // friendly soldiers see incoming call-ins on their HUD and maps
  for (const q of humans) if (q.deployed && q.team === team && !q.cmd) send(q, { t: 'sw', k, x: +x.toFixed(1), z: +z.toFixed(1), r, d: delay, s: dur, ...extra });
}
let supCd = [supZero(), supZero()];
const AI_SQ = ['Assault 1', 'Assault 2', 'Garrison'];
const NESTS = T.NEST.map((n, i) => ({ ...n, idx: i, bot: null, occ: null, belt: 150, heat: 0, over: false }));
let VEHM = null;   // v0.26 vehicles and crewed guns (vehicles.js), created once the helpers below exist

let xpdb = {}; const XPFILE = path.join(CFG.data, 'xp.json'); let xpDirty = false;
try { xpdb = JSON.parse(fs.readFileSync(XPFILE, 'utf8')); } catch (e) { }

// ------------------------------------------------------------------ helpers
const spawnLine = t => t === 0 ? OB.filter(o => o.owner === 0).pop() : OB.find(o => o.owner === 1);
const nearO = (u, o) => Math.abs(u.x - o.x) < 34 && Math.abs(u.z - lineZ(o, u.x)) < 12;
const canCap = (i, t) => { if (op) return t === op.att && OB[i] === opTarget() && !op.regroup && !(OB[i].lock > 0); const o = OB[i]; if (o.owner === t || o.lock > 0) return false; const n = t === 0 ? OB[i - 1] : OB[i + 1]; return !!n && n.owner === t; };
const maxHp = e => e.elite && T.ELITE[e.elite] ? T.ELITE[e.elite].hp : e.bot ? 100 : CLS[e.cls].hp;
const faceYaw = t => t === 0 ? 0 : Math.PI;
const send = (p, o) => { if (p.ws && p.ws.open) wsSend(p.ws, 1, Buffer.from(JSON.stringify(o))); };
const bcast = o => { const b = Buffer.from(JSON.stringify(o)); for (const p of humans) if (p.ws.open) wsSend(p.ws, 1, b); };
const tell = (p, m) => send(p, { t: 'msg', m });
const teamTell = (t, m) => { for (const p of humans) if (p.team === t && p.deployed) tell(p, m); };

function newEnt(team, bot) {
  const e = { id: nextId++, bot, team, x: 0, y: 0, z: 0, vy: 0, yaw: faceYaw(team), pitch: 0, hp: 100, alive: false, rt: 1, cd: 0, rel: 0, ammo: 0, flash: 0, crouch: false, mg: null, manned: false, cmd: false, sp: [0, 0] };
  if (nextId > 65000) nextId = 1; if (bot) e.bname = botName(team, e.id);
  ents.set(e.id, e); return e;
}
const BOT_CLS = [['rifleman', 'bolt', .46], ['assault', 'smg', .14], ['assault', 'shotgun', .06], ['gunner', 'lmg', .1], ['medic', 'carbine', .12], ['sapper', 'shotgun', .06], ['recon', 'sniper', .06]];
// per-weapon bot fire: cooldown, damage vs bots, damage vs humans, max range
const BOT_W = { atr: [2.6, 120, 60, 150], hmg: [.14, 18, 8, 80], flame: [.1, 9, 5, 14], bolt: [1.2, 34, 14, 60], mark: [1.6, 45, 20, 80], sniper: [2.4, 60, 34, 130], carbine: [.8, 26, 11, 55], smg: [.32, 13, 6, 32], shotgun: [1.1, 55, 24, 22], lmg: [.28, 16, 7, 60] };
function pickBotCls(b) { let r = rnd(); for (const [c, w, p] of BOT_CLS) { if ((r -= p) <= 0) { b.cls = c; b.w = w; return; } } b.cls = 'rifleman'; b.w = 'bolt'; }
function addBot(team) {
  const b = newEnt(team, true); pickBotCls(b); b.squad = botSeq++ % 3; b.ox = (rnd() - .5) * 60; b.oz = (rnd() - .5) * 3; b.scan = rnd(); b.td = 99; b.tgt = null; b.rt = .2 + rnd() * 2; b.kit = b.cls === 'medic' || rnd() < .15; b.kitScan = rnd() * 2; b.rvTgt = null; b.rvT = 0; return b;
}
function addGunner(n) {
  const b = newEnt(n.team, true); b.mg = true; b.cls = 'gunner'; b.w = 'lmg'; b.squad = 3; b.hx = n.x; b.hz = n.z; b.ox = 0; b.oz = 0; b.scan = rnd(); b.td = 99; b.tgt = null; b.rt = .1;
  b.x = n.x; b.z = n.z; b.y = hAt(terr.H, n.x, n.z); n.bot = b; return b;
}
// v0.29: no gunner spawns at the trench MG nests any more; crewForts() sends the nearest free bot to man an empty one (and on death the nest is free again)
function addCrew(team, hidden) {   // v0.26: a field gun / mortar crewman (visible, works the gun) or a tank's hidden crew (drives the tank and takes its kills)
  const b = newEnt(team, true); b.mg = true; b.cls = 'gunner'; b.w = 'carbine'; b.squad = 3; b.ox = 0; b.oz = 0; b.scan = rnd(); b.td = 99; b.tgt = null; b.rt = .1;
  if (hidden) { b.manned = true; b.alive = true; b.hp = 100; b.bname = team ? 'Panzer crew' : 'Tank crew'; }
  else b.bname = (team ? 'Kan. ' : 'Can. ') + b.bname.split(' ').slice(1).join(' ');
  return b;
}
const BASE_NESTS = NESTS.length;

// per-round stats for the kill feed, scoreboard and after-action report
const st = e => e.st || (e.st = { k: 0, d: 0, a: 0, hs: 0, sc: 0, rev: 0, cap: 0, ord: 0, spot: 0, ci: 0 });
function botName(t, id) {   // hoisted: MG-nest crews are created while the module loads
  const N = botName.N || (botName.N = [['Dubois', 'Moreau', 'Lefèvre', 'Girard', 'Bonnet', 'Mercier', 'Blanc', 'Faure', 'Roussel', 'Fournier', 'Chevalier', 'Lambert', 'Garnier', 'Rousseau', 'Perrin', 'Morel', 'Gauthier', 'Brun', 'Barbier', 'Arnaud'],
    ['Müller', 'Schmidt', 'Becker', 'Hoffmann', 'Schulz', 'Koch', 'Richter', 'Klein', 'Wolf', 'Neumann', 'Schwarz', 'Braun', 'Krüger', 'Hartmann', 'Lange', 'Werner', 'Krause', 'Lehmann', 'Kaiser', 'Fuchs']]);
  return (t ? 'Gefr. ' : 'Sdt. ') + N[t][id % 20] + (id >= 20 ? ' ' + (1 + Math.floor(id / 20) % 9) : '');
}
const nameOf = e => !e ? 'the war' : e.bot ? (e.bname || 'a soldier') : e.name;
function addXp(p, n) {
  if (p.bot || !p.name) return; st(p).sc += n;
  if (p.acct) { const before = T.rankOf(p.xp || 0); p.xp = ACC.addXp(p.acct, n); send(p, { t: 'xp', xp: p.xp, rank: T.rankOf(p.xp), up: T.rankOf(p.xp) > before }); return; }   // account XP
  if (CFG.accounts === 'required') return;
  const key = p.name.toLowerCase(), before = T.rankOf(xpdb[key] || 0);
  xpdb[key] = (xpdb[key] || 0) + n; p.xp = xpdb[key]; xpDirty = true;
  send(p, { t: 'xp', xp: p.xp, rank: T.rankOf(p.xp), up: T.rankOf(p.xp) > before });
}

// ------------------------------------------------------------------ spatial grid (for bots, hit tests, snapshots)
const CELL = 32, GW = Math.ceil(T.S / CELL) + 2; let grid = new Map();
const cellOf = (x, z) => (Math.floor((x + T.W) / CELL) + 1) * GW + (Math.floor((z + T.W) / CELL) + 1);
function buildGrid() {
  grid = new Map();
  downed = [];
  for (const e of ents.values()) { if (e.alive && !e.manned && !e.cmd && !e.inV) { const k = cellOf(e.x, e.z); let a = grid.get(k); if (!a) grid.set(k, a = []); a.push(e); } else if (e.down > 0 && !e.alive) downed.push(e); }
}
function forNear(x, z, r, fn) {
  const c = Math.ceil(r / CELL), cx = Math.floor((x + T.W) / CELL) + 1, cz = Math.floor((z + T.W) / CELL) + 1;
  for (let i = cx - c; i <= cx + c; i++) for (let j = cz - c; j <= cz + c; j++) { const a = grid.get(i * GW + j); if (a) for (let k = 0; k < a.length; k++) fn(a[k]); }
}

// ------------------------------------------------------------------ spawning, damage, death
const officerCount = (team, except) => [...humans].filter(q => q !== except && q.deployed && q.team === team && q.cls === 'officer').length;
function applyLoadout(p) {
  if (!p.pend) return; const l = p.pend.l;
  if (l.cls === 'officer' && officerCount(p.team, p) >= OFFICERS_MAX) { l.cls = 'rifleman'; l.w = 'bolt'; l.u = 'bandage'; tell(p, 'Officer slots are full. Deploying as Rifleman.'); }
  Object.assign(p, l); p.sq = l.cls === 'officer' ? -1 : p.pend.sq; p.pend = null;
}
const HOME_Z = T.HOME_Z;
function homeZ(t, x) {
  if (op && t === op.att) {   // attackers stage from a forward HQ: behind their own front line at the start, then behind each captured trench
    const from = op.sector > 0 ? OB[defLines(op.att)[op.sector - 1]] : OB[op.att === 0 ? 2 : 3];
    return lineZ(from, x || 0) + attSide(op.att) * (op.sector > 0 ? 9 : 14);
  }
  if (op && t === op.def) {   // defenders stage behind the next line they still hold (or well behind the last one)
    const L = defLines(op.att), tgt = OB[L[Math.min(op.sector, L.length - 1)]], nxt = OB[L[op.sector + 1]];
    return nxt ? lineZ(nxt, x || 0) - attSide(op.att) * 25 : lineZ(tgt, x || 0) - attSide(op.att) * 35;
  }
  return t === 0 ? HOME_Z : -HOME_Z;
}
let home = t => { const x = (rnd() - .5) * 140; return { x, z: homeZ(t, x) }; };
// v0.31.1 spawn map: a flag can be picked when your side fully holds it and no enemy is within 25 m of it
function flagSpawnOk(team, i) { const o = OB[i]; if (!o || o.owner !== team || Math.abs(o.p) < .99) return false;
  for (const q of ents.values()) if (q.team !== team && q.alive && !q.cmd && Math.hypot(q.x - o.x, q.z - lineZ(o, q.x)) < 25) return false; return true; }
function spawnEnt(e) {
  if (op && e.team === op.att && e.died && !e.cmd) {
    if (op.tk <= 0 || op.regroup > 0) { e.rt = 1; return; }      // no tickets: wait for the next battalion
    op.tk--; if (op.tk === 0 && !op.stall) attackStalls();
  }
  if (e.veh && VEHM) VEHM.leave(e, true); if (e.elite) eliteLost(e); e.burn = 0; e.goTo = null; e.job = null;
  e.died = false; e.hist = null; e.mask = 0; e.hitBy = null; e.lastHit = null; e.supp = 0; e.chg = T.chgMax(e); e.charging = false; e.bloom = 0;
  e.cl = null; e.climb = null; e.cov = null; e.crouch = false; e.peek = false; e.down = 0; e.revBy = null; e.shelter = null; e.bandaged = false; e.seen = null; e.chgCd = 0; e.gr = grMax(e); e.gCd = 0; e.bd = bdMax(e); e.sld = 0; e.sldCd = 0; e.pb = 0; e.rg = 0; e.rgAt = 0; e.rgCd = 0; e.mph = false; e.mphU = 0; e.mphN = e.cls === 'assault' ? MPH_DOSES : 0; e.boxCd = 0; e.healCd = 0; e.mgCd = 0; e.para = false;
  let { x, z } = home(e.team), py = null;
  const atPost = q => { x = q.x + (rnd() - .5) * (q.fort ? 1 : 3); z = q.z + (rnd() - .5) * (q.fort ? 1 : 3); py = q.fort ? null : q.y; };
  if (e.mg === true) { x = e.hx; z = e.hz; }
  if (!e.bot) {
    applyLoadout(e); e.cmd = e.cls === 'officer';
    if (e.cmd) { x = 0; z = e.team === 0 ? 104 : -104; }
    else if (e.spawnPick === 0) { /* chose home base */ }
    else if (e.spawnPick === -99) { const a = T.AIRF[e.team]; x = a.x - Math.sign(a.x) * 3; z = a.z + (e.team ? -6 : 6); }   // v0.33: the airfield
    else if (e.spawnPick < 0 && flagSpawnOk(e.team, -e.spawnPick - 1)) { const o = OB[-e.spawnPick - 1]; x = o.x + (rnd() - .5) * 14; z = lineZ(o, x) + (e.team === 0 ? .4 : -.4); }   // v0.31.1: a flag your side holds
    else {
      if (e.spawnPick < 0) tell(e, 'That flag is under attack: respawning elsewhere');
      const chosen = e.spawnPick ? posts.find(q => q.id === e.spawnPick && q.team === e.team) : null;   // the respawn picker's choice, if it still stands
      const q = chosen || (e.usePost !== false ? pickPost(e.team) : null); if (q) { atPost(q); if (q.by && q.by !== e) addXp(q.by, 2); }
    }
    e.ammo = WPN[e.w].mag; e.mg = null;
  } else if (e.mg !== true) {
    if (e.guard != null && !e.placed && OB[e.guard]) { const o = OB[e.guard]; x = o.x + e.ox; z = lineZ(o, x) + (e.team === 0 ? 4 : -4) + rnd() * 2; }   // round start only
    else if (op && e.team === op.def && !e.placed && rnd() < .45) { const o = OB[defLines(op.att)[op.sector]]; if (o) { x = o.x + e.ox; z = lineZ(o, x) - attSide(op.att) * (3 + rnd() * 10); } }   // round start: most defenders already man the line under attack
    else if (rnd() < .5) { const q = pickPost(e.team); if (q) atPost(q); }
    e.placed = true;
  }
  e.x = clamp(x, -T.W + 3, T.W - 3); e.z = clamp(z, -T.W + 3, T.W - 3);
  if (py == null && T.fortHit(e.x, T.groundAt(terr.H, e.x, e.z, 99), e.z, .4, true)) for (let r = 1; r < 14; r++) { let ok = false;   // v0.32: never inside a ruin or wreck
    for (let a = 0; a < 8 && !ok; a++) { const x2 = e.x + Math.cos(a * .785) * r, z2 = e.z + Math.sin(a * .785) * r; if (!T.fortHit(x2, T.groundAt(terr.H, x2, z2, 99), z2, .4, true)) { e.x = x2; e.z = z2; ok = true; } } if (ok) break; }
  e.y = py != null ? py : T.groundAt(terr.H, e.x, e.z, 99); e.vy = 0;
  e.hp = maxHp(e); e.alive = true; e.rel = 0; e.cd = 0; e.yaw = faceYaw(e.team); e.pitch = 0;
  if (!e.bot) send(e, { t: 'sp', x: e.x, y: e.y, z: e.z, cls: e.cls, w: e.w, u: e.u, hp: e.hp, sq: e.sq });
  if (!e.bot && e.sq >= 0) sendOrderTo(e);
}
const pickPost = t => { const a = posts.filter(q => q.team === t); return a.length ? a[(rnd() * a.length) | 0] : null; };
const tellTeam = (t, m) => { for (const q of humans) if (q.team === t && q.deployed) tell(q, m); };
function damagePost(q, dmg, by) {
  if (q.hp <= 0) return; q.hp -= dmg;
  if (q.hp <= 0) { posts = posts.filter(x => x !== q); { const c = [+q.x.toFixed(2), +q.z.toFixed(2), 2.2, .6]; T.dig(terr, c[0], c[1], 2.2, .6); craters.push(c); } bcast({ t: 'cr', c: craters[craters.length - 1] });
    tellTeam(q.team, 'A field post was destroyed'); if (by && by.team !== q.team) { addXp(by, 25); if (!by.bot) tell(by, 'Enemy field post destroyed (+25 XP)'); } }
}
function abilityAct(p) {
  if (!p.alive || p.down > 0 || p.cmd || (p.mg != null && p.mg !== false) || p.inV || p.elite) return;
  if (p.cls === 'gunner') dropAmmo(p); else if (p.cls === 'assault') morphine(p); else if (p.cls === 'rifleman') { if (p.rg) rgUnload(p); else rgFit(p); }
}
/** Gunner: put down an ammo box at your feet. Teammates who walk over it get a full magazine, their grenades and utility back. */
function dropAmmo(p) {
  if ((p.aboxCd || 0) > tickNo) { if (!p.bot) tell(p, 'Ammo box: next one in ' + Math.ceil((p.aboxCd - tickNo) / TICK) + 's'); return false; }
  if (supply[p.team] < ABOX_COST) { if (!p.bot) tell(p, 'An ammo box costs ' + ABOX_COST + ' supply'); return false; }
  supply[p.team] -= ABOX_COST; p.aboxCd = tickNo + ABOX_CD;
  const mine = aboxes.filter(b => b.by === p); if (mine.length >= ABOX_MAX) aboxes = aboxes.filter(b => b !== mine[0]);
  const x = clamp(p.x - Math.sin(p.yaw) * .8, -T.W + 1, T.W - 1), z = clamp(p.z - Math.cos(p.yaw) * .8, -T.W + 1, T.W - 1);
  aboxes.push({ id: aboxId++, team: p.team, x, z, uses: ABOX_USES, until: tickNo + ABOX_LIFE, by: p });
  if (!p.bot) tell(p, 'Ammo box down: teammates who walk over it restock'); bcast({ t: 'abd', x: +x.toFixed(1), z: +z.toFixed(1) }); return true;
}
function aboxTick() {
  for (let i = aboxes.length - 1; i >= 0; i--) if (aboxes[i].until < tickNo || aboxes[i].uses <= 0) aboxes.splice(i, 1);
  for (const b of aboxes) forNear(b.x, b.z, ABOX_R + 1, e => {
    if (b.uses <= 0 || e.team !== b.team || !e.alive || e.cmd || e.down > 0 || e.inV || (e.boxCd || 0) > tickNo || Math.hypot(e.x - b.x, e.z - b.z) > ABOX_R) return;
    const W0 = WPN[e.w], magLow = !e.elite && (e.mg == null || e.mg === false) && W0 && e.ammo < W0.mag;
    if (!(magLow || (!e.elite && e.gr < grMax(e)) || e.bd < bdMax(e) || (e.cls === 'assault' && !e.elite && e.mphN < MPH_DOSES))) return;
    if (magLow) { e.ammo = W0.mag; e.rel = 0; } if (!e.elite) e.gr = Math.max(e.gr, grMax(e)); e.bd = Math.max(e.bd, bdMax(e)); if (e.cls === 'assault' && !e.elite) e.mphN = Math.max(e.mphN, 1);
    e.boxCd = tickNo + ABOX_RE; b.uses--;
    if (!e.bot) tell(e, 'Restocked from ' + (b.by === e ? 'your' : b.by && !b.by.bot ? b.by.name + "'s" : 'an') + ' ammo box');
    if (b.by && b.by !== e && b.by.team === e.team && !b.by.bot) addXp(b.by, 4);
  });
}
/** Assault: a morphine syrette. 10 s faster and much harder to drop, and a little health back. Two per life. */
/** Rifleman: fit a rifle grenade to the muzzle (1 s); the trigger then launches it, [N] or R takes it off. Costs a grenade. */
function rgFit(p) {
  if (!(p.gr > 0)) { if (!p.bot) tell(p, 'No grenades left for the cup'); return false; }
  if (supply[p.team] < gCost(p)) { if (!p.bot) tell(p, 'Need ' + gCost(p) + ' supply for a rifle grenade'); return false; }
  p.rg = 1; p.rgAt = tickNo + Math.round(T.RG.fit * TICK); p.rel = 0; if (!p.bot) send(p, { t: 'rg', s: 1, f: T.RG.fit }); return true;
}
function rgUnload(p) { p.rg = 0; if (!p.bot) send(p, { t: 'rg', s: 0 }); }
function fireRifleGrenade(p) {
  const c = gCost(p); if (!(p.gr > 0) || supply[p.team] < c) { rgUnload(p); if (!p.bot) tell(p, !(p.gr > 0) ? 'Out of grenades' : 'Need ' + c + ' supply'); return false; }
  supply[p.team] -= c; p.gr--; p.rg = 0; p.cd = T.RG.cd; p.flash = 3;
  const ey = p.y + eyeH(p), path = T.rgPath(terr.H, p.x, ey, p.z, p.yaw, p.pitch);
  grenades.push({ tx: path.x, tz: path.z, t: path.t, by: p, pow: T.RG.pow });
  bcast({ t: 'rgf', f: [+p.x.toFixed(2), +ey.toFixed(2), +p.z.toFixed(2)], v: [+path.vx.toFixed(3), +path.vy.toFixed(3), +path.vz.toFixed(3)], T: +path.t.toFixed(3), to: [+path.x.toFixed(1), +path.y.toFixed(1), +path.z.toFixed(1)], tm: p.team, id: p.id });
  if (!p.bot) send(p, { t: 'rg', s: 0 }); return true;
}
/** Low-arc launch angle to land a rifle grenade d metres away, dh metres higher (null when out of reach). */
function rgAim(d, dh) { const V = T.RG.v, g = T.RG.g, q = V ** 4 - g * (g * d * d + 2 * dh * V * V); if (q < 0) return null; return Math.atan((V * V - Math.sqrt(q)) / (g * d)); }
function morphine(p) {
  if (p.mph) return false;
  if (!(p.mphN > 0)) { if (!p.bot) tell(p, 'No morphine left'); return false; }
  p.mphN--; p.mph = true; p.mphU = tickNo + MPH_T; p.hp = Math.min(maxHp(p), p.hp + 15);
  if (!p.bot) send(p, { t: 'mph', s: MPH_T / TICK, n: p.mphN }); return true;
}
function botAbility(b) {
  if (!b.alive || b.down > 0 || (b.mg != null && b.mg !== false) || b.inV || b.elite) return;
  if (b.cls === 'assault' && !b.mph && b.mphN > 0 && b.tgt && b.hp < 60) morphine(b);
  else if (b.cls === 'rifleman' && b.gr > 0 && (b.rgCd || 0) <= tickNo && supply[b.team] >= 30) {   // rifle grenades onto manned enemy guns, or a knot of enemies
    let best = null, bs = 0;
    const cand = e => { if (e.team === b.team || !e.alive || e.cmd || e.inV || (e.rgTgt || 0) > tickNo) return; const d = Math.hypot(e.x - b.x, e.z - b.z); if (d < 35 || d > 110) return;
      const gun = e.mg != null && e.mg !== false; let n = 0; if (!gun) forNear(e.x, e.z, 5, q => { if (q.team === e.team && q.alive && Math.hypot(q.x - e.x, q.z - e.z) < 4) n++; });
      const sc = gun ? 10 : n >= 3 ? n : 0; if (sc > bs && T.los(terr.H, b.x, b.y + 1.6, b.z, e.x, e.y + 1.4, e.z)) { bs = sc; best = e; } };
    for (const e of ents.values()) if (e.manned && e.mg != null && e.mg !== false) cand(e);   // men on guns are not in the grid
    forNear(b.x, b.z, 110, cand);
    if (best) { const d = Math.hypot(best.x - b.x, best.z - b.z), a = rgAim(d, best.y - (b.y + 1.6)); if (a != null) {
      const y0 = b.yaw, p0 = b.pitch; b.yaw = Math.atan2(-(best.x - b.x), -(best.z - b.z)) + (rnd() - .5) * .06; b.pitch = a + (rnd() - .5) * .07;   // a lob, not a sniper shot
      if (fireRifleGrenade(b)) { b.rgCd = tickNo + Math.round((40 + rnd() * 30) * TICK); best.rgTgt = tickNo + 15 * TICK;   // one rifle grenade per target every 15 s, side-wide
        BSTAT.rg = (BSTAT.rg || 0) + 1; } b.yaw = y0; b.pitch = p0; } }
    if (!best) b.rgCd = tickNo + 3 * TICK;
  }
  else if (b.cls === 'gunner' && (b.aboxCd || 0) <= tickNo && supply[b.team] >= 15 && rnd() < .25 && !aboxes.some(q => q.team === b.team && Math.hypot(q.x - b.x, q.z - b.z) < 30)) {
    let n = 0; forNear(b.x, b.z, 12, e => { if (e.team === b.team && e.alive && e !== b && !e.cmd && Math.hypot(e.x - b.x, e.z - b.z) < 12) n++; });
    if (n >= 3) dropAmmo(b);
  }
}
function buildPost(p) {
  if (p.cls !== 'sapper' || p.mg != null) return;
  if ((p.postCd || 0) > tickNo) { tell(p, 'Field post: wait ' + Math.ceil((p.postCd - tickNo) / TICK) + 's'); return; }
  if (supply[p.team] < POST_COST) { tell(p, 'A field post costs ' + POST_COST + ' supply'); return; }
  if (enemiesNear(p, 20).length) { tell(p, 'Enemies too close to build'); return; }
  if (posts.some(q => q.team === p.team && Math.hypot(q.x - p.x, q.z - p.z) < 25)) { tell(p, 'Too close to another field post'); return; }
  supply[p.team] -= POST_COST; p.postCd = tickNo + 20 * TICK;
  const mine = posts.filter(q => q.team === p.team && !q.fort); if (mine.length >= POST_MAX) posts = posts.filter(q => q !== mine[0]);
  posts.push({ id: postId++, team: p.team, x: p.x, z: p.z, y: p.y, hp: POST_HP, by: p }); addXp(p, 15);
  tellTeam(p.team, 'Field post established — your team can now respawn there');
}
const BLEED = 30, REV_T = 3, REV_BOT_T = 4, REV_XP = 30, REV_KILL_XP = 4;
const KSTAT = {};   // kills by cause (balance tooling)
function killFeed(e, by, head) {   // human-involved kills go to everyone, the rest only to players within 160 m
  { const c = (by && by.gun ? by.gun.k + ':' : by && by.tank ? 'tank:' : '') + (e.lastHit || 'shell') + ':' + e.team; KSTAT[c] = (KSTAT[c] || 0) + 1; }
  const w = e.lastHit === 'melee' ? (by && T.WPN[by.w] && T.WPN[by.w].bay ? 'bayonet' : 'club') : e.lastHit || 'shell';
  const m = Buffer.from(JSON.stringify({ t: 'kf', a: by && by !== e ? nameOf(by) : '', at: by ? by.team : -1, v: nameOf(e), vt: e.team, w, h: head ? 1 : 0, ai: by && by.id || 0, vi: e.id }));
  const all = (by && !by.bot) || !e.bot;
  for (const p of humans) if (p.deployed && p.ws && p.ws.open && (all || Math.abs(p.x - e.x) < 160 && Math.abs(p.z - e.z) < 160)) wsSend(p.ws, 1, m);
}
function creditKill(e, by, head) {
  st(e).d++;
  if (e.hitBy) { for (const [, [a, t]] of e.hitBy) if (a !== by && a.team !== e.team && tickNo - t < 10 * TICK) { st(a).a++; addXp(a, 3); } e.hitBy = null; }
  if (!by || by === e || by.team === e.team) return;
  st(by).k++; if (head) st(by).hs++;
  { const sp = e.spBy; if (sp && sp !== by && sp.team === by.team && !sp.bot && sp.deployed && e.sp[by.team] > tickNo) { addXp(sp, 5); tell(sp, 'Spot assist (+5 XP)'); } }
  addXp(by, 10); if (!by.bot) send(by, { t: 'k', n: e.bot ? 'enemy soldier' : e.name });
  const m = by.revBy;   // the medic who revived this soldier earns a smaller share of every kill
  if (m && m !== by && m.team === by.team && !m.bot && humans.has(m)) { addXp(m, REV_KILL_XP); tell(m, 'Your revived soldier got a kill (+' + REV_KILL_XP + ' XP)'); }
}
function damage(e, dmg, by, head, src, kind) {
  if (!e.alive || e.cmd || (e.inV && kind !== 'veh')) return;   // inside a tank: only the tank can be hurt
  if (e.charging && kind !== 'melee') dmg *= .6;          // a bayonet charge shrugs off some damage
  if (e.mph && kind !== 'gas') dmg *= MPH_ARM;              // v0.36: on morphine a man keeps going through wounds that would drop him
  e.hp -= dmg;
  if (by && by !== e && by.team !== e.team) (e.hitBy || (e.hitBy = new Map())).set(by.id, [by, tickNo]);
  e.lastHit = kind || (src ? (by && by.cmd ? 'artillery' : by ? 'grenade' : 'shell') : by ? (by.mg != null && by.mg !== false ? 'mg' : by.w || 'bolt') : 'shell');
  if (!e.bot && by !== e) { const q = src || (by ? [by.x, by.z] : null); if (q) send(e, { t: 'dd', x: +q[0].toFixed(1), z: +q[1].toFixed(1) }); }   // damage-direction arc
  const hm = by && !by.bot && by !== e && by.team !== e.team && kind !== 'gas';
  if (e.hp <= 0) {
    if (!e.bot && !head && kind !== 'melee' && e.hp > -60) downEnt(e, by);
    else if (e.bot && !head && kind !== 'melee' && kind !== 'tank' && e.hp > -40 && !e.mg && !e.elite && medicNear(e)) downEnt(e, by);   // v0.27: a bot only goes down when a medic could reach him
    else killEnt(e, by, head);
  }
  if (hm) send(by, { t: 'hm', h: head ? 1 : 0, k: e.hp <= 0 ? 1 : 0, m: kind === 'melee' ? 1 : 0 });
}
const BOT_BLEED = 20;
// v0.40 last stand. A downed player draws his revolver: slow single shots, six rounds, a 4 s reload, and he can drag himself along
// at a crawl. A downed man can also be finished off: bullets, blasts and bayonets wear down DOWN_HP and then he is dead.
const DOWN_HP = 60, PISTOL = { dmg: 30, cd: 1.1, mag: 6, rl: 4, rng: 45, vel: 260, spr: .045 };
let downed = [];   // everyone lying wounded this tick (bullets and blasts look here: the grid holds only men on their feet)
function finishHit(e, dmg, by, how) {
  if (!(e.down > 0) || e.alive || (by && by !== e && by.team === e.team)) return false;
  e.dhp = (e.dhp == null ? DOWN_HP : e.dhp) - dmg;
  if (by && !by.bot && by.team !== e.team) send(by, { t: 'hm', h: 0, k: e.dhp <= 0 ? 1 : 0, m: how === 'melee' ? 1 : 0 });
  if (!e.bot) send(e, { t: 'dd', x: +(by ? by.x : e.x).toFixed(1), z: +(by ? by.z : e.z).toFixed(1) });
  if (e.dhp > 0) return true;
  if (by && !by.bot && by.team !== e.team) { addXp(by, 3); tell(by, 'Finished off ' + nameOf(e) + ' (+3 XP)'); }
  finishDown(e, by && by.team !== e.team ? (by.bot ? 'an enemy soldier, who finished you off' : by.name + ', who finished you off') : 'your wounds'); return true;
}
function pistolFire(p) {
  const s = p.ps; if (!s || s.cd > 0 || s.rel > 0) return;
  if (s.ammo <= 0) { s.rel = PISTOL.rl; return; }
  s.ammo--; s.cd = PISTOL.cd; p.flash = 3;
  fireBullet(p, p.x, p.y + .45, p.z, p.yaw + (rnd() - .5) * PISTOL.spr, p.pitch + (rnd() - .5) * PISTOL.spr, PISTOL.rng, PISTOL.dmg, 'pistol', PISTOL.vel);
}
const medicNear = e => { for (const q of ents.values()) if (q !== e && q.team === e.team && q.alive && (q.kit || q.cls === 'medic') && !q.mg && Math.abs(q.x - e.x) < 45 && Math.abs(q.z - e.z) < 45) return true; return false; };
function downEnt(e, by) {   // knocked down instead of killed: a medic can revive, or hold E to respawn
  e.alive = false; e.hp = 0; e.down = e.bot ? BOT_BLEED : BLEED; e.rt = 1e9; e.crouch = false; e.rvT = 0; e.charging = false; e.shelter = null;
  e.dhp = DOWN_HP; e.ps = e.bot ? null : { ammo: PISTOL.mag, cd: 1.2, rel: 0 }; e.cl = null; e.sld = 0; e.rg = 0; e.hold = true;   // the revolver takes a moment to draw; a held trigger does not fire it
  if (e.bot) { BSTAT.downs = (BSTAT.downs || 0) + 1; moraleHit(e, 4); creditKill(e, by); killFeed(e, by, false); return; }
  if (e.mg != null) dismount(e, true); if (e.veh) VEHM.leave(e, true);
  killFeed(e, by, false); creditKill(e, by);   // a player knocked down shows in the feed like a kill
  send(e, { t: 'down', by: by ? (by.bot ? 'an enemy soldier' : by.name) : 'an explosion', bleed: BLEED });
  for (const q of humans) if (q !== e && q.team === e.team && q.deployed && q.alive && q.cls === 'medic' && Math.hypot(q.x - e.x, q.z - e.z) < 60) tell(q, e.name + ' is down — hold [E] next to them to revive');
}
function finishDown(e, msg) {
  if (e.bot) { e.down = 0; e.died = true; bodyOut(e, null); e.rt = 8 + rnd() * 4; return; }
  e.down = 0; e.rt = .6; send(e, { t: 'dead', by: msg || 'bleeding out' });
}
function reviveEnt(e, by) {
  e.down = 0; e.alive = true; e.hp = Math.ceil(maxHp(e) * .4); e.rel = 0; e.cd = 0; e.rvT = 0; e.revBy = by.bot ? null : by; BSTAT.revives++;
  if (by.bot) st(by).rev++;
  if (e.bot) { e.tgt = null; e.cov = null; e.hist = null; if (!by.bot) { st(by).rev++; addXp(by, 15); tell(by, 'Revived ' + nameOf(e) + ' (+15 XP)'); } return; }
  send(e, { t: 'sp', x: e.x, y: e.y, z: e.z, cls: e.cls, w: e.w, u: e.u, hp: e.hp, sq: e.sq, rv: 1 });
  tell(e, by.bot ? nameOf(by) + ' patched you up' : by.name + ' revived you');
  if (!by.bot) { st(by).rev++; addXp(by, REV_XP); tell(by, 'Revived ' + nameOf(e) + ' (+' + REV_XP + ' XP)'); }
}
const bodies = [];
const EIDX = { flame: 0, atr: 1, hmg: 2 };   // elites: class 7, weapon bits = which kit
const lookByte = e => e.elite ? 7 | (EIDX[e.elite] << 3) : (CLASS_IDX[e.cls] || 0) | ((W_IDX[e.w] || 0) << 3);
function bodyOut(e, imp) { bodies.push([e.id, +e.x.toFixed(2), +e.y.toFixed(2), +e.z.toFixed(2), ...(imp || [0, 0, 0]).map(v => +v.toFixed(2)), e.team ? 1 : 0, lookByte(e), +(e.yaw || 0).toFixed(2)]); }
function killEnt(e, by) {
  e.died = true; moraleHit(e, 8);
  if (!e.cmd) bodyOut(e, e._imp); e._imp = null; if (e.fortNest) leaveFortNest(e);
  e.alive = false; e.hp = 0; e.down = 0; e.rt = e.bot ? 9 + rnd() * 4 : 5;
  if (e.mg != null && !e.bot) dismount(e, true); if (e.veh) VEHM.leave(e, true);
  if (e.elite === 'flame') { const x = e.x, z = e.z, k = by && by.team !== e.team ? by : null; later(0, () => explode(x, z, k, .45)); }   // a holed fuel tank goes up
  killFeed(e, by, arguments[2]); creditKill(e, by, arguments[2]);
  if (!e.bot) send(e, { t: 'dead', by: by ? (by.bot ? 'an enemy soldier' : by.name) : 'an explosion' });
}
function explode(x, z, by, pow, src) {   // pow: 1 = artillery shell / grenade; mortar bombs .75, tank shells .8; src 'shell' = fired by a gun
  pow = pow || 1; const R = 7 * pow, cr = +(4 * Math.min(1.2, .4 + .6 * pow)).toFixed(2), dep = +(1.6 * Math.min(1.2, .4 + .6 * pow)).toFixed(2);
  { const c = [+x.toFixed(2), +z.toFixed(2), cr, dep]; terr && T.dig(terr, c[0], c[1], cr, dep); craters.push(c); }   // dig exactly what the clients will replay
  NAV.rebuild(x - cr - 1, z - cr - 1, x + cr + 1, z + cr + 1);
  bcast({ t: 'cr', c: craters[craters.length - 1] });
  if (VEHM) VEHM.blast(x, z, by, pow, src);
  AAS.forEach((a, i) => { if (a.dead || (by && by.team === a.team)) return; const R = 3.4 * Math.sqrt(pow), d = Math.hypot(a.x - x, a.z - z); if (d < R) { a.hp -= 130 * pow * (1 - d / R); if (a.hp <= 0) aaWreck(i, by); } });
  if (pow >= .75) T.PHONES.forEach((L, l) => { for (let s = 0; s < L.pts.length - 1; s++) if (T.phoneDist(l, s, x, z) < 3 * pow) phoneSet(l, s, true, by); });   // v0.31: shells cut telephone wire
  for (let i = 0; i < BASE_NESTS; i++) { const n = NESTS[i]; if (n.dead || (by && by.team === n.team)) continue;   // v0.31: a grenade in the nest or a shell beside it wrecks the gun
    const Rn = 3.4 * Math.sqrt(pow), d = Math.hypot(n.x - x, n.z - z); if (d < Rn) { n.hp = (n.hp == null ? 100 : n.hp) - 130 * pow * (1 - d / Rn); if (n.hp <= 0) nestWreck(i, by); } }
  if (pow >= 1 && (src === 'shell' || !by || by.cmd)) blowBay(x, z, by);
  if (pow >= 1 && (src === 'shell' || !by || by.cmd)) raiseAlarm(x, z, 12, 4, null);   // shells bursting close: get under cover   // artillery, bombs and field-gun shells can bring a trench bay down
  for (const e of ents.values()) if (e.alive && !e.manned && !e.cmd && !e.inV) { const d = Math.hypot(e.x - x, e.z - z); if (d < R) {
    const rm = T.inRoom(e.x, e.y, e.z), k = 1 - d / R, ux = d > .2 ? (e.x - x) / d : rnd() - .5, uz = d > .2 ? (e.z - z) / d : rnd() - .5;
    e._imp = [ux * (3 + 9 * k), 4 + 8 * k, uz * (3 + 9 * k)];     // a blast kill throws the body away from the explosion
    suppress(e, 'mg', by || e); e.supp = Math.min(1, e.supp + .4 * k);
    damage(e, 130 * k * (.55 + .45 * pow) * (rm && T.roomAt(x, z) !== rm ? .3 : 1), by, false, [x, z]); e._imp = null; } }
  for (const e of downed.slice()) { const d = Math.hypot(e.x - x, e.z - z); if (d < R && e.down > 0) finishHit(e, 130 * (1 - d / R) * (.55 + .45 * pow), by && by.team === e.team ? null : by); }   // a blast finishes the wounded too (whoever threw it)
  for (const q of posts.slice()) { if (q.fort) continue; const d = Math.hypot(q.x - x, q.z - z); if (d < 6 && (!by || by.team !== q.team)) damagePost(q, 250 * (1 - d / 6), by); }
  for (const f of [...T.FORTS.values()]) { if (by && by.team === f.team) continue; const sm = T.FORT[f.k].small, R = sm ? 6 : 9, d = Math.hypot(f.x - x, f.z - z); if (d < R) damageFort(f, 300 * (1 - d / R) * (sm ? 1 : .6), by); }
}

// a heavy shell that bursts in a trench may blow the bay in (once per bay per round): spoil half fills it, the men in it are buried
function blowBay(x, z, by) {
  for (const t of T.FL) {
    const c = T.trenchC(t, x); if (Math.abs(z - c) > 3.2) continue;
    const cell = Math.floor((x + T.W) / 9); if (!T.bayOK(t, cell) || rnd() > .55) continue;
    T.collapseBay(terr, t, cell); craters.push(['b', t, cell]); bcast({ t: 'bay', l: t, c: cell });
    const x0 = cell * 9 - T.W; NAV.rebuild(x0 - 1, t - 20, x0 + 10, t + 20);
    for (const e of ents.values()) if (e.alive && !e.cmd && !e.manned && !e.inV && e.x >= x0 - .5 && e.x <= x0 + 9.5 && Math.abs(e.z - T.trenchC(t, e.x)) < 3) {
      const g = T.groundAt(terr.H, e.x, e.z, 99); if (e.y < g) { e.y = g; e.vy = 0; e.cl = null; } damage(e, 35, by, false, [x, z]);
    }
    for (const f of [...T.FORTS.values()]) if (T.FORT[f.k].small && f.x >= x0 && f.x <= x0 + 9 && Math.abs(f.z - T.trenchC(t, f.x)) < 4) removeFort(f);
    return;
  }
}
// ------------------------------------------------------------------ combat
// Bullets are projectiles: they fly at the weapon's muzzle velocity, drop under gravity and are stepped every 0.5 m.
// A bullet that passes within 2.6 m of an enemy suppresses them (once per bullet per soldier).
// lag compensation: every entity keeps 1 s of positions; a human's bullets hit targets where that player saw them
// (the client reports the server tick it is rendering, `rt`; rewind is capped at LAGC_MAX ticks)
const HIST = 20, LAGC_MAX = 8;
function histTick() { const k = tickNo % HIST; for (const e of ents.values()) { let h = e.hist; if (!h) { h = e.hist = new Float32Array(HIST * 4); for (let i = 0; i < HIST; i++) { h[i * 4] = e.x; h[i * 4 + 1] = e.y; h[i * 4 + 2] = e.z; } }   // new / respawned: no ghost of where it used to be
 h[k * 4] = e.x; h[k * 4 + 1] = e.y; h[k * 4 + 2] = e.z; h[k * 4 + 3] = e.crouch ? 1 : 0; } }
function histAt(e, rw, out) {   // position of e rw ticks ago (falls back to now)
  const h = e.hist; if (!rw || !h) { out[0] = e.x; out[1] = e.y; out[2] = e.z; out[3] = e.crouch ? 1 : 0; return out; }
  const k = ((tickNo - rw) % HIST + HIST) % HIST; out[0] = h[k * 4]; out[1] = h[k * 4 + 1]; out[2] = h[k * 4 + 2]; out[3] = h[k * 4 + 3]; return out;
}
const RW = [0, 0, 0, 0];
const bullets = [], SUPW = { mg: .3, lmg: .22, smg: .1, shotgun: .12, bolt: .18, carbine: .14, mark: .25, hmg: .3, atr: .35 };
function fireBullet(by, ox, oy, oz, yw, pt, rng, dmg, wk, vel, sw) {
  const cp = Math.cos(pt), dx = -Math.sin(yw) * cp, dy = Math.sin(pt), dz = -Math.cos(yw) * cp, b = { by, team: by.team, x: ox, y: oy, z: oz, vx: dx * vel, vy: dy * vel, vz: dz * vel, d: 0, rng, dmg, wk, sw, sup: null, rw: by.bot ? 0 : clamp(by.rw || 0, 0, LAGC_MAX) };
  bullets.push(b); shots.push([ox, oy, oz, dx, dy, dz, Math.min(rng, 140), by.id, wk, vel]); return b;
}
function suppress(e, wk, by) {
  if (e.cmd || !e.alive) return; e.supp = Math.min(1, (e.supp || 0) + (SUPW[wk] || .15) * (e.cls === 'rifleman' && !e.elite ? .5 : 1));   // v0.37: riflemen keep their nerve
  if (!e.bot) { e.supSrc = [by.x, by.z]; e.supSend = true; }
}
function bulletStep(b, dt) {   // true when the bullet is spent
  const spd = Math.hypot(b.vx, b.vy, b.vz), n = Math.max(1, Math.ceil(spd * dt / .5)), h = dt / n, cand = [];
  forNear(b.x + b.vx * dt / 2, b.z + b.vz * dt / 2, spd * dt / 2 + 4 + (b.rw ? 4 : 0), e => { if (e.team !== b.team && e.alive && !e.cmd) cand.push(e); });
  for (let k = 0; k < n; k++) {
    const px = b.x, py = b.y, pz = b.z;
    b.vy -= T.GRAV * h; b.x += b.vx * h; b.y += b.vy * h; b.z += b.vz * h; b.d += spd * h;
    const x = b.x, y = b.y, z = b.z;
    if (b.d > b.rng || Math.abs(x) > T.W || Math.abs(z) > T.W) return true;
    if (y < hAt(terr.H, x, z) || T.inRoof(x, y, z) || T.sbHit(terr.H, x, y, z) || T.fortSeg(px, py, pz, x, y, z) >= 0) return true;   // walls clipped exactly: no tunnelling through 0.45 m logs
    if (VEHM && VEHM.bulletHit(b, x, y, z)) return true;
    if (y > 15) { const pl = planes.find(q => q.team !== b.team && q.ph !== 'down' && Math.abs(q.y - y) < 3 && Math.hypot(q.x - x, q.z - z) < 3.5); if (pl) { planeHurt(pl, b.dmg * .5, b.by); return true; } }   // armour stops bullets (anti-tank rounds hurt it)
    const pq = posts.find(q => !q.fort && q.team !== b.team && Math.abs(q.x - x) < 1.5 && Math.abs(q.z - z) < 1.5 && y < hAt(terr.H, q.x, q.z) + 1.4);
    if (pq) { damagePost(pq, b.dmg * .6, b.by); return true; }
    for (const e of downed) if (e.team !== b.team && e.down > 0 && Math.abs(e.x - x) < .8 && Math.abs(e.z - z) < .8 && y > e.y - .1 && y < e.y + .65) { finishHit(e, b.dmg, b.by); return true; }   // a wounded man on the ground: low, and easy to finish
    for (const e of cand) {
      if (!e.alive) continue; const P = histAt(e, b.rw, RW), ex = P[0] - x, ez = P[2] - z, ey = P[1], cr = P[3];
      if (Math.abs(ex) < .6 && Math.abs(ez) < .6 && y > ey && y < ey + (cr ? 1.3 : 1.9)) {
        const head = y >= ey + (cr ? 1.0 : 1.55), scoped = b.by.cls === 'recon' && WPN[b.wk] && WPN[b.wk].scope;
        const dmg = head && scoped ? 250 : b.sw && b.d >= b.sw[0] && b.d <= b.sw[1] ? b.sw[2] : b.dmg;   // recon scoped headshot kills outright; bolt/marksman/sniper sweet spot
        damage(e, dmg, b.by, head, null, b.wk === 'pistol' ? 'pistol' : undefined); return true;
      }
      if (Math.abs(ex) < 2.6 && Math.abs(ez) < 2.6 && Math.hypot(ex, ez, ey + 1.2 - y) < 2.6 && !(b.sup && b.sup.has(e.id))) { (b.sup || (b.sup = new Set())).add(e.id); suppress(e, b.wk, b.by); }
    }
  }
  return false;
}
function bulletsTick() { for (let i = bullets.length - 1; i >= 0; i--) if (bulletStep(bullets[i], DT)) bullets.splice(i, 1); }
function trace(by, ox, oy, oz, yw, pt, rng, dmg) {   // instant resolve (tests, legacy callers)
  const b = fireBullet(by, ox, oy, oz, yw, pt, rng, dmg, by.mg ? 'mg' : (by.w || 'bolt'), 400); bullets.pop();
  for (let i = 0; i < 40 && !bulletStep(b, DT); i++);
}
const enemiesNear = (p, r) => { const a = []; forNear(p.x, p.z, r, e => { if (e.team !== p.team && e.alive && Math.abs(e.x - p.x) < r && Math.abs(e.z - p.z) < r && Math.hypot(e.x - p.x, e.z - p.z) < r) a.push(e); }); return a; };   // (v0.27 fix: it used to return everyone in the neighbouring 32 m grid cells)
const eyeH = p => p.crouch ? 1.0 : 1.65;

function startReload(p) {
  if (p.rg) { rgUnload(p); return; }   // R with a rifle grenade fitted takes it off again
  if (p.rel > 0 || p.mg != null) return; const w = WPN[p.w]; if (p.ammo >= w.mag) return;
  const cost = w.flame ? 3 : 1;   // a fresh fuel tank costs more than a clip
  if (supply[p.team] < cost) { tell(p, 'Out of supplies. Hold more lines.'); return; }
  supply[p.team] -= cost; p.rel = w.rl * (p.cls === 'assault' && !p.elite ? .7 : 1);   // v0.36: the assault man is quick with a clip
}
function fireWeapon(p) {
  const w = WPN[p.w]; if (p.cd > 0 || p.rel > 0 || p.charging || p.sprOut > 0 || (p.mask && tickNo < p.mask)) return;   // no firing while sprinting or charging
  if (p.rg) { if (tickNo >= p.rgAt) fireRifleGrenade(p); return; }   // v0.37: a rifle grenade is fitted: the trigger launches it
  if (p.ammo <= 0) { startReload(p); return; }
  p.ammo--; p.cd = w.cd * (p.cls === 'rifleman' && p.w === 'bolt' && !p.elite ? .8 : 1); p.flash = 3;   // v0.37: riflemen work the bolt faster
  if (w.flame) { flameJet(p, p.yaw, p.pitch); return; }
  const ey = p.y + eyeH(p);
  // aiming down sights is far tighter than hip fire; suppression and sustained automatic fire (bloom) open the cone
  const brace = p.cls === 'gunner' && !p.elite && p.crouch && (p.mg == null || p.mg === false);   // v0.36: a gunner who kneels to fire braces the gun
  const sp = ((p.ads ? w.spr * .35 : w.spr + (w.hip || 0)) * (1 + (p.supp || 0) * 1.2) + (p.bloom || 0)) * (brace ? .55 : 1);
  p.bloom = Math.min(.05, (p.bloom || 0) + (w.blm || 0) * (brace ? .4 : 1));
  for (let q = 0; q < w.pel; q++) fireBullet(p, p.x, ey, p.z, p.yaw + (rnd() - .5) * sp, p.pitch + (rnd() - .5) * sp, w.rng, w.dmg, p.w, w.vel || 400, w.sw);
}
// melee: bayonet (bolt, carbine, trench gun) kills outright; the others club for 60. A charge strikes automatically on contact.
function meleeStrike(p, auto) {
  if (!p.alive || p.mg === true || (p.mg != null && p.mg !== false) || p.cl || (p.mcd || 0) > tickNo) return false;
  const w = WPN[p.w], bay = !!(w && w.bay), fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw); let best = null, bd = auto ? 2.2 : 2.6;
  for (const e of ents.values()) {   // direct scan (the grid can be a tick old and melee is rare)
    if (e.team === p.team || !e.alive || e.manned || e.cmd) continue; const dx = e.x - p.x, dz = e.z - p.z, d = Math.hypot(dx, dz);
    if (d > bd || (d > .8 && (dx * fx + dz * fz) / d < .6) || Math.abs(e.y - p.y) > 1.6) continue;
    if (!T.los(terr.H, p.x, p.y + 1.3, p.z, e.x, e.y + 1.1, e.z)) continue; bd = d; best = e;
  }
  if (!best && auto) return false;
  p.mcd = tickNo + Math.round(.8 * TICK); p.flash = 0;
  if (!best) { for (const e of downed) if (e.team !== p.team && e.down > 0 && Math.hypot(e.x - p.x, e.z - p.z) < 2.2 && Math.abs(e.y - p.y) < 1.6) { finishHit(e, 999, p, 'melee'); return true; } return false; }
  best._imp = [fx * 3, 2.5, fz * 3]; damage(best, bay ? 200 : 60, p, false, null, 'melee'); best._imp = null;
  return true;
}
function startBelt(p) {
  const n = NESTS[p.mg]; if (p.rel > 0 || n.belt >= 150) return;
  if (supply[p.team] < 2) { tell(p, 'Need 2 supplies for a new belt'); return; }
  supply[p.team] -= 2; p.rel = 3;
}
function mgFire(p) {
  const n = NESTS[p.mg]; if (p.cd > 0 || p.rel > 0 || n.over) return;
  if (n.belt <= 0) { startBelt(p); return; }
  n.belt--; n.heat = Math.min(1, n.heat + .04); if (n.heat >= 1) { n.over = true; tell(p, 'MG overheated! Let it cool.'); }
  p.cd = .085; p.flash = 3; const sp = .008 + .045 * n.heat;
  fireBullet(p, p.x, p.y + 1.35, p.z, p.yaw + (rnd() - .5) * sp, p.pitch + (rnd() - .5) * sp, 140, 24, 'mg', 420);
}
function mount(p) {
  if (!p.alive || p.mg != null) return;
  let best = null, bd = 3.4;
  for (const n of NESTS) if (n.team === p.team && n.occ == null && !n.dead) { const d = Math.hypot(p.x - n.x, p.z - n.z); if (d < bd) { bd = d; best = n; } }
  if (!best) { tell(p, 'No free machine gun within reach.'); return; }
  p.mg = best.idx; best.occ = p.id; if (best.bot) leaveFortNest(best.bot);   // the bot gunner steps off and goes back to the fight
  p.x = best.x; p.z = best.z; p.y = hAt(terr.H, p.x, p.z); p.vy = 0; p.yaw = best.yaw != null ? best.yaw : faceYaw(p.team); p.pitch = 0; p.rel = 0;
  tell(p, 'On the gun. Hold click to fire, R for a new belt, F to leave.');
}
function dismount(p, dead) {
  if (p.mg == null) return; const n = NESTS[p.mg];
  if (p.rel > 0) { supply[p.team] += 2; p.rel = 0; }
  n.occ = null; p.mg = null;
  if (!dead) { if (n.yaw != null) { p.x = n.x + Math.sin(n.yaw) * 1.4; p.z = n.z + Math.cos(n.yaw) * 1.4; } else p.z = n.z + (p.team === 0 ? 2.6 : -2.6); p.y = hAt(terr.H, p.x, p.z); }
}
const gCost = p => (p.u === 'nade' || p.cls === 'sapper') ? 1 : 2;
function throwGrenade(p) {
  if (p.mg != null || p.veh) return; const c = gCost(p);
  if (!(p.gr > 0)) { tell(p, 'Out of grenades'); return; }
  if ((p.gCd || 0) > tickNo) return;
  if (supply[p.team] < c) { tell(p, 'Need ' + c + ' supply for a grenade'); return; }
  supply[p.team] -= c; p.gr--; p.gCd = tickNo + TICK;
  const cp = Math.cos(p.pitch), dx = -Math.sin(p.yaw) * cp, dy = Math.sin(p.pitch), dz = -Math.cos(p.yaw) * cp, ey = p.y + eyeH(p); let t = 2;
  for (; t < 24; t += .5) if (ey + dy * t < hAt(terr.H, p.x + dx * t, p.z + dz * t)) break;
  const g = { fx: p.x, fy: ey, fz: p.z, tx: p.x + dx * t, tz: p.z + dz * t, t: 1.4, by: p };
  grenades.push(g); bcast({ t: 'gr', f: [+g.fx.toFixed(1), +g.fy.toFixed(1), +g.fz.toFixed(1)], to: [+g.tx.toFixed(1), +g.tz.toFixed(1)], tm: p.team });
}
// v0.38 medics: the hurt teammate a medic's bandage goes to (within arm's reach and roughly in front of him; the worst hurt first)
const MED_HEAL_XP = 8, MED_SEE = 45, MED_REACH = 2.8;
function medicTarget(p) {
  const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw); let best = null, bs = 1;
  for (const e of ents.values()) { if (e === p || e.team !== p.team || !e.alive || e.down > 0 || e.cmd || e.inV || e.hp >= maxHp(e)) continue;
    const dx = e.x - p.x, dz = e.z - p.z, d = Math.hypot(dx, dz); if (d > MED_REACH || Math.abs(e.y - p.y) > 1.8 || (d > .7 && (dx * fx + dz * fz) / d < .35)) continue;
    const fr = e.hp / maxHp(e); if (fr < bs) { bs = fr; best = e; } }
  return best;
}
/** Twice a second each medic is told the health of the hurt teammates near him: [id, % health]. */
function medicSee() {
  for (const p of humans) { if (!p.deployed || !p.alive || p.cls !== 'medic' || p.cmd) { continue; }
    const L = []; forNear(p.x, p.z, MED_SEE, e => { if (e === p || e.team !== p.team || !e.alive || e.down > 0 || e.cmd || e.inV || e.hp >= maxHp(e) || L.length >= 40) return; if (Math.hypot(e.x - p.x, e.z - p.z) <= MED_SEE) L.push([e.id, Math.max(1, Math.round(e.hp / maxHp(e) * 100))]); });
    if (L.length || p.mhN) send(p, { t: 'mh', l: L }); p.mhN = L.length; }
}
function reviveAct(p) {
  if (!p.alive || p.cls !== 'medic' || p.mg != null) return;
  let t = null, bd = 2.7; for (const e of ents.values()) if (e.down > 0 && e.team === p.team && Math.hypot(e.x - p.x, e.z - p.z) < bd) { bd = Math.hypot(e.x - p.x, e.z - p.z); t = e; }   // humans and downed bots
  if (!t) return;
  if (supply[p.team] < 2) { tell(p, 'Reviving needs 2 supplies'); return; }
  const gap = tickNo - (p.rvLast || -99);
  if (p.rvTgt !== t || gap > 8) { p.rvT = 0; p.rvTgt = t; p.rvLast = tickNo; }
  p.rvT += Math.min(gap, 6) * DT; p.rvLast = tickNo;
  send(p, { t: 'rvp', p: Math.min(1, p.rvT / REV_T) }); if (!t.bot) send(t, { t: 'rvp', p: Math.min(1, p.rvT / REV_T), by: p.name });
  if (p.rvT >= REV_T) { supply[p.team] -= 2; p.rvT = 0; p.rvTgt = null; reviveEnt(t, p); }
}
function onAct(p, a, m) {
  if (p.deployed && a === 'postToggle') { p.usePost = p.usePost === false; tell(p, p.usePost === false ? 'Respawn: normal line' : 'Respawn: field posts when available'); return; }
  if (p.deployed && a === 'giveup' && p.down > 0) { finishDown(p, 'your own choice'); return; }
  if (p.deployed && a === 'reload' && p.down > 0 && !p.alive && p.ps) { if (p.ps.rel <= 0 && p.ps.ammo < PISTOL.mag) p.ps.rel = PISTOL.rl; return; }
  if (p.deployed && a === 'revive') { reviveAct(p); return; }
  if (p.deployed && a === 'ping' && p.down > 0) { callMedic(p); return; }
  if (p.deployed && a === 'work') { workAct(p); return; }
  if (p.deployed && a === 'ability') { abilityAct(p); return; }
  if (p.deployed && a === 'spawnAt') { const id = Math.floor(+(m && m.id)); p.spawnPick = Number.isFinite(id) ? id : null; return; }   // v0.34.1: picked while dead (it used to fall through the 'alive' check below and was dropped)
  if (!p.deployed || !p.alive) return;
  if (p.veh && !['mg', 'ping', 'mark', 'mask'].includes(a)) return;   // seated in a vehicle or at a gun
  if (a === 'reload') { p.mg != null ? startBelt(p) : startReload(p); }
  else if (a === 'grenade') throwGrenade(p);
  else if (a === 'melee') meleeStrike(p, false);
  else if (a === 'mark') markAct(p);
  else if (a === 'ping') pingAct(p, String(m.k));
  else if (a === 'mask') maskAct(p);
  else if (a === 'fob') buildPost(p);
  else if (a === 'build') buildAct(p, String(m && m.k));
  else if (a === 'fspawn') fortSpawn(p);
  else if (a === 'mg') {   // F: leave / man a machine gun, a tank, a field gun or a mortar, or take an elite kit
    if ((p.mgCd || 0) > tickNo) return; p.mgCd = tickNo + Math.round(1.2 * TICK);
    if (p.veh) VEHM.leave(p); else if (p.mg != null) dismount(p); else if (takeElite(p)) { } else if (!VEHM.enter(p)) mount(p);
  }
  else if (a === 'heal') {
    if (p.u === 'gasnade' || p.u === 'smokenade') { throwUtil(p); return; }
    if (p.u === 'flare') { fireFlare(p); return; }
    if (p.u !== 'bandage' || p.mg != null) return;
    const mate = p.cls === 'medic' ? medicTarget(p) : null;   // v0.38: a medic bandages the hurt teammate in front of him before himself
    if (!mate && p.hp >= maxHp(p)) return;
    if (!(p.bd > 0)) { if ((p.msgCd || 0) <= tickNo) { tell(p, 'No bandages left'); p.msgCd = tickNo + 2 * TICK; } return; }
    if ((p.healCd || 0) > tickNo) return;   // 6 s between bandages
    if (supply[p.team] < 1) { tell(p, 'No supplies for bandages'); return; }
    supply[p.team]--; p.bd--;
    if (mate) { const h0 = mate.hp; mate.hp = Math.min(maxHp(mate), mate.hp + 70); mate.burn = 0; p.healCd = tickNo + 3 * TICK; const gain = Math.round(mate.hp - h0), xp = gain >= 20 ? MED_HEAL_XP : 2;
      st(p).heal = (st(p).heal || 0) + 1; addXp(p, xp); send(p, { t: 'mhd', id: mate.id, n: nameOf(mate), hp: gain, xp }); if (!mate.bot) tell(mate, p.name + ' bandaged you (+' + gain + ' HP)'); p.mhAt = 0; return; }
    p.healCd = tickNo + 6 * TICK; p.hp = Math.min(maxHp(p), p.hp + (p.cls === 'medic' ? 70 : 40));
  } else if (a === 'dig') {
    if (p.u !== 'tool' || p.mg != null || (p.digCd || 0) > tickNo) return;
    if (supply[p.team] < 1) { tell(p, 'No supplies for digging'); return; }
    supply[p.team]--; p.digCd = tickNo + 3 * TICK;
    const r = p.cls === 'sapper' ? 3.4 : 2.4; { const c = [+p.x.toFixed(2), +p.z.toFixed(2), r, 1.4]; T.dig(terr, c[0], c[1], r, 1.4); craters.push(c); } bcast({ t: 'cr', c: craters[craters.length - 1] });
  }
}

// ------------------------------------------------------------------ fortifications: everyone builds small cover, sappers raise buildings
let fortId = 1;
const SMALL_PER = 8, SMALL_TEAM = 150, BLD_TEAM = 6, BLD_PER = 2;
const fortMsg = f => [f.id, f.k, f.team, +f.x.toFixed(2), +f.z.toFixed(2), +f.yaw.toFixed(3), +f.y.toFixed(2), +f.done.toFixed(2), Math.max(0, Math.round(f.hp)), f.spawn ? 1 : 0];
const fortSync = f => { f.lastB = tickNo; bcast({ t: 'fa', f: fortMsg(f) }); };
function buildAct(p, k) {
  if (!T.own(T.FORT, k)) return; const D = T.FORT[k]; if (p.mg != null || p.cmd || p.cl) return;
  if (D.sapper && p.cls !== 'sapper') { tell(p, 'Only sappers can raise buildings'); return; }
  if ((p.bCd || 0) > tickNo) return; p.bCd = tickNo + Math.round(.6 * TICK);
  const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw), x = p.x + fx * D.ahead, z = p.z + fz * D.ahead;
  if (Math.abs(x) > T.W - 4 || Math.abs(z) > T.W - 4) { tell(p, 'Too close to the map edge'); return; }
  if (T.roomAt(x, z)) { tell(p, 'Not inside a dugout'); return; }
  const f = { id: fortId++, k, team: p.team, x, z, yaw: p.yaw, y: hAt(terr.H, x, z), done: D.small ? 1 : 0, hp: D.hp, by: p, spawn: 0 };
  if (D.small) {
    if ([...T.FORTS.values()].filter(q => q.team === p.team && T.FORT[q.k].small).length >= SMALL_TEAM) { tell(p, 'Your team has built all the cover it can hold'); return; }
  } else {
    const cs = [[-4, -3.6], [4, -3.6], [-4, 3.6], [4, 3.6], [0, 0]].map(([a, b]) => { const c = Math.cos(p.yaw), s2 = Math.sin(p.yaw); return [x + a * c - b * s2, z - a * s2 - b * c]; });
    const hs = cs.map(([a, b]) => hAt(terr.H, a, b));
    if (Math.max(...hs) - Math.min(...hs) > 1.0 || cs.some(([a, b]) => Math.abs(hAt(terr.H, a, b) - T.base(a, b)) > .6 || T.roomAt(a, b))) { tell(p, 'Needs flat, undug ground (not in a trench or crater)'); return; }
    if (NESTS.some(n => !n.dead && Math.hypot(n.x - x, n.z - z) < 9) || T.HQS.some(q => Math.hypot(q.x - x, q.z - z) < 10)) { tell(p, 'Too close to another position'); return; }
    if ([...T.FORTS.values()].some(q => !T.FORT[q.k].small && Math.hypot(q.x - x, q.z - z) < 12)) { tell(p, 'Too close to another building'); return; }
    if (enemiesNear({ x, z, team: p.team }, 25).length) { tell(p, 'Enemies too close to build'); return; }
    const own = [...T.FORTS.values()].filter(q => q.team === p.team && !T.FORT[q.k].small);
    if (own.length >= BLD_TEAM) { tell(p, 'Your team already has ' + BLD_TEAM + ' buildings'); return; }
    if (own.filter(q => q.by === p).length >= BLD_PER) { tell(p, 'You can only have ' + BLD_PER + ' buildings at once'); return; }
    f.y = Math.min(...hs);
  }
  if (supply[p.team] < D.cost) { tell(p, D.n + ' costs ' + D.cost + ' supply'); return; }
  supply[p.team] -= D.cost;
  if (D.small) { const mine = [...T.FORTS.values()].filter(q => q.by === p && T.FORT[q.k].small); if (mine.length >= SMALL_PER) removeFort(mine[0]); }
  T.addFort(f); fortSync(f); if (D.small) NAV.rebuild(f.x - 4, f.z - 4, f.x + 4, f.z + 4);
  if (D.small) addXp(p, 1); else tell(p, D.n + ' laid out. Hold [E] next to it to build it up (teammates can help).');
}
function nearestFort(p, test) { let b = null, bd = 1e9; for (const f of T.FORTS.values()) { if (!test(f)) continue; const R = T.FORT[f.k].small ? 2.6 : 5.5, d = Math.hypot(f.x - p.x, f.z - p.z); if (d < R && d < bd) { bd = d; b = f; } } return b; }
// hold E: build up your own unfinished building, or tear down enemy structures
// v0.31 wrecked guns: trench MG nests can be knocked out; a wreck is repaired by hand (hold E beside it: a sapper about 8 s,
// anyone else about 20 s) or comes back on its own after NEST_AUTOFIX seconds. Field guns and mortars repair the same way.
const NEST_AUTOFIX = 90, FIX_S = { sapper: 8, other: 20 };
// v0.31 field telephone lines (T.PHONES): artillery needs a line to the batteries. Shells and enemy hands cut segments; holding
// E at a break splices it (sapper 2.5 s, others 5 s); a break nobody splices is mended by the linesmen after PHONE_AUTOFIX s.
const PHONE_AUTOFIX = 120, PHONE_K = ['barrage', 'smoke', 'gas', 'creep', 'heavy'], phoneCut = new Map(), phoneTold = [];   // 'l:s' -> tick it was cut
const phoneUp = team => T.PHONES.filter((L, l) => L.team === team && !L.pts.slice(1).some((_, s) => phoneCut.has(l + ':' + s))).length;
const phoneTotal = team => T.PHONES.filter(L => L.team === team).length;
function phoneSet(l, s, cut, by) {
  const k = l + ':' + s, L = T.PHONES[l]; if (!L || cut === phoneCut.has(k)) return;
  if (cut) phoneCut.set(k, tickNo); else phoneCut.delete(k);
  bcast({ t: 'ph', l, s, c: cut ? 1 : 0 });
  if (cut) { if (tickNo - (phoneTold[L.team] || -1e9) > 5 * TICK) { phoneTold[L.team] = tickNo; teamTell(L.team, 'A telephone line is cut (' + phoneUp(L.team) + '/' + phoneTotal(L.team) + ' working): hold E at the break to splice it'); }
    if (by && by.team !== L.team) { addXp(by, 15); if (!by.bot) tell(by, 'Enemy telephone line cut (+15 XP)'); } }
  else if (by) { addXp(by, 10); if (!by.bot) tell(by, 'Telephone line spliced (+10 XP)'); }
}
function phoneNear(x, z, r, pick) { let best = null, bd = r; T.PHONES.forEach((L, l) => { for (let s = 0; s < L.pts.length - 1; s++) { if (!pick(L, l, s)) continue; const d = T.phoneDist(l, s, x, z); if (d < bd) { bd = d; best = [l, s]; } } }); return best; }
function phoneAct(p, dt) {   // splice your own line or cut the enemy's: true if this E press was used for that
  const own = phoneNear(p.x, p.z, 2.5, (L, l, s) => L.team === p.team && phoneCut.has(l + ':' + s));
  const en = own ? null : phoneNear(p.x, p.z, 2, (L, l, s) => L.team !== p.team && !phoneCut.has(l + ':' + s));
  const tg = own || en; if (!tg) return false; const key = tg.join(':') + (own ? '+' : '-');
  if (p.phK !== key) { p.phK = key; p.phP = 0; }
  p.phP += dt / (own ? (p.cls === 'sapper' ? 2.5 : 5) : (p.cls === 'sapper' ? 1.5 : 3));
  send(p, { t: 'wk', p: Math.min(1, p.phP), n: own ? 'Splicing the telephone line' : 'Cutting the enemy telephone line', x: own ? 0 : 1 });
  if (p.phP >= 1) { p.phP = 0; p.phK = null; phoneSet(tg[0], tg[1], !own, p); }
  return true;
}
// v0.31 tunnel mines (T.TUNNELS): hold E at your shaft head to dig a gallery under the enemy front trench (sappers 75 s of
// work, others 3x slower; diggers stack). Half-way the enemy hears it near the charge spot and can countermine there by
// holding E (sapper 5 s, others 10 s), collapsing the gallery. A finished gallery blows a line of craters under their trench.
const TUN_S = { sapper: 75, other: 225 }, TUN_CD = 60, TUN = [];
function tunReset() { TUN.length = 0; T.TUNNELS.forEach(() => TUN.push({ p: 0, cm: 0, by: new Set(), cd: 0, sent: -1, heard: false })); }
function tunSend(i) { const u = TUN[i], q = T.TUNNELS[i], pq = Math.floor(u.p * 20);
  if (pq === u.sent) return; u.sent = pq;
  for (const h of humans) send(h, { t: 'tn', i, p: h.team === q.team || u.heard ? +u.p.toFixed(2) : 0 }); }
function tunBlow(i) {
  const q = T.TUNNELS[i], u = TUN[i], dig = [...u.by].map(id => [...humans].find(h => h.id === id) || ents.get(id)).filter(Boolean), by = dig[0] || { team: q.team, bot: true, id: -1 };
  for (const dx of [-5, 0, 5]) explode(q.tx + dx, q.tz, by, 1.8, 'mine');
  for (const h of dig) { addXp(h, 50); if (!h.bot) tell(h, 'The mine went up under their trench (+50 XP)'); }
  teamTell(q.team, 'Our mine has gone up under the enemy trench: go now!'); teamTell(1 - q.team, 'An enemy mine exploded under our trench!');
  bcast({ t: 'tb', i }); u.p = 0; u.cm = 0; u.by.clear(); u.heard = false; u.cd = tickNo + TUN_CD * TICK; tunSend(i);
}
function tunnelAct(p, dt) {
  for (let i = 0; i < T.TUNNELS.length; i++) { const q = T.TUNNELS[i], u = TUN[i];
    if (q.team === p.team && Math.hypot(p.x - q.x, p.z - q.z) < 3) {
      if (u.cd > tickNo) { send(p, { t: 'wk', p: 0, n: 'The shaft is being shored up (' + Math.ceil((u.cd - tickNo) / TICK) + ' s)' }); return true; }
      u.p += dt / (p.cls === 'sapper' ? TUN_S.sapper : TUN_S.other); u.by.add(p.id);
      if (u.p >= .5 && !u.heard) { u.heard = true; for (const h of humans) if (h.team !== q.team && h.deployed) tell(h, 'Digging heard under our front trench! Hold E at the listening post to countermine'); }
      send(p, { t: 'wk', p: Math.min(1, u.p), n: 'Digging the mine gallery' }); tunSend(i);
      if (u.p >= 1) tunBlow(i); return true;
    }
    if (q.team !== p.team && Math.hypot(p.x - q.tx, p.z - q.tz) < 4) {
      if (!u.heard) { send(p, { t: 'wk', p: 0, n: 'Listening... all quiet below' }); return true; }
      u.cm += dt / (p.cls === 'sapper' ? 5 : 10); send(p, { t: 'wk', p: Math.min(1, u.cm), n: 'Countermining the enemy gallery' });
      if (u.cm >= 1) { u.p = 0; u.cm = 0; u.by.clear(); u.heard = false; u.cd = tickNo + TUN_CD * TICK; tunSend(i); addXp(p, 30); if (!p.bot) tell(p, 'Camouflet: the enemy gallery collapsed (+30 XP)');
        teamTell(q.team, 'The enemy blew in our mine gallery'); bcast({ t: 'tc', i }); }
      return true;
    }
  }
  return false;
}
tunReset();
// v0.34 bots join in: a bot near a cut telephone wire of his side splices it; one near the listening post over an enemy
// gallery that has been heard countermines it; sapper bots near one of their shafts dig the mine (two at most per shaft).
// A job is dropped the moment an enemy shows up, the work is done, or it takes too long.
function botJobFind(b) {
  let best = null, bd = 60;
  T.PHONES.forEach((L, l) => { if (L.team !== b.team) return; for (let s = 0; s < L.pts.length - 1; s++) if (phoneCut.has(l + ':' + s)) {
    const a = L.pts[s], c = L.pts[s + 1], x = (a[0] + c[0]) / 2, z = (a[1] + c[1]) / 2, d = Math.hypot(x - b.x, z - b.z); if (d < bd) { bd = d; best = { k: 'splice', x: x + .6, z, done: () => !phoneCut.has(l + ':' + s) }; } } });
  if (best) return best; bd = 40;
  T.TUNNELS.forEach((q, i) => { const u = TUN[i]; if (q.team === b.team || !u.heard) return; const d = Math.hypot(q.tx - b.x, q.tz - b.z); if (d < bd) { bd = d; best = { k: 'counter', x: q.tx + 1, z: q.tz, done: () => !TUN[i].heard }; } });
  if (best) return best;
  if (b.cls === 'sapper' && rnd() < .3) T.TUNNELS.forEach((q, i) => { const u = TUN[i]; if (q.team !== b.team || u.cd > tickNo) return; const d = Math.hypot(q.x - b.x, q.z - b.z);
    if (d < 30 && [...ents.values()].filter(e => e.job && e.job.k === 'dig' && e.job.i === i).length < 2) best = { k: 'dig', i, x: q.x + .8, z: q.z, done: () => TUN[i].p === 0 && TUN[i].cd > tickNo }; });
  return best;
}
function botJobTick(b) {
  if (b.mg || b.gun || b.fortNest || b.buildF || b.kit && b.rvTgt) return false;   // (a sapper raising a building finishes it first)
  if (b.job && (b.job.done() || tickNo > b.job.until)) b.job = null;
  if (!b.job) { b.jobScan = (b.jobScan || rnd() * 2) - DT; if (b.jobScan > 0) return false; b.jobScan = 1.5 + rnd(); const j = botJobFind(b); if (!j) return false; j.until = tickNo + (j.k === 'dig' ? 120 : 45) * TICK; b.job = j; }
  const j = b.job, d = Math.hypot(j.x - b.x, j.z - b.z);
  if (d > 1.6) { b.crouch = false; b.moved = navMove(b, j.x, j.z, 3.6); return true; }
  b.crouch = true; b.moved = false; b.wkAt = 0;
  if (j.k === 'splice') phoneAct(b, DT); else tunnelAct(b, DT);
  BSTAT[j.k] = (BSTAT[j.k] || 0) + 1; return true;
}
// v0.31 aircraft: the officer's bomber run, recon flight and the new strafing run are flown by biplanes that cross the map
// from their own side. Bullets hit them; each side's two AA guns (T.AA) fire at enemy planes within AA_R m. A plane shot
// down drops nothing more (a recon plane stops spotting) and crashes. AA guns are wrecked by shells and repaired like nests.
const PL = { v: 40, hp: 120, y: { bomb: 45, recon: 70, strafe: 26 } }, AA_R = 110, AA_DPS = 5, planes = [], AAS = T.AA.map(a => ({ ...a, dead: false, hp: 100, fix: 0, fixAt: 0 }));
let planeId = 1;
function planeLaunch(team, k, x, z, by) {
  const dz = team === 0 ? -1 : 1, lead = { bomb: 4, recon: 3, strafe: 3 }[k] || 3;
  const pl = { id: planeId++, team, k, tx: x, tz: z, x, z: z - dz * PL.v * lead, y: PL.y[k] || 50, dz, dx: 0, hp: PL.hp, by, t: 0, drop: 0, ph: 'in', a: 0 };
  planes.push(pl); return pl;
}
function planeHurt(pl, dmg, by) {
  if (pl.hp <= 0) return; pl.hp -= dmg; if (pl.hp > 0) return;
  pl.ph = 'down'; if (pl.rc) pl.rc.until = 0;
  bcast({ t: 'pd', id: pl.id, x: +pl.x.toFixed(1), z: +pl.z.toFixed(1) });
  if (by && by.team !== pl.team) { addXp(by, 40); if (!by.bot) tell(by, 'Enemy aircraft shot down (+40 XP)'); }
  killFeedRaw(by && by.team !== pl.team ? by : null, pl.team, 'aircraft', by && by.team !== pl.team ? 'rifle' : 'flak');
  teamTell(pl.team, 'Our ' + ({ bomb: 'bomber', recon: 'recon plane', strafe: 'fighter' }[pl.k] || 'plane') + ' was shot down');
  const cx = pl.x + pl.dx * PL.v * 1.5, cz = pl.z + pl.dz * PL.v * 1.5; later(1500, () => { if (Math.abs(cx) < T.W && Math.abs(cz) < T.W) explode(cx, cz, by && by.team !== pl.team ? by : null, .8); });
}
function aaFor(team) { return AAS.filter(a => a.team === team && !a.dead); }
function planesTick() {
  for (let i = planes.length - 1; i >= 0; i--) { const pl = planes[i]; pl.t += DT;
    if (pl.ph === 'down') { planes.splice(i, 1); continue; }
    if (pl.ph === 'circle') { pl.a += PL.v / 35 * DT; pl.x = pl.tx + 35 * Math.cos(pl.a); pl.z = pl.tz + 35 * Math.sin(pl.a); pl.dx = -Math.sin(pl.a); pl.dz = Math.cos(pl.a); if (pl.t > pl.until) { pl.ph = 'out'; pl.dx = 0; pl.dz = pl.team === 0 ? 1 : -1; } }
    else { pl.x += pl.dx * PL.v * DT; pl.z += pl.dz * PL.v * DT; }
    const along = (pl.z - pl.tz) * pl.dz;   // < 0 still on the way in
    if (pl.k === 'recon' && pl.ph === 'in' && Math.hypot(pl.x - pl.tx, pl.z - pl.tz) <= 35) { pl.ph = 'circle'; pl.a = Math.atan2(pl.z - pl.tz, pl.x - pl.tx); pl.until = pl.t + 25;
      pl.rc = { team: pl.team, x: pl.tx, z: pl.tz, r: SUP.recon.r, until: tickNo + 25 * TICK }; recons.push(pl.rc);
      for (const q of humans) if (q.deployed && q.team === pl.team) send(q, { t: 'rc', x: +pl.tx.toFixed(1), z: +pl.tz.toFixed(1), r: SUP.recon.r, s: 25 }); }
    if (pl.k === 'bomb') while (pl.drop < 8 && along >= (pl.drop - 3.5) * 8) { const bx = pl.x, bz = pl.tz + (pl.drop - 3.5) * 8 * pl.dz; pl.drop++; later(500, () => explode(bx, bz, pl.by)); }
    if (pl.k === 'strafe' && Math.abs(along) < 30) {   // two machine guns raking the ground 10 m ahead
      const gx = pl.x, gz = pl.z + pl.dz * 10;
      pl.hit = pl.hit || new Set(); for (const e of ents.values()) if (e.team !== pl.team && e.alive && !e.cmd && !pl.hit.has(e.id) && Math.abs(e.x - gx) < 2.2 && Math.abs(e.z - gz) < 2.5) { pl.hit.add(e.id); if (rnd() < (e.cr ? .45 : .7)) damage(e, 45, pl.by, false, 'plane'); }   // each soldier under the guns is raked once a pass
      for (const e of ents.values()) if (e.team !== pl.team && e.alive && !e.cmd && Math.hypot(e.x - gx, e.z - gz) < 7) suppress(e, 'mg', pl.by);
    }
    for (const a of aaFor(1 - pl.team)) if (Math.hypot(a.x - pl.x, a.z - pl.z) < AA_R) planeHurt(pl, AA_DPS * DT * (.6 + rnd() * .8), null);
    if (pl.ph !== 'circle' && along > 30 && pl.k !== 'recon' && pl.ph === 'in') pl.ph = 'out';
    if (Math.abs(pl.z) > T.W + 160 || Math.abs(pl.x) > T.W + 160) planes.splice(i, 1);
  }
  if (tickNo % 2 === 0 && (planes.length || planesSent)) { planesSent = planes.length > 0; bcast({ t: 'pl', l: planes.map(q => [q.id, q.team, q.k, +q.x.toFixed(1), +q.y.toFixed(1), +q.z.toFixed(1), +q.dx.toFixed(3), +q.dz.toFixed(3), q.k === 'strafe' && Math.abs((q.z - q.tz) * q.dz) < 30 ? 1 : 0, q.ph === 'circle' ? 1 : 0]), aa: AAS.map(a => a.dead ? 1 : 0) }); }
}
let planesSent = false;
function aaWreck(i, by) { const a = AAS[i]; if (!a || a.dead) return; a.dead = true; a.hp = 0; a.fix = 0; a.fixAt = tickNo + NEST_AUTOFIX * TICK; bcast({ t: 'aad', i, d: 1 });
  if (by && by.team !== a.team) { addXp(by, 30); if (!by.bot) tell(by, 'Enemy AA gun knocked out (+30 XP)'); } teamTell(a.team, 'An AA gun is down: hold E beside it to repair'); }
function aaFixed(i, by) { const a = AAS[i]; a.dead = false; a.hp = 100; a.fix = 0; bcast({ t: 'aad', i, d: 0 }); if (by) { addXp(by, 15); if (!by.bot) tell(by, 'AA gun repaired (+15 XP)'); } }
function phoneAutofix() { for (const [k, t0] of phoneCut) if (tickNo - t0 >= PHONE_AUTOFIX * TICK) { const [l, s] = k.split(':').map(Number); phoneSet(l, s, false, null); } }
function nestWreck(i, by) {
  const n = NESTS[i]; if (!n || n.dead) return;
  n.dead = true; n.hp = 0; n.fix = 0; n.fixAt = tickNo + NEST_AUTOFIX * TICK;
  if (n.bot) leaveFortNest(n.bot);
  for (const p of humans) if (p.mg === n.idx) { dismount(p, false); tell(p, 'Your machine gun was knocked out'); }
  if (by && by.team !== n.team) { addXp(by, 30); if (!by.bot) tell(by, 'Enemy machine gun knocked out (+30 XP)'); }
  killFeedRaw(by, n.team, 'MG nest', 'grenade');
  bcast({ t: 'nd', i, d: 1 }); teamTell(n.team, 'An MG nest is down: hold E beside it to repair');
}
function nestFixed(i, by) {
  const n = NESTS[i]; if (!n || !n.dead) return;
  n.dead = false; n.hp = 100; n.fix = 0; n.fixAt = 0; n.occ = null; n.bot = null;
  bcast({ t: 'nd', i, d: 0 });
  if (by) { addXp(by, 15); if (!by.bot) tell(by, 'Machine gun repaired (+15 XP)'); }
}
function nestAutofix() { for (let i = 0; i < BASE_NESTS; i++) { const n = NESTS[i]; if (n.dead && n.fixAt && tickNo >= n.fixAt) nestFixed(i, null); } AAS.forEach((a, i) => { if (a.dead && a.fixAt && tickNo >= a.fixAt) aaFixed(i, null); }); }
function fixAct(p, dt) {   // hands on a wreck of your own side within reach: progress, true if this was a repair
  const rate = dt / (p.cls === 'sapper' ? FIX_S.sapper : FIX_S.other);
  for (let i = 0; i < BASE_NESTS; i++) { const n = NESTS[i];
    if (n.dead && n.team === p.team && Math.hypot(p.x - n.x, p.z - n.z) < 3) { n.fix = Math.min(1, (n.fix || 0) + rate); send(p, { t: 'wk', p: n.fix, n: 'Repairing machine gun' }); if (n.fix >= 1) nestFixed(i, p); return true; } }
  for (let i = 0; i < AAS.length; i++) { const a = AAS[i]; if (a.dead && a.team === p.team && Math.hypot(p.x - a.x, p.z - a.z) < 3) { a.fix = Math.min(1, a.fix + rate); send(p, { t: 'wk', p: a.fix, n: 'Repairing AA gun' }); if (a.fix >= 1) aaFixed(i, p); return true; } }
  const v = VEHM && VEHM.V.find(q => q.k !== 'tank' && q.dead && !q.lost && q.team === p.team && Math.hypot(p.x - q.x, p.z - q.z) < 3.2);
  if (v) { v.fix = Math.min(1, (v.fix || 0) + rate); send(p, { t: 'wk', p: v.fix, n: 'Repairing ' + T.VEH[v.k].n.toLowerCase() }); if (v.fix >= 1) { VEHM.fixNow(v); v.fix = 0; addXp(p, 15); if (!p.bot) tell(p, T.VEH[v.k].n + ' repaired (+15 XP)'); } return true; }
  return false;
}
function workAct(p) {
  if (!p.alive || p.mg != null || p.cmd || p.cl) return;
  const gap = tickNo - (p.wkLast || -99); p.wkLast = tickNo; const dt = Math.min(gap, 6) * DT;
  if (fixAct(p, dt)) return;
  if (phoneAct(p, dt)) return;
  if (tunnelAct(p, dt)) return;
  const own = nearestFort(p, f => f.team === p.team && f.done < 1);
  if (own) {
    const D = T.FORT[own.k]; own.done = Math.min(1, own.done + dt / D.work * (p.cls === 'sapper' ? 1 : .5)); own.helpers = own.helpers || new Set(); own.helpers.add(p);
    send(p, { t: 'wk', p: own.done, n: D.n });
    if (own.done >= 1) fortComplete(own); else if (tickNo - (own.lastB || 0) >= 10) fortSync(own);
    return;
  }
  const en = nearestFort(p, f => f.team !== p.team);
  if (en) { damageFort(en, dt * (p.cls === 'sapper' ? 160 : 70), p); send(p, { t: 'wk', p: Math.max(0, en.hp / T.FORT[en.k].hp), n: 'Tearing down ' + T.FORT[en.k].n.toLowerCase(), x: 1 }); }
}
function fortComplete(f) {
  T.addFort(f); NAV.rebuild(f.x - 7, f.z - 7, f.x + 7, f.z + 7); fortSync(f); const w = T.fortWorld(f);
  if (w.nest) { const n = { x: w.nest.x, z: w.nest.z, yaw: f.yaw, team: f.team, idx: NESTS.length, bot: null, occ: null, belt: 150, heat: 0, over: false, fort: f.id }; NESTS.push(n); f.nest = n; }
  for (const h of f.helpers || []) if (h !== f.by) addXp(h, 10);
  if (f.by && f.by.deployed) { addXp(f.by, 30); tell(f.by, T.FORT[f.k].n + ' finished (+30 XP). [B] then [8] puts a respawn point inside.'); }
  tellTeam(f.team, T.FORT[f.k].n + ' completed');
}
function removeFort(f) {
  T.delFort(f.id); NAV.rebuild(f.x - 7, f.z - 7, f.x + 7, f.z + 7); bcast({ t: 'fx', id: f.id });
  if (f.nest) { f.nest.dead = true; if (f.nest.bot) leaveFortNest(f.nest.bot); for (const p of humans) if (p.mg === f.nest.idx) { dismount(p, false); tell(p, 'The machine gun was destroyed'); } }
  posts = posts.filter(q => q.fort !== f.id);
}
function damageFort(f, dmg, by) {
  if (!T.FORTS.has(f.id) || f.hp <= 0) return; f.hp -= dmg;
  if (f.hp <= 0) {
    removeFort(f); const big = !T.FORT[f.k].small;
    if (big) tellTeam(f.team, 'Our ' + T.FORT[f.k].n.toLowerCase() + ' was destroyed' + (f.spawn ? ' (respawn point lost)' : ''));
    if (by && by.team !== f.team) { addXp(by, big ? 40 : 3); if (!by.bot && big) tell(by, 'Enemy ' + T.FORT[f.k].n.toLowerCase() + ' destroyed (+40 XP)'); }
  } else if (tickNo - (f.lastB || 0) >= 10) fortSync(f);
}
function fortSpawn(p) {
  if (p.cls !== 'sapper' || p.mg != null) return;
  const f = nearestFort(p, q => q.team === p.team && q.done >= 1 && !T.FORT[q.k].small);
  if (!f) { tell(p, 'Stand in or next to one of your finished buildings'); return; }
  if (f.spawn) { tell(p, 'This building already has a respawn point'); return; }
  if (supply[p.team] < 5) { tell(p, 'A respawn point costs 5 supply'); return; }
  supply[p.team] -= 5; f.spawn = 1; const w = T.fortWorld(f);
  posts.push({ id: postId++, team: p.team, x: w.sp.x, z: w.sp.z, y: f.y, hp: 1e9, by: p, fort: f.id, radio: w.radio }); addXp(p, 15); fortSync(f);
  tellTeam(p.team, 'Respawn point set up in a ' + T.FORT[f.k].n.toLowerCase());
}
// bots walk around finished structures instead of through them
function botMove(b, mx, mz) {
  if (T.fortHit(b.x + mx, b.y, b.z + mz, .3, true) && !T.fortHit(b.x, b.y, b.z, 0, true)) { if (!T.fortHit(b.x + mx, b.y, b.z, .3, true)) mz = 0; else if (!T.fortHit(b.x, b.y, b.z + mz, .3, true)) mx = 0; else { const t = mx; mx = -mz; mz = t; if (T.fortHit(b.x + mx, b.y, b.z + mz, .3, true)) return; } }
  b.x += mx; b.z += mz;
}

// ------------------------------------------------------------------ per-tick simulation
// v0.32.1 movement time bank: a player may move as much time as really passed, banked up to MOVE_BANK s. The old flat cap
// (0.12 s of movement a tick) threw away movement whenever inputs arrived bunched up (network jitter, or after a slow server
// tick). The player's own screen had already moved him the full distance, so he was snapped back: worst when sprinting.
// The bank still stops speed hacks: over any stretch of time nobody moves faster than the clock.
const MOVE_BANK = 1;
function processCmds(p) {
  // v0.38: the bank refills with the real time that passed (not a nominal 50 ms a tick: the timer runs a little slow and a busy
  // tick later still, which starved every moving player of 2-4% of his movement and pulled him back several times a second),
  // plus 3% for clock and rounding differences.
  { const now = hr(), el = p.tAt ? Math.min(.3, (now - p.tAt) / 1000) : DT; p.tAt = now; p.tBank = Math.min(MOVE_BANK, (p.tBank == null ? .25 : p.tBank) + el * 1.03); }
  const q = p.q; p.q = [];
  for (const c of q) {
    const seq = +c[0]; if (!Number.isFinite(seq) || seq <= p.ack) continue; p.ack = seq;
    let dt = clamp((c[1] | 0) / 1000, 0, .05); if (dt > p.tBank) dt = Math.max(0, p.tBank); p.tBank -= dt;
    if (p.down > 0 && !p.alive && !p.cmd && p.ps) {   // v0.40 last stand
      const yw = +c[5], pt = clamp(+c[6], -1.2, 1.2); if (!isFinite(yw) || !isFinite(pt)) continue;
      const f2 = clamp(Math.round(+c[2] || 0), -1, 1), s2 = clamp(Math.round(+c[3] || 0), -1, 1), want = !!((c[4] | 0) & 8), ps = p.ps;
      ps.cd -= dt; if (ps.rel > 0) { ps.rel -= dt; if (ps.rel <= 0) { ps.rel = 0; ps.ammo = PISTOL.mag; } }
      T.crawl(p, { dt, f: f2, s: s2, yaw: yw }, terr.H); p.yaw = yw; p.pitch = pt;
      if (want && !p.hold) pistolFire(p); p.hold = want; continue;
    }
    if (!p.alive || p.cmd) continue;
    let yaw = +c[5], pitch = clamp(+c[6], -1.45, 1.45); if (!isFinite(yaw) || !isFinite(pitch)) continue;
    const bits = c[4] | 0, f = clamp(Math.round(+c[2] || 0), -1, 1), s = clamp(Math.round(+c[3] || 0), -1, 1);
    p.cd -= dt; p.bloom = Math.max(0, (p.bloom || 0) - dt * .08);
    p.sprOut = (bits & 1) && (f || s) && p.mg == null ? .18 : (p.sprOut || 0) - dt;   // sprint-to-fire delay
    if (p.veh) { VEHM.input(p, f, s, bits, yaw, pitch, dt, seq); p.yaw = yaw; p.pitch = pitch; p.ads = false; continue; }
    if (p.mg != null) {
      const nn = NESTS[p.mg], base = nn.yaw != null ? nn.yaw : faceYaw(p.team); let d = yaw - base; d = Math.atan2(Math.sin(d), Math.cos(d));
      yaw = base + clamp(d, -1.25, 1.25); pitch = clamp(pitch, -.35, .45); const n = NESTS[p.mg]; p.x = n.x; p.z = n.z; p.y = hAt(terr.H, n.x, n.z); p.crouch = false;
    } else {
      p.crouch = !!(bits & 2);
      T.step(p, { dt, f, s, bits, yaw }, terr.H, T.spOf(p));
    }
    p.yaw = yaw; p.pitch = pitch;
    p.ads = !!(bits & 32) && p.mg == null && !(p.rel > 0) && !p.cl && !masked(p);   // no aiming down sights in a gas mask
    const want = !!(bits & 8);
    if (want && !p.cl) { if (p.mg != null) mgFire(p); else if (WPN[p.w].auto || !p.hold) fireWeapon(p); }
    p.hold = want;
  }
}
function humanTick(p) {
  if (!p.deployed) return;
  processCmds(p);
  if (p.supp > 0) p.supp = Math.max(0, p.supp - DT * .3);
  if (p.supSend) { p.supSend = false; send(p, { t: 'sup', v: +p.supp.toFixed(2), x: +p.supSrc[0].toFixed(1), z: +p.supSrc[1].toFixed(1) }); }
  if (p.alive && p.charging) meleeStrike(p, true);
  if (p.alive && p.cls === 'recon' && p.ads && (tickNo + p.id) % 10 === 0) reconSpot(p, true);   // a scoped recon passively spots what's under his crosshair
  if (!p.alive) { if (p.down > 0) { p.down -= DT; if (p.down <= 0) finishDown(p); return; } p.rt -= DT; if (p.rt <= 0 && round.state === 'play') spawnEnt(p); return; }
  if (!p.cmd && ((tickNo + p.id) % 8) === 0) spotFrom(p, 80, p.y + eyeH(p));
  if (p.rel > 0) { p.rel -= DT; if (p.rel <= 0) { if (p.mg != null) NESTS[p.mg].belt = 150; else p.ammo = WPN[p.w].mag; } }
}
function goal(b) {
  if (b.mg) return { x: b.hx, z: b.hz };
  if (b.goTo && tickNo < b.goTo.until) return { x: b.goTo.x, z: b.goTo.z };   // an errand (fetching an elite kit)
  if (b.fortNest && !b.fortNest.dead) return { x: b.fortNest.x, z: b.fortNest.z };
  if (b.hold && tickNo < b.hold.until) return { x: b.hold.x + b.ox * .25, z: b.hold.z + b.oz * 2 };   // paratroopers hold where they landed
  if (isBroken(b)) { const own = spawnLine(b.team); if (own) return { x: own.x + b.ox, z: lineZ(own, own.x + b.ox) + b.oz + (b.team === 0 ? 6 : -6), line: own }; }   // broken: fall back to our own line
  if (b.depot != null && DP[b.depot]) { const d = DP[b.depot]; return { x: d.x + b.ox * .14, z: d.z + b.oz }; }   // side-objective raiders / sitters
  if (b.guard != null && OB[b.guard]) { const o = OB[b.guard]; return { x: o.x + b.ox, z: lineZ(o, o.x + b.ox) + (b.team === 0 ? 4 : -4) + b.oz, line: o }; }
  const od = orders[b.team].get(100 + b.squad);
  if (od && !(od.at > tickNo)) { const k = od.ty === 'defend' ? .5 : od.ty === 'move' ? .3 : 1; return { x: od.x + b.ox * k, z: od.z + b.oz * k }; }
  const own = spawnLine(b.team), en = spawnLine(1 - b.team), sq = SQS[b.team][b.squad];
  const o = ((b.squad < 2 || (op && b.team === op.att)) && wave.side === b.team && en && sq && sq.phase === 'push') ? en : own;
  return o ? { x: o.x + b.ox, z: lineZ(o, o.x + b.ox) + b.oz, line: o } : { x: 0, z: b.team === 0 ? HOME_Z : -HOME_Z };
}

// ------------------------------------------------------------------ squad coordination: gather, then push with bounding overwatch
const SQS = [[{ phase: 'defend', t: 0, bound: 0 }, { phase: 'defend', t: 0, bound: 0 }, { phase: 'defend', t: 0, bound: 0 }], [{ phase: 'defend', t: 0, bound: 0 }, { phase: 'defend', t: 0, bound: 0 }, { phase: 'defend', t: 0, bound: 0 }]];
// same placement rules as a player's building (flat undug ground, spacing, no enemies close)
function fortSpotOK(k, x, z, yaw, team) {
  const cs = [[-4, -3.6], [4, -3.6], [-4, 3.6], [4, 3.6], [0, 0]].map(([a, b]) => { const c = Math.cos(yaw), s2 = Math.sin(yaw); return [x + a * c - b * s2, z - a * s2 - b * c]; });
  if (cs.some(([a, b]) => Math.abs(a) > T.W - 5 || Math.abs(b) > T.W - 5)) return null;
  const hs = cs.map(([a, b]) => hAt(terr.H, a, b));
  if (Math.max(...hs) - Math.min(...hs) > 1.0 || cs.some(([a, b]) => Math.abs(hAt(terr.H, a, b) - T.base(a, b)) > .6 || T.roomAt(a, b))) return null;
  if (NESTS.some(n => !n.dead && Math.hypot(n.x - x, n.z - z) < 9) || T.HQS.some(q => Math.hypot(q.x - x, q.z - z) < 10)) return null;
  if ([...T.FORTS.values()].some(q => !T.FORT[q.k].small && Math.hypot(q.x - x, q.z - z) < 12)) return null;
  if (enemiesNear({ x, z, team }, 25).length) return null;
  return { y: Math.min(...hs) };
}
// bot sappers raise a building behind their own line when the team can afford it, then work it up like a player
function botBuildTick() {
  for (const t of [0, 1]) {
    const own = spawnLine(t); if (!own) continue;
    const mine = [...T.FORTS.values()].filter(q => q.team === t && !T.FORT[q.k].small);
    if (mine.length >= 3 || supply[t] < 45 || mine.some(q => q.done < 1)) continue;
    const sap = [...ents.values()].find(e => e.bot && e.alive && e.team === t && e.cls === 'sapper' && !e.tgt && !e.buildF && !e.fortNest && !(e.job && e.job.k === 'dig') && Math.abs(e.z - lineZ(own, e.x)) < 30);
    if (!sap) continue;
    const k = supply[t] >= 90 ? 'blockhouse' : 'redoubt', yaw = faceYaw(t);
    for (let tries = 0; tries < 24; tries++) {   // the ground is cratered: it takes a few tries to find a flat spot
      const x = clamp(sap.x + (rnd() - .5) * 40, -T.W + 20, T.W - 20), z = lineZ(own, x) + (t === 0 ? 1 : -1) * (12 + rnd() * 14), ok = fortSpotOK(k, x, z, yaw, t);
      if (!ok) continue;
      supply[t] -= T.FORT[k].cost;
      const f = { id: fortId++, k, team: t, x, z, yaw, y: ok.y, done: 0, hp: T.FORT[k].hp, by: sap, spawn: 0 };
      T.addFort(f); fortSync(f); sap.buildF = f; break;
    }
  }
}
function botBuildWork(b) {   // returns true while the bot is busy building
  const f = b.buildF; if (!f) return false;
  if (!T.FORTS.has(f.id) || f.done >= 1) { b.buildF = null; return false; }
  if (b.tgt && b.td < 30) return false;                        // fight first
  if (Math.hypot(f.x - b.x, f.z - b.z) > 4.5) { navMove(b, f.x, f.z - (b.team === 0 ? -4 : 4), 3.4); return true; }
  f.done = Math.min(1, f.done + DT / T.FORT[f.k].work); b.crouch = false;
  if (f.done >= 1) {
    fortComplete(f); b.buildF = null;
    if (supply[b.team] >= 5 && rnd() < .6) { supply[b.team] -= 5; f.spawn = 1; const w = T.fortWorld(f); posts.push({ id: postId++, team: b.team, x: w.sp.x, z: w.sp.z, y: f.y, hp: 1e9, by: null, fort: f.id, radio: w.radio }); fortSync(f); }
  } else if (tickNo - (f.lastB || 0) >= 10) fortSync(f);
  return true;
}
function crewForts() {   // a free bot walks to each unmanned MG (trench nests and building MGs) and takes it over
  for (const n of NESTS) {
    if (n.dead || n.occ != null) continue;
    if (n.bot && (!n.bot.alive || n.bot.fortNest !== n)) n.bot = null;
    if (n.bot) continue;
    let best = null, bd = 45;
    for (const e of ents.values()) if (e.bot && e.alive && e.team === n.team && !e.mg && !e.fortNest && !e.kit && !e.para && !e.hold && !e.shelter && e.depot == null && !e.charging) { const d = Math.hypot(e.x - n.x, e.z - n.z) + (e.squad === 2 ? 20 : 0) + (e.cls === 'sapper' || e.cls === 'medic' ? 15 : 0); if (d < bd) { bd = d; best = e; } }   // (not a bot in a shelter, on a raid or charging; flank raiders' squad, sappers and medics last: they have their own jobs)
    if (best) { best.fortNest = n; n.bot = best; best.guard = null; }
  }
}
function leaveFortNest(b) { const n = b.fortNest; if (!n) return; if (n.bot === b) n.bot = null; b.fortNest = null; if (b.mg === true) b.mg = null; b.manned = false; }
function squadTick() {   // once a second
  roomUse = new Map(); for (const e of ents.values()) if (e.shelter && e.shelter.room) roomUse.set(e.shelter.room, (roomUse.get(e.shelter.room) || 0) + 1);
  for (let i = alarms.length - 1; i >= 0; i--) if (alarms[i].until < tickNo) alarms.splice(i, 1);
  crewForts(); if (tickNo % 200 === 0) botBuildTick(); eliteErrands(); nightFlares();
  for (const t of [0, 1]) for (let k = 0; k < (op && t === op.att ? 3 : 2); k++) {
    const sq = SQS[t][k], own = spawnLine(t); sq.t += 1;
    const mem = [...ents.values()].filter(e => e.bot && e.alive && e.team === t && e.squad === k && !e.mg && e.guard == null && !e.hold);
    if (wave.side !== t || orders[t].get(100 + k)) { if (sq.phase !== 'defend') { sq.phase = 'defend'; sq.t = 0; } continue; }
    if (sq.phase === 'defend') { sq.phase = 'gather'; sq.t = 0; }
    if (sq.phase === 'gather' && own) {
      const near = mem.filter(e => Math.abs(e.z - lineZ(own, e.x)) < 14).length;
      if (sq.t >= 14 || (mem.length && near >= mem.length * .6) || wave.t > 20) { sq.phase = 'push'; sq.t = 0; sq.bound = 0; pushSmoke(t, k, mem); }
    } else if (sq.phase === 'push') {
      const all = [...ents.values()].filter(e => e.bot && e.team === t && e.squad === k && !e.mg && e.guard == null).length;
      if (all && mem.length < all * .35 && sq.t > 20) { sq.phase = 'gather'; sq.t = 0; }      // push broken: regroup on our line
      else if (sq.t % 5 === 0) sq.bound ^= 1;   // fire teams swap: one moves, the other covers
    }
  }
}
// going over the top: one man throws smoke ahead to screen the advance (at most every 45 s per squad)
function pushSmoke(t, k, mem) {
  const sq = SQS[t][k]; if ((sq.smokeAt || 0) > tickNo) return; const en = op && op.att === t ? opTarget() : spawnLine(1 - t); if (!en) return;
  const b = mem.find(e => !e.tgt && !e.climb && Math.abs(e.z - lineZ(en, e.x)) > 40); if (!b) return;
  sq.smokeAt = tickNo + 45 * TICK; const dz = Math.sign(lineZ(en, b.x) - b.z), x = b.x + (rnd() - .5) * 6, z = b.z + dz * 24;
  const q = { x, z, r: 5, from: tickNo + Math.round(1.4 * TICK), until: tickNo + 22 * TICK }; smokes.push(q); BSTAT.smokes++;
  bcast({ t: 'gr', f: [+b.x.toFixed(1), +(b.y + 1.5).toFixed(1), +b.z.toFixed(1)], to: [+x.toFixed(1), +z.toFixed(1)], tm: t, u: 'smokenade' });
  bcast({ t: 'smk', l: [[+x.toFixed(1), +z.toFixed(1), 5]], d: 1.4, s: 20 });
}
// what a bot should be doing in its squad right now: 'move' (keep advancing) or 'hold' (fight from cover)
function botRole(b) {
  const sq = b.squad < 2 || (op && b.team === op.att) ? SQS[b.team][b.squad] : null;
  if (sq && sq.phase === 'push') return (b.id & 1) === sq.bound ? 'move' : 'hold';
  return 'hold';
}
// cover: a nearby spot hidden from the target when crouched, ideally visible when standing (so the bot can pop up and shoot)
function findCover(b, e, g) {
  const H = terr.H, ex = e.x, ey = e.y + 1.5, ez = e.z; let best = null, bs = 1e9;
  const here = !T.los(H, ex, ey, ez, b.x, b.y + .9, b.z);
  if (here && T.los(H, ex, ey, ez, b.x, b.y + 1.55, b.z)) return { x: b.x, z: b.z, peek: true };
  for (let k = 0; k < 18; k++) {
    const a = k / 18 * Math.PI * 2 + rnd() * .4, r = 2 + (k % 3) * 3.2, x = b.x + Math.cos(a) * r, z = b.z + Math.sin(a) * r;
    if (!NAV.passable(x, z) || T.wireK(x, z) < 1) continue; const y = hAt(terr.H, x, z);
    if (T.los(H, ex, ey, ez, x, y + .9, z)) continue;
    const peek = T.los(H, ex, ey, ez, x, y + 1.55, z);
    const fwd = g ? (Math.hypot(g.x - b.x, g.z - b.z) - Math.hypot(g.x - x, g.z - z)) : 0;
    const sc = r + (peek ? 0 : 3) - fwd * .4; if (sc < bs) { bs = sc; best = { x, z, peek }; }
  }
  return best || (here ? { x: b.x, z: b.z, peek: false } : null);
}
// walk toward (gx, gz) along the shared distance field: climbs trench walls, goes round buildings and wire
function navMove(b, gx, gz, speed, line) {
  if (b.mph) speed *= MPH_SPD;
  if (b.climb) {
    const c = b.climb; c.t -= DT; const u = 1 - Math.max(0, c.t) / c.T; b.y = c.y0 + (c.y1 - c.y0) * Math.min(1, u * 1.3);
    if (c.t <= 0) { b.x = c.x; b.z = c.z; b.y = c.y1; b.climb = null; } return true;
  }
  const d = Math.hypot(gx - b.x, gz - b.z); if (d < 1) return false;
  let tx = gx, tz = gz;
  let f = null;
  let band = null;
  if (line) { f = NAV.areaField('L' + OB.indexOf(line), line.x - 34, line.z - 13, line.x + 34, line.z + 13, tickNo, (x, z) => Math.abs(z - lineZ(line, x)) < 4); if (f && NAV.at(f, b.x, b.z) < 1) { band = f; f = null; } }   // inside the line: walk to my own spot
  else if (d > 3) f = d < 25 ? NAV.local(gx, gz, b.x, b.z, tickNo) : NAV.field(gx, gz, tickNo);   // v0.27: short trips use a small bounded search
  if (f) {
    const s = NAV.step(f, b.x, b.z);
    if (s) {
      if (s.dh > .62) { const y1 = hAt(terr.H, s.x, s.z); b.climb = { t: .55 + s.dh * .3, T: .55 + s.dh * .3, y0: b.y, y1, x: s.x, z: s.z }; b.yaw = Math.atan2(-(s.x - b.x), -(s.z - b.z)); return true; }
      tx = s.x; tz = s.z;
    }
  }
  let dx = tx - b.x, dz = tz - b.z, l = Math.hypot(dx, dz) || 1; const st = Math.min(l, speed * DT * T.wireK(b.x, b.z));
  if (b.sepV && d > 4) {   // v0.33.3: walking with others close by: veer off a little so the file opens up into a loose line
    const ex = dx / l + b.sepV[0] * 1.3, ez = dz / l + b.sepV[1] * 1.3, el = Math.hypot(ex, ez) || 1, nx = b.x + ex / el * st, nz = b.z + ez / el * st;
    if (Math.abs(hAt(terr.H, nx, nz) - hAt(terr.H, b.x, b.z)) < .5 && !!T.roomAt(nx, nz) === !!T.roomAt(b.x, b.z)) { dx = ex / el * l; dz = ez / el * l; }
  }
  // v0.29: in the line already and the next step towards my own spot would leave it (spot behind a wall, or just outside the band):
  // hold here. Before, the field stepped him back in and the direct step out again, every tick: a man spinning round on the spot.
  if (band && NAV.at(band, b.x + dx / l * Math.max(st, .3), b.z + dz / l * Math.max(st, .3)) >= 1) return false;
  botMove(b, dx / l * st, dz / l * st); b.yaw = Math.atan2(-dx, -dz); b.y = T.groundAt(terr.H, b.x, b.z, b.y + .3);
  return true;
}
// v0.33.3 personal space: bots used to stand inside each other (nothing kept them apart, and whole squads walked the same
// path to nearly the same spot). Each tick a bot steps away from teammates closer than his spacing: wide when holding a line
// or advancing in the open (so the line covers its front, not one spot), close in a dugout shelter, and tighter when his
// squad is gathering for a push or following an officer's order. A step is only taken on level going (never up a trench
// wall or out of a dugout), so the push slides men along the trench rather than over the parapet.
function spacingOf(b) {
  if (b.shelter) return .75;
  const sq = SQS[b.team] && SQS[b.team][b.squad], od = orders[b.team].get(100 + b.squad);
  if ((sq && (sq.phase === 'gather' || sq.phase === 'push')) || (od && !(od.at > tickNo))) return 1.5;
  return 2.6;
}
function botsSpread() {
  for (const b of ents.values()) {
    b.sepV = null; if (!b.bot || !b.alive || b.mg || b.manned || b.climb || b.charging || b.rvTgt || b.inV) continue;
    const R = spacingOf(b); let px = 0, pz = 0, n = 0;
    forNear(b.x, b.z, R, o => { if (o === b || o.team !== b.team || o.mg || o.climb || o.inV) return; const dx = b.x - o.x, dz = b.z - o.z, d = Math.hypot(dx, dz); if (d >= R || Math.abs(o.y - b.y) > 1.5) return;
      const w = (R - d) / R; if (d < .05) { const a = (b.id * 2.399) % 6.283; px += Math.cos(a) * w; pz += Math.sin(a) * w; } else { px += dx / d * w; pz += dz / d * w; } n++; });
    if (!n) continue;
    const l = Math.hypot(px, pz); if (l < 1e-3) continue;
    if (b.moved) { b.sepV = [px / l * Math.min(1, l), pz / l * Math.min(1, l)]; continue; }   // walking: navMove steers off to the side instead (no extra step)
    const st = Math.min(2.2 * DT * Math.min(2, l), .16), g0 = hAt(terr.H, b.x, b.z), r0 = !!T.roomAt(b.x, b.z); let mx = 0, mz = 0, ok = false;
    for (const da of [0, .8, -.8, 1.5, -1.5]) {   // straight away, or slide off at an angle when a wall or a step is in the way
      const a = Math.atan2(pz, px) + da, tx = Math.cos(a) * st, tz = Math.sin(a) * st, nx = b.x + tx, nz = b.z + tz;
      if (Math.abs(hAt(terr.H, nx, nz) - g0) > .5 || Math.abs(nx) > T.W - 3 || Math.abs(nz) > T.W - 3 || !!T.roomAt(nx, nz) !== r0 || T.fortHit(nx, b.y, nz, .3, true)) continue;
      mx = tx; mz = tz; ok = true; break;
    }
    if (!ok) continue;
    botMove(b, mx, mz); b.y = T.groundAt(terr.H, b.x, b.z, b.y + .3); BSTAT.spread = (BSTAT.spread || 0) + 1;
    if (!b.moved) { b.ox = clamp(b.ox + mx, -40, 40); b.oz = clamp(b.oz + mz, -4, 4); }   // standing at his spot: the spot moves with him, so he doesn't walk straight back
  }
}
// grenade landing nearby: get out of the blast
function grenadeNear(b) { for (const g of grenades) { const d = Math.hypot(g.tx - b.x, g.tz - b.z); if (d < 6) return g; } return null; }
function kitTick(b) {   // bots with a med kit go to downed teammates (players first) and patch them up; medics are braver about it
  const medic = b.cls === 'medic', safe = () => medic ? enemiesNear(b, 7).length === 0 : (!b.tgt || b.td > 15) && enemiesNear(b, 10).length === 0;   // medics go in under fire
  let t = b.rvTgt; if (t && !(t.down > 0 && ents.has(t.id))) { if (!t.alive) BSTAT.kitLate = (BSTAT.kitLate || 0) + 1; t = b.rvTgt = null; }
  if (!t) {
    b.kitScan -= DT; if (b.kitScan > 0) return false; b.kitScan = .4 + rnd() * .5;
    let bs = 1e9; const R = medic ? 75 : 45;
    for (const e of ents.values()) if (e.down > 0 && e.team === b.team && e !== b) { const d = Math.hypot(e.x - b.x, e.z - b.z); if (d > R) continue; const sc = d - (e.bot ? 0 : 30) - (e.medCall > tickNo ? 40 : 0); if (sc < bs && ![...ents.values()].some(o => o !== b && o.rvTgt === e)) { bs = sc; t = e; } }
    if (!t || (!medic && rnd() < .2) || !safe() || supply[b.team] < 2) return false;
    b.rvTgt = t; b.rvT = 0; b.shelter = null; BSTAT.kitGo = (BSTAT.kitGo || 0) + 1;
    if (!t.bot) tell(t, nameOf(b) + (medic ? ' (medic)' : '') + ' is coming to you · ' + Math.round(Math.hypot(t.x - b.x, t.z - b.z)) + ' m');
  }
  if (enemiesNear(b, medic ? 6 : 9).length) { BSTAT.kitAbort = (BSTAT.kitAbort || 0) + 1; if (t && !t.bot) tell(t, nameOf(b) + ' was driven back by enemy fire'); b.rvTgt = null; b.kitScan = 3; return false; }
  const dx = t.x - b.x, dz = t.z - b.z, d = Math.hypot(dx, dz);
  if (d > 1.6) {
    const nx = b.x + dx / d * 3.6 * DT, nz = b.z + dz / d * 3.6 * DT, sl = (hAt(terr.H, nx, nz) - b.y) / (3.6 * DT), k = (sl > 0 ? Math.max(.3, 1 - sl * .5) : 1) * T.wireK(b.x, b.z);
    botMove(b, dx / d * 3.6 * DT * k, dz / d * 3.6 * DT * k); b.yaw = Math.atan2(-dx, -dz); b.y = T.groundAt(terr.H, b.x, b.z, b.y); b.rvT = 0;
  } else {
    b.crouch = true; b.yaw = Math.atan2(-dx, -dz); b.rvT += DT * (medic ? 1.35 : 1); if (!t.bot && ((tickNo + b.id) & 3) === 0) send(t, { t: 'rvp', p: Math.min(1, b.rvT / REV_BOT_T), by: nameOf(b) });
    if (b.rvT >= REV_BOT_T) { supply[b.team] -= 2; b.rvTgt = null; b.kitScan = 3; b.crouch = false; reviveEnt(t, b); }
  }
  return true;
}
// ------------------------------------------------------------------ v0.27 smarter bots
const BSTAT = { nades: 0, charges: 0, chargeKills: 0, shelters: 0, revives: 0, smokes: 0, bandages: 0 };   // behaviour counters (balance tooling)
// grenades: into a trench or crater where enemies shelter, at a knot of enemies, or where an enemy was last seen behind cover
function botGrenade(b) {
  if (!(b.gr > 0) || b.mg || b.climb || b.charging || b.para || (b.gCd || 0) > tickNo) return false;
  const live = b.tgt && b.tgt.alive, t = live ? b.tgt : (b.seen && tickNo - b.seen.at < 6 * TICK ? b.seen : null); if (!t) return false;
  const d = Math.hypot(t.x - b.x, t.z - b.z); if (d < 8 || d > 26) return false;
  let foes = 0, own = 0; forNear(t.x, t.z, 8, o => { if (!o.alive || o.cmd) return; const dd = Math.hypot(o.x - t.x, o.z - t.z); if (o.team === b.team) { if (dd < 7.5) own++; } else if (dd < 5) foes++; });
  if (own) return false;
  const dug = T.base(t.x, t.z) - t.y > .9, hidden = !live;
  if (!((dug && (hidden || foes >= 1)) || foes >= 3)) return false;   // men dug in (or out of sight in a hole), or a real knot of them
  if (rnd() < .6) { b.gCd = tickNo + 3 * TICK; return false; }   // not every chance
  const er = .8 + d * .09, tx = t.x + (rnd() - .5) * 2 * er, tz = t.z + (rnd() - .5) * 2 * er;
  const g = { fx: b.x, fy: b.y + 1.5, fz: b.z, tx, tz, t: 1.4, by: b }; grenades.push(g); BSTAT.nades++;
  bcast({ t: 'gr', f: [+g.fx.toFixed(1), +g.fy.toFixed(1), +g.fz.toFixed(1)], to: [+tx.toFixed(1), +tz.toFixed(1)], tm: b.team });
  b.gr--; b.gCd = tickNo + Math.round((18 + rnd() * 12) * TICK); b.yaw = Math.atan2(-(t.x - b.x), -(t.z - b.z)); b.cd = Math.max(b.cd, .9); b.peek = true;
  return true;
}
// bayonet charge: a bot with a bayonet rushes a close enemy (more often when his squad is pushing or the enemy is hurt)
function botChargeStart(b) {
  const e = b.tgt, w = WPN[b.w]; if (!e || !e.alive || !w || !w.bay || b.mg || b.climb || b.charging || b.elite || (b.chgCd || 0) > tickNo || (b.supp || 0) > .5 || isBroken(b)) return;
  if (b.td < 4 || b.td > 15 || Math.abs(e.y - b.y) > 1.2) return;   // same level only: a charge into a trench below just stops at the parapet
  const odds = (botRole(b) === 'move' ? .32 : .14) + (e.hp < maxHp(e) * .5 ? .15 : 0) + (op && op.att === b.team ? .1 : 0) + (b.cls === 'assault' ? .1 : 0);
  if (rnd() > odds) { b.chgCd = tickNo + 2 * TICK; return; }
  b.charging = true; b.chargeTgt = e; b.chargeT = 3.5; b.chgCd = tickNo + 14 * TICK; b.cov = null; b.crouch = false; BSTAT.charges++;
  for (const p of humans) if (p.deployed && Math.abs(p.x - b.x) < 70 && Math.abs(p.z - b.z) < 70) send(p, { t: 'cry', x: +b.x.toFixed(1), z: +b.z.toFixed(1), tm: b.team });
}
function botCharge(b) {   // true while charging (this tick's movement is done)
  if (!b.charging) return false;
  const e = b.chargeTgt; b.chargeT -= DT;   // the man he picked, not whoever the next scan sees
  if (!e || !e.alive || b.chargeT <= 0) { b.charging = false; BSTAT.chargeLost = (BSTAT.chargeLost || 0) + 1; return false; }
  const d = Math.hypot(e.x - b.x, e.z - b.z);
  if (d < 2.5) { b.yaw = Math.atan2(-(e.x - b.x), -(e.z - b.z)); const hit = meleeStrike(b, false); b.charging = false; if (hit) BSTAT.chargeKills += e.alive ? 0 : 1; else BSTAT.chargeMiss = (BSTAT.chargeMiss || 0) + 1; return true; }
  navMove(b, e.x, e.z, 7.6); b.crouch = false; b.moved = true; return true;
}
// shellfire: incoming barrages (known from the officers' call-ins) and shells bursting close drive bots into the nearest dugout
const alarms = [];
function raiseAlarm(x, z, r, secs, team) { alarms.push({ x, z, r, until: tickNo + Math.round(secs * TICK), team }); if (alarms.length > 40) alarms.shift(); }
function shelterFor(b) {
  if (b.mg || b.fortNest || b.buildF || b.para || b.elite || b.rvTgt || b.charging) return null;
  let a = null; for (const q of alarms) if (q.until > tickNo && (q.team == null || q.team === b.team) && Math.abs(q.x - b.x) < q.r && Math.hypot(q.x - b.x, q.z - b.z) < q.r) { a = q; break; }
  if (!a || (b.tgt && b.td < 12) || enemiesNear(b, 40).length) return null;   // enemy close: stand to the parapet instead
  let room = null, rd = 38; for (const r of T.ROOMS) { const d = Math.hypot(r.xc - b.x, (r.z0 + r.z1) / 2 - b.z); if (d < rd && (roomUse.get(r) || 0) < 6) { rd = d; room = r; } }
  return { room, until: a.until + Math.round((1 + rnd() * 2) * TICK) };
}
let roomUse = new Map();
function shelterTick(b) {   // true while sheltering
  const s = b.shelter; if (!s) return false;
  if (tickNo > s.until || (b.tgt && b.td < 8) || ((tickNo + b.id) % 10 === 0 && enemiesNear(b, 30).length)) { b.shelter = null; return false; }   // out when the shelling stops or the enemy is coming
  if (s.room) {
    const r = s.room; let x = r.xc + ((b.id % 5) - 2) * .8, z = (r.fz0 + r.fz1) / 2 + ((b.id % 3) - 1) * .9;
    if (T.roomAt(b.x, b.z) !== r && Math.abs(b.x - r.xc) > 1 && Math.hypot(b.x - r.xc, b.z - r.c) > 1.3) { x = r.xc; z = r.c; }   // line up on the doorway first: cutting the corner catches on the door jamb
    if (Math.hypot(x - b.x, z - b.z) > .8) { b.crouch = false; navMove(b, x, z, 4.6); b.moved = true; } else { b.crouch = true; b.y = T.groundAt(terr.H, b.x, b.z, b.y); }
  } else { b.crouch = true; b.peek = false; }   // no dugout close: hug the ground where he is
  return true;
}
function botTick(b) {
  if (!b.alive) {
    if (b.down > 0) { b.down -= DT; if (b.down <= 0) finishDown(b); return; }   // downed: waiting for a medic
    b.rt -= DT; if (b.rt <= 0 && round.state === 'play') spawnEnt(b); return;
  }
  if (b.manned) return;
  if (b.gun) { VEHM.crewTick(b); return; }   // a field gun / mortar crewman
  if (b.para) { b.y -= 4.5 * DT; const g = T.groundAt(terr.H, b.x, b.z, b.y); if (b.y <= g) { b.y = g; b.para = false; } return; }   // parachuting in
  if (b.kit && !b.mg && kitTick(b)) { b.scan -= DT; return; }
  b.scan -= DT; b.cd -= DT;
  if (b.scan <= 0) {
    b.scan = .3 + rnd() * .3; b.tgt = null; const r0 = b.mg ? 95 : b.w === 'sniper' || b.w === 'atr' ? 130 : b.w === 'hmg' ? 75 : 55; let bd = r0 * 1.3, bs = 1e9;
    forNear(b.x, b.z, bd, e => {   // v0.29: enemies spotted by our side come first (and are engaged a little further out), if there is a clear line of sight
      if (e.team === b.team || !e.alive || e.manned || e.inV) return;
      const d = Math.hypot(e.x - b.x, e.z - b.z), spotted = e.sp[b.team] > tickNo, sc = spotted ? d * .6 : d;
      if (sc < bs && d < r0 * (spotted ? 1.3 : 1) * sightAt(b.team, e.x, e.z) && T.los(terr.H, b.x, b.y + 1.5, b.z, e.x, e.y + (e.crouch ? .85 : 1.2), e.z) && !(smokes.length && smokeBlocks(b.x, b.z, e.x, e.z))) { bs = sc; bd = d; b.tgt = e; }
    });
    b.td = b.tgt ? bd : r0; if (b.tgt) { b.tgt.sp[b.team] = tickNo + TICK * 6; b.seen = { x: b.tgt.x, y: b.tgt.y, z: b.tgt.z, at: tickNo }; }
    if (!b.mg && !b.gun) { if (!botGrenade(b)) botChargeStart(b); if (!b.shelter && alarms.length) { const s = shelterFor(b); if (s) { b.shelter = s; BSTAT.shelters++; } } }
    if (b.gr > 0 && !b.mg && (b.gCd || 0) <= tickNo && VEHM) {   // an enemy tank close by: throw a grenade (a bundle charge for tank hunters) at it
      const tk = VEHM.nearEnemyTank(b, 15);
      if (tk && T.los(terr.H, b.x, b.y + 1.5, b.z, tk.x, tk.y + 1.5, tk.z)) { b.gr--; b.gCd = tickNo + 6 * TICK; const g = { fx: b.x, fy: b.y + 1.5, fz: b.z, tx: tk.x + (rnd() - .5) * 3, tz: tk.z + (rnd() - .5) * 3, t: 1.4, by: b };
        grenades.push(g); bcast({ t: 'gr', f: [+g.fx.toFixed(1), +g.fy.toFixed(1), +g.fz.toFixed(1)], to: [+g.tx.toFixed(1), +g.tz.toFixed(1)], tm: b.team }); }
    }
  }
  if (b.tgt && (!b.tgt.alive || b.tgt.manned)) b.tgt = null;
  if (b.supp > 0) b.supp = Math.max(0, b.supp - DT * .35);
  if (b.tgt && !b.mg && b.td < 2.3 && (b.mcd || 0) <= tickNo && !b.climb) {   // close quarters: stab or club
    b.yaw = Math.atan2(-(b.tgt.x - b.x), -(b.tgt.z - b.z)); if (rnd() < .5) meleeStrike(b, false); else b.mcd = tickNo + Math.round(.8 * TICK); b.cd = Math.max(b.cd, .5);
  }
  if (b.tgt && b.w === 'flame' && !b.mg && !b.climb) {   // flamethrower: close in and burn
    if (b.cd <= 0 && b.td < 13) { const e = b.tgt; b.yaw = Math.atan2(-(e.x - b.x), -(e.z - b.z)); b.cd = .1; b.flash = 3; flameJet(b, b.yaw, Math.atan2(e.y - b.y, b.td)); }
  } else if (b.tgt && b.cd <= 0 && !(b.crouch && b.cov) && !b.climb && !b.charging) {
    const BW = BOT_W[b.mg ? 'lmg' : (b.w || 'bolt')] || BOT_W.bolt; if (!b.mg && b.td > BW[3]) { b.cd = .3; } else {
    b.cd = b.mg ? .4 : BW[0] * (.8 + rnd() * .5); const e = b.tgt;
    const dx = e.x - b.x, dy = e.y + (e.crouch ? .85 : 1.2) - (b.y + 1.5), dz = e.z - b.z, l = Math.hypot(dx, dy, dz) || 1;
    const wk = b.mg ? 'mg' : (b.w || 'bolt'); shots.push([b.x, b.y + 1.5, b.z, dx / l, dy / l, dz / l, Math.min(l, 90), b.id, wk, b.mg ? 420 : (WPN[wk] || WPN.bolt).vel]); b.flash = 3;
    b.yaw = Math.atan2(-dx, -dz);
    // suppressed bots shoot worse; a miss suppresses the target
    const shead = b.w === 'sniper' && !b.mg && rnd() < .14;
    if (rnd() < (b.mg ? .2 * (1 - b.td / 110) : b.w === 'sniper' ? .3 * (1 - b.td / 170) : .2 * (1 - b.td / 60)) * (e.crouch ? .55 : 1) * (e.bot ? 1 : .9) * (b.moved ? .6 : 1) * (1 - .6 * (b.supp || 0)) * (isBroken(b) ? .6 : 1)) damage(e, shead ? 250 : e.bot ? (b.mg ? 25 : BW[1]) : (b.mg ? 10 : BW[2]), b, shead || rnd() < .1);
    else suppress(e, wk, b);
  } }
  if (b.fortNest && (b.fortNest.dead || b.fortNest.occ != null)) leaveFortNest(b);
  if (b.fortNest && !b.mg && Math.hypot(b.fortNest.x - b.x, b.fortNest.z - b.z) < 1.3) { const n = b.fortNest; b.mg = true; b.hx = n.x; b.hz = n.z; b.x = n.x; b.z = n.z; b.yaw = n.yaw; b.cov = null; b.crouch = false; }
  if (b.mg) { b.y = T.groundAt(terr.H, b.x, b.z, b.y); return; }
  if (botCharge(b)) return;
  if (shelterTick(b)) return;
  if (!b.tgt && b.hp < 55 && !b.bandaged && !b.climb) { b.bandT = (b.bandT || 0) + DT; b.crouch = true; if (b.bandT > 2.5) { b.bandaged = true; b.bandT = 0; b.hp = Math.min(maxHp(b), b.hp + 35); BSTAT.bandages++; } return; }   // patch himself up in a quiet moment
  if (botBuildWork(b)) return;
  if ((tickNo + b.id) % 20 === 0) botAbility(b);
  if (!b.tgt && !b.shelter && !b.charging && botJobTick(b)) return;   // v0.34: wire, tunnels
  const g = goal(b), role = botRole(b), eng = b.tgt && b.td < 45;
  b.moved = false;
  if (b.climb) { navMove(b, g.x, g.z, 3.4, g.line); b.crouch = false; return; }
  const gn = grenadeNear(b);
  const gz = gases.length && gases.find(q => q.from <= tickNo && Math.hypot(b.x - q.x, b.z - q.z) < q.r + 2);
  if (gz && !b.mg) { const ax = b.x - gz.x, az = b.z - gz.z, l = Math.hypot(ax, az) || 1; b.cov = null; b.crouch = false; navMove(b, gz.x + ax / l * (gz.r + 6), gz.z + az / l * (gz.r + 6), 4.6); b.moved = true; return; }   // get out of the gas
  if (gn) {   // run from a grenade
    const ax = b.x - gn.tx, az = b.z - gn.tz, l = Math.hypot(ax, az) || 1; b.cov = null; b.crouch = false;
    navMove(b, b.x + ax / l * 8, b.z + az / l * 8, 4.6); b.moved = true; return;
  }
  if (eng && role === 'hold') {
    if (b.cov && b.covTgt !== b.tgt) b.cov = null;
    b.covScan = (b.covScan || 0) - DT;
    if (!b.cov && b.covScan <= 0) { b.covScan = 2 + rnd(); b.cov = findCover(b, b.tgt, g); b.covTgt = b.tgt; }
    if (b.cov && Math.hypot(b.cov.x - b.x, b.cov.z - b.z) > .8) { b.crouch = false; b.moved = navMove(b, b.cov.x, b.cov.z, 4.2); b.peek = false; return; }
    // in cover: duck, then pop up to shoot
    b.cover = !!b.cov; b.peekT = (b.peekT || 0) - DT;
    if (b.peekT <= 0) { b.peek = !b.peek; b.peekT = b.peek ? 1.1 + rnd() * 1.4 : 1 + rnd() * 1.6; }
    if (b.supp > .6 && b.cov) b.peek = false;            // pinned down: stays behind cover until the fire slackens
    b.crouch = b.cov ? !(b.peek && b.cov.peek !== false) : true;   // no cover in reach: kneel and fire
    return;
  }
  b.cover = false; b.crouch = false; if (!eng) { b.tgtLost = (b.tgtLost || 0) + DT; if (b.tgtLost > 4) b.cov = null; } else b.tgtLost = 0;
  const pushing = role === 'move' && SQS[b.team][b.squad] && SQS[b.team][b.squad].phase === 'push';
  b.moved = navMove(b, g.x, g.z, pushing && !eng ? 4.2 : 3.2, g.line);
  if (!b.moved) b.y = T.groundAt(terr.H, b.x, b.z, b.y);
}
function objectivesTick() {
  const cnt = OB.map(() => [0, 0]);
  for (const e of ents.values()) if (e.alive && !e.cmd) OB.forEach((o, i) => { if (nearO(e, o)) cnt[i][e.team]++; });
  OB.forEach((o, i) => {
    const bl = cnt[i][0], rd = cnt[i][1]; if (o.lock > 0) o.lock -= DT;
    if (bl > rd && canCap(i, 0)) o.p = Math.min(1, o.p + DT * .07 * Math.min(3, bl - rd));
    else if (rd > bl && canCap(i, 1)) o.p = Math.max(-1, o.p - DT * .07 * Math.min(3, rd - bl));
    else o.p = clamp(o.p + (o.owner === 0 ? 1 : -1) * DT * .03, -1, 1);
    let to = -1;
    if (o.p >= 1 && o.owner !== 0) to = 0; else if (o.p <= -1 && o.owner !== 1) to = 1;
    if (to >= 0 && op) { o.owner = to; o.p = to === 0 ? 1 : -1; sectorFalls(i); return; }
    if (to >= 0) {
      o.owner = to; const nx = OB[i + (to === 0 ? 1 : -1)]; if (nx && nx.owner === 1 - to) nx.lock = 90;
      for (const e of ents.values()) if (e.team === 1 - to && !e.alive) e.rt = Math.min(e.rt, 1.5);
      teamTell(to, 'Captured ' + o.n + '. The enemy is reinforcing the next line.'); teamTell(1 - to, 'Lost ' + o.n + '! Fall back and counterattack.');
      for (const p of humans) if (p.deployed && p.alive && p.team === to && (p.cmd || nearO(p, o))) { if (!p.cmd) st(p).cap++; addXp(p, p.cmd ? 40 : 60); }
    }
  });
  sT += DT; if (sT > 4) { sT = 0; for (const t of [0, 1]) supply[t] = Math.min(400, supply[t] + 2 + 2 * OB.filter(o => o.owner === t).length); }
  depotsTick(); commandTick();
  if (op) opTick();
  wave.t += DT; if (wave.t > 45) { wave.t = 0; wave.side = op ? op.att : 1 - wave.side; for (const t of [0, 1]) teamTell(t, wave.side === t ? 'Whistles blow. Your wave goes over the top!' : 'Enemy whistles. A wave is coming. Hold the line!'); }
  const w0 = OB.every(o => o.owner === 0), w1 = OB.every(o => o.owner === 1);
  if (!op && (w0 || w1)) endRound(w0 ? 0 : 1);
}

// ------------------------------------------------------------------ side objectives (flank depots)
function depotsTick() {
  for (const [i, d] of DP.entries()) {
    let c0 = 0, c1 = 0; for (const e of ents.values()) if (e.alive && !e.cmd && !e.manned && Math.abs(e.x - d.x) < T.DEP_R && Math.abs(e.z - d.z) < T.DEP_R && Math.hypot(e.x - d.x, e.z - d.z) < T.DEP_R) e.team ? c1++ : c0++;
    const n = c0 - c1;
    if (c0 && c1) { } else if (n) d.p = clamp(d.p + Math.sign(n) * DT * .12 * Math.min(3, Math.abs(n)), -1, 1);
    else if (d.owner >= 0) d.p = clamp(d.p + (d.owner === 0 ? 1 : -1) * DT * .05, -1, 1);
    if (d.p >= 1 && d.owner !== 0) depotTaken(i, 0); else if (d.p <= -1 && d.owner !== 1) depotTaken(i, 1);
    else if (d.owner === 0 && d.p <= 0 || d.owner === 1 && d.p >= 0) { const was = d.owner; d.owner = -1; teamTell(was, d.n + ' has been neutralised. Your officer loses its supplies.'); }
  }
  dT += DT; if (dT >= 4) { dT = 0; for (const t of [0, 1]) cmdPts[t] = Math.min(CP_MAX, cmdPts[t] + 1 + 3 * DP.filter(d => d.owner === t).length); }
  for (let i = posts.length - 1; i >= 0; i--) if (posts[i].rally && posts[i].rally < tickNo) posts.splice(i, 1);   // rally points expire
  for (const a of [smokes, gases, recons]) for (let i = a.length - 1; i >= 0; i--) if (a[i].until < tickNo) a.splice(i, 1);
  if (tickNo % 10 === 0) for (const g of gases) if (g.from <= tickNo) for (const e of ents.values()) if (e.alive && !e.cmd && !e.manned && Math.hypot(e.x - g.x, e.z - g.z) < g.r) { if (e.bot && !e.mask) e.mask = tickNo + Math.round(1.5 * TICK); damage(e, masked(e) ? .3 : 3, g.by, false, [g.x, g.z], 'gas'); }   // 6 hp/s, everyone inside
  if (tickNo % 20 === 0) for (const r of recons) for (const e of ents.values()) if (e.team !== r.team && e.alive && Math.hypot(e.x - r.x, e.z - r.z) < r.r) e.sp[r.team] = tickNo + TICK * 2;
}
function moraleTick() {   // every 0.5 s
  for (const t of [0, 1]) {
    const groups = new Map();
    for (const e of ents.values()) { if (e.team !== t || e.cmd || e.manned) continue; const k = e.bot ? (e.mg ? -1 : 100 + e.squad) : (e.deployed && e.sq >= 0 ? e.sq : -1); if (k < 0) continue; let g = groups.get(k); if (!g) groups.set(k, g = []); g.push(e); }
    for (const [k, g] of groups) {
      const m = sqmOf(t, k), live = g.filter(e => e.alive), sup = live.length ? live.reduce((a, e) => a + (e.supp || 0), 0) / live.length : 0;
      m.cas = m.cas.filter(c => c > tickNo - 10 * TICK); m.alive = live.length; m.n = g.length; m.sup = sup;
      m.hp = live.length ? live.reduce((a, e) => a + e.hp / maxHp(e), 0) / live.length : 0;
      if (live.length) { m.x = live.reduce((a, e) => a + e.x, 0) / live.length; m.z = live.reduce((a, e) => a + e.z, 0) / live.length; }
      m.m = clamp(m.m + (sup < .15 && !m.cas.length ? 1.2 : 0) - sup * 3, 0, 100);
      if (!m.broken && m.m < 25 && k >= 100) { m.broken = true; alert(t, 'brk' + k, 'broken', sqName(k) + ' is breaking and falling back!', m.x, m.z, 20); }
      else if (m.broken && m.m >= 55) { m.broken = false; alert(t, 'rec' + k, 'info', sqName(k) + ' has rallied', m.x, m.z, 20); }
      if (live.length >= 2 && (sup > .45 || m.cas.length >= 2)) alert(t, 'fire' + k, 'fire', sqName(k) + ' under heavy fire' + (m.cas.length >= 2 ? ' (' + m.cas.length + ' casualties)' : ''), m.x, m.z, 20);
    }
  }
}
function moraleHit(e, n) { if (e.cmd) return; const k = e.bot ? (e.mg ? -1 : 100 + e.squad) : (e.sq >= 0 ? e.sq : -1); if (k < 0) return; const m = sqmOf(e.team, k); m.m = clamp(m.m - n, 0, 100); m.cas.push(tickNo); }
function moraleBoost(t, n, x, z, r) { for (const [id, m] of SQM) if (Math.floor(id / 1000) === t && (x == null || (m.x != null && Math.hypot(m.x - x, m.z - z) < r))) { m.m = clamp(m.m + n, 0, 100); if (m.broken && m.m >= 55) m.broken = false; } }
const isBroken = b => b.bot && !b.mg && !b.fortNest && b.squad != null && sqmOf(b.team, 100 + b.squad).broken;
function visTick() {   // every 5 ticks, only for teams with an officer
  for (const t of [0, 1]) {
    if (!officersOf(t).length) { vis[t].clear(); continue; }
    const v = new Set();
    for (const e of ents.values()) {
      if (e.team === t || !e.alive) continue;
      if (e.sp[t] > tickNo || recons.some(r => r.team === t && Math.hypot(e.x - r.x, e.z - r.z) < r.r)) { v.add(e.id); continue; }
      let seen = false; forNear(e.x, e.z, T.VIS_R, f => { if (!seen && f.team === t && !f.cmd && Math.hypot(f.x - e.x, f.z - e.z) < T.VIS_R) seen = true; }); if (seen) v.add(e.id);
    }
    vis[t] = v;
  }
}
function commandTick() {
  if (tickNo % 5 === 0) visTick();
  if (tickNo % 10 === 0) moraleTick();
  for (let i = marks.length - 1; i >= 0; i--) if (marks[i].until < tickNo) marks.splice(i, 1);
  if (tickNo % 20 === 0) for (const t of [0, 1]) {
    for (const d of DP) if (d.owner === t && (t === 0 ? d.p < .92 : d.p > -.92)) alert(t, 'dp' + d.n, 'depot', d.n + ' is being captured by the enemy', d.x, d.z, 25);
    OB.forEach((o, i) => { if (o.owner === t && (t === 0 ? o.p < .9 : o.p > -.9)) alert(t, 'ln' + i, 'line', o.n + ' is under attack', o.x, o.z, 25); });
  }
  if (tickNo % 20 === 0) for (const o of orders[0].size || orders[1].size ? [0, 1] : []) aiOrderTick(o);
}
// AI squads complete orders when their centre reaches the point; queued orders then follow (human squads in orderTick)
function aiOrderTick(team) {
  let changed = false;
  for (const [k, o] of orders[team]) {
    if (k < 100) continue; const m = sqmOf(team, k);
    if (!o.done && m.alive && m.x != null && Math.hypot(m.x - o.x, m.z - o.z) < 15) { o.done = true; o.held = tickNo; changed = true; alert(team, 'done' + k + o.id, 'info', sqName(k) + ' reached ' + o.n, o.x, o.z, 5); }
    if (o.done && o.q && o.q.length) { nextOrder(team, k, o); changed = true; }
  }
  if (changed) sendOrders(team);
}
function nextOrder(team, k, o) { const n = o.q.shift(); orders[team].set(k, { ...n, done: false, by: o.by, id: ordId++, q: o.q }); sendOrderTo({ team, sq: k, _all: true }); }
// spotting for the officer: look at a spot (or an enemy) and mark it for 30 s; strikes on a fresh mark are cheaper and tighter
function reconSpot(p, passive) {   // recon: everything in the sights is spotted for the whole team for 12 s (wider cone at the hip, tighter + longer reach scoped)
  const ey = p.y + eyeH(p), cp = Math.cos(p.pitch), dx = -Math.sin(p.yaw) * cp, dy = Math.sin(p.pitch), dz = -Math.cos(p.yaw) * cp, w = WPN[p.w] || {};
  const cone = passive ? .03 : p.ads && w.scope ? .1 / Math.sqrt(w.scope / 3) : .16, reach = p.ads && w.scope ? 240 : 120; const got = [];
  for (const e of ents.values()) { if (e.team === p.team || !e.alive || e.cmd) continue; const vx = e.x - p.x, vy = e.y + 1.2 - ey, vz = e.z - p.z, l = Math.hypot(vx, vy, vz); if (l > reach || l < 2) continue;
    if (Math.acos(clamp((vx * dx + vy * dy + vz * dz) / l, -1, 1)) < cone && T.los(terr.H, p.x, ey, p.z, e.x, e.y + 1.2, e.z) && !(smokes.length && smokeBlocks(p.x, p.z, e.x, e.z))) {
      const fresh = !(e.sp[p.team] > tickNo + 2 * TICK); e.sp[p.team] = Math.max(e.sp[p.team], tickNo + (passive ? 6 : 12) * TICK); e.spBy = p; if (fresh) got.push(e); } }
  return got;
}
// quick chat: requests and pings for the team (artillery / smoke requests also reach the officer)
const PINGS = { medic: 'Need a medic!', ammo: 'Need ammo!', enemy: 'Enemy spotted!', attack: 'Attack here!', defend: 'Defend here!', arty: 'Requesting artillery!', smoke: 'Requesting smoke!', thanks: 'Thanks!' };
function viewPoint(p, reach) {   // where the player is looking: the ground / structure hit, or null
  const ey = p.y + eyeH(p), cp = Math.cos(p.pitch), dx = -Math.sin(p.yaw) * cp, dy = Math.sin(p.pitch), dz = -Math.cos(p.yaw) * cp;
  for (let t = 2; t < reach; t += 1) { const x = p.x + dx * t, y = ey + dy * t, z = p.z + dz * t; if (y < hAt(terr.H, x, z) || T.fortHit(x, y, z, 0, false)) return { x, z }; }
  return null;
}
function pingAct(p, k) {
  if (!T.own(PINGS, k) || p.cmd || !p.alive || (p.pingAt || 0) > tickNo) return; p.pingAt = tickNo + TICK;
  let x = p.x, z = p.z;
  if (['enemy', 'attack', 'defend', 'arty', 'smoke'].includes(k)) {
    const v = viewPoint(p, 200); if (v) { x = v.x; z = v.z; }
    if (k === 'enemy') { const got = reconSpot(Object.assign(Object.create(p), { cls: 'recon', ads: false, w: p.w }), false); if (got.length) { x = got[0].x; z = got[0].z; } }
  }
  x = clamp(x, -T.W + 3, T.W - 3); z = clamp(z, -T.W + 3, T.W - 3);
  for (const q of humans) if (q.deployed && q.team === p.team) send(q, { t: 'png', k, x: +x.toFixed(1), z: +z.toFixed(1), n: p.name, sq: p.sq, id: p.id });
  if (k === 'arty' || k === 'smoke') alert(p.team, 'req' + p.id, 'req', p.name + (k === 'arty' ? ' requests artillery' : ' requests smoke') + ' at (' + Math.round(x) + ', ' + Math.round(z) + ')', x, z, 6);
  if (k === 'medic') for (const e of ents.values()) if (e.bot && e.kit && e.team === p.team && e.alive && Math.hypot(e.x - p.x, e.z - p.z) < 40 && p.hp < maxHp(p)) { p.hp = Math.min(maxHp(p), p.hp + 30); tell(p, nameOf(e) + ' patched you up (+30 HP)'); break; }
}
function callMedic(p) {   // a downed player shouts for a medic: the nearest free kit-carrier within 90 m comes if he can
  if ((p.medAt || 0) > tickNo) return; p.medAt = tickNo + 3 * TICK; p.medCall = tickNo + 20 * TICK;
  let best = null, bd = 90; for (const e of ents.values()) if (e.bot && e.alive && e.kit && e.team === p.team && !e.mg && !(e.rvTgt && e.rvTgt.down > 0 && e.rvTgt !== p)) { const d = Math.hypot(e.x - p.x, e.z - p.z); if (d < bd) { bd = d; best = e; } }
  for (const q of humans) if (q !== p && q.deployed && q.alive && q.team === p.team && q.cls === 'medic' && Math.hypot(q.x - p.x, q.z - p.z) < 120) send(q, { t: 'png', k: 'medic', x: +p.x.toFixed(1), z: +p.z.toFixed(1), n: p.name, sq: p.sq, id: p.id });
  if (!best) { tell(p, 'No medic within reach. Hold [E] to respawn.'); return; }
  best.rvTgt = p; best.rvT = 0; best.kitScan = 0; best.shelter = null; tell(p, nameOf(best) + ' heard you · ' + Math.round(bd) + ' m');
}
// gas masks: 1.5 s to put on; on = gas does 10% damage, no aiming down sights
const masked = e => !!e.mask && tickNo >= e.mask;
function maskAct(p) {
  if (!p.alive || p.cmd) return;
  if (p.mask) { p.mask = 0; send(p, { t: 'mask', on: 0 }); } else { p.mask = tickNo + Math.round(1.5 * TICK); send(p, { t: 'mask', on: 1, d: 1.5 }); }
}
function throwUtil(p) {   // smoke or gas grenade (utility slot, 2 per life, on the bandage key)
  if (p.mg != null || !p.alive) return; if (!(p.bd > 0)) { tell(p, 'None left'); return; } if ((p.gCd || 0) > tickNo) return;
  p.bd--; p.gCd = tickNo + TICK;
  const cp = Math.cos(p.pitch), dx = -Math.sin(p.yaw) * cp, dy = Math.sin(p.pitch), dz = -Math.cos(p.yaw) * cp, ey = p.y + eyeH(p); let t = 2;
  for (; t < 24; t += .5) if (ey + dy * t < hAt(terr.H, p.x + dx * t, p.z + dz * t)) break;
  const x = p.x + dx * t, z = p.z + dz * t, gas = p.u === 'gasnade';
  bcast({ t: 'gr', f: [+p.x.toFixed(1), +ey.toFixed(1), +p.z.toFixed(1)], to: [+x.toFixed(1), +z.toFixed(1)], tm: p.team, u: gas ? 'gas' : 'smoke' });
  later(1400, () => {
    if (gas) { gases.push({ x, z, r: 5.5, from: tickNo, until: tickNo + 12 * TICK, by: p }); bcast({ t: 'gas', x: +x.toFixed(1), z: +z.toFixed(1), r: 5.5, d: 0, s: 12 }); }
    else { smokes.push({ x, z, r: 5, from: tickNo, until: tickNo + 20 * TICK }); bcast({ t: 'smk', l: [[+x.toFixed(1), +z.toFixed(1), 5]], d: 0, s: 20 }); }
  });
}
function markAct(p) {
  if (p.cls === 'recon' && !p.cmd && p.mg == null && (p.spotCd || 0) <= tickNo) {
    p.spotCd = tickNo + 3 * TICK; const got = reconSpot(p, false);
    if (got.length) { st(p).spot += got.length; tell(p, 'Spotted ' + got.length + ' enem' + (got.length > 1 ? 'ies' : 'y')); send(p, { t: 'spt', n: got.length }); addXp(p, Math.min(6, got.length * 2));
      if ((p.markCd || 0) <= tickNo) { const c = got.reduce((a, e) => ({ x: a.x + e.x / got.length, z: a.z + e.z / got.length }), { x: 0, z: 0 }); markAt(p, c.x, c.z, true); p.markCd = tickNo + 8 * TICK; }
      return; }
  }
  // v0.29 spotting for everyone: every 0.4 s, up to five enemies near the crosshair (a little aim assist when nothing is dead centre)
  // are spotted for the whole side for 10 s. Only a press that spots nobody marks a ground target, and the officer hears about
  // spotted enemies at most every 8 s.
  if (p.cmd || p.mg != null || (p.spotCd || 0) > tickNo) return; p.spotCd = tickNo + Math.round(.4 * TICK);
  const ey = p.y + eyeH(p), cp = Math.cos(p.pitch), dx = -Math.sin(p.yaw) * cp, dy = Math.sin(p.pitch), dz = -Math.cos(p.yaw) * cp;
  const hits = [];
  for (const e of ents.values()) { if (e.team === p.team || !e.alive || e.cmd || e.inV) continue; const vx = e.x - p.x, vy = e.y + 1.2 - ey, vz = e.z - p.z, l = Math.hypot(vx, vy, vz); if (l > 160 || l < 2) continue;
    const ang = Math.acos(clamp((vx * dx + vy * dy + vz * dz) / l, -1, 1)); if (ang < .16) hits.push([ang, e]); }
  hits.sort((a, b) => a[0] - b[0]); const got = []; let fresh = 0;
  for (const [ang, e] of hits) { if (got.length >= 5 || (got.length && ang > .12)) break; if (!T.los(terr.H, p.x, ey, p.z, e.x, e.y + 1.2, e.z) || (smokes.length && smokeBlocks(p.x, p.z, e.x, e.z))) continue;
    if (!(e.sp[p.team] > tickNo + 2 * TICK)) fresh++; e.sp[p.team] = Math.max(e.sp[p.team] || 0, tickNo + 10 * TICK); e.spBy = p; got.push(e); }
  if (got.length) {
    if (fresh) { st(p).spot += fresh; send(p, { t: 'spt', n: fresh }); addXp(p, Math.min(3, fresh)); }
    if ((p.markCd || 0) <= tickNo) { p.markCd = tickNo + 8 * TICK; markAt(p, got[0].x, got[0].z, true); }
    return;
  }
  if ((p.markCd || 0) > tickNo) return; p.markCd = tickNo + 8 * TICK;
  let t = 2; for (; t < 160; t += 1) { const y = ey + dy * t; if (y < hAt(terr.H, p.x + dx * t, p.z + dz * t) || T.fortHit(p.x + dx * t, y, p.z + dz * t, 0, false)) break; }
  if (t >= 160) { tell(p, 'Nothing to mark there'); p.markCd = tickNo + TICK; return; }
  markAt(p, p.x + dx * t, p.z + dz * t, false);
}
function markAt(p, x, z, isEnemy) {
  const tgt = isEnemy;
  x = clamp(x, -T.W + 5, T.W - 5); z = clamp(z, -T.W + 5, T.W - 5);
  const mk = { id: markId++, team: p.team, x, z, until: tickNo + 30 * TICK, by: p, name: p.name }; marks.push(mk); while (marks.filter(q => q.team === p.team).length > 6) marks.splice(marks.findIndex(q => q.team === p.team), 1);
  for (const q of humans) if (q.deployed && q.team === p.team) send(q, { t: 'mk', id: mk.id, x: +x.toFixed(1), z: +z.toFixed(1), s: 30, n: p.name, e: tgt ? 1 : 0 });
  tell(p, (tgt ? 'Enemy' : 'Target') + ' marked for the officer'); alert(p.team, 'mk' + mk.id, 'mark', p.name + ' marked ' + (tgt ? 'an enemy' : 'a target') + ' - strikes there cost 30% less', x, z, 1);
}
function depotTaken(i, t) {
  const d = DP[i]; d.owner = t; d.p = t === 0 ? 1 : -1; cmdPts[t] = Math.min(CP_MAX, cmdPts[t] + 10);
  teamTell(t, 'Captured ' + d.n + ' (side objective). Your officer gains command points.'); teamTell(1 - t, 'The enemy took ' + d.n + '. Their officer gains command points.');
  for (const p of humans) if (p.deployed && p.alive && !p.cmd && p.team === t && Math.hypot(p.x - d.x, p.z - d.z) < T.DEP_R + 3) { st(p).cap++; addXp(p, 30); }
  for (const p of humans) if (p.deployed && p.cmd && p.team === t) addXp(p, 10);
  moraleBoost(t, 15); alert(1 - t, 'dpl' + i, 'depot', 'Lost ' + d.n + ' to the enemy', d.x, d.z, 10); alert(t, 'dpc' + i, 'info', 'Captured ' + d.n, d.x, d.z, 10);
}
// smoke blocks sight (2D: a segment passing through a cloud), used by bot targeting and spotting
function smokeBlocks(ax, az, bx, bz) {
  for (const s of smokes) { if (s.from > tickNo) continue; const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1, u = clamp(((s.x - ax) * dx + (s.z - az) * dz) / L2, 0, 1);
    if (Math.hypot(ax + dx * u - s.x, az + dz * u - s.z) < s.r) return true; }
  return false;
}
// bots that go for the side objectives: up to 3 per depot the team doesn't hold, 1 to sit on each one it does (from the garrison squad)
function assignRaiders() {
  for (const t of [0, 1]) {
    const bots = [...ents.values()].filter(e => e.bot && !e.mg && e.team === t), want = DP.map(d => d.owner === t ? 1 : 3);
    for (const b of bots) if (b.depot != null && (b.guard != null || b.hold || b.fortNest)) b.depot = null;
    let total = bots.filter(b => b.depot != null).length;
    for (const [i, d] of DP.entries()) {
      const mine = bots.filter(b => b.depot === i); for (let k = want[i]; k < mine.length; k++) { mine[k].depot = null; total--; }
      let have = Math.min(mine.length, want[i]);
      const free = bots.filter(b => b.depot == null && b.guard == null && !b.kit && !b.hold && !b.fortNest && !b.buildF && b.squad === 2).sort((a, c) => Math.hypot(a.x - d.x, a.z - d.z) - Math.hypot(c.x - d.x, c.z - d.z));
      for (const b of free) { if (have >= want[i] || total >= RAID_MAX) break; b.depot = i; have++; total++; }
    }
  }
}

// ------------------------------------------------------------------ Operations flow
function opMsg(k, extra) { bcast({ t: 'opn', k, att: op.att, sector: op.sector, ...extra }); }
function sectorFalls(i) {
  const o = OB[i], att = op.att, def = op.def;
  for (const p of humans) if (p.deployed && p.alive && p.team === att && (p.cmd || nearO(p, o))) { if (!p.cmd) st(p).cap++; addXp(p, p.cmd ? 40 : 60); }
  op.sector++;
  if (op.sector >= OPS.nsec) { opMsg('won', { n: o.n }); endRound(att); return; }
  op.tk = op.tkMax; op.stall = 0;
  const nxt = opTarget(), sd = attSide(att), lost = (x, z) => (z - lineZ(nxt, x)) * sd > 6;   // ground now behind the attackers' line
  nxt.lock = 40;   // v0.27: the defenders get 40 s to man the next line before it can be taken (lines used to fall within half a minute of each other)
  for (const q of posts.slice()) if (q.team === def && !q.fort && lost(q.x, q.z)) posts = posts.filter(r => r !== q);
  for (const f of [...T.FORTS.values()]) if (f.team === def && lost(f.x, f.z)) removeFort(f);      // demolished as the defenders fall back
  VEHM.groundLost(def, lost); eliteStock(0, true); eliteStock(1, true);
  for (const e of ents.values()) if (e.team === att && !e.alive) e.rt = Math.min(e.rt, 2);
  for (const p of humans) if (p.team === def && p.alive && !p.cmd && lost(p.x, p.z)) { p.oob = tickNo + OPS.oobGrace * TICK; send(p, { t: 'oob', s: OPS.oobGrace }); }
  opMsg('fall', { n: o.n, next: nxt.n });
}
function attackStalls() { op.stall = tickNo; opMsg('stall', {}); }
function battalionLost() {
  op.bat++; op.stall = 0;
  if (op.bat >= OPS.nbat) { opMsg('lost', {}); endRound(op.def); return; }
  op.regroup = OPS.regroup; op.tk = 0; opMsg('bat', { left: OPS.nbat - op.bat, s: OPS.regroup });
}
function heavyBarrage() {   // the comeback: a fresh battalion arrives behind a rolling barrage on the defended line
  const o = opTarget(); if (!o) return; const by = null; raiseAlarm(o.x, lineZ(o, o.x), 75, 13, op.def);
  for (let k = 0; k < 14; k++) later(1500 + k * 700, () => { if (round.state === 'play') { const ex = o.x + (rnd() - .5) * 120; explode(ex, lineZ(o, ex) + (rnd() - .5) * 10, by); } });
}
function opTick() {
  if (op.regroup > 0) {
    op.regroup -= DT;
    if (op.regroup <= 0) { op.regroup = 0; op.tk = op.tkMax; supply[op.att] += 150; heavyBarrage(); VEHM.spawnTank(op.att, 'with the fresh battalion'); opMsg('fresh', { left: OPS.nbat - op.bat }); for (const e of ents.values()) if (e.team === op.att && !e.alive) { e.rt = Math.min(e.rt, 1); e.died = false; } for (const p of humans) if (p.team === op.att && !p.alive) p.died = false; }   // the new battalion arrives free
    return;
  }
  if (op.tk <= 0 && !op.stall) attackStalls();
  if (op.stall) {   // out of tickets: the push dies with its last attackers, or after 30 s
    const alive = [...ents.values()].some(e => e.team === op.att && e.alive && !e.cmd && !e.manned) || [...humans].some(p => p.team === op.att && p.alive && !p.cmd);
    if (!alive || tickNo - op.stall > OPS.stallMax * TICK) battalionLost();
  }
  for (const p of humans) if (p.oob && p.alive) {   // defenders left behind in a fallen sector
    const nxt = opTarget(); if (nxt && (p.z - lineZ(nxt, p.x)) * attSide(op.att) <= 6) { p.oob = 0; send(p, { t: 'oob', s: 0 }); continue; }
    if (tickNo >= p.oob) { p.oob = 0; p.hp = 0; killEnt(p, null); send(p, { t: 'dead', by: 'staying behind in a fallen sector' }); }
  }
}
function scoreRows(t, me) {
  const sc = e => { const s = st(e); return s.sc + (e.bot ? s.k * 10 + s.a * 3 : 0); };
  const hum = [...humans].filter(p => p.deployed && p.team === t), bots = [...ents.values()].filter(e => e.bot && !e.mg && e.team === t && e.st && (e.st.k || e.st.d));
  const row = e => { const s = st(e); return [nameOf(e), e.bot ? -1 : T.rankOf(e.xp || 0), e.cmd ? 'Officer' : e.bot ? 'AI ' + (AI_SQ[e.squad] || '') : e.sq >= 0 ? T.SQUADS[e.sq] : '-', e.cls, s.k, s.d, s.a, sc(e), e.bot ? 1 : 0, e === me ? 1 : 0, e.alive ? 1 : 0, e.bot ? -1 : e.ping == null ? -1 : e.ping]; };   // [11] ping in ms (humans)
  const L = hum.concat(bots.sort((a, b) => sc(b) - sc(a)).slice(0, Math.max(0, 24 - hum.length))).sort((a, b) => sc(b) - sc(a)).map(row);
  const all = [...ents.values()].filter(e => e.team === t && e.st);
  return { l: L.slice(0, 40), k: all.reduce((a, e) => a + e.st.k, 0), d: all.reduce((a, e) => a + e.st.d, 0), n: hum.length, ai: [...ents.values()].filter(e => e.bot && e.team === t).length };
}
function report(win) {   // after-action report
  const people = [...ents.values()].filter(e => e.st && !e.mg), sc = e => e.st.sc + (e.bot ? e.st.k * 10 + e.st.a * 3 : 0);
  const pick = (f, filt) => { let b = null; for (const e of people) if (!filt || filt(e)) if (!b || f(e) > f(b)) b = e; return b && f(b) > 0 ? b : null; };
  const card = (title, e, what) => e ? [title, nameOf(e), e.team, what] : null;
  const mvp = pick(sc), killer = pick(e => e.st.k), medic = pick(e => e.st.rev, e => !e.bot), spotter = pick(e => e.st.spot, e => !e.bot), cap = pick(e => e.st.cap, e => !e.bot), sniper = pick(e => e.st.hs);
  const squads = new Map(); for (const e of people) { if (e.cmd) continue; const key = e.team + ':' + (e.bot ? 'AI ' + AI_SQ[e.squad] : e.sq >= 0 ? T.SQUADS[e.sq] : ''); if (key.endsWith(':')) continue; squads.set(key, (squads.get(key) || 0) + sc(e)); }
  const bs = [...squads].sort((a, b) => b[1] - a[1])[0];
  const offs = [...humans].filter(p => p.cmd && p.st).map(p => [p.name, p.team, p.st.ci, p.st.k, p.st.ord]);
  return { mvp: card('MVP', mvp, mvp && sc(mvp) + ' points'), cards: [card('Most kills', killer, killer && killer.st.k + ' kills'), card('Sharpshooter', sniper, sniper && sniper.st.hs + ' headshots'), card('Lifesaver', medic, medic && medic.st.rev + ' revives'), card('Eyes', spotter, spotter && spotter.st.spot + ' spotted'), card('Objective', cap, cap && cap.st.cap + ' captures')].filter(Boolean),
    squad: bs ? [bs[0].split(':')[1], +bs[0].split(':')[0], bs[1]] : null, officers: offs, teams: [0, 1].map(t => scoreRows(t, null)), op: op ? [op.att, op.sector, OPS.nsec, op.bat] : null };
}
function endRound(win) {
  round = { state: 'ended', t: 15, win }; const rep = report(win); prepareNextMap();
  for (const p of humans) if (p.ws && p.ws.open) send(p, { t: 'end', win, rep, me: p.st ? [p.st.k, p.st.d, p.st.a, p.st.sc, p.st.rev, p.st.cap, p.st.spot, p.st.ord] : null });
  for (const p of humans) if (p.deployed && p.team === win) addXp(p, 100);
}
// v0.30: the next round's map. The heightmap (about a second of work) is built in a worker thread while the end screen shows.
function prepareNextMap() {
  const seed = mapPick(); nextMap = { seed, H: null, F: null, used: seed };
  if (seed === mapSeed) return;   // same layout again (classic or a fixed seed): nothing to build
  let W; try { W = new (require('worker_threads').Worker)(path.join(__dirname, 'mapworker.js'), { workerData: { seed } }); } catch (e) { return; }
  const job = nextMap; W.on('message', r => { if (nextMap === job && r && r.seed != null) Object.assign(job, { used: r.seed, H: r.H, F: r.F }); }); W.on('error', e => console.error('map worker:', e.message)); W.unref();
}
function switchMap() {
  const job = nextMap || { seed: mapPick(), H: null }; nextMap = null;
  if (job.seed === mapSeed && !job.H) { terr = T.makeTerrain(); return false; }
  const t0 = Date.now(); mapSeed = T.setMap(job.seed);
  if (!(job.H && job.used === mapSeed && T.adoptTerrain(job.H, job.F))) console.log('[map] worker not ready: generating here');
  terr = T.makeTerrain();
  OB.forEach((o, i) => { o.x = T.OBJ[i].x; o.z = T.OBJ[i].z; });
  DP.forEach((d, i) => Object.assign(d, { n: T.DEPOTS[i].n, x: T.DEPOTS[i].x, z: T.DEPOTS[i].z }));
  console.log('[map] round map ' + mapSeed + ' (' + (Date.now() - t0) + ' ms)'); return true;
}
function resetRound() {
  const changed = switchMap(); T.resetBays();
  for (let i = 0; i < BASE_NESTS; i++) Object.assign(NESTS[i], T.NEST[i], { dead: false, bot: null, occ: null, hp: 100, fix: 0, fixAt: 0 });
  phoneCut.clear(); tunReset(); planes.length = 0; AAS.length = 0; T.AA.forEach(a => AAS.push({ ...a, dead: false, hp: 100, fix: 0, fixAt: 0 }));   // (every round, same map or not)
   craters = []; grenades.length = 0; posts = []; aboxes = [];
  for (const p of humans) if (p.mg != null && NESTS[p.mg].fort) dismount(p, true);
  T.clearForts(); NESTS.length = BASE_NESTS; bcast({ t: 'fo', f: [] }); NAV.rebuild(); if (changed) NAV.clear();   // (routes cached on the old map would mislead bots for seconds)
  OB.forEach((o, i) => { o.owner = i < 3 ? 0 : 1; o.p = i < 3 ? 1 : -1; o.lock = 0; });
  supply = [12, 12]; op = newOp(op ? op.def : 0); wave = { side: op.att, t: 0 };
  orders[0].clear(); orders[1].clear(); crates.length = 0; sched = []; supCd = [supZero(), supZero()]; for (const e of ents.values()) { e.st = null; e.elite = null; if (e.w0) { e.w = e.w0; e.w0 = null; } e.burn = 0; e.goTo = null; } for (const p of humans) p.st = null;
  VEHM.reset(); ekits.length = 0; fires.length = 0; flares.length = 0; alarms.length = 0; setWx(pickWx()); roundStartExtras(); cmdPts = [CP_START, CP_START]; smokes.length = 0; gases.length = 0; recons.length = 0; marks.length = 0; SQM.clear(); alertAt.clear(); vis[0].clear(); vis[1].clear(); for (const d of DP) { d.owner = -1; d.p = 0; } for (const e of ents.values()) e.depot = null;
  for (const p of humans) if (p.mg != null) dismount(p, true);
  for (const n of NESTS) { n.belt = 150; n.heat = 0; n.over = false; n.occ = null; if (n.bot) leaveFortNest(n.bot); }
  for (const e of ents.values()) { e.died = false; e.oob = 0; e.alive = false; e.down = 0; e.rt = .5 + rnd(); e.placed = false; e.para = false; e.hold = null; e.climb = null; e.cov = null; e.supp = 0; e.chg = T.chgMax(e); e.charging = false; }
  bullets.length = 0;
  round = { state: 'play', t: 0, win: -1 };
  if (!changed) bcast({ t: 'reset', map: mapSeed });
  else for (const p of humans) if (p.ws && p.ws.open) send(p, { t: 'reset', map: mapSeed, rj: rejoinTicket(p) });   // players reload onto the new map and come back to their side
}
// v0.30 rejoin tickets: a player whose client reloads for a new map keeps his side and squad (the server never trusts a team claim)
const rejoins = new Map();
function rejoinTicket(p) {
  const now = Date.now(); for (const [k, r] of rejoins) if (r.until < now) rejoins.delete(k);
  const k = crypto.randomBytes(12).toString('hex'); rejoins.set(k, { name: p.name.toLowerCase(), team: p.team, sq: p.sq, until: now + 120000 }); return k;
}
const GUARDS_PER = 2, GUARDS_MAX = 6;
function assignGuards() {
  for (const t of [0, 1]) {
    if (op && t === op.att) { for (const e of ents.values()) if (e.bot && e.team === t) e.guard = null; continue; }
    const owned = OB.map((o, i) => i).filter(i => OB[i].owner === t).sort((a, b) => t === 0 ? a - b : b - a).slice(0, GUARDS_MAX / GUARDS_PER);   // nearest the front first
    const bots = [...ents.values()].filter(e => e.bot && !e.mg && e.team === t);
    for (const b of bots) if (b.guard != null && !owned.includes(b.guard)) b.guard = null;
    for (const i of owned) {
      let have = bots.filter(b => b.guard === i).length;
      for (const b of bots) { if (have >= GUARDS_PER) break; if (b.guard == null && !b.kit && !b.hold) { b.guard = i; have++; } }
    }
  }
}
function fillBots() {
  for (const t of [0, 1]) {
    const hum = [...humans].filter(p => p.team === t && p.deployed && !p.cmd).length, want = Math.max(0, FILL - hum);
    const mine = [...ents.values()].filter(e => e.bot && !e.mg && e.team === t);
    if (mine.length < want) for (let i = mine.length; i < want; i++) addBot(t);
    else if (mine.length > want) { mine.sort((a, b) => a.alive - b.alive); for (let i = 0; i < mine.length - want; i++) { mine[i].alive = false; ents.delete(mine[i].id); } }
  }
  assignGuards(); assignRaiders();
}



// ------------------------------------------------------------------ v0.26 elite kits (Operations pickups)
// Each side gets crates at its staging area: attackers a flamethrower and a sentry, defenders a tank hunter and a sentry.
// [F] at a crate makes you that elite until you die; a new crate arrives a minute after the kit is lost. Bots fetch
// crates nobody has claimed for 25 s.
const ekits = []; let ekId = 1;
const eliteMsg = () => ({ t: 'ek', l: ekits.map(c => [c.id, c.k, c.team, +c.x.toFixed(1), +c.z.toFixed(1)]) });
const eliteOut = (t, k) => [...ents.values()].some(e => e.team === t && e.elite === k && (e.alive || e.down > 0));
const eliteKits = t => op ? (op.att === t ? ['flame', 'hmg'] : ['atr', 'hmg']) : ['flame', 'atr', 'hmg'];
function eliteStock(t, quiet) {   // a crate for every kit this side is entitled to and doesn't already have in the field
  const ks = eliteKits(t), added = [];
  for (let i = ekits.length - 1; i >= 0; i--) if (ekits[i].team === t && !ks.includes(ekits[i].k)) ekits.splice(i, 1);
  ks.forEach((k, i) => {
    if (eliteOut(t, k)) return; const x = (i ? 11 : -11) + (t ? 2 : -2), z = homeZ(t, x) + (t === 0 ? 2.5 : -2.5);
    const c = ekits.find(q => q.team === t && q.k === k); if (c) { c.x = x; c.z = z; } else { ekits.push({ id: ekId++, k, team: t, x, z, at: tickNo }); added.push(T.ELITE[k].n.toLowerCase()); }
  });
  bcast(eliteMsg());
  if (added.length && !quiet) tellTeam(t, 'Elite kit' + (added.length > 1 ? 's' : '') + ' at your staging area: ' + added.join(' and ') + '. [F] at the crate to take one.');
}
function giveElite(e, k) {
  const E = T.ELITE[k]; if (!e.elite) e.w0 = e.w; e.elite = k; e.w = E.w; e.hp = E.hp; e.ammo = WPN[E.w].mag; e.rel = 0; e.cd = .4; if (k === 'atr') e.gr = 3;
  if (!e.bot) { send(e, { t: 'elite', k, hp: e.hp, w: e.w }); tell(e, 'You are the ' + E.n.toUpperCase() + ': ' + E.d + '.'); }
  tellTeam(1 - e.team, 'Enemy elite on the field: a ' + E.n.toLowerCase() + '!'); tellTeam(e.team, nameOf(e) + ' took the ' + E.n.toLowerCase() + ' kit');
  alert(1 - e.team, 'elite' + k, 'enemy', 'Enemy ' + E.n.toLowerCase() + ' sighted', e.x, e.z, 20);
}
function takeElite(p) {
  if (p.cmd || p.mg != null || p.elite) return false;
  const c = ekits.find(q => q.team === p.team && Math.hypot(q.x - p.x, q.z - p.z) < 2.6); if (!c || eliteOut(p.team, c.k)) return false;
  ekits.splice(ekits.indexOf(c), 1); giveElite(p, c.k); bcast(eliteMsg()); return true;
}
function eliteLost(e) {   // the kit dies with its carrier; a new crate reaches the staging area a minute later
  const t = e.team; e.elite = null; if (e.w0) e.w = e.w0; e.w0 = null;
  later(60000, () => { if (round.state === 'play') eliteStock(t); });
}
function eliteErrands() {   // once a second: a bot fetches a crate nobody has claimed for 25 s (unless a player is close to it)
  for (const c of ekits.slice()) {
    if (tickNo - c.at < 25 * TICK) continue;
    if ([...humans].some(p => p.deployed && p.alive && !p.cmd && p.team === c.team && Math.hypot(p.x - c.x, p.z - c.z) < 30)) continue;
    let b = c.bot && c.bot.alive && !c.bot.elite && ents.has(c.bot.id) ? c.bot : null;
    if (!b) { let bd = 90; for (const e of ents.values()) if (e.bot && e.alive && !e.mg && !e.elite && !e.para && !e.kit && e.team === c.team && e.guard == null && !e.buildF) { const d = Math.hypot(e.x - c.x, e.z - c.z); if (d < bd) { bd = d; b = e; } } c.bot = b; }
    if (!b) continue;
    if (Math.hypot(b.x - c.x, b.z - c.z) < 2.6) { ekits.splice(ekits.indexOf(c), 1); b.goTo = null; giveElite(b, c.k); bcast(eliteMsg()); }
    else b.goTo = { x: c.x, z: c.z, until: tickNo + 5 * TICK };
  }
}
// flamethrower: a 14 m jet; men in it burn (and keep burning 3 s), the ground where it lands burns for a while
const fires = [];
function flameJet(p, yw, pt) {
  const fx = -Math.sin(yw), fz = -Math.cos(yw), ey = p.y + eyeH(p) - .25, H = terr.H; let reach = 14;
  for (let d = 1; d <= 14; d++) { const x = p.x + fx * d, z = p.z + fz * d, y = ey + Math.sin(pt) * d - .025 * d * d; if (y < hAt(H, x, z) || T.fortHit(x, y, z, 0, false) || T.sbHit(H, x, y, z) || T.inRoof(x, y, z)) { reach = d; break; } }
  forNear(p.x, p.z, reach + 1, e => {
    if (e === p || !e.alive || e.cmd || e.team === p.team) return;
    const dx = e.x - p.x, dz = e.z - p.z, d = Math.hypot(dx, dz); if (d > reach + .6 || (d > 1.2 && (dx * fx + dz * fz) / d < .88)) return;
    if (!T.los(H, p.x, ey, p.z, e.x, e.y + 1, e.z)) return;
    damage(e, WPN.flame.dmg * (d < 6 ? 1.5 : 1), p, false, null, 'flame'); e.burn = tickNo + 3 * TICK; e.burnBy = p;
  });
  if ((p.fireT || 0) <= tickNo) {
    p.fireT = tickNo + 6; const k = Math.min(reach, 12), x = p.x + fx * k, z = p.z + fz * k, s = T.WX.k === 'rain' ? 5 : 9;
    if (fires.length < 60) { fires.push({ x, z, r: 2.2, until: tickNo + s * TICK, by: p, team: p.team }); bcast({ t: 'fi', x: +x.toFixed(1), z: +z.toFixed(1), r: 2.2, s }); }
  }
  if (VEHM) for (const v of VEHM.V) if (!v.dead && v.team !== p.team && v.k === 'tank' && VEHM.inTank(v, p.x + fx * Math.min(reach, 6), v.y + 1, p.z + fz * Math.min(reach, 6), 2)) VEHM.hurt(v, 2, p, 'flame');
}
function firesTick() {   // every 0.5 s: ground fires light men up, burning men take 8 hp/s
  if (tickNo % 10) return;
  for (let i = fires.length - 1; i >= 0; i--) if (fires[i].until < tickNo) fires.splice(i, 1);
  for (const f of fires) forNear(f.x, f.z, f.r + 1, e => { if (!e.alive || e.cmd || e.elite === 'flame' || Math.hypot(e.x - f.x, e.z - f.z) > f.r) return; e.burn = Math.max(e.burn || 0, tickNo + 2 * TICK); if (!e.burnBy || e.burnBy.team === e.team) e.burnBy = f.by; });
  for (const e of ents.values()) if (e.burn > tickNo && e.alive && !e.inV) damage(e, 4, e.burnBy && e.burnBy.team !== e.team ? e.burnBy : null, false, null, 'fire');
}
// ------------------------------------------------------------------ v0.26 weather and night
// Each round rolls overcast, fog, rain or night (T128_WX forces one). Fog and night shorten how far bots see and spot;
// a flare (flare pistol utility, star shells, bots at night) restores full sight within 55 m and reveals who is under it.
const WX_P = [['overcast', .34], ['fog', .24], ['rain', .24], ['night', .18]], FLARE_R = 55;
const flares = [];
function pickWx() { const f = process.env.T128_WX; if (f && T.WXS[f]) return f; let r = rnd(); for (const [k, q] of WX_P) if ((r -= q) <= 0) return k; return 'overcast'; }
function setWx(k) { T.WX.k = k; bcast({ t: 'wx', k }); }
function sightAt(team, x, z) {
  const s = (T.WXS[T.WX.k] || T.WXS.overcast).sight; if (s >= 1) return 1;
  for (const f of flares) if (f.until > tickNo && Math.abs(f.x - x) < FLARE_R && Math.hypot(f.x - x, f.z - z) < FLARE_R) return 1;
  if (T.WX.k === 'night') return Math.max(s, T.litAt(x, z));   // v0.35: lamps and fires light the men standing near them
  return s;
}
function flareAt(x, z, team) {
  x = clamp(x, -T.W + 2, T.W - 2); z = clamp(z, -T.W + 2, T.W - 2);
  flares.push({ x, z, team, until: tickNo + 25 * TICK }); if (flares.length > 30) flares.shift();
  bcast({ t: 'flr', x: +x.toFixed(1), z: +z.toFixed(1), s: 25, tm: team });
  if (T.WX.k === 'night' || T.WX.k === 'fog') for (const e of ents.values()) if (e.team !== team && e.alive && !e.cmd && Math.hypot(e.x - x, e.z - z) < FLARE_R * .6) e.sp[team] = tickNo + 6 * TICK;
}
function fireFlare(p) {
  if (!(p.bd > 0)) { if ((p.msgCd || 0) <= tickNo) { tell(p, 'No flares left'); p.msgCd = tickNo + 2 * TICK; } return; }
  if ((p.gCd || 0) > tickNo) return; p.bd--; p.gCd = tickNo + TICK;
  const d = clamp(35 + p.pitch * 50, 18, 75); flareAt(p.x - Math.sin(p.yaw) * d, p.z - Math.cos(p.yaw) * d, p.team);
}
function nightFlares() {   // once a second at night: each side's sentries put up a flare now and then over enemies near their lines
  for (let i = flares.length - 1; i >= 0; i--) if (flares[i].until < tickNo) flares.splice(i, 1);
  if (T.WX.k !== 'night' || round.state !== 'play') return;
  for (const t of [0, 1]) {
    if (rnd() > .08) continue;
    const own = spawnLine(t), en = [...ents.values()].filter(e => e.team !== t && e.alive && !e.cmd && !e.manned && !e.inV && own && Math.abs(e.z - lineZ(own, e.x)) < 75);
    if (!en.length) continue; const e = en[(rnd() * en.length) | 0];
    if (flares.some(f => f.team === t && Math.hypot(f.x - e.x, f.z - e.z) < 40)) continue;
    flareAt(e.x + (rnd() - .5) * 24, e.z + (rnd() - .5) * 24, t);
  }
}
function roundStartExtras() {   // Operations round start: elite kits for both sides, the attackers' tank rolls up after 20 s
  later(3000, () => { if (round.state === 'play') { eliteStock(0); eliteStock(1); } });
  later(20000, () => { if (round.state === 'play' && op) VEHM.spawnTank(op.att, 'armour support for the attack'); });
}
function killFeedRaw(by, vt, vname, w) {   // a vehicle knocked out: same feed as kills, to everyone
  bcast({ t: 'kf', a: by ? nameOf(by) : '', at: by ? by.team : -1, v: vname, vt, w, h: 0, ai: by && by.id || 0, vi: 0, veh: 1 });
}

// ------------------------------------------------------------------ officer layer
const later = (ms, fn) => sched.push({ at: tickNo + Math.ceil(ms / (1000 / TICK)), fn });
const officersOf = team => [...humans].filter(p => p.deployed && p.cmd && p.team === team);
const sqName = k => k >= 100 ? AI_SQ[k - 100] : T.SQUADS[k];
// Squad leader = highest-XP member (rank Corporal or above); ties go to whoever joined first.
function computeLeaders() {
  leaders = new Map();
  for (const p of humans) {
    if (!p.deployed || p.cmd || p.sq < 0 || T.rankOf(p.xp) < 1) continue;
    const k = p.team * 100 + p.sq, c = leaders.get(k);
    if (!c || p.xp > c.xp || (p.xp === c.xp && p.id < c.id)) leaders.set(k, p);
  }
}
// Team spotting: anything a friendly can see (or is shooting at) stays visible to the team's leaders and officers for 6 s.
function spotFrom(p, r, eyeY) {
  forNear(p.x, p.z, r, e => { if (e.team !== p.team && e.alive && !(e.sp[p.team] > tickNo + 2 * TICK) && Math.hypot(e.x - p.x, e.z - p.z) < r * sightAt(p.team, e.x, e.z) && T.los(terr.H, p.x, eyeY, p.z, e.x, e.y + 1.2, e.z) && !(smokes.length && smokeBlocks(p.x, p.z, e.x, e.z))) e.sp[p.team] = tickNo + TICK * 6; });
}
const validSquad = (team, k) => (k >= 100 && k < 100 + AI_SQ.length) || (k >= 0 && k < T.SQUADS.length && [...humans].some(p => p.deployed && !p.cmd && p.team === team && p.sq === k));
const ordMsg = o => o ? { ty: o.ty, x: o.x, z: o.z, n: o.n, done: o.done ? 1 : 0 } : null;
function sendOrderTo(p) {   // p is a human, or a pseudo-recipient {team, sq, _all} meaning "every member of that squad"
  const o = orders[p.team].get(p.sq) || null, msg = { t: 'ord', o: ordMsg(o) };
  if (p._all) { for (const q of humans) if (q.deployed && !q.cmd && q.team === p.team && q.sq === p.sq) send(q, msg); sendOrders(p.team); }
  else send(p, msg);
}
function sendOrders(team) {
  const l = [...orders[team]].map(([k, o]) => [k, o.ty, o.x, o.z, o.n, o.done ? 1 : 0, (o.q || []).map(q => [q.ty, q.x, q.z])]);
  for (const p of officersOf(team)) send(p, { t: 'ords', l });
}
function issueOrder(p, m) {
  const sq = m.sq | 0, team = p.team; if (!validSquad(team, sq)) return;
  p.lastOrder = p.lastOrder || {}; if (p.lastOrder[sq] && tickNo - p.lastOrder[sq] < 6) return; p.lastOrder[sq] = tickNo;   // per-squad flood guard
  if (m.ty === 'clear') { orders[team].delete(sq); sendOrderTo({ team, sq, _all: true }); tell(p, sqName(sq) + ': order cancelled'); return; }
  if (!['attack', 'defend', 'move'].includes(m.ty)) return;
  let x = +m.x, z = +m.z; if (!isFinite(x) || !isFinite(z)) return;
  x = clamp(x, -T.W + 5, T.W - 5); z = clamp(z, -T.W + 5, T.W - 5);
  let n = 'grid ' + Math.round(x) + ', ' + Math.round(z); const ln = OB.find(o => Math.hypot(o.x - x, o.z - z) < 20);
  if (ln) { x = ln.x; z = ln.z; n = ln.n; } else { const dp = DP.find(d => Math.hypot(d.x - x, d.z - z) < 15); if (dp) { x = dp.x; z = dp.z; n = dp.n; } }
  const cur = orders[team].get(sq);
  if (m.q && cur && !(cur.done && !(cur.q && cur.q.length))) { cur.q = cur.q || []; if (cur.q.length < 4) cur.q.push({ ty: m.ty, x, z, n }); sendOrders(team); tell(p, sqName(sq) + ': then ' + m.ty.toUpperCase() + ' ' + n + ' (queued ' + cur.q.length + ')'); return; }
  orders[team].set(sq, { ty: m.ty, x, z, n, done: false, by: p.id, id: ordId++, q: [] });
  sendOrderTo({ team, sq, _all: true }); tell(p, sqName(sq) + ': ' + m.ty.toUpperCase() + ' ' + n);
}
// human squads: leader reaching the order point completes it
const ORD_R = 25, ORD_LEAD = 20, ORD_TROOP = 10, ORD_OFF = 15, ORD_HOLD = 30, ORD_HOLD_XP = 5, ORD_HOLD_LEAD = 8;   // order rewards
function orderTick() {
  for (const team of [0, 1]) {
    let changed = false;
    for (const [k, o] of orders[team]) {
      if (k >= 100) continue;
      if (![...humans].some(p => p.deployed && !p.cmd && p.team === team && p.sq === k)) { orders[team].delete(k); changed = true; continue; }
      const ld = leaders.get(team * 100 + k);
      const near = () => [...humans].filter(p => p.deployed && p.alive && !p.cmd && p.team === team && p.sq === k && p !== ld && Math.hypot(p.x - o.x, p.z - o.z) < ORD_R);
      if (!o.done && ld && ld.alive && Math.hypot(ld.x - o.x, ld.z - o.z) < 15) {
        o.done = true; o.held = tickNo; changed = true;
        const troops = near(); st(ld).ord++; addXp(ld, ORD_LEAD); tell(ld, 'Order completed (+' + ORD_LEAD + ' XP)' + (troops.length ? ' with ' + troops.length + ' of your squad' : ''));
        for (const p of troops) { addXp(p, ORD_TROOP); tell(p, 'Your squad completed its order (+' + ORD_TROOP + ' XP)'); }
        const off = ents.get(o.by); if (off && !off.bot) { st(off).ord++; const n = ORD_OFF + 2 * troops.length; addXp(off, n); tell(off, T.SQUADS[k] + ' completed your order (+' + n + ' XP)'); }
        sendOrderTo({ team, sq: k, _all: true });
      } else if (o.done && o.ty === 'defend' && tickNo - (o.held || 0) >= ORD_HOLD * TICK) {   // holding a defend order keeps paying
        o.held = tickNo; const troops = near().concat(ld && ld.alive && Math.hypot(ld.x - o.x, ld.z - o.z) < ORD_R ? [ld] : []);
        for (const p of troops) { const n = p === ld ? ORD_HOLD_LEAD : ORD_HOLD_XP; addXp(p, n); tell(p, 'Holding the position (+' + n + ' XP)'); }
      }
    }
    for (const [k, o] of orders[team]) if (k < 100 && o.done && o.q && o.q.length && tickNo - (o.held || 0) > 3 * TICK) { nextOrder(team, k, o); changed = true; }
    if (changed) sendOrders(team);
  }
}
function sendSqs() {
  for (const t of [0, 1]) {
    const offs = officersOf(t); if (!offs.length) continue;
    const cnt = new Map(), l = [];
    for (const p of humans) if (p.deployed && !p.cmd && p.team === t && p.sq >= 0) cnt.set(p.sq, (cnt.get(p.sq) || 0) + 1);
    const card = k => { const m = sqmOf(t, k); return [Math.round(m.m), m.broken ? 1 : 0, Math.round((m.hp || 0) * 100), m.alive || 0, m.n || 0, m.x == null ? null : +m.x.toFixed(1), m.z == null ? null : +m.z.toFixed(1), (m.sup || 0) > .3 || m.cas.length ? 1 : 0]; };
    for (const [k, n] of [...cnt].sort((a, b) => a[0] - b[0])) { const ld = leaders.get(t * 100 + k); l.push([k, T.SQUADS[k], n, ld ? ld.name : '', 0, ...card(k)]); }
    for (let i = 0; i < AI_SQ.length; i++) l.push([100 + i, AI_SQ[i], [...ents.values()].filter(e => e.bot && !e.mg && e.team === t && e.squad === i && e.alive).length, 'AI', 1, ...card(100 + i)]);
    const cd = SUPK.map(k => Math.max(0, Math.ceil((supCd[t][k] - tickNo) / TICK)));
    for (const o of offs) send(o, { t: 'sqs', l, cd, cost: SUPK.map(k => SUP[k].cost), k: SUPK, r: SUPK.map(k => SUP[k].r), tr: SUPK.map(k => SUP[k].tier), tier: tierOf(t), mk: marks.filter(q => q.team === t).map(q => [q.id, +q.x.toFixed(1), +q.z.toFixed(1), Math.ceil((q.until - tickNo) / TICK), q.name]), cp: cmdPts[t], cpMax: CP_MAX, inc: (1 + 3 * DP.filter(d => d.owner === t).length) * 15 });
  }
}
const crateMsg = c => ({ id: c.id, x: c.x, z: c.z, left: Math.max(0, (c.land - tickNo) / TICK) });
function callSupport(p, m) {
  const k = String(m.s); if (!T.own(SUP, k)) return; const s = SUP[k];
  if (k === 'tank' && VEHM.tanks().some(v => v.team === p.team && !v.dead)) { tell(p, 'Your tank is still in the field'); return; }
  let x = +m.x, z = +m.z; if (!isFinite(x) || !isFinite(z)) return;
  x = clamp(x, -T.W + 5, T.W - 5); z = clamp(z, -T.W + 5, T.W - 5);
  const cd = supCd[p.team];
  if (cd[k] > tickNo) { tell(p, k + ' not ready (' + Math.ceil((cd[k] - tickNo) / TICK) + ' s)'); return; }
  const up = PHONE_K.includes(k) ? phoneUp(p.team) : -1;
  if (up === 0) { tell(p, 'No telephone line to the batteries: get a line spliced (hold E at a break)'); return; }
  if (tierOf(p.team) < s.tier) { tell(p, 'Locked: needs requisition tier ' + s.tier + ' (hold ' + (s.tier === 2 ? '2 depots or an enemy line' : 'all 4 depots or two enemy lines') + ')'); return; }
  const mk = marks.find(q => q.team === p.team && Math.hypot(q.x - x, q.z - z) < 15), cost = mk && k !== 'drop' && k !== 'rally' ? Math.ceil(s.cost * .7) : s.cost;   // spotter marks: 30% cheaper and tighter
  if (cmdPts[p.team] < cost) { tell(p, 'Not enough command points (' + cost + ' needed). Hold the flank depots for more.'); return; }
  cmdPts[p.team] -= cost; cd[k] = tickNo + Math.round(s.cd * TICK * (up > 0 ? 1 + .35 * (phoneTotal(p.team) - up) : 1)); st(p).ci++;
  if (mk) { if (mk.x !== x || mk.z !== z) { x = mk.x; z = mk.z; } if (mk.by && !mk.by.bot && mk.by.deployed) { addXp(mk.by, 10); tell(mk.by, 'The officer called a strike on your mark (+10 XP)'); } }
  const spread = mk ? .5 : 1;
  { const A = { barrage: [30, 11, null], bomb: [36, 12, null], heavy: [50, 10, null], creep: [26, 24, 1 - p.team] }[k]; if (A) raiseAlarm(x, z, A[0], A[1], A[2]); }   // bots under it make for the dugouts
  { const W = { barrage: [3, 7.5, 13], bomb: [4, 7, 30], gas: [3, 25, 11], heavy: [3, 6, 30], creep: [3, 20, 15] }[k]; if (W) strikeWarn(p.team, k, x, z, W[2] * (k === 'barrage' ? spread : 1), W[0], W[1], k === 'creep' ? { dz: p.team === 0 ? -1 : 1, len: 30 } : k === 'bomb' ? { yw: 0 } : {}); }
  for (const t of [1 - p.team]) if (['barrage', 'bomb', 'gas', 'heavy', 'creep'].includes(k) && [...ents.values()].some(e => e.team === t && e.alive && !e.cmd && Math.hypot(e.x - x, e.z - z) < 30)) alert(t, 'enemysup' + k, 'enemy', 'Enemy ' + ({ barrage: 'artillery', bomb: 'bombers', gas: 'GAS', heavy: 'heavy guns', creep: 'creeping barrage' })[k] + ' falling near (' + Math.round(x) + ', ' + Math.round(z) + ')', x, z, 8);
  const warn = what => { for (const q of humans) if (q.deployed && q.team === p.team && !q.cmd && leaders.get(q.team * 100 + q.sq) === q) tell(q, 'FRIENDLY ' + what + ' near (' + Math.round(x) + ', ' + Math.round(z) + ') - clear the area'); };
  if (k === 'bomb') { tell(p, 'Bomber inbound: it must get past their AA guns'); warn('bomber run'); planeLaunch(p.team, 'bomb', x, z, p); }
  else if (k === 'strafe') { tell(p, 'Fighter inbound for a strafing run'); warn('strafing run'); planeLaunch(p.team, 'strafe', x, z, p); }
  else if (k === 'barrage') { tell(p, 'Barrage inbound' + (mk ? ' on the spotter\'s mark' : '')); warn('barrage'); for (let i = 0; i < 7; i++) later(3000 + i * 700, () => explode(x + (rnd() - .5) * 26 * spread, z + (rnd() - .5) * 26 * spread, p)); }
  else if (k === 'heavy') { tell(p, 'Heavy bombardment inbound'); warn('HEAVY bombardment'); for (let i = 0; i < 14; i++) later(3000 + i * 220, () => explode(x + (rnd() - .5) * 50 * spread, z + (rnd() - .5) * 50 * spread, p)); }
  else if (k === 'creep') {   // creeping barrage: a 30 m wide wall of shells walks 30 m toward the enemy over 20 s; the selected squads advance behind it
    const dz = p.team === 0 ? -1 : 1; tell(p, 'Creeping barrage inbound - advance behind it'); warn('creeping barrage');
    for (let i = 0; i < 40; i++) later(3000 + i * 500, () => explode(x + (rnd() - .5) * 30, z + dz * (i * .75 + (rnd() - .5) * 3), p));
    const sqs = (Array.isArray(m.sqs) ? m.sqs : []).map(v => v | 0).filter(q => validSquad(p.team, q)).slice(0, 20);
    for (const q of sqs) { const ex = x, ez = z + dz * 34; orders[p.team].set(q, { ty: 'attack', x: ex, z: ez, n: 'behind the barrage', done: false, by: p.id, id: ordId++, q: [], at: tickNo + 6 * TICK }); sendOrderTo({ team: p.team, sq: q, _all: true }); }
    if (sqs.length) sendOrders(p.team);
  }
  else if (k === 'smoke') {   // smoke shells: three clouds across the officer's view that block sight for 35 s
    tell(p, 'Smoke screen inbound'); const from = tickNo + 2 * TICK, until = from + 35 * TICK, yw = Number.isFinite(+m.yaw) ? +m.yaw : 0, l = [];
    for (let i = 0; i < 3; i++) { const q = { x: x + (i - 1) * 8 * Math.cos(yw), z: z - (i - 1) * 8 * Math.sin(yw), r: 6, from, until }; smokes.push(q); l.push([+q.x.toFixed(1), +q.z.toFixed(1), q.r]); }
    bcast({ t: 'smk', l, d: 2, s: 35 });
  } else if (k === 'gas') {   // gas shells: a cloud that hurts everyone inside (friend or foe) for 25 s
    tell(p, 'Gas shells inbound - keep your own men clear'); warn('GAS attack'); const from = tickNo + 3 * TICK;
    gases.push({ x, z, r: SUP.gas.r, from, until: from + 25 * TICK, by: p }); bcast({ t: 'gas', x: +x.toFixed(1), z: +z.toFixed(1), r: SUP.gas.r, d: 3, s: 25 });
  } else if (k === 'recon') {   // recon flight: every enemy within 50 m shows on your team's maps for 25 s
    tell(p, 'Recon plane on its way to (' + Math.round(x) + ', ' + Math.round(z) + ')'); planeLaunch(p.team, 'recon', x, z, p);
  } else if (k === 'rally') {   // forward rally point: a temporary respawn post for 90 s
    const y = hAt(terr.H, x, z); posts.push({ id: postId++, team: p.team, x, z, y, hp: POST_HP * .6, by: p, rally: tickNo + 90 * TICK });
    tellTeam(p.team, 'Rally point set at (' + Math.round(x) + ', ' + Math.round(z) + ') for 90 s - respawn there'); moraleBoost(p.team, 20, x, z, 35);
  } else if (k === 'whistle') {   // over the top: every AI squad attacks the point and the team's wave goes now
    let n = 'grid ' + Math.round(x) + ', ' + Math.round(z); const ln = OB.find(o => Math.hypot(o.x - x, o.z - z) < 20) || DP.find(d => Math.hypot(d.x - x, d.z - z) < 15); if (ln) { x = ln.x; z = ln.z; n = ln.n; }
    for (let i = 0; i < AI_SQ.length; i++) orders[p.team].set(100 + i, { ty: 'attack', x, z, n, done: false, by: p.id, id: ordId++ });
    if (!op || op.att === p.team) { wave.side = p.team; wave.t = 0; }
    for (const e of ents.values()) if (e.bot && e.team === p.team) { e.supp = 0; e.guard = null; e.depot = null; }
    for (const q of humans) if (q.deployed && q.team === p.team) send(q, { t: 'wh', n });
    tellTeam(p.team, 'OVER THE TOP! All squads attack ' + n); sendOrders(p.team); moraleBoost(p.team, 30);
  }
  else if (k === 'tank') { const v = VEHM.spawnTank(p.team, 'sent up by your officer', { x, z }); tell(p, v ? 'Tank on its way to (' + Math.round(x) + ', ' + Math.round(z) + ')' : 'No tank available'); }
  else if (k === 'star') { tell(p, 'Star shells over (' + Math.round(x) + ', ' + Math.round(z) + ')'); for (let i = 0; i < 3; i++) later(1500 + i * 900, () => flareAt(x + (i - 1) * 22, z + (rnd() - .5) * 12, p.team)); }
  else if (k === 'para') { tell(p, 'Reinforcements inbound'); tellTeam(p.team, 'Reinforcements are parachuting in near (' + Math.round(x) + ', ' + Math.round(z) + ')'); later(3000, () => dropPara(p.team, x, z)); }
  else {
    const c = { id: crateId++, team: p.team, x, z, land: tickNo + Math.round(2.2 * TICK), exp: tickNo + 60 * TICK }; crates.push(c);
    for (const q of humans) if (q.deployed && q.team === p.team) send(q, { t: 'dr', ...crateMsg(c) });
    tell(p, 'Supply drop inbound');
  }
}
const PARA_N = 10;
function dropPara(team, x, z) {
  if (round.state !== 'play') return;
  const bots = [...ents.values()].filter(e => e.bot && !e.mg && e.team === team && e.guard == null && !e.para);
  const back = e => team === 0 ? e.z : -e.z;   // the furthest-back living bots are the ones still walking up from home
  const pick = bots.filter(e => !e.alive).concat(bots.filter(e => e.alive).sort((a, b) => back(b) - back(a))).slice(0, PARA_N);
  for (const e of pick) {
    if (op && team === op.att && !e.alive) { if (op.tk <= 0) continue; op.tk--; }
    e.died = false; e.alive = true; e.climb = null; e.cov = null; e.crouch = false; e.buildF = null; e.hp = 100; e.down = 0; e.rel = 0; e.cd = 1; e.tgt = null; e.placed = true; e.para = true; e.manned = false;
    e.x = clamp(x + (rnd() - .5) * 16, -T.W + 3, T.W - 3); e.z = clamp(z + (rnd() - .5) * 16, -T.W + 3, T.W - 3); e.y = hAt(terr.H, e.x, e.z) + 32 + rnd() * 10;
    e.yaw = faceYaw(team); e.ox = (rnd() - .5) * 14; e.oz = (rnd() - .5) * 4; e.hold = { x, z, until: tickNo + 90 * TICK };
  }
}
function crateTick() {
  for (let i = crates.length - 1; i >= 0; i--) {
    const c = crates[i]; if (tickNo < c.land) continue;
    let got = tickNo > c.exp, taker = null;
    if (!got) for (const e of ents.values()) if (e.alive && !e.cmd && e.team === c.team && Math.hypot(e.x - c.x, e.z - c.z) < 4) { got = true; taker = e; break; }
    if (!got) continue;
    if (taker) for (const e of ents.values()) if (e.alive && !e.cmd && e.team === c.team && Math.hypot(e.x - c.x, e.z - c.z) < 10) {
      e.hp = maxHp(e); if (!e.bot && e.mg == null) { e.ammo = WPN[e.w].mag; e.rel = 0; } if (!e.bot) tell(e, 'Supply drop collected: resupplied');
    }
    crates.splice(i, 1); for (const q of humans) if (q.deployed && q.team === c.team) send(q, { t: 'drx', id: c.id });
  }
}

// ------------------------------------------------------------------ snapshots (binary)
const Q = 100;
// Snapshots are deltas against what this client was last sent (WebSocket is reliable and ordered, so the client's copy always
// matches p.sent). Per entity: u16 id, u8 mask [1 full pos i16×3 | 2 small move i8×3 (cm) | 4 yaw | 8 flags | 16 look], then
// removals: u16 count + u16 ids. Unchanged entities cost nothing; far ones are refreshed at half / third rate.
const vis_ = vis;
function encodeEnt(e) {   // once per entity per tick, shared by every client's snapshot
  const k = e.enc || (e.enc = new Int32Array(7));
  k[0] = Math.round(e.x * Q); k[1] = Math.round(e.y * Q); k[2] = Math.round(e.z * Q);
  k[3] = Math.floor(((e.yaw % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI) / (2 * Math.PI) * 256) & 255;
  k[4] = (e.team ? 1 : 0) | (e.bot ? 2 : 0) | ((e.mg != null && e.mg !== false) ? 4 : 0) | (e.crouch ? 8 : 0) | (e.flash > 0 ? 16 : 0) | (e.down > 0 ? 64 : 0) | (aiming(e) ? 128 : 0);
  k[5] = e.elite ? lookByte(e) : (CLASS_IDX[e.cls] || 0) | ((W_IDX[e.mg === true || e.mg === false || e.mg == null ? (e.w || 'bolt') : 'lmg'] || 0) << 3);   // class 7 = elite   // look byte: class (bits 0-2) + weapon (bits 3-5)
  k[6] = tickNo;
}
const SNAP = Buffer.allocUnsafe(36 + 400 * 12 + 2 + 2 * 1024);
function snapshot(p) {
  const off = p.cmd, lead = p.sq >= 0 && leaders.get(p.team * 100 + p.sq) === p, sent = p.sent || (p.sent = new Map()), live = p.live || (p.live = new Set());
  live.clear(); let o = 36, n = 0;
  for (const e of ents.values()) {
    if (e === p || (!e.alive && !(e.down > 0)) || e.manned || e.cmd || e.inV) continue;
    let vis = false, due = true;
    if (off) vis = e.team === p.team || vis_[p.team].has(e.id);          // officers: the whole friendly army + enemies inside their soldiers' sight (fog of war)
    else {
      const ax = Math.abs(e.x - p.x), az = Math.abs(e.z - p.z);
      if (ax < VIEW_R && az < VIEW_R) { vis = true; due = (ax < 50 && az < 50) || ((e.id + tickNo) & 1) === 0; }   // far entities at half rate
      else if (e.team === p.team && !e.bot && e.sq === p.sq && p.sq >= 0) vis = true;
      else if (lead && e.team !== p.team && e.sp[p.team] > tickNo) vis = true;                     // squad leaders get map-wide spotted enemies
      else if (p.cls === 'recon' && ax < (p.ads ? 240 : 170) && az < (p.ads ? 240 : 170)) { vis = true; due = ((e.id + tickNo) % 3) === 0; }   // recon sees further (third rate)
    }
    if (!vis) continue;
    live.add(e.id);
    let c = sent.get(e.id); if (c && !due) continue; if (n >= 400) continue;
    const k = e.enc; if (!k || k[6] !== tickNo) encodeEnt(e);
    const ec = e.enc, qx = ec[0], qy = ec[1], qz = ec[2], yw = ec[3], fl = ec[4] | (e.team !== p.team && e.sp[p.team] > tickNo ? 32 : 0);
    const lk = ec[5] | (!e.bot && e !== p && e.team === p.team && p.sq >= 0 && e.sq === p.sq ? 64 : 0);   // v0.33.3: 64 = in the receiver's squad
    let m = 0, dx = 0, dy = 0, dz = 0;
    if (!c) { m = 1 | 4 | 8 | 16; c = [0, 0, 0, 0, 0, 0]; sent.set(e.id, c); }
    else {
      dx = qx - c[0]; dy = qy - c[1]; dz = qz - c[2];
      if (dx || dy || dz) m |= (dx < -127 || dx > 127 || dy < -127 || dy > 127 || dz < -127 || dz > 127) ? 1 : 2;
      if (yw !== c[3]) m |= 4; if (fl !== c[4]) m |= 8; if (lk !== c[5]) m |= 16;
      if (!m) continue;
    }
    SNAP.writeUInt16LE(e.id, o); SNAP[o + 2] = m; o += 3;
    if (m & 1) { SNAP.writeInt16LE(qx, o); SNAP.writeInt16LE(qy, o + 2); SNAP.writeInt16LE(qz, o + 4); o += 6; }
    else if (m & 2) { SNAP.writeInt8(dx, o); SNAP.writeInt8(dy, o + 1); SNAP.writeInt8(dz, o + 2); o += 3; }
    if (m & 4) SNAP[o++] = yw; if (m & 8) SNAP[o++] = fl; if (m & 16) SNAP[o++] = lk;
    c[0] = qx; c[1] = qy; c[2] = qz; c[3] = yw; c[4] = fl; c[5] = lk; n++;
  }
  const ro = o; o += 2; let nr = 0;
  for (const id of sent.keys()) if (!live.has(id) && nr < 1024) { sent.delete(id); SNAP.writeUInt16LE(id, o); o += 2; nr++; }
  SNAP.writeUInt16LE(nr, ro);
  let h = 0; SNAP[h] = 3; h += 1; SNAP.writeUInt32LE(tickNo >>> 0, h); h += 4; SNAP.writeUInt32LE(p.ack >>> 0, h); h += 4;
  SNAP.writeFloatLE(p.x, h); h += 4; SNAP.writeFloatLE(p.y, h); h += 4; SNAP.writeFloatLE(p.z, h); h += 4; SNAP.writeFloatLE(p.vy, h); h += 4;
  SNAP[h++] = clamp(Math.ceil(p.hp), 0, 255);
  const nn = p.mg != null ? NESTS[p.mg] : null;
  SNAP[h++] = (p.alive ? 1 : 0) | (nn ? 2 : 0) | ((p.down > 0 && p.ps ? p.ps.rel > 0 : p.rel > 0) ? 4 : 0) | (nn && nn.over ? 8 : 0) | (lead ? 16 : 0) | (off ? 32 : 0) | (p.cl ? 64 : 0) | (p.down > 0 ? 128 : 0);
  SNAP.writeUInt16LE(nn ? nn.belt : p.down > 0 && p.ps ? p.ps.ammo : Math.max(0, p.ammo | 0), h); h += 2; SNAP.writeUInt16LE(Math.min(65535, supply[p.team] | 0), h); h += 2;
  SNAP[h++] = nn ? Math.round(nn.heat * 100) : 0; SNAP.writeUInt16LE(n, h); h += 2;
  SNAP.writeUInt16LE((Math.max(0, p.gr | 0) & 255) | ((Math.max(0, p.bd | 0) & 255) << 8), h);   // grenades left (low byte), bandages left (high byte)
  return Buffer.from(SNAP.subarray(0, o));
}
const CLASS_IDX = { rifleman: 0, assault: 1, gunner: 2, medic: 3, sapper: 4, officer: 5, recon: 6 };
const W_IDX = { bolt: 0, carbine: 1, shotgun: 2, smg: 3, lmg: 4, mark: 5, sniper: 6 };
// shown as the shouldered-rifle pose: humans aiming down sights or firing, bots with a target in sight
const aiming = e => e.alive && (e.bot ? !!(e.tgt && e.td < 70) || e.flash > 0 : !!e.ads || e.flash > 0);
let bytesOut = 0, tickMs = 0, tickMax = 0, slowN = 0, gapMax = 0, lastTickAt = 0, slowLogAt = 0; const SLOW_MS = 40;
function broadcastState() {
  let objMsgs = null;
  if (tickNo % 10 === 0) {
    const base = { t: 'o', o: OB.map(o => [o.owner, +o.p.toFixed(2), Math.ceil(o.lock)]), w: [wave.side, Math.round(wave.t)], r: round.state, hv: [...humans].filter(p => p.deployed).length,
      dp: DP.map(d => [d.owner, +d.p.toFixed(2)]), op: op && [op.att, op.sector, OPS.nsec, op.tk, op.tkMax, op.bat, OPS.nbat, Math.ceil(op.regroup), op.stall ? 1 : 0, OB.indexOf(opTarget())] };
    const fpFor = t => posts.filter(q => q.team === t || [...humans].some(h => h.team === t && h.alive && !h.cmd && Math.hypot(h.x - q.x, h.z - q.z) < 110)).map(q => [q.id, q.team, +q.x.toFixed(1), +q.z.toFixed(1), Math.ceil(q.hp), q.rally ? Math.max(0, Math.ceil((q.rally - tickNo) / TICK)) : 0, q.radio ? [+q.radio.x.toFixed(2), +q.radio.z.toFixed(2), +q.radio.yaw.toFixed(2), +q.y.toFixed(2)] : 0]);   // [5] rally point seconds left, [6] a building's respawn point: where its radio stands
    const abFor = t => aboxes.filter(b => b.team === t || [...humans].some(h => h.team === t && h.alive && Math.hypot(h.x - b.x, h.z - b.z) < 80)).map(b => [b.id, b.team, +b.x.toFixed(2), +b.z.toFixed(2), b.uses]);
    objMsgs = [Buffer.from(JSON.stringify({ ...base, fp: fpFor(0), ab: abFor(0) })), Buffer.from(JSON.stringify({ ...base, fp: fpFor(1), ab: abFor(1) }))];
  }
  // tracers: binary frame type 4, 18 B each (i16 origin cm ×3, i16 direction ×10000 ×3, u8 length m, u16 shooter, u8 weapon, u16 speed),
  // one message per 40 m cell shared by every player standing in it (own shots are skipped client-side)
  const shCell = new Map();
  const shFor = p => { const cx = Math.floor(p.x / 40), cz = Math.floor(p.z / 40), key = cx * 1000 + cz; let b = shCell.get(key); if (b === undefined) {
      const x0 = cx * 40 + 20, z0 = cz * 40 + 20, idx = []; for (let i = 0; i < shots.length && idx.length < 48; i++) { const q = shots[i]; if (Math.abs(q[0] - x0) < 150 && Math.abs(q[2] - z0) < 150) idx.push(i); }
      if (idx.length) { b = Buffer.allocUnsafe(3 + idx.length * 18); b[0] = 4; b.writeUInt16LE(idx.length, 1); let o = 3;
        for (const i of idx) { const q = shots[i]; b.writeInt16LE(clamp(Math.round(q[0] * Q), -32767, 32767), o); b.writeInt16LE(clamp(Math.round(q[1] * Q), -32767, 32767), o + 2); b.writeInt16LE(clamp(Math.round(q[2] * Q), -32767, 32767), o + 4);
          b.writeInt16LE(Math.round(q[3] * 10000), o + 6); b.writeInt16LE(Math.round(q[4] * 10000), o + 8); b.writeInt16LE(Math.round(q[5] * 10000), o + 10);
          b[o + 12] = clamp(Math.round(q[6]), 0, 255); b.writeUInt16LE(q[7] & 65535, o + 13); b[o + 15] = q[8] === 'mg' || q[8] === 'hmg' ? 7 : q[8] === 'atr' ? 6 : (W_IDX[q[8]] || 0); b.writeUInt16LE(Math.round(q[9] || 400), o + 16); o += 18; }
      } else b = null; shCell.set(key, b); } return b; };
  for (const p of humans) {
    if (!p.deployed || !p.ws.open) continue;
    if (p.ws.socket.writableLength > 250000) { p.sent = null; continue; }   // slow client: skip it and send it a full snapshot next time
    if (p.sent === null) { wsSend(p.ws, 1, Buffer.from('{"t":"snapReset"}')); p.sent = new Map(); }
    const b = snapshot(p); wsSend(p.ws, 2, b); bytesOut += b.length;
    if (shots.length) { const j = shFor(p); if (j) { wsSend(p.ws, 2, j); bytesOut += j.length; } }
    if (objMsgs) wsSend(p.ws, 1, objMsgs[p.team]);
  }
}
let last = Date.now();
function tick() {
  for (const p of humans) if (p.ws && p.ws.open) p.ws.socket.cork();
  try { tickBody(); } finally { for (const p of humans) if (p.ws && p.ws.open) p.ws.socket.uncork(); }
}
// One faulty subsystem (or one bad entity) must never stop the whole tick: snapshots still go out, the error is logged once a minute.
const guardAt = new Map();
// v0.32.1 tick profiler: time per subsystem (summed over the tick), so a slow tick can say what was slow
const PROF = new Map(); let profOn = true;
const hr = () => Number(process.hrtime.bigint()) / 1e6;
function prof(name, ms) { PROF.set(name, (PROF.get(name) || 0) + ms); }
function guard(name, fn, a) { const t = profOn ? hr() : 0; try { fn(a); } catch (e) { const n = guardAt.get(name) || 0; if (Date.now() - n > 60000) { guardAt.set(name, Date.now()); console.error('[' + name + '] error (game keeps running):', e && e.stack || e); } } finally { if (profOn) prof(name, hr() - t); } }
// v0.39 load shown to players: the worst tick and the worst wait between ticks over the last ~2 s ride on every pong, so a
// player's own screen can tell a busy server from a bad connection or a slow PC. Long stalls are also logged.
const LOADW = [[0, 0], [0, 0]]; let loadAt = 0, loadPrev = 0, netLogAt = 0;
function loadNote(ms) {
  const now = hr(), gap = loadPrev ? now - loadPrev : 0; loadPrev = now;
  if (now - loadAt > 1000) { loadAt = now; LOADW[1] = LOADW[0]; LOADW[0] = [0, 0]; }
  if (ms > LOADW[0][0]) LOADW[0][0] = ms; if (gap > LOADW[0][1]) LOADW[0][1] = gap;
  if (gap > 400) console.log(`[stall] ${Math.round(gap)} ms between ticks (this tick ${ms.toFixed(1)} ms): the server process was held up (CPU taken by another program, or memory swapping)`);
  if (now - netLogAt > 5000) { netLogAt = now; for (const p of humans) { if (!p.ws || !p.ws.open || !p.deployed) continue; const w = p.ws.socket.writableLength, idle = p.inAt ? now - p.inAt : 0;
    if (w > 60000 || idle > 2500) console.log(`[net] ${p.name}: ${Math.round(w / 1024)} KB waiting to be sent, last input ${Math.round(idle)} ms ago, ping ${p.ping == null ? '?' : p.ping} ms (their connection is not keeping up)`); } }
}
const loadNow = () => [Math.round(Math.max(LOADW[0][0], LOADW[1][0])), Math.round(Math.max(LOADW[0][1], LOADW[1][1]))];
function tickBody() {
  const t0 = process.hrtime.bigint(); tickNo++; PROF.clear();
  { const now = hr(); if (lastTickAt) { const gap = now - lastTickAt; if (gap > gapMax) gapMax = gap; } lastTickAt = now; }
  if (round.state === 'ended') { round.t -= DT; if (round.t <= 0) resetRound(); }
  if (tickNo % TICK === 0) { guard('nestfix', nestAutofix); guard('phonefix', phoneAutofix); }
  { const t = hr(); buildGrid(); computeLeaders(); prof('grid', hr() - t); } guard('nav', () => NAV.tick()); if (tickNo % 20 === 0) guard('squads', squadTick);
  { const due = sched.filter(s => s.at <= tickNo); if (due.length) { sched = sched.filter(s => s.at > tickNo); for (const s of due) { try { s.fn(); } catch (e) { console.error(e); } } } }
  for (const p of humans) guard('human', humanTick, p);
  guard('spread', botsSpread);
  for (const e of ents.values()) if (e.bot) { const y0 = e.yaw; guard('bot', botTick, e);
    // v0.29: a man with nothing to shoot at turns his head at a human pace (max 0.5 rad a tick): no twitching on the spot
    if (e.alive && e.tgt && e.tgt.alive && !e.charging && !e.mg && !e.climb) e.yaw = Math.atan2(-(e.tgt.x - e.x), -(e.tgt.z - e.z));   // in a fight he keeps his eyes (and rifle) on his man, even while moving
    else if (e.alive && !e.charging && !e.mg && y0 != null) { const d = Math.atan2(Math.sin(e.yaw - y0), Math.cos(e.yaw - y0)); if (Math.abs(d) > .5) e.yaw = y0 + Math.sign(d) * .5; } }
  guard('vehicles', () => VEHM.tick()); guard('fires', firesTick);
  guard('bullets', bulletsTick); guard('planes', planesTick); histTick();
  for (let i = grenades.length - 1; i >= 0; i--) { const g = grenades[i]; g.t -= DT; if (g.t <= 0) { grenades.splice(i, 1); guard('explode', () => explode(g.tx, g.tz, g.by, g.pow)); } }
  for (const n of NESTS) if (n.heat > 0) { n.heat = Math.max(0, n.heat - DT * (n.over ? .3 : .2)); if (n.over && n.heat <= .35) n.over = false; }
  if (round.state === 'play') guard('objectives', objectivesTick);
  if (tickNo % 40 === 0) guard('fill', fillBots);
  if (tickNo % 10 === 0) { guard('orders', orderTick); guard('crates', crateTick); guard('aboxes', aboxTick); guard('medics', medicSee); }
  if (tickNo % 4 === 0) for (const e of ents.values()) if (e.mph && e.mphU <= tickNo) { e.mph = false; if (!e.bot) send(e, { t: 'mph', s: 0, n: e.mphN }); }
  if (tickNo % 20 === 0) guard('sqs', sendSqs);
  { const t = hr(); broadcastState(); prof('send', hr() - t); }
  if (bodies.length) { bcast({ t: 'bd', b: bodies.splice(0) }); }
  shots.length = 0; for (const e of ents.values()) if (e.flash > 0) e.flash--;
  const ms = Number(process.hrtime.bigint() - t0) / 1e6; tickMs += ms; tickMax = Math.max(tickMax, ms); loadNote(ms);
  if (ms > SLOW_MS) { slowN++; const top = [...PROF].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, v]) => k + ' ' + v.toFixed(1)).join(', ');
    if (Date.now() - slowLogAt > 5000) { slowLogAt = Date.now(); console.log(`[slow tick ${tickNo}] ${ms.toFixed(1)} ms: ${top} (${humans.size} humans, ${ents.size} soldiers)`); } }
  if (xpDirty && tickNo % 200 === 0) saveXp();
  if (tickNo % (TICK * 15) === 0) {
    const bots = [...ents.values()].filter(e => e.bot).length;
    console.log(`[tick ${tickNo}] humans ${humans.size} bots ${bots} | avg ${(tickMs / (TICK * 15)).toFixed(2)} ms, max ${tickMax.toFixed(1)} ms, slow ${slowN}, gap ${gapMax.toFixed(0)} ms | out ${(bytesOut / 15 / 1024).toFixed(1)} KB/s | supply ${supply} | wave ${wave.side === 0 ? 'blue' : 'red'}`);
    tickMs = 0; tickMax = 0; bytesOut = 0; slowN = 0; gapMax = 0;
  }
}
function saveXp() { xpDirty = false; try { fs.writeFileSync(XPFILE + '.tmp', JSON.stringify(xpdb)); fs.renameSync(XPFILE + '.tmp', XPFILE); } catch (e) { console.error('xp save failed', e.message); } }   // atomic

// ------------------------------------------------------------------ session / protocol
function sqSizes(team) { const a = T.SQUADS.map(() => 0); for (const p of humans) if (p.team === team && p.deployed && p.sq >= 0) a[p.sq]++; return a; }
function onText(c, txt) {
  c.msgs = (c.msgs || 0) + 1; if (c.msgs > 400) return;     // simple flood guard (reset every second)
  let m; try { m = JSON.parse(txt); } catch (e) { return; }
  if (!m || typeof m !== 'object' || Array.isArray(m)) return;
  const p = c.player;
  if (m.t === 'hello') {
    if (p) return;
    let name = String(m.name || '').replace(/[^\w \-\[\]\.]/g, '').trim().slice(0, 16), acct = null;
    const deny = msg => wsSend(c, 1, Buffer.from(JSON.stringify({ t: 'err', m: msg })));
    if (ACC && m.token) { acct = ACC.session(String(m.token)); if (!acct) return deny('Your login has expired. Log in again.'); name = acct.name; }
    else if (CFG.accounts === 'required') return deny('This server needs an account: log in or create one.');
    else if (ACC && ACC.isRegistered(name)) return deny('That callsign belongs to an account. Log in to use it.');
    if (acct && [...humans].some(q => q.acct === acct)) return deny('That account is already playing.');
    if (name.length < 2) { wsSend(c, 1, Buffer.from(JSON.stringify({ t: 'err', m: 'Pick a name (2-16 letters or digits).' }))); return; }
    for (const q of humans) if (q.name.toLowerCase() === name.toLowerCase()) { wsSend(c, 1, Buffer.from(JSON.stringify({ t: 'err', m: 'That name is in use right now.' }))); return; }
    const c0 = [...humans].filter(q => q.team === 0).length, c1 = humans.size - c0;
    const rjk = typeof m.rj === 'string' ? m.rj : '', rj = rejoins.get(rjk); if (rj) rejoins.delete(rjk);
    const back = rj && rj.until > Date.now() && rj.name === name.toLowerCase() ? rj : null;   // coming back after a map change
    const team = back ? back.team : (process.env.T128_TEST && (m.team === 0 || m.team === 1)) ? m.team : c0 < c1 ? 0 : c1 < c0 ? 1 : (rnd() < .5 ? 0 : 1);   // m.team honoured only in test mode
    if ((team === 0 ? c0 : c1) >= SLOTS) { wsSend(c, 1, Buffer.from(JSON.stringify({ t: 'err', m: 'Server full.' }))); return; }
    const e = newEnt(team, false);
    Object.assign(e, { ws: c, name, acct, xp: acct ? acct.xp || 0 : CFG.accounts === 'required' ? 0 : xpdb[name.toLowerCase()] || 0, deployed: false, q: [], ack: 0, sq: -1, cls: 'rifleman', w: 'bolt', u: 'bandage', hold: false, pend: null });
    c.player = e; humans.add(e);
    send(e, { t: 'prof', id: e.id, team, xp: e.xp, rank: T.rankOf(e.xp), sq: sqSizes(team), max: SQ_MAX, acct: acct ? 1 : 0, name: e.name, server: CFG.name, map: mapSeed, back: back ? back.sq : null });
  } else if (!p) return;
  else if (m.t === 'join' || m.t === 'loadout') {
    let l = T.fixLoadout(p.xp, m); let sq = m.sq | 0; const sz = sqSizes(p.team);
    if (l.cls === 'officer' && officerCount(p.team, p) >= OFFICERS_MAX) { l = { cls: 'rifleman', w: 'bolt', u: 'bandage' }; tell(p, 'Officer slots are full. Deploying as Rifleman.'); }
    if (p.deployed && sq === p.sq) sz[sq]--;
    if (!(sq >= 0 && sq < T.SQUADS.length && sz[sq] < SQ_MAX)) sq = sz.findIndex(n => n < SQ_MAX);
    if (l.cls === 'officer') sq = -1;
    if (!p.deployed) {
      p.cls = l.cls; p.w = l.w; p.u = l.u; p.sq = sq; p.deployed = true; p.alive = false; p.down = 0; p.rt = .3; p.sent = new Map();   // the client drops its entity copies on 'w'; resend everything
      send(p, { t: 'w', id: p.id, team: p.team, sq, cls: l.cls, w: l.w, u: l.u, wx: T.WX.k, craters, tick: TICK, state: round.state, crates: crates.filter(c => c.team === p.team).map(crateMsg), forts: [...T.FORTS.values()].map(fortMsg), nd: NESTS.slice(0, BASE_NESTS).map((n, i) => n.dead ? i : -1).filter(i => i >= 0), ph: [...phoneCut.keys()], tn: TUN.map((u, i) => p.team === T.TUNNELS[i].team || u.heard ? +u.p.toFixed(2) : 0), aa: AAS.map(a => a.dead ? 1 : 0) });
      if (sq >= 0) sendOrderTo(p); else sendOrders(p.team);
      send(p, VEHM.fullMsg()); send(p, eliteMsg()); for (const f of fires) if (f.until > tickNo) send(p, { t: 'fi', x: +f.x.toFixed(1), z: +f.z.toFixed(1), r: f.r, s: Math.ceil((f.until - tickNo) / TICK) });
      for (const f of flares) if (f.until > tickNo) send(p, { t: 'flr', x: +f.x.toFixed(1), z: +f.z.toFixed(1), s: Math.ceil((f.until - tickNo) / TICK), tm: f.team });
    } else {
      p.pend = { l, sq };
      if (p.cmd || l.cls === 'officer') { if (p.mg != null) dismount(p, true); p.alive = false; p.down = 0; p.rt = .1; tell(p, 'Switching role…'); }
      else tell(p, 'Loadout will apply when you next respawn.');
    }
  } else if (m.t === 'in') {
    if (!p.deployed || !Array.isArray(m.c)) return; p.inAt = hr();
    for (const c2 of m.c.slice(0, 20)) if (Array.isArray(c2) && c2.length >= 7) p.q.push(c2);
    if (Number.isFinite(m.rt)) p.rw = clamp(tickNo - (m.rt | 0), 0, LAGC_MAX);   // how far behind the server this player's view is
    if (p.q.length > 60) p.q.splice(0, p.q.length - 60);
  } else if (m.t === 'tp' && process.env.T128_TEST && Number.isFinite(+m.x) && Number.isFinite(+m.z)) { p.x = +m.x; p.z = +m.z; p.y = T.hAt(terr.H, p.x, p.z); p.vy = 0; p.cl = null;
  } else if (m.t === 'dmg' && process.env.T128_TEST && Number.isFinite(+m.n)) { damage(p, +m.n, null, !!m.head);
  } else if (m.t === 'tk' && process.env.T128_TEST) { const v = VEHM.spawnTank(p.team, 'test'); if (v) { v.x = p.x + 8; v.z = p.z; v.yaw = p.yaw; v.order = { x: v.x, z: v.z }; }
  } else if (m.t === 'tround' && process.env.T128_TEST && round.state === 'play') { endRound(m.win === 1 ? 1 : 0); round.t = 3;   // test: end the round now, reset 3 s later
  } else if (m.t === 'wxs' && process.env.T128_TEST && T.WXS[m.k]) { setWx(m.k);
  } else if (m.t === 'act') onAct(p, String(m.a), m);
  else if (m.t === 'cmd') { if (p.deployed && p.cmd && p.alive) { if (m.k === 'order') issueOrder(p, m); else if (m.k === 'sup') callSupport(p, m); } }
  else if (m.t === 'ping') { if (Number.isFinite(m.p)) p.ping = clamp(Math.round(m.p), 0, 9999); const ld = loadNow(); send(p, { t: 'pong', c: m.c, s: ld[0], g: ld[1] }); }   // the client reports the round trip it last measured (for the scoreboard)
  else if (m.t === 'chat') chatMsg(p, m);
  else if (m.t === 'sbq' && p.deployed && (p.sbAt || 0) <= tickNo) { p.sbAt = tickNo + TICK; send(p, { t: 'sb', s: [scoreRows(0, p), scoreRows(1, p)] }); }
}
setInterval(() => { for (const p of humans) p.ws.msgs = 0; }, 1000);
// v0.29 text chat: to everyone or to your own side. Plain text only (the client shows it as text, never as HTML), 120 characters,
// a burst of 4 then one message every 1.5 s per player. Lines are also printed in the server window for the host.
function chatMsg(p, m) {
  const now = Date.now(); p.chatTok = Math.min(4, (p.chatTok == null ? 4 : p.chatTok) + (now - (p.chatAt || now)) / 1500); p.chatAt = now;
  const txt = String(m.m == null ? '' : m.m).replace(/[\u0000-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g, '').replace(/\s+/g, ' ').trim().slice(0, 120);
  if (!txt) return;
  if (p.chatTok < 1) { send(p, { t: 'msg', m: 'Slow down: one chat message every 1.5 s' }); return; }
  p.chatTok -= 1; const team = !!m.team;
  const out = JSON.stringify({ t: 'chat', n: p.name, tm: p.team, rk: T.rankOf(p.xp || 0), m: txt, tc: team ? 1 : 0, off: p.cmd ? 1 : 0 });
  for (const q of humans) if (q.ws && q.ws.open && (!team || q.team === p.team)) wsSend(q.ws, 1, Buffer.from(out));
  console.log('[chat' + (team ? ' team ' + (p.team ? 'green' : 'blue') : '') + '] ' + p.name + ': ' + txt);
}
function onClose(c) {
  c.open = false; const p = c.player; if (!p) return;
  if (p.mg != null) dismount(p, true); if (p.veh) VEHM.leave(p, true);
  humans.delete(p); ents.delete(p.id);
  if (p.cmd && !officersOf(p.team).length) { orders[p.team].clear(); for (let k = 0; k < 16; k++) sendOrderTo({ team: p.team, sq: k, _all: true }); }
}

// ------------------------------------------------------------------ minimal WebSocket (RFC 6455) + static files
// Test-only network conditions (T128_TEST=1 T128_LAG="base,jitter" in ms, each way): messages keep their order, as on TCP.
const LAGSIM = process.env.T128_TEST && process.env.T128_LAG ? String(process.env.T128_LAG).split(',').map(Number) : null;
function lagQ(c, key, fn) {
  const at = Math.max(c[key] || 0, Date.now() + LAGSIM[0] + Math.random() * (LAGSIM[1] || 0)); c[key] = at; const Q = c[key + 'Q'] || (c[key + 'Q'] = []); Q.push([at, fn]);
  setTimeout(() => { while (Q.length && Q[0][0] <= Date.now() + .5) Q.shift()[1](); }, Math.max(0, at - Date.now()) + 1);   // strictly first in, first out
}
function wsSend(c, op, payload) {
  if (LAGSIM && c.player && !c._raw) { const pl = Buffer.from(payload); return lagQ(c, 'lagOut', () => { c._raw = true; try { wsSend(c, op, pl); } finally { c._raw = false; } }); }
  if (!c.open) return; const n = payload.length; let h;
  if (n < 126) h = Buffer.from([128 | op, n]); else if (n < 65536) h = Buffer.from([128 | op, 126, n >> 8, n & 255]);
  else { h = Buffer.alloc(10); h[0] = 128 | op; h[1] = 127; h.writeUInt32BE(n, 6); }
  c.socket.write(Buffer.concat([h, payload]));
}
function wsClose(c) { if (c.open) { c.open = false; try { c.socket.end(); } catch (e) { } } onClose(c); }
function wsData(c, d) {
  c.buf = c.buf.length ? Buffer.concat([c.buf, d]) : d;
  for (;;) {
    const b = c.buf; if (b.length < 2) return;
    const fin = !!(b[0] & 128), op = b[0] & 15, masked = !!(b[1] & 128); let len = b[1] & 127, off = 2;
    if (len === 126) { if (b.length < 4) return; len = b.readUInt16BE(2); off = 4; }
    else if (len === 127) { if (b.length < 10) return; if (b.readUInt32BE(2)) return wsClose(c); len = b.readUInt32BE(6); off = 10; }
    if (len > 65536 || !masked) return wsClose(c);
    if (b.length < off + 4 + len) return;
    const mask = b.subarray(off, off + 4), pl = Buffer.allocUnsafe(len);
    for (let i = 0; i < len; i++) pl[i] = b[off + 4 + i] ^ mask[i & 3];
    c.buf = b.subarray(off + 4 + len);
    if (op === 8) return wsClose(c);
    if (op === 9) { wsSend(c, 10, pl); continue; }
    if (op === 1 || op === 2) { c.fop = op; c.frags = [pl]; c.fragN = len; } else if (op === 0 && c.frags) { c.frags.push(pl); c.fragN += len; if (c.fragN > 65536) return wsClose(c); } else continue;   // fragmented messages capped at 64 KB in total
    if (fin) { const full = Buffer.concat(c.frags); c.frags = null; if (c.fop === 1 && LAGSIM && c.player) { const tx = full.toString('utf8'); lagQ(c, 'lagIn', () => { try { onText(c, tx); } catch (e) { console.error(e); } }); } else if (c.fop === 1) { try { onText(c, full.toString('utf8')); } catch (e) { console.error('message error', e && e.stack || e); } } }   // one bad message must never take the server down
  }
}
const FILES = { '/': ['public/index.html', 'text/html; charset=utf-8'], '/index.html': ['public/index.html', 'text/html; charset=utf-8'], '/shared.js': ['shared.js', 'text/javascript; charset=utf-8'] };
// ---- v0.27 HTTP API: accounts, health / server info, the server list
// Behind a proxy or tunnel (host.js, nginx, Caddy) every player arrives from the proxy's address, so the real one is read from
// its headers — but only when the connection itself comes from this machine or a private network (where the proxy sits).
const LOCALNET = /^(::ffff:)?(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)|^::1$|^f[cd]/i;
const clientIp = req => { const ra = req.socket.remoteAddress || '?'; if (!CFG.trustProxy || !LOCALNET.test(ra)) return ra;
  const cf = String(req.headers['cf-connecting-ip'] || '').trim(), xf = String(req.headers['x-forwarded-for'] || '').split(',').map(x => x.trim()).filter(Boolean);
  return (cf || xf[xf.length - 1] || ra).slice(0, 64); };   // rightmost X-Forwarded-For entry: the one our own proxy added
const originOk = o => !CFG.origins.length || !o || CFG.origins.includes(String(o).replace(/\/+$/, ''));
function cors(req, res) { const o = req.headers.origin; if (o && originOk(o)) { res.setHeader('access-control-allow-origin', o); res.setHeader('vary', 'origin'); } else if (!CFG.origins.length) res.setHeader('access-control-allow-origin', '*'); res.setHeader('access-control-allow-methods', 'GET, POST, OPTIONS'); res.setHeader('access-control-allow-headers', 'content-type'); }
const json = (res, code, o) => { res.statusCode = code; res.setHeader('content-type', 'application/json'); res.setHeader('cache-control', 'no-store'); res.end(JSON.stringify(o)); };
function body(req, max) { return new Promise((ok, no) => { let n = 0; const b = []; req.on('data', d => { n += d.length; if (n > max) { no(new Error('too big')); req.destroy(); } else b.push(d); }); req.on('end', () => { try { ok(JSON.parse(Buffer.concat(b).toString('utf8') || '{}')); } catch (e) { no(e); } }); req.on('error', no); }); }
const info = () => ({ t128: 1, name: CFG.name, version: VERSION, map: mapSeed, launcher: !!CFG.launcherUrl, players: [...humans].filter(p => p.deployed).length, max: SLOTS * 2, bots: [...ents.values()].filter(e => e.bot && !e.mg).length,
  accounts: CFG.accounts, wx: T.WX.k, op: op ? [op.att, op.sector, OPS.nsec] : null, region: CFG.region, url: CFG.pub || null, humans: humans.size, ents: ents.size, tick: tickNo, round: round.state });
// server list (registry): game servers announce themselves every 30 s; each is checked (GET <url>/health) before it is listed; silent ones drop off after 90 s
const listed = new Map(), annAt = new Map();
const fetchJson = (url, ms) => new Promise((ok, no) => { const mod = url.startsWith('https:') ? require('https') : http; const r = mod.get(url, { timeout: ms || 4000 }, res => { let b = ''; res.on('data', d => { b += d; if (b.length > 8000) r.destroy(); }); res.on('end', () => { try { ok(JSON.parse(b)); } catch (e) { no(e); } }); }); r.on('error', no); r.on('timeout', () => r.destroy(new Error('timeout'))); });
async function announce(m, ip) {
  const url = String(m.url || '').replace(/\/+$/, ''); if (!/^https?:\/\/[a-z0-9.\-]+(:\d{2,5})?$/i.test(url)) return { err: 'bad url' };
  const host = url.replace(/^https?:\/\//i, '').replace(/:\d+$/, '').toLowerCase();
  if (!process.env.T128_TEST && !CFG.allowPrivate && (host === 'localhost' || /^(127\.|10\.|192\.168\.|169\.254\.|0\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host) || !host.includes('.'))) return { err: 'private addresses cannot be listed' };   // no probing the registry's own network
  if ([...listed.values()].filter(q => q.ip === ip && q.url !== url).length >= 3) return { err: 'too many servers from your address' };
  const k = ip + ' ' + url; if ((annAt.get(k) || 0) > Date.now()) return { err: 'too often' }; annAt.set(k, Date.now() + 10000);
  if (!listed.has(url) && listed.size >= 200) return { err: 'list full' };
  let h; try { h = await fetchJson(url + '/health'); } catch (e) { return { err: 'could not reach ' + url + '/health' }; }
  if (!h || !h.t128) return { err: 'not a Trench 128 server' };
  listed.set(url, { ip, url, name: String(h.name || '?').slice(0, 40), version: String(h.version || '?').slice(0, 12), players: h.players | 0, max: h.max | 0, bots: h.bots | 0, accounts: String(h.accounts || ''), wx: String(h.wx || ''), op: Array.isArray(h.op) ? h.op.slice(0, 3).map(v => v | 0) : null, region: String(h.region || '').slice(0, 16), seen: Date.now() });
  return { ok: 1 };
}
function serverList() {
  const now = Date.now(), l = []; for (const [u, q] of listed) { if (now - q.seen > 90000) listed.delete(u); else { const { ip, ...pub } = q; l.push(pub); } }
  for (const [k, t] of annAt) if (t < now) annAt.delete(k);
  if (CFG.pub && !listed.has(CFG.pub)) { const i = info(); l.unshift({ url: CFG.pub, name: i.name, version: i.version, players: i.players, max: i.max, bots: i.bots, accounts: i.accounts, wx: i.wx, op: i.op, region: i.region, seen: now }); }
  return l;
}
if (CFG.master && CFG.pub) {   // tell the registry about this server
  const post = () => { const b = JSON.stringify({ url: CFG.pub }), U = new URL(CFG.master + '/announce'), mod = U.protocol === 'https:' ? require('https') : http;
    const r = mod.request(U, { method: 'POST', headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(b) }, timeout: 8000 }, res => { let t = ''; res.on('data', d => t += d); res.on('end', () => { if (res.statusCode !== 200) console.log('server list: ' + t.slice(0, 120)); }); });
    r.on('error', e => console.log('server list unreachable: ' + e.message)); r.on('timeout', () => r.destroy()); r.end(b); };
  setTimeout(post, 3000).unref(); setInterval(post, 30000).unref();
}
async function api(req, res, u) {
  cors(req, res); if (req.method === 'OPTIONS') { res.statusCode = 204; return res.end(); }
  if (req.headers.origin && !originOk(req.headers.origin)) return json(res, 403, { err: 'origin not allowed' });
  const ip = clientIp(req);
  try {
    if (u === '/servers') return json(res, 200, { servers: CFG.registry || CFG.pub ? serverList() : [] });   // empty list rather than a 404 (browsers log 404s)
    if (u === '/announce' && req.method === 'POST' && CFG.registry) { const r = await announce(await body(req, 2048), ip); return json(res, r.err ? 400 : 200, r); }
    if (!ACC) return json(res, 404, { err: 'accounts are off on this server' });
    if (u === '/api/register' && req.method === 'POST') { const m = await body(req, 2048), r = await ACC.register(m.name, m.pass, ip, xpdb[String(m.name || '').toLowerCase()]); if (!r.err) { delete xpdb[String(m.name).toLowerCase()]; xpDirty = true; } return json(res, r.err ? 400 : 200, r); }   // callsign XP moves to the new account
    if (u === '/api/login' && req.method === 'POST') { const m = await body(req, 2048), r = await ACC.login(m.name, m.pass, ip); return json(res, r.err ? 401 : 200, r); }
    if (u === '/api/logout' && req.method === 'POST') { const m = await body(req, 2048); ACC.logout(String(m.token || '')); return json(res, 200, { ok: 1 }); }
    if (u === '/api/record') { const n = String(new URL(req.url, 'http://x').searchParams.get('n') || '').slice(0, 16).toLowerCase(); const xp = n && Object.prototype.hasOwnProperty.call(xpdb, n) ? +xpdb[n] || 0 : 0; return json(res, 200, { xp, rank: T.rankOf(xp), lv: T.levelOf(xp).lv }); }   // v0.34: a guest callsign's service record for the start screen
    if (u === '/api/me') { const t = new URL(req.url, 'http://x').searchParams.get('token'), a = ACC.session(t); return a ? json(res, 200, { name: a.name, xp: a.xp || 0, rank: T.rankOf(a.xp || 0) }) : json(res, 401, { err: 'not logged in' }); }
  } catch (e) { return json(res, 400, { err: 'bad request' }); }
  json(res, 404, { err: 'not found' });
}
const server = http.createServer((req, res) => {
  const u = req.url.split('?')[0];
  if (u === '/health') { cors(req, res); return json(res, 200, info()); }
  if (u.startsWith('/api/') || u === '/servers' || u === '/announce') return api(req, res, u);
  if (u === '/vendor/three.min.js') return fs.readFile(path.join(__dirname, 'public', 'vendor', 'three.min.js'), (err, data) => { if (err) { res.statusCode = 404; return res.end('not found'); } res.setHeader('content-type', 'text/javascript; charset=utf-8'); res.setHeader('cache-control', 'public, max-age=604800'); res.end(data); });
  if (u.startsWith('/assets/')) {   // static art: flat whitelist, no sub-paths
    const nm = u.slice(8), ext = path.extname(nm), ct = { '.png': 'image/png', '.json': 'application/json', '.mp3': 'audio/mpeg' }[ext];
    if (!ct || !/^[A-Za-z0-9_]+\.(png|json|mp3)$/.test(nm)) { res.statusCode = 404; return res.end('not found'); }
    return fs.readFile(path.join(__dirname, 'public', 'assets', nm), (err, data) => { if (err) { res.statusCode = 404; return res.end('not found'); } res.setHeader('content-type', ct); res.setHeader('cache-control', 'public, max-age=3600'); res.end(data); });
  }
  if (u.startsWith('/launcher/') || u === '/download') return launcherFile(req, res, u === '/download' ? null : u.slice(10));
  const f = FILES[u]; if (!f) { res.statusCode = 404; return res.end('not found'); }
  fs.readFile(path.join(__dirname, f[0]), (err, data) => { if (err) { res.statusCode = 500; return res.end('missing ' + f[0]); } res.setHeader('content-type', f[1]); res.setHeader('cache-control', 'no-cache');
    if (f[0] === 'public/index.html') data = Buffer.from(data.toString('utf8').split('__T128_VERSION__').join(VERSION));   // v0.40: the page shows the version it was served as
    res.end(data); });
});
// Windows launcher downloads and self-updates (v0.29.1): put the files electron-builder makes (latest.yml, the Setup .exe and
// its .blockmap) in public/launcher/. /download sends the newest installer, for a website's download button.
function launcherFile(req, res, nm) {
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.statusCode = 405; return res.end(); }
  const dir = path.join(__dirname, 'public', 'launcher');
  if (nm == null) {   // newest installer, named in latest.yml
    return fs.readFile(path.join(dir, 'latest.yml'), 'utf8', (err, y) => {
      const m = !err && /^path:\s*([A-Za-z0-9][A-Za-z0-9._-]*\.exe)\s*$/m.exec(y);
      if (!m && CFG.launcherUrl) { res.statusCode = 302; res.setHeader('location', CFG.launcherUrl); res.setHeader('cache-control', 'no-cache'); return res.end(); }   // the installer published on GitHub
      if (!m) { res.statusCode = 404; return res.end('no launcher published yet'); }
      res.statusCode = 302; res.setHeader('location', '/launcher/' + m[1]); res.setHeader('cache-control', 'no-cache'); res.end();
    });
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*\.(yml|exe|blockmap)$/.test(nm) || nm.includes('..')) { res.statusCode = 404; return res.end('not found'); }
  const fp = path.join(dir, nm);
  fs.stat(fp, (err, st) => {
    if (err || !st.isFile()) { res.statusCode = 404; return res.end('not found'); }
    res.setHeader('content-type', nm.endsWith('.yml') ? 'text/yaml; charset=utf-8' : 'application/octet-stream'); res.setHeader('content-length', st.size);
    res.setHeader('cache-control', nm.endsWith('.yml') ? 'no-cache' : 'public, max-age=86400'); res.setHeader('x-content-type-options', 'nosniff');
    if (nm.endsWith('.exe')) res.setHeader('content-disposition', 'attachment; filename="' + nm + '"');
    if (req.method === 'HEAD') return res.end();
    const rs = fs.createReadStream(fp); rs.on('error', () => res.destroy()); rs.pipe(res);
  });
}
const perIp = new Map();
server.on('upgrade', (req, socket) => {
  const key = req.headers['sec-websocket-key'];
  if (!key || String(req.headers.upgrade).toLowerCase() !== 'websocket') return socket.destroy();
  if (!originOk(req.headers.origin)) { socket.end('HTTP/1.1 403 Forbidden\r\n\r\n'); return; }
  const ip = clientIp(req), n = perIp.get(ip) || 0; if (n >= CFG.perIp) { socket.end('HTTP/1.1 429 Too Many Requests\r\n\r\n'); return; }
  perIp.set(ip, n + 1); socket.once('close', () => { const k = (perIp.get(ip) || 1) - 1; if (k > 0) perIp.set(ip, k); else perIp.delete(ip); });
  const acc = crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + acc + '\r\n\r\n');
  socket.setNoDelay(true);
  const c = { socket, open: true, buf: Buffer.alloc(0), player: null, msgs: 0, frags: null };
  socket.on('data', d => wsData(c, d)); socket.on('close', () => { if (c.open) { c.open = false; onClose(c); } }); socket.on('error', () => { });
});

fs.mkdirSync(path.join(__dirname, 'public'), { recursive: true });
VEHM = require('./vehicles.js')({ aaDps: (team, x, z) => aaFor(1 - team).filter(a => Math.hypot(a.x - x, a.z - z) < AA_R).length * AA_DPS * 1.6, T, ents, humans, DT, TICK, terr: () => terr, tickNo: () => tickNo, damage, explode, send, bcast, tell, teamTell, addXp, supply: () => supply, fireBullet,
  forNear, op: () => op, opTarget, lineZ, spawnLine, wave: () => wave, removeFort, alert, smokeBlocks, sightAt, addCrew, homeZ, faceYaw, later, killFeedRaw });
T.WX.k = pickWx();
NAV.rebuild(); fillBots(); op = newOp(0); wave.side = op.att; roundStartExtras();   // bots and flag guards exist before the first tick, so guards start on their flag
if (process.env.T128_FAST) { const run = () => { for (let i = 0; i < 20; i++) { try { tick(); } catch (e) { console.error('tick error', e); } } setImmediate(run); }; setImmediate(run); }   // simulation fast-forward (balance tests)
else setInterval(() => { try { tick(); } catch (e) { console.error('tick error', e); } }, 1000 / TICK);
server.listen(PORT, () => console.log(`Trench 128 v${VERSION} "${CFG.name}" on http://localhost:${PORT}  (fill ${FILL}/team, ${SLOTS} human slots/team, accounts ${CFG.accounts}${CFG.registry ? ', server list' : ''}${CFG.master ? ', listed at ' + CFG.master : ''}, data ${CFG.data})`));
if (!process.argv.includes('--no-fetch') && !process.env.T128_TEST && !process.env.T128_FAST) { try { const v = require('./scripts/fetch-three.js'); if (!fs.existsSync(v.OUT)) v.fetchThree(true).catch(() => { }); } catch (e) { } }   // ship three.js with the game
process.on('uncaughtException', e => console.error('uncaught', e && e.stack || e));   // log and keep the server up
process.on('unhandledRejection', e => console.error('unhandled rejection', e && e.stack || e));
function shutdown() { saveXp(); if (ACC) ACC.flush(); setTimeout(() => process.exit(0), 150); }
process.on('SIGINT', shutdown); process.on('SIGTERM', shutdown);   // docker stop / systemctl stop save XP and accounts first
module.exports = { _test: { finishHit, pistolFire, PISTOL, DOWN_HP, buildGrid, bulletsTick, bullets, processCmds, creditKill, medicTarget, medicSee, fortSpawn, buildAct, onAct, rgFit, rgUnload, fireRifleGrenade, rgAim, grenades, aboxes: () => aboxes, abilityAct, dropAmmo, aboxTick, morphine, botAbility, grMax, bdMax, BSTAT, terr: () => terr, setHome: f => { home = f; }, flagSpawnOk, spawnEnt, planes, AAS, planesTick, planeHurt, planeLaunch, aaWreck, TUN, tunnelAct, tunBlow, supCd: () => supCd, phoneSet, phoneAct, phoneAutofix, phoneUp, phoneCut, workAct, nestAutofix, nestWreck, resetRound, mapSeed: () => mapSeed, nextMap: () => nextMap, rejoins, CFG, ACC, serverList, listed, pushSmoke, enemiesNear, reviveAct, SQS: () => SQS, BSTAT, alarms, raiseAlarm, botGrenade, botChargeStart, shelterFor, kitTick, callMedic, finishDown, downEnt, blowBay, craters: () => craters, KSTAT, VEHM: () => VEHM, ekits, eliteStock, takeElite, giveElite, eliteErrands, flameJet, fires, firesTick, flares, flareAt, fireFlare, sightAt, setWx, pickWx, nightFlares, addCrew, onAct, processCmds: p => processCmds(p), maxHp, lookByte, homeZ, tickNo: () => tickNo, op: () => op, OPS, sectorFalls, battalionLost, terrH: () => terr.H, navStats: () => NAV.stats(), SQS: () => SQS, crewForts, botBuildTick, fortComplete, navMove, NAV, killEnt, bodies, damage, reviveEnt, kitTick, explode, trace, NESTS, st, scoreRows, report, pingAct, maskAct, masked, throwUtil, endRound, histAt, histTick, snapshot, LAGC_MAX, reconSpot, DP, cmdPts: () => cmdPts, setCmd: (t, v) => { cmdPts[t] = v; }, smokes, gases, recons, marks, smokeBlocks, SQM, sqmOf, isBroken, moraleTick, moraleBoost, tierOf, vis, visTick, markAct, aiOrderTick, assignRaiders, depotsTick, callSupport, goal, bullets, bulletsTick, fireBullet, bulletStep, meleeStrike, suppress, fireWeapon, dropPara, assignGuards, mount, dismount, fortMsg, posts: () => posts, OB, ents, humans, orders, crates, supply: () => supply, setSupply: (t, v) => { supply[t] = v; } } };
