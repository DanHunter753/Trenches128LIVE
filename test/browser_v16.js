'use strict';
// Real browser client (THREE stubbed): respawn picker on death, corpses from body events, explosion debris,
// weapon layer on remote soldiers. Needs a server started with T128_TEST=1.
const { chromium } = require('playwright'); const fs = require('fs');
const url = process.argv[2] || 'http://localhost:8099';
const STUB = fs.readFileSync(__dirname + '/browser.js', 'utf8').match(/const STUB = `([\s\S]*?)`;/)[1];
(async () => {
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1100, height: 700 } }); const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.route('**/three.min.js', r => r.fulfill({ contentType: 'text/javascript', body: STUB }));
  await page.goto(url); await page.waitForSelector('#nm'); await page.fill('#nm', 'V16Browser'); await page.click('#cn');
  await page.waitForSelector('#go', { timeout: 5000 }); await page.click('#go'); await page.waitForFunction(() => me.alive === true, null, { timeout: 8000 });
  await page.waitForTimeout(1500); const out = {};
  // remote soldiers get a weapon layer chosen from the snapshot's weapon bits
  out.weaponLayer = await page.evaluate(() => { const es = [...ents.values()].filter(e => e.row != null); return es.length > 0 && es.every(e => e.wi >= 0 && e.wi < 8 && e.gl >= 0 && e.gl < 9) && !!ART.gun; });   // v0.27: guns are drawn in a batch (e.gl = layer)
  // a body event: the soldier's sprite is hidden and a corpse flies off
  out.corpse = await page.evaluate(async () => { const e = [...ents.entries()][0]; if (!e) return false; const [id, en] = e; const P = en.sp.position;
    onMsg({ t: 'bd', b: [[id, P.x, P.y, P.z, 6, 8, 0, en.team, 0, 0]] }); const c = corpses[corpses.length - 1], y0 = c.m.position.y;
    await new Promise(r => setTimeout(r, 300)); return en.sp.visible === false && c.m.position.x > P.x + .5 && !c.rest; });
  out.explosionFx = await page.evaluate(() => { const n0 = debris.length; boomFx(me.x + 10, me.z); return debris.length >= n0 + 15 && shake > 0; });
  // death -> respawn picker lists home base (and any field posts); choosing sends spawnAt
  const sent = []; await page.exposeFunction('note', m => sent.push(m));
  await page.evaluate(() => { const o = window.sendJ; window.__s = sendJ; });
  await page.evaluate(() => sendJ({ t: 'dmg', n: 999, head: true }));
  await page.waitForFunction(() => !me.alive, null, { timeout: 5000 }); await page.waitForTimeout(1300);
  out.pickerShown = await page.evaluate(() => getComputedStyle(document.getElementById('spk')).display === 'block' && !!document.getElementById('spm') && /Home base|Jump-off trench|Reserve position|Forward HQ|Last-ditch position/.test(spawnList()[0].n));
  // v0.31.1 spawn map: held flags are on the list; clicking a marker on the map picks it
  out.flagsListed = await page.evaluate(() => spawnList().filter(q => q.k === 'flag').length === obj.filter(o => o.owner === me.team).length && spawnList().some(q => q.k === 'flag' && q.ok));
  { const pt = await page.evaluate(() => { const L = spawnList(), i = L.findIndex(q => q.k === 'flag' && q.ok), cv = $('spm'), r = cv.getBoundingClientRect(), [X, Y] = spawnXY(cv); return { i, id: L[i].id, x: r.left + X(L[i].x) * r.width / cv.width, y: r.top + Y(L[i].z) * r.height / cv.height }; });
    await page.mouse.click(pt.x, pt.y); await new Promise(r => setTimeout(r, 200)); out.mapClickPicksFlag = await page.evaluate(id => spawnSel === id && /Respawning at: Flag/.test($('spn').textContent), pt.id); }
  await page.evaluate(() => pickSpawn(0)); out.pickHighlighted = await page.evaluate(() => spawnSel === 0 && /Respawning at/.test($('spn').textContent));
  await page.waitForFunction(() => me.alive, null, { timeout: 9000 }); await page.waitForTimeout(400);
  out.pickerHiddenWhenAlive = await page.evaluate(() => getComputedStyle(document.getElementById('spk')).display === 'none');
  await page.waitForFunction(() => !!opS, null, { timeout: 4000 }).catch(() => {}); out.spawnedHome = await page.evaluate(() => Math.abs(me.z - stageZ().z) < 12);   // the side's staging point (Operations; the picker shows it at x = 0)
  out.errors = errors; console.log(JSON.stringify(out, null, 1));
  const ok = Object.entries(out).every(([k, v]) => k === 'errors' ? !v.length : v === true);
  console.log(ok ? 'V16 BROWSER OK' : 'V16 BROWSER FAIL'); await browser.close(); process.exit(ok ? 0 : 1);
})().catch(e => { console.log('TEST ERROR', e.message); process.exit(1); });
