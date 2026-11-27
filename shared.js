'use strict';
// Trench 128 - shared simulation data. Loaded by BOTH the Node server and the browser client,
// so terrain, movement and stat tables can never drift apart.
(function (root) {
// v0.21: 320 m square (was 240). Lines meander and the line objectives are staggered along them.
let S = 400, N = 800, ST = S / N, W = S / 2, NV = (N + 1) * (N + 1);
// v0.43 imported maps: the world can be another size (Wake Atoll is 800 m at 1 m). The size is fixed for the life of a page
// (the client caches W/N/ST at load and reloads for a new map); the server re-reads them through the API getters.
function setWorld(size, res) { S = size; N = res; ST = S / N; W = S / 2; NV = (N + 1) * (N + 1); }
const WAKE_SEED = 1000000001;   // the seed number that means "the Wake Atoll map" (it is not a layout roll)
let HM = null;                  // imported heightmap: Float32Array (N+1)^2 in metres, sea at 0
function hmSample(x, z) { const u = (x + W) / ST, v = (z + W) / ST, i = Math.max(0, Math.min(N - 1, Math.floor(u))), j = Math.max(0, Math.min(N - 1, Math.floor(v))), a = Math.max(0, Math.min(1, u - i)), b = Math.max(0, Math.min(1, v - j)), k = j * (N + 1) + i; return HM[k] * (1 - a) * (1 - b) + HM[k + 1] * a * (1 - b) + HM[k + N + 1] * (1 - a) * b + HM[k + N + 2] * a * b; }
const SEA_WADE = -1.25;         // a man wades until the seabed is this far under the surface; deeper water is a wall (and nav blocks it)
const isSea = (H, x, z) => MP.kind === 'wake' && hAt(H, x, z) < SEA_WADE;
const FL = [100, 64, 30, -30, -64, -100], CT = [], GAPS = [];
const CZ0 = 28, CZ1 = 104, HOME_Z = 140, NML = 44;     // communication trenches run |z| CZ0..CZ1; home bases at ±HOME_Z; no-man's land |z| < NML
const OBX = [];                                         // objective x along each line (zig-zag instead of a straight column)
// team 0 = blue (holds +z), team 1 = red (holds -z)
const tri = x => Math.abs(((x / 7) % 2 + 2) % 2 - 1) * 2.4 - 1.2;
// v0.30 procedural maps: setMap(seed) re-rolls the layout below (seed 0 = the classic map). MP holds the per-map numbers.
const MP = { seed: 0, ph1: 0, ph2: 0, a1: 1, a2: 1, gx: 0, gz: 0, hs: 0, kind: 'trench', meta: null };   // kind: 'trench' (the generated lines) or 'wake' (imported island); meta: the imported map's json
const mea = (t, x) => 6 * MP.a1 * Math.sin(x * .041 + t * .37 + MP.ph1) + 2.5 * MP.a2 * Math.sin(x * .097 + t * 1.3 + MP.ph2);   // the line's long bends
const trenchC = (t, x) => t + tri(x) + mea(t, x);         // centre line z of line t at x (bends + zig-zag bays)
const trenchSlope = (t, x) => (trenchC(t, x + 1) - trenchC(t, x - 1)) / 2;
const sgn = t => t > 0 ? -1 : 1;                          // enemy direction along z: u = (z - c) * sgn
const NEST = [], HQS = [], LIGHTS = [];
// v0.26 crewed guns: two field guns behind each reserve line, two trench mortars in pits behind each support line
const EMPL = [], OBJ = [];
const LINES = ['1 · Blue Reserve', '2 · Blue Support', '3 · Blue Front', '4 · Green Front', '5 · Green Support', '6 · Green Reserve'];
const SQUADS = ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot', 'Golf', 'Hotel', 'India', 'Juliet', 'Kilo', 'Lima', 'Mike', 'November', 'Oscar', 'Papa'];

const hash = (a, b) => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); };
const hsh = (a, b) => hash(a + MP.hs, b - MP.hs * .7);   // the map's own shell holes and collapsed bays (salted per map)
const wireK0 = (x, z) => { const t = z > 0 ? 30 : -30, u = (z - trenchC(t, x)) * sgn(t); return u > 8.5 && u < 13.5 && GAPS.every(g => Math.abs(x - g) > 5) ? .4 : 1; };   // wire belt 8.5-13.5 m in front of each front line
const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;

// ---- trench cross-section. u = metres from the trench centre line toward the ENEMY (negative = our back side).
// Pairs of (u, drop below natural ground). Floor, a fire step on the enemy side, steep revetted walls.
const TP = [[-2.1, 0], [-1.5, -2.4], [.3, -2.4], [1.6, -1.0], [2.2, -1.0], [2.6, 0]];
const CP = [[0, -2.4], [.8, -2.4], [1.4, 0]];            // communication trench (|offset| -> drop)
const FS_TOP = -1.0, TR_FLOOR = -2.4;
function prof(P, u) { if (u <= P[0][0]) return P[0][1]; for (let i = 1; i < P.length; i++) if (u <= P[i][0]) { const a = P[i - 1], b = P[i]; return a[1] + (b[1] - a[1]) * (u - a[0]) / (b[0] - a[0]); } return P[P.length - 1][1]; }

const MINES = [];   // two mine craters in no-man's land: x, z, radius, depth
const smoothG = (x, z) => Math.sin(x * .05 + MP.gx) * .9 + Math.cos(z * .07 + x * .03 + MP.gz) * .7 + Math.sin(x * .13 + z * .11) * .3 - (Math.abs(z) < NML ? .8 * (1 - Math.abs(z) / NML) : 0);   // the ground without shell holes
function base(x, z) {
  let h = Math.sin(x * .05 + MP.gx) * .9 + Math.cos(z * .07 + x * .03 + MP.gz) * .7 + Math.sin(x * .13 + z * .11) * .3; const az = Math.abs(z);
  if (az < NML) h -= .8 * (1 - az / NML);
  for (const m of MINES) { const d = Math.hypot(x - m[0], z - m[1]); if (d < m[2]) h -= m[3] * Math.pow(Math.cos(d / m[2] * Math.PI / 2), 1.6); else if (d < m[2] * 1.45) h += 1.3 * (1 - (d - m[2]) / (m[2] * .45)); }   // mine craters
  const cx = Math.floor(x / 12), cz = Math.floor(z / 12);
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
    const a = cx + i, b = cz + j;
    if (hsh(a, b) < (Math.abs((b + .5) * 12) < NML + 2 ? .5 : .2)) {   // shelled everywhere, worst in no-man's land
      const big = hsh(a + 3, b + 7) < .12, px = (a + hsh(b, a)) * 12, pz = (b + hsh(a + 9, b)) * 12, R = (1.5 + hsh(a, b + 5) * 2.2) * (big ? 1.8 : 1), d = Math.hypot(x - px, z - pz);
      if (Math.abs(pz) < 50 && GAPS.some(g => Math.abs(px - g) < R + 3)) continue;   // the wire-gap lanes are kept clear
      if (d < R) h -= 1.7 * Math.pow(Math.cos(d / R * Math.PI / 2), 2); else if (d < R * 1.3) h += .4 * (1 - (d - R) / (R * .3));
    }
  }
  if (az < NML + 22) {   // a second, finer layer of small shell holes around no-man's land and the front lines
    const ex = Math.floor(x / 7), ez = Math.floor(z / 7);
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
      const a = ex + i, b = ez + j; if (hsh(a + 51, b - 13) > (Math.abs((b + .5) * 7) < NML ? .55 : .3)) continue;
      const px = (a + hsh(b + 4, a + 8)) * 7, pz = (b + hsh(a + 2, b + 6)) * 7, R = .8 + hsh(a - 3, b + 11) * 1.1, d = Math.hypot(x - px, z - pz);
      if (Math.abs(pz) < 50 && GAPS.some(g => Math.abs(px - g) < R + 3)) continue;
      if (d < R) h -= .9 * Math.pow(Math.cos(d / R * Math.PI / 2), 2); else if (d < R * 1.35) h += .22 * (1 - (d - R) / (R * .35));
    }
  }
  return h;
}

// ---- dugouts: roofed rooms cut into the rear wall of every line, entered through a door from the trench.
// Terrain holds the pit (walls are terrain); the roof is a slab handled in groundAt / step / los.
const ROOM_X = [];
const ROOMS = [];
function buildRooms() {
  ROOMS.length = 0;
  for (const t of FL) {
    const sg = sgn(t);
    for (const xc of ROOM_X) {
      const c = trenchC(t, xc), zf = c - sg * 2.9, zb = c - sg * 7.4, zr0 = c - sg * 2.3, zr1 = c - sg * 8.0;
      const r = { t, xc, sg, c, x0: xc - 3.1, x1: xc + 3.1, z0: Math.min(zr0, zr1), z1: Math.max(zr0, zr1), fx0: xc - 2.5, fx1: xc + 2.5, fz0: Math.min(zf, zb), fz1: Math.max(zf, zb) };
      if (Math.abs(t) === 30 && NEST.some(n => n.team === (t > 0 ? 0 : 1) && Math.abs(n.x - xc) < 10)) continue;
      if (HQS.some(q => Math.abs(q.x - xc) < 6 + 4 && Math.abs(q.z - (r.z0 + r.z1) / 2) < 4.5 + 4)) continue;
      r.fy = Math.max(base(xc, c - sg * 3), base(xc, c) - .3) + TR_FLOOR; r.rb = r.fy + 2.3; r.rt = r.fy + 2.9; ROOMS.push(r);   // on a falling hillside the floor stays level with the trench (no ledge at the door)
    }
  }
}
const boxDist = (x, z, x0, x1, z0, z1) => Math.hypot(Math.max(x0 - x, 0, x - x1), Math.max(z0 - z, 0, z - z1));
const FLATZONE = 4;

// some 9 m bays of every line have been blown in (not at dugouts, MG nests, wire gaps or objectives)
function collapsed(t, cell) {
  if (hsh(cell + 17, t * 3.1) > .11) return 0;
  const xc = (cell + .5) * 9 - W;
  if (ROOM_X.some(r => Math.abs(r - xc) < 10) || GAPS.some(g => Math.abs(g - xc) < 8) || NEST.some(n => Math.abs(n.x - xc) < 9) || OBX.some((ox, i) => FL[i] === t && Math.abs(ox - xc) < 12)) return 0;
  return .45 + hsh(cell, t) * .2;
}
function gen(x, z) {
  if (MP.kind === 'wake') return hmSample(x, z);
  const b = base(x, z); let h = b, az = Math.abs(z), mound = 0;
  for (const t of FL) {
    if (Math.abs(z - t) > 18) continue;
    const sg = sgn(t), c = trenchC(t, x), u = (z - c) * sg; if (Math.abs(u) > 9) continue;
    let d = prof(TP, u), m = 0;
    const cell = Math.floor((x + W) / 9), cf = collapsed(t, cell);
    if (cf) { const e = clamp01(1 - Math.abs((x + W) - (cell + .5) * 9) / 4.5); d *= 1 - cf * Math.min(1, e * 1.6); }   // shell-collapsed bay: half filled with spoil
    if (u > 2.6 && u < 4.6) m = .45 * (1 - (u - 2.6) / 2); else if (u < -2.1 && u > -3.9) m = .5 * (1 - (-u - 2.1) / 1.8);
    for (const g of GAPS) {                                // scaling ramps out of the trench at the wire gaps (both sides)
      const w = clamp01((1.5 - Math.abs(x - g)) / .5); if (!w) continue;
      let dr = d; if (u > 1.6) dr = FS_TOP * (1 - clamp01((u - 1.6) / 2.0)); else if (u < -1.5) dr = TR_FLOOR * (1 - clamp01((-1.5 - u) / 2.4));
      d += w * (dr - d); m *= 1 - w;
    }
    h = Math.min(h, b + d); mound += m;
  }
  if (az > CZ0 - 8 && az < CZ1 + 8) for (const t of CT) {
    const lo = Math.abs(trenchC(z > 0 ? 30 : -30, t)) - 1, hi = Math.abs(trenchC(z > 0 ? 100 : -100, t)) + 3;
    const f = clamp01(Math.min(az - lo, hi - az) / 3.2), w = Math.abs(x - (t + tri(z))); if (f <= 0) continue;
    h = Math.min(h, b + prof(CP, w) * f);
  }
  for (const r of ROOMS) {
    if (x < r.x0 - 2 || x > r.x1 + 2 || z < Math.min(r.z0, r.z1) - 2 || z > Math.max(r.z0, r.z1) + 2) continue;
    const dm = boxDist(x, z, r.fx0, r.fx1, r.fz0, r.fz1);
    const dd = boxDist(x, z, r.xc - 1, r.xc + 1, Math.min(r.c - r.sg * 3.4, r.c - r.sg * 1.5), Math.max(r.c - r.sg * 3.4, r.c - r.sg * 1.5));
    const dist = Math.min(dm, dd); if (dist < .5) { h = Math.min(h, r.fy + (b - r.fy) * clamp01(dist / .5)); mound *= clamp01(dist / .5); }   // the parados heap stops at the dugout: flat floor, open door
  }
  h += mound;
  for (const n of NEST) { const d = Math.hypot(x - n.x, z - n.z); if (d < 5) h += 1.1 * Math.pow(Math.cos(d / 5 * Math.PI / 2), 2); }
  for (const q of HQS) { const dx = Math.abs(x - q.x), dz = Math.abs(z - q.z); if (dx < 6 && dz < 4.5) h -= 1.5 * Math.min(1, (6 - dx) / 2, (4.5 - dz) / 1.5); }
  for (const q of EMPL) {   // gun pits: levelled ground with an earth berm in front (field guns), a dug pit with a raised lip (mortars)
    const dx = x - q.x, dz = z - q.z, d = Math.hypot(dx, dz), R = q.k === 'fgun' ? 7 : 5.5; if (d > R) continue;
    const lv = smoothG(q.x, q.z), w = clamp01((R - d) / 2.2); h = h * (1 - w) + lv * w;
    if (q.k === 'fgun') { const fw = (-Math.sin(q.yaw) * dx - Math.cos(q.yaw) * dz) / (d || 1); if (d > 3.2 && d < 5.2 && fw > .45) h += .75 * Math.sin((d - 3.2) / 2 * Math.PI) * clamp01((fw - .45) * 3); }
    else if (d < 2.2) h = lv - .95; else if (d < 3.3) h = lv - .95 + 1.45 * clamp01((d - 2.2) / .6) - .5 * clamp01((d - 2.8) / .5);
  }
  return h;
}

