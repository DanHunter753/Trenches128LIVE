'use strict';
const { chromium } = require('playwright'); const fs = require('fs');
const url = process.argv[2] || 'http://localhost:8099';
const STUB = fs.readFileSync(__dirname + '/browser.js', 'utf8').match(/const STUB = `([\s\S]*?)`;/)[1];
const sleep = ms => new Promise(r => setTimeout(r, ms));
// v0.43 Wake Atoll in the browser: the page gets the island's heightmap with the page, builds the 800 m world, spawns on land,
// shows the Domination score line and the five flags, and positions decode at the 2 cm quantum without drift.
(async () => {
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] }); const R = {}, ck = (k, v) => { R[k] = !!v; }, errors = [];
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } }); page.on('pageerror', e => errors.push(e.message)); await page.route('**/three.min.js', r => r.fulfill({ contentType: 'text/javascript', body: STUB }));
  await page.goto(url); await page.waitForTimeout(1500);
  ck('islandWorld', await page.evaluate(() => T.MP.kind === 'wake' && T.W === 400 && T.N === 800 && WAKE && PQ === 50 && typeof T128_HM === 'object' && T.OBJ[0].n === 'Airfield'));
  await page.fill('#nm', 'Islander'); await page.click('#cn'); await page.waitForSelector('#go', { timeout: 8000 }); await page.click('#go');
  await page.waitForFunction(() => me.alive === true, null, { timeout: 10000 }); await page.waitForTimeout(2500);
  ck('noReloadLoop', await page.evaluate(() => T.MP.seed === T.WAKE_SEED && me.alive));
  const st = await page.evaluate(() => ({ x: me.x, z: me.z, h: hAt(me.x, me.z), team: me.team, stat: $('stat').textContent }));
  await page.evaluate(() => sendJ({ t: 'tp', x: 236, z: 206 })); await page.waitForFunction(() => ents.size >= 3, null, { timeout: 8000 }).catch(() => {}); st.n = await page.evaluate(() => ents.size);
  R.st = st; ck('spawnOnLand', st.h > .3 && Math.abs(st.x) < 399 && Math.abs(st.z) < 399);
  ck('scoreLine', /HOLD THE ATOLL · (YOU|ENEMY) \d+ – \d+ (YOU|ENEMY) · FIRST TO 100\nA[●○✕]  B[●○✕]  C[●○✕]  D[●○✕]  E[●○✕]/.test(st.stat));
  ck('seesSoldiers', st.n >= 3);
  // positions of others agree with the server's world (a 2 cm quantum puts nobody in the sea or past the edge)
  const far = await page.evaluate(() => { let bad = 0, n = 0; for (const e of ents.values()) { n++; const p = e.b; if (Math.abs(p.x) > 400 || Math.abs(p.z) > 400 || hAt(p.x, p.z) < -1.6) bad++; } return [bad, n]; });
  R.far = far; ck('othersOnLand', far[0] === 0 && far[1] >= 3);
  // walking into the sea stops at wading depth
  await page.evaluate(() => { Object.defineProperty(document, 'pointerLockElement', { get: () => document.getElementById('c'), configurable: true }); S.tut = false; });
  await page.evaluate(() => sendJ({ t: 'tp', x: -180, z: -320 })); await page.waitForTimeout(800);
  const pick = await page.evaluate(() => { let best = 1e9, by = 0; for (let k = 0; k < 36; k++) { const y = k / 36 * Math.PI * 2; for (let d = 10; d <= 70; d += 5) if (hAt(me.x - Math.sin(y) * d, me.z - Math.cos(y) * d) < -.5) { if (d < best) { best = d; by = y; } break; } } me.yaw = by; return [by, best]; });
  const t0 = Date.now(); await page.keyboard.down('KeyW'); let w = null; while (Date.now() - t0 < 25000) { await page.waitForTimeout(500); w = await page.evaluate(() => ({ h: +hAt(me.x, me.z).toFixed(2), y: +me.y.toFixed(2), alive: me.alive })); if (w.h < -.9 || !w.alive) break; } await page.keyboard.up('KeyW');
  R.wade = Object.assign(w, { dir: pick }); ck('wadesNotDrowns', w.alive && w.h > -1.35 && w.h < -.5);
  ck('noErrors', !errors.length); R.errors = errors.slice(0, 3);
  console.log(JSON.stringify(R)); const bad = Object.keys(R).filter(k => R[k] === false); console.log(bad.length ? 'FAILED: ' + bad.join(', ') : 'ALL ' + Object.keys(R).filter(k => typeof R[k] === 'boolean').length + ' CHECKS PASSED');
  await browser.close(); process.exit(bad.length ? 1 : 0);
})().catch(e => { console.log('TEST ERROR', e); process.exit(1); });
