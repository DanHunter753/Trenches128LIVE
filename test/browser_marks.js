'use strict';
// Real browser, v0.33.3 friend markers: blue over teammates (within 150 m), green over players in your own squad,
// red over spotted enemies as before; never over yourself.
const { chromium } = require('playwright'); const fs = require('fs');
const url = process.argv[2] || 'http://localhost:8099';
const STUB = fs.readFileSync(__dirname + '/browser.js', 'utf8').match(/const STUB = `([\s\S]*?)`;/)[1];
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] }); const R = {}, ck = (k, v) => { R[k] = !!v; }, errors = [];
  const join = async (name, sq) => { const page = await browser.newPage(); page.on('pageerror', e => errors.push(e.message)); await page.route('**/three.min.js', r => r.fulfill({ contentType: 'text/javascript', body: STUB }));
    await page.addInitScript(() => { const o = WebSocket.prototype.send; WebSocket.prototype.send = function (d) { if (typeof d === 'string' && d.startsWith('{"t":"hello"')) d = d.replace('{"t":"hello"', '{"t":"hello","team":0'); return o.call(this, d); }; });   // (test servers honour a side in hello)
    await page.goto(url); await page.fill('#nm', name); await page.click('#cn'); await page.waitForSelector('#go'); await page.evaluate(sq => { L.sq = sq; }, sq); await page.click('#go');
    await page.waitForFunction(() => me.alive === true, null, { timeout: 15000 }); await page.evaluate(() => { S.tut = false; }); return page; };
  const a = await join('Alpha', 0), b = await join('Bravo', 0);
  const team = await a.evaluate(() => me.team), bt = await b.evaluate(() => me.team); R.teams = [team, bt];
  await b.evaluate(([x, z]) => sendJ({ t: 'tp', x, z }), await a.evaluate(() => [me.x + 6, me.z])); await sleep(1500);
  const cnt = () => a.evaluate(() => { const c = [0, 0, 0]; for (const m of sptS) if (m.visible) c[sptM.indexOf(m.material)]++; return c; });
  const c = await cnt(); R.counts = c; ck('blueOverTeammates', c[1] > 0);
  ck('sameSide', team === bt); ck('greenOverSquadmate', c[2] >= 1 && await a.evaluate(() => [...ents.values()].some(e => e.mysq)));
  ck('noErrors', !errors.length);
  console.log(JSON.stringify(R)); const bad = Object.keys(R).filter(k => R[k] === false); console.log(bad.length ? 'FAILED: ' + bad.join(', ') : 'ALL ' + Object.keys(R).filter(k => typeof R[k] === 'boolean').length + ' CHECKS PASSED');
  await browser.close(); process.exit(bad.length ? 1 : 0);
})().catch(e => { console.log('TEST ERROR', e); process.exit(1); });
