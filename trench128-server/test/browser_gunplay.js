'use strict';
// Real browser client (THREE stubbed): recoil + recovery, hit markers, damage-direction arcs, suppression, mud on the lens,
// travelling tracers with drop, sprint / charge / bayonet frames, scope glint, new key binds and the grit setting.
const { chromium } = require('playwright'); const fs = require('fs');
const url = process.argv[2] || 'http://localhost:8099';
const STUB = fs.readFileSync(__dirname + '/browser.js', 'utf8').match(/const STUB = `([\s\S]*?)`;/)[1];
(async () => {
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1100, height: 700 } }); const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.route('**/three.min.js', r => r.fulfill({ contentType: 'text/javascript', body: STUB }));
  await page.goto(url); await page.waitForSelector('#nm'); await page.fill('#nm', 'GunBrowser'); await page.click('#cn');
  await page.waitForSelector('#go', { timeout: 5000 }); await page.click('#go'); await page.waitForFunction(() => me.alive === true, null, { timeout: 8000 });
  await page.waitForTimeout(1200); const out = {};
  out.binds = await page.evaluate(() => S.binds.melee === 'KeyV' && S.binds.postToggle === 'KeyP' && S.grit === .5);
  out.recoil = await page.evaluate(async () => { me.pitch = 0; recPend = 0; recoil(); const p1 = me.pitch; await new Promise(r => setTimeout(r, 900)); return p1 > .03 && me.pitch < p1 * .6 && me.pitch > p1 * .25; });
  out.hitMarker = await page.evaluate(() => { onMsg({ t: 'hm', h: 1, k: 1, m: 0 }); const h = $('hm'); return h.className.includes('k') && h.className.includes('h') && +h.style.opacity >= 0 && hmV > .5; });
  out.damageArc = await page.evaluate(async () => { const x = me.x - Math.cos(me.yaw) * -10, z = me.z + Math.sin(me.yaw) * -10;   // 10 m to the right
    onMsg({ t: 'dd', x: me.x + Math.cos(me.yaw) * 10, z: me.z - Math.sin(me.yaw) * 10 }); await new Promise(r => setTimeout(r, 100));
    const g = $('fx').getContext('2d'), R = g.getImageData(224, 118, 6, 4).data, L = g.getImageData(130, 118, 6, 4).data; let r = 0, l = 0; for (let i = 0; i < R.length; i += 4) { r += R[i + 3]; l += L[i + 3]; } return ddL.length === 1 && r > 0 && l === 0; });
  out.suppression = await page.evaluate(async () => { onMsg({ t: 'sup', v: .8, x: me.x, z: me.z - 30 }); await new Promise(r => setTimeout(r, 60)); return supV > .6 && +$('supv').style.opacity > .5; });
  out.suppressionFades = await page.evaluate(async () => { const v = supV; await new Promise(r => setTimeout(r, 700)); return supV < v - .1; });
  out.mudOnLens = await page.evaluate(() => { mudA = 0; boomFx(me.x + 3, me.z); const d = $('mud').getContext('2d').getImageData(0, 0, 180, 120).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i]) n++; return mudA > .5 && n > 50; });
  out.tracerFlies = await page.evaluate(async () => { tracer(me.x, me.y + 60, me.z, 0, 0, -1, 200, false, 200); const o = trc[(trI - 1) % trc.length];
    await new Promise(r => setTimeout(r, 250)); const d1 = o.d, vy = o.vy; return d1 > 25 && d1 < 120 && vy < -1 && o.t > 0; });
  out.gunFrames = await page.evaluate(() => { const r = {}; gRel = -1; me.rel = false; adsT = 0; meleeT = 9; me.charging = false;
    sprB = 1; r.sprint = gunFrame() === 26; sprB = 0; me.charging = true; r.charge = gunFrame() === 27; me.charging = false;
    meleeT = .15; r.thrust = gunFrame() === 29; meleeT = 9; r.idle = gunFrame() === 0; return Object.values(r).every(Boolean); });
  out.chargeBar = await page.evaluate(async () => { me.w = 'bolt'; me.chg = 1.5; await new Promise(r => setTimeout(r, 80)); const ok = getComputedStyle($('chg')).display === 'block' && parseFloat($('chg').firstChild.style.width) < 60; me.chg = T.CHG_MAX; return ok; });
  out.scopeGlint = await page.evaluate(() => { const e = [...ents.values()].find(q => q.sp); if (!e) return false; const C = cam.position, P = e.sp.position;
    C.x = me.x; C.z = me.z; P.x = C.x; P.z = C.z - 40; P.y = me.y;   // (the THREE stub's vectors only keep plain fields)
    e.wi = 5; e.aim = true; e.down = false; e.gone = false; e.team = 1 - me.team; e.sp.visible = true; e.yaw = Math.atan2(-(C.x - P.x), -(C.z - P.z));
    for (const q of ents.values()) if (q !== e) q.aim = false;   /* (a real enemy marksman aiming this way would glint too) */
    glintTick(performance.now()); const ok = glints.length > 0 && glints[0].visible; e.yaw += Math.PI; glintTick(performance.now()); return ok && !glints[0].visible; });
  out.gunSheet32 = await page.evaluate(() => WIMG.bolt.naturalHeight === 240 * 6);
  out.errors = errors; console.log(JSON.stringify(out, null, 1));
  const ok = Object.entries(out).every(([k, v]) => k === 'errors' ? !v.length : v === true);
  console.log(ok ? 'GUNPLAY BROWSER OK' : 'GUNPLAY BROWSER FAIL'); await browser.close(); process.exit(ok ? 0 : 1);
})().catch(e => { console.log('TEST ERROR', e.message); process.exit(1); });
