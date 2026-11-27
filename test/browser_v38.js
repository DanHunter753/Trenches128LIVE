'use strict';
// Real browser client (THREE stubbed), v0.38: soldiers are drawn (as plain figures) while the 2.3 MB soldier art is still
// downloading and switch to the art when it arrives; failed pictures retry; the officer's view moves with touch (drag, pinch);
// a building's respawn point is the small radio model; ping chip and scoreboard column; morphine plays the syringe hands;
// the gun can never be left hidden by an item animation; medics get health bars and a bandage hint.
const { chromium } = require('playwright'); const fs = require('fs');
const url = process.argv[2] || 'http://localhost:8099';
const STUB = fs.readFileSync(__dirname + '/browser.js', 'utf8').match(/const STUB = `([\s\S]*?)`;/)[1];
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] }); const R = {}, ck = (k, v) => { R[k] = !!v; }, errors = [];
  const open = async (ctxOpt, hook) => { const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, ...(ctxOpt || {}) }), page = await ctx.newPage(); page.on('pageerror', e => errors.push(e.message)); await page.route('**/three.min.js', r => r.fulfill({ contentType: 'text/javascript', body: STUB })); if (hook) await hook(page); return page; };
  const join = async (page, name, cls) => { await page.goto(url, { waitUntil: 'domcontentloaded' }); await page.fill('#nm', name); await page.click('#cn'); await page.waitForSelector('#go'); await page.click(`.card[data-k="cls"][data-v="${cls}"]`); await page.click('#go'); await page.waitForFunction(() => me.alive === true, null, { timeout: 15000 }); await page.evaluate(() => { S.tut = false; }); };
  // ---- slow / failing art
  let gate = null, fails = 0; const slow = new Promise(r => { gate = r; });
  const a = await open(null, async page => { await page.route('**/assets/soldiers.png*', async r => { await slow; r.continue(); }); await page.route('**/assets/gun_bolt.png*', r => { if (fails++ < 2) return r.abort(); r.continue(); }); });
  await join(a, 'Slowline', 'rifleman'); await sleep(1500);
  ck('figuresWhileArtLoads', await a.evaluate(() => !artReady() && ents.size > 3 && !!FBQ && FBQ.on === 1 && FBQ.n >= 3 && lodN === 0));
  ck('teamMarkersStillShow', await a.evaluate(() => { spotTick(); return sptS.some(m => m.visible); }));
  gate(); await a.waitForFunction(() => artReady(), null, { timeout: 15000 }).catch(() => {}); await sleep(400);
  ck('artTakesOver', await a.evaluate(() => artReady() && FBQ.on === 0 && FBQ.n === 0 && lodN > 0));
  await a.waitForFunction(() => WIMG.bolt.naturalWidth > 0, null, { timeout: 15000 }).catch(() => {}); R.gunFails = fails;
  ck('gunPictureRetried', fails >= 3 && await a.evaluate(() => WIMG.bolt.naturalWidth > 0 && gIdx !== -1));
  // ---- the gun always comes back after an item animation, even one that could not be drawn; and wakes on spawn
  ck('gunNeverLeftHidden', await a.evaluate(() => new Promise(res => { itemPlay([0, 1], .05); setTimeout(() => res(getComputedStyle($('gun')).opacity === '1' && !itemHid && $('item').style.display === 'none'), 500); })));
  ck('gunWakeRestores', await a.evaluate(() => new Promise(res => { gunWake(); setTimeout(() => res(getComputedStyle($('gun')).opacity === '1' && gIdx !== -1), 300); })));
  // ---- ping chip and scoreboard column
  await a.waitForFunction(() => /PING \d+ ms/.test($('net').textContent), null, { timeout: 6000 }).catch(() => {}); await a.waitForFunction(() => /FPS/.test($('net').textContent) && nfFps > 0, null, { timeout: 6000 }).catch(() => {}); ck('pingChip', await a.evaluate(() => /PING \d+ ms · SERVER \d+ ms.* · \d+ FPS/.test($('net').textContent) && getComputedStyle($('net')).display !== 'none'));
  ck('noDataReadout', await a.evaluate(() => { const sv = lastSnapAt; lastSnapAt = performance.now() - 3200; netTick(performance.now()); const t = $('net').textContent; lastSnapAt = sv; return /NO DATA FROM SERVER 3\.\d s/.test(t); }));
  await sleep(2200); ck('pingOnScoreboard', await a.evaluate(() => new Promise(res => { sendJ({ t: 'sbq' }); setTimeout(() => { const me_ = $('sb').querySelector('tr.me'); res(/<th>ping<\/th>/.test($('sb').innerHTML) && !!me_ && /^\d+$/.test(me_.lastElementChild.textContent)); }, 700); })));
  // ---- building respawn point: the radio, not the sandbag ring
  ck('radioModel', await a.evaluate(() => { const n0 = fposts.size; syncPosts([[901, me.team, 5, 120, 1e9, 0, [3.2, 118.4, .4, hAt(3.2, 118.4)]], [902, me.team, 30, 120, 300, 0, 0]]); const r = fposts.get(901), p = fposts.get(902);
    const ok = !!r && !!p && r.rad === true && p.rad === false && r.px === 3.2 && r.pz === 118.4 && r.x === 5 && typeof mkRadio === 'function'; syncPosts([]); return ok && fposts.size === 0; }));
  // ---- morphine: the syringe hands
  const as = await open(); await join(as, 'Stormy', 'assault'); await as.evaluate(() => sendJ({ t: 'act', a: 'ability' })); await as.waitForFunction(() => me.mph === true, null, { timeout: 3000 }).catch(() => {});
  await sleep(120); ck('morphineSyringe', await as.evaluate(() => (itemF === 4 || itemF === 5) && $('item').style.display === 'block')); await sleep(1300); ck('gunBackAfterInjection', await as.evaluate(() => itemF === -1 && getComputedStyle($('gun')).opacity === '1'));
  // ---- medic: bars over hurt teammates, bandage hint for the one in reach
  const md = await open(); await join(md, 'gunnerbrowser', 'medic'); ck('isMedic', await md.evaluate(() => me.cls === 'medic'));
  ck('medicBars', await md.evaluate(() => { const es = [...ents.entries()].filter(([, e]) => e.team === me.team && !e.down).slice(0, 2); if (es.length < 2) return false; const [i1, e1] = es[0], [i2] = es[1];
    me.yaw = 0; e1.sp.position.set(me.x, me.y, me.z - 1.5); onMsg({ t: 'mh', l: [[i1, 30], [i2, 80]] }); e1.b.x = me.x; e1.b.z = me.z - 1.5; e1.b.y = me.y; medTick(); const vis = medN, hint = medHint() || ''; onMsg({ t: 'mhd', id: i1, n: 'Tommy', hp: 70, xp: 8 }); medTick(); return vis === 2 && /bandage this teammate \(30% health\)/.test(hint) && medN === 1 && /Bandaged Tommy/.test($('msg').textContent); }));
  // ---- officer view with touch
  const of = await open({ hasTouch: true }); await of.goto(url); await of.fill('#nm', 'officerbrowser'); await of.click('#cn'); await of.waitForSelector('#go'); await of.click('.card[data-k="cls"][data-v="officer"]'); await of.click('#go');
  await of.waitForFunction(() => me.alive === true && me.officer === true, null, { timeout: 10000 }); await sleep(800);
  const touch = (type, pts) => of.evaluate(([type, pts]) => { const c = $('c'), ts = pts.map((p, i) => new Touch({ identifier: i + 1, target: c, clientX: p[0], clientY: p[1] })); c.dispatchEvent(new TouchEvent(type, { touches: type === 'touchend' ? [] : ts, changedTouches: ts, targetTouches: type === 'touchend' ? [] : ts, bubbles: true, cancelable: true })); }, [type, pts]);
  const cam0 = await of.evaluate(() => [ofx, ofz, ofh, ofyaw]); const g0 = await of.evaluate(() => toGround(500, 400));
  await touch('touchstart', [[500, 400]]); for (let i = 1; i <= 8; i++) await touch('touchmove', [[500 + i * 20, 400 + i * 10]]); const under = await of.evaluate(() => toGround(660, 480)); await touch('touchend', [[660, 480]]);
  const cam1 = await of.evaluate(() => [ofx, ofz, ofh, ofyaw]); R.pan = [cam0, cam1];
  ck('dragPans', Math.hypot(cam1[0] - cam0[0], cam1[1] - cam0[1]) > 8 && Math.hypot(under[0] - g0[0], under[1] - g0[1]) < 6);   // the ground stays under the finger
  await touch('touchstart', [[500, 360], [700, 360]]); for (let i = 1; i <= 6; i++) await touch('touchmove', [[500 - i * 15, 360], [700 + i * 15, 360]]); await touch('touchend', [[410, 360], [790, 360]]);
  const cam2 = await of.evaluate(() => [ofx, ofz, ofh, ofyaw]); ck('pinchZooms', cam2[2] < cam1[2] - 15 && Math.abs(cam2[3] - cam1[3]) < .05);
  await touch('touchstart', [[500, 360], [700, 360]]); for (let i = 1; i <= 6; i++) { const a2 = i * .1; await touch('touchmove', [[600 - Math.cos(a2) * 100, 360 - Math.sin(a2) * 100], [600 + Math.cos(a2) * 100, 360 + Math.sin(a2) * 100]]); } await touch('touchend', [[500, 360], [700, 360]]);
  const cam3 = await of.evaluate(() => [ofx, ofz, ofh, ofyaw]); ck('twistTurns', Math.abs(cam3[3] - cam2[3]) > .4);
  ck('touchHelp', await of.evaluate(() => { S.touch = true; offHtml = ''; renderOff(); return /pinch: zoom/.test($('off').textContent); }));
  ck('noErrors', !errors.length); R.errors = errors.slice(0, 3);
  console.log(JSON.stringify(R)); const bad = Object.keys(R).filter(k => R[k] === false); console.log(bad.length ? 'FAILED: ' + bad.join(', ') : 'ALL ' + Object.keys(R).filter(k => typeof R[k] === 'boolean').length + ' CHECKS PASSED');
  await browser.close(); process.exit(bad.length ? 1 : 0);
})().catch(e => { console.log('TEST ERROR', e); process.exit(1); });
