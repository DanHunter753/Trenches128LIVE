'use strict';
// v0.50 real browser client: the round goes where the sights were when the trigger broke. The recoil kick used to lift the
// aim before the firing input was sent, so the server fired along the kicked line (a sniper hit about a metre high at 20 m).
const { chromium } = require('playwright'); const fs = require('fs');
const url = process.argv[2] || 'http://localhost:8099';
const STUB = fs.readFileSync(__dirname + '/browser.js', 'utf8').match(/const STUB = `([\s\S]*?)`;/)[1];
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] }); const R = {}, ck = (k, v) => { R[k] = !!v; }, errors = [];
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } }); page.on('pageerror', e => errors.push(e.message)); await page.route('**/three.min.js', r => r.fulfill({ contentType: 'text/javascript', body: STUB }));
  await page.goto(url); await page.fill('#nm', 'Aimer'); await page.click('#cn'); await page.waitForSelector('#go'); await page.click('#go'); await page.waitForFunction(() => me.alive === true, null, { timeout: 20000 });
  await page.evaluate(() => { S.tut = false; window.INS = []; const o = WebSocket.prototype.send; WebSocket.prototype.send = function (d) { if (typeof d === 'string' && d.startsWith('{"t":"in"')) INS.push(...JSON.parse(d).c); return o.call(this, d); }; sendJ({ t: 'tp', x: 0, z: me.team ? -150 : 150 }); }); await sleep(900);
  for (let i = 0; i < 3; i++) {
    const r = await page.evaluate(() => new Promise(res => { const p0 = .05 + Math.random() * .1, y0 = me.yaw; me.pitch = p0; swX = swY = 0; INS.length = 0; fireLatch = true;
      setTimeout(() => { const c = INS.find(q => q[4] & 8); res({ p0, y0, sent: c && [c[5], c[6]], after: me.pitch }); }, 250); }));
    ck('shot' + i + 'SentWithAimNotKick', r.sent && Math.abs(r.sent[1] - r.p0) < .0006 && Math.abs(r.sent[0] - r.y0) < .0006);
    ck('shot' + i + 'ViewStillKicks', r.after > r.p0 + .01);
    R['shot' + i] = r; await sleep(1300);
  }
  R.errors = errors; ck('noErrors', !errors.length); console.log(JSON.stringify(R));
  const bad = Object.keys(R).filter(k => R[k] === false); console.log(bad.length ? 'FAILED: ' + bad.join(', ') : 'ALL ' + Object.keys(R).filter(k => typeof R[k] === 'boolean').length + ' CHECKS PASSED');
  await browser.close(); process.exit(bad.length ? 1 : 0);
})().catch(e => { console.log('TEST ERROR', e); process.exit(1); });
