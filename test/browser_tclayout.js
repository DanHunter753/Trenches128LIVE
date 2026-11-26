'use strict';
// Real browser, v0.33.1: the touch button layout editor. Original header:
// Real browser as a phone (touch only, THREE stubbed), v0.30.1 touch controls: on by default on a touch-only device; once
// deployed the stick, look area and buttons appear and drive the soldier: the stick walks, a drag turns, FIRE holds the
// trigger, AIM toggles, CROUCH latches, RELOAD sends the action; turning them off in settings hides them.
const { chromium } = require('playwright'); const fs = require('fs');
const url = process.argv[2] || 'http://localhost:8099';
const STUB = fs.readFileSync(__dirname + '/browser.js', 'utf8').match(/const STUB = `([\s\S]*?)`;/)[1];
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const page = await ctx.newPage(); const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.route('**/three.min.js', r => r.fulfill({ contentType: 'text/javascript', body: STUB }));
  const cdp = await ctx.newCDPSession(page);
  const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y, id]) => ({ x, y, id })) });
  const R = {}, ck = (k, v) => { R[k] = !!v; };
  await page.goto(url); ck('onByDefault', await page.evaluate(() => S.touch === true && document.body.classList.contains('touch')));
  await page.fill('#nm', 'ThumbTester'); await page.tap('#cn'); await page.waitForSelector('#go'); await page.tap('#go');
  await page.waitForFunction(() => me.alive === true, null, { timeout: 8000 }); await sleep(600);
  if (process.env.SHOT) { await touch('touchStart', [[150, 260, 9]]); await touch('touchMove', [[175, 225, 9]]); await page.screenshot({ path: process.env.SHOT }); await touch('touchEnd', []); }
  const pos = a => page.evaluate(a => { const r = document.querySelector('#tc button[data-a="' + a + '"]').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }, a);
  // the pencil turns edit mode on; dragging the GREN button moves it and does not throw a grenade
  const gr0 = await page.evaluate(() => me.gr);
  const pen = await page.evaluate(() => { const b = [...$('tc').querySelectorAll('button')].find(b => b.textContent === '✎'); const r = b.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; });
  await touch('touchStart', [[pen[0], pen[1], 1]]); await touch('touchEnd', []); await sleep(200);
  ck('editMode', await page.evaluate(() => TCH.edit && $('tcbar').style.display === 'block'));
  const [gx, gy] = await pos('grenade'); await touch('touchStart', [[gx, gy, 2]]); for (let k = 1; k <= 6; k++) { await touch('touchMove', [[gx - 40 * k, gy - 15 * k, 2]]); await sleep(20); } await touch('touchEnd', []); await sleep(200);
  const [nx, ny] = await pos('grenade'); R.moved = [Math.round(nx - gx), Math.round(ny - gy)];
  ck('buttonMoves', Math.abs(nx - (gx - 240)) < 3 && Math.abs(ny - (gy - 90)) < 3); ck('noGrenadeWhileEditing', await page.evaluate(g => me.gr === g, gr0));
  const done = await page.evaluate(() => { const r = $('tcdone').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }); await touch('touchStart', [[done[0], done[1], 3]]); await touch('touchEnd', []); await sleep(200);
  ck('saved', await page.evaluate(() => !TCH.edit && !!S.tcLay.grenade && !!JSON.parse(localStorage.getItem('t128set')).tcLay.grenade));
  // after a reload the button is where it was left
  await page.reload(); await page.fill('#nm', 'ThumbTester'); await page.tap('#cn'); await page.waitForSelector('#go'); await page.tap('#go');
  await page.waitForFunction(() => me.alive === true, null, { timeout: 8000 }); await sleep(600);
  const [rx, ry] = await pos('grenade'); ck('layoutKeptAfterReload', Math.abs(rx - nx) < 3 && Math.abs(ry - ny) < 3);
  // it works as a button again
  await touch('touchStart', [[rx, ry, 4]]); await touch('touchEnd', []); await sleep(400); ck('worksAfterMove', await page.evaluate(g => me.gr < g || $('msg').textContent.length > 0, gr0));
  // reset puts it back
  await page.evaluate(() => tcEdit(true)); const rs = await page.evaluate(() => { const r = $('tcreset').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; });
  await touch('touchStart', [[rs[0], rs[1], 5]]); await touch('touchEnd', []); await sleep(200); const [bx, by] = await pos('grenade'); ck('resetRestores', Math.abs(bx - gx) < 3 && Math.abs(by - gy) < 3); await page.evaluate(() => tcEdit(false));
  R.errors = errors.slice(0, 3); ck('noErrors', !errors.length);
  console.log(JSON.stringify(R)); const bad = Object.keys(R).filter(k => R[k] === false); console.log(bad.length ? 'FAILED: ' + bad.join(', ') : 'ALL ' + Object.keys(R).filter(k => typeof R[k] === 'boolean').length + ' CHECKS PASSED');
  await browser.close(); process.exit(bad.length ? 1 : 0);
})().catch(e => { console.log('TEST ERROR', e); process.exit(1); });
