'use strict';
// Real browser client (THREE stubbed): RTS officer — squad cards (morale/health), shift-select, control groups, box select,
// queued orders, alert feed + Space jump, minimap click-to-look, fog of war canvas, tier locks, squad banners,
// and for soldiers: strike warnings and spotter marks. Needs xp.json with rtsbrowser: 800.
const { chromium } = require('playwright'); const fs = require('fs');
const url = process.argv[2] || 'http://localhost:8099';
const STUB = fs.readFileSync(__dirname + '/browser.js', 'utf8').match(/const STUB = `([\s\S]*?)`;/)[1];
(async () => {
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 760 } }); const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.route('**/three.min.js', r => r.fulfill({ contentType: 'text/javascript', body: STUB }));
  await page.goto(url); await page.waitForSelector('#nm'); await page.fill('#nm', 'rtsbrowser'); await page.click('#cn'); await page.waitForSelector('#go');
  await page.click('.card[data-k="cls"][data-v="officer"]'); await page.click('#go');
  await page.waitForFunction(() => me.alive === true && me.officer === true, null, { timeout: 8000 }); await page.waitForTimeout(2600); const out = {};
  await page.evaluate(() => { window.__sent = []; const s0 = WebSocket.prototype.send; WebSocket.prototype.send = function (d) { try { if (typeof d === 'string') window.__sent.push(JSON.parse(d)); } catch (e) { } return s0.call(this, d); }; });
  out.cards = await page.evaluate(() => { const c = document.querySelectorAll('#off .card[data-sq]'); return c.length >= 3 && [...c].every(x => x.querySelectorAll('i').length === 2) && /men/.test(c[0].textContent + c[c.length - 1].textContent); });
  await page.click('#off .card[data-sq="100"]'); await page.click('#off .card[data-sq="101"]', { modifiers: ['Shift'] });
  out.shiftSelect = await page.evaluate(() => selSq !== 'all' && selSq.size === 2 && selSq.has(100) && selSq.has(101));
  await page.keyboard.press('Shift+F1'); await page.click('#off button[data-sq="all"]'); await page.keyboard.press('F1');
  out.controlGroup = await page.evaluate(() => selSq !== 'all' && selSq.size === 2);
  out.queued = await page.evaluate(() => { omode = 'move'; const r = $('c').getBoundingClientRect(); $('c').dispatchEvent(new MouseEvent('click', { clientX: r.left + 600, clientY: r.top + 300, shiftKey: true, bubbles: true }));
    const q = __sent.filter(o => o.t === 'cmd' && o.k === 'order' && o.q === 1); return q.length === 2 && q.every(o => o.ty === 'move'); });
  out.boxSelect = await page.evaluate(() => { sqs.forEach((r, i) => { r[10] = ofx + (i - 1) * 4; r[11] = ofz; }); selSq = 'all';
    $('c').dispatchEvent(new MouseEvent('mousedown', { button: 0, clientX: 5, clientY: 5, bubbles: true })); dispatchEvent(new MouseEvent('mousemove', { clientX: 1270, clientY: 750 })); dispatchEvent(new MouseEvent('mouseup', { button: 0, clientX: 1270, clientY: 750 }));
    return dragged === true && selSq !== 'all' && selSq.size >= 1; });
  out.alertFeed = await page.evaluate(() => { onMsg({ t: 'al', k: 'fire', m: 'Assault 1 under heavy fire', x: 33, z: -12 }); return /under heavy fire/.test($('alf').textContent) && getComputedStyle($('alf')).display === 'flex'; });
  await page.keyboard.press('Space'); out.spaceJumps = await page.evaluate(() => ofx === 33 && ofz === -12);
  out.minimapLook = await page.evaluate(() => { const b = $('mm').getBoundingClientRect(); $('mm').dispatchEvent(new MouseEvent('click', { clientX: b.left + b.width * .75, clientY: b.top + b.height * .5, bubbles: true })); return Math.abs(Math.abs(ofx) - W / 2) < 3 && Math.abs(ofz) < 3; });
  out.fog = await page.evaluate(() => { fogT = 0; fogTick(performance.now() + 1000); const g = fogC.getContext('2d'), k = 128 / (2 * W), f = [...ents.values()].find(e => e.team === me.team);
    if (!f) return false; const a = g.getImageData(Math.floor((f.b.x + W) * k), Math.floor((f.b.z + W) * k), 1, 1).data[3]; let far = 0; for (const [x, y] of [[1, 1], [126, 1], [1, 126], [126, 126]]) far = Math.max(far, g.getImageData(x, y, 1, 1).data[3]); return a < 40 && far > 100; });
  out.tierLock = await page.evaluate(() => { tierS = 1; renderOff(); const b = document.querySelector('#off .ab button[data-m="creep"]'); return b && b.disabled && /tier 2/.test(b.textContent) && /REQUISITION TIER 1\/3/.test($('off').textContent); });
  await page.keyboard.press('Digit9'); out.lockedHotkeyIgnored = await page.evaluate(() => omode !== 'creep');
  out.banners = await page.evaluate(() => { banTick(); return banS.size >= 1; });
  out.strikeWarning = await page.evaluate(() => { me.officer = false; onMsg({ t: 'sw', k: 'barrage', x: me.x, z: me.z, r: 13, d: 3, s: 5 }); swTick(performance.now()); const t = $('swt').textContent, ok = getComputedStyle($('swt')).display === 'block' && /FRIENDLY BARRAGE IN [23]s/.test(t); me.officer = true; swL.length = 0; swTick(performance.now()); return ok; });
  out.marks = await page.evaluate(() => { onMsg({ t: 'mk', id: 1, x: 0, z: 20, s: 30, n: 'X', e: 0 }); mkTick(performance.now()); drawMM(); return mkS.length >= 1 && mkS[0].visible === true; });
  out.markKey = await page.evaluate(() => S.binds.mark === 'KeyT');
  out.errors = errors; console.log(JSON.stringify(out, null, 1));
  const ok = Object.entries(out).every(([k, v]) => k === 'errors' ? !v.length : v === true);
  console.log(ok ? 'RTS BROWSER OK' : 'RTS BROWSER FAIL'); await browser.close(); process.exit(ok ? 0 : 1);
})().catch(e => { console.log('TEST ERROR', e.message); process.exit(1); });
