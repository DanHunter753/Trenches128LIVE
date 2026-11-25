'use strict';
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
  ck('controlsShown', await page.evaluate(() => $('tc').style.display === 'block' && $('tc').querySelectorAll('button').length >= 12 && lockedNow()));
  // stick: press on the left, push up -> forward key held, the soldier walks
  const p0 = await page.evaluate(() => [me.x, me.z]);
  await touch('touchStart', [[150, 260, 1]]); await touch('touchMove', [[150, 200, 1]]);
  ck('stickForward', await page.evaluate(() => !!K[S.binds.fwd] && !K[S.binds.back] && $('tcs').style.display === 'block'));
  await sleep(1200); const p1 = await page.evaluate(() => [me.x, me.z]); R.walked = +Math.hypot(p1[0] - p0[0], p1[1] - p0[1]).toFixed(2); ck('walks', R.walked > 1);
  await touch('touchMove', [[150, 140, 1]]); ck('edgeSprints', await page.evaluate(() => !!K[S.binds.sprint]));
  await touch('touchEnd', []); ck('stickReleases', await page.evaluate(() => !K[S.binds.fwd] && !K[S.binds.sprint] && $('tcs').style.display === 'none'));
  // look: drag on the right half turns
  const y0 = await page.evaluate(() => me.yaw); await touch('touchStart', [[500, 150, 2]]); await touch('touchMove', [[560, 150, 2]]); await touch('touchEnd', []);
  ck('dragTurns', await page.evaluate(y => me.yaw < y - .1, y0));
  // buttons
  const btn = a => page.evaluate(a => { const b = $('tc').querySelector(`[data-a="${a}"]`).getBoundingClientRect(); return [b.x + b.width / 2, b.y + b.height / 2]; }, a);
  let [fx, fy] = await btn('fire'); await touch('touchStart', [[fx, fy, 3]]); ck('fireHeld', await page.evaluate(() => fireHeld === true)); await touch('touchEnd', []); ck('fireReleased', await page.evaluate(() => fireHeld === false));
  [fx, fy] = await btn('ads'); await touch('touchStart', [[fx, fy, 4]]); await touch('touchEnd', []); ck('aimToggles', await page.evaluate(() => adsHeld === true));
  await touch('touchStart', [[fx, fy, 4]]); await touch('touchEnd', []); ck('aimOff', await page.evaluate(() => adsHeld === false));
  [fx, fy] = await btn('crouch'); await touch('touchStart', [[fx, fy, 5]]); await touch('touchEnd', []); ck('crouchLatches', await page.evaluate(() => !!K[S.binds.crouch]));
  await touch('touchStart', [[fx, fy, 5]]); await touch('touchEnd', []); ck('crouchOff', await page.evaluate(() => !K[S.binds.crouch]));
  await page.evaluate(() => { window.__sent = []; const o = ws.send.bind(ws); ws.send = d => { if (typeof d === 'string') try { window.__sent.push(JSON.parse(d)); } catch (e) { } return o(d); }; });
  [fx, fy] = await btn('reload'); await touch('touchStart', [[fx, fy, 6]]); await touch('touchEnd', []); await sleep(150);
  ck('reloadSends', await page.evaluate(() => window.__sent.some(m => m.t === 'act' && m.a === 'reload')));
  // a touch on a button never steers or turns
  const y1 = await page.evaluate(() => me.yaw); [fx, fy] = await btn('jump'); await touch('touchStart', [[fx, fy, 7]]); await touch('touchMove', [[fx - 40, fy, 7]]); await touch('touchEnd', []);
  ck('buttonsDontLook', await page.evaluate(y => Math.abs(me.yaw - y) < 1e-6 && !K[S.binds.jump], y1));
  // off in settings: hidden, and the page goes back to wanting a mouse
  await page.evaluate(() => { S.touch = false; applyS(); }); await sleep(200);
  ck('offHides', await page.evaluate(() => $('tc').style.display === 'none' && !document.body.classList.contains('touch')));
  ck('settingListed', await page.evaluate(() => { setTab = 'controls'; renderSet(); return !!$('setb').querySelector('[data-c="touch"],[data-k="touch"],input[data-b="touch"]') || /Touch controls/.test($('setb').textContent); }));
  ck('noErrors', errors.length === 0); if (errors.length) console.log(errors.slice(0, 5));
  console.log(JSON.stringify(R)); const bad = Object.keys(R).filter(k => R[k] === false); console.log(bad.length ? 'TOUCH FAIL: ' + bad.join(', ') : 'TOUCH OK');
  await browser.close(); process.exit(bad.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
