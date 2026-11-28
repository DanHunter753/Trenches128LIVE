'use strict';
// v0.52 in the browser (night): every round's tracer is the bright night streak, rifle rounds leave a fading smoke trail,
// and the respawn map offers the squad leader when the server says he can take you.
const { chromium } = require('playwright'); const fs = require('fs');
const url = process.argv[2] || 'http://localhost:8099';
const STUB = fs.readFileSync(__dirname + '/browser.js', 'utf8').match(/const STUB = `([\s\S]*?)`;/)[1];
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] }); const R = {}, ck = (k, v) => { R[k] = !!v; }, errors = [];
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } }); page.on('pageerror', e => errors.push(e.message)); await page.route('**/three.min.js', r => r.fulfill({ contentType: 'text/javascript', body: STUB }));
  await page.goto(url); await page.fill('#nm', 'Nighty'); await page.evaluate(() => localStorage.setItem('t128name', 'Nighty'));
  // v0.56 loadout from the first screen, rank ladder, class XP on the cards
  await page.evaluate(() => { localStorage.setItem('t128rec', JSON.stringify({ nighty: 2500 })); localStorage.setItem('t128cx', JSON.stringify({ nighty: { recon: 321 } })); });
  await page.reload(); await page.waitForSelector('#mmR .rkl');   // a wide window: the loadout sits beside the server list
  ck('menuLoadout', await page.evaluate(() => /LOADOUT/.test($('mmR').querySelector('h1').textContent) && /Deploy as/.test($('go').textContent) && getComputedStyle($('lo')).display === 'none'));
  ck('rankLadder', await page.evaluate(() => { const t = $('ovb').querySelector('.rkl').textContent; return /Colonel/.test(t) && /Officer/.test(t) && /Sapper/.test(t); }));
  ck('officerLockedTillColonel', await page.evaluate(() => /Requires Colonel/.test(document.querySelector('.card[data-k="cls"][data-v="officer"]').textContent)));
  ck('classXpShown', await page.evaluate(() => /Class XP 321/.test(document.querySelector('.card[data-v="recon"]').textContent)));
  await page.click('.card[data-k="cls"][data-v="recon"]'); ck('deployLabel', await page.evaluate(() => /Recon/.test($('go').textContent)));
  await page.click('#mmR #go');
  ck('savedOnDeploy', await page.evaluate(() => JSON.parse(localStorage.getItem('t128mp')).cls === 'recon')); await page.waitForSelector('#go'); await page.click('#go'); await page.waitForFunction(() => me.alive === true, null, { timeout: 20000 });
  ck('night', await page.evaluate(() => wxK === 'night'));
  ck('nightTracer', await page.evaluate(() => { tracer(me.x, 2, me.z, 0, 0, -1, 300, false, 700, 'smg'); const o = trc[(trI - 1) % trc.length]; return o.l.material === trN && o.nt === 14; }));
  ck('smgNoSmoke', await page.evaluate(() => SMK.every(q => !q.l.visible)));
  ck('rifleSmoke', await page.evaluate(() => { tracer(me.x, 2, me.z, 0, 0, -1, 300, false, 700, 'bolt'); return SMK.some(q => q.l.visible && q.o); }));
  ck('smokeFades', await page.evaluate(() => { for (let i = 0; i < 100; i++) { trTick(1 / 50); smkTick(1 / 50); } return SMK.every(q => !q.l.visible); }));
  ck('slInSpawnList', await page.evaluate(() => { onMsg({ t: 'sl', n: 'Sarge', x: me.x + 5, z: me.z, ok: 1, cd: 0 }); return spawnList().some(q => q.id === -98 && q.ok && /Sarge/.test(q.n)); }));
  ck('slCooldownShown', await page.evaluate(() => { onMsg({ t: 'sl', n: 'Sarge', x: me.x + 5, z: me.z, ok: 0, cd: 120 }); return spawnList().some(q => q.id === -98 && !q.ok && /120s/.test(q.n)); }));
  R.errors = errors; ck('noErrors', !errors.length); console.log(JSON.stringify(R));
  const bad = Object.keys(R).filter(k => R[k] === false); console.log(bad.length ? 'FAILED: ' + bad.join(', ') : 'ALL ' + Object.keys(R).filter(k => typeof R[k] === 'boolean').length + ' CHECKS PASSED');
  await browser.close(); process.exit(bad.length ? 1 : 0);
})().catch(e => { console.log('TEST ERROR', e); process.exit(1); });
