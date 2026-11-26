'use strict';
// Real browser, v0.33.2: knocked down on a phone, the CALL MEDIC and HOLD TO RESPAWN buttons work. Original header:
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
  const ctr = id => page.evaluate(id => { const r = $(id).getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }, id);
  ck('hiddenWhenUp', await page.evaluate(() => $('tcd').style.display !== 'flex'));
  await page.evaluate(() => { window.__sent = []; const o = ws.send.bind(ws); ws.send = d => { window.__sent.push(d); return o(d); }; sendJ({ t: 'dmg', n: 110, head: false }); });
  await page.waitForFunction(() => me.down && !me.alive, null, { timeout: 5000 }); await sleep(300);
  ck('shownWhenDown', await page.evaluate(() => $('tcd').style.display === 'flex' && /CALL MEDIC/.test($('dn').textContent)));
  const m = await ctr('tcdm'); await touch('touchStart', [[m[0], m[1], 1]]); await touch('touchEnd', []); await sleep(200);
  ck('callsMedic', await page.evaluate(() => window.__sent.some(d => /"a":"ping".*"k":"medic"/.test(d))));
  const r = await ctr('tcdr'); await touch('touchStart', [[r[0], r[1], 2]]); await sleep(1700); await touch('touchEnd', []);
  await page.waitForFunction(() => !me.down, null, { timeout: 4000 }).catch(() => {}); ck('holdRespawns', await page.evaluate(() => !me.down && window.__sent.some(d => /giveup/.test(d))));
  await sleep(300); ck('hiddenAfter', await page.evaluate(() => $('tcd').style.display !== 'flex'));
  R.errors = errors.slice(0, 3); ck('noErrors', !errors.length);
  console.log(JSON.stringify(R)); const bad = Object.keys(R).filter(k => R[k] === false); console.log(bad.length ? 'FAILED: ' + bad.join(', ') : 'ALL ' + Object.keys(R).filter(k => typeof R[k] === 'boolean').length + ' CHECKS PASSED');
  await browser.close(); process.exit(bad.length ? 1 : 0);
})().catch(e => { console.log('TEST ERROR', e); process.exit(1); });
