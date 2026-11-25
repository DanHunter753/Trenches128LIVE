'use strict';
// One-command host: starts the game server and a public https tunnel, then prints the link to send your friends.
//   node host.js [--fill 40] [--port 8080]
// Tunnel order: cloudflared (if installed) -> ssh to localhost.run (no install needed on Win10+/Mac/Linux).
const { spawn, spawnSync } = require('child_process'); const os = require('os'), fs = require('fs'), path = require('path'), http = require('http');
const argi = process.argv.indexOf('--port'); const PORT = argi > 0 ? +process.argv[argi + 1] : (+process.env.PORT || 8080);
if (argi < 0) process.argv.push('--port', String(PORT));
if (!process.argv.includes('--trust-proxy')) process.argv.push('--trust-proxy');   // players arrive through the tunnel: tell them apart by its forwarded address
if (!process.env.T128_MAPS && !process.env.T128_TEST) process.env.T128_MAPS = 'random';   // a new map every round (v0.30); --maps classic keeps the original
require('./server.js');

const say = (...a) => console.log(...a);
const banner = (url) => { const l = '─'.repeat(Math.max(url.length + 6, 44)); say('\n' + l + '\n  SEND YOUR FRIENDS THIS LINK (Chrome):\n\n    ' + url + '\n\n  They type a callsign and click Connect.\n  Keep this window open while you play.\n' + l + '\n'); };
const lan = () => { for (const l of Object.values(os.networkInterfaces())) for (const i of l || []) if (i.family === 'IPv4' && !i.internal) return i.address; return null; };
const exists = cmd => { const r = spawnSync(process.platform === 'win32' ? 'where' : 'which', [cmd], { stdio: 'ignore' }); return r.status === 0; };

function openBrowser(url) { try { const [c, a] = process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]] : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]]; spawn(c, a, { stdio: 'ignore', detached: true }).on('error', () => { }).unref(); } catch (e) { } }

let shown = false;
function watch(cmd, args, re, label) {
  const p = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
  let raw = ''; setTimeout(() => { if (!shown) say('\nNo link found yet. Raw tunnel output (look for an https:// address that is NOT admin.localhost.run):\n' + raw); }, 20000);
  const onData = d => { raw += String(d); const m = String(d).match(re); if (m && !shown) { shown = true; banner(m[0].startsWith('http') ? m[0] : 'https://' + m[0]); openBrowser('http://localhost:' + PORT); } };
  p.stdout.on('data', onData); p.stderr.on('data', onData);
  p.on('error', e => say(label + ' failed to start: ' + e.message));
  p.on('exit', code => { if (!shown) say(label + ' exited (' + code + ') before giving a link.'); else say('\nTunnel closed — friends can no longer connect. Restart this script for a new link.'); });
  process.on('exit', () => { try { p.kill(); } catch (e) { } });
  return p;
}
setTimeout(() => {
  const local = path.join(__dirname, process.platform === 'win32' ? 'cloudflared.exe' : 'cloudflared');
  const cf = fs.existsSync(local) ? local : exists('cloudflared') ? 'cloudflared' : null;
  say('\nYou can already play at http://localhost:' + PORT + (lan() ? '  (same network: http://' + lan() + ':' + PORT + ')' : ''));
  if (cf) { say('Opening a public tunnel with cloudflared…'); watch(cf, ['tunnel', '--url', 'http://localhost:' + PORT, '--no-autoupdate'], /https:\/\/[a-z0-9-]+\.trycloudflare\.com/i, 'cloudflared'); }
  else if (exists('ssh')) { say('cloudflared not found — opening a public tunnel with localhost.run (via ssh)…'); watch('ssh', ['-o', 'StrictHostKeyChecking=accept-new', '-o', 'ServerAliveInterval=30', '-R', '80:localhost:' + PORT, 'nokey@localhost.run'], /https:\/\/(?!admin\.|docs\.|www\.)[a-z0-9-]+\.lhr\.life/i, 'ssh tunnel'); }
  else say('No tunnel tool found. Install cloudflared (Windows: winget install Cloudflare.cloudflared · Mac: brew install cloudflared) and run this again.');
}, 800);

let lastN = -1;
setInterval(() => { http.get({ host: '127.0.0.1', port: PORT, path: '/health' }, r => { let b = ''; r.on('data', d => b += d); r.on('end', () => { try { const h = JSON.parse(b); if (h.humans !== lastN) { lastN = h.humans; say(new Date().toLocaleTimeString() + '  players online: ' + h.humans); } } catch (e) { } }); }).on('error', () => { }); }, 5000);
