'use strict';
// v0.47 perk tree in the browser: a logged-in player opens PERKS on the customize screen, unlocks the free starter and a class
// perk, equips them, deploys with them active (prediction gets them too), and a guest sees the catalogue locked.
const { chromium } = require('playwright'); const fs = require('fs'), path = require('path'), os = require('os');
const srv = require('child_process').spawn(process.execPath, [path.join(__dirname, '..', 'server.js'), '--port', '8096', '--maps', 'classic', '--no-fetch', '--fill', '2', '--data', fs.mkdtempSync(path.join(os.tmpdir(), 't128bp-'))], { env: { ...process.env, T128_TEST: '1' }, stdio: 'ignore' });
const url = 'http://localhost:8096', STUB = fs.readFileSync(__dirname + '/browser.js', 'utf8').match(/const STUB = `([\s\S]*?)`;/)[1];
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] }); const R = {}, ck = (k, v) => { R[k] = !!v; }, errors = [];
  for (let i = 0; i < 60; i++) { try { if ((await fetch(url + '/health')).ok) break; } catch (e) { } await sleep(250); }
  const reg = await (await fetch(url + '/api/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'PerkPlayer', pass: 'longpassword1' }) })).json();
  const page = await browser.newPage({ viewport: { width: 1280, height: 760 } }); page.on('pageerror', e => errors.push(e.message)); await page.route('**/three.min.js', r => r.fulfill({ contentType: 'text/javascript', body: STUB }));
  page.on('dialog', d => d.accept());
  await page.goto(url); await page.evaluate(t => { tokSet($('host').value, t, 'PerkPlayer'); acctShow(); }, reg.token); await page.click('#cn');
  await page.waitForFunction(() => document.getElementById('go') && typeof perkS !== 'undefined' && perkS, null, { timeout: 15000 }).catch(() => {});
  ck('perkStateOnJoin', await page.evaluate(() => perkS && perkS.acct === 1 && perkS.lv === 1 && perkS.slots === 0));
  await page.evaluate(() => sendJ({ t: 'txp', n: T.lvXp(8) - (me.xp || 0) + 5 })); await page.waitForFunction(() => perkS.lv >= 8, null, { timeout: 5000 }).catch(() => {});
  // open the PERKS slot for the rifleman
  await page.evaluate(() => { czCls = 'rifleman'; setCls('rifleman'); }); await page.click('#tabs [data-t="load"]'); await sleep(300); await page.click('[data-cz="slot"][data-v="sp"]'); await sleep(400);
  const list = await page.evaluate(() => [...document.querySelectorAll('#czl .czo[data-k="pk"]')].map(b => b.dataset.v + ':' + b.querySelector('small').textContent));
  R.list = list.length; ck('catalogueShown', list.length === 13 && list.some(x => x === 'quick:FREE starter') && list.some(x => x.startsWith('bayonet:2')) && !list.some(x => x.startsWith('triage')));
  await page.click('#czl .czo[data-v="quick"]'); await page.waitForFunction(() => perkS.pk.own.includes('quick'), null, { timeout: 4000 }).catch(() => {});
  await page.click('#czl .czo[data-v="bayonet"]'); await page.waitForFunction(() => perkS.pk.own.includes('bayonet'), null, { timeout: 4000 }).catch(() => {});
  ck('bought', await page.evaluate(() => perkS.pk.st === 'quick' && perkS.pts === perkS.lv - 2));
  await page.click('#czl .czo[data-v="quick"]'); await page.waitForFunction(() => (perkS.pk.eq.rifleman || []).length === 1, null, { timeout: 4000 }).catch(() => {});
  await page.click('#czl .czo[data-v="bayonet"]'); await page.waitForFunction(() => (perkS.pk.eq.rifleman || []).length === 2, null, { timeout: 4000 }).catch(() => {});
  const ui = await page.evaluate(() => ({ eq: (perkS.pk.eq.rifleman || []).join(), slotTxt: document.querySelector('[data-cz="slot"][data-v="sp"]').textContent, on: [...document.querySelectorAll('#czl .czo.on')].map(b => b.dataset.v).join() }));
  R.ui = ui; ck('equippedShown', ui.eq === 'quick,bayonet' && /Quick Hands · Bayonet Drill/.test(ui.slotTxt) && ui.on === 'quick,bayonet');
  // a third slot isn't open at level 8
  await page.click('#czl .czo[data-v="breath"]'); await sleep(500); await page.click('#czl .czo[data-v="breath"]'); await sleep(500);
  ck('slotLimit', await page.evaluate(() => (perkS.pk.eq.rifleman || []).length === 2));
  // deploy: the perks are active and prediction knows them
  await page.click('#go'); await page.waitForFunction(() => me.alive === true, null, { timeout: 10000 }).catch(() => {});
  const live = await page.evaluate(() => ({ pk: (me.pk || []).join(), chg: T.chgMax(me) / T.chgMax({ cls: 'rifleman' }) }));
  R.live = live; ck('activeInGame', live.pk === 'quick,bayonet' && Math.abs(live.chg - 1.15) < 1e-6);
  // a guest sees the catalogue, locked
  const g = await browser.newPage({ viewport: { width: 1280, height: 760 } }); g.on('pageerror', e => errors.push(e.message)); await g.route('**/three.min.js', r => r.fulfill({ contentType: 'text/javascript', body: STUB }));
  await g.goto(url); await g.fill('#nm', 'GuestGuy'); await g.click('#cn'); await g.waitForSelector('#go', { timeout: 15000 }).catch(() => {});
  await g.click('#tabs [data-t="load"]'); await sleep(300); await g.click('[data-cz="slot"][data-v="sp"]'); await sleep(400);
  ck('guestLocked', await g.evaluate(() => /log in/.test(document.querySelector('[data-cz="slot"][data-v="sp"]').textContent) && [...document.querySelectorAll('#czl .czo[data-k="pk"]')].every(b => b.classList.contains('dis'))));
  ck('noErrors', !errors.length); R.errors = errors.slice(0, 3);
  console.log(JSON.stringify(R)); const bad = Object.keys(R).filter(k => R[k] === false); console.log(bad.length ? 'FAILED: ' + bad.join(', ') : 'ALL ' + Object.keys(R).filter(k => typeof R[k] === 'boolean').length + ' CHECKS PASSED');
  await browser.close(); srv.kill(); process.exit(bad.length ? 1 : 0);
})().catch(e => { console.log('TEST ERROR', e); srv.kill(); process.exit(1); });
