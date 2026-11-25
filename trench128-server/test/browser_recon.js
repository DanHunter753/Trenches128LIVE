'use strict';
// Real browser client (THREE stubbed): recon class card + sniper loadout, 14-row soldier atlas, 6x scope zoom table,
// scope sway, hold-breath (steadies, runs out, recovers), spotted-enemy markers, sniper glint. Needs xp.json with reconbrowser: 150.
const { chromium } = require('playwright'); const fs = require('fs');
const url = process.argv[2] || 'http://localhost:8099';
const STUB = fs.readFileSync(__dirname + '/browser.js', 'utf8').match(/const STUB = `([\s\S]*?)`;/)[1];
(async () => {
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 760 } }); const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.route('**/three.min.js', r => r.fulfill({ contentType: 'text/javascript', body: STUB }));
  await page.goto(url); await page.waitForSelector('#nm'); await page.fill('#nm', 'reconbrowser'); await page.click('#cn'); await page.waitForSelector('#go');
  const out = {};
  out.classCard = await page.evaluate(() => !!document.querySelector('.card[data-k="cls"][data-v="recon"]:not(.dis)'));
  await page.click('.card[data-k="cls"][data-v="recon"]'); await page.click('#go');
  await page.waitForFunction(() => me.alive === true, null, { timeout: 8000 }); await page.waitForTimeout(1500);
  out.sniperLoadout = await page.evaluate(() => me.cls === 'recon' && me.w === 'sniper' && ZOOM.sniper === 6 && WIMG.sniper === WIMG.mark);
  out.atlas14Rows = await page.evaluate(() => !!ART.mat && ART.mat.length === 14);
  out.swayWhenScoped = await page.evaluate(() => { swT = 0; for (let i = 0; i < 90; i++) scopeTick(1 / 60, true); return Math.abs(swX) + Math.abs(swY) > .001 && getComputedStyle($('brt')).display === 'block' && /HOLD/.test($('brt').textContent); });
  out.holdBreathSteadies = await page.evaluate(() => { let a = 0, b = 0; for (let i = 0; i < 240; i++) { scopeTick(1 / 60, true); a = Math.max(a, Math.abs(swX - (window._px || 0))); window._px = swX; }
    K[S.binds.sprint] = 1; for (let i = 0; i < 60; i++) scopeTick(1 / 60, true); window._px = swX; for (let i = 0; i < 120; i++) { scopeTick(1 / 60, true); b = Math.max(b, Math.abs(swX - window._px)); window._px = swX; }
    return holding === true && swK < .3 && b < a && /HOLDING BREATH/.test($('brt').textContent); });
  out.breathRunsOut = await page.evaluate(() => { for (let i = 0; i < 60 * 4; i++) scopeTick(1 / 60, true); const o = breathOut && !holding && swK > 1 && /OUT OF BREATH/.test($('brt').textContent); K[S.binds.sprint] = 0; return o; });
  out.breathRecovers = await page.evaluate(() => { for (let i = 0; i < 60 * 6; i++) scopeTick(1 / 60, true); return !breathOut && breath > 2.5; });
  out.unscopedNoSway = await page.evaluate(() => { for (let i = 0; i < 60; i++) scopeTick(1 / 60, false); return swX === 0 && swY === 0 && getComputedStyle($('brt')).display === 'none'; });
  await page.evaluate(() => sendJ({ t: 'tp', x: 0, z: 40 })); await page.waitForFunction(() => [...ents.values()].some(q => q.sp), null, { timeout: 8000 }).catch(() => {});   // the bigger map: walk up to where the soldiers are
  out.spottedMarker = await page.evaluate(() => { for (const q of ents.values()) q.spotted = false; const e = [...ents.values()].find(q => q.sp); if (!e) return false; e.team = 1 - me.team; e.spotted = true; e.down = false; e.gone = false; spotTick(); const ok = sptS.length > 0 && sptS[0].visible === true; e.spotted = false; spotTick(); return ok && !sptS[0].visible; });
  out.sniperGlint = await page.evaluate(() => { const e = [...ents.values()].find(q => q.sp); const C = cam.position, P = e.sp.position; C.x = me.x; C.z = me.z; P.x = C.x; P.z = C.z - 50; P.y = me.y; for (const q of ents.values()) q.aim = false; e.wi = 6; e.aim = true; e.team = 1 - me.team; e.sp.visible = true; e.down = false; e.gone = false; e.yaw = Math.atan2(-(C.x - P.x), -(C.z - P.z)); glintTick(performance.now()); return glints.length > 0 && glints[0].visible === true; });
  out.spotSound = await page.evaluate(() => { onMsg({ t: 'spt', n: 2 }); return true; });
  out.errors = errors; console.log(JSON.stringify(out, null, 1));
  const ok = Object.entries(out).every(([k, v]) => k === 'errors' ? !v.length : v === true);
  console.log(ok ? 'RECON BROWSER OK' : 'RECON BROWSER FAIL'); await browser.close(); process.exit(ok ? 0 : 1);
})().catch(e => { console.log('TEST ERROR', e.message); process.exit(1); });
