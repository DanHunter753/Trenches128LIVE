'use strict';
// v0.47.1 in the browser: registering shows the recovery code before joining; "Forgot password?" resets with it and logs in;
// "change password" works while logged in.
const { chromium } = require('playwright'); const fs = require('fs'), path = require('path'), os = require('os');
const srv = require('child_process').spawn(process.execPath, [path.join(__dirname, '..', 'server.js'), '--port', '8094', '--maps', 'classic', '--no-fetch', '--fill', '2', '--data', fs.mkdtempSync(path.join(os.tmpdir(), 't128br2-'))], { env: { ...process.env, T128_TEST: '1' }, stdio: 'ignore' });
const url = 'http://localhost:8094', STUB = fs.readFileSync(__dirname + '/browser.js', 'utf8').match(/const STUB = `([\s\S]*?)`;/)[1];
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] }); const R = {}, ck = (k, v) => { R[k] = !!v; }, errors = [];
  for (let i = 0; i < 60; i++) { try { if ((await fetch(url + '/health')).ok) break; } catch (e) { } await sleep(250); }
  const page = await browser.newPage({ viewport: { width: 1280, height: 760 } }); page.on('pageerror', e => errors.push(e.message)); page.on('dialog', d => d.accept()); await page.route('**/three.min.js', r => r.fulfill({ contentType: 'text/javascript', body: STUB }));
  await page.goto(url); await page.fill('#nm', 'NewRecruit'); await page.fill('#pw', 'mypassword1'); await page.click('#rg');
  await page.waitForSelector('.rcc', { timeout: 8000 }).catch(() => {}); const code = await page.evaluate(() => document.querySelector('.rcc') && document.querySelector('.rcc').textContent);
  ck('codeShownOnRegister', /^[A-Z2-9]{4}(-[A-Z2-9]{4}){3}$/.test(code || '')); ck('waitsBeforeJoining', await page.evaluate(() => !document.getElementById('go')));
  await page.click('#rcok'); await page.waitForSelector('#go', { timeout: 15000 }).catch(() => {}); ck('joinsAfterOk', await page.evaluate(() => !!document.getElementById('go')));
  // a fresh browser that forgot the password
  const p2 = await browser.newPage({ viewport: { width: 1280, height: 760 } }); p2.on('pageerror', e => errors.push(e.message)); p2.on('dialog', d => d.accept()); await p2.route('**/three.min.js', r => r.fulfill({ contentType: 'text/javascript', body: STUB }));
  await p2.goto(url); await p2.click('#fgp'); await p2.fill('#afn', 'NewRecruit'); await p2.fill('#afc', code); await p2.fill('#afp', 'brandnewpass'); await p2.click('#af1');
  await p2.waitForSelector('.rcc', { timeout: 8000 }).catch(() => {});
  const st = await p2.evaluate(() => ({ code: document.querySelector('.rcc') && document.querySelector('.rcc').textContent, acct: $('acct').textContent }));
  R.st = st; ck('resetLogsIn', /Logged in as NewRecruit/.test(st.acct) && st.code && st.code !== code);
  await p2.click('#rcok'); await p2.click('#chp'); await p2.fill('#afo', 'brandnewpass'); await p2.fill('#afp', 'evennewerpass'); await p2.click('#af1'); await sleep(1500);
  const lg = await fetch(url + '/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'NewRecruit', pass: 'evennewerpass' }) });
  ck('changeFromPage', lg.status === 200);
  ck('noErrors', !errors.length); R.errors = errors.slice(0, 3);
  console.log(JSON.stringify(R)); const bad = Object.keys(R).filter(k => R[k] === false); console.log(bad.length ? 'FAILED: ' + bad.join(', ') : 'ALL ' + Object.keys(R).filter(k => typeof R[k] === 'boolean').length + ' CHECKS PASSED');
  await browser.close(); srv.kill(); process.exit(bad.length ? 1 : 0);
})().catch(e => { console.log('TEST ERROR', e); srv.kill(); process.exit(1); });
