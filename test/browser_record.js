'use strict';
// Real browser, v0.34 service record on the start screen: levels 1-100 from total XP with the rank ladder; a new callsign
// gets a welcome line; a known one shows its level, XP bar, ranks reached and the next one; the server answers /api/record.
const { chromium } = require('playwright'); const fs = require('fs'); const T = require('../shared.js');
const url = process.argv[2] || 'http://localhost:8099';
const STUB = fs.readFileSync(__dirname + '/browser.js', 'utf8').match(/const STUB = `([\s\S]*?)`;/)[1];
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const R = {}, ck = (k, v) => { R[k] = !!v; };
  ck('levelCurve', T.levelOf(0).lv === 1 && T.levelOf(100).lv === 2 && T.levelOf(2340).lv === 10 && T.levelOf(1e7).lv === 100 && T.levelOf(1e7).next === null);
  ck('ranksOrdered', T.RK.every((r, i) => !i || r[1] > T.RK[i - 1][1]) && T.RK.length === 12 && T.rankOf(200000) === 11);
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] }); const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = []; page.on('pageerror', e => errors.push(e.message)); await page.route('**/three.min.js', r => r.fulfill({ contentType: 'text/javascript', body: STUB }));
  await page.goto(url); const api = await page.evaluate(async () => (await fetch('/api/record?n=nobody_here')).json()); ck('apiRecord', api.xp === 0 && api.lv === 1);
  await page.fill('#nm', 'Freshman'); await sleep(900); ck('newRecruit', /New recruit/.test(await page.evaluate(() => $('rec').textContent)));
  await page.evaluate(() => { recCache('Oldhand', 23456); $('nm').value = 'Oldhand'; recDraw(recCached('Oldhand'), 'Oldhand'); });
  const t = await page.evaluate(() => $('rec').textContent); ck('showsLevelAndRank', /LEVEL 33/.test(t) && /Colonel/.test(t) && /23,456 XP/.test(t) && /Brigadier/.test(t) && /Perk points earned: 32/.test(t));
  ck('ladder', await page.evaluate(() => $('rec').querySelectorAll('.rm .got').length === 8 && !!$('rec').querySelector('.rm .nxt')));
  ck('noErrors', !errors.length);
  console.log(JSON.stringify(R)); const bad = Object.keys(R).filter(k => R[k] === false); console.log(bad.length ? 'FAILED: ' + bad.join(', ') : 'ALL ' + Object.keys(R).filter(k => typeof R[k] === 'boolean').length + ' CHECKS PASSED');
  await browser.close(); process.exit(bad.length ? 1 : 0);
})().catch(e => { console.log('TEST ERROR', e); process.exit(1); });
