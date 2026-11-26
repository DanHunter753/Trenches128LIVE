'use strict';
// Real browser, v0.34.1: the respawn pick made on the death map is where you actually come back (it used to be dropped by
// the server because you are dead when you make it). Picks a held flag, then the airfield, and checks the spawn point.
const { chromium } = require('playwright'); const fs = require('fs');
const url = process.argv[2] || 'http://localhost:8099';
const STUB = fs.readFileSync(__dirname + '/browser.js', 'utf8').match(/const STUB = `([\s\S]*?)`;/)[1];
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] }); const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = []; page.on('pageerror', e => errors.push(e.message)); await page.route('**/three.min.js', r => r.fulfill({ contentType: 'text/javascript', body: STUB }));
  const R = {}, ck = (k, v) => { R[k] = !!v; };
  await page.goto(url); await page.fill('#nm', 'Phoenix'); await page.click('#cn'); await page.waitForSelector('#go'); await page.click('#go');
  await page.waitForFunction(() => me.alive === true, null, { timeout: 15000 }); await page.evaluate(() => { S.tut = false; });
  const die = () => page.evaluate(() => sendJ({ t: 'dmg', n: 999, head: true }));
  // 1: a held flag
  await die(); await page.waitForFunction(() => !me.alive && $('spk').style.display === 'block', null, { timeout: 6000 });
  const f = await page.evaluate(() => { const L = spawnList(), i = L.findIndex(q => q.k === 'flag' && q.ok); if (i < 0) return null; pickSpawn(i); return { x: L[i].x, z: L[i].z, n: L[i].n, line: T.FL[-L[i].id - 1] }; });
  R.flag = f && f.n; await page.waitForFunction(() => me.alive === true, null, { timeout: 20000 }); await sleep(300);
  const p1 = await page.evaluate(() => [me.x, me.z]); R.at1 = p1.map(v => +v.toFixed(1));
  ck('spawnsAtPickedFlag', f && Math.abs(p1[0] - f.x) < 9 && await page.evaluate(([x, z, l]) => Math.abs(z - T.trenchC(l, x)) < 2.5, [p1[0], p1[1], f.line]));
  // 2: the airfield
  await die(); await page.waitForFunction(() => !me.alive && $('spk').style.display === 'block', null, { timeout: 6000 });
  await page.evaluate(() => { const L = spawnList(); pickSpawn(L.findIndex(q => q.id === -99)); }); await page.waitForFunction(() => me.alive === true, null, { timeout: 20000 }); await sleep(300);
  const p2 = await page.evaluate(() => [me.x, me.z, T.AIRF[me.team].x, T.AIRF[me.team].z]); R.at2 = p2.map(v => +v.toFixed(1)); ck('spawnsAtAirfield', Math.hypot(p2[0] - p2[2], p2[1] - p2[3]) < 12);
  ck('noErrors', !errors.length);
  console.log(JSON.stringify(R)); const bad = Object.keys(R).filter(k => R[k] === false); console.log(bad.length ? 'FAILED: ' + bad.join(', ') : 'ALL ' + Object.keys(R).filter(k => typeof R[k] === 'boolean').length + ' CHECKS PASSED');
  await browser.close(); process.exit(bad.length ? 1 : 0);
})().catch(e => { console.log('TEST ERROR', e); process.exit(1); });
