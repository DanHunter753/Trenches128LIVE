'use strict';
// Real browser client against a server with simulated latency (T128_LAG, ~250 ms ping with jitter), v0.38:
// sprinting for 25 s is never pulled back (the movement bank used to drain after ~20 s and then yank the player back several
// times a second), and your own shot is shown the moment you fire, exactly once per real shot.
const { chromium } = require('playwright'); const fs = require('fs');
const url = process.argv[2] || 'http://localhost:8099';
const STUB = fs.readFileSync(__dirname + '/browser.js', 'utf8').match(/const STUB = `([\s\S]*?)`;/)[1];
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] }); const R = {}, ck = (k, v) => { R[k] = !!v; }, errors = [];
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } }); page.on('pageerror', e => errors.push(e.message)); await page.route('**/three.min.js', r => r.fulfill({ contentType: 'text/javascript', body: STUB }));
  await page.goto(url); await page.fill('#nm', 'Laggy'); await page.click('#cn'); await page.waitForSelector('#go'); await page.click('#go'); await page.waitForFunction(() => me.alive === true, null, { timeout: 20000 });
  await page.evaluate(() => { S.tut = false; window.LG = { c: [], fx: 0, t: [] }; const o = onSnap; onSnap = buf => { const x = me.x, z = me.z; o(buf); if (me.alive && !LG.skip) LG.c.push(Math.hypot(me.x - x, me.z - z)); };
    const sf = shotFx; shotFx = function () { LG.fx++; LG.t.push(performance.now()); return sf.apply(this, arguments); }; });
  await sleep(2500); R.ping = await page.evaluate(() => ping); ck('lagIsSimulated', R.ping > 120);
  // ---- shots: shown at once, once each
  await page.evaluate(() => { LG.skip = 1; sendJ({ t: 'tp', x: 0, z: me.team ? -150 : 150 }); me.pitch = .2; }); await sleep(900);
  const a0 = await page.evaluate(() => me.ammo); const delays = [];
  for (let i = 0; i < 3; i++) { delays.push(await page.evaluate(() => new Promise(res => { const n0 = LG.fx, t0 = performance.now(); fireLatch = true; const iv = setInterval(() => { if (LG.fx > n0) { clearInterval(iv); res(Math.round(LG.t[LG.t.length - 1] - t0)); } else if (performance.now() - t0 > 2000) { clearInterval(iv); res(9999); } }, 4); }))); await sleep(1700); }
  const end = await page.evaluate(() => [me.ammo, LG.fx, predAt.length]); R.shots = { delays, ammoUsed: a0 - end[0], shown: end[1], pending: end[2] };
  ck('shotShownAtOnce', delays.every(d => d < 60)); ck('oneKickPerShot', a0 - end[0] === 3 && end[1] === 3 && end[2] === 0);
  // ---- movement: 25 s of sprinting in a circle, no pull-backs
  await page.evaluate(() => { setInterval(() => { me.yaw += .02; me.pitch = 0; }, 16); }); await page.keyboard.down('ShiftLeft'); await page.keyboard.down('KeyW'); await sleep(1500);
  await page.evaluate(() => { LG.c = []; LG.skip = 0; }); await sleep(25000);
  const mv = await page.evaluate(() => ({ snaps: LG.c.length, corrected: LG.c.filter(v => v > .005).length, max_cm: +(Math.max(0, ...LG.c) * 100).toFixed(1), last10s: LG.c.slice(-200).filter(v => v > .005).length, alive: me.alive })); R.move = mv;
  ck('neverPulledBack', mv.alive && mv.snaps > 350 && mv.corrected <= 2 && mv.max_cm < 6 && mv.last10s <= 1);
  ck('noErrors', !errors.length); R.errors = errors.slice(0, 3);
  console.log(JSON.stringify(R)); const bad = Object.keys(R).filter(k => R[k] === false); console.log(bad.length ? 'FAILED: ' + bad.join(', ') : 'ALL ' + Object.keys(R).filter(k => typeof R[k] === 'boolean').length + ' CHECKS PASSED');
  await browser.close(); process.exit(bad.length ? 1 : 0);
})().catch(e => { console.log('TEST ERROR', e); process.exit(1); });
