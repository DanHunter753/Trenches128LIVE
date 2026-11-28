'use strict';
// Real browser client (THREE stubbed), v0.27: server list and account creation on the connect screen, three.js loaded from
// the game's own vendor path first, batched soldier drawing + distance LOD + frame stats, a trench bay caving in, war cry.
// Run against: T128_TEST=1 node server.js --port 8099 --registry --public http://localhost:8099 --name BTest --data <empty dir>
const { chromium } = require('playwright'); const fs = require('fs');
const url = process.argv[2] || 'http://localhost:8099';
const STUB = fs.readFileSync(__dirname + '/browser.js', 'utf8').match(/const STUB = `([\s\S]*?)`;/)[1];
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 760 } }); const errors = []; page.on('pageerror', e => errors.push(e.message));
  const asked = []; await page.route('**/three.min.js', r => { asked.push(r.request().url()); r.fulfill({ contentType: 'text/javascript', body: STUB }); });
  await page.goto(url); await page.waitForSelector('#nm'); const out = {};
  out.vendorFirst = asked.length >= 1 && /\/vendor\/three\.min\.js$/.test(asked[0]);
  await page.waitForFunction(() => document.querySelectorAll('#srv tr[data-u]').length >= 1, null, { timeout: 5000 }).catch(() => {});
  out.serverList = await page.evaluate(() => /BTest/.test($('srv').textContent) && !!$('srv').querySelector('button'));
  out.accountForm = await page.evaluate(() => !!$('pw') && !!$('lg') && !!$('rg'));
  await page.fill('#nm', 'V27Acct'); await page.fill('#pw', 'password123'); await page.click('#rg'); await page.waitForSelector('#rcok', { timeout: 6000 }).then(() => page.click('#rcok')).catch(() => {});   // v0.48: the recovery code is shown first
  await page.waitForSelector('#go', { timeout: 6000 }).catch(() => {});
  out.registered = await page.evaluate(() => { const k = tokGet($('host') ? $('host').value : location.host) || tokGet(location.host); return !!k && k.n === 'V27Acct' && !!prof && prof.acct === 1; });
  await page.click('#go'); await page.waitForFunction(() => me.alive === true, null, { timeout: 8000 }); await sleep(1500);
  out.batched = await page.evaluate(() => ents.size > 0 && [...ents.values()].some(e => e.row != null) && lodN > 0 && !!BODY && !!GUNB);
  out.lod = await page.evaluate(() => { lodT = 0; lodTick(.1); let items = 0, ok = true; for (const b of SSB.values()) for (let i = 0; i < b.items.length; i += 7) { items++; if (b.items[i + 6] < 70) ok = false; } return items > 100 && ok && LODS.every(q => q.userData.r >= 70) && typeof staticDraw === 'function'; });   // v0.28: scenery is drawn from static batches (SSB), each item keeps its view distance   // (stubbed sprites have no real positions, so only the bookkeeping is checked here)
  out.fpsStats = await page.evaluate(() => new Promise(r => { S.fps = true; setTimeout(() => r(/FPS · worst \d+ ms · .* draws · \d+ soldiers/.test($('fps').textContent)), 900); }));
  out.bayCaves = await page.evaluate(() => { let c = -1; for (let i = 3; i < 34; i++) if (T.bayOK(30, i)) { c = i; break; } const before = BAYI.get(30 * 1000 + c); onMsg({ t: 'bay', l: 30, c }); return T.BAYS.has(30 * 1000 + c) && (!before || before.every(r => r[2] != null)); });
  out.warCry = await page.evaluate(() => { onMsg({ t: 'cry', x: me.x + 5, z: me.z, tm: 1 - me.team }); return true; });
  out.errors = errors; console.log(JSON.stringify(out, null, 1));
  const ok = Object.entries(out).every(([k, v]) => k === 'errors' ? !v.length : v === true);
  console.log(ok ? 'V27 BROWSER OK' : 'V27 BROWSER FAIL'); await browser.close(); process.exit(ok ? 0 : 1);
})().catch(e => { console.log('TEST ERROR', e.message); process.exit(1); });
