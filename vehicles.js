'use strict';
// Trench 128 v0.26 - tanks, crewed field guns and trench mortars, and the shells they fire. Server only.
// A tank has two seats: 0 = driver (WASD drives, the mouse lays the main gun, click fires) and 1 = hull machine gunner.
// Empty tank seats are worked by an abstract AI crew (a hidden crew entity takes the kills). Field guns and mortars have
// one seat and a visible bot crewman who lays the gun himself until a player takes over.
// Everything a client needs goes out as JSON: 'vh' (changed vehicles, 10 Hz), 'shl' / 'shx' (shell fired / burst),
// 'veh' (you entered / left a seat), 'vst' (your vehicle's HUD state, 5 Hz), 'vhit' (your vehicle was hit).
module.exports = function (C) {
  const { T, ents, humans, DT, TICK } = C;
  const { VEH } = T;
  const hAt = (x, z) => T.hAt(C.terr().H, x, z);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v)), rnd = Math.random, wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
  const now = () => C.tickNo();
  const fwd = yaw => [-Math.sin(yaw), -Math.cos(yaw)], rgt = yaw => [Math.cos(yaw), -Math.sin(yaw)];
  const KIDX = { tank: 0, fgun: 1, mortar: 2, plane: 3 };
  const TANK_ARC = [1.7, .9];        // main-gun traverse each side of the nose: Mark IV sponson guns (blue) cover the flanks, the A7V bow gun (green) only the front
  const TANK_NAME = ['Mark IV tank', 'A7V tank'];
  const MAX_TANKS = 1;               // per team at a time
  const V = [], shells = [];
  let vid = 1, shId = 1;

  // ---------------------------------------------------------------- set-up
  function makeEmplacements() {
    for (const q of T.EMPL) {
      const D = VEH[q.k], [fx, fz] = fwd(q.yaw), seat = { x: q.x - fx * 1.8, z: q.z - fz * 1.8 };
      const v = { id: vid++, k: q.k, team: q.team, x: q.x, y: hAt(q.x, q.z), z: q.z, yaw: q.yaw, pitch: 0, roll: 0, base: q, seat, gy: 0, gp: q.k === 'mortar' ? .95 : .06, my: 0, rng: 90,
        hp: D.hp, hpMax: D.hp, seats: [null], dead: false, lost: false, rl: 0, aiT: 4 + rnd() * 10, fl: 0 };
      v.crew = C.addCrew(q.team, false); v.crew.hx = seat.x; v.crew.hz = seat.z; v.crew.gun = v;
      V.push(v);
    }
  }
  makeEmplacements();

  function spawnTank(team, why, at) {
    if (V.some(v => v.k === 'tank' && v.team === team && !v.dead)) return null;
    const op = C.op(), sOwn = team === 0 ? 1 : -1;
    const lx = op && C.opTarget() ? C.opTarget().x : 0, x = clamp(lx + (rnd() - .5) * 40, -T.W + 20, T.W - 20);
    const z = C.homeZ(team, x) + sOwn * 8, D = VEH.tank;
    const v = { id: vid++, k: 'tank', team, x, y: hAt(x, z), z, yaw: C.faceYaw(team), pitch: 0, roll: 0, gy: 0, gp: .02, my: 0, mp: 0, hp: D.hp, hpMax: D.hp, seats: [null, null], dead: false,
      rl: 3, mrl: 0, heat: 0, over: false, v: 0, thr: 0, steer: 0, fl: 0, mfl: 0, born: now(), order: at || null,
      ai: { t: 0, lx: x, lz: z, rev: 0, revS: 1, lane: x, sec: op ? op.sector : -1, scan: 0, tgt: null, burst: 0, pause: 0 } };
    v.crew = C.addCrew(team, true); v.crew.x = x; v.crew.y = v.y; v.crew.z = z; v.crew.tank = v;
    V.push(v);
    C.teamTell(team, 'A ' + TANK_NAME[team] + ' has arrived' + (why ? ' (' + why + ')' : '') + '. Press [F] next to it to drive or man its gun.');
    C.teamTell(1 - team, 'Enemy armour! A ' + TANK_NAME[team] + ' is moving up. Anti-tank rifles, bundle charges and field guns can stop it.');
    C.alert(1 - team, 'tank', 'enemy', 'Enemy tank sighted', x, z, 20);
    return v;
  }

  // ---------------------------------------------------------------- v0.33 biplanes: one per side, parked at its airfield (T.AIRF)
  // Flown by a player with the shared flight model (T.flyStep, stepped once per input command like a soldier's movement, so
  // the pilot's screen predicts it). Twin machine guns fire along the nose; 4 bombs drop from the bombsight (hold RMB, click).
  // Bullets and the enemy's AA guns shoot it down; it rearms and patches up standing still on its own strip. Respawns 60 s
  // after it is lost.
  const PLANE_RESPAWN = 60, BOMBS = 4;
  function spawnPlane(team) {
    if (V.some(v => v.k === 'plane' && v.team === team)) return null;
    const a = T.AIRF[team], D = VEH.plane;
    const v = { id: vid++, k: 'plane', team, x: a.x, y: hAt(a.x, a.z) + T.PL.wheel, z: a.z, yaw: a.yaw, pitch: 0, roll: 0, gy: 0, gp: 0, my: 0, spd: 0, thr: 0, air: false,
      hp: D.hp, hpMax: D.hp, seats: [null], dead: false, rl: 0, mrl: 0, heat: 0, over: false, bombs: BOMBS, fl: 0, mfl: 0, born: now(), ack: 0 };
    V.push(v); return v;
  }
  function planeCrash(v, by) {   // into the ground: the pilot dies, the wreck blows up
    const x = v.x, z = v.z, pilot = v.seats[0], killer = by || v.lastBy || null;
    if (!v.dead) destroy(v, killer && killer.team !== v.team ? killer : null, 'crash');
    if (pilot && pilot.alive) C.damage(pilot, 999, killer && killer.team !== v.team ? killer : null, false, [x, z], 'shell');
    C.explode(x, z, killer && killer.team !== v.team ? killer : null, .9);
  }
  function planeMg(v, by) {
    if (v.mrl > 0 || v.over || v.dead) return;
    v.mrl = .085; v.shots = (v.shots || 0) + 1; v.heat = Math.min(1, v.heat + .022); if (v.heat >= 1) { v.over = true; if (!by.bot) C.tell(by, 'Guns overheated!'); }
    const cp = Math.cos(v.pitch), fx = -Math.sin(v.yaw) * cp, fy = Math.sin(v.pitch), fz = -Math.cos(v.yaw) * cp, [rx, rz] = rgt(v.yaw), side = (v.mfl & 1) ? .35 : -.35, sp = .01 + .02 * v.heat;
    C.fireBullet(by, v.x + fx * 3.2 + rx * side, v.y + .6 + fy * 3.2, v.z + fz * 3.2 + rz * side, v.yaw + (rnd() - .5) * sp, v.pitch + (rnd() - .5) * sp, 220, 22, 'mg', 600);
    v.mfl = 3;
  }
  function planeBomb(v, by) {
    if (v.bombs <= 0 || v.rl > 0 || v.dead || !v.air) { if (v.bombs <= 0 && !by.bot && (by.msgCd || 0) <= now()) { C.tell(by, 'No bombs left: land on your airfield to rearm'); by.msgCd = now() + 2 * TICK; } return; }
    v.bombs--; v.rl = .6; fireShell(v.x, v.y - 1, v.z, v.yaw, v.pitch, v.spd, by, 1.5, v.team, v);
  }
  // called for every input command of the pilot (dt = that command's frame time)
  function planeInput(p, v, f, s, bits, yaw, pitch, dt, seq) {
    if (v.dead) return;
    v.mrl = Math.max(0, v.mrl - dt); v.rl = Math.max(0, v.rl - dt);   // the guns cycle on the pilot's own clock, like his movement
    const r = T.flyStep(v, { dt, f, s, yaw, pitch }, C.terr().H); v.ack = seq;
    if (r === 'crash') { planeCrash(v, null); return; }
    if (bits & 8) { if (bits & 32) { if (!p.hold) planeBomb(v, p); } else if (v.air) planeMg(v, p); }
    p.hold = !!(bits & 8);
  }
  function planeTick(v) {
    if (v.dead) { if (now() > v.deadAt + PLANE_RESPAWN * TICK) { V.splice(V.indexOf(v), 1); C.bcast({ t: 'vh', rm: [v.id] }); spawnPlane(v.team); C.teamTell(v.team, 'A new biplane is waiting on the airfield'); } return; }
    const pilot = v.seats[0];
    if (!pilot) { v.rl = Math.max(0, v.rl - DT); v.mrl = Math.max(0, v.mrl - DT); } v.heat = Math.max(0, v.heat - DT * .3); if (v.over && v.heat < .35) v.over = false;
    if (v.fl > 0) v.fl--; if (v.mfl > 0) v.mfl--;
    if (!pilot && (v.air || v.spd > 0)) { const r = T.flyStep(v, { dt: DT, f: -1, s: 0, yaw: v.yaw, pitch: -.25 }, C.terr().H); if (r === 'crash') { planeCrash(v, null); return; } }   // nobody at the stick: it glides down
    if (v.air) { const dps = C.aaDps ? C.aaDps(v.team, v.x, v.z) : 0; if (dps > 0) hurt(v, dps * DT * (.6 + rnd() * .8), null, 'flak'); if (v.dead) return; }
    const a = T.AIRF[v.team];
    if (!v.air && v.spd < .5 && Math.abs(v.z - a.z) < 14 && Math.abs(v.x - a.x + Math.sign(a.x) * 50) < 75) {   // standing on its own strip: rearm and patch up
      v.rearm = (v.rearm || 0) + DT; if (v.rearm > 4 && v.bombs < BOMBS) { v.rearm = 0; v.bombs++; } v.hp = Math.min(v.hpMax, v.hp + 12 * DT);
    }
    if (pilot) { pilot.x = v.x; pilot.z = v.z; pilot.y = v.y - .6; pilot.vy = 0; C.send(pilot, { t: 'pls', a: v.ack, s: [r2(v.x), r2(v.y), r2(v.z), r4(v.yaw), r4(v.pitch), r4(v.roll), r2(v.spd), r4(v.thr), v.air ? 1 : 0], b: v.bombs, hp: Math.max(0, Math.round(100 * v.hp / v.hpMax)), ht: Math.round(v.heat * 100), ov: v.over ? 1 : 0 }); }
  }
  const r2 = x => Math.round(x * 100) / 100, r4 = x => Math.round(x * 10000) / 10000;

  // ---------------------------------------------------------------- seats
  function vehNear(p) {
    let best = null, bd = 1e9;
    for (const v of V) {
      if (v.dead || v.team !== p.team || !v.seats.includes(null)) continue;
      const big = v.k === 'tank' || v.k === 'plane', tx = big ? v.x : v.seat.x, tz = big ? v.z : v.seat.z, R = v.k === 'tank' ? 6.5 : v.k === 'plane' ? 5.5 : 2.6, d = Math.hypot(p.x - tx, p.z - tz);
      if (v.k === 'plane' && (v.air || v.spd > 2)) continue;
      if (d < R && d < bd && Math.abs(p.y - v.y) < 3) { bd = d; best = v; }
    }
    return best;
  }
  function enter(p) {
    const v = vehNear(p); if (!v) return false;
    const seat = v.seats.indexOf(null); v.seats[seat] = p; p.veh = v; p.seat = seat; p.inV = v.k === 'tank' || v.k === 'plane'; p.ads = false; p.rel = 0; p.charging = false;
    if (v.k === 'plane') { p.x = v.x; p.z = v.z; p.y = v.y - .6; p.yaw = v.yaw; p.pitch = 0; v.ack = p.ack || 0; }
    else if (v.k !== 'tank') { if (v.crew) v.crew.manned = true; p.x = v.seat.x; p.z = v.seat.z; p.y = hAt(p.x, p.z); p.yaw = v.base.yaw + v.gy; p.pitch = v.k === 'mortar' ? 0 : v.gp; }
    else { p.x = v.x; p.z = v.z; p.y = v.y + .4; p.yaw = v.yaw + (seat ? v.my : v.gy); p.pitch = 0; }
    p.vy = 0; p.cl = null; p.crouch = false;
    C.send(p, { t: 'veh', id: v.id, seat, k: v.k });
    C.tell(p, v.k === 'plane' ? 'Biplane: W throttle up (S down), steer with the mouse, pull up to take off. LMB guns; hold RMB for the bombsight, click to drop. [C] outside view, [F] get out once landed.' : v.k === 'tank' ? (seat === 0 ? 'Driving: WASD to move, mouse lays the main gun, click to fire. [F] get out, [C] outside view.' : 'Hull machine gun: hold click to fire. [F] get out, [C] outside view.')
      : v.k === 'fgun' ? 'Field gun: aim with the mouse (the sight shows the range), click to fire. 1 supply a shell. [F] leave.' : 'Trench mortar: mouse left/right to traverse, up/down sets the range. Click to fire. 1 supply a bomb. [F] leave.');
    return true;
  }
  function leave(p, quiet) {
    const v = p.veh; if (!v) return;
    if (v.k === 'plane' && !v.dead && !quiet && (v.air || v.spd > 3)) { if ((p.msgCd || 0) <= now()) { C.tell(p, 'Land first (and slow down) to get out'); p.msgCd = now() + 2 * TICK; } return; }
    v.seats[p.seat] = null; p.veh = null; p.inV = false;
    if (v.k === 'plane') {
      const [rx, rz] = rgt(v.yaw); p.x = v.x + rx * 4.5; p.z = v.z + rz * 4.5; p.y = T.groundAt(C.terr().H, p.x, p.z, 99); p.vy = 0;
    } else if (v.k === 'tank') {
      if (p.seat === 0) { v.thr = 0; v.steer = 0; }
      const [rx, rz] = rgt(v.yaw), [fx, fz] = fwd(v.yaw); let ok = false;
      for (const [a, b] of [[1, -.2], [-1, -.2], [0, -1], [1, .3], [-1, .3]]) {   // climb out of a side door (or the back)
        const x = v.x + rx * a * (VEH.tank.wid / 2 + 1.1) + fx * b * (VEH.tank.len / 2 + 1.2), z = v.z + rz * a * (VEH.tank.wid / 2 + 1.1) + fz * b * (VEH.tank.len / 2 + 1.2);
        if (Math.abs(x) < T.W - 3 && Math.abs(z) < T.W - 3 && !T.fortHit(x, hAt(x, z), z, .3, true)) { p.x = x; p.z = z; ok = true; break; }
      }
      if (!ok) { p.x = v.x; p.z = v.z; }
      p.y = T.groundAt(C.terr().H, p.x, p.z, 99); p.vy = 0;
    } else if (v.crew && !v.seats.some(Boolean)) v.crew.manned = false;
    if (!quiet || p.ws) C.send(p, { t: 'veh', id: 0 });
  }

  // ---------------------------------------------------------------- shells
  function fireShell(x, y, z, yaw, pitch, vel, by, pow, team, src) {
    const cp = Math.cos(pitch), s = { id: shId++, x, y, z, vx: -Math.sin(yaw) * cp * vel, vy: Math.sin(pitch) * vel, vz: -Math.cos(yaw) * cp * vel, by, pow, team, src, t: 0 };
    if (shId > 1e9) shId = 1;
    shells.push(s);
    C.bcast({ t: 'shl', id: s.id, p: [+x.toFixed(2), +y.toFixed(2), +z.toFixed(2)], v: [+s.vx.toFixed(2), +s.vy.toFixed(2), +s.vz.toFixed(2)], k: src ? KIDX[src.k] : 0, src: src ? src.id : 0 });
    return s;
  }
  // low-arc pitch that puts a shell of speed vel onto a point d metres away and h metres higher (null if out of reach)
  function lobPitch(d, h, vel) {
    const g = T.SHELL_G, v2 = vel * vel, disc = v2 * v2 - g * (g * d * d + 2 * h * v2);
    return disc < 0 ? null : Math.atan((v2 - Math.sqrt(disc)) / (g * d));
  }
  function inTank(v, x, y, z, pad) {
    const dx = x - v.x, dz = z - v.z; if (dx * dx + dz * dz > 30) return false;
    const [rx, rz] = rgt(v.yaw), [fx, fz] = fwd(v.yaw), lx = dx * rx + dz * rz, lz = dx * fx + dz * fz, D = VEH.tank;
    return Math.abs(lx) < D.wid / 2 + pad && Math.abs(lz) < D.len / 2 + pad && y > v.y - .2 && y < v.y + D.hgt + pad;
  }
  function shellsTick() {
    const H = C.terr().H;
    for (let i = shells.length - 1; i >= 0; i--) {
      const s = shells[i]; let hit = null;
      for (let k = 0; k < 4 && !hit; k++) {
        const h = DT / 4; s.vy -= T.SHELL_G * h; s.x += s.vx * h; s.y += s.vy * h; s.z += s.vz * h; s.t += h;
        if (Math.abs(s.x) > T.W + 20 || Math.abs(s.z) > T.W + 20 || s.t > 14) { hit = 'gone'; break; }
        if (s.y <= T.hAt(H, s.x, s.z)) { s.y = T.hAt(H, s.x, s.z); hit = 'ground'; break; }
        if (T.inRoof(s.x, s.y, s.z) || T.fortHit(s.x, s.y, s.z, 0, false) || T.sbHit(H, s.x, s.y, s.z)) { hit = 'obj'; break; }
        for (const v of V) if (v.k === 'tank' && (v !== s.src || s.t > .5) && inTank(v, s.x, s.y, s.z, .2)) { hit = v; break; }
        if (hit) break;
        if (s.t > .3 && s.vy < 0) C.forNear(s.x, s.z, 2, e => { if (!hit && e.alive && !e.cmd && Math.abs(e.x - s.x) < .7 && Math.abs(e.z - s.z) < .7 && s.y > e.y && s.y < e.y + 1.9) hit = 'man'; });
      }
      if (!hit) continue;
      shells.splice(i, 1); C.bcast({ t: 'shx', id: s.id });
      if (hit === 'gone') continue;
      if (typeof hit === 'object') hurt(hit, 200 * s.pow, s.by, 'shell');
      C.explode(s.x, s.z, s.by, s.pow, 'shell');
    }
  }

  // ---------------------------------------------------------------- damage
  function distTo(v, x, z) {
    if (v.k !== 'tank') return Math.hypot(x - v.x, z - v.z);
    const [rx, rz] = rgt(v.yaw), [fx, fz] = fwd(v.yaw), dx = x - v.x, dz = z - v.z, D = VEH.tank;
    return Math.hypot(Math.max(0, Math.abs(dx * rx + dz * rz) - D.wid / 2), Math.max(0, Math.abs(dx * fx + dz * fz) - D.len / 2));
  }
  function blast(x, z, by, pow, src) {   // an explosion: vehicles and guns nearby take damage. Hand grenades barely dent a tank; a tank hunter's bundle charges wreck it
    for (const v of V) {
      if (v.dead || (by && by.team === v.team)) continue;
      if (v.k === 'plane' && v.y - hAt(v.x, v.z) > 5) continue;   // a ground burst can't reach a plane in the air
      const R = 5.5 * Math.sqrt(pow), d = distTo(v, x, z); if (d >= R) continue;
      const nade = src !== 'shell' && by && !by.cmd, bundle = nade && by.elite === 'atr';
      const base = v.k !== 'tank' ? 260 : bundle ? 330 : nade ? 40 : 150;
      hurt(v, base * pow * (1 - d / R), by, bundle ? 'bundle' : nade ? 'grenade' : 'blast');
    }
  }
  function bulletHit(b, x, y, z) {   // bullets stop on armour; only anti-tank rifle rounds hurt it
    for (const v of V) if (v.k === 'plane' && !v.dead && b.by && b.by.team !== v.team && b.by.veh !== v && Math.abs(v.y + .3 - y) < 1.6 && Math.hypot(v.x - x, v.z - z) < 3.2) { hurt(v, (b.dmg || 20) * .7, b.by, 'bullet'); return true; }   // v0.33: fabric and wire: every bullet counts
    { const w = T.WPN[b.wk]; if (w && w.at) for (const v of V) if (v.k !== 'tank' && !v.dead && b.by && b.by.team !== v.team && distTo(v, x, z) < 1.3 && y > v.y && y < v.y + 1.8) { hurt(v, w.at * .6, b.by, 'atr'); return true; } }   // v0.31: anti-tank rounds wreck guns and mortars too
    for (const v of V) {
      if (v.k !== 'tank' || b.by === v.crew || b.by.veh === v) continue;
      if (!inTank(v, x, y, z, 0)) continue;
      const w = T.WPN[b.wk]; if (w && w.at && !v.dead) hurt(v, w.at, b.by, 'atr');
      else if (b.by && !b.by.bot && !v.dead && b.by.team !== v.team && (b.by.pingT || 0) <= now()) { b.by.pingT = now() + TICK * 3; C.send(b.by, { t: 'hm', h: 0, k: 0, m: 0, v: 2 }); }   // a dull ping: bullets do nothing to armour
      return true;
    }
    return false;
  }
  function hurt(v, dmg, by, kind) {
    if (v.dead || !(dmg > 0)) return;
    v.hp -= dmg; v.lastBy = by;
    { const k = kind + (by && by.gun ? ':' + by.gun.k : by && by.elite ? ':' + by.elite : by && by.bot ? ':bot' : by ? ':human' : ''); (v.dlog || (v.dlog = {}))[k] = Math.round(((v.dlog[k] || 0) + dmg)); }   // who hurt it (balance tooling)
    if (by && !by.bot && by.team !== v.team) C.send(by, { t: 'hm', h: 0, k: v.hp <= 0 ? 1 : 0, m: 0, v: 1 });
    for (const p of v.seats) if (p) C.send(p, { t: 'vhit', d: Math.round(dmg), hp: Math.max(0, Math.round(100 * v.hp / v.hpMax)) });
    if (v.k === 'tank' && v.hp > 0 && v.hp < v.hpMax * .3 && !v.warned) { v.warned = true; for (const p of v.seats) if (p) C.tell(p, 'The tank is burning! Get it back or get out.'); }
    if (v.k === 'plane' && v.hp > 0 && v.hp < v.hpMax * .35 && !v.warned) { v.warned = true; for (const p of v.seats) if (p) C.tell(p, 'Your plane is badly shot up! Head home and land to patch it up.'); }
    if (v.hp <= 0) destroy(v, by, kind);
  }
  function destroy(v, by, kind) {
    v.dead = true; v.hp = 0; v.v = 0; v.thr = 0; v.steer = 0;
    for (const p of v.seats.slice()) if (p) { leave(p, true); if (p.alive) C.damage(p, 55, by, false, [v.x, v.z], 'shell'); }
    const name = v.k === 'tank' ? TANK_NAME[v.team] : VEH[v.k].n.toLowerCase();
    if (v.k === 'plane') {
      const pilot = v.seats[0], air = v.air; v.seats[0] = null; v.deadAt = now(); v.spd = 0;
      if (air) { v.y = hAt(v.x, v.z) + .4; v.pitch = -.25; v.roll = .6; v.air = false; }   // the wreck comes down where it was hit
      if (pilot) { pilot.veh = null; pilot.inV = false; C.send(pilot, { t: 'veh', id: 0 }); if (pilot.alive) C.damage(pilot, air ? 999 : 60, by && by.team !== v.team ? by : null, false, [v.x, v.z], 'shell'); }
      if (by && by.team !== v.team) { C.addXp(by, 60); if (!by.bot) C.tell(by, 'Enemy plane shot down (+60 XP)'); }
      C.killFeedRaw(by && by.team !== v.team ? by : null, v.team, 'Biplane', kind === 'flak' ? 'flak' : kind === 'crash' ? 'crash' : 'mg');
      C.teamTell(v.team, 'Our biplane is down. A new one will be on the airfield in ' + PLANE_RESPAWN + ' s.'); if (air && kind !== 'crash') C.later(1200, () => C.explode(v.x, v.z, by && by.team !== v.team ? by : null, .9));
      return;
    }
    if (by && by.team !== v.team) { C.addXp(by, v.k === 'tank' ? 100 : 40); if (!by.bot) C.tell(by, (v.k === 'tank' ? 'Tank destroyed' : 'Enemy ' + name + ' knocked out') + ' (+' + (v.k === 'tank' ? 100 : 40) + ' XP)'); }
    C.killFeedRaw(by, v.team, v.k === 'tank' ? TANK_NAME[v.team] : VEH[v.k].n, kind === 'atr' ? 'atr' : kind === 'bundle' ? 'bundle' : kind === 'shell' ? 'shell' : 'grenade');
    if (v.k === 'tank') {
      C.teamTell(v.team, 'Our ' + name + ' has been knocked out.'); C.teamTell(1 - v.team, 'The enemy ' + name + ' is burning!');
      if (v.crew) { C.ents.delete(v.crew.id); v.crew = null; }
      v.burnT = now() + 45 * TICK;
      C.later(250, () => C.explode(v.x, v.z, by, 1.1));
    } else {
      C.teamTell(v.team, 'Our ' + name + ' has been knocked out. The crew will have it back in action in 90 s.');
      v.repair = now() + 90 * TICK;
      if (v.crew && v.crew.alive && !v.crew.manned) C.damage(v.crew, 999, by, false, [v.x, v.z]);
    }
  }

  // ---------------------------------------------------------------- weapons
  function fireMain(v, by, ai) {
    if (v.rl > 0 || v.dead) return false;
    const D = VEH.tank, yaw = v.yaw + v.gy + (ai ? (rnd() - .5) * .02 : 0), [fx, fz] = fwd(yaw), [rx, rz] = rgt(v.yaw);
    const side = v.team === 0 ? (v.gy > .15 ? -1.9 : v.gy < -.15 ? 1.9 : 0) : 0;   // Mark IV: the sponson on that side fires
    fireShell(v.x + fx * (side ? 1 : 4.3) + rx * side, v.y + 1.55, v.z + fz * (side ? 1 : 4.3) + rz * side, yaw, v.gp + v.pitch + (ai ? (rnd() - .5) * .008 : 0), D.v, by, .8, v.team, v);
    v.rl = D.rl; v.fl = 4; return true;
  }
  function tankMg(v, by) {
    if (v.mrl > 0 || v.over || v.dead) return;
    v.mrl = .1; v.heat = Math.min(1, v.heat + .028); if (v.heat >= 1) { v.over = true; if (!by.bot) C.tell(by, 'Hull gun overheated!'); }
    const yaw = v.yaw + v.my, [fx, fz] = fwd(yaw), sp = .012 + .03 * v.heat;
    const ai = by.bot, s2 = sp + (ai ? .035 : 0);   // the AI hull gunner sprays
    C.fireBullet(by, v.x + fx * 2.2, v.y + 1.5, v.z + fz * 2.2, yaw + (rnd() - .5) * s2, v.mp + (rnd() - .5) * s2, 150, ai ? 14 : 20, 'mg', 420);
    v.mfl = 3;
  }
  function fireGun(v, by, ai) {
    if (v.rl > 0 || v.dead) return false;
    const D = VEH[v.k];
    if (!by.bot) { const sup = C.supply(); if (sup[v.team] < 1) { if ((by.msgCd || 0) <= now()) { C.tell(by, 'No supplies for shells'); by.msgCd = now() + 2 * TICK; } return false; } sup[v.team]--; }
    const yaw = v.base.yaw + v.gy, [fx, fz] = fwd(yaw);
    if (v.k === 'fgun') fireShell(v.x + fx * 2.4, v.y + 1.2, v.z + fz * 2.4, yaw + (ai ? 0 : (rnd() - .5) * .006), v.gp, D.v, by, 1, v.team, v);
    else { const r = v.rng * (1 + (rnd() - .5) * .07); fireShell(v.x + fx * .4, v.y + .9, v.z + fz * .4, yaw + (rnd() - .5) * .035, D.th, T.mortarV(r), by, .75, v.team, v); }
    v.rl = D.rl; v.fl = 4; return true;
  }
  // the player's inputs while seated (called once per input command)
  function input(p, f, s, bits, yaw, pitch, dt, seq) {
    const v = p.veh; if (!v || v.dead) return;
    if (v.k === 'plane') return planeInput(p, v, f, s, bits, yaw, pitch, dt || 0, seq);
    if (v.k === 'tank') {
      if (p.seat === 0) { v.thr = f; v.steer = s; const a = TANK_ARC[v.team]; v.gy = clamp(wrap(yaw - v.yaw), -a, a); v.gp = clamp(pitch, -.16, .32); if (bits & 8) fireMain(v, p); }
      else { v.my = clamp(wrap(yaw - v.yaw), -2.4, 2.4); v.mp = clamp(pitch, -.3, .45); if (bits & 8) tankMg(v, p); }
    } else if (v.k === 'fgun') { const D = VEH.fgun; v.gy = clamp(wrap(yaw - v.base.yaw), -D.arc, D.arc); v.gp = clamp(pitch, D.pmin, D.pmax); if ((bits & 8) && !p.hold) fireGun(v, p); }
    else { const D = VEH.mortar; v.gy = clamp(wrap(yaw - v.base.yaw), -D.arc, D.arc); v.rng = Math.round(D.rmin + clamp((pitch + .5) / 1.1, 0, 1) * (D.rmax - D.rmin)); v.gp = 1.25 - (v.rng - D.rmin) / (D.rmax - D.rmin) * .45; if ((bits & 8) && !p.hold) fireGun(v, p); }
    p.hold = !!(bits & 8);
  }

  // ---------------------------------------------------------------- AI
  function canSee(team, fx, fy, fz, e) {
    const H = C.terr().H; return T.los(H, fx, fy, fz, e.x, e.y + (e.crouch ? .85 : 1.2), e.z) && !(C.smokeBlocks && C.smokeBlocks(fx, fz, e.x, e.z));
  }
  function tankTarget(v, r) {
    let best = null, bd = 1e9;
    for (const o of V) if (o.k === 'tank' && !o.dead && o.team !== v.team) { const d = Math.hypot(o.x - v.x, o.z - v.z); if (d < 170 && d < bd && T.los(C.terr().H, v.x, v.y + 2.2, v.z, o.x, o.y + 1.4, o.z)) { bd = d; best = { x: o.x, y: o.y + .8, z: o.z, veh: o }; } }
    if (best) return best;
    C.forNear(v.x, v.z, r, e => {
      if (e.team === v.team || !e.alive || e.cmd || e.manned || e.inV) return;
      const d = Math.hypot(e.x - v.x, e.z - v.z), lim = r * C.sightAt(v.team, e.x, e.z);
      if (d < lim && d < bd && canSee(v.team, v.x, v.y + 2.2, v.z, e)) { bd = d; best = e; }
    });
    return best;
  }
  function tankGoal(v) {
    const op = C.op(), sOwn = v.team === 0 ? 1 : -1, a = v.ai;
    if (v.order) { if (Math.hypot(v.order.x - v.x, v.order.z - v.z) < 8) v.order = null; else return v.order; }
    if (op) {
      const L = C.opTarget(); if (!L) return null;
      if (a.sec !== op.sector) { a.sec = op.sector; a.lane = clamp(L.x + (rnd() - .5) * 60, -T.W + 20, T.W - 20); }
      return v.team === op.att ? { x: a.lane, z: C.lineZ(L, a.lane) - sOwn * 7 } : { x: a.lane, z: C.lineZ(L, a.lane) + sOwn * 22 };
    }
    const en = C.spawnLine(1 - v.team), own = C.spawnLine(v.team), L = C.wave().side === v.team && en ? en : own; if (!L) return null;
    return { x: a.lane, z: C.lineZ(L, a.lane) + (L === own ? sOwn * 10 : -sOwn * 7) };
  }
  function tankAI(v, driving, gunning) {
    const a = v.ai, D = VEH.tank;
    a.scan -= DT; if (a.scan <= 0) { a.scan = .5; a.tgt = tankTarget(v, 85); }
    const t = a.tgt && (a.tgt.veh ? (a.tgt.veh.dead ? null : a.tgt) : (a.tgt.alive && !a.tgt.inV ? a.tgt : null)); if (!t) a.tgt = null;
    let bear = true;
    if (t && gunning !== false) {
      const want = Math.atan2(-(t.x - v.x), -(t.z - v.z)), rel = wrap(want - v.yaw), arc = TANK_ARC[v.team];
      bear = Math.abs(rel) <= arc;
      if (driving) {   // the AI also lays the main gun when nobody is driving
        v.gy = clamp(rel, -arc, arc);
        const d = Math.hypot(t.x - v.x, t.z - v.z), lp = lobPitch(d, (t.y || 0) + 1 - (v.y + 1.55), D.v);
        if (lp != null) v.gp = clamp(lp - v.pitch, -.16, .32);
        if (bear && lp != null && (d > 9 || t.veh)) fireMain(v, v.crew, true);
      }
    }
    if (driving) {
      const g = tankGoal(v); let thr = 0, steer = 0;
      if (a.rev > 0) { a.rev -= DT; thr = -1; steer = a.revS; }
      else if (g || (t && !bear)) {
        let want, d = 0;
        if (t && !bear && (!g || Math.hypot(t.x - v.x, t.z - v.z) < 70)) want = Math.atan2(-(t.x - v.x), -(t.z - v.z));   // swing the hull so the gun bears (also when there is nowhere to drive)
        else { const dx = g.x - v.x, dz = g.z - v.z; d = Math.hypot(dx, dz); want = Math.atan2(-dx, -dz); }
        const err = wrap(want - v.yaw);
        steer = clamp(-err * 2.2, -1, 1);
        thr = (!t || bear) && d < 5 ? 0 : Math.abs(err) < .45 ? (t && Math.hypot(t.x - v.x, t.z - v.z) < 35 ? .45 : 1) : .12;
        if (t && !bear) thr = 0;
        a.t += DT;
        if (a.t >= 3) { if (thr > .3 && Math.hypot(v.x - a.lx, v.z - a.lz) < .6) { a.rev = 2.2; a.revS = rnd() < .5 ? 1 : -1; a.lane = clamp(a.lane + (rnd() < .5 ? -12 : 12), -T.W + 20, T.W - 20); if (v.order) v.order = null; } a.t = 0; a.lx = v.x; a.lz = v.z; }
      }
      v.thr = thr; v.steer = steer;
    }
  }
  function tankMgAI(v) {   // short bursts at the nearest infantry in front or to the sides
    const a = v.ai; if (a.pause > 0) { a.pause -= DT; return; }
    const t = a.tgt && !a.tgt.veh && a.tgt.alive ? a.tgt : null; if (!t) return;
    const d = Math.hypot(t.x - v.x, t.z - v.z); if (d > 55) return;
    const want = Math.atan2(-(t.x - v.x), -(t.z - v.z)), rel = wrap(want - v.yaw); if (Math.abs(rel) > 2.4) return;
    v.my = rel; v.mp = Math.atan2(t.y + 1 - (v.y + 1.5), d);
    tankMg(v, v.crew); a.burst += DT; if (a.burst > 1.3) { a.burst = 0; a.pause = 1.2 + rnd() * 1.5; }
  }
  // guns: field guns knock out tanks they can see, otherwise both shell spotted groups of enemies (never near their own men)
  function artyTarget(v) {
    const D = VEH[v.k], rmin = v.k === 'mortar' ? D.rmin : 45, rmax = v.k === 'mortar' ? D.rmax : 290, tn = now();
    let best = null, bs = 2;
    const cand = []; for (const e of ents.values()) if (e.team !== v.team && e.alive && !e.cmd && !e.manned && !e.inV && e.sp[v.team] > tn) cand.push(e);
    for (let n = 0; n < 24 && cand.length; n++) {
      const e = cand[(rnd() * cand.length) | 0], d = Math.hypot(e.x - v.x, e.z - v.z); if (d < rmin || d > rmax) continue;
      if (Math.abs(wrap(Math.atan2(-(e.x - v.x), -(e.z - v.z)) - v.base.yaw)) > D.arc) continue;
      let foes = 0, own = 0; C.forNear(e.x, e.z, 14, o => { if (!o.alive || o.cmd) return; const dd = Math.hypot(o.x - e.x, o.z - e.z); if (o.team === v.team) { if (dd < 14) own++; } else if (dd < 8) foes++; });
      if (own) continue; if (foes > bs) { bs = foes; best = e; }
    }
    return best;
  }
  function gunAI(v) {
    v.aiT -= DT; if (v.aiT > 0 || v.rl > 0) return;
    const D = VEH[v.k];
    if (v.k === 'fgun') for (const o of V) if (o.k === 'tank' && !o.dead && o.team !== v.team) {
      const d = Math.hypot(o.x - v.x, o.z - v.z), rel = wrap(Math.atan2(-(o.x - v.x), -(o.z - v.z)) - v.base.yaw);
      if (d > 280 || Math.abs(rel) > D.arc || !T.los(C.terr().H, v.x, v.y + 1.3, v.z, o.x, o.y + 1.2, o.z)) continue;
      const lp = lobPitch(d, o.y + 1 - (v.y + 1.2), D.v); if (lp == null) continue;
      v.gy = rel + (rnd() - .5) * .02; v.gp = clamp(lp + (rnd() - .5) * .012, D.pmin, D.pmax); fireGun(v, v.crew, true); v.aiT = 8 + rnd() * 6; return;
    }
    const e = artyTarget(v); if (!e) { v.aiT = 2 + rnd() * 2; return; }
    const err = v.k === 'mortar' ? 7 : 10, tx = e.x + (rnd() - .5) * 2 * err, tz = e.z + (rnd() - .5) * 2 * err, d = Math.hypot(tx - v.x, tz - v.z);
    v.gy = clamp(wrap(Math.atan2(-(tx - v.x), -(tz - v.z)) - v.base.yaw), -D.arc, D.arc);
    if (v.k === 'mortar') { v.rng = clamp(d, D.rmin, D.rmax); v.gp = 1.25 - (v.rng - D.rmin) / (D.rmax - D.rmin) * .45; }
    else { const lp = lobPitch(d, hAt(tx, tz) - (v.y + 1.2), D.v); if (lp == null) { v.aiT = 3; return; } v.gp = clamp(lp, D.pmin, D.pmax); }
    const op = C.op(), k = op ? (op.att === v.team ? .6 : 1.2) : 1;   // the attack is prepared by its own guns; the defence's batteries are kept busier elsewhere
    fireGun(v, v.crew, true); v.aiT = ((v.k === 'mortar' ? 30 : 38) + rnd() * 12) * k;
  }
  function crewTick(b) {   // a gun's bot crewman: stand at the breech and work the gun
    const v = b.gun; b.crouch = false; b.y = T.groundAt(C.terr().H, b.x, b.z, b.y);
    if (!v || v.dead || v.lost || v.seats[0]) return;
    if (Math.hypot(b.x - v.seat.x, b.z - v.seat.z) > 1) { b.x = v.seat.x; b.z = v.seat.z; }
    b.yaw = v.base.yaw + v.gy; gunAI(v);
  }

  // ---------------------------------------------------------------- per tick
  function tankTick(v) {
    const D = VEH.tank, drv = v.seats[0], gun = v.seats[1], H = C.terr().H;
    if (v.dead) return;
    v.rl = Math.max(0, v.rl - DT); v.mrl = Math.max(0, v.mrl - DT); v.heat = Math.max(0, v.heat - DT * .22); if (v.over && v.heat < .35) v.over = false;
    if (v.fl > 0) v.fl--; if (v.mfl > 0) v.mfl--;
    if (!drv || !gun) tankAI(v, !drv, !drv);
    if (!gun) tankMgAI(v);
    const mud = (T.WXS[T.WX.k] || T.WXS.overcast).mud, hurtK = v.hp < v.hpMax * .3 ? .55 : 1;
    const want = v.thr > 0 ? D.spd * v.thr * mud * hurtK : v.thr < 0 ? -D.rev * mud : 0;
    v.v += clamp(want - v.v, -2.5 * DT, 1.3 * DT);
    v.yaw = wrap(v.yaw - v.steer * D.turn * DT * hurtK * (v.v < -.1 ? -1 : 1));
    const [fx, fz] = fwd(v.yaw), [rx, rz] = rgt(v.yaw);
    if (Math.abs(v.v) > .01) {
      const nx = v.x + fx * v.v * DT, nz = v.z + fz * v.v * DT, nose = Math.sign(v.v) * D.len * .52;
      let blocked = Math.abs(nx + fx * nose) > T.W - 3 || Math.abs(nz + fz * nose) > T.W - 3;
      const ex = nx + fx * nose, ez = nz + fz * nose;
      const bigBlock = [...T.FORTS.values()].some(f => !T.FORT[f.k].small && Math.hypot(f.x - ex, f.z - ez) < 4) || T.HQS.some(q => Math.abs(q.x - ex) < 6.2 && Math.abs(q.z - ez) < 4.6) || T.SBOX.some(b => b.st && b.y1 - b.y0 > 1.1 && Math.abs(b.cx - ex) < 12 && Math.abs(b.cz - ez) < 12 && T.inBox(b, ex, ez, 1.4));   // + v0.32 ruins and wrecks   // blockhouses, pillboxes, HQ shelters
      for (const o of V) if (o !== v && !(o.k !== 'tank' && o.dead) && Math.hypot(o.x - nx, o.z - nz) < (o.k === 'tank' ? 7.5 : 3.2) && Math.hypot(o.x - nx, o.z - nz) < Math.hypot(o.x - v.x, o.z - v.z)) {
        if (o.k !== 'tank' && o.team !== v.team && Math.abs(v.v) > .5) hurt(o, 9999, drv || v.crew, 'tank');   // rolls over an enemy gun pit
        else blocked = true;
      }
      if (blocked || bigBlock) v.v = 0; else { v.x = nx; v.z = nz; }
    }
    // sit on the ground: four track points give height, pitch and roll (long enough to bridge a trench)
    // v0.29: a rigid hull rests on the highest ground under each half of each track, so it bridges trenches and craters and
    // climbs out of them instead of sinking in (dugout roofs count as ground)
    const L = D.len * .42, Wd = D.wid * .4, H0 = C.terr().H, hp = (a, b) => T.groundAt(H0, v.x + fx * a + rx * b, v.z + fz * a + rz * b, 99);
    const hFL = Math.max(hp(L, -Wd), hp(L / 2, -Wd)), hFR = Math.max(hp(L, Wd), hp(L / 2, Wd)), hBL = Math.max(hp(-L, -Wd), hp(-L / 2, -Wd)), hBR = Math.max(hp(-L, Wd), hp(-L / 2, Wd)), hM = Math.max(hp(0, -Wd), hp(0, Wd));
    const yT = Math.max((hFL + hFR + hBL + hBR) / 4, hM - .3), pT = Math.atan2((hFL + hFR) / 2 - (hBL + hBR) / 2, 2 * L), rT = Math.atan2((hFR + hBR) / 2 - (hFL + hBL) / 2, 2 * Wd);
    v.y += (yT - v.y) * Math.min(1, DT * 6); v.pitch += (clamp(pT, -.5, .5) - v.pitch) * Math.min(1, DT * 5); v.roll += (clamp(rT, -.4, .4) - v.roll) * Math.min(1, DT * 5);
    { const climb = (hFL + hFR) / 2 - (hBL + hBR) / 2; if (climb > 1.6 && v.v > 1.4) v.v = Math.max(1.4, v.v - 4 * DT); }   // a steep wall slows it to a crawl, but it always gets up
    // crush wire and sandbags; run down enemies, shove friends aside
    if (Math.abs(v.v) > .2) for (const f of [...T.FORTS.values()]) if (T.FORT[f.k].small && Math.abs(f.x - v.x) < 6 && Math.abs(f.z - v.z) < 6 && inTank(v, f.x, v.y + .5, f.z, .8)) C.removeFort(f);
    for (const e of ents.values()) {
      if (!e.alive || e.manned || e.cmd || e.inV || e.tank) continue;
      const dx = e.x - v.x, dz = e.z - v.z; if (dx * dx + dz * dz > 36) continue;
      const lx = dx * rx + dz * rz, lz = dx * fx + dz * fz, ox = D.wid / 2 + .35 - Math.abs(lx), oz = D.len / 2 + .35 - Math.abs(lz);
      if (ox <= 0 || oz <= 0 || e.y > v.y + D.hgt) continue;
      if (Math.abs(v.v) > .8 && e.team !== v.team && Math.sign(lz) === Math.sign(v.v) && !e.gun) { e._imp = [fx * v.v, 2, fz * v.v]; C.damage(e, 400, drv || v.crew, false, null, 'tank'); e._imp = null; continue; }
      if (ox < oz) { const s = Math.sign(lx) || 1; e.x += rx * s * ox; e.z += rz * s * ox; } else { const s = Math.sign(lz) || 1; e.x += fx * s * oz; e.z += fz * s * oz; }
      e.y = T.groundAt(H, e.x, e.z, e.y + .5);
    }
    for (const p of v.seats) if (p) { p.x = v.x; p.z = v.z; p.y = v.y + .4; p.vy = 0; }
    if (v.crew) { v.crew.x = v.x; v.crew.z = v.z; v.crew.y = v.y; v.crew.alive = true; v.crew.hp = 100; }
  }
  function emplTick(v) {
    if (v.dead) { if (!v.lost && v.repair && now() >= v.repair) { v.dead = false; v.hp = v.hpMax; v.repair = 0; C.teamTell(v.team, 'The ' + VEH[v.k].n.toLowerCase() + ' is back in action'); } return; }
    v.rl = Math.max(0, v.rl - DT); if (v.fl > 0) v.fl--;
    const p = v.seats[0]; if (p) { p.x = v.seat.x; p.z = v.seat.z; p.y = hAt(p.x, p.z); p.vy = 0; }
  }
  let vstT = 0;
  function tick() {
    for (const v of V.slice()) v.k === 'tank' ? tankTick(v) : v.k === 'plane' ? planeTick(v) : emplTick(v);
    for (const t of [0, 1]) if (!V.some(v => v.k === 'plane' && v.team === t)) spawnPlane(t);
    shellsTick();
    if (now() % 2 === 0) {   // changed vehicles at 10 Hz
      const ch = []; for (const v of V) { const a = enc(v), k = a.join(','); if (k !== v.last) { v.last = k; ch.push(a); } }
      if (ch.length) C.bcast({ t: 'vh', l: ch });
    }
    if (++vstT >= 4) { vstT = 0; for (const v of V) for (const p of v.seats) if (p) C.send(p, { t: 'vst', hp: Math.max(0, Math.round(100 * v.hp / v.hpMax)), rl: +Math.max(0, v.rl).toFixed(1), heat: Math.round((v.heat || 0) * 100), over: v.over ? 1 : 0, rng: v.rng, sup: C.supply()[v.team] }); }
    for (let i = V.length - 1; i >= 0; i--) { const v = V[i]; if (v.k === 'tank' && v.dead && v.burnT && now() > v.burnT + 120 * TICK) { V.splice(i, 1); C.bcast({ t: 'vh', rm: [v.id] }); } }   // old wrecks are cleared after a while
  }
  const r1 = x => Math.round(x * 10) / 10, r3 = x => Math.round(x * 1000) / 1000;
  function enc(v) {
    const crewed = v.seats.some(Boolean) || (v.crew && v.crew.alive && !v.crew.manned && v.k !== 'tank') || (v.k === 'tank' && !v.dead);
    return [v.id, KIDX[v.k], v.team, r1(v.x), r1(v.y), r1(v.z), r3(v.yaw), r3(v.pitch), r3(v.roll), r3(v.gy), r3(v.gp), r3(v.my || 0), Math.max(0, Math.round(100 * v.hp / v.hpMax)),
      (v.dead ? 1 : 0) | (v.hp < v.hpMax * .3 ? 2 : 0) | (v.seats[0] && !v.seats[0].bot ? 4 : 0) | (crewed ? 8 : 0) | (v.fl > 0 ? 16 : 0) | (v.mfl > 0 ? 32 : 0) | (v.lost ? 64 : 0) | (v.air ? 128 : 0), r1(v.k === 'plane' ? v.spd : v.v || 0)];
  }
  const fullMsg = () => ({ t: 'vh', l: V.map(enc), full: 1 });

  function reset() {
    for (const v of V) for (const p of v.seats) if (p) leave(p, true);
    for (let i = V.length - 1; i >= 0; i--) if (V[i].k === 'plane') V.splice(i, 1);
    for (let i = V.length - 1; i >= 0; i--) if (V[i].k === 'tank') { if (V[i].crew) C.ents.delete(V[i].crew.id); V.splice(i, 1); }
    V.forEach((v, i) => {   // v0.30: guns and mortars move with the map (V holds the emplacements in T.EMPL order once tanks are gone)
      const q = T.EMPL[i]; if (!q || q.k !== v.k) return; const [fx, fz] = fwd(q.yaw);
      Object.assign(v, { base: q, x: q.x, z: q.z, y: hAt(q.x, q.z), yaw: q.yaw, seat: { x: q.x - fx * 1.8, z: q.z - fz * 1.8 } });
      if (v.crew) { v.crew.hx = v.seat.x; v.crew.hz = v.seat.z; }
    });
    for (const v of V) { v.dead = false; v.lost = false; v.hp = v.hpMax; v.rl = 0; v.repair = 0; v.gy = 0; v.aiT = 4 + rnd() * 10; v.last = ''; }
    shells.length = 0; C.bcast(fullMsg());
  }
  // Operations: guns standing on ground the defenders have just lost are spiked by their crews
  function groundLost(team, lost) {
    for (const v of V) if (v.k !== 'tank' && v.team === team && !v.dead && lost(v.x, v.z)) {
      v.dead = true; v.lost = true; for (const p of v.seats) if (p) leave(p);
      if (v.crew && v.crew.alive) { v.crew.alive = false; v.crew.rt = 1e9; }
    }
  }
  const nearEnemyTank = (e, r) => V.find(v => v.k === 'tank' && !v.dead && v.team !== e.team && Math.hypot(v.x - e.x, v.z - e.z) < r) || null;
  const tanks = () => V.filter(v => v.k === 'tank');
  function fixNow(v) { if (!v.dead || v.lost) return; v.dead = false; v.hp = v.hpMax; v.repair = 0; C.teamTell(v.team, 'The ' + VEH[v.k].n.toLowerCase() + ' is back in action'); }   // v0.31: repaired by hand
  return { spawnPlane, planes: () => V.filter(v => v.k === 'plane'), fixNow, V, shells, tick, input, enter, leave, vehNear, spawnTank, fireShell, fireMain, fireGun, tankMg, hurt, blast, bulletHit, inTank, crewTick, fullMsg, reset, groundLost, nearEnemyTank, tanks, lobPitch, tankGoal, artyTarget, TANK_NAME };
};
