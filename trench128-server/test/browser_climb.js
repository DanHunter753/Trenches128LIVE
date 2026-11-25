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
  // put the player on a trench floor facing the front wall (server + client), then hold W + Space
  await page.evaluate(() => { const t = 100, sg = T.sgn(t), ok = x => [-1, 0, 1].every(k => !T.collapsed(t, Math.floor((x + T.W) / 9) + k)) && T.GAPS.every(g => Math.abs(x - g) > 8) && T.CT.every(q => Math.abs(x - q) > 8) && T.ROOMS.every(r => Math.abs(x - r.xc) > 8) && Math.abs(T.trenchSlope(t, x)) < .25 && !T.SB.some(b => Math.abs(b.x - x) < 2.5 && Math.abs(b.z - T.trenchC(t, x) - sg * 3.3) < 1.5); let X = -10; for (let d = 0; d < 80 && !ok(X); d++) X = -10 + (d % 2 ? d : -d); const c = T.trenchC(t, X); me.x = X; me.z = c; me.y = T.hAt(terr.H, X, c); me.vy = 0; me.yaw = sg === -1 ? 0 : Math.PI; sendJ({ t: 'tp', x: X, z: c }); });
  await page.waitForTimeout(500);
  const trace=[]; const iv=setInterval(async()=>{try{trace.push(await page.evaluate(()=>[+me.y.toFixed(2),+me.z.toFixed(2),me.cl?1:0,me.clWait|0,+(window.performance.now()/1000).toFixed(1)].join(',')))}catch(e){}},150);
  await page.keyboard.down('KeyW'); await page.waitForTimeout(400);
  out.hintShown = await page.evaluate(() => getComputedStyle(document.getElementById('hint')).display !== 'none' && /climb/i.test(document.getElementById('hint').textContent));
  await page.keyboard.down('Space');
  await page.waitForFunction(() => !!me.cl, null, { timeout: 3000 }).then(() => out.localClimb = true).catch(() => out.localClimb = false);
  out.handsShown = await page.evaluate(() => getComputedStyle(document.getElementById('ch')).display === 'block');
  await page.waitForTimeout(150);
  out.serverFlag = await page.evaluate(() => !!me.clSeen);
  await page.waitForFunction(() => !me.cl && !me.clWait, null, { timeout: 5000 }).then(() => out.finished = true).catch(() => out.finished = false);
  await page.keyboard.up('Space'); await page.keyboard.up('KeyW');
  await page.waitForFunction(() => !me.cl && !me.clWait, null, { timeout: 6000 }).catch(() => {}); await page.waitForFunction(() => Math.abs(me.y - T.groundAt(terr.H, me.x, me.z, me.y)) < .02, null, { timeout: 4000 }).catch(() => {}); await page.waitForTimeout(300); const y0 = await page.evaluate(() => me.y); await page.waitForTimeout(800);
  const st = await page.evaluate(() => ({ y: me.y, z: me.z, g: T.groundAt(terr.H, me.x, me.z, me.y) }));
  out.noRubberBand = Math.abs(st.y - y0) < .5; out.onGround = Math.abs(st.y - st.g) < .35; out.raised = st.y > -2.0 + 0; out.hidesHands = await page.evaluate(() => getComputedStyle(document.getElementById('ch')).display === 'none');
  clearInterval(iv); console.log(trace.join(' | '));
  out.errors = errors;
  console.log(JSON.stringify(out, null, 1)); await browser.close();
  const bad = Object.entries(out).filter(([k, v]) => k !== 'errors' && !v).map(e => e[0]);
  if (bad.length || errors.length) { console.log('FAILED', bad, errors); process.exit(1) } console.log('CLIMB BROWSER OK');
})().catch(e => { console.error('TEST FAILED', e); process.exit(1); });