// Trench floors and fire steps are (almost) shell-proof (v0.29): a crater can dent them by at most FLOOR_GIVE, so the trench
// stays walkable. Walls, parapets and open ground crater as before. F0 holds the generated height of those floor points.
const FLOOR_GIVE = .12, DIG_MAX = 1.2, RIM_MAX = .45;   // v0.29: deepest crater / highest spoil heap relative to the generated map
let FLOOR = null, PRISTINE = null;   // floor mask and the generated heightmap: the same every round, so built once
function makeTerrain() {
  if (PRISTINE) return { H: PRISTINE.slice(), D: new Float32Array(NV).fill(1), F0: PRISTINE };   // a fresh round: copy, don't regenerate (was a 0.75 s freeze)
  const H = new Float32Array(NV), D = new Float32Array(NV).fill(1), mk = !FLOOR;
  if (mk) FLOOR = new Uint8Array(NV);
  for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) {
    const x = -W + i * ST, z = -W + j * ST, k = j * (N + 1) + i, h = H[k] = gen(x, z); if (!mk || MP.kind === 'wake') continue;
    const d = h - base(x, z); let fl = d <= TR_FLOOR + .1;                       // main floor (fire trenches and communication trenches)
    if (!fl && Math.abs(d - FS_TOP) < .12) for (const t of FL) { if (Math.abs(z - t) > 14) continue; const u = (z - trenchC(t, x)) * sgn(t); if (u > 1.6 && u < 2.2) { fl = true; break; } }   // fire step
    FLOOR[k] = fl ? 1 : 0;
  }
  PRISTINE = H.slice(); return { H, D, F0: PRISTINE };
}
function hAt(H, x, z) {
  const u = (x + W) / ST, v = (z + W) / ST, i = Math.floor(u), j = Math.floor(v); if (i < 0 || j < 0 || i >= N || j >= N) return 0;
  const a = u - i, b = v - j, k = j * (N + 1) + i;
  return H[k] * (1 - a) * (1 - b) + H[k + 1] * a * (1 - b) + H[k + N + 1] * (1 - a) * b + H[k + N + 2] * a * b;
}
// Crater / foxhole. Pure function of (terrain, args): server and client apply the same events and stay identical.
// Dugouts are shell-proof: no crater, rim spoil or fill changes the ground under a roof slab or in its doorway, so a room always keeps
// its floor and headroom and its door stays open (otherwise men got pinned between a raised floor and the roof).
function guarded(x, z) {
  for (const r of ROOMS) {
    if (x >= r.x0 - .6 && x <= r.x1 + .6 && z >= r.z0 - .6 && z <= r.z1 + .6) return true;
    if (Math.abs(x - r.xc) < 1.7 && (z - r.c) * r.sg <= -1 && (z - r.c) * r.sg >= -3.6) return true;   // door passage from the trench
  }
  for (const q of HQS) if (Math.abs(x - q.x) < 6.5 && Math.abs(z - q.z) < 5) return true;   // HQ shelters stand on solid ground
  for (const n of NEST) if (Math.hypot(x - n.x, z - n.z) < 3.4) return true;                  // MG nests: their sandbag ring stays put
  for (const q of EMPL) if (Math.hypot(x - q.x, z - q.z) < (q.k === 'fgun' ? 6 : 4.5)) return true;   // gun and mortar pits
  return false;
}
function dig(T, cx, cz, r, dep) {
  const H = T.H, D = T.D, R = r * 1.4, near = ROOMS.some(q => cx + R > q.x0 - 2 && cx - R < q.x1 + 2 && cz + R > q.z0 - 2 && cz - R < q.z1 + 2) || HQS.some(q => Math.abs(cx - q.x) < 6.5 + R && Math.abs(cz - q.z) < 5 + R) || NEST.some(n => Math.hypot(cx - n.x, cz - n.z) < 3.4 + R) || EMPL.some(q => Math.hypot(cx - q.x, cz - q.z) < 6 + R);
  const i0 = Math.max(0, Math.floor((cx - r * 1.4 + W) / ST)), i1 = Math.min(N, Math.ceil((cx + r * 1.4 + W) / ST));
  const j0 = Math.max(0, Math.floor((cz - r * 1.4 + W) / ST)), j1 = Math.min(N, Math.ceil((cz + r * 1.4 + W) / ST));
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    const k = j * (N + 1) + i, d = Math.hypot(-W + i * ST - cx, -W + j * ST - cz);
    if (near && d < r * 1.4 && guarded(-W + i * ST, -W + j * ST)) continue;
    if (d < r) { const f = Math.pow(Math.cos(d / r * Math.PI / 2), 2); H[k] -= dep * f; D[k] = Math.min(D[k], 1 - .45 * f); }
    else if (d < r * 1.4) H[k] += dep * .22 * (1 - (d - r) / (r * .4));
    else continue;
    if (!T.F0) continue;
    if (FLOOR[k]) H[k] = Math.max(T.F0[k] - FLOOR_GIVE, Math.min(T.F0[k] + FLOOR_GIVE, H[k]));   // trench floor: dented, never blown out
    else H[k] = Math.max(T.F0[k] - DIG_MAX, Math.min(T.F0[k] + RIM_MAX, H[k]));             // anywhere: craters stack, but never into pits that trap men and tanks
  }
}
// Roofs: a slab over each dugout. Standing on it (feet near the top) the roof is the ground; below it the room floor is.
function roomAt(x, z) { for (const r of ROOMS) if (x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1) return r; return null; }
function groundAt(H, x, z, y) { let g = hAt(H, x, z); const r = roomAt(x, z); if (r && y >= r.rt - .7 && r.rt > g) g = r.rt; return g; }
const inRoof = (x, y, z) => { const r = roomAt(x, z); return !!r && y >= r.rb && y <= r.rt; };
const inRoom = (x, y, z) => { const r = roomAt(x, z); return r && y < r.rb ? r : null; };
// ---- sandbag walls on the enemy-side parapet of every trench line (solid for walking, bullets and sight; jump or climb over them)
const SB = [], SBG = new Map(), SB_H = .8;
function buildSB() {
  SB.length = 0; SBG.clear();
  const hs = (a, b) => { const v = Math.sin((a + MP.hs) * 12.9898 + b * 78.233) * 43758.5453; return v - Math.floor(v); };
  for (const t of FL) {
    const sg = sgn(t);
    for (let x = -W + 2; x < W - 2; x += 1.8) {
      if (GAPS.some(g => Math.abs(x - g) < 6)) continue;
      if (hs(Math.floor((x + W) / 7.2), t + 3) < .26) continue;      // breaches: 4-bag groups missing
      if (collapsed(t, Math.floor((x + W) / 9))) continue;
      const z = trenchC(t, x) + sg * 3.3;
      if (NEST.some(n => Math.hypot(n.x - x, n.z - z) < 5) || HQS.some(n => Math.hypot(n.x - x, n.z - z) < 7)) continue;
      SB.push({ x, z, hx: .95, hz: .4, t, cell: Math.floor((x + W) / 9), gone: false });
    }
  }
  for (const b of SB) { const k = Math.floor(b.x / 8); if (!SBG.has(k)) SBG.set(k, []); SBG.get(k).push(b); }
}
// ---- v0.26/v0.27 dynamic destruction: a heavy shell landing in a trench can blow the 9 m bay in. The bay half fills with spoil
// (same shape as the bays collapsed at map generation), its sandbags and revetments are gone. Server and client apply the same
// events in the same order (they ride in the crater list as ['b', line, cell]), so the terrain stays identical.
const BAYS = new Set();
function bayOK(t, cell) {
  if (collapsed(t, cell) || BAYS.has(t * 1000 + cell)) return false;
  const xc = (cell + .5) * 9 - W;
  if (Math.abs(xc) > W - 6 || ROOM_X.some(r => Math.abs(r - xc) < 10) || GAPS.some(g => Math.abs(g - xc) < 8) || OBX.some((ox, i) => FL[i] === t && Math.abs(ox - xc) < 12)) return false;
  return !NEST.some(n => Math.abs(n.x - xc) < 9 && Math.abs(n.z - trenchC(t, n.x)) < 6) && !EMPL.some(q => Math.abs(q.x - xc) < 10 && Math.abs(q.z - trenchC(t, q.x)) < 14);
}
function collapseBay(Tr, t, cell) {
  const H = Tr.H, D = Tr.D, sg = sgn(t), x0 = cell * 9 - W, xc = x0 + 4.5, cf = .62;
  BAYS.add(t * 1000 + cell); for (const b of SB) if (b.t === t && b.cell === cell) b.gone = true;
  const i0 = Math.max(0, Math.floor((x0 - .5 + W) / ST)), i1 = Math.min(N, Math.ceil((x0 + 9.5 + W) / ST)), j0 = Math.max(0, Math.floor((t - 20 + W) / ST)), j1 = Math.min(N, Math.ceil((t + 20 + W) / ST));
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    const x = -W + i * ST, z = -W + j * ST, u = (z - trenchC(t, x)) * sg; if (u < -2.2 || u > 2.7) continue;
    if (guarded(x, z)) continue;
    const e = clamp01(1 - Math.abs(x - xc) / 4.5), k = j * (N + 1) + i, fill = base(x, z) + prof(TP, u) * (1 - cf * Math.min(1, e * 1.6));
    if (H[k] < fill) { H[k] = fill; D[k] = Math.min(D[k], .78 + .1 * hash(i, j)); }
  }
}
function resetBays() { BAYS.clear(); for (const b of SB) b.gone = false; }
const applyEv = (Tr, c) => c[0] === 'b' ? collapseBay(Tr, c[1], c[2]) : dig(Tr, c[0], c[1], c[2], c[3]);   // a crater-list entry
function sbHit(H, x, y, z, r) {
  r = r || 0; const k = Math.floor(x / 8);
  for (let d = -1; d <= 1; d++) { const a = SBG.get(k + d); if (a) for (const b of a) if (!b.gone && Math.abs(x - b.x) < b.hx + r && Math.abs(z - b.z) < b.hz + r && y < hAt(H, b.x, b.z) + SB_H - .08) return b; }
  return null;
}
// ---- player-built fortifications. The server owns the list; clients mirror it (events fo/fa/fx) so prediction, sight and drawing agree.
// Local frame of a structure: lz points the way the builder faced (toward the enemy), lx to the builder's right.
const FORT = {
  bags: { n: 'Sandbag pile', cost: 2, hp: 220, work: 0, small: 1, ahead: 1.8 },
  wire: { n: 'Barbed wire', cost: 2, hp: 120, work: 0, small: 1, ahead: 2.2 },
  cover: { n: 'Makeshift cover', cost: 1, hp: 160, work: 0, small: 1, ahead: 1.6 },
  redoubt: { n: 'Sandbag redoubt', cost: 14, hp: 900, work: 10, sapper: 1, ahead: 5, mat: 'bag' },
  blockhouse: { n: 'Timber blockhouse', cost: 22, hp: 1300, work: 16, sapper: 1, ahead: 5.5, mat: 'wood' },
  pillbox: { n: 'Concrete pillbox', cost: 32, hp: 2200, work: 24, sapper: 1, ahead: 5, mat: 'stone' },
};
const SL0 = 1.3, SL1 = 1.75;   // firing-slit band: crouching hides you completely, standing shows only your head
// a straight wall from a0 to a1 along local x (along='x', at lz=c) or local z (along='z', at lx=c); slits = centres of 0.8 m holes in the SL0..SL1 band
function wall(out, along, c, a0, a1, th, slits, top, mat, sw) {
  const B = (m0, m1, y0, y1) => { if (m1 - m0 < .05 || y1 - y0 < .05) return; const m = (m0 + m1) / 2, hm = (m1 - m0) / 2; out.push(along === 'x' ? [m, c, hm, th / 2, y0, y1, mat] : [c, m, th / 2, hm, y0, y1, mat]); };
  B(a0, a1, 0, Math.min(SL0, top)); if (top > SL1) B(a0, a1, SL1, top);
  if (top > SL0) { let a = a0; const w = (sw || .8) / 2; for (const sc of slits.slice().sort((p, q) => p - q)) { B(a, sc - w, SL0, Math.min(SL1, top)); a = sc + w; } B(a, a1, SL0, Math.min(SL1, top)); }
}
function fortParts(k) {
  const o = { boxes: [], nest: null, sp: null, wire: null, radio: null };   // radio: where the respawn point's field telephone stands (a back corner, out of the way)
  if (k === 'bags') o.boxes.push([0, 0, 1.0, .38, 0, .95, 'bag']);
  else if (k === 'cover') o.boxes.push([0, 0, .85, .22, 0, 1.25, 'wood']);
  else if (k === 'wire') o.wire = [0, 0, 2.6, .7];
  else if (k === 'redoubt') {   // open-topped sandbag walls, chest high with loopholes, MG in the middle of the front face
    const b = o.boxes, t = .7; wall(b, 'x', 3, -3.5, 3.5, t, [-2.2, 0, 2.2], 2.05, 'bag', .9);
    wall(b, 'z', -3.5, -2.65, 2.65, t, [.6], 2.05, 'bag'); wall(b, 'z', 3.5, -2.65, 2.65, t, [.6], 2.05, 'bag');
    wall(b, 'x', -3, -3.5, -1, t, [], 1.35, 'bag'); wall(b, 'x', -3, 1, 3.5, t, [], 1.35, 'bag');
    o.nest = [0, 2.0]; o.sp = [0, -1.2]; o.radio = [-2.55, -2.05];
  } else if (k === 'blockhouse') {   // log walls, roof, four front loopholes, side loopholes, MG at the right front corner
    const b = o.boxes, t = .45, top = 2.6; wall(b, 'x', 3, -4, 4, t, [-2.6, -.9, .9, 2.6], top, 'wood', .9);
    wall(b, 'z', -4, -2.8, 2.8, t, [0], top, 'wood'); wall(b, 'z', 4, -2.8, 2.8, t, [0], top, 'wood');
    wall(b, 'x', -3, -4, -.95, t, [], top, 'wood'); wall(b, 'x', -3, .95, 4, t, [], top, 'wood');   // v0.38: a 1.9 m doorway (was 1.4: easy to get stuck on)
    b.push([0, 0, 4.3, 3.3, top, top + .3, 'wood']);
    o.nest = [2.6, 2.0]; o.sp = [-1.5, -1.0]; o.radio = [-3.25, -2.25];
  } else if (k === 'pillbox') {   // thick concrete, three front embrasures (MG in the centre), side slits, heavy roof
    const b = o.boxes, t = .8, top = 2.5; wall(b, 'x', 3, -3, 3, t, [-1.8, 0, 1.8], top, 'stone', .9);
    wall(b, 'z', -3, -2.6, 2.6, t, [.4], top, 'stone'); wall(b, 'z', 3, -2.6, 2.6, t, [.4], top, 'stone');
    wall(b, 'x', -3, -3, -.9, t, [], top, 'stone'); wall(b, 'x', -3, .9, 3, t, [], top, 'stone');   // v0.38: 1.8 m doorway (was 1.3)
    b.push([0, 0, 3.4, 3.4, top, top + .5, 'stone']);
    o.nest = [0, 1.8]; o.sp = [0, -1.1]; o.radio = [-2.05, -2.0];
  }
  return o;
}
const toW = (f, lx, lz) => { const c = Math.cos(f.yaw), s = Math.sin(f.yaw); return [f.x + lx * c - lz * s, f.z - lx * s - lz * c]; };
const FORTS = new Map(), FGRID = new Map(), FWIRE = []; const FC = 6;
const fcell = (x, z) => Math.floor(x / FC) * 4096 + Math.floor(z / FC);
// f = {id, k, team, x, z, yaw, y, done (0..1), hp, spawn}. Collision only exists once a building is finished.
function fortWorld(f) {
  const P = fortParts(f.k), c = Math.cos(f.yaw), s = Math.sin(f.yaw);
  const boxes = P.boxes.map(b => { const [cx, cz] = toW(f, b[0], b[1]); return { cx, cz, c, s, hx: b[2], hz: b[3], y0: f.y + b[4], y1: f.y + b[5], mat: b[6], f }; });
  const nest = P.nest && (() => { const [x, z] = toW(f, P.nest[0], P.nest[1]); return { x, z, yaw: f.yaw }; })();
  const sp = P.sp && (() => { const [x, z] = toW(f, P.sp[0], P.sp[1]); return { x, z }; })();
  const wire = P.wire && (() => { const [cx, cz] = toW(f, P.wire[0], P.wire[1]); return { cx, cz, c, s, hx: P.wire[2], hz: P.wire[3], f }; })();
  const radio = P.radio && (() => { const [x, z] = toW(f, P.radio[0], P.radio[1]); return { x, z, yaw: f.yaw }; })();
  return { P, boxes, nest, sp, wire, radio };
}
function fortUnindex(f) {
  if (f.wb) for (const b of f.wb) for (const k of b.cells) { const a = FGRID.get(k); if (a) { const i = a.indexOf(b); if (i >= 0) a.splice(i, 1); if (!a.length) FGRID.delete(k); } }
  f.wb = null; const i = FWIRE.findIndex(w => w.f === f); if (i >= 0) FWIRE.splice(i, 1);
}
function addFort(f) {
  const old = FORTS.get(f.id); if (old) fortUnindex(old);
  FORTS.set(f.id, f); const w = fortWorld(f); f.nestW = w.nest; f.spW = w.sp;
  if (f.done >= 1) {
    f.wb = w.boxes;
    for (const b of w.boxes) { const R = Math.hypot(b.hx, b.hz) + .5; b.cells = []; for (let x = Math.floor((b.cx - R) / FC); x <= Math.floor((b.cx + R) / FC); x++) for (let z = Math.floor((b.cz - R) / FC); z <= Math.floor((b.cz + R) / FC); z++) { const k = x * 4096 + z; b.cells.push(k); if (!FGRID.has(k)) FGRID.set(k, []); FGRID.get(k).push(b); } }
    if (w.wire) FWIRE.push(w.wire);
  }
  return f;
}
function delFort(id) { const f = FORTS.get(id); if (!f) return null; fortUnindex(f); FORTS.delete(id); return f; }
function clearForts() { for (const id of [...FORTS.keys()]) delFort(id); }
const inBox = (b, x, z, r) => { const dx = x - b.cx, dz = z - b.cz, lx = dx * b.c - dz * b.s, lz = -dx * b.s - dz * b.c; return Math.abs(lx) < b.hx + r && Math.abs(lz) < b.hz + r; };
// ---- static timber structures (v0.29): the HQ shelters' four posts are solid and their roof stops bullets and sight.
// Same box format as fortifications (f: null), kept in their own grid so clearing the forts never removes them.
const SGRID = new Map(), SBOX = [];
function buildHQBoxes() { SGRID.clear(); SBOX.length = 0; for (const q of HQS) {
  const g = q.gy = gen(q.x, q.z), B = (cx, cz, hx, hz, y0, y1, nb) => {
    const b = { cx, cz, c: 1, s: 0, hx, hz, y0, y1, mat: 'wood', f: null, cells: [], nb: !!nb }, R = Math.hypot(hx, hz) + .5; SBOX.push(b);
    for (let x = Math.floor((cx - R) / FC); x <= Math.floor((cx + R) / FC); x++) for (let z = Math.floor((cz - R) / FC); z <= Math.floor((cz + R) / FC); z++) { const k = x * 4096 + z; b.cells.push(k); if (!SGRID.has(k)) SGRID.set(k, []); SGRID.get(k).push(b); }
  };
  for (const a of [-5, 5]) for (const c of [-3.5, 3.5]) B(q.x + a, q.z + c, .2, .2, g - .2, g + 2.7);   // posts
  B(q.x, q.z, 5.5, 4, g + 2.5, g + 3.5, true);   // timber roof + sandbag layer: stops bullets and sight, but never blocks walking in under its edge
} }
// ---- v0.35 night lighting. Where a lamp or a fire would really be: shaded lamps inside the front-line dugouts, storm lanterns at
// the doors of the support and reserve dugouts, coke braziers in the reserve and support trenches, lanterns at the HQ shelters,
// supply dumps, gun pits and hangars, paraffin flare pots along the airstrips, burning wrecks, a few ruins still on fire, and the
// patches of burning ground in no-man's land. Server and clients build the same list: at night a man standing in the light is
// seen as if by day (litAt), so the lamps and fires are both scenery and cover you choose to avoid.
// Each light: { x, z, k: kind, r: reach in m, y: absolute height (dugout lamps) or h: height above the ground }
const BURN = (() => { const o = []; let sd = 7; const r = () => (sd = (sd * 16807) % 2147483647) / 2147483647;   // no-man's-land fires (fixed, as before)
  for (let i = 0; i < 22; i++) { const x = (r() - .5) * (2 * W - 40), z = (r() - .5) * (2 * NML - 16), k = .8 + r() * 1.2, ph = r() * 9; o.push({ x, z, k, ph, smoke: i % 3 === 0 }); } return o; })();
