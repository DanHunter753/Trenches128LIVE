'use strict';
// v0.29.1: the server hosts the Windows launcher's installer and update files (public/launcher/), /download sends the
// newest installer, and nothing else can be fetched through that route.
const { spawn } = require('child_process'), path = require('path'), fs = require('fs'), net = require('net');
const PORT = 8076, sleep = ms => new Promise(r => setTimeout(r, ms)), DIR = path.join(__dirname, '..', 'public', 'launcher');
const made = !fs.existsSync(DIR); if (made) fs.mkdirSync(DIR);
const FILES = { 'latest.yml': 'version: 9.9.9\nfiles:\n  - url: Trench128-Setup-9.9.9.exe\npath: Trench128-Setup-9.9.9.exe\n', 'Trench128-Setup-9.9.9.exe': 'MZ' + 'x'.repeat(5000), 'Trench128-Setup-9.9.9.exe.blockmap': 'bm' };
const ours = Object.keys(FILES).filter(f => !fs.existsSync(path.join(DIR, f))); for (const f of ours) fs.writeFileSync(path.join(DIR, f), FILES[f]);
const cleanup = () => { for (const f of ours) try { fs.unlinkSync(path.join(DIR, f)); } catch (e) { } if (made) try { fs.rmdirSync(DIR); } catch (e) { } };
const srv = spawn(process.execPath, [path.join(__dirname, '..', 'server.js'), '--port', String(PORT), '--fill', '0', '--no-fetch', '--data', fs.mkdtempSync(path.join(require('os').tmpdir(), 't128lf-'))]);
let errs = ''; srv.stderr.on('data', d => errs += d); srv.stdout.on('data', () => { });
const raw = p => new Promise(res => { const s = net.connect(PORT, 'localhost', () => s.write('GET ' + p + ' HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n')); let b = ''; s.on('data', d => b += d); s.on('end', () => res(b.split(' ')[1])); s.on('error', () => res('err')); });
(async () => {
  for (let i = 0; i < 60; i++) { try { if ((await fetch('http://localhost:' + PORT + '/health')).ok) break; } catch (e) { } await sleep(250); }   // up when it answers (slow under load)
  const R = {}, ck = (k, v) => { R[k] = !!v; }, B = 'http://localhost:' + PORT;
  const d = await fetch(B + '/download', { redirect: 'manual' }); ck('downloadRedirects', d.status === 302 && d.headers.get('location') === '/launcher/Trench128-Setup-9.9.9.exe');
  const e = await fetch(B + '/launcher/Trench128-Setup-9.9.9.exe'); const eb = await e.text();
  ck('installerServed', e.status === 200 && eb.length === 5002 && /attachment/.test(e.headers.get('content-disposition')) && e.headers.get('content-type') === 'application/octet-stream');
  const y = await fetch(B + '/launcher/latest.yml'); ck('updateFeedServed', y.status === 200 && /version: 9\.9\.9/.test(await y.text()) && y.headers.get('cache-control') === 'no-cache');
  ck('blockmapServed', (await fetch(B + '/launcher/Trench128-Setup-9.9.9.exe.blockmap')).status === 200);
  const h = await fetch(B + '/launcher/latest.yml', { method: 'HEAD' }); ck('headWorks', h.status === 200);
  ck('postRefused', (await fetch(B + '/launcher/latest.yml', { method: 'POST' })).status === 405);
  const bad = ['/launcher/../server.js', '/launcher/..%2Fserver.js', '/launcher/%2e%2e/server.js', '/launcher/', '/launcher/x/latest.yml', '/launcher/server.js', '/launcher/.latest.yml', '/launcher/..yml'];
  const codes = []; for (const p of bad) codes.push(await raw(p)); ck('nothingElse', codes.every(c => c === '404')); R.codes = codes.join(',');
  ck('gameStillServed', (await fetch(B + '/')).status === 200);
  // with no installer of its own, /download sends players to the published one (T128_LAUNCHER_URL)
  for (const f of ours) try { fs.unlinkSync(path.join(DIR, f)); } catch (e) { }
  const s2 = spawn(process.execPath, [path.join(__dirname, '..', 'server.js'), '--port', String(PORT + 1), '--fill', '0', '--no-fetch', '--launcher-url', 'https://github.com/x/y/releases/latest/download/Trench128-Setup.exe', '--data', fs.mkdtempSync(path.join(require('os').tmpdir(), 't128lf-'))]);
  for (let i = 0; i < 60; i++) { try { if ((await fetch('http://localhost:' + (PORT + 1) + '/health')).ok) break; } catch (e) { } await sleep(250); }
  if (!fs.existsSync(path.join(DIR, 'latest.yml'))) { const r = await fetch('http://localhost:' + (PORT + 1) + '/download', { redirect: 'manual' }); ck('downloadFallsBackToRelease', r.status === 302 && /github\.com\/x\/y\/releases\/latest/.test(r.headers.get('location'))); }
  s2.kill();
  ck('noErrors', !/error/i.test(errs));
  srv.kill(); cleanup(); console.log(JSON.stringify(R)); const f = Object.keys(R).filter(k => R[k] === false); console.log(f.length ? 'FAILED: ' + f.join(', ') : 'ALL ' + (Object.keys(R).length - 1) + ' CHECKS PASSED'); process.exit(f.length ? 1 : 0);
})().catch(e => { console.log('TEST ERROR', e); srv.kill(); cleanup(); process.exit(1); });
