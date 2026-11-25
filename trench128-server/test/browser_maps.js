'use strict';
// Real browser (THREE stubbed), v0.30 procedural maps: joining a server on a random map reloads the page onto that map and
// rejoins on its own; at the next round the page reloads onto the new map, comes back on the same side with the same
// loadout and deploys by itself. Run against: T128_TEST=1 node server.js --port 8098 --maps random
const { chromium } = require('playwright'); const fs = require('fs');
let srv = null; const url = (process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : null) || (() => {   // no address given: start our own random-map test server
  const path = require('path'), os = require('os');
  srv = require('child_process').spawn(process.execPath, [path.join(__dirname, '..', 'server.js'), '--port', '8098', '--maps', 'random', '--no-fetch', '--fill', '6', '--data', fs.mkdtempSync(path.join(os.tmpdir(), 't128bm-'))], { env: { ...process.env, T128_TEST: '1' }, stdio: 'ignore' });
  return 'http://localhost:8098'; })();
const STUB = fs.readFileSync(__dirname + '/browser.js', 'utf8').match(/const STUB = `([\s\S]*?)`;/)[1];
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 760 } }); const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.route('**/three.min.js', r => r.fulfill({ contentType: 'text/javascript', body: STUB }));
  for (let i = 0; i < 60; i++) { try { if ((await fetch(url + '/health')).ok) break; } catch (e) { } await sleep(250); }
  const R = {}, ck = (k, v) => { R[k] = !!v; };
  const srvMap = async () => (await (await fetch(url + '/health')).json()).map;
  await page.goto(url); ck('pageStartsClassic', await page.evaluate(() => T.MP.seed === 0));
  await page.fill('#nm', 'MapWalker'); await page.click('#cn');
  // first join: reload onto the server's map, connect again by itself, land on the loadout screen
  await page.waitForFunction(() => typeof T !== 'undefined' && T.MP.seed !== 0 && document.getElementById('go'), null, { timeout: 15000 }).catch(() => {});
  const m0 = await srvMap(); ck('reloadedOntoServerMap', await page.evaluate(s => T.MP.seed === s && T.OBX.join() !== '-52,34,-18,22,-44,58', m0));
  await page.evaluate(() => { L.cls = 'medic'; L.w = 'carbine'; L.sq = 3; fixL(); }); await page.click('#go');
  await page.waitForFunction(() => me.alive === true, null, { timeout: 10000 }).catch(() => {});
  const before = await page.evaluate(() => ({ team: me.team, cls: me.cls, sq: me.sq })); ck('deployed', before.cls != null);
  // round over: the server moves to a new map; the page reloads, rejoins on the same side, redeploys
  await page.evaluate(() => sendJ({ t: 'tround', win: 0 }));
  await page.waitForFunction(s => typeof T !== 'undefined' && T.MP.seed !== s && me && me.alive === true, m0, { timeout: 30000 }).catch(() => {});
  const m1 = await srvMap(); const after = await page.evaluate(() => ({ seed: T.MP.seed, team: me.team, cls: me.cls, sq: me.sq, rooms: T.ROOMS.length }));
  R.before = before; R.after = after;
  ck('newMapLoaded', m1 !== m0 && after.seed === m1);
  ck('sameSideAndKit', after.team === before.team && after.cls === before.cls && after.sq === before.sq);
  ck('mapBuilt', after.rooms > 20);
  ck('noErrors', errors.length === 0); if (errors.length) console.log(errors.slice(0, 5));
  console.log(JSON.stringify(R)); const bad = Object.keys(R).filter(k => R[k] === false); console.log(bad.length ? 'MAPS BROWSER FAIL: ' + bad.join(', ') : 'MAPS BROWSER OK');
  await browser.close(); if (srv) srv.kill(); process.exit(bad.length ? 1 : 0);
})().catch(e => { console.error(e); if (srv) srv.kill(); process.exit(1); });
