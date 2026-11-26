'use strict';
// v0.33.3 bot spacing: bots don't stand inside each other. Two idle bots put on the same spot in the open step apart to
// their spacing; men gathering for a push may stand closer; and across the whole battle few bots end up stacked.
process.argv = ['node', 'x', '--port', '8086', '--fill', '128', '--no-fetch', '--data', require('fs').mkdtempSync(require('path').join(require('os').tmpdir(), 't128sp-'))];
process.env.T128_TEST = '1';
const S = require('../server.js'), T = require('../shared.js'), X = S._test;
const sleep = ms => new Promise(r => setTimeout(r, ms)), R = {}, ck = (k, v) => { R[k] = !!v; };
const stacked = () => { const B = [...X.ents.values()].filter(e => e.bot && e.alive && !e.mg && !e.shelter); let c = 0;
  for (const b of B) { for (const o of B) if (o !== b && o.team === b.team && Math.abs(o.y - b.y) < 1.5 && Math.hypot(o.x - b.x, o.z - b.z) < .8) { c++; break; } } return c / B.length; };
(async () => {
  await sleep(500);
  // two idle bots dropped on one spot behind the home camp step apart
  const H = X.terr().H, bs = [...X.ents.values()].filter(e => e.bot && e.team === 0 && !e.mg).slice(0, 2), x = 60, z = T.HOME_Z + 12;
  const pin = () => bs.forEach((b, i) => { b.x = x + i * .1; b.z = z; b.y = T.hAt(H, b.x, b.z); b.alive = true; b.goTo = { x: b.x, z: b.z, until: X.tickNo() + 400 }; b.tgt = null; b.shelter = null; });
  pin(); for (const b of bs) b.goTo.until = X.tickNo() + 400; await sleep(2500);
  R.apart = +Math.hypot(bs[0].x - bs[1].x, bs[0].z - bs[1].z).toFixed(2); ck('idleStepApart', R.apart >= 1.2);   // (both are sent to the very same spot, so they settle a step apart rather than at full spacing)
  // a whole battle: sampled over a minute, few bots stand within 0.8 m of a teammate
  const s = []; for (let i = 0; i < 4; i++) { await sleep(15000); s.push(+(stacked() * 100).toFixed(1)); } R.stackedPct = s;
  ck('fewStacked', s.reduce((a, b) => a + b, 0) / s.length < 20);
  console.log(JSON.stringify(R)); const bad = Object.keys(R).filter(k => R[k] === false); console.log(bad.length ? 'FAILED: ' + bad.join(', ') : 'ALL ' + Object.keys(R).filter(k => typeof R[k] === 'boolean').length + ' CHECKS PASSED'); process.exit(bad.length ? 1 : 0);
})().catch(e => { console.log('TEST ERROR', e); process.exit(1); });
