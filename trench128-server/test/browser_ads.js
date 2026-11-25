'use strict';
// Smoke test of the real browser client against a running server, with THREE.js stubbed out
// (this sandbox has no internet for the CDN). It exercises menus, networking, prediction, HUD and input.
// usage: NODE_PATH=/opt/node22/lib/node_modules node test/browser.js http://localhost:8099
const { chromium } = require('playwright');
const url = process.argv[2] || 'http://localhost:8099';
const STUB = `
(function(){
  function mk(){ const store={}; const f=function(){return mk()};
    return new Proxy(f,{ get(t,k){ if(k===Symbol.toPrimitive)return ()=>0; if(k in store)return store[k]; if(k==='length')return 0; store[k]=mk(); return store[k]; },
      set(t,k,v){store[k]=v;return true}, apply(){return mk()}, construct(){return mk()} }); }
  window.THREE=new Proxy({},{get(t,k){ if(/Filter$/.test(String(k)))return 1; return function(){return mk()} }});
})();`;
(async () => {
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage({ viewport: { width: 1100, height: 700 } });
  const errors = []; page.on('pageerror', e => errors.push('PAGEERROR ' + e.message)); page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE ' + m.text()); });
  await page.route('**/three.min.js', r => r.fulfill({ contentType: 'text/javascript', body: STUB }));
  await page.goto(url); await page.waitForSelector('#nm');
  await page.fill('#nm', 'BrowserTest'); await page.click('#cn');
  await page.waitForSelector('#go', { timeout: 5000 });
  const menuText = await page.innerText('#ovb');
  const locked = await page.evaluate(() => [...document.querySelectorAll('.card.dis')].map(c => c.innerText.replace(/\n/g, ' ')).slice(0, 3));
  await page.click('[data-t="load"]'); await page.click('#go');
  await page.waitForFunction(() => me.alive === true, null, { timeout: 8000 });
  const spawn = await page.evaluate(() => ({ x: me.x, z: me.z, hp: me.hp, team: me.team, ents: ents.size, sq: me.sq }));
  // fake pointer lock so the input path is live, then walk forward for ~2 s
  await page.evaluate(() => { Object.defineProperty(document, 'pointerLockElement', { get: () => document.getElementById('c'), configurable: true }); });
  const out = {};
  await page.evaluate(() => { Object.defineProperty(document, 'pointerLockElement', { get: () => document.getElementById('c'), configurable: true }); });
  const fov0 = await page.evaluate(() => cam.fov);
  await page.mouse.move(400, 300); await page.mouse.down({ button: 'right' }); await page.waitForTimeout(600);
  out.adsEngages = await page.evaluate(() => adsT > .95); out.fovNarrows = await page.evaluate((f) => cam.fov < f - 8, fov0);
  out.crosshairFades = await page.evaluate(() => (o => o > .3 && o < .6)(parseFloat(document.getElementById('cross').style.opacity)));
  // v0.16: the gun layer covers the screen height and is centred, so ADS frames need no sliding
  out.gunCentred = await page.evaluate(() => { const r = document.getElementById('gun').getBoundingClientRect(); return Math.abs(r.left + r.width / 2 - innerWidth / 2) < 2 && Math.abs(r.top + r.height / 2 - innerHeight / 2) < 2 && r.width >= innerWidth - 2 && r.height >= innerHeight - 2; });   /* v0.29: covers the screen, centred */
  await page.waitForTimeout(250); out.serverAds = await page.evaluate(() => adsNow === true);
  await page.mouse.up({ button: 'right' }); await page.waitForTimeout(600);
  out.adsReleases = await page.evaluate(() => adsT < .02); out.fovRestored = await page.evaluate((f) => Math.abs(cam.fov - f) < .5, fov0);
  // reload cancels ADS
  await page.mouse.down({ button: 'right' }); await page.waitForTimeout(300); await page.evaluate(() => { me.ammo = 1; }); await page.keyboard.press('KeyR'); await page.waitForTimeout(400);
  out.reloadCancelsAds = await page.evaluate(() => adsNow === false || me.rel === false); await page.mouse.up({ button: 'right' });
  // sprites: new atlas has 12 columns of 150 px frames, limbs materials built
  out.spriteMaterials = await page.evaluate(() => !!ART.mat && ART.mat.length === 14 && ART.mat[0].length === 20 && !!ART.gun && ART.gun.length === 9 && ART.gun[0].length === 8);
  out.hudItems = await page.evaluate(() => /GRENADES \d+\s+\[H\] BANDAGES \d+/.test(document.querySelector('#hb .it').textContent));
  out.minimapTopRight = await page.evaluate(() => { const r = document.getElementById('mm').getBoundingClientRect(); return r.top < 100 && r.right > innerWidth - 30 || getComputedStyle(document.getElementById('mm')).top === '58px' });
  out.errors = errors; console.log(JSON.stringify(out, null, 1)); await browser.close();
  const bad = Object.entries(out).filter(([k, v]) => k !== 'errors' && !v).map(e => e[0]);
  if (bad.length || errors.length) { console.log('FAILED', bad, errors); process.exit(1) } console.log('ADS BROWSER OK');
})().catch(e => { console.error('TEST FAILED', e); process.exit(1); });
