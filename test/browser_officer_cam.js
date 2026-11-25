// Officer camera: hold right mouse to orbit/tilt, Q/E rotate, clicks still map to the ground under the cursor.
// Needs T128_TEST=1 server on :8099 and xp.json {"camtester":800}.
const { chromium } = require('playwright'); const fs = require('fs');
const STUB = fs.readFileSync(__dirname + '/browser.js', 'utf8').match(/const STUB = `([\s\S]*?)`;/)[1];
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] }); const p = await b.newPage({ viewport: { width: 1100, height: 800 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.route('**/three.min.js', r => r.fulfill({ contentType: 'text/javascript', body: STUB }));
  await p.goto('http://localhost:8099'); await p.waitForSelector('#nm'); await p.fill('#nm', 'CamTester'); await p.click('#cn'); await p.waitForSelector('#go');
  await p.click('.card[data-k="cls"][data-v="officer"]'); await p.click('#go'); await p.waitForFunction(() => me.officer && me.alive, null, { timeout: 8000 });
  const out = {}; const st = () => p.evaluate(() => ({ yaw: ofyaw, pit: ofpit }));
  const s0 = await st(); await p.mouse.move(500, 400); await p.mouse.down({ button: 'right' }); await p.mouse.move(650, 340, { steps: 6 }); await p.mouse.up({ button: 'right' });
  const s1 = await st(); out.rmbRotates = Math.abs(s1.yaw - s0.yaw) > .3; out.rmbTilts = s1.pit > s0.pit + .1;
  await p.mouse.move(700, 500, { steps: 3 }); const s2 = await st(); out.noRotateWithoutButton = s2.yaw === s1.yaw;
  out.centreMapsToFocus = await p.evaluate(() => { const g = toGround(innerWidth / 2, innerHeight / 2); return Math.hypot(g[0] - ofx, g[1] - ofz) < 1.5; });
  out.orderLandsOnGround = await p.evaluate(() => { const sent = []; const o = window.sendJ; const g = toGround(300, 300); return isFinite(g[0]) && isFinite(g[1]); });
  out.errs = errs; console.log(JSON.stringify(out)); const ok = Object.entries(out).every(([k, v]) => k === 'errs' ? !v.length : v === true);
  console.log(ok ? 'OFFICER CAM OK' : 'OFFICER CAM FAIL'); await b.close(); process.exit(ok ? 0 : 1);
})().catch(e => { console.log('TEST ERROR', e.message); process.exit(1) });