let LGRID = new Map();
function buildLights() {
  LIGHTS.length = 0; const L = (x, z, k, r, o) => LIGHTS.push(Object.assign({ x: +x.toFixed(2), z: +z.toFixed(2), k, r }, o || {}));
  for (const q of ROOMS) {
    if (Math.abs(q.t) === 30) { if (hsh(q.xc, q.t + .5) < .7) L(q.xc + .8, (q.fz0 + q.fz1) / 2, 'lamp', 4.5, { y: q.fy + 1.95 }); }   // a candle or shaded lamp, never in the open at the front
    else L(q.xc + 2.1, q.c - q.sg * 2.55, 'lantern', 9, { y: q.fy + 2.05 });                                                         // hung by the dugout door
  }
  for (const t of [100, 64, -100, -64]) for (let i = 0; i < ROOM_X.length; i++) {
    if (Math.abs(t) === 64 && i % 2) continue; const x = ROOM_X[i] + (hsh(i, t) < .5 ? -7 : 7);
    if (GAPS.some(g => Math.abs(g - x) < 6) || CT.some(c => Math.abs(c - x) < 5)) continue;
    L(x, trenchC(t, x), 'brazier', 11, { h: 0 });
  }
  for (const q of HQS) { L(q.x - 3.5, q.z, 'lantern', 10, { h: 2.4, hang: 1 }); L(q.x + 3.5, q.z + (q.team ? 1 : -1) * 2, 'lantern', 10, { h: 2.4, hang: 1 }); }
  for (const d of DEPOTS) L(d.x + 3, d.z + (d.z > 0 ? -3 : 3), 'lantern', 11, { h: 2.1 });
  for (const e of EMPL) if (e.k === 'fgun') L(e.x + 2.4, e.z + (e.team ? -1.5 : 1.5), 'lantern', 7, { h: 1.2 });
  AIRF.forEach((a, t) => { const dir = -Math.sign(a.x), hx = a.x - dir * 10, hz = a.z + (t ? -14 : 14), fz = hz + (t ? 5.2 : -5.2);
    L(hx - 4, fz, 'lantern', 9, { h: 2.4 }); L(hx + 4, fz, 'lantern', 9, { h: 2.4 });
    for (let k = 11; k <= 99; k += 22) for (const sz of [-1, 1]) L(a.x + dir * k, a.z + sz * 7.5, 'pot', 6, { h: 0 }); });
  STRUCT.forEach((S, i) => { const hv = hsh(i * 3.7, MP.hs + 1);
    if (S.k === 'tank' || S.k === 'plane') L(S.x, S.z, 'wreck', 13, { h: 1 });
    else if ((S.k === 'farm' || S.k === 'barn') && hv < .55) L(S.x + Math.cos(hv * 40) * 1.5, S.z + Math.sin(hv * 40) * 1.5, 'fire', 14, { h: 0 });
    else if (S.k === 'chapel' && hv < .6) L(S.x, S.z, 'lamp', 6, { h: .9 }); });   // candles left burning in the chapel ruins
  for (const b of BURN) L(b.x, b.z, 'burn', 6 + b.k * 4, { h: 0 });
  LGRID = new Map(); LIGHTS.forEach((l, i) => { for (let gx = Math.floor((l.x - l.r) / 16); gx <= Math.floor((l.x + l.r) / 16); gx++) for (let gz = Math.floor((l.z - l.r) / 16); gz <= Math.floor((l.z + l.r) / 16); gz++) { const k = gx * 1000 + gz; if (!LGRID.has(k)) LGRID.set(k, []); LGRID.get(k).push(l); } });
}
/** How well lit the ground is at (x, z) by the lamps and fires: 0 (dark) .. 1 (in the pool of light). */
function litAt(x, z) {
  const c = LGRID.get(Math.floor(x / 16) * 1000 + Math.floor(z / 16)); if (!c) return 0; let b = 0;
  for (const l of c) { const d = Math.hypot(l.x - x, l.z - z); if (d < l.r) { const v = 1 - d / l.r; b = Math.max(b, Math.min(1, v * 1.6)); } }
  return b;
}

