'use strict';
// v0.45 map rotation in the browser: with --maps rotate the page follows the server from a trench map onto Wake Atoll (the
// reload brings the island's heightmap with it, the Domination HUD shows) and back onto a trench map, redeploying each time.
const { chromium } = require('playwright'); const fs = require('fs'), path = require('path'), os = require('os');
const srv = require('child_process').spawn(process.execPath, [path.join(__dirname, '..', 'server.js'), '--port', '8097', '--maps', 'rotate', '--no-fetch', '--fill', '4', '--data', fs.mkdtempSync(path.join(os.tmpdir(), 't128br-'))], { env: { ...process.env, T128_TEST: '1' }, stdio: 'ignore' });
const url = 'http://localhost:8097', STUB = fs.readFileSync(__dirname + '/browser.js', 'utf8').match(/const STUB = `([\s\S]*?)`;/)[1];
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] }); const R = {}, ck = (k, v) => { R[k] = !!v; }, errors = [];
  const page = await browser.newPage({ viewport: { width: 1280, height: 760 } }); page.on('pageerror', e => errors.push(e.message)); await page.route('**/three.min.js', r => r.fulfill({ contentType: 'text/javascript', body: STUB }));
  for (let i = 0; i < 60; i++) { try { if ((await fetch(url + '/health')).ok) break; } catch (e) { } await sleep(250); }
  await page.goto(url); await page.fill('#nm', 'Rotator'); await page.click('#cn');
  await page.waitForFunction(() => document.getElementById('go') && T.MP.kind === 'trench', null, { timeout: 15000 }).catch(() => {}); await page.click('#go');
  await page.waitForFunction(() => me.alive === true, null, { timeout: 10000 }).catch(() => {});
  const kinds = [await page.evaluate(() => T.MP.kind)];
  for (let k = 0; k < 3; k++) {
    const s0 = await page.evaluate(() => T.MP.seed); await page.evaluate(() => sendJ({ t: 'tround', win: 0 }));
    await page.waitForFunction(s => typeof T !== 'undefined' && T.MP.seed !== s && me && me.alive === true, s0, { timeout: 40000 }).catch(() => {});
    await sleep(1500); const st = await page.evaluate(() => ({ kind: T.MP.kind, wake: WAKE, alive: me.alive, hud: getComputedStyle($('domh')).display, h: hAt(me.x, me.z), structs: T.STRUCT.length }));
    kinds.push(st.kind); R['r' + k] = st;
    ck('ok' + k, st.alive && (st.kind === 'wake' ? st.wake && st.hud === 'block' && st.structs > 80 && st.h > -1.3 : !st.wake && st.hud === 'none'));
  }
  R.kinds = kinds.join(','); ck('pattern', R.kinds === 'trench,trench,wake,trench');
  ck('noErrors', !errors.length); R.errors = errors.slice(0, 3);
  console.log(JSON.stringify(R)); const bad = Object.keys(R).filter(k => R[k] === false); console.log(bad.length ? 'FAILED: ' + bad.join(', ') : 'ALL ' + Object.keys(R).filter(k => typeof R[k] === 'boolean').length + ' CHECKS PASSED');
  await browser.close(); srv.kill(); process.exit(bad.length ? 1 : 0);
})().catch(e => { console.log('TEST ERROR', e); srv.kill(); process.exit(1); });
