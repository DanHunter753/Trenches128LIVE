'use strict';
// Real browser client (THREE stubbed), v0.28 audit: three minutes in a busy match (bots, artillery, tanks, fires) checking that the
// client stays healthy: no errors, bounded particle / corpse / shell lists, pooled sprites reused, JS heap not growing without
// bound, and the per-frame JavaScript cost (everything except the GPU) staying low. Run against T128_TEST=1 node server.js --port 8099 --fill 40.
const { chromium } = require('playwright'); const fs = require('fs');
const url = process.argv[2] || 'http://localhost:8099', SECS = +process.argv[3] || 180;
const STUB = fs.readFileSync(__dirname + '/browser.js', 'utf8').match(/const STUB = `([\s\S]*?)`;/)[1];
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--enable-precise-memory-info'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 760 } }); const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.route('**/three.min.js', r => r.fulfill({ contentType: 'text/javascript', body: STUB }));
  await page.goto(url); await page.waitForSelector('#nm');
  await page.fill('#nm', 'SoakTester'); await page.click('#cn'); await page.waitForSelector('#go'); await page.click('#go');
  await page.waitForFunction(() => me.alive === true, null, { timeout: 8000 });
  await page.evaluate(() => { window.__ft = []; const f = window.frame; window.frame = function () { const t = performance.now(); f(); __ft.push(performance.now() - t); if (__ft.length > 5000) __ft.splice(0, 2500); }; S.fps = true; sendJ({ t: 'tk' }); });
  const samples = []; const t0 = Date.now();
  while (Date.now() - t0 < SECS * 1000) {
    await page.evaluate(() => { const x = me.x + (Math.random() - .5) * 60, z = me.z - 20 - Math.random() * 40; onMsg({ t: 'cr', c: [x, z, 4, 1.6] }); onMsg({ t: 'fi', x, z, r: 2, s: 4 }); for (let i = 0; i < 3; i++) puff(x, hAt(x, z), z); });   // extra bombardment on top of the real battle
    await sleep(1000);
    samples.push(await page.evaluate(() => ({ heap: performance.memory ? performance.memory.usedJSHeapSize : 0, debris: debris.length, flameP: flameP.length, corpses: corpses.length, shells: shellL.length, ents: ents.size, pool: [...SPOOL.values()].reduce((a, b) => a + b.length, 0), ft: __ft.length ? __ft.reduce((a, b) => a + b, 0) / __ft.length : 0, worst: __ft.length ? Math.max(...__ft) : 0 })));
    await page.evaluate(() => { __ft.length = 0; if (!me.alive && !me.down) sendJ({ t: 'act', a: 'spawnAt', id: 0 }); });
  }
  const last = samples.slice(-10), first = samples.slice(5, 15), avg = (a, k) => a.reduce((s, q) => s + q[k], 0) / a.length;
  const out = {
    noErrors: errors.length === 0,
    boundedLists: samples.every(q => q.debris <= 160 && q.flameP <= 270 && q.corpses <= 61 && q.shells < 60),
    poolsReused: samples.some(q => q.pool > 0),
    heapStable: avg(last, 'heap') < avg(first, 'heap') * 1.6 + 8e6,
    frameJsCost: avg(samples, 'ft') < 6,
    sawBattle: Math.max(...samples.map(q => q.ents)) > 20,
  };
  console.log(JSON.stringify({ frameMsAvg: +avg(samples, 'ft').toFixed(2), worstMs: +Math.max(...samples.map(q => q.worst)).toFixed(1), heapMB: [+(avg(first, 'heap') / 1e6).toFixed(1), +(avg(last, 'heap') / 1e6).toFixed(1)], maxEnts: Math.max(...samples.map(q => q.ents)), maxLists: ['debris', 'flameP', 'corpses', 'shells'].map(k => k + ' ' + Math.max(...samples.map(q => q[k]))).join(', '), errors: errors.slice(0, 5) }));
  console.log(JSON.stringify(out, null, 1));
  const ok = Object.values(out).every(v => v === true); console.log(ok ? 'SOAK BROWSER OK' : 'SOAK BROWSER FAIL'); await browser.close(); process.exit(ok ? 0 : 1);
})().catch(e => { console.log('TEST ERROR', e.message); process.exit(1); });