// ---- v0.32 battlefield structures: shelled-out buildings (farmhouses, chapels, barns, a walled yard) and wrecked vehicles
// (tank hulks, lorries, a downed biplane, field gun and wagon wrecks). Every piece is a solid box in SBOX/SGRID, so it stops
// walking, bullets and sight on server and client alike, and the bots' nav grid routes around it. STRUCT lists the pieces
// for drawing: { k, x, z, yaw, parts: [box, ...] }. Built from the map seed, after the HQ boxes (which clear SGRID).
const STRUCT = [];
function addSBox(cx, cz, yaw, hx, hz, y0, y1, mat, nb) {
  const b = { cx, cz, c: Math.cos(yaw), s: Math.sin(yaw), hx, hz, y0, y1, mat, f: null, cells: [], nb: !!nb, st: 1, yaw }, R = Math.hypot(hx, hz) + .5; SBOX.push(b);
  for (let x = Math.floor((cx - R) / FC); x <= Math.floor((cx + R) / FC); x++) for (let z = Math.floor((cz - R) / FC); z <= Math.floor((cz + R) / FC); z++) { const k = x * 4096 + z; b.cells.push(k); if (!SGRID.has(k)) SGRID.set(k, []); SGRID.get(k).push(b); }
  return b;
}
const STRUCT_R = { farm: 8, chapel: 10, barn: 8.5, yard: 9, tank: 5, lorry: 4, plane: 6, gun: 2.5, wagon: 2.5, stub: 4 };
function structOK(x, z, R) {
  if (Math.abs(x) > W - R - 6 || Math.abs(z) > W - R - 6) return false;
  for (const t of FL) if (Math.abs(z - trenchC(t, x)) < R + 13) return false;   // (dugouts reach back from the line, and men walk up to them)
  const az = Math.abs(z);
  if (az > CZ0 - 8 && az < CZ1 + 8 && CT.some(c => Math.abs(x - c) < R + 8)) return false;
  if (az < NML && GAPS.some(g => Math.abs(x - g) < R + 7)) return false;
  if (Math.abs(az - HOME_Z) < R + 12 && Math.abs(x) < 80) return false;   // the home camp
  if (AIRF.some(a => Math.abs(z - a.z) < R + 12 && Math.abs(x - a.x + Math.sign(a.x) * 50) < R + 70)) return false;   // the airfield strip
  if (MINES.some(m => Math.hypot(x - m[0], z - m[1]) < m[2] + R + 3)) return false;
  if (HQS.some(q => Math.hypot(x - q.x, z - q.z) < R + 11) || NEST.some(n => Math.hypot(x - n.x, z - n.z) < R + 7)) return false;
  if (EMPL.some(q => Math.hypot(x - q.x, z - q.z) < R + 9) || AA.some(a => Math.hypot(x - a.x, z - a.z) < R + 7)) return false;
  if (DEPOTS.some(d => Math.hypot(x - d.x, z - d.z) < R + DEP_R + 2) || OBJ.some(o => Math.hypot(x - o.x, z - o.z) < R + 12)) return false;
  if (PHONES.some(L => Math.abs(x - L.pts[0][0]) < R + 2 && z > Math.min(...L.pts.map(p => p[1])) - R && z < Math.max(...L.pts.map(p => p[1])) + R)) return false;
  if (STRUCT.some(q => Math.hypot(x - q.x, z - q.z) < R + STRUCT_R[q.k] + 6)) return false;
  return true;
}
function buildStruct() {
  STRUCT.length = 0; const R = rng(MP.hs * 7919 + 13), u = (a, b) => a + (b - a) * R();
  const gmin = (x, z, yaw, hx, hz) => { const c = Math.cos(yaw), s = Math.sin(yaw); let m = 1e9; for (const [a, b] of [[-hx, -hz], [hx, -hz], [-hx, hz], [hx, hz], [0, 0]]) m = Math.min(m, gen(x + a * c + b * s, z - a * s + b * c)); return m; };
  const put = (k, x, z, yaw) => {
    const S = { k, x, z, yaw, parts: [] }, c = Math.cos(yaw), s = Math.sin(yaw), P = (lx, lz, hx, hz, h0, h1, mat, ry, nb) => {   // a part in the structure's local frame
      const wx = x + lx * c + lz * s, wz = z - lx * s + lz * c, g = gmin(wx, wz, yaw + (ry || 0), hx, hz) - .25; S.parts.push(addSBox(wx, wz, yaw + (ry || 0), hx, hz, g + h0, g + h1, mat, nb)); };
    const walls = (w, d, hmax, mat, door) => {   // a ruined rectangle of 2 m wall stretches, some gone, the rest broken off at random heights
      const sides = [[0, -d / 2, w, 0], [0, d / 2, w, 0], [-w / 2, 0, d, Math.PI / 2], [w / 2, 0, d, Math.PI / 2]];
      sides.forEach(([cx, cz, len, ry], si) => { const n = Math.max(2, Math.round(len / 2)), sl = len / n;
        for (let i = 0; i < n; i++) { const along = -len / 2 + sl * (i + .5); if ((si === door && i === Math.floor(n / 2)) || R() < .2) continue;
          const h = hmax * (.25 + .75 * R() * R()) + .5, lx = cx + (ry ? 0 : along), lz = cz + (ry ? along : 0); P(lx, lz, ry ? .3 : sl / 2, ry ? sl / 2 : .3, 0, h, mat); } });
    };
    if (k === 'farm') { walls(u(9, 12), u(6.5, 8), 3.2, 'brick', 0); P(u(-2, 2), u(-1, 1), 1, .9, 0, .9, 'stone'); }
    else if (k === 'chapel') { const d = u(12, 15); walls(u(7.5, 9), d, 3.6, 'stone', 1); P(0, d / 2 + .1, 1.6, .45, 0, u(5.5, 7.5), 'stone'); P(0, -d / 2 + 1.6, 1.1, 1.1, 0, u(3, 4.5), 'stone'); }
    else if (k === 'barn') { const w = u(11, 13), d = u(7, 8.5); for (const sx of [-1, 1]) for (const sz of [-1, 0, 1]) if (R() < .8) P(sx * w / 2, sz * d / 2.2, .2, .2, 0, u(1.5, 3.8), 'wood'); for (const sz of [-1, 1]) if (R() < .7) P(u(-2, 2), sz * d / 2, u(2, 4), .12, 0, u(1, 2.2), 'wood'); }
    else if (k === 'yard') { const w = u(14, 18); for (const [lx, lz, L, ry] of [[0, -w / 2, w, 0], [-w / 2, 0, w, 1], [w / 2, 0, w, 1]]) for (let a = -L / 2 + 1; a < L / 2; a += 2) if (R() > .25) P(ry ? lx : lx + a, ry ? lz + a : lz, ry ? .25 : 1, ry ? 1 : .25, 0, u(.8, 1.6), 'stone'); }
    else if (k === 'stub') { for (let i = 0; i < 3; i++) if (R() < .85) P(-3 + i * 2.2 + u(-.3, .3), u(-.4, .4), 1, .3, 0, u(.7, 1.9), 'brick', u(-.3, .3)); }
    else if (k === 'tank') { P(0, 0, 1.75, 3.9, 0, 2.1, 'metal'); P(u(-.4, .4), u(-.8, .4), 1.1, 1.3, 2.1, 2.7, 'metal', u(-.5, .5)); }
    else if (k === 'lorry') { P(0, -1.9, 1.05, .85, 0, 2.3, 'metal'); P(0, 1, 1.05, 1.9, 0, 1.3, 'wood'); }
    else if (k === 'plane') { P(0, 0, .55, 3, 0, 1.1, 'wood'); P(0, -1, 4, .7, 0, .35, 'wood', u(-.25, .25), true); }
    else if (k === 'gun') { P(0, 0, 1, .7, 0, 1.3, 'metal'); }
    else if (k === 'wagon') { P(0, 0, .8, 1.6, 0, 1.2, 'wood'); }
    STRUCT.push(S); return S;
  };
  const place = (k, x0, x1, z0, z1, tries) => { const Rr = STRUCT_R[k]; for (let i = 0; i < (tries || 40); i++) { const x = u(x0, x1), z = u(z0, z1); if (structOK(x, z, Rr)) return put(k, x, z, u(0, 6.283)); } return null; };
  // ruins at the flank depots (the farms, chapels and works they are named after), just outside the capture circle
  for (const d of DEPOTS) { const k = /Chapel|Abbey/.test(d.n) ? 'chapel' : /Mill|Farm|Pump|Tannery/.test(d.n) ? 'farm' : 'barn';
    for (let i = 0; i < 30; i++) { const a = u(0, 6.283), r = DEP_R + STRUCT_R[k] + u(3, 7), x = d.x + Math.cos(a) * r, z = d.z + Math.sin(a) * r; if (structOK(x, z, STRUCT_R[k]) || (i > 25 && Math.abs(x) < W - 14)) { if (structOK(x, z, STRUCT_R[k])) put(k, x, z, u(0, 6.283)); break; } } }
  for (const sg of [-1, 1]) {
    const Z = (a, b) => [Math.min(sg * a, sg * b), Math.max(sg * a, sg * b)];
    // behind the reserve line and around the home camp: shattered villages
    for (const [k, a, b] of [['farm', 108, 132], ['chapel', 150, 188], ['farm', 150, 188], ['barn', 150, 188], ['yard', 108, 132], ['barn', 108, 132], ['farm', 150, 188]]) place(k, -W + 12, W - 12, ...Z(a, b));
    // between the support and reserve lines: a few ruins and abandoned transport
    for (const k of ['farm', 'lorry', 'wagon', 'barn']) place(k, -W + 12, W - 12, ...Z(72, 92));
    // behind the support line: a wrecked lorry or field gun
    for (const k of ['gun', 'lorry', 'wagon']) place(k, -W + 12, W - 12, ...Z(108, 190));
  }
  // no-man's land: knocked-out tanks, a downed biplane and broken wall stubs: cover for the brave
  for (const k of ['tank', 'tank', 'tank', 'plane', 'stub', 'stub', 'stub', 'tank']) place(k, -W + 14, W - 14, -14, 14, 60);
}
// body=true: does a standing body at feet height y overlap the box? body=false: is the point (bullet, sight line) inside it?
function fortHit(x, y, z, r, body) {
  r = r || 0; const k = fcell(x, z);
  for (const G of [FGRID, SGRID]) { if (!G.size) continue; const a = G.get(k); if (!a) continue;
    for (const b of a) { if (body ? (!b.nb && b.y0 < y + 1.7 && b.y1 > y + .25) : (y >= b.y0 && y < b.y1)) { if (inBox(b, x, z, r)) return b; } } }
  return null;
}
// Exact segment tests (v0.29). Bullets move 0.5 m per sample and sight lines 1 m, so a 0.22-0.45 m timber wall could be skipped
// between two samples: these clip the whole segment against each box instead. They return the entry fraction t (0..1) or -1.
let _t0 = 0, _t1 = 1;
function clip1(p0, p1, lo, hi) { const d = p1 - p0; if (Math.abs(d) < 1e-9) return p0 >= lo && p0 <= hi; let a = (lo - p0) / d, b = (hi - p0) / d; if (a > b) { const q = a; a = b; b = q; } if (a > _t0) _t0 = a; if (b < _t1) _t1 = b; return _t0 <= _t1; }
function segBox(b, x0, y0, z0, x1, y1, z1) {
  _t0 = 0; _t1 = 1; const ax = x0 - b.cx, az = z0 - b.cz, bx = x1 - b.cx, bz = z1 - b.cz;
  if (!clip1(ax * b.c - az * b.s, bx * b.c - bz * b.s, -b.hx, b.hx) || !clip1(-ax * b.s - az * b.c, -bx * b.s - bz * b.c, -b.hz, b.hz) || !clip1(y0, y1, b.y0, b.y1)) return -1;
  return _t0;
}
const _ks = [0, 0, 0, 0];
function fortSeg(x0, y0, z0, x1, y1, z1) {   // segments up to one grid cell (6 m) long
  if (!FGRID.size && !SGRID.size) return -1;
  _ks[0] = fcell(x0, z0); _ks[1] = fcell(x1, z1); _ks[2] = fcell(x0, z1); _ks[3] = fcell(x1, z0); let best = -1;
  for (let i = 0; i < 4; i++) { const k = _ks[i]; if (i && (k === _ks[0] || (i > 1 && k === _ks[1]) || (i > 2 && k === _ks[2]))) continue;
    for (const G of [FGRID, SGRID]) { const a = G.get(k); if (!a) continue;
      for (const b of a) { const t = segBox(b, x0, y0, z0, x1, y1, z1); if (t >= 0 && (best < 0 || t < best)) best = t; } } }
  return best;
}
function wireK(x, z) { let k = wireK0(x, z); for (const w of FWIRE) if (inBox(w, x, z, 0)) { k = Math.min(k, .3); break; } return k; }
function los(H, x1, y1, z1, x2, y2, z2) {
  const n = Math.max(10, Math.min(120, Math.ceil(Math.hypot(x2 - x1, z2 - z1) / 1.0)));
  let px = x1, py = y1, pz = z1;
  for (let i = 1; i <= n; i++) { const t = i / n, x = x1 + (x2 - x1) * t, z = z1 + (z2 - z1) * t, y = y1 + (y2 - y1) * t;
    if ((i < n && (hAt(H, x, z) > y || inRoof(x, y, z) || sbHit(H, x, y, z))) || sbHit(H, (x + px) / 2, (y + py) / 2, (z + pz) / 2) || fortSeg(px, py, pz, x, y, z) >= 0) return false;   // bags 0.8 m thick: half-metre checks catch them; timber walls are clipped exactly
    px = x; py = y; pz = z; }
  return true;
}

