'use strict';
// Bot navigation for Trench 128: a 1 m grid over the map and shared Dijkstra "distance to goal" fields.
// Every bot heading to the same place reads the same field, so 200+ bots cost a handful of searches.
// Edges: walking (rise <= 0.62 m), climbing a wall (rise <= 3.2 m, slow), dropping down; wire costs extra;
// finished structures (shared.js forts) are walls. Fields are invalidated when craters or structures change the ground.
module.exports = function makeNav(T, getH) {
  const N = T.S, OFF = T.W, NN = N * N, INF = 1e9;   // 1 m cells over the whole map
  const h = new Float32Array(NN), blk = new Uint8Array(NN), wir = new Uint8Array(NN), room = new Uint8Array(NN), door = new Uint8Array(NN);   // dugouts: entered only through their door
  let ver = 1;
  const idx = (x, z) => { const i = Math.floor(x + OFF), j = Math.floor(z + OFF); return i < 0 || j < 0 || i >= N || j >= N ? -1 : j * N + i; };
  const cx = c => (c % N) - OFF + .5, cz = c => Math.floor(c / N) - OFF + .5;
  function rebuild(x0 = -OFF, z0 = -OFF, x1 = OFF, z1 = OFF) {
    const H = getH(); if (!H) return;
    const i0 = Math.max(0, Math.floor(x0 + OFF)), i1 = Math.min(N - 1, Math.floor(x1 + OFF)), j0 = Math.max(0, Math.floor(z0 + OFF)), j1 = Math.min(N - 1, Math.floor(z1 + OFF));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const c = j * N + i, x = i - OFF + .5, z = j - OFF + .5, y = T.hAt(H, x, z); h[c] = y;
      blk[c] = Math.abs(x) > T.W - 3 || Math.abs(z) > T.W - 3 || (T.isSea && T.isSea(H, x, z)) || ((T.FORTS.size || T.SBOX.length) && T.fortHit(x, y, z, .2, true)) ? 1 : 0;
      wir[c] = T.wireK(x, z) < 1 ? 1 : 0;
      const r = T.roomAt(x, z); room[c] = r ? T.ROOMS.indexOf(r) + 1 : 0;
      door[c] = r && Math.abs(x - r.xc) < 1.2 && (z - r.c) * -r.sg > 1.2 && (z - r.c) * -r.sg < 3.6 ? 1 : 0;
    }
    ver++;
  }
  // cost of stepping from cell a to neighbour b
  function cost(a, b, diag) {
    if (blk[b]) return INF;
    if (room[a] !== room[b] && !door[a] && !door[b]) return INF;   // no walking through a dugout's walls or dropping through its roof
    const dh = h[b] - h[a]; let c = diag ? 1.414 : 1;
    if (dh > 3.2) return INF;
    if (dh > .62) c += 5 + dh;            // climbing out of a trench / over a wall
    else if (dh < -2.5) c += 1;           // dropping down
    if (wir[b]) c *= 2.5;
    return c;
  }
  const NB = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [1, 1, 1], [1, -1, 1], [-1, 1, 1], [-1, -1, 1]];
  // Dijkstra from the goal over reversed edges: d[c] = cost to walk from c to the goal.
  // v0.32.1: a map-wide field is ~160k cells (about 50 ms on the 400 m map), far too long for one 50 ms tick, so it is solved
  // in slices of SLICE_MS a tick by one resumable job at a time; until a new field is ready, bots keep using the stale one.
  const SLICE_MS = 4, heapB = new Int32Array(NN * 4), doneB = new Uint8Array(NN), queue = [];
  const DI = Int32Array.from(NB.map(q => q[0])), DJ = Int32Array.from(NB.map(q => q[1])), DG = Uint8Array.from(NB.map(q => q[2])), DC = Float32Array.from(NB.map(q => q[2] ? 1.414 : 1));
  let job = null, lastNow = 0, sliceMs = 0, sliceMax = 0;
  const clock = typeof performance !== 'undefined' ? () => performance.now() : () => Date.now();
  function jobStart(key, goals) {
    if (!Array.isArray(goals)) goals = [goals];
    const d = new Float32Array(NN).fill(INF); doneB.fill(0); job = { key, d, hn: 0, ver, made: lastNow };
    for (const g of goals) if (g >= 0 && !blk[g] && d[g] !== 0) { d[g] = 0; hpush(g); }
  }
  function hpush(c) { const d = job.d, heap = heapB; let k = job.hn++; heap[k] = c; while (k > 0) { const p = (k - 1) >> 1; if (d[heap[p]] <= d[heap[k]]) break; const t = heap[p]; heap[p] = heap[k]; heap[k] = t; k = p; } }
  function hpop() { const d = job.d, heap = heapB, top = heap[0], hn = --job.hn; heap[0] = heap[hn]; let k = 0; for (;;) { const l = 2 * k + 1, r = l + 1; let m = k; if (l < hn && d[heap[l]] < d[heap[m]]) m = l; if (r < hn && d[heap[r]] < d[heap[m]]) m = r; if (m === k) break; const t = heap[m]; heap[m] = heap[k]; heap[k] = t; k = m; } return top; }
  function jobRun(deadline) {   // true when the job finished
    const d = job.d; let n = 0;
    while (job.hn) {
      if ((++n & 1023) === 0 && clock() > deadline) return false;
      const v = hpop(); if (doneB[v]) continue; doneB[v] = 1; const vi = v % N, vj = (v / N) | 0, dv = d[v], hv = h[v], rv = room[v], drv = door[v];
      for (let q = 0; q < 8; q++) {
        const ui = vi + DI[q], uj = vj + DJ[q]; if (ui < 0 || uj < 0 || ui >= N || uj >= N) continue; const u = uj * N + ui;
        if (doneB[u] || blk[v]) continue;
        if (DG[q] && (blk[vj * N + ui] || blk[uj * N + vi])) continue;   // no corner cutting past walls
        if (room[u] !== rv && !door[u] && !drv) continue;                // dugout walls (cost(u, v) inlined)
        const dh = hv - h[u]; if (dh > 3.2) continue;
        let c = DC[q]; if (dh > .62) c += 5 + dh; else if (dh < -2.5) c += 1; if (wir[v]) c *= 2.5;
        const nd = dv + c; if (nd < d[u]) { d[u] = nd; if (job.hn < heapB.length) hpush(u); }
      }
    }
    return true;
  }
  function jobFinish() { solved++; fields.set(job.key, { d: job.d, ver: job.ver, used: lastNow, made: job.made }); job = null; }
  function solve(goals) { const keep = job; job = null; jobStart('_sync', goals); jobRun(Infinity); const d = job.d; job = keep; if (keep) doneB.fill(0), restart(keep); return d; }
  function restart(j) { const q = { key: j.key, goals: j.goals }; job = null; queue.unshift(q); }
  function enqueue(key, goals) { if ((job && job.key === key) || queue.some(q => q.key === key)) return; if (queue.length >= 12) queue.shift(); queue.push({ key, goals }); }
  function work() {   // called once a tick
    const t0 = clock(), dl = t0 + SLICE_MS;
    while (clock() < dl) { if (!job) { const q = queue.shift(); if (!q) break; jobStart(q.key, typeof q.goals === 'function' ? q.goals() : q.goals); job.goals = q.goals; } if (jobRun(dl)) jobFinish(); else break; }
    const ms = clock() - t0; sliceMs += ms; if (ms > sliceMax) sliceMax = ms;
  }
  const fields = new Map(); let budget = 0, solved = 0;
  function tick() { lbudget = 10; work(); if (fields.size > 40) { const old = [...fields.entries()].sort((a, b) => a[1].used - b[1].used).slice(0, fields.size - 30); for (const [k] of old) fields.delete(k); } }
  // distance field for a goal (quantised to 6 m); null until first computed (callers fall back to walking straight).
  // sync = true solves it on the spot (tools and tests).
  function field(x, z, now, sync) {
    if (now > lastNow) lastNow = now;
    const gi = idx(Math.round(x / 6) * 6, Math.round(z / 6) * 6); if (gi < 0) return null;
    const k = gi; let f = fields.get(k);
    if (f && (f.ver === ver || now - f.made < 160)) { f.used = now; return f.d; }   // a field up to 8 s stale is still good
    const goal = () => blk[gi] ? nearestOpen(gi) : gi;
    if (sync) { f = { d: solve(goal()), ver, used: now, made: now }; solved++; fields.set(k, f); return f.d; }
    enqueue(k, goal); if (f) { f.used = now; return f.d; } return null;
  }
  // field toward a whole area (a trench line's capture zone): one shared field for every bot holding or attacking it
  function areaField(key, x0, z0, x1, z1, now, keep) {   // keep(x, z): optional filter for which cells count as the goal
    if (now > lastNow) lastNow = now;
    let f = fields.get(key);
    if (f && (f.ver === ver || now - f.made < 160)) { f.used = now; return f.d; }
    const src = () => { const a = []; for (let z = Math.ceil(z0); z < z1; z++) for (let x = Math.ceil(x0); x < x1; x++) { const c = idx(x, z); if (c >= 0 && !blk[c] && (!keep || keep(x, z))) a.push(c); } return a; };
    enqueue(key, src); if (f) { f.used = now; return f.d; } return null;
  }
  // v0.27: short trips (under ~25 m: charges, revives, dugouts) use a bounded search in a box around start and goal instead of a
  // map-wide field. Returns a field object { loc, d, i0, j0, w, h } that at() and step() understand.
  const locs = new Map(); let lbudget = 0;
  function local(gx, gz, x, z, now) {
    const gi = idx(gx, gz), si = idx(x, z); if (gi < 0 || si < 0) return null;
    const key = gi * 64 + ((Math.floor(x / 8) & 7) << 3 | (Math.floor(z / 8) & 7)); let f = locs.get(key);
    if (f && f.ver === ver && now - f.made < 100) return f;
    if (lbudget <= 0) return f || null; lbudget--;
    const M = 12, i0 = Math.max(0, Math.min(gi % N, si % N) - M), i1 = Math.min(N - 1, Math.max(gi % N, si % N) + M), j0 = Math.max(0, Math.min((gi / N) | 0, (si / N) | 0) - M), j1 = Math.min(N - 1, Math.max((gi / N) | 0, (si / N) | 0) + M);
    const w = i1 - i0 + 1, hh = j1 - j0 + 1, d = new Float32Array(w * hh).fill(INF), done = new Uint8Array(w * hh), heap = new Int32Array(w * hh * 4); let hn = 0;
    const L = c => ((c / N | 0) - j0) * w + (c % N - i0);
    const push = c => { let k = hn++; heap[k] = c; while (k > 0) { const q = (k - 1) >> 1; if (d[L(heap[q])] <= d[L(heap[k])]) break; const t = heap[q]; heap[q] = heap[k]; heap[k] = t; k = q; } };
    const pop = () => { const top = heap[0]; heap[0] = heap[--hn]; let k = 0; for (;;) { const l = 2 * k + 1, r = l + 1; let m = k; if (l < hn && d[L(heap[l])] < d[L(heap[m])]) m = l; if (r < hn && d[L(heap[r])] < d[L(heap[m])]) m = r; if (m === k) break; const t = heap[m]; heap[m] = heap[k]; heap[k] = t; k = m; } return top; };
    const g0 = blk[gi] ? nearestOpen(gi) : gi; d[L(g0)] = 0; push(g0);
    while (hn) {
      const v = pop(), lv = L(v); if (done[lv]) continue; done[lv] = 1; const vi = v % N, vj = (v / N) | 0;
      for (const [di, dj, dg] of NB) {
        const ui = vi + di, uj = vj + dj; if (ui < i0 || uj < j0 || ui > i1 || uj > j1) continue; const u = uj * N + ui, lu = L(u);
        if (done[lu]) continue; if (dg && (blk[vj * N + ui] || blk[uj * N + vi])) continue;
        const c = cost(u, v, dg); if (c >= INF) continue; const nd = d[lv] + c; if (nd < d[lu]) { d[lu] = nd; if (hn < heap.length) push(u); }
      }
    }
    f = { loc: 1, d, i0, j0, w, h: hh, ver, made: now }; locs.set(key, f); if (locs.size > 400) locs.delete(locs.keys().next().value); solvedLocal++; return f;
  }
  let solvedLocal = 0;
  const at = (d, x, z) => { const c = idx(x, z); if (c < 0) return INF; if (d.loc) { const i = c % N - d.i0, j = ((c / N) | 0) - d.j0; return i < 0 || j < 0 || i >= d.w || j >= d.h ? INF : d.d[j * d.w + i]; } return d[c]; };
  function nearestOpen(c) { for (let r = 1; r < 6; r++) for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) { const i = (c % N) + di, j = ((c / N) | 0) + dj; if (i >= 0 && j >= 0 && i < N && j < N && !blk[j * N + i]) return j * N + i; } return c; }
  // next step for a body at (x, z) following field d: target point and the rise to it
  function step(d, x, z) {
    const c = idx(x, z); if (c < 0) return null; const ci = c % N, cj = (c / N) | 0, here = at(d, x, z); let best = -1, bv = here;
    for (const [di, dj, dg] of NB) {
      const i = ci + di, j = cj + dj; if (i < 0 || j < 0 || i >= N || j >= N) continue; const u = j * N + i;
      if (dg && (blk[cj * N + i] || blk[j * N + ci])) continue;
      const cc = cost(c, u, dg); if (cc >= INF) continue;
      const v = (d.loc ? at(d, cx(u), cz(u)) : d[u]) + cc * .001; if (v < bv) { bv = v; best = u; }
    }
    if (best < 0) return null;
    return { x: cx(best), z: cz(best), dh: h[best] - h[c], left: here };
  }
  const passable = (x, z) => { const c = idx(x, z); return c >= 0 && !blk[c]; };
  return { clear: () => fields.clear(), rebuild, tick, field, areaField, local, at, step, passable, stats: () => { const r = { fields: fields.size, solved, solvedLocal, ver, queue: queue.length + (job ? 1 : 0), sliceMs: +sliceMs.toFixed(1), sliceMax: +sliceMax.toFixed(1) }; sliceMs = 0; sliceMax = 0; return r; }, _h: h, _blk: blk };
};
