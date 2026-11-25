'use strict';
// Real browser client (THREE stubbed): Operations HUD (role, sector, tickets bar), announcer banner, fall-back countdown.
const { chromium } = require('playwright'); const fs = require('fs');
const url = process.argv[2] || 'http://localhost:8099';
const STUB = fs.readFileSync(__dirname + '/browser.js', 'utf8').match(/const STUB = `([\s\S]*?)`;/)[1];
(async () => {
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1100, height: 700 } }); const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.route('**/three.min.js', r => r.fulfill({ contentType: 'text/javascript', body: STUB }));
  await page.goto(url); await page.waitForSelector('#nm'); await page.fill('#nm', 'OpsBrowser'); await page.click('#cn');
  await page.waitForSelector('#go', { timeout: 5000 }); await page.click('#go'); await page.waitForFunction(() => me.alive === true, null, { timeout: 8000 });
  await page.waitForTimeout(1500); const out = {};
  out.hud = await page.evaluate(() => /(ATTACK|DEFEND) · SECTOR 1\/3/.test($('stat').textContent) && /BATTALION 1\/3/.test($('stat').textContent));
  out.ticketBar = await page.evaluate(() => getComputedStyle($('opbar')).display === 'block' && parseFloat($('opbar').firstChild.style.width) > 90);
  out.tabLine = await page.evaluate(() => { onKeyTab = true; return /OPERATION: you (attack|defend)/.test($('hud').textContent) || /OPERATION/.test(document.body.innerHTML); });
  out.banner = await page.evaluate(async () => { onMsg({ t: 'opn', k: 'fall', att: me.team, sector: 1, n: 'Green Front', next: 'Green Support' }); const t = $('banner').textContent, o = $('banner').style.opacity; return /SECTOR CAPTURED/.test(t) && /Green Support/.test(t) && o === '1'; });
  out.defBanner = await page.evaluate(() => { onMsg({ t: 'opn', k: 'fall', att: 1 - me.team, sector: 1, n: 'Green Front', next: 'Green Support' }); return /SECTOR LOST/.test($('banner').textContent) && /Fall back/.test($('banner').textContent); });
  out.oob = await page.evaluate(async () => { onMsg({ t: 'oob', s: 10 }); await new Promise(r => setTimeout(r, 200)); const sh = getComputedStyle($('oob')).display === 'block' && /Fall back/.test($('oob').textContent); onMsg({ t: 'oob', s: 0 }); await new Promise(r => setTimeout(r, 200)); return sh && getComputedStyle($('oob')).display === 'none'; });
  out.errors = errors; console.log(JSON.stringify(out, null, 1));
  const ok = Object.entries(out).every(([k, v]) => k === 'errors' ? !v.length : v === true);
  console.log(ok ? 'OPS BROWSER OK' : 'OPS BROWSER FAIL'); await browser.close(); process.exit(ok ? 0 : 1);
})().catch(e => { console.log('TEST ERROR', e.message); process.exit(1); });