// Command bits: 1 sprint, 2 crouch, 4 jump, 8 fire
// Movement step used by the server (authoritative) and the client (prediction). cmd.dt in seconds.
// ---- climbing: find a wall ahead whose top can be reached (0.62 m < rise <= 3.2 m) and a landing beyond its lip
function climbTarget(H, x, y, z, yaw) {
  const dx = -Math.sin(yaw), dz = -Math.cos(yaw);
  let d0 = -1;
  for (let d = .3; d <= 1.3; d += .1) { if (groundAt(H, x + dx * d, z + dz * d, y) - y > .62) { d0 = d; break; } }
  if (d0 < 0) return null;
  let top = -1e9; for (let d = d0; d <= d0 + 1; d += .1) top = Math.max(top, groundAt(H, x + dx * d, z + dz * d, y));
  const rise = top - y; if (rise > 3.2 || rise < .62) return null;
  for (let e = d0 + .5; e <= d0 + 2.2; e += .1) {
    const gy = groundAt(H, x + dx * e, z + dz * e, y);
    if (Math.abs(gy - top) < .45 && inRoom(x + dx * e, gy, z + dz * e) == null) { const lx = x + dx * e, lz = z + dz * e;
      return { x0: x, y0: y, z0: z, wx: x + dx * Math.max(.2, d0 - .3), wz: z + dz * Math.max(.2, d0 - .3), x1: lx, y1: gy, z1: lz, dur: .7 + .45 * rise, rise }; }
  }
  return null;
}
const ease3 = u => u * u * (3 - 2 * u);
function climbAt(c, t) {
  const u = Math.min(1, t / c.dur), a = .72;
  if (u < a) { const k = ease3(u / a); return { x: c.x0 + (c.wx - c.x0) * k, z: c.z0 + (c.wz - c.z0) * k, y: c.y0 + (c.y1 + .15 - c.y0) * k }; }
  const k = ease3((u - a) / (1 - a)); return { x: c.wx + (c.x1 - c.wx) * k, z: c.wz + (c.z1 - c.wz) * k, y: c.y1 + .15 * (1 - k) };
}
// v0.31 mud and flooding: in rain, trench floors flood (wading), shell holes fill with water and no-man's-land churns to
// mud. wetCell(k): 0 dry, 1 mud, 2 flooded trench floor, 3 water-filled shell hole. Dugouts stay dry. Same on server and client.
const WET_SPD = [1, .88, .78, .72];
function wetCell(k, H, x, z) {
  if (WX.k !== 'rain' || !H) return 0;
  if (FLOOR && FLOOR[k]) return roomAt(x, z) ? 0 : 2;
  if (PRISTINE && H[k] < PRISTINE[k] - .6) return 3;
  return Math.abs(z) < 26 ? 1 : 0;
}
function wetAt(H, x, z) { const i = Math.round((x + W) / ST), j = Math.round((z + W) / ST); if (i < 0 || j < 0 || i > N || j > N) return 0; return wetCell(j * (N + 1) + i, H, x, z); }
// v0.40 last stand: a downed man drags himself along (0.6 m/s; no sprint, jump or climb). Server and client both use this.
const CRAWL = .27;
function crawl(p, cmd, H) { p.cl = null; p.sld = 0; step(p, { dt: cmd.dt, f: cmd.f, s: cmd.s, bits: 2, yaw: cmd.yaw }, H, CRAWL); p.charging = false; }
const SLIDE = { t: .9, v0: 12, v1: 3.5, cd: 1.2 };   // seconds, start / end speed m/s, cooldown
function step(p, cmd, H, spdMul) {
  if (p.cl) { p.cl.t += cmd.dt; const c = p.cl, q = climbAt(c, c.t); p.x = q.x; p.y = q.y; p.z = q.z; p.vy = 0; if (c.t >= c.dur) { p.x = c.x1; p.y = c.y1; p.z = c.z1; p.cl = null; } return; }
  if ((cmd.bits & 16) && p.y <= groundAt(H, p.x, p.z, p.y) + .1 && !(p.vy > 0)) {
    const tg = climbTarget(H, p.x, p.y, p.z, cmd.yaw);
    if (tg) { tg.t = 0; p.cl = tg; return step(p, { dt: 0, bits: 0, yaw: cmd.yaw }, H, spdMul); }
  }
  const dt = cmd.dt, f = cmd.f, s = cmd.s, bits = cmd.bits & (p.elite && ELITE[p.elite] && ELITE[p.elite].nosprint ? ~65 : ~0);
  // bayonet charge: hold the melee key while sprinting forward with a bayonet weapon; 3 s of stamina, refills at 0.4 s/s
  if (p.chg == null) p.chg = CHG_MAX;
  const wb = WPN[p.w], chg = (bits & 64) && (bits & 1) && f > 0 && wb && wb.bay && p.chg > .05 && !(bits & 2);
  p.charging = !!chg; p.chg = chg ? Math.max(0, p.chg - dt) : Math.min(chgMax(p), p.chg + dt * (p.cls === 'rifleman' ? .6 : .4));
  const mud = (WXS[WX.k] || WXS.overcast).mud;
  const l = Math.hypot(f, s) || 1, yaw = cmd.yaw;
  let mx = (-Math.sin(yaw) * f + Math.cos(yaw) * s) / l, mz = (-Math.cos(yaw) * f - Math.sin(yaw) * s) / l;
  // v0.36 assault slide: crouch while sprinting forward and you slide on in that direction, fast at first, slowing over a
  // second. Cancel it by standing up (release / toggle crouch), jumping (a hop out of it) or pulling back; a wall ends it too.
  const pb = p.pb || 0; p.pb = bits; if (p.sldCd > 0) p.sldCd = Math.max(0, p.sldCd - dt);
  if (p.sld > 0) { if (!(bits & 2) || (bits & 4) || f < 0) { p.sld = 0; p.sldCd = SLIDE.cd; p.sldX = 1; } }
  else if (p.cls === 'assault' && !p.elite && (bits & 2) && !(pb & 2) && (pb & 1) && f > 0 && !chg && !(p.sldCd > 0) && p.y <= groundAt(H, p.x, p.z, p.y) + .1) { p.sld = SLIDE.t; p.sdx = mx; p.sdz = mz; p.sldX = 0; }
  const sliding = p.sld > 0, su = sliding ? p.sld / SLIDE.t : 0;
  if (sliding) { mx = p.sdx; mz = p.sdz; p.sld = Math.max(0, p.sld - dt); if (p.sld <= 0) { p.sldCd = SLIDE.cd; p.sldX = 0; } }
  const sp = (sliding ? SLIDE.v1 + (SLIDE.v0 - SLIDE.v1) * su : chg ? 8.6 : (bits & 2) ? 2.2 : (bits & 32) ? 2.6 : (bits & 1) ? 7 * mud : 4.5 * (1 + mud) / 2) * spdMul * WET_SPD[wetAt(H, p.x, p.z)] * (MP.kind === 'wake' && p.y < 0 ? Math.max(.35, 1 + p.y * .55) : 1);   // v0.43 wading: knee-deep 0.8, chest-deep 0.35
  const nx = p.x + mx * sp * dt, nz = p.z + mz * sp * dt, sl = (groundAt(H, nx, nz, p.y) - groundAt(H, p.x, p.z, p.y)) / Math.max(.01, sp * dt);
  const k = (sl > 0 ? Math.max(.35, 1 - sl * .5) : 1) * wireK(p.x, p.z);
  // walls: moving is refused where the ground half a metre ahead is more than 0.62 m above the feet (steep trench walls, pit walls)
  const dx = mx * sp * dt * k, dz = mz * sp * dt * k, sea = MP.kind === 'wake', blocked = (ax, az) => { const L = Math.hypot(ax, az); if (L < 1e-6) return false; const g = groundAt(H, p.x + ax / L * .5, p.z + az / L * .5, p.y); return g - p.y > .62 || (sea && g < SEA_WADE); };
  let ox = dx, oz = dz;
  if (blocked(dx, dz)) { if (!blocked(dx, 0)) oz = 0; else if (!blocked(0, dz)) ox = 0; else { ox = 0; oz = 0; } if (sliding) { p.sld = 0; p.sldCd = SLIDE.cd; } }
  if (!sbHit(H, p.x, p.y, p.z, 0) && sbHit(H, p.x + ox, p.y, p.z + oz, .3)) { if (!sbHit(H, p.x + ox, p.y, p.z, .3)) oz = 0; else if (!sbHit(H, p.x, p.y, p.z + oz, .3)) ox = 0; else { ox = 0; oz = 0; } }
  if ((FGRID.size || SGRID.size) && !fortHit(p.x, p.y, p.z, 0, true) && fortHit(p.x + ox, p.y, p.z + oz, .3, true)) { if (!fortHit(p.x + ox, p.y, p.z, .3, true)) oz = 0; else if (!fortHit(p.x, p.y, p.z + oz, .3, true)) ox = 0; else { ox = 0; oz = 0; } }
  p.x = Math.max(-W + 2, Math.min(W - 2, p.x + ox));
  p.z = Math.max(-W + 2, Math.min(W - 2, p.z + oz));
  const g = groundAt(H, p.x, p.z, p.y);
  if ((bits & 4) && p.y <= g + .1) p.vy = 5.5;
  if (p.vy > 0 || p.y > g + .05) { p.vy -= 14 * dt; p.y += p.vy * dt; if (p.y <= g) { p.y = g; p.vy = 0; } }
  else { p.y += (g - p.y) * Math.min(1, dt * 18); p.vy = 0; }
  const rm = inRoom(p.x, p.y, p.z); if (rm && p.y + 1.8 > rm.rb && g + 1.8 <= rm.rb + .05) { p.y = rm.rb - 1.8; if (p.vy > 0) p.vy = 0; }   // no headroom (ground pushed up under the slab): never pin a man between floor and roof
}

