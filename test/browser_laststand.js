'use strict';
// Real browser client (THREE stubbed), v0.40: last stand (revolver drawn and counted, crawl predicted without snap-backs,
// one shot per click) and bindable mouse buttons (side and middle buttons on any action; fire and aim rebindable).
const { chromium } = require('playwright'); const fs = require('fs');
const url = process.argv[2] || 'http://localhost:8099';
const STUB = fs.readFileSync(__dirname + '/browser.js', 'utf8').match(/const STUB = `([\s\S]*?)`;/)[1];
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] }); const R = {}, ck = (k, v) => { R[k] = !!v; }, errors = [];
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } }); page.on('pageerror', e => errors.push(e.message)); await page.route('**/three.min.js', r => r.fulfill({ contentType: 'text/javascript', body: STUB }));
  await page.goto(url); await page.waitForFunction(() => /server up to date/.test($('vline').textContent), null, { timeout: 5000 }).catch(() => {});
  ck('versionOnFirstScreen', await page.evaluate(() => /^Version \d+\.\d+\.\d+ · server up to date$/.test($('vline').textContent) && GAME_VER === document.querySelector('.ver').textContent.slice(1)));
  ck('oldPageIsFlagged', await page.evaluate(async () => { const f = window.fetch; window.fetch = async () => ({ ok: true, json: async () => ({ version: '9.9.9' }) }); await verCheck(); window.fetch = f; const t = $('vline').textContent; return /This page is version .* the server is 9\.9\.9 · reload/.test(t); }));
  await page.fill('#nm', 'Standing'); await page.click('#cn'); await page.waitForSelector('#go'); await page.click('#go'); await page.waitForFunction(() => me.alive === true, null, { timeout: 15000 });
  await page.evaluate(() => { S.tut = false; sendJ({ t: 'tp', x: 0, z: me.team ? -150 : 150 }); }); await sleep(900);
  // ---- mouse buttons as binds
  const mb = (type, button) => page.evaluate(([type, button]) => { $('c').dispatchEvent(new MouseEvent(type, { button, bubbles: true, cancelable: true })); }, [type, button]);
  ck('fireAndAimAreBinds', await page.evaluate(() => S.binds.fire === 'Mouse0' && S.binds.ads === 'Mouse2' && kn('fire') === 'LMB' && kn('ads') === 'RMB'));
  await page.mouse.move(640, 300); await page.mouse.down(); await sleep(60); const held = await page.evaluate(() => fireHeld); await page.mouse.up(); await sleep(60);
  ck('leftButtonStillFires', held && await page.evaluate(() => !fireHeld));
  await page.mouse.down({ button: 'right' }); await sleep(60); const ads = await page.evaluate(() => adsHeld); await page.mouse.up({ button: 'right' }); await sleep(60); ck('rightButtonStillAims', ads && await page.evaluate(() => !adsHeld));
  await page.evaluate(() => { openSet(); setTab = 'controls'; renderSet(); }); const row = a => page.evaluate(a => { const b = $('setb').querySelector('button[data-b="' + a + '"]'); b.scrollIntoView({ block: 'center' }); b.dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true, cancelable: true })); b.dispatchEvent(new MouseEvent('mouseup', { button: 0, bubbles: true })); b.click(); }, a);
  await row('jump'); await mb('mousedown', 3); await mb('mouseup', 3);
  await row('melee'); await page.mouse.down({ button: 'middle' }); await page.mouse.up({ button: 'middle' });
  ck('sideAndMiddleButtonsBind', await page.evaluate(() => S.binds.jump === 'Mouse3' && S.binds.melee === 'Mouse1' && /Mouse 4/.test($('setb').querySelector('button[data-b="jump"]').textContent) && /MMB/.test($('setb').querySelector('button[data-b="melee"]').textContent)));
  await row('reload'); await row('grenade');   // a left click on ANOTHER row must not bind the left button
  ck('leftClickElsewhereDoesNotBind', await page.evaluate(() => S.binds.reload === 'KeyR' && rebinding === 'grenade')); await page.keyboard.press('Escape');
  await row('fire'); await page.keyboard.press('KeyK'); ck('fireOnAKey', await page.evaluate(() => S.binds.fire === 'KeyK'));
  await page.evaluate(() => closeSet()); await sleep(200);
  await mb('mousedown', 3); await sleep(80); const jmp = await page.evaluate(() => dn('jump')); await mb('mouseup', 3); await sleep(80); ck('sideButtonJumps', jmp && await page.evaluate(() => !dn('jump')));
  await page.keyboard.down('KeyK'); await sleep(60); const kf = await page.evaluate(() => fireHeld); await page.keyboard.up('KeyK'); await page.mouse.down(); await sleep(60); const lf = await page.evaluate(() => fireHeld); await page.mouse.up();
  ck('keyFiresAndLeftNoLonger', kf && !lf);
  await page.evaluate(() => { S.binds.fire = 'Mouse0'; S.binds.jump = 'Space'; S.binds.melee = 'KeyV'; saveS(); }); await sleep(1500);
  // ---- last stand
  await page.evaluate(() => { window.LG = []; const o = onSnap; onSnap = buf => { const x = me.x, z = me.z; o(buf); if (me.down && !me.alive) LG.push(Math.hypot(me.x - x, me.z - z)); }; me.yaw = -Math.PI / 2; me.pitch = 0; sendJ({ t: 'dmg', n: 110 }); });
  await page.waitForFunction(() => me.down === true && me.alive === false && me.psAmmo === 6, null, { timeout: 5000 }).catch(() => {}); await sleep(400);
  ck('revolverOut', await page.evaluate(() => { const g = $('gun'), d = g.getContext('2d').getImageData(0, 0, 360, 240).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 200) n++; return me.down && gIdx === 'ps0' && n > 1500 && getComputedStyle(g).display !== 'none' && /REVOLVER 6 \/ 6/.test($('dn').textContent); }));
  const x0 = await page.evaluate(() => me.x); await page.keyboard.down('KeyW'); await sleep(2500); await page.keyboard.up('KeyW'); await sleep(400);
  const cr = await page.evaluate(x0 => ({ moved: +(me.x - x0).toFixed(2), eye: +me.eye.toFixed(2), maxCorr: +(Math.max(0, ...LG) * 100).toFixed(1) }), x0); R.crawl = cr; ck('crawlsSmoothly', cr.moved > 1 && cr.moved < 2.1 && cr.eye < .6 && cr.maxCorr < 6);
  await page.mouse.down(); await sleep(900); await page.mouse.up(); await page.waitForFunction(() => me.psAmmo === 5, null, { timeout: 3000 }).catch(() => {}); await sleep(300);
  ck('oneShotPerClick', await page.evaluate(() => me.psAmmo === 5 && /REVOLVER 5 \/ 6/.test($('dn').textContent)));
  await page.evaluate(() => sendJ({ t: 'act', a: 'reload' })); await page.waitForFunction(() => me.psRel === true, null, { timeout: 2000 }).catch(() => {}); await sleep(200);
  ck('reloadShown', await page.evaluate(() => me.psRel && gIdx === 'ps1' && /REVOLVER reloading/.test($('dn').textContent)));
  ck('noErrors', !errors.length); R.errors = errors.slice(0, 3);
  console.log(JSON.stringify(R)); const bad = Object.keys(R).filter(k => R[k] === false); console.log(bad.length ? 'FAILED: ' + bad.join(', ') : 'ALL ' + Object.keys(R).filter(k => typeof R[k] === 'boolean').length + ' CHECKS PASSED');
  await browser.close(); process.exit(bad.length ? 1 : 0);
})().catch(e => { console.log('TEST ERROR', e); process.exit(1); });
