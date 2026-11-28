'use strict';
// In-process test (v0.27 running it for real): accounts (register, login, wrong password, rate limit, sessions, protected
// callsigns, XP saved to the account), required-account servers, the server list (a second server announces itself and is
// listed after its /health is checked; bad announcements are refused), /health, page-origin allow-list, connections per address.
const fs = require('fs'), path = require('path'), os = require('os'), { spawn } = require('child_process');
const DA = fs.mkdtempSync(path.join(os.tmpdir(), 't128a-')), DB = fs.mkdtempSync(path.join(os.tmpdir(), 't128b-'));
process.argv = ['node', 'x', '--port', '8083', '--fill', '4', '--registry', '--public', 'http://localhost:8083', '--name', 'Test Front', '--data', DA, '--origins', 'http://good.example', '--accounts', 'optional', '--list-private'];
const S = require('../server.js');
const sleep = ms => new Promise(r => setTimeout(r, ms)); const R = {}; const ck = (k, v) => { R[k] = !!v; };
const B = spawn(process.execPath, [path.join(__dirname, '..', 'server.js'), '--port', '8084', '--fill', '2', '--public', 'http://localhost:8084', '--master', 'http://localhost:8083', '--name', 'Second Line', '--data', DB, '--accounts', 'required', '--no-fetch'], { stdio: 'ignore', env: { ...process.env, T128_TEST: '' } });
const post = (port, u, o, hdr) => fetch('http://localhost:' + port + u, { method: 'POST', headers: { 'content-type': 'application/json', ...(hdr || {}) }, body: JSON.stringify(o) }).then(async r => ({ s: r.status, j: await r.json().catch(() => ({})) }));
const hello = (port, msg) => new Promise(res => { const ws = new WebSocket('ws://localhost:' + port); const got = []; ws.onopen = () => ws.send(JSON.stringify(msg)); ws.onmessage = ev => { if (typeof ev.data === 'string') { got.push(JSON.parse(ev.data)); if (got.length === 1) res({ ws, m: got[0], got }); } }; ws.onerror = () => res({ ws, m: null, got }); setTimeout(() => res({ ws, m: got[0] || null, got }), 3000); });
(async () => {
  await sleep(800); const X = S._test;
  const r1 = await post(8083, '/api/register', { name: 'Rook_1', pass: 'longenough1' });
  ck('register', r1.s === 200 && /^[0-9a-f]{48}$/.test(r1.j.token) && r1.j.name === 'Rook_1');
  ck('duplicateName', (await post(8083, '/api/register', { name: 'rook_1', pass: 'longenough2' })).s === 400);
  ck('shortPassword', (await post(8083, '/api/register', { name: 'Rook_2', pass: 'short' })).s === 400);
  ck('badName', (await post(8083, '/api/register', { name: 'a', pass: 'longenough1' })).s === 400 && (await post(8083, '/api/register', { name: 'admin', pass: 'longenough1' })).s === 400);
  ck('wrongPassword', (await post(8083, '/api/login', { name: 'Rook_1', pass: 'nope-nope' })).s === 401);
  const r2 = await post(8083, '/api/login', { name: 'ROOK_1', pass: 'longenough1' }); ck('login', r2.s === 200 && r2.j.name === 'Rook_1' && r2.j.token !== r1.j.token);
  { const r = await fetch('http://localhost:8083/api/me?token=' + r2.j.token); const j = await r.json(); ck('me', r.status === 200 && j.name === 'Rook_1'); }
  { const a = await hello(8083, { t: 'hello', name: 'whatever', token: r2.j.token }); ck('helloWithToken', a.m && a.m.t === 'prof' && a.m.acct === 1 && a.m.name === 'Rook_1');
    const e = [...X.humans].find(h => h.name === 'Rook_1');
    const xp0 = e.acct.xp; X.ACC.addXp(e.acct, 25); X.ACC.flush(); const db = JSON.parse(fs.readFileSync(path.join(DA, 'accounts.json'), 'utf8'));
    ck('xpSavedToAccount', db.users.rook_1.xp === xp0 + 25 && !/longenough/.test(JSON.stringify(db)));
    const b = await hello(8083, { t: 'hello', name: 'Rook_1' }); ck('protectedCallsign', b.m && b.m.t === 'err' && /belongs to an account/.test(b.m.m));
    const c = await hello(8083, { t: 'hello', name: 'x', token: r2.j.token }); await sleep(300); ck('noDoubleLogin', c.m && c.m.t === 'prof' && [...X.humans].filter(h => h.name === 'Rook_1').length === 1);   // v0.48: a second login takes over the first (rejoin after a drop) instead of being refused
    const g = await hello(8083, { t: 'hello', name: 'GuestGus' }); ck('guestAllowed', g.m && g.m.t === 'prof' && g.m.acct === 0);
    for (const s of [a, b, c, g]) s.ws.close(); }
  { let last = 0; for (let i = 0; i < 9; i++) last = (await post(8083, '/api/login', { name: 'Rook_1', pass: 'wrong-' + i })).s; const r = await post(8083, '/api/login', { name: 'Rook_1', pass: 'longenough1' });
    ck('loginRateLimited', r.s === 401 && /Too many/.test(r.j.err)); }
  { const h = await (await fetch('http://localhost:8083/health')).json(); ck('health', h.t128 === 1 && h.name === 'Test Front' && typeof h.version === 'string' && h.accounts === 'optional'); }
  { const r = await post(8083, '/api/login', { name: 'x', pass: 'y' }, { origin: 'http://evil.example' }); ck('originBlocked', r.s === 403); const r2b = await fetch('http://localhost:8083/health', { headers: { origin: 'http://good.example' } }); ck('originAllowed', r2b.headers.get('access-control-allow-origin') === 'http://good.example'); }
  // server list: B announces itself a few seconds after starting
  let L = []; for (let i = 0; i < 30; i++) { await sleep(500); L = (await (await fetch('http://localhost:8083/servers')).json()).servers; if (L.some(q => q.url === 'http://localhost:8084')) break; }
  const sb = L.find(q => q.url === 'http://localhost:8084');
  ck('serverListed', L[0] && L[0].name === 'Test Front' && sb && sb.name === 'Second Line' && sb.accounts === 'required' && sb.max > 0);
  ck('badAnnounceUrl', (await post(8083, '/announce', { url: 'javascript:alert(1)' })).s === 400);
  ck('notAGameServer', (await post(8083, '/announce', { url: 'http://localhost:9' })).s === 400);
  { const g = await hello(8084, { t: 'hello', name: 'GuestGus' }); ck('requiredAccounts', g.m && g.m.t === 'err' && /needs an account/.test(g.m.m)); g.ws.close(); }
  { const socks = []; for (let i = 0; i < 9; i++) socks.push(await hello(8083, { t: 'ping', c: 1 }).catch(() => null)); await sleep(300);
    const open = socks.filter(q => q && q.ws.readyState === 1).length; ck('perAddressCap', open <= 8 && open >= 7); for (const q of socks) if (q) q.ws.close(); }
  console.log(JSON.stringify(R, null, 1)); B.kill();
  const bad = Object.keys(R).filter(k => !R[k]); console.log(bad.length ? 'FAILED: ' + bad.join(', ') : 'ALL ' + Object.keys(R).length + ' CHECKS PASSED'); process.exit(bad.length ? 1 : 0);
})().catch(e => { console.log('TEST ERROR', e); B.kill(); process.exit(1); });
