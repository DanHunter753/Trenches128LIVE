'use strict';
// Real browser client (THREE stubbed), v0.26: vehicles and gun pits arrive and are drawn, weather (night) applied, field gun
// seat (overlay, aim marker, firing a shell, leaving), tank seat (inside / outside view, driving), elite kit pickup (gun sheet),
// burning ground and flares, officer call-ins. Run against T128_TEST=1 T128_WX=night node server.js --port 8099.
const { chromium } = require('playwright'); const fs = require('fs');
const url = process.argv[2] || 'http://localhost:8099';
const STUB = fs.readFileSync(__dirname + '/browser.js', 'utf8').match(/const STUB = `([\s\S]*?)`;/)[1];
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 760 } }); const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.route('**/three.min.js', r => r.fulfill({ contentType: 'text/javascript', body: STUB }));
  await page.goto(url); await page.waitForSelector('#nm'); const out = {};
  await page.fill('#nm', 'V26Tester'); await page.click('#cn'); await page.waitForSelector('#go'); await page.click('#go');
  await page.waitForFunction(() => me.alive === true, null, { timeout: 8000 }); await sleep(1200);
  await page.evaluate(() => { Object.defineProperty(document, 'pointerLockElement', { get: () => document.getElementById('c'), configurable: true }); window.__m = []; const o = onMsg; window.onMsg = m => { __m.push(m.t); return o(m); }; });
  out.night = await page.evaluate(() => wxK === 'night' && T.WX.k === 'night' && hemi.intensity < .3);
  out.vehicles = await page.evaluate(() => [...VH.values()].filter(v => v.k === 1).length === 4 && [...VH.values()].filter(v => v.k === 2).length === 4);
  out.hudWeather = await page.evaluate(() => new Promise(r => { hudT = 0; setTimeout(() => r(/WEATHER: Night/.test($('hud').textContent)), 300); }));
  // field gun
  await page.evaluate(() => { const v = [...VH.values()].find(q => q.k === 1 && q.team === me.team), s = v.b, hf = [-Math.sin(s.yaw), -Math.cos(s.yaw)]; sendJ({ t: 'tp', x: s.x - hf[0] * 1.8, z: s.z - hf[1] * 1.8 }); });
  await sleep(700);
  out.gunHint = await page.evaluate(() => new Promise(r => { hudT = 0; setTimeout(() => r(/man the field gun/.test($('hint').textContent)), 300); }));
  await page.evaluate(() => sendJ({ t: 'act', a: 'mg' })); await page.waitForFunction(() => myVeh && myVeh.k === 'fgun', null, { timeout: 4000 }).catch(() => {}); await sleep(300);
  out.onGun = await page.evaluate(() => !!myVeh && myVeh.k === 'fgun' && $('vv').style.display === 'block' && $('gun').style.display === 'none');
  out.aimRing = await page.evaluate(() => !!aimRing && aimRing.visible === true);
  await page.mouse.move(400, 300); await page.mouse.down(); await sleep(300); await page.mouse.up(); await sleep(600);
  out.shellFired = await page.evaluate(() => __m.includes('shl'));
  out.gunHud = await page.evaluate(() => new Promise(r => { hudT = 0; setTimeout(() => r(/FIELD GUN/.test($('hud').textContent) && /ARMOUR/.test($('hb').textContent)), 300); }));
  await sleep(1300); await page.evaluate(() => sendJ({ t: 'act', a: 'mg' })); await sleep(600);
  out.leftGun = await page.evaluate(() => !myVeh && $('vv').style.display === 'none' && $('gun').style.display === '');
  // tank
  await page.evaluate(() => sendJ({ t: 'tk' })); await page.waitForFunction(() => [...VH.values()].some(v => v.k === 0 && v.team === me.team && !v.dead), null, { timeout: 5000 }).catch(() => {});
  await page.evaluate(() => { const v = [...VH.values()].find(q => q.k === 0 && q.team === me.team && !q.dead); sendJ({ t: 'tp', x: v.b.x + 3.6, z: v.b.z }); }); await sleep(1500);
  await page.evaluate(() => sendJ({ t: 'act', a: 'mg' })); await page.waitForFunction(() => myVeh && myVeh.k === 'tank', null, { timeout: 4000 }).catch(() => {}); await sleep(300);
  out.inTank = await page.evaluate(() => !!myVeh && myVeh.k === 'tank' && $('vv').style.display === 'block');
  const p0 = await page.evaluate(() => { const v = VH.get(myVeh && myVeh.id); return v ? [v.b.x, v.b.z] : [0, 0]; });
  await page.keyboard.press('KeyC'); await sleep(200); out.outsideView = await page.evaluate(() => vView === 1 && $('vv').style.display === 'none');
  await page.keyboard.down('KeyW'); await sleep(2500); await page.keyboard.up('KeyW'); await sleep(300);
  out.tankMoves = await page.evaluate(p => { const v = VH.get(myVeh && myVeh.id); return !!v && Math.hypot(v.b.x - p[0], v.b.z - p[1]) > 1; }, p0);
  out.tankHud = await page.evaluate(() => new Promise(r => { hudT = 0; setTimeout(() => r(/TANK · driver/.test($('hud').textContent)), 300); }));
  await sleep(1300); await page.evaluate(() => sendJ({ t: 'act', a: 'mg' })); await sleep(600); out.leftTank = await page.evaluate(() => !myVeh);
  // elite kit
  await page.waitForFunction(() => [...ekM.values()].some(c => c.team === me.team), null, { timeout: 6000 }).catch(() => {});
  await page.evaluate(() => { const c = [...ekM.values()].find(q => q.team === me.team); if (c) sendJ({ t: 'tp', x: c.x, z: c.z }); }); await sleep(700);
  out.kitHint = await page.evaluate(() => new Promise(r => { hudT = 0; setTimeout(() => r(/take the .* kit/.test($('hint').textContent)), 300); }));
  await sleep(900); await page.evaluate(() => sendJ({ t: 'act', a: 'mg' })); await page.waitForFunction(() => !!me.elite, null, { timeout: 4000 }).catch(() => {});
  out.elite = await page.evaluate(() => !!me.elite && me.w === T.ELITE[me.elite].w && !!WIMG[me.w] && !!ICON[me.w]);
  // effects and officer panel
  out.fire = await page.evaluate(() => new Promise(r => { onMsg({ t: 'fi', x: me.x + 5, z: me.z, r: 2, s: 3 }); setTimeout(() => r(fireL.length >= 1 && flameP.length > 0), 400); }));
  out.flare = await page.evaluate(() => { onMsg({ t: 'flr', x: me.x, z: me.z, s: 5, tm: me.team }); return flareL.length >= 1; });
  out.callIns = await page.evaluate(() => !!ABL.tank && !!ABL.star);
  out.errors = errors; console.log(JSON.stringify(out, null, 1));
  const ok = Object.entries(out).every(([k, v]) => k === 'errors' ? !v.length : v === true);
  console.log(ok ? 'V26 BROWSER OK' : 'V26 BROWSER FAIL'); await browser.close(); process.exit(ok ? 0 : 1);
})().catch(e => { console.log('TEST ERROR', e.message); process.exit(1); });
