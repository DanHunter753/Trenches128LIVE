'use strict';
// v0.29: tanks cross trenches. A tank dropped lengthwise into a fire trench must be able to turn and drive out within seconds,
// a tank must bridge a trench it drives across, it must not drive into an HQ shelter, and it must drive over a dugout roof.
process.argv = ['node', 'x', '--port', '8064', '--fill', '0', '--no-fetch', '--data', require('fs').mkdtempSync(require('os').tmpdir() + '/t128tt-')];
const X = require('../server.js')._test, T = require('../shared.js');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const R = { checks: {} }, ck = (k, v) => R.checks[k] = !!v;
(async () => {
  await sleep(600); const V = X.VEHM(), H = () => X.terrH();
  const tk = V.spawnTank(0, 'test'); const drv = { id: -77, team: 0, name: 'drv', alive: true, seat: 0, veh: tk, x: 0, y: 0, z: 0 }; tk.seats[0] = drv;
  const put = (x, z, yaw) => { tk.x = x; tk.z = z; tk.yaw = yaw; tk.v = 0; tk.y = T.hAt(H(), x, z); tk.pitch = tk.roll = 0; };
  const drive = async (thr, steer, ms) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { tk.thr = thr; tk.steer = steer; await sleep(50); } tk.thr = 0; tk.steer = 0; };
  // 1. lengthwise in the blue front trench (x = -50, away from dugouts, nests, HQs)
  const x0 = -52, c = T.trenchC(30, x0); put(x0, c, -Math.PI / 2); await sleep(400);
  R.inTrenchY = +(tk.y - T.base(x0, c)).toFixed(2);
  await drive(1, 1, 1600); await drive(1, 0, 9000);
  const out = Math.abs(tk.z - T.trenchC(30, tk.x)); R.outOfTrench = +out.toFixed(1); R.yAboveBase = +(tk.y - T.base(tk.x, tk.z)).toFixed(2);
  ck('drivesOutOfTrench', out > 8 && tk.y > T.base(tk.x, tk.z) - 1.2);
  // 2. drive straight across the support trench: it must bridge it (never sink to the trench floor)
  { const x1 = -20, c1 = T.trenchC(64, x1); put(x1, c1 - 12, Math.PI); let low = 9; const t0 = Date.now(); while (Date.now() - t0 < 9000) { tk.thr = 1; tk.steer = 0; await sleep(50); if (Math.abs(tk.z - c1) < 1) low = Math.min(low, tk.y - T.base(tk.x, tk.z)); }
    tk.thr = 0; R.crossLow = +low.toFixed(2); R.crossedTo = +(tk.z - c1).toFixed(1); ck('bridgesTrench', tk.z - c1 > 4 && low > -1.6); }   /* (across: the trench is ~3 m wide; v0.29 tanks slow on climbs, so 9 s no longer always reaches +6 m) */
  // 3. HQ shelter blocks a tank
  { const q = T.HQS[0]; put(q.x - 14, q.z, -Math.PI / 2); await drive(1, 0, 6000); R.hqGap = +(q.x - tk.x).toFixed(1); ck('hqBlocksTank', q.x - tk.x > 5); }
  // 4. over a dugout roof the hull rides on the roof, not down in the room
  { const r = T.ROOMS.find(q => q.t === 64 && q.xc === 40) || T.ROOMS[5]; put(r.xc, (r.z0 + r.z1) / 2, 0); await sleep(600); R.onRoof = +(tk.y - r.rt).toFixed(2); ck('ridesOverDugoutRoof', tk.y > r.rb); }
  tk.seats[0] = null; console.log(JSON.stringify(R, null, 1)); const bad = Object.entries(R.checks).filter(([, v]) => !v).map(e => e[0]);
  console.log(bad.length ? 'FAILED ' + bad : 'ALL ' + Object.keys(R.checks).length + ' CHECKS PASSED'); process.exit(bad.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
