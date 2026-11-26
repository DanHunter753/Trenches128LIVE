'use strict';
// Real browser, v0.31 beginner tutorial: a first deploy shows the coach card; each step is ticked off by doing it (walk,
// sprint, fire, reload, climb) and the read-only steps move on by themselves; "Skip tutorial" hides it for good (saved in
// the settings), the Settings > Controls box brings it back, and officers never see it.
const { chromium } = require('playwright'); const fs = require('fs');
const url = process.argv[2] || 'http://localhost:8099';
const STUB = fs.readFileSync(__dirname + '/browser.js', 'utf8').match(/const STUB = `([\s\S]*?)`;/)[1];
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage(); const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.route('**/three.min.js', r => r.fulfill({ contentType: 'text/javascript', body: STUB }));
  const R = {}, ck = (k, v) => { R[k] = !!v; };
  await page.goto(url); ck('onByDefault', await page.evaluate(() => S.tut === true));
  await page.fill('#nm', 'Recruit'); await page.click('#cn'); await page.waitForSelector('#go'); await page.click('#go');
  await page.waitForFunction(() => me.alive === true, null, { timeout: 8000 }); await sleep(500);
  const step = () => page.evaluate(() => TUT.i), text = () => page.evaluate(() => $('tut').style.display === 'block' ? $('tutt').textContent : '');
  ck('cardShown', /1\/8 Move/.test(await text()));
  await page.evaluate(() => { me.x += 7; }); await sleep(300); ck('walkTicks', await step() === 1 && /Sprint/.test(await text()));
  await page.evaluate(() => { TUT.sp = 2; }); await sleep(300); ck('sprintTicks', await step() === 2 && /Aim and fire/.test(await text()));
  await page.evaluate(() => { TUT.shot = 1; }); await sleep(300); ck('fireTicks', await step() === 3);
  await page.evaluate(() => { K[S.binds.reload] = true; }); await sleep(300); await page.evaluate(() => { K[S.binds.reload] = false; });
  ck('reloadTicks', await step() === 4 && /trench wall/.test(await text()));
  await page.evaluate(() => { TUT.t = 41; }); await sleep(300); ck('climbTimesOut', await step() === 5 && /checkpoints/.test(await text()));
  await page.evaluate(() => { TUT.t = 11; }); await sleep(300); ck('readStepAdvances', await step() === 6 && /revive/.test(await text()));
  await page.evaluate(() => { TUT.i = 6; }); await page.keyboard.press('End'); await sleep(200); ck('endKeySkips', await page.evaluate(() => S.tut === false)); await page.evaluate(() => { S.tut = true; TUT.i = 6; }); await sleep(300);
  await page.evaluate(() => document.exitPointerLock()); await sleep(200); await page.click('#tutx'); await sleep(200);   // (the button is for touch and an unlocked mouse; End works while aiming)
  ck('skipHides', await page.evaluate(() => $('tut').style.display === 'none' && S.tut === false && JSON.parse(localStorage.getItem('t128set')).tut === false));
  await page.reload(); await page.fill('#nm', 'Recruit'); await page.click('#cn'); await page.waitForSelector('#go'); await page.click('#go');
  await page.waitForFunction(() => me.alive === true, null, { timeout: 8000 }); await sleep(500); ck('staysOff', await text() === '');
  await page.evaluate(() => { S.tut = true; TUT.i = -1; }); await sleep(300); ck('replayFromSettings', /1\/8 Move/.test(await text()));
  ck('notForOfficers', await page.evaluate(() => { const o = me.officer; me.officer = true; tutTick(.016); const d = $('tut').style.display; me.officer = o; return d === 'none'; }));   // (the server keeps resetting me.officer, so check one tick directly)
  R.errors = errors.slice(0, 3); ck('noErrors', !errors.length);
  console.log(JSON.stringify(R)); const bad = Object.keys(R).filter(k => R[k] === false); console.log(bad.length ? 'FAILED: ' + bad.join(', ') : 'ALL ' + Object.keys(R).filter(k => typeof R[k] === 'boolean').length + ' CHECKS PASSED');
  await browser.close(); process.exit(bad.length ? 1 : 0);
})().catch(e => { console.log('TEST ERROR', e); process.exit(1); });