// side objectives on the flanks: supply depots that pay command points to the officer of the team holding them
const dz = (x, s) => (trenchC(s * 30, x) + trenchC(s * 64, x)) / 2;   // half-way between front and support line
const DEPOTS = [], DEP_R = 9, VIS_R = 42;   // VIS_R: officer fog of war, how far each friendly soldier sees
// ---- v0.30 procedural maps. setMap(seed): seed 0 is the classic map; any other seed re-rolls the layout above inside fixed rules
// (six lines at the same depths, so Operations, spawns and ranges are unchanged). Server and clients run the same code on the
// same seed, so they build identical maps. A layout that fails mapCheck() is re-rolled with the next seed.
const DEPOT_NAMES = ['Mill Farm', 'Chalk Quarry', 'Chapel Ruins', 'Brickworks', 'Sugar Refinery', 'Wood Yard', 'Signal Box', 'Old Abbey', 'Lime Kiln', 'Pump House', 'Tannery', 'Rail Halt'];
const CLASSIC = { CT: [-152, -69, 12, 88, 158], GAPS: [-125, -40, 48, 130], OBX: [-65, 42, -22, 28, -55, 72], ROOM_X: [-172, -112, -38, 50, 125, 179],
  NEST: [[-105, -10, 78], [-82, 22, 110]], HQX: [[-102, 18, 120], [-102, 18, 120]], FGUN: [[-78, 85], [-78, 85]], MORT: [[-50, 69], [-50, 69]],
  MINES: [[-92, -3, 10, 4.2], [115, 6, 8, 3.4]], DEP: [['Mill Farm', -178, 1], ['Chalk Quarry', -175, -1], ['Chapel Ruins', 180, 1], ['Brickworks', 176, -1]] };
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const far = (x, list, d) => list.every(v => Math.abs(x - v) >= d);
function rollLayout(seed) {
  const R = rng(seed), u = (a, b) => a + (b - a) * R(), ri = (a, b) => Math.round(u(a, b));
  const L = { P: { ph1: u(0, 6.283), ph2: u(0, 6.283), a1: u(.85, 1.15), a2: u(.85, 1.15), gx: u(0, 6.283), gz: u(0, 6.283), hs: ri(1, 997) } };
  // a value in [lo, hi] that keeps its distance from the given lists (24 tries, then the band's middle)
  const pick = (lo, hi, rules) => { for (let k = 0; k < 24; k++) { const x = ri(lo, hi); if (rules.every(([l, d]) => far(x, l, d))) return x; } return Math.round((lo + hi) / 2); };
  const jit = (base, j, sep, lim, rules) => base.map(b0 => b0).map((b0, i, a) => { let x = b0; for (let k = 0; k < 24; k++) { const c = Math.max(-lim, Math.min(lim, b0 + ri(-j, j))); if (far(c, a.slice(0, i), sep) && rules.every(([l, d]) => far(c, l, d))) { x = c; break; } } return a[i] = x; });
  L.GAPS = jit(CLASSIC.GAPS, 20, 56, 156, []);
  L.CT = jit(CLASSIC.CT, 12, 50, 165, [[L.GAPS, 12]]);
  L.ROOM_X = jit(CLASSIC.ROOM_X, 12, 40, 180, [[L.GAPS, 12], [L.CT, 10]]);
  L.OBX = []; for (let i = 0; i < 6; i++) L.OBX.push(pick(-88, 88, [[L.GAPS, 9], i ? [[L.OBX[i - 1]], 28] : [[], 0]]));
  const bands = [[-138, -62], [-38, 38], [62, 138]];
  L.NEST = [0, 1].map(tm => bands.map(([lo, hi]) => pick(lo, hi, [[L.GAPS, 10], [L.CT, 8], [[L.OBX[tm ? 3 : 2]], 12]])));
  L.HQX = [0, 1].map(tm => [[-138, -69], [-31, 31], [69, 138]].map(([lo, hi]) => pick(lo, hi, [[L.CT, 12], [L.GAPS, 10], [[L.OBX[tm ? 4 : 1]], 12]])));
  L.FGUN = [0, 1].map(() => [pick(-119, -44, [[L.CT, 10]]), pick(44, 119, [[L.CT, 10]])]);
  L.MORT = [0, 1].map(tm => [pick(-94, -19, [[L.HQX[tm], 16], [L.CT, 8], [L.GAPS, 8]]), pick(19, 100, [[L.HQX[tm], 16], [L.CT, 8], [L.GAPS, 8]])]);
  L.MINES = [[-150, -38], [38, 150]].map(([lo, hi]) => { const r = u(7, 9); return [pick(lo, hi, [[L.GAPS, r + 9]]), u(-6, 6), r, u(3, 4.4)]; });
  const names = DEPOT_NAMES.slice(); for (let i = names.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [names[i], names[j]] = [names[j], names[i]]; }
  const west = R() < .5 ? 1 : -1;   // which side's depot sits further forward on each flank
  L.DEP = [[names[0], -ri(168, 181), west], [names[1], -ri(168, 181), -west], [names[2], ri(168, 181), -west], [names[3], ri(168, 181), west]];
  return L;
}
// v0.31 field telephone lines: one per HQ, on poles every 7 m from the HQ up to just behind its own front trench (poles
// skip trench cuts; the wire spans them). PHONES[l] = { team, pts: [[x, z], ...] }; segment s runs pts[s] -> pts[s + 1].
// v0.31 tunnel mines: two mine shafts per side in the front trench; a finished gallery blows up under the enemy front
// trench straight across (TUNNELS[i] = { team, x, z (shaft head), tx, tz (charge under the enemy trench) }).
const TUNNELS = [];
function buildTunnels() {
  TUNNELS.length = 0;
  for (const t of [0, 1]) for (const x0 of t ? [-55, 50] : [-78, 72]) {   // (staggered: a shaft never sits on the other side's charge)
    let x = x0; for (const d of [0, 4, -4, 8, -8, 12, -12]) { const xx = x0 + d; if (!NEST.some(n => Math.hypot(n.x - xx, n.z - trenchC(t ? -30 : 30, xx)) < 8) && !roomAt(xx, trenchC(t ? -30 : 30, xx))) { x = xx; break; } }
    TUNNELS.push({ team: t, x, z: +trenchC(t ? -30 : 30, x).toFixed(2), tx: x, tz: +trenchC(t ? 30 : -30, x).toFixed(2) });
  }
}
// v0.33 airfields: each side's flyable biplane is parked at the near end of a grass strip behind its home camp. The strip runs
// along x toward the centre line of the map; AIRF[team] = { x, z, yaw } is where the plane stands, facing down the strip.
const AIRF = [{ x: 140, z: 177, yaw: Math.PI / 2 }, { x: -140, z: -177, yaw: -Math.PI / 2 }];
// v0.33 flight model, shared so the pilot's own screen predicts his plane exactly like the server flies it. Mouse aim: the
// plane turns and climbs toward where the pilot is looking (cmd.yaw / cmd.pitch), banking into turns; W/S set the throttle,
// A/D add rudder. Below PL.vStall the nose drops; a hard or steep touch-down is a crash ('crash' is returned).
const PL = { vStall: 19, vMin: 24, vMax: 52, lift: 23, turn: .85, pRate: .9, climb: .5, ceil: 150, thr: .45, wheel: 1.3 };
function flyStep(v, c, H) {
  const dt = c.dt; if (!(dt > 0)) return null;
  const wrapA = a => Math.atan2(Math.sin(a), Math.cos(a)), cl = (x, a, b) => Math.max(a, Math.min(b, x));
  v.thr = cl((v.thr || 0) + (c.f || 0) * PL.thr * dt, 0, 1);
  let wantYaw = c.yaw, wantP = cl(c.pitch, -.75, PL.climb);
  if (v.air && (Math.abs(v.x) > W + 25 || Math.abs(v.z) > W + 25)) { wantYaw = Math.atan2(v.x, v.z); wantP = .05; }   // off the map: the plane turns back by itself
  if (v.air && v.y > PL.ceil) wantP = Math.min(wantP, 0);
  const g = hAt(H, v.x, v.z);
  if (v.air) {
    const dy = wrapA(wantYaw - v.yaw), rate = cl(dy * 1.6 + (c.s || 0) * -.35, -PL.turn, PL.turn);
    v.yaw = wrapA(v.yaw + rate * dt); v.roll += (cl(-rate / PL.turn * .95, -1, 1) - v.roll) * Math.min(1, dt * 3);
    if (v.spd < PL.vStall) wantP = -.6;   // stalled: the nose falls until the speed comes back
    v.pitch += cl(wantP - v.pitch, -PL.pRate * dt, PL.pRate * dt);
    const want = PL.vMin + (PL.vMax - PL.vMin) * v.thr;
    v.spd += ((want - v.spd) * .35 - Math.sin(v.pitch) * 9.8 * .9) * dt; v.spd = cl(v.spd, 8, 75);
    const cp = Math.cos(v.pitch);
    v.x += -Math.sin(v.yaw) * cp * v.spd * dt; v.z += -Math.cos(v.yaw) * cp * v.spd * dt; v.y += Math.sin(v.pitch) * v.spd * dt;
    const g2 = hAt(H, v.x, v.z);
    if (v.y < g2 + PL.wheel) {
      if (v.pitch > -.22 && v.spd < 36 && Math.abs(v.roll) < .4) { v.air = false; v.y = g2 + PL.wheel; v.pitch = 0; v.roll = 0; }   // a landing
      else { v.y = g2 + PL.wheel; return 'crash'; }
    }
  } else {   // rolling on the ground: taxi with the mouse and A/D, take off above PL.lift with the nose pulled up
    const dy = wrapA(wantYaw - v.yaw), rate = cl(dy * 1.2 - (c.s || 0) * .6, -.7, .7) * cl(v.spd / 6, .15, 1);
    v.yaw = wrapA(v.yaw + rate * dt); v.roll = 0;
    const want = (PL.vMin + 8) * v.thr * 1.15;
    v.spd += (want > v.spd ? (want - v.spd) * .3 : (want - v.spd) * .8 - 1.5) * dt; v.spd = cl(v.spd, 0, 45);
    if ((c.f || 0) < 0 && v.thr === 0) v.spd = Math.max(0, v.spd - 6 * dt);   // brakes
    v.x += -Math.sin(v.yaw) * v.spd * dt; v.z += -Math.cos(v.yaw) * v.spd * dt;
    v.y = hAt(H, v.x, v.z) + PL.wheel; v.pitch = 0;
    if (v.spd > PL.lift && c.pitch > .06) { v.air = true; v.pitch = .14; v.y += .3; }
    if (Math.abs(v.x) > W - 2 || Math.abs(v.z) > W - 2) { v.x = cl(v.x, -W + 2, W - 2); v.z = cl(v.z, -W + 2, W - 2); v.spd = 0; }
  }
  return null;
}
// v0.33 where a bomb dropped now lands (both sides use it: the server's bombs fall with the shells' gravity)
function bombImpact(v, H) {
  const cp = Math.cos(v.pitch); let x = v.x, y = v.y - 1, z = v.z, vx = -Math.sin(v.yaw) * cp * v.spd, vy = Math.sin(v.pitch) * v.spd, vz = -Math.cos(v.yaw) * cp * v.spd;
  for (let t = 0; t < 12; t += .05) { vy -= SHELL_G * .05; x += vx * .05; y += vy * .05; z += vz * .05; if (y <= hAt(H, x, z)) return { x, z, t }; }
  return null;
}
// v0.31 anti-aircraft guns: two per side between the HQ dugouts, AA[i] = { team, x, z }
const AA = [];
function buildAA() {
  AA.length = 0;
  for (const t of [0, 1]) { const H = HQS.filter(q => q.team === t).sort((a, b) => a.x - b.x); for (let i = 0; i + 1 < H.length && i < 2; i++) {
    const x = Math.round((H[i].x + H[i + 1].x) / 2); let z = (H[i].z + H[i + 1].z) / 2;
    for (const d of [0, 3, -3, 6, -6, 9]) { const zz = z + d; if (!FL.some(l => Math.abs(zz - trenchC(l, x)) < 4.5) && !roomAt(x, zz)) { z = zz; break; } }
    AA.push({ team: t, x, z: +z.toFixed(2) }); } }
}
const PHONES = [];
function buildPhones() {
  PHONES.length = 0;
  for (const q of HQS) {
    const t = q.team, x = q.x + 4, zf = trenchC(t ? -30 : 30, x) + (t ? -3 : 3), dir = Math.sign(zf - q.z), pts = [];
    for (let z = q.z; dir * (zf - z) > -.01; z += dir * 7) { if (FL.some(l => Math.abs(z - trenchC(l, x)) < 3.2)) continue; pts.push([x, +z.toFixed(2)]); }
    if (!pts.length || Math.abs(pts[pts.length - 1][1] - zf) > 1) pts.push([x, +zf.toFixed(2)]);
    if (pts.length >= 2) PHONES.push({ team: t, pts });
  }
}
/** Distance from (x, z) to segment s of line l. */
function phoneDist(l, s, x, z) { const P = PHONES[l].pts, [ax, az] = P[s], [bx, bz] = P[s + 1], dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1, u = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2)); return Math.hypot(ax + dx * u - x, az + dz * u - z); }
function applyLayout(L) {
  Object.assign(MP, { ph1: 0, ph2: 0, a1: 1, a2: 1, gx: 0, gz: 0, hs: 0 }, L.P || {});
  const fill = (a, v) => { a.length = 0; a.push(...v); };
  fill(GAPS, L.GAPS); fill(CT, L.CT); fill(ROOM_X, L.ROOM_X); fill(OBX, L.OBX); fill(MINES, L.MINES.map(m => m.slice()));
  fill(NEST, L.NEST[0].map(x => ({ x, z: trenchC(30, x) - 3.2, team: 0 })).concat(L.NEST[1].map(x => ({ x, z: trenchC(-30, x) + 3.2, team: 1 }))));
  fill(HQS, L.HQX[0].map(x => ({ x, z: trenchC(64, x) + 8, team: 0 })).concat(L.HQX[1].map(x => ({ x, z: trenchC(-64, x) - 8, team: 1 }))));
  fill(EMPL, L.FGUN[0].map(x => ({ k: 'fgun', team: 0, x, z: 121, yaw: 0 })).concat(L.FGUN[1].map(x => ({ k: 'fgun', team: 1, x, z: -121, yaw: Math.PI })))
    .concat(L.MORT[0].map(x => ({ k: 'mortar', team: 0, x, z: trenchC(64, x) + 9.5, yaw: 0 }))).concat(L.MORT[1].map(x => ({ k: 'mortar', team: 1, x, z: trenchC(-64, x) - 9.5, yaw: Math.PI }))));
  fill(OBJ, FL.map((t, i) => ({ t, x: OBX[i], z: trenchC(t, OBX[i]) })));
  fill(DEPOTS, L.DEP.map(([n, x, sd]) => ({ n, x, z: dz(x, sd) })));
  buildRooms(); buildSB(); buildHQBoxes(); buildPhones(); buildTunnels(); buildAA(); buildStruct(); buildLights(); BAYS.clear(); FLOOR = null; PRISTINE = null;   // the terrain is generated afresh by the next makeTerrain()
}
/** Is this layout playable? Every line objective sits in an open trench, enough dugouts per line, depots on open ground. */
function mapCheck() {
  for (const o of OBJ) { const d = gen(o.x, o.z) - base(o.x, o.z); if (d > TR_FLOOR + .6) return 'objective ' + o.t + ' not in a trench'; }
  for (const t of FL) if (ROOMS.filter(r => r.t === t).length < 3) return 'line ' + t + ' has too few dugouts';
  for (const d of DEPOTS) if (Math.abs(gen(d.x, d.z) - base(d.x, d.z)) > 1.2) return 'depot ' + d.n + ' in a hole';
  for (const n of NEST) if (Math.abs(gen(n.x, n.z) - base(n.x, n.z)) > 2.5) return 'nest at ' + n.x + ' in the trench';
  return '';
}
// ---- v0.43 Wake Atoll: an imported island (public/maps/wake.hm + wake.json, baked by build/wake/bake.py). No trench lines:
// the line-based pieces (dugouts, nests, phones, tunnels, structures, lamps) are left empty; props come from the map's json.
function loadWake() {
  if (typeof require === 'function' && typeof module !== 'undefined') {   // Node: read the files
    try { const fs = require('fs'), path = require('path'), dir = path.join(__dirname, 'public', 'maps'); const meta = JSON.parse(fs.readFileSync(path.join(dir, 'wake.json'), 'utf8')), buf = fs.readFileSync(path.join(dir, 'wake.hm'));
      const n = (meta.N + 1) * (meta.N + 1), h = new Float32Array(n); for (let i = 0; i < n; i++) h[i] = buf.readInt16LE(i * 2) / 100; return { meta, h }; } catch (e) { return null; }
  }
  const g = root.T128_HM, meta = root.T128_WAKE; if (!g || !meta) return null;   // browser: public/maps/wake.js set these before shared.js ran
  const bin = atob(g.b64), n = (meta.N + 1) * (meta.N + 1), h = new Float32Array(n); for (let i = 0; i < n; i++) { let v = bin.charCodeAt(i * 2) | (bin.charCodeAt(i * 2 + 1) << 8); if (v & 32768) v -= 65536; h[i] = v / 100; } return { meta, h };
}
function applyWake() {
  const d = loadWake(); if (!d) return false; const m = d.meta;
  setWorld(m.S, m.N); HM = d.h; MP.kind = 'wake'; MP.meta = m; MP.seed = WAKE_SEED; Object.assign(MP, { ph1: 0, ph2: 0, a1: 1, a2: 1, gx: 0, gz: 0, hs: 0 });
  const fill = (a, v) => { a.length = 0; a.push(...v); };
  fill(GAPS, []); fill(CT, []); fill(ROOM_X, []); fill(OBX, m.flags.map(f => f.x)); fill(MINES, []);
  fill(NEST, m.props.filter(p => p.k === 'nest').map(p => ({ x: p.x, z: p.z, team: p.team == null ? 1 : p.team, yaw: p.r || 0 })));
  fill(HQS, []); fill(EMPL, m.props.filter(p => p.k === 'gun').map(p => ({ k: 'fgun', team: p.team == null ? 1 : p.team, x: p.x, z: p.z, yaw: p.r || 0 })));
  fill(OBJ, m.flags.map((f, i) => ({ t: 0, x: f.x, z: f.z, n: f.n, id: f.id })));   // the five flags (the sixth line objective is unused)
  FL.length = 0;   // no trench lines: every per-line loop on both ends does nothing
  while (OBJ.length < 6) OBJ.push({ ...OBJ[0] });
  fill(DEPOTS, []);
  ROOMS.length = 0; SB.length = 0; SBG.clear(); SGRID.clear(); SBOX.length = 0; PHONES.length = 0; TUNNELS.length = 0; AA.length = 0; STRUCT.length = 0; LIGHTS.length = 0; LGRID = new Map(); BAYS.clear();
  AIRF[0] = { x: -300, z: -300, yaw: 0 }; AIRF[1] = { x: 262, z: 258, yaw: -Math.PI / 2 };   // v0.43: the garrison's strip; the landing force has no airfield yet
  FLOOR = null; PRISTINE = null; return true;
}
/** Build the map for `seed` (0 = classic). Returns the seed actually used (a failing layout moves on to the next seed). */
function setMap(seed) {
  seed = Math.abs(Math.floor(+seed || 0)) % 2147483647;
  if (seed === WAKE_SEED) { if (applyWake()) return WAKE_SEED; seed = 0; }
  else if (MP.kind === 'wake') { MP.kind = 'trench'; MP.meta = null; HM = null; setWorld(400, 800); FL.length = 0; FL.push(100, 64, 30, -30, -64, -100); }
  for (let k = 0; k < 20; k++) {
    const sd = seed ? 1 + (seed + k - 1) % 2147483646 : 0;
    applyLayout(sd ? rollLayout(sd) : { ...CLASSIC }); MP.seed = sd;
    if (!sd || !mapCheck()) return sd;
  }
  applyLayout({ ...CLASSIC }); MP.seed = 0; return 0;
}
const newSeed = () => 1 + Math.floor(Math.random() * 2147483645);
/** For a worker thread: the generated heightmap and floor mask of a seed. adoptTerrain() installs them after setMap(seed). */
function terrainFor(seed) { const used = setMap(seed); const t = makeTerrain(); return { seed: used, H: t.H, F: FLOOR }; }
function adoptTerrain(H, F) { if (!(H instanceof Float32Array) || !(F instanceof Uint8Array) || H.length !== NV || F.length !== NV) return false; PRISTINE = H.slice(); FLOOR = F; return true; }
// the page that loads this file picks up the map it was told to build (a reload after the server changed maps)
setMap(typeof sessionStorage !== 'undefined' ? (() => { try { return +sessionStorage.getItem('t128map') || +root.T128_MAPSEED || 0; } catch (e) { return +root.T128_MAPSEED || 0; } })() : 0);
const CHG_MAX = 3, GRAV = 9.8;
const chgMax = p => CHG_MAX * (p && p.cls === 'rifleman' && !p.elite ? 1.5 : 1);   // v0.37: riflemen charge for longer
// v0.37 rifle grenades: a grenade fired from a cup on the rifle's muzzle. Same flight on server and client (the client draws
// the predicted impact while one is fitted). Returns the impact point and the flight time.
const RG = { v: 40, g: 14, pow: .85, fit: 1, cd: 1.2, maxT: 7 };
function rgPath(H, x, y, z, yaw, pitch) {
  const cp = Math.cos(pitch), vx = -Math.sin(yaw) * cp * RG.v, vy = Math.sin(pitch) * RG.v, vz = -Math.cos(yaw) * cp * RG.v, dt = .025;
  let px = x, py = y, pz = z, t = 0, wy = vy;
  for (; t < RG.maxT; t += dt) {
    const nx = px + vx * dt, ny = py + wy * dt - .5 * RG.g * dt * dt, nz = pz + vz * dt; wy -= RG.g * dt;
    if (Math.abs(nx) > W || Math.abs(nz) > W) break;
    if (t > .06 && (ny <= hAt(H, nx, nz) || (SGRID.size || FGRID.size) && fortHit(nx, ny, nz, 0, false))) { px = nx; py = Math.max(ny, hAt(H, nx, nz)); pz = nz; t += dt; break; }
    px = nx; py = ny; pz = nz;
  }
  return { x: px, y: py, z: pz, t, vx, vy, vz };
}   // bayonet-charge stamina (s), bullet gravity (m/s²)
const WPN = {
  bolt: { n: 'Bolt Rifle', d: 'Slow. One-shot kills in its 40–120 m sweet spot. Bayonet.', dmg: 50, cd: .6, mag: 8, pel: 1, spr: 0, rng: 240, hip: .025, rl: 1.5, auto: 0, vel: 420, rcl: .055, blm: 0, bay: 1, sw: [40, 120, 100] },
  carbine: { n: 'Semi-auto Carbine', d: 'Quicker follow-up shots. Bayonet.', dmg: 34, cd: .35, mag: 10, pel: 1, spr: .012, rng: 190, hip: .03, rl: 1.5, auto: 0, vel: 380, rcl: .03, blm: .006, bay: 1 },
  shotgun: { n: 'Trench Shotgun', d: 'Devastating inside 25 m. Bayonet.', dmg: 22, cd: .9, mag: 5, pel: 6, spr: .09, rng: 28, hip: .05, rl: 2, auto: 0, vel: 330, rcl: .08, blm: 0, bay: 1 },
  smg: { n: 'Submachine Gun', d: 'Automatic. Hold to fire.', dmg: 18, cd: .1, mag: 32, pel: 1, spr: .03, rng: 60, hip: .05, rl: 1.8, auto: 1, vel: 300, rcl: .011, blm: .004 },
  lmg: { n: 'Light Machine Gun', d: 'Heavy sustained fire. Strong suppression.', dmg: 24, cd: .12, mag: 45, pel: 1, spr: .035, rng: 150, hip: .06, rl: 2.8, auto: 1, vel: 400, rcl: .016, blm: .005 },
  mark: { n: 'Marksman Rifle', d: 'Long range, heavy hit, 3.5x scope. One-shot kills at 70–180 m. The scope glints.', dmg: 80, cd: 1, mag: 5, pel: 1, spr: 0, rng: 300, hip: .035, rl: 2, auto: 0, vel: 520, rcl: .07, blm: 0, sw: [70, 180, 100], scope: 3.5 },
  // v0.26 elite kits (Operations pickups): not in any class list, so no loadout can ask for them
  flame: { n: 'Flammenwerfer', d: 'Flamethrower. A 14 m jet that sets men and ground alight. R refuels (3 supply).', dmg: 6, cd: .1, mag: 100, pel: 1, spr: .01, rng: 14, hip: .02, rl: 4, auto: 1, vel: 30, rcl: .004, blm: 0, flame: 1, elite: 1 },
  atr: { n: 'Tankgewehr M1918', d: '13 mm anti-tank rifle: pierces tank armour, kills a man outright. Its grenades are bundle charges.', dmg: 150, cd: 2.2, mag: 1, pel: 1, spr: 0, rng: 340, hip: .09, rl: 2.8, auto: 0, vel: 780, rcl: .2, blm: 0, at: 150, elite: 1 },
  hmg: { n: 'MG 08/15', d: 'Water-cooled machine gun carried by an armoured sentry. 100-round belts.', dmg: 22, cd: .105, mag: 100, pel: 1, spr: .028, rng: 260, hip: .05, rl: 5, auto: 1, vel: 800, rcl: .035, blm: .0025, elite: 1 },
  sniper: { n: 'Sniper Rifle', d: '6x telescopic sight, sways while scoped: hold Shift to hold your breath. One-shot kills at 90–260 m. The scope glints.', dmg: 90, cd: 1.4, mag: 5, pel: 1, spr: 0, rng: 360, hip: .06, rl: 2.4, auto: 0, vel: 620, rcl: .085, blm: 0, sw: [90, 260, 100], scope: 6 },
};
const CLS = {
  rifleman: { n: 'Rifleman', d: 'The only class with the bolt-action rifle. Works the bolt and aims faster, shrugs off suppression, and charges with the bayonet for longer. [N] fits a rifle grenade to the muzzle: lob it 30–110 m onto a machine-gun nest or a knot of men.', hp: 100, sp: 1, w: ['bolt', 'carbine'] },
  assault: { n: 'Assault', d: 'Trench clearer. Extra health, faster on his feet, reloads 30% quicker, slides (crouch while sprinting; stand, jump or pull back to cancel). [N] morphine (2 per life): 10 s faster, takes 40% less damage, +15 HP.', hp: 125, sp: 1.1, w: ['shotgun', 'smg'] },
  gunner: { n: 'Machine Gunner', d: 'Holds the line. Slow, with deep magazines; crouch to brace the gun (tighter, steadier fire). [N] drops an ammo box (3 supply): teammates who walk over it get a full magazine, grenades and utility back.', hp: 100, sp: .85, w: ['lmg'] },
  medic: { n: 'Medic', d: 'Sees the health of hurt teammates within 45 m. [H] bandages the hurt man in front of him (70 HP), or himself. Hold [E] to revive the downed, then earns XP for each kill the revived man makes.', hp: 100, sp: 1, w: ['carbine', 'smg'] },
  sapper: { n: 'Sapper', d: 'Digs bigger holes. Grenades cost 1 supply. [B] builds a field post your team respawns at.', hp: 100, sp: 1, w: ['shotgun', 'carbine'] },
  recon: { n: 'Recon', d: 'Sniper and spotter. Scoped rifles; headshots with a scope kill outright. [T] spots every enemy in your sights for the whole team (and the officer).', hp: 90, sp: 1.02, w: ['sniper', 'mark', 'carbine'] },
  officer: { n: 'Officer', d: 'Command view: order squads, call in bombers, barrages and supply drops. Max 2 per team.', hp: 100, sp: 1, w: ['carbine'] },
};
const UT = { bandage: { n: 'Bandages', d: 'H · heal 40 HP (1 supply)' }, tool: { n: 'Entrenching Tool', d: 'X · dig a foxhole (1 supply)' }, nade: { n: 'Extra Grenades', d: 'Grenades cost 1 supply instead of 2' },
  smokenade: { n: 'Smoke Grenades', d: 'H · throw a smoke screen (2 per life). Blocks sight for 20 s' }, gasnade: { n: 'Gas Grenades', d: 'H · throw a gas cloud (2 per life). Hurts everyone without a mask for 12 s' } };
