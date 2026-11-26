'use strict';
// v0.35 night lights: lamps and fires placed where they would really be, the same on server and clients; at night a man
// standing in the light is seen as if by day, one in the dark still only at night range.
const T = require('../shared.js'), R = {}, ck = (k, v) => { R[k] = !!v; };
const seeds = [0, 4242, 77]; let det = true, kinds = true, frontDark = true, onMap = true;
for (const sd of seeds) {
  T.setMap(sd); const a = JSON.stringify(T.LIGHTS); T.setMap(sd + 1); T.setMap(sd); if (JSON.stringify(T.LIGHTS) !== a) det = false;
  const c = {}; T.LIGHTS.forEach(l => c[l.k] = (c[l.k] || 0) + 1);
  if (!(c.lantern >= 20 && c.brazier >= 6 && c.pot >= 10 && c.burn === 22 && c.wreck >= 2)) kinds = false;
  // nothing burns in the open on the front line itself: the only lights within 6 m of a front trench are lamps inside dugouts
  for (const l of T.LIGHTS) { if (l.k !== 'lamp' && l.k !== 'burn' && l.k !== 'wreck' && l.k !== 'fire' && [30, -30].some(t => Math.abs(l.z - T.trenchC(t, l.x)) < 6)) frontDark = false;
    if (l.k === 'lamp' && l.y != null && !T.ROOMS.some(r => l.x >= r.x0 && l.x <= r.x1 && l.z >= r.z0 && l.z <= r.z1)) frontDark = false;
    if (Math.abs(l.x) > T.W || Math.abs(l.z) > T.W) onMap = false; }
  R['n' + sd] = c;
}
ck('sameEverywhere', det); ck('allKinds', kinds); ck('frontLineDark', frontDark); ck('onMap', onMap);
T.setMap(0); const br = T.LIGHTS.find(l => l.k === 'brazier'), pot = T.LIGHTS.find(l => l.k === 'pot');
ck('litAtLight', T.litAt(br.x, br.z) === 1); ck('fadesOut', T.litAt(pot.x + pot.r * .8, pot.z) < .5 && T.litAt(pot.x + pot.r * .8, pot.z) > 0 && T.litAt(pot.x + pot.r + .5, pot.z) === 0);
let dark = null; for (let x = -150; x < 150 && !dark; x += 7) if (T.litAt(x, 18) === 0) dark = [x, 18];
const S = require('../server.js'), X = S._test;
setTimeout(() => {
  X.setWx('overcast'); ck('dayUnchanged', X.sightAt(0, br.x, br.z) === 1);
  X.setWx('night'); R.sight = [X.sightAt(0, br.x, br.z), X.sightAt(0, dark[0], dark[1])];
  ck('nightLitSeen', X.sightAt(0, br.x, br.z) === 1); ck('nightDarkHidden', X.sightAt(0, dark[0], dark[1]) < .5); const wr = T.LIGHTS.find(l => l.k === 'wreck'); ck('wreckFireLights', X.sightAt(0, wr.x, wr.z) === 1);
  console.log(JSON.stringify(R)); const bad = Object.keys(R).filter(k => R[k] === false); console.log(bad.length ? 'FAILED: ' + bad.join(', ') : 'ALL ' + Object.keys(R).filter(k => typeof R[k] === 'boolean').length + ' CHECKS PASSED'); process.exit(bad.length ? 1 : 0);
}, 1500);
