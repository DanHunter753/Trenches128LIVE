'use strict';
// Real browser, v0.36: a machine gunner drops an ammo box (drawn for his side, with its hint), an assault man injects
// morphine (screen tint, HUD timer, faster predicted movement), and the [N] key is bound and rebindable.
const { chromium } = require('playwright'); const fs = require('fs');
const url = process.argv[2] || 'http://localhost:8099';
const STUB = fs.readFileSync(__dirname + '/browser.js', 'utf8').match(/const STUB = `([\s\S]*?)`;/)[1];
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] }); const R = {}, ck = (k, v) => { R[k] = !!v; }, errors = [];
  const join = async (name, cls) => { const page = await browser.newPage({ viewport: { width: 1280, height: 720 } }); page.on('pageerror', e => errors.push(e.message)); await page.route('**/three.min.js', r => r.fulfill({ contentType: 'text/javascript', body: STUB }));
    await page.goto(url); await page.fill('#nm', name); await page.click('#cn'); await page.waitForSelector('#go'); await page.click(`.card[data-k="cls"][data-v="${cls}"]`); await page.click('#go');
    await page.waitForFunction(() => me.alive === true, null, { timeout: 15000 }); await page.evaluate(() => { S.tut = false; }); return page; };
  const g = await join('gunnerbrowser', 'gunner');
  ck('keyBound', await g.evaluate(() => S.binds.ability === 'KeyN' && !!KLAB.ability));
  ck('isGunner', await g.evaluate(() => me.cls === 'gunner')); await g.evaluate(() => sendJ({ t: 'act', a: 'ability' }));
  await g.waitForFunction(() => !!aboxNear(), null, { timeout: 4000 }).catch(() => {}); ck('boxDrawn', await g.evaluate(() => { const q = aboxNear(); return !!q && Math.hypot(q.x - me.x, q.z - me.z) < 1.5; }));
  ck('boxHint', await g.evaluate(() => new Promise(r => { hudT = 0; setTimeout(() => r(/Ammo box: walk over it/.test($('hint').textContent)), 300); })));
  const a = await join('Stormy', 'assault');
  const s0 = await a.evaluate(() => T.spOf(me)); await a.evaluate(() => sendJ({ t: 'act', a: 'ability' }));
  await a.waitForFunction(() => me.mph === true, null, { timeout: 3000 }).catch(() => {});
  ck('morphineOn', await a.evaluate(s0 => me.mph && me.mphN === 1 && Math.abs(T.spOf(me) / s0 - 1.2) < 1e-6, s0));
  await sleep(400); ck('morphineHud', await a.evaluate(() => /MORPHINE \d+s/.test(document.querySelector('#hb .it') ? document.querySelector('#hb .it').textContent : $('hud').textContent) && +$('mphv').style.opacity > .1));
  // slide with the real keys: sprint forward, tap crouch down; letting go of crouch (standing up) cancels it
  await a.evaluate(() => { me.yaw = -Math.PI / 2; me.pitch = 0; sendJ({ t: 'tp', x: 0, z: me.team ? -125 : 125 }); }); await sleep(900);
  await a.keyboard.down('ShiftLeft'); await a.keyboard.down('KeyW'); await sleep(700); await a.keyboard.down('KeyC');
  await a.waitForFunction(() => me.sld > 0, null, { timeout: 1500 }).catch(() => {}); ck('slides', await a.evaluate(() => me.sld > 0 && me.eye < 1.6));
  await sleep(150); await a.keyboard.up('KeyC'); await sleep(120); ck('standCancels', await a.evaluate(() => !(me.sld > 0)));
  await a.keyboard.up('KeyW'); await a.keyboard.up('ShiftLeft'); await sleep(800);
  ck('serverAgrees', await a.evaluate(() => pending.length < 30 && Math.abs(me.vy) < 3));
  ck('noErrors', !errors.length); R.errors = errors.slice(0, 3);
  console.log(JSON.stringify(R)); const bad = Object.keys(R).filter(k => R[k] === false); console.log(bad.length ? 'FAILED: ' + bad.join(', ') : 'ALL ' + Object.keys(R).filter(k => typeof R[k] === 'boolean').length + ' CHECKS PASSED');
  await browser.close(); process.exit(bad.length ? 1 : 0);
})().catch(e => { console.log('TEST ERROR', e); process.exit(1); });