UT.flare = { n: 'Flare Pistol', d: 'H · fire a flare (3 per life). Lights 55 m for 25 s: at night the enemy under it can be seen' };
// elite kits: picked up from crates in the field; they replace your class until you die
const ELITE = { flame: { n: 'Flamethrower', hp: 220, sp: .82, w: 'flame', d: 'Clears trenches: burns men and the ground, armoured' },
  atr: { n: 'Tank Hunter', hp: 200, sp: .9, w: 'atr', d: 'Anti-tank rifle and bundle charges' },
  hmg: { n: 'Sentry', hp: 300, sp: .72, w: 'hmg', d: 'Armoured heavy machine gunner. Cannot sprint', nosprint: 1 } };
const spOf = p => (p.elite && ELITE[p.elite] ? ELITE[p.elite].sp : CLS[p.cls] ? CLS[p.cls].sp : 1) * (p.mph ? 1.2 : 1);   // v0.36: morphine
// v0.26 vehicles and crewed guns (server simulates them; the client draws and drives them)
const VEH = { plane: { n: 'Biplane', hp: 300 }, tank: { n: 'Tank', hp: 2000, len: 8.2, wid: 4.1, hgt: 2.6, spd: 2.6, rev: 1.2, turn: .36, rl: 4.5, v: 130 },
  fgun: { n: 'Field gun', hp: 450, rl: 5, v: 85, arc: .6, pmin: -.08, pmax: .45 },
  mortar: { n: 'Trench mortar', hp: 220, rl: 2.4, arc: 1.0, rmin: 25, rmax: 170, th: 1.0 } };
