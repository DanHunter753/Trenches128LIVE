'use strict';
// Real browser client (THREE stubbed): officer RTS panel (command points, 9 call-ins on hotkeys, targeting ring, one-shot
// targeting), smoke/gas/recon/whistle effects, flank depots (world flags, minimap, side-objective HUD). Needs xp.json with cmdbrowser: 800.
const { chromium } = require('playwright'); const fs = require('fs');
const url = process.argv[2] || 'http://localhost:8099';
const STUB = fs.readFileSync(__dirname + '/browser.js', 'utf8').match(/const STUB = `([\s\S]*?)`;/)[1];
(async () => {
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 760 } }); const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.route('**/three.min.js', r => r.fulfill({ contentType: 'text/javascript', body: STUB }));
  await page.goto(url); await page.waitForSelector('#nm'); await page.fill('#nm', 'cmdbrowser'); await page.click('#cn');
  await page.waitForSelector('#go', { timeout: 5000 });
  await page.click('.card[data-k="cls"][data-v="officer"]');
  await page.click('#go'); await page.waitForFunction(() => me.alive === true && me.officer === true, null, { timeout: 8000 }); await page.waitForTimeout(2500); const out = {};
  out.panel = await page.evaluate(() => /COMMAND POINTS \d+ \/ 250/.test($('off').textContent) && document.querySelectorAll('#off .ab button').length === 14 && /Mill Farm/.test($('off').textContent));
  out.hotkeySelects = await page.evaluate(() => { cpS[0] = 100; supCd = supCd.map(() => 0); renderOff(); return true; }) && await (async () => { await page.keyboard.press('Digit3'); return page.evaluate(() => omode === 'smoke'); })();
  out.ring = await page.evaluate(() => { ofMouse = [640, 380]; ringTick(); return !!ringM && ringM.visible === true && ringM.userData.r === 12; });   // (the stub's scale vectors don't keep values)
  const sent = []; page.on('websocket', () => {}); await page.evaluate(() => { window.__sent = []; const ws = window.sendJ; window.sendJ = o => { window.__sent.push(o); return ws(o); }; });
  out.clickCalls = await page.evaluate(async () => { const r = $('c').getBoundingClientRect(); $('c').dispatchEvent(new MouseEvent('click', { clientX: r.left + 640, clientY: r.top + 380, bubbles: true })); return true; }) &&
    await page.evaluate(() => omode === 'attack');
  out.shiftSquad = await (async () => { await page.keyboard.press('Shift+Digit1'); return page.evaluate(() => selSq === 'all'); })();
  out.orderKeys = await (async () => { await page.keyboard.press('KeyF'); return page.evaluate(() => omode === 'defend'); })();
  out.smokeCloud = await page.evaluate(async () => { const n = debris.length; onMsg({ t: 'smk', l: [[0, 0, 6], [8, 0, 6]], d: 0, s: 5 }); await new Promise(r => setTimeout(r, 120)); return debris.length >= n + 10; });
  out.gasOverlay = await page.evaluate(() => { me.officer = false; gasL.push({ x: me.x, z: me.z, r: 10, until: performance.now() + 5000 }); gasTick(performance.now(), .016); const ok = +$('gasv').style.opacity > .5; gasL.length = 0; gasTick(performance.now(), .016); me.officer = true; return ok && +$('gasv').style.opacity === 0; });
  out.recon = await page.evaluate(() => { onMsg({ t: 'rc', x: 0, z: -60, r: 50, s: 5 }); drawMM(); return reconL.length === 1; });
  out.whistle = await page.evaluate(() => { onMsg({ t: 'wh', n: 'Green Front' }); return /OVER THE TOP/.test($('banner').textContent); });
  out.depotsWorld = await page.evaluate(() => { depotsTick(); return dpW && dpW.length === 4 && dpW.every(w => w.props.length === 6); });
  out.depotState = await page.evaluate(() => { onMsg({ t: 'o', o: obj.map(o => [o.owner, o.p, 0]), w: [0, 0], r: 'play', hv: 1, dp: [[0, 1], [-1, 0], [1, -1], [-1, .4]], fp: [] }); renderOff(); return dpS[0][0] === 0 && /flank depots held 1\/4/.test($('off').textContent); });
  out.sideHud = await page.evaluate(() => { const d = T.DEPOTS[3], sv = [me.x, me.z]; me.officer = false; me.x = d.x; me.z = d.z; depotsTick(); const t = $('dpb').textContent, ok = getComputedStyle($('dpb')).display === 'block' && /SIDE OBJECTIVE · BRICKWORKS/.test(t) && /(CAPTURING|NEUTRAL) · (70|30)%/.test(t); me.x = sv[0]; me.z = sv[1]; me.officer = true; depotsTick(); return ok; });
  out.errors = errors; console.log(JSON.stringify(out, null, 1));
  const ok = Object.entries(out).every(([k, v]) => k === 'errors' ? !v.length : v === true);
  console.log(ok ? 'COMMAND BROWSER OK' : 'COMMAND BROWSER FAIL'); await browser.close(); process.exit(ok ? 0 : 1);
})().catch(e => { console.log('TEST ERROR', e.message); process.exit(1); });
