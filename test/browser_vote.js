'use strict';
// v0.49 in the browser: the vote screen appears when a round ends (three cards, a timer), a click votes, Esc shows the report
// behind it, and the page follows the server onto the voted mode (Attrition: its line HUD at the top).
const { chromium } = require('playwright'); const fs = require('fs'), path = require('path'), os = require('os');
const srv = require('child_process').spawn(process.execPath, [path.join(__dirname, '..', 'server.js'), '--port', '8092', '--maps', 'vote', '--no-fetch', '--fill', '4', '--data', fs.mkdtempSync(path.join(os.tmpdir(), 't128bv-'))], { env: { ...process.env, T128_TEST: '1' }, stdio: 'ignore' });
const url = 'http://localhost:8092', STUB = fs.readFileSync(__dirname + '/browser.js', 'utf8').match(/const STUB = `([\s\S]*?)`;/)[1];
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] }); const R = {}, ck = (k, v) => { R[k] = !!v; }, errors = [];
  for (let i = 0; i < 60; i++) { try { if ((await fetch(url + '/health')).ok) break; } catch (e) { } await sleep(250); }
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } }); page.on('pageerror', e => errors.push(e.message)); await page.route('**/three.min.js', r => r.fulfill({ contentType: 'text/javascript', body: STUB }));
  await page.goto(url); await page.fill('#nm', 'Voter'); await page.click('#cn'); await page.waitForSelector('#go', { timeout: 15000 }); await page.click('#go');
  await page.waitForFunction(() => me.alive === true, null, { timeout: 10000 }).catch(() => {});
  const seed0 = await page.evaluate(() => T.MP.seed);
  await page.evaluate(() => sendJ({ t: 'tround', win: 0, vt: 5 })); await page.waitForSelector('#vote .vcard', { timeout: 8000 }).catch(() => {});
  const ui = await page.evaluate(() => ({ n: document.querySelectorAll('#vote .vcard').length, modes: [...document.querySelectorAll('#vote .vg')].map(e => e.textContent).join(), ring: !!document.querySelector('#vote .vring') }));
  R.ui = ui; ck('voteScreen', ui.n === 3 && ui.modes === 'OPERATION,ATTRITION,DOMINATION' && ui.ring);
  await page.click('#vote .vcard[data-vi="1"]'); await sleep(500);
  ck('voted', await page.evaluate(() => voteS.my === 1 && voteS.c[1] === 1 && document.querySelector('#vote .vcard[data-vi="1"]').classList.contains('mine')));
  await page.keyboard.press('Escape'); await sleep(200); ck('escShowsReport', await page.evaluate(() => getComputedStyle($('vote')).display === 'none' && !!$('vtag')));
  await page.keyboard.press('Escape'); await sleep(200); ck('escBack', await page.evaluate(() => getComputedStyle($('vote')).display === 'flex'));
  await page.waitForFunction(s => typeof T !== 'undefined' && T.MP.seed !== s && me.alive === true && gmS === 'attr', seed0, { timeout: 40000 }).catch(() => {});
  await sleep(1500); const st = await page.evaluate(() => ({ gm: gmS, wake: WAKE, hud: getComputedStyle($('domh')).display, vote: !$('vote') || getComputedStyle($('vote')).display === 'none' }));
  R.st = st; ck('attritionRound', st.gm === 'attr' && !st.wake && st.hud === 'block' && st.vote);
  await page.screenshot({ path: '/tmp/attr_hud.png' });
  ck('noErrors', !errors.length); R.errors = errors.slice(0, 3);
  console.log(JSON.stringify(R)); const bad = Object.keys(R).filter(k => R[k] === false); console.log(bad.length ? 'FAILED: ' + bad.join(', ') : 'ALL ' + Object.keys(R).filter(k => typeof R[k] === 'boolean').length + ' CHECKS PASSED');
  await browser.close(); srv.kill(); process.exit(bad.length ? 1 : 0);
})().catch(e => { console.log('TEST ERROR', e); srv.kill(); process.exit(1); });
