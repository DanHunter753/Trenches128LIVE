'use strict';
// Real browser, v0.33.3 order beacons for soldiers: when your squad gets an officer's order, a beacon stands at the spot and
// an on-screen marker names the order and its distance (pinned to the screen edge when it's behind you); it goes once
// you're there or the order is done.
const { chromium } = require('playwright'); const fs = require('fs');
const url = process.argv[2] || 'http://localhost:8099';
const STUB = fs.readFileSync(__dirname + '/browser.js', 'utf8').match(/const STUB = `([\s\S]*?)`;/)[1];
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] }); const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = []; page.on('pageerror', e => errors.push(e.message)); await page.route('**/three.min.js', r => r.fulfill({ contentType: 'text/javascript', body: STUB }));
  const R = {}, ck = (k, v) => { R[k] = !!v; };
  await page.goto(url); await page.fill('#nm', 'Private'); await page.click('#cn'); await page.waitForSelector('#go'); await page.click('#go');
  await page.waitForFunction(() => me.alive === true, null, { timeout: 15000 }); await page.evaluate(() => { S.tut = false; });
  ck('noMarkerWithoutOrder', await page.evaluate(() => $('wp').style.display === 'none'));
  await page.evaluate(() => onMsg({ t: 'ord', o: { ty: 'attack', n: 'Green Front', x: me.x + 40, z: me.z - 60, done: false } })); await sleep(300);
  ck('beacon', await page.evaluate(() => beams.has(me.sq) && !!beams.get(me.sq).userData.ring));
  ck('marker', await page.evaluate(() => $('wp').style.display === 'block' && /ATTACK · 72 m/.test($('wp').textContent)));
  await page.evaluate(() => sendJ({ t: 'tp', x: myOrder.x + 2, z: myOrder.z })); await sleep(900); ck('hiddenWhenThere', await page.evaluate(() => $('wp').style.display === 'none'));
  await page.evaluate(() => onMsg({ t: 'ord', o: Object.assign({}, myOrder, { done: true }) })); await sleep(200); ck('beaconGoesWhenDone', await page.evaluate(() => !beams.has(me.sq)));
  ck('noErrors', !errors.length);
  console.log(JSON.stringify(R)); const bad = Object.keys(R).filter(k => R[k] === false); console.log(bad.length ? 'FAILED: ' + bad.join(', ') : 'ALL ' + Object.keys(R).filter(k => typeof R[k] === 'boolean').length + ' CHECKS PASSED');
  await browser.close(); process.exit(bad.length ? 1 : 0);
})().catch(e => { console.log('TEST ERROR', e); process.exit(1); });
