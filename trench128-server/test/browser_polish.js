'use strict';
// Real browser client (THREE stubbed): v0.24 polish — How to play panel + version on the connect screen, TAB help built from the
// real key binds (incl. mark/melee/lean), side objectives line, respawn picker labels (staging point, rally point, nearest line).
const { chromium } = require('playwright'); const fs = require('fs');
const url = process.argv[2] || 'http://localhost:8099';
const STUB = fs.readFileSync(__dirname + '/browser.js', 'utf8').match(/const STUB = `([\s\S]*?)`;/)[1];
(async () => {
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 760 } }); const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.route('**/three.min.js', r => r.fulfill({ contentType: 'text/javascript', body: STUB }));
  await page.goto(url); await page.waitForSelector('#nm'); const out = {};
  out.howToPlay = await page.evaluate(() => { const d = document.querySelector('details.how'); return !!d && /Operations/.test(d.textContent) && /Recon/.test(d.textContent) && /\d/.test(document.querySelector('.ver').textContent); });
  await page.fill('#nm', 'PolishTester'); await page.click('#cn'); await page.waitForSelector('#go'); await page.click('#go');
  await page.waitForFunction(() => me.alive === true, null, { timeout: 8000 }); await page.waitForTimeout(1200);
  out.tabHelp = await page.evaluate(() => { S.binds.mark = 'KeyY'; hudT = 0; return new Promise(r => setTimeout(() => { const t = $('hud').textContent; r(/\[Y\] spot enemies/.test(t) && /bayonet/.test(t) && /lean/.test(t) && /SIDE OBJECTIVES: Mill Farm/.test(t)); S.binds.mark = 'KeyT'; }, 250)); });
  out.stagingLabel = await page.evaluate(() => { const L = spawnList(); return /Jump-off trench|Reserve position|Home base|Forward HQ/.test(L[0].n) && Math.abs(L[0].z) < T.HOME_Z; });
  out.rallyLabel = await page.evaluate(() => { syncPosts([[999, me.team, 10, me.team ? -60 : 60, 180, 42]]); const r = spawnList().find(q => q.id === 999); syncPosts([]); return !!r && /Rally point \(42s\) · /.test(r.n) && T.LINES.some(n => r.n.endsWith(n)); });
  out.errors = errors; console.log(JSON.stringify(out, null, 1));
  const ok = Object.entries(out).every(([k, v]) => k === 'errors' ? !v.length : v === true);
  console.log(ok ? 'POLISH BROWSER OK' : 'POLISH BROWSER FAIL'); await browser.close(); process.exit(ok ? 0 : 1);
})().catch(e => { console.log('TEST ERROR', e.message); process.exit(1); });
