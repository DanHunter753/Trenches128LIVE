'use strict';
// Robustness test (v0.28 audit): a server in a child process gets thousands of hostile or malformed messages from several
// clients (wrong types, prototype keys, NaN / huge numbers, bad JSON, oversized and fragmented frames, every message and
// action type) and must stay up with no errors logged.
const { spawn } = require('child_process'), path = require('path'), net = require('net'), crypto = require('crypto');
const PORT = 8079, sleep = ms => new Promise(r => setTimeout(r, ms));
const fs = require('fs'), DIR = fs.mkdtempSync(path.join(require('os').tmpdir(), 't128fz-')); fs.writeFileSync(path.join(DIR, 'xp.json'), JSON.stringify({ fuzz1: 5000 }));   // Fuzz1 can be an officer
const srv = spawn(process.execPath, [path.join(__dirname, '..', 'server.js'), '--port', String(PORT), '--fill', '6', '--no-fetch', '--data', DIR], { env: { ...process.env, T128_TEST: process.env.FUZZ_TESTMODE ? '1' : '' } });
let errs = ''; srv.stderr.on('data', d => errs += d); srv.stdout.on('data', () => { });
const KEYS = ['constructor', '__proto__', 'toString', 'hasOwnProperty', 'valueOf', '', 'x'.repeat(5000), null, 1e308, -1, NaN];
const VALS = [null, undefined, true, 1e308, -1e308, NaN, -0, '', 'x', 'constructor', [], [1, 2], {}, { __proto__: { a: 1 } }, '1e999', 9007199254740993, Infinity];
const pick = a => a[(Math.random() * a.length) | 0];
const ACTS = ['reload', 'grenade', 'melee', 'mark', 'ping', 'mask', 'fob', 'build', 'fspawn', 'spawnAt', 'mg', 'heal', 'dig', 'postToggle', 'giveup', 'revive', 'work', 'constructor', '__proto__'];
function junk() {
  const r = Math.random(), t = pick(['hello', 'join', 'loadout', 'in', 'act', 'cmd', 'sbq', 'ping', 'tp', 'dmg', 'tk', 'wxs', 'chat', 'chat', 'tround', 'constructor', '__proto__', null, 7]);
  if (r < .05) return '{bad json'; if (r < .08) return JSON.stringify(pick(VALS)); if (r < .1) return JSON.stringify([1, 2, 3]);
  const m = { t };
  if (t === 'in') m.c = Math.random() < .3 ? pick(VALS) : Array.from({ length: (Math.random() * 25) | 0 }, () => Array.from({ length: 7 }, () => pick(VALS.concat([1, 0, -1, .5, 33]))));
  if (t === 'act') { m.a = pick(ACTS); m.k = pick(KEYS); m.id = pick(VALS); }
  if (t === 'cmd') { m.k = pick(['order', 'sup', null]); m.s = pick(['barrage', 'tank', 'star', 'constructor', '__proto__', null]); m.ty = pick(['attack', 'clear', 'constructor']); m.sq = pick(VALS); m.x = pick(VALS); m.z = pick(VALS); m.sqs = pick([[1, 2, 'x'], null, 'x', Array(5000).fill(1)]); m.q = pick(VALS); m.yaw = pick(VALS); }
  if (t === 'join' || t === 'loadout') { m.cls = pick(['officer', 'medic', 'constructor', '__proto__', null, 5]); m.w = pick(KEYS); m.u = pick(KEYS.concat(['flare'])); m.sq = pick(VALS); }
  if (t === 'hello') { m.name = pick(['FuzzA', 'constructor', '<b>x</b>', 'x'.repeat(100), null, 5]); m.token = pick(VALS); m.team = pick(VALS); m.rj = pick(VALS.concat(['a'.repeat(24), '__proto__'])); }
  if (t === 'chat') { m.m = pick(['hi', '<script>x</script>', 'x'.repeat(5000), '\u202e\u0000ok', null, 5, {}, [1]]); m.team = pick(VALS); m.tm = pick(VALS); }
  if (t === 'tp' || t === 'dmg') { m.x = pick(VALS); m.z = pick(VALS); m.n = pick(VALS); }
  return JSON.stringify(m);
}
function client(i) {
  return new Promise(res => {
    const ws = new WebSocket('ws://localhost:' + PORT); ws.binaryType = 'arraybuffer'; let joined = false;
    ws.onopen = () => ws.send(JSON.stringify({ t: 'hello', name: 'Fuzz' + i }));
    ws.onmessage = ev => { if (typeof ev.data !== 'string') return; const m = JSON.parse(ev.data); if (m.t === 'prof' && !joined) { joined = true; ws.send(JSON.stringify({ t: 'join', cls: i === 1 ? 'officer' : i === 2 ? 'sapper' : 'rifleman', w: 'bolt', u: 'flare', sq: 0 })); } if (m.t === 'w') res(ws); };
    ws.onerror = () => res(null); setTimeout(() => res(ws), 3000);
  });
}
function rawFrames() {   // hand-made frames: oversized length, unmasked, endless fragments
  return new Promise(res => { const s = net.connect(PORT, 'localhost', () => {
    s.write('GET / HTTP/1.1\r\nHost: x\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: ' + crypto.randomBytes(16).toString('base64') + '\r\nSec-WebSocket-Version: 13\r\n\r\n');
    const mask = Buffer.from([1, 2, 3, 4]), frag = (op, fin, n) => { const h = Buffer.from([(fin ? 128 : 0) | op, 128 | 126, n >> 8, n & 255]); return Buffer.concat([h, mask, Buffer.alloc(n, 120)]); };
    setTimeout(() => { s.write(frag(1, false, 60000)); for (let i = 0; i < 5; i++) s.write(frag(0, false, 60000)); s.write(Buffer.from([0x81, 127, 0, 0, 0, 1, 0, 0, 0, 0])); }, 200);
    setTimeout(() => { s.destroy(); res(); }, 1200); }); s.on('error', () => res()); });
}
(async () => {
  await sleep(1500); const R = {};
  const cs = (await Promise.all([1, 2, 3, 4].map(client))).filter(Boolean);
  for (let round = 0; round < 40; round++) { for (const ws of cs) if (ws.readyState === 1) for (let k = 0; k < 40; k++) ws.send(junk()); await sleep(60); }
  await rawFrames();
  for (let i = 0; i < 20; i++) { const r = await fetch('http://localhost:' + PORT + pick(['/api/login', '/api/register', '/announce', '/servers', '/api/me?token=x', '/health', '/../server.js', '/assets/../xp.json', '/%00']), { method: Math.random() < .5 ? 'POST' : 'GET', body: Math.random() < .5 ? '{"name":{"a":1},"pass":[1]}' : undefined }).catch(() => null); }
  await sleep(800);
  let h = null; try { h = await (await fetch('http://localhost:' + PORT + '/health')).json(); } catch (e) { }
  R.serverAlive = !!(h && h.t128); R.noErrorsLogged = !/error|uncaught|unhandled/i.test(errs);
  console.log(JSON.stringify(R)); const u = [...new Set(errs.split("\n").filter(l => /Error|error/.test(l) || /at .*server|at .*vehicles|at .*shared/.test(l)))]; console.log(u.slice(0, 30).join("\n")); srv.kill();
  const bad = Object.keys(R).filter(k => !R[k]); console.log(bad.length ? 'FAILED: ' + bad.join(', ') : 'ALL ' + Object.keys(R).length + ' CHECKS PASSED'); process.exit(bad.length ? 1 : 0);
})().catch(e => { console.log('TEST ERROR', e); srv.kill(); process.exit(1); });
