'use strict';
// Real browser client x3 against a server started with T128_TEST=1 and xp.json {"officerbrowser":800,"leaderbrowser":150}.
// Checks: officer UI + orders + support, squad-leader HUD/minimap, non-leader minimap gating. THREE.js is stubbed (no CDN here).
const { chromium } = require('playwright'); const url = process.argv[2] || 'http://localhost:8099';
const STUB = `(function(){function mk(){const store={};const f=function(){return mk()};return new Proxy(f,{get(t,k){if(k===Symbol.toPrimitive)return()=>0;if(k in store)return store[k];if(k==='length')return 0;store[k]=mk();return store[k]},set(t,k,v){store[k]=v;return true},apply(){return mk()},construct(){return mk()}})}
window.THREE=new Proxy({},{get(t,k){if(/Filter$/.test(String(k)))return 1;return function(){return mk()}}})})();`;
const INIT = `(()=>{const o=WebSocket.prototype.send;WebSocket.prototype.send=function(d){if(typeof d==='string'&&d.indexOf('"hello"')>0){const m=JSON.parse(d);m.team=0;d=JSON.stringify(m)}return o.call(this,d)}})();`;
(async () => {
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] }); const errors = []; const R = {};
  async function open(name, cls) {
    const page = await browser.newPage({ viewport: { width: 1100, height: 700 } });
    page.on('pageerror', e => errors.push(name + ' PAGEERROR ' + e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(name + ' CONSOLE ' + m.text()); });
    await page.addInitScript(INIT); await page.route('**/three.min.js', r => r.fulfill({ contentType: 'text/javascript', body: STUB }));
    await page.goto(url); await page.waitForSelector('#nm'); await page.fill('#nm', name); await page.click('#cn'); await page.waitForSelector('#go');
    if (cls) await page.click(`.card[data-k="cls"][data-v="${cls}"]`);
    await page.click('#go'); await page.waitForFunction(() => me.alive === true, null, { timeout: 8000 }); return page;
  }
  const L = await open('LeaderBrowser'); const G = await open('GruntBrowser'); const O = await open('OfficerBrowser', 'officer');
  await O.waitForFunction(() => sqs.length >= 3, null, { timeout: 5000 });
  R.officer = await O.evaluate(() => ({ off: me.officer, panel: document.getElementById('off').style.display, mm: document.getElementById('mm').style.display, squads: sqs.map(r => r[1] + (r[4] ? '(AI)' : ':' + r[3])), ents: ents.size, lock: document.pointerLockElement === null }));
  R.leader = await L.evaluate(() => ({ lead: me.lead, mm: document.getElementById('mm').style.display }));
  R.grunt = await G.evaluate(() => ({ lead: me.lead, mm: document.getElementById('mm').style.display }));
  // officer: select the human squad that LeaderBrowser leads, attack order, click the battlefield
  const humanKey = await L.evaluate(() => me.sq);
  await O.click(`#off button[data-sq="${humanKey}"]`); await O.click('#off button[data-m="attack"]'); await O.mouse.click(550, 300);
  await L.waitForFunction(() => myOrder && myOrder.ty === 'attack', null, { timeout: 4000 });
  await G.waitForFunction(() => myOrder && myOrder.ty === 'attack', null, { timeout: 4000 });
  await L.waitForFunction(() => /ORDER: ATTACK/.test(document.getElementById('hud').innerText), null, { timeout: 4000 }).catch(() => {});
  R.order = await L.evaluate(() => ({ order: myOrder, hudHasOrder: /ORDER: ATTACK/.test(document.getElementById('hud').innerText), beams: beams.size }));
  R.officerOrders = await O.evaluate(() => ({ list: offOrders.length, beams: beams.size }));
  // support: drop
  await O.click('#off button[data-m="drop"]'); await O.mouse.click(400, 300);
  await O.waitForFunction(() => crateM.size === 1, null, { timeout: 4000 }); R.crateOnOfficer = true;
  await L.waitForFunction(() => crateM.size >= 0); await L.waitForTimeout(500); R.crateOnLeader = await L.evaluate(() => crateM.size);
  R.errors = errors; console.log(JSON.stringify(R, null, 1)); await browser.close();
  const ok = R.officer.off && R.officer.panel === 'flex' && R.officer.mm === 'block' && R.leader.lead && R.leader.mm === 'block' && !R.grunt.lead && R.grunt.mm === 'block' && R.order.hudHasOrder && R.order.beams === 1 && R.officerOrders.list >= 1 && R.crateOnLeader === 1 && !errors.length;
  console.log(ok ? 'BROWSER OFFICER TEST PASSED' : 'BROWSER OFFICER TEST FAILED'); process.exit(ok ? 0 : 1);
})().catch(e => { console.error('TEST ERROR', e); process.exit(1); });
