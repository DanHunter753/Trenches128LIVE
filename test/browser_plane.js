'use strict';
// Real browser, v0.33 flyable biplane: walk up to the parked plane, [F] climbs in; W throttles up and the client predicts
// the take-off with the server agreeing; the pilot HUD shows; [C] outside view; holding RMB gives the bombsight (camera
// straight down, a release cross); the spawn map offers the airfield.
const { chromium } = require('playwright'); const fs = require('fs');
const url = process.argv[2] || 'http://localhost:8099';
const STUB = fs.readFileSync(__dirname + '/browser.js', 'utf8').match(/const STUB = `([\s\S]*?)`;/)[1];
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } }); const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.route('**/three.min.js', r => r.fulfill({ contentType: 'text/javascript', body: STUB }));
  const R = {}, ck = (k, v) => { R[k] = !!v; };
  await page.goto(url); await page.fill('#nm', 'Aviator'); await page.click('#cn'); await page.waitForSelector('#go'); await page.click('#go');
  await page.waitForFunction(() => me.alive === true, null, { timeout: 15000 }); await page.evaluate(() => { S.tut = false; });
  ck('airfieldOnSpawnList', await page.evaluate(() => spawnList().some(q => q.id === -99)));
  ck('planeParked', await page.evaluate(() => [...VH.values()].some(v => v.k === 3 && v.team === me.team)));
  await page.evaluate(() => { const v = [...VH.values()].find(v => v.k === 3 && v.team === me.team); sendJ({ t: 'tp', x: v.b.x + 3, z: v.b.z }); }); await sleep(800);
  ck('hint', /biplane/.test(await page.evaluate(() => vehNearHint() || '')));
  await page.evaluate(() => sendJ({ t: 'act', a: 'mg' })); await page.waitForFunction(() => myVeh && myVeh.k === 'plane', null, { timeout: 4000 }); await sleep(600);
  ck('pilotHud', await page.evaluate(() => $('phud').style.display === 'block' && !!myPl));
  // full throttle down the strip, then pull up
  await page.evaluate(() => { K[S.binds.fwd] = 1; me.yaw = T.AIRF[me.team].yaw; me.pitch = 0; }); await sleep(5600);
  await page.evaluate(() => { me.pitch = .35; }); await page.waitForFunction(() => myPl && myPl.air, null, { timeout: 8000 }).catch(() => {}); await sleep(1500);
  const st = await page.evaluate(() => { const v = vMine(); return { air: myPl.air, y: myPl.y, sy: v.b.y, dx: Math.hypot(myPl.x - v.b.x, myPl.z - v.b.z) }; });
  R.st = st; ck('takesOff', st.air && st.y > 5); ck('serverAgrees', st.dx < 8);
  await page.evaluate(() => { const e = new KeyboardEvent('keydown', { code: S.binds.crouch }); dispatchEvent(e); }); await sleep(300); ck('outsideView', await page.evaluate(() => vView === 1 && plCam === 'out'));
  await page.evaluate(() => { adsHeld = true; }); await sleep(400);
  ck('bombsight', await page.evaluate(() => plCam === 'bomb' && /BOMBSIGHT/.test(vehHud().extra)));
  await page.screenshot({ path: '/tmp/pilot_bombsight.png' }); await page.evaluate(() => { adsHeld = false; }); await sleep(300); await page.screenshot({ path: '/tmp/pilot_hud.png' });
  R.errors = errors.slice(0, 3); ck('noErrors', !errors.length);
  console.log(JSON.stringify(R)); const bad = Object.keys(R).filter(k => R[k] === false); console.log(bad.length ? 'FAILED: ' + bad.join(', ') : 'ALL ' + Object.keys(R).filter(k => typeof R[k] === 'boolean').length + ' CHECKS PASSED');
  await browser.close(); process.exit(bad.length ? 1 : 0);
})().catch(e => { console.log('TEST ERROR', e); process.exit(1); });
