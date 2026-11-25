'use strict';
// Real browser client (THREE stubbed): v0.25 comms — kill feed, TAB scoreboard (sbq → sb), ping wheel pick → server ping marker,
// gas mask overlay + no ADS in a mask, utility HUD label, after-action report, new key binds.
const { chromium } = require('playwright'); const fs = require('fs');
const url = process.argv[2] || 'http://localhost:8099';
const STUB = fs.readFileSync(__dirname + '/browser.js', 'utf8').match(/const STUB = `([\s\S]*?)`;/)[1];
(async () => {
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 760 } }); const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.route('**/three.min.js', r => r.fulfill({ contentType: 'text/javascript', body: STUB }));
  await page.goto(url); await page.waitForSelector('#nm'); const out = {};
  await page.fill('#nm', 'CommsTester'); await page.click('#cn'); await page.waitForSelector('#go'); await page.click('#go');
  await page.waitForFunction(() => me.alive === true, null, { timeout: 8000 }); await page.waitForTimeout(800);
  out.binds = await page.evaluate(() => S.binds.ping === 'KeyY' && S.binds.mask === 'KeyM' && S.binds.heal === 'KeyH');
  out.killFeed = await page.evaluate(() => { onMsg({ t: 'kf', a: 'Sdt. Dubois', at: 0, v: 'CommsTester', vt: 1, w: 'sniper', h: 1, ai: 5, vi: me.id });
    const t = $('kf').textContent; return /Dubois/.test(t) && /CommsTester/.test(t) && $('kf').querySelector('div.me') !== null; });
  // scoreboard: hold TAB → client asks, server answers with both teams
  await page.keyboard.down('Tab'); await page.waitForTimeout(1500);
  out.scoreboard = await page.evaluate(() => { const sb = $('sb'); return document.body.classList.contains('tab') && /CommsTester/.test(sb.textContent) && sb.querySelectorAll('.tm').length === 2 && /CommsTester/.test(sb.querySelector('tr.me')?.textContent || ''); });
  await page.keyboard.up('Tab');
  // ping wheel: open, move the mouse "up" (Need a medic), release → server echoes 'png' to the team
  out.wheel = await page.evaluate(() => new Promise(r => { const got = []; const o = onMsg; window.onMsg = m => { if (m.t === 'png') got.push(m); return o(m); };
    wheelOn = true; wheelV = [0, -80]; wheelDraw(); const shown = $('wheel').style.display !== 'none' && /medic/i.test($('wheel').textContent);
    const k = wheelPick(); wheelOn = false; $('wheel').style.display = 'none'; sendJ({ t: 'act', a: 'ping', k });
    setTimeout(() => r(shown && k === 'medic'), 50); }));
  await page.waitForTimeout(700);
  out.pingMarker = await page.evaluate(() => pingL.length > 0 && pingL.some(q => q.k === 'medic'));
  out.wheelSides = await page.evaluate(() => { wheelV = [80, 0]; const a = wheelPick(); wheelV = [0, 80]; const b = wheelPick(); wheelV = [5, 5]; const c = wheelPick(); return a === 'enemy' && b === 'thanks' && c === null; });
  // gas mask: server toggles, overlay fades in, ADS refused
  await page.evaluate(() => sendJ({ t: 'act', a: 'mask' })); await page.waitForTimeout(2200);
  out.maskOn = await page.evaluate(() => maskOn === true && +getComputedStyle($('maskv')).opacity > .3);
  await page.evaluate(() => { Object.defineProperty(document, 'pointerLockElement', { get: () => document.getElementById('c'), configurable: true }); });
  await page.mouse.move(400, 300); await page.mouse.down({ button: 'right' }); await page.waitForTimeout(500);
  out.noAdsInMask = await page.evaluate(() => adsNow === false && adsT < .05); await page.mouse.up({ button: 'right' });
  out.hudMask = await page.evaluate(() => new Promise(r => { hudT = 0; setTimeout(() => r(/MASK ON/.test(document.body.textContent)), 300); }));
  await page.evaluate(() => sendJ({ t: 'act', a: 'mask' })); await page.waitForTimeout(400);
  out.maskOff = await page.evaluate(() => maskOn === false);
  out.tabHelp = await page.evaluate(() => new Promise(r => { hudT = 0; setTimeout(() => { const t = $('hud').textContent; r(/\[Y\]/.test(t) && /ping/i.test(t) && /\[M\]/.test(t) && /mask/i.test(t)); }, 300); }));
  // after-action report on round end
  out.aar = await page.evaluate(() => { onMsg({ t: 'end', win: me.team, me: [5, 2, 3, 120, 1, 2, 0, 1], rep: { mvp: ['CommsTester', 'Most kills', me.team, '5 kills'],
    cards: [['Sdt. Dubois', 'Sharpshooter', 0, '3 headshots'], ['Gefr. Müller', 'Lifesaver', 1, '4 revives']], squad: ['Alpha', me.team, 300], officers: [['Cpt. X', me.team, 4, 1, 3]], teams: [{ k: 10 }, { k: 8 }] } });
    const t = document.body.textContent; return /AFTER-ACTION REPORT/.test(t) && /Sharpshooter/.test(t) && /Lifesaver/.test(t) && /Best squad/.test(t) && /YOU: 5 kills/.test(t) && /4 call-ins/.test(t); });
  out.errors = errors; console.log(JSON.stringify(out, null, 1));
  const ok = Object.entries(out).every(([k, v]) => k === 'errors' ? !v.length : v === true);
  console.log(ok ? 'COMMS BROWSER OK' : 'COMMS BROWSER FAIL'); await browser.close(); process.exit(ok ? 0 : 1);
})().catch(e => { console.log('TEST ERROR', e.message); process.exit(1); });
