'use strict';
// The launcher page in a real browser with a stand-in for the Electron bridge: server list, hostile names shown as text,
// selecting and playing, update states, patch notes, settings. Run: node test/ui.browser.js [shot.png]
const { chromium } = require('playwright'); const path = require('path');
const STUB = () => {
  const calls = window.__calls = []; let settings = { callsign: '', lastServer: 'https://b.example.com', favourites: ['https://b.example.com'], recent: [], fullscreen: true, autoJoin: true, closeOnPlay: false, masterUrl: '' };
  const subs = {}; const on = ch => cb => { (subs[ch] = subs[ch] || []).push(cb); return () => { }; };
  window.__emit = (ch, d) => (subs[ch] || []).forEach(f => f(d));
  const servers = [
    { url: 'https://b.example.com', ok: true, ping: 42, fav: true, info: { name: 'Bapaume Front', players: 87, max: 256, bots: 120, version: '0.29.1', region: 'EU' } },
    { url: 'https://evil.example.com', ok: true, ping: 140, info: { name: '<img src=x onerror="window.__pwn=1">Evil', players: 3, max: 256, bots: 0, version: '0.29.1', region: '' } },
    { url: 'http://192.168.1.20:8080', ok: false, err: 'no answer', recent: true, info: null },
  ];
  window.launcher = {
    state: async () => ({ settings, version: '1.0.0', update: { state: 'current' }, gameOpen: false, brand: { site: 'https://example.com', discord: '' } }),
    saveSettings: async p => { calls.push(['save', p]); settings = { ...settings, ...p }; return settings; },
    servers: async () => { calls.push(['servers']); return { servers, err: '', master: '' }; },
    probe: async u => { calls.push(['probe', u]); return u.includes('bad') ? { url: 'https://bad.example.com', ok: false, err: 'unreachable' } : { url: 'https://' + u.replace(/^https?:\/\//, ''), ok: true, ping: 30, info: { name: 'Direct', players: 1, max: 256, bots: 0, version: '0.29.1' } }; },
    news: async () => [{ title: 'v0.29.1 <b>bold</b>', date: '2026-11-25', body: ['line one', '<script>window.__pwn2=1</script>'] }],
    play: async u => { calls.push(['play', u]); return { ok: true }; },
    favourite: async (u, f) => { calls.push(['fav', u, f]); settings = { ...settings, favourites: f ? [u, ...settings.favourites.filter(x => x !== u)] : settings.favourites.filter(x => x !== u) }; return settings; },
    checkUpdate: async () => ({ state: 'checking' }), installUpdate: async () => { calls.push(['install']); return true; },
    open: async u => calls.push(['open', u]), showLogs: async () => calls.push(['logs']),
    onUpdate: on('update'), onGame: on('game'), onError: on('error'),
  };
};
(async () => {
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--allow-file-access-from-files'] });
  const page = await browser.newPage({ viewport: { width: 1040, height: 660 } }); const errors = [];
  page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.addInitScript(STUB); await page.goto('file://' + path.join(__dirname, '..', 'ui', 'index.html')); await page.waitForTimeout(400);
  const R = {}, ck = (k, v) => { R[k] = !!v; };
  ck('rowsShown', await page.$$eval('.srow', r => r.length === 3));
  ck('hostileNameIsText', await page.evaluate(() => !window.__pwn && !document.querySelector('#rows img') && /<img src=x/.test(document.querySelector('[data-url="https://evil.example.com"] .nm').textContent)));
  ck('lastServerSelected', await page.evaluate(() => document.querySelector('.srow.sel') && document.querySelector('.srow.sel').dataset.url === 'https://b.example.com' && document.getElementById('selname').textContent === 'Bapaume Front'));
  ck('offlineMarked', await page.evaluate(() => document.querySelector('[data-url="http://192.168.1.20:8080"]').classList.contains('down')));
  ck('countMsg', /2 of 3 online/.test(await page.textContent('#listmsg')));
  // play needs a callsign first
  await page.click('#play'); ck('needsCallsign', await page.evaluate(() => /callsign/i.test(document.getElementById('toast').textContent) && !window.__calls.some(c => c[0] === 'play')));
  await page.fill('#callsign', 'Pte Atkins'); await page.click('[data-url="https://evil.example.com"]'); await page.click('#play'); await page.waitForTimeout(100);
  ck('playsSelected', await page.evaluate(() => { const s = window.__calls.find(c => c[0] === 'save'), p = window.__calls.find(c => c[0] === 'play'); return s && s[1].callsign === 'Pte Atkins' && p && p[1] === 'https://evil.example.com'; }));
  // direct connect: Enter in the address box probes, then plays
  await page.fill('#addr', 'play.direct.com'); await page.press('#addr', 'Enter'); await page.waitForTimeout(150);
  ck('directJoin', await page.evaluate(() => window.__calls.some(c => c[0] === 'probe' && c[1] === 'play.direct.com') && window.__calls.some(c => c[0] === 'play' && c[1] === 'https://play.direct.com')));
  await page.fill('#addr', 'bad.example.com'); await page.click('#join'); await page.waitForTimeout(100);
  ck('directBadShowsError', await page.evaluate(() => /unreachable/.test(document.getElementById('toast').textContent) && document.getElementById('toast').classList.contains('err')));
  // favourite star toggles
  await page.click('[data-url="https://evil.example.com"] .star'); ck('favourite', await page.evaluate(() => window.__calls.some(c => c[0] === 'fav' && c[1] === 'https://evil.example.com' && c[2] === true) && document.querySelector('[data-url="https://evil.example.com"] .star').textContent === '★'));
  // game window open/closed
  await page.evaluate(() => window.__emit('t128:game'.replace('t128:', ''), { open: true }));
  await page.evaluate(() => window.__emit('game', { open: true })); ck('inGame', await page.evaluate(() => document.getElementById('play').disabled && document.getElementById('play').textContent === 'IN GAME'));
  await page.evaluate(() => window.__emit('game', { open: false })); await page.waitForTimeout(100); ck('backFromGame', await page.evaluate(() => !document.getElementById('play').disabled));
  // updates
  await page.evaluate(() => window.__emit('update', { state: 'downloading', version: '1.0.1', pct: 40 }));
  ck('updateProgress', await page.evaluate(() => !document.getElementById('prog').hidden && document.getElementById('progbar').style.width === '40%' && /1\.0\.1/.test(document.getElementById('updtext').textContent)));
  await page.evaluate(() => window.__emit('update', { state: 'ready', version: '1.0.1' })); await page.click('#restart'); ck('restartInstalls', await page.evaluate(() => window.__calls.some(c => c[0] === 'install')));
  await page.evaluate(() => window.__emit('update', { state: 'error', msg: 'x<b>y</b>' })); ck('updateErrorText', await page.evaluate(() => !document.querySelector('#updtext b')));
  await page.evaluate(() => window.__emit('error', 'Could not open https://x (ERR_NAME_NOT_RESOLVED)')); ck('gameErrorToast', /ERR_NAME/.test(await page.textContent('#toast')));
  if (process.argv[2]) { await page.evaluate(() => window.__emit('update', { state: 'current' })); await page.evaluate(() => { document.getElementById('toast').className = ''; }); await page.click('[data-url="https://b.example.com"]'); await page.waitForTimeout(300); await page.screenshot({ path: process.argv[2] }); }
  // patch notes as text
  await page.click('[data-tab="news"]'); await page.waitForTimeout(100);
  ck('newsText', await page.evaluate(() => document.querySelectorAll('#news li').length === 2 && !window.__pwn2 && !document.querySelector('#news b') && /<b>bold<\/b>/.test(document.querySelector('#news h3').textContent)));
  // settings
  await page.click('[data-tab="settings"]'); await page.click('#s-fullscreen'); await page.waitForTimeout(50);
  ck('settingSaved', await page.evaluate(() => window.__calls.some(c => c[0] === 'save' && c[1].fullscreen === false)));
  await page.click('#site'); ck('siteLink', await page.evaluate(() => window.__calls.some(c => c[0] === 'open' && c[1] === 'https://example.com')));
  ck('noErrors', errors.length === 0); if (errors.length) console.log(errors);
  console.log(JSON.stringify(R)); const bad = Object.keys(R).filter(k => !R[k]); console.log(bad.length ? 'FAILED: ' + bad.join(', ') : 'ALL ' + Object.keys(R).length + ' CHECKS PASSED');
  await browser.close(); process.exit(bad.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
