'use strict';
// Real browser client (THREE stubbed): build menu with B + number keys, structures mirrored into shared.js, hold-E building,
// home-base spawning, parachute sprites. Needs a server started with T128_TEST=1.
const { chromium } = require('playwright'); const fs = require('fs');
const url = process.argv[2] || 'http://localhost:8099';
const STUB = fs.readFileSync(__dirname + '/browser.js', 'utf8').match(/const STUB = `([\s\S]*?)`;/)[1];
(async () => {
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1100, height: 700 } });
  const errors = []; page.on('pageerror', e => errors.push('PAGEERROR ' + e.message));
  await page.route('**/three.min.js', r => r.fulfill({ contentType: 'text/javascript', body: STUB }));
  await page.goto(url); await page.waitForSelector('#nm'); await page.fill('#nm', 'FortBrowser'); await page.click('#cn');
  await page.waitForSelector('#go', { timeout: 5000 }); await page.click('#go');
  await page.waitForFunction(() => me.alive === true, null, { timeout: 8000 });
  const out = {};
  await page.waitForFunction(() => !!opS, null, { timeout: 4000 }).catch(() => {}); out.spawnHome = await page.evaluate(() => Math.abs(me.z - stageZ().z) < 12);   // the side's staging point (Operations; the picker shows it at x = 0)
  await page.evaluate(() => { Object.defineProperty(document, 'pointerLockElement', { get: () => document.getElementById('c'), configurable: true }); });
  // open the menu and place a sandbag pile
  await page.keyboard.press('KeyB'); await page.waitForTimeout(150);
  out.menuShown = await page.evaluate(() => getComputedStyle(document.getElementById('bm')).display === 'block' && /Sandbag pile/.test(document.getElementById('bm').textContent));
  out.sapperItemsGreyed = await page.evaluate(() => document.querySelectorAll('#bm .no').length === 5);
  await page.keyboard.press('Digit1'); await page.waitForTimeout(300);
  // choosing an item shows a ghost outline first; left click places it
  out.ghostShown = await page.evaluate(() => ghostK === 'bags' && !!ghost && ghost.visible !== false);
  out.ghostGreen = await page.evaluate(() => ghostOk === true);
  await page.mouse.click(400, 300); await page.waitForTimeout(700);
  out.ghostGone = await page.evaluate(() => ghostK === null);
  out.menuClosed = await page.evaluate(() => getComputedStyle(document.getElementById('bm')).display === 'none');
  out.fortMirrored = await page.evaluate(() => [...T.FORTS.values()].some(f => f.k === 'bags' && f.done === 1));
  out.meshMade = await page.evaluate(() => FTM.size >= 1);
  // the pile blocks walking straight into it (client prediction uses the same shared collision)
  out.blocksPrediction = await page.evaluate(() => { const f = [...T.FORTS.values()].find(q => q.k === 'bags'); return !!T.fortHit(f.x, f.y, f.z, .3, true); });
  // a building's MG nest is added to the client nest list once complete, and removed with it
  out.nestMirror = await page.evaluate(() => { fortApply([9999, 'pillbox', me.team, 20, 70, .5, 0, 1, 2200, 1]); const a = T.NEST.some(n => n.fort === 9999 && Math.abs(n.yaw - .5) < 1e-6); fortDel(9999); return a && !T.NEST.some(n => n.fort === 9999) && !T.FORTS.has(9999); });
  // the hint offers hold-E tear-down next to an enemy structure
  out.tearDownHint = await page.evaluate(async () => { fortApply([9998, 'cover', 1 - me.team, me.x, me.z - 1.5, 0, me.y, 1, 160, 0]); await new Promise(r => setTimeout(r, 300)); const t = document.getElementById('hint').textContent; fortDel(9998); return /tear down/.test(t); });
  out.errors = errors;
  console.log(JSON.stringify(out, null, 1));
  const ok = Object.entries(out).every(([k, v]) => k === 'errors' ? !v.length : v === true);
  console.log(ok ? 'FORTS BROWSER OK' : 'FORTS BROWSER FAIL'); await browser.close(); process.exit(ok ? 0 : 1);
})().catch(e => { console.log('TEST ERROR', e.message); process.exit(1); });
