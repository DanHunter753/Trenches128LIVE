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
  const z0 = spawn.z; await page.keyboard.down('KeyW'); await page.waitForTimeout(2000);
  const mid = await page.evaluate(() => ({ x: me.x, z: me.z, pend: pending.length, ping, hud: document.getElementById('hud').innerText }));
  await page.mouse.down(); await page.waitForTimeout(600); await page.mouse.up();
  await page.keyboard.up('KeyW'); await page.keyboard.press('KeyG'); await page.keyboard.press('KeyR'); await page.waitForTimeout(1500);
  const end = await page.evaluate(() => ({ ammo: me.ammo, supply: me.supply, ents: ents.size, kills, hp: me.hp, alive: me.alive }));
  await page.screenshot({ path: '/tmp/client.png' });
  console.log(JSON.stringify({ menuHasXp: /XP/.test(menuText), lockedCards: locked, spawn, movedZ: +(mid.z - z0).toFixed(2), pending: mid.pend, ping: mid.ping, end, hud: mid.hud.split('\n').slice(0, 4), errors }, null, 1));
  await browser.close();
})().catch(e => { console.error('TEST FAILED', e); process.exit(1); });
