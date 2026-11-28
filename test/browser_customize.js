'use strict';
// Real browser client (THREE stubbed), v0.39 customize screen: a page per class (slots, choices, the soldier, stats), each
// class keeps its own weapon and gadget, locked classes and weapons can be seen but not taken, and what you set is what deploys.
const { chromium } = require('playwright'); const fs = require('fs');
const url = process.argv[2] || 'http://localhost:8099';
const STUB = fs.readFileSync(__dirname + '/browser.js', 'utf8').match(/const STUB = `([\s\S]*?)`;/)[1];
(async () => {
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] }); const R = {}, ck = (k, v) => { R[k] = !!v; }, errors = [];
  const open = async name => { const page = await browser.newPage({ viewport: { width: 1280, height: 760 } }); page.on('pageerror', e => errors.push(e.message)); await page.route('**/three.min.js', r => r.fulfill({ contentType: 'text/javascript', body: STUB })); await page.goto(url); await page.fill('#nm', name); await page.click('#cn'); await page.waitForSelector('#go'); await page.click('[data-t="load"]'); await page.waitForSelector('.cz'); return page; };
  const p = await open('officerbrowser');   // Lieutenant: everything unlocked
  ck('pageLayout', await p.evaluate(() => /CUSTOMIZE RIFLEMAN/.test($('ovb').textContent) && document.querySelectorAll('.czslot').length === 7 && !!$('czc') && !!$('czg') && document.querySelectorAll('.czs').length === 4 && /Bolt Rifle/.test($('czi').textContent) && /125 rpm/.test($('czi').textContent)));
  await p.waitForFunction(() => czImg.naturalWidth > 0, null, { timeout: 10000 }).catch(() => {});
  ck('soldierDrawn', await p.evaluate(() => { const d = $('czc').getContext('2d').getImageData(0, 0, 320, 300).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 200) n++; return n > 4000; }));
  ck('soldierTurns', await p.evaluate(() => { const snap = () => $('czc').toDataURL(); const a = snap(); document.querySelector('[data-cz="rr"]').click(); return snap() !== a && czView === 1; }));
  await p.click('.czo[data-v="carbine"]'); ck('weaponPicked', await p.evaluate(() => L.w === 'carbine' && L.by.rifleman.w === 'carbine' && /Semi-auto Carbine/.test($('czi').textContent)));
  await p.hover('.czo[data-v="bolt"]'); ck('hoverShowsStats', await p.evaluate(() => /Bolt Rifle/.test($('czi').querySelector('h3').textContent) && L.w === 'carbine'));
  await p.click('[data-cz="next"]'); ck('nextClassPage', await p.evaluate(() => /CUSTOMIZE ASSAULT/.test($('ovb').textContent) && L.cls === 'assault' && L.w === 'shotgun' && /Deploy as Assault/.test($('go').textContent)));
  await p.click('.czo[data-v="smg"]'); await p.click('[data-cz="slot"][data-v="u"]'); await p.click('.czo[data-v="smokenade"]');
  ck('gadgetPicked', await p.evaluate(() => L.u === 'smokenade' && L.by.assault.u === 'smokenade' && L.by.assault.w === 'smg'));
  await p.click('[data-cz="prev"]'); ck('eachClassKeepsItsOwn', await p.evaluate(() => L.cls === 'rifleman' && L.w === 'carbine' && L.u === 'bandage'));
  await p.click('[data-cz="next"]'); ck('andComesBack', await p.evaluate(() => L.cls === 'assault' && L.w === 'smg' && L.u === 'smokenade'));
  for (const sl of ['gr', 'ml', 'ab', 'sp']) await p.click(`[data-cz="slot"][data-v="${sl}"]`); ck('perksPanel', await p.evaluate(() => /Small edges you choose/.test($('czi').textContent) && /perk point/i.test($('czi').textContent) && document.querySelectorAll('#czl .czo[data-k="pk"]').length >= 13));   // v0.47: the perk tree replaced the 'coming later' panel
  await p.click('[data-t="class"]'); await p.click('.card[data-k="cls"][data-v="medic"]'); ck('classTabUsesSaved', await p.evaluate(() => L.cls === 'medic' && CLS.medic.w.includes(L.w)));
  await p.click('.card[data-k="cls"][data-v="assault"]'); await p.click('#go'); await p.waitForFunction(() => me.alive === true, null, { timeout: 15000 });
  ck('deploysWhatYouSet', await p.evaluate(() => me.cls === 'assault' && me.w === 'smg' && me.u === 'smokenade')); ck('savedForNextTime', await p.evaluate(() => { const s = JSON.parse(localStorage.getItem('t128mp')); return s.by.assault.w === 'smg' && s.by.rifleman.w === 'carbine'; }));
  const n = await open('Fresh');   // a Private: gunner and the carbine are locked
  ck('lockedWeapon', await n.evaluate(() => { const o = document.querySelector('.czo[data-v="carbine"]'); o.click(); return o.classList.contains('dis') && L.w === 'bolt'; }));
  await n.click('[data-cz="next"]'); await n.click('[data-cz="next"]'); ck('lockedClassIsViewOnly', await n.evaluate(() => /CUSTOMIZE MACHINE GUNNER/.test($('ovb').textContent) && /unlocks at Corporal/.test($('czl').textContent) && L.cls === 'assault' && /Deploy as Assault/.test($('go').textContent)));
  ck('noErrors', !errors.length); R.errors = errors.slice(0, 3);
  console.log(JSON.stringify(R)); const bad = Object.keys(R).filter(k => R[k] === false); console.log(bad.length ? 'FAILED: ' + bad.join(', ') : 'ALL ' + Object.keys(R).filter(k => typeof R[k] === 'boolean').length + ' CHECKS PASSED');
  await browser.close(); process.exit(bad.length ? 1 : 0);
})().catch(e => { console.log('TEST ERROR', e); process.exit(1); });