const SHELL_G = 19.6;   // shells fall at twice real gravity so flight times suit the map (a 170 m mortar shot is ~5 s)
const mortarV = r => Math.sqrt(r * SHELL_G / Math.sin(2 * VEH.mortar.th));
// v0.26 weather, chosen per round by the server. sight scales how far bots and spotting see; mud slows movement in the rain
const WXS = { overcast: { n: 'Overcast', sight: 1, mud: 1 }, fog: { n: 'Fog', sight: .55, mud: 1 }, rain: { n: 'Rain', sight: .8, mud: .86 }, night: { n: 'Night', sight: .45, mud: 1 } };
const WX = { k: 'overcast' };
const RK = [['Private', 0], ['Corporal', 100], ['Sergeant', 300], ['Lieutenant', 700], ['Captain', 1300], ['Major', 2000],
  // v0.34 the long career: ranks past Major are earned with total account XP (no new unlocks yet; the perk tree will hang off levels)
  ['Lt. Colonel', 5000], ['Colonel', 12000], ['Brigadier', 25000], ['Major General', 50000], ['Lt. General', 100000], ['General', 200000]];
// v0.34 account levels 1-100 from total XP: level n needs 100(n-1) + 20(n-1)(n-2) XP in all (level 2 at 100, 10 at 2,340,
// 50 at 51,940, 100 at 203,940). levelOf(xp) -> { lv, at (XP where this level began), next (XP for the next one, or null) }
const LV_MAX = 100, lvXp = n => 100 * (n - 1) + 20 * (n - 1) * (n - 2);
function levelOf(xp) { let lv = 1; while (lv < LV_MAX && xp >= lvXp(lv + 1)) lv++; return { lv, at: lvXp(lv), next: lv < LV_MAX ? lvXp(lv + 1) : null }; }
const REQ = { 'cls:medic': 1, 'cls:gunner': 1, 'cls:recon': 1, 'cls:sapper': 2, 'cls:officer': 3, 'w:carbine': 1, 'w:smg': 2, 'w:mark': 2, 'u:nade': 1, 'u:smokenade': 1, 'u:gasnade': 2, 'u:flare': 0 };
const rankOf = xp => { let r = 0; RK.forEach((k, i) => { if (xp >= k[1]) r = i; }); return r; };
// Server-side validation of a requested loadout against rank. Returns a safe loadout.
// own-property lookup: client strings like 'constructor' or '__proto__' must never index a table (v0.28 audit: crashed the server)
const own = (o, k) => typeof k === 'string' && Object.prototype.hasOwnProperty.call(o, k);
function fixLoadout(xp, l) {
  l = l && typeof l === 'object' ? l : {};
  const r = rankOf(xp), ok = (k, v) => r >= (REQ[k + ':' + v] || 0);
  let cls = own(CLS, l.cls) && ok('cls', l.cls) ? l.cls : 'rifleman';
  let w = CLS[cls].w.includes(l.w) && ok('w', l.w) ? l.w : (CLS[cls].w.find(x => ok('w', x)) || CLS[cls].w[0]);
  let u = own(UT, l.u) && ok('u', l.u) ? l.u : 'bandage';
  return { cls, w, u };
}

const API = { setWorld, WAKE_SEED, isSea, SEA_WADE, hmSample: (x, z) => HM ? hmSample(x, z) : 0, crawl, CRAWL, RG, rgPath, chgMax, SLIDE, LIGHTS, BURN, litAt, LV_MAX, lvXp, levelOf, PHONES, phoneDist, TUNNELS, AA, AIRF, PL, flyStep, bombImpact, STRUCT, STRUCT_R, structOK, inBox, wetCell, wetAt, WET_SPD, FL, CT, GAPS, CZ0, CZ1, HOME_Z, NML, OBX, OBJ, MINES, trenchSlope, collapsed, NEST, HQS, LINES, SQUADS, ROOMS, TP, CP, FS_TOP, TR_FLOOR, trenchC, sgn, hash, tri, wireK, gen, base, makeTerrain, hAt, groundAt, roomAt, inRoof, inRoom, dig, los, step, WPN, CHG_MAX, GRAV, DEPOTS, DEP_R, VIS_R, CLS, UT, RK, REQ, rankOf, fixLoadout, climbTarget, climbAt, SB, sbHit, SB_H, FORT, fortParts, fortWorld, addFort, delFort, clearForts, fortHit, fortSeg, SBOX, FORTS, SL0, SL1, EMPL, ELITE, spOf, VEH, SHELL_G, mortarV, WXS, WX, smoothG, own, guarded, isFloor: k => !!(FLOOR && FLOOR[k]), FLOOR_GIVE, DIG_MAX, RIM_MAX, DIG_MAX, RIM_MAX, BAYS, bayOK, collapseBay, resetBays, applyEv, setMap, mapCheck, newSeed, MP, terrainFor, adoptTerrain, DEPOTS_NAMES: DEPOT_NAMES };
for (const [k, g] of [['S', () => S], ['N', () => N], ['ST', () => ST], ['W', () => W], ['NV', () => NV]]) Object.defineProperty(API, k, { get: g, enumerable: true });   // world size can change with the map
root.T128 = API;
if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
