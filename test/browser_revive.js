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
  await page.evaluate(() => { const t = 76, c = T.trenchC(t, -10); sendJ({ t: 'tp', x: -10, z: c }); }); await page.waitForTimeout(400);
  await page.evaluate(() => sendJ({ t: 'dmg', n: 9999 + 0, head: false })); // overkill => dies, not downed
  await page.waitForFunction(() => !me.alive, null, { timeout: 3000 }); out.overkillIsDeath = await page.evaluate(() => !me.down);
  await page.evaluate(() => { const iv = setInterval(() => { if (me.alive) clearInterval(iv); else spDeploy(); }, 200); }); await page.waitForFunction(() => me.alive, null, { timeout: 9000 });
  await page.evaluate(() => sendJ({ t: 'dmg', n: me.hp + 10, head: false }));
  await page.waitForFunction(() => me.down === true, null, { timeout: 3000 }).then(() => out.downed = true).catch(() => out.downed = false);
  await page.waitForTimeout(250);
  out.overlayShown = await page.evaluate(() => getComputedStyle(document.getElementById('dn')).display === 'block' && /DOWN/.test(document.getElementById('dn').textContent));
  out.overlayText = await page.evaluate(() => document.getElementById('dn').innerText.replace(/\n/g, ' | '));
  out.notAlive = await page.evaluate(() => !me.alive);
  await page.keyboard.down('KeyE'); await page.waitForTimeout(600);
  out.stillDownBeforeHold = await page.evaluate(() => me.down === true);
  await page.waitForTimeout(1100); await page.keyboard.up('KeyE');
  await page.evaluate(() => { const iv = setInterval(() => { if (me.alive) clearInterval(iv); else spDeploy(); }, 200); }); 
  await page.waitForFunction(() => me.alive && !me.down, null, { timeout: 8000 }).then(() => out.respawnedByHoldE = true).catch(() => out.respawnedByHoldE = false);
  out.overlayGone = await page.evaluate(() => getComputedStyle(document.getElementById('dn')).display === 'none');
  // medic-side client logic: fake a downed teammate next to us, spy on the revive act
  await page.evaluate(() => { window.__acts = []; const o = WebSocket.prototype.send; WebSocket.prototype.send = function (d) { try { const m = JSON.parse(d); if (m.t === 'act') window.__acts.push(m.a) } catch (e) {} return o.call(this, d) }; me.cls = 'medic';
    const mkv = () => ({ position: { x: 0, y: 0, z: 0, set() {} }, scale: { y: 1, set() {} }, material: {} });
    ents.set(99999, { down: true, team: me.team, cls: 0, a: { t: 0, x: me.x + 1, y: me.y, z: me.z }, b: { t: 1, x: me.x + 1, y: me.y, z: me.z }, sp: mkv(), seen: performance.now() + 1e9 }); });
  await page.waitForTimeout(300);
  out.medicHint = await page.evaluate(() => /revive/i.test(document.getElementById('hint').textContent));
  await page.keyboard.down('KeyE'); await page.waitForTimeout(700); await page.keyboard.up('KeyE');
  out.medicSendsRevive = await page.evaluate(() => window.__acts.filter(a => a === 'revive').length >= 2);
  await page.evaluate(() => { ents.delete(99999); me.cls = 'rifleman' });
  out.errors = errors; console.log(JSON.stringify(out, null, 1)); await browser.close();
  const bad = Object.entries(out).filter(([k, v]) => k !== 'errors' && k !== 'overlayText' && !v).map(e => e[0]);
  if (bad.length || errors.length) { console.log('FAILED', bad, errors); process.exit(1) } console.log('REVIVE BROWSER OK');
})().catch(e => { console.error('TEST FAILED', e); process.exit(1); });
