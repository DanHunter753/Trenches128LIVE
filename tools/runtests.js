'use strict';
// One-command test runner: `npm test` (server tests only) or `npm run test:all` (adds the real-browser tests).
// Your own xp.json / accounts.json in the game folder are backed up first and put back afterwards.
// Browser tests need Playwright and Google Chrome (developer machines only — players and hosts never need them).
const { spawn, spawnSync } = require('child_process'); const fs = require('fs'); const path = require('path'); const os = require('os');
const ROOT = path.join(__dirname, '..'), T = f => path.join(ROOT, 'test', f);
const withBrowser = process.argv.includes('--browser'), only = process.argv.find(a => a.startsWith('--only='));
const pick = n => !only || only.slice(7).split(',').some(s => n.includes(s));
const sleep = ms => new Promise(r => setTimeout(r, ms));

// Server tests: each starts its own server in-process on its own port.
const UNIT = ['snapdec', 'trench', 'climb', 'dugouts', 'destruct', 'net', 'round', 'limits', 'posts', 'forts', 'revive', 'officer', 'ops', 'gunplay',
  'ai', 'command', 'rts', 'recon', 'comms', 'vehicles', 'bots27', 'live', 'tanktrench', 'v29', 'fuzz', 'launcherfiles', 'maps', 'wrecks', 'mud', 'phones', 'tunnels', 'planes', 'spawnmap', 'structs', 'movebank', 'flying', 'spacing', 'botjobs', 'lights', 'classes'];
// Browser tests: run against a fresh T128_TEST server on :8099 with a seeded xp.json (ranks the tests need).
const SEED = { offtester: 800, officerbrowser: 800, leaderbrowser: 150, settester: 900, camtester: 800, cmdbrowser: 800, reconbrowser: 150, rtsbrowser: 800, gunnerbrowser: 150 };
const BROWSER = [['browser'], ['browser_ads'], ['browser_audio'], ['browser_climb'], ['browser_command'], ['browser_comms'], ['browser_forts'], ['browser_gunplay'],
  ['browser_officer'], ['browser_officer_cam'], ['browser_officer_esc'], ['browser_ops'], ['browser_polish'], ['browser_recon'], ['browser_revive'], ['browser_rts'],
  ['browser_settings'], ['browser_v16'], ['browser_v26', { env: { T128_WX: 'night' } }],
  ['browser_v27', { args: ['--registry', '--public', 'http://localhost:8099', '--name', 'BTest'] }],
  ['browser_v29'],
  ['browser_tutorial'], ['browser_plane'], ['browser_tclayout'], ['browser_touchdown'], ['browser_marks'], ['browser_orders'], ['browser_record'], ['browser_respawn'], ['browser_classes'], ['browser_maps', { targs: ['--own-server'] }],
  ['browser_touch'],
  ['browser_soak', { env: { T128_WX: 'night' }, args: ['--fill', '40'], targs: ['http://localhost:8099', '90'] }]];

function run(file, args = [], env = {}, ms = 600000) {
  const t0 = Date.now(); const r = spawnSync(process.execPath, [file, ...args], { cwd: ROOT, env: { ...process.env, ...env }, encoding: 'utf8', timeout: ms, maxBuffer: 64 << 20 });
  return { ok: r.status === 0, secs: ((Date.now() - t0) / 1000).toFixed(1), out: (r.stdout || '') + (r.stderr || '') };
}
async function waitUp(port) { for (let i = 0; i < 60; i++) { try { const r = await fetch('http://localhost:' + port + '/health'); if (r.ok) return true; } catch (e) { } await sleep(250); } return false; }

(async () => {
  const keep = {}; for (const f of ['xp.json', 'accounts.json']) { const p = path.join(ROOT, f); if (fs.existsSync(p)) { keep[f] = fs.readFileSync(p); } }
  const restore = () => { for (const f of ['xp.json', 'accounts.json']) { const p = path.join(ROOT, f); if (keep[f]) fs.writeFileSync(p, keep[f]); else try { fs.unlinkSync(p); } catch (e) { } } };
  process.on('SIGINT', () => { restore(); process.exit(130); });
  const res = [];
  for (const n of UNIT.filter(pick)) {
    try { fs.unlinkSync(path.join(ROOT, 'xp.json')); } catch (e) { }
    const r = run(T(n + '.js')); res.push([n, r]); console.log((r.ok ? 'PASS ' : 'FAIL ') + n.padEnd(22) + r.secs + 's'); if (!r.ok) console.log(r.out.split('\n').slice(-25).join('\n'));
  }
  // network tests: real WebSocket clients against a separate T128_TEST server process on :8078
  for (const [n, targs] of [['bots', ['ws://localhost:8078', '8', '20']], ['mg', ['ws://localhost:8078']]].filter(b => pick(b[0]))) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 't128-')); const srv = spawn(process.execPath, ['server.js', '--port', '8078', '--no-fetch', '--data', dir], { cwd: ROOT, env: { ...process.env, T128_TEST: '1' }, stdio: 'ignore' });
    let r; if (!(await waitUp(8078))) r = { ok: false, secs: '0', out: 'server did not start' }; else r = await new Promise(ok => { const t0 = Date.now(); const c = spawn(process.execPath, [T(n + '.js'), ...targs], { cwd: ROOT }); let out = ''; c.stdout.on('data', d => out += d); c.stderr.on('data', d => out += d); c.on('exit', code => ok({ ok: code === 0 && !/"err": \[\s*"/.test(out), secs: ((Date.now() - t0) / 1000).toFixed(1), out })); });
    srv.kill('SIGTERM'); await new Promise(ok => { srv.on('exit', ok); setTimeout(ok, 3000); }); fs.rmSync(dir, { recursive: true, force: true });
    res.push([n, r]); console.log((r.ok ? 'PASS ' : 'FAIL ') + n.padEnd(22) + r.secs + 's'); if (!r.ok) console.log(r.out.split('\n').slice(-25).join('\n'));
  }
  if (withBrowser) {
    let pw = true; try { require.resolve('playwright'); } catch (e) { pw = false; }
    if (!pw) console.log('SKIP browser tests: Playwright is not installed (npm i -g playwright, then run with NODE_PATH=$(npm root -g)).');
    else for (const [n, o = {}] of BROWSER.filter(b => pick(b[0]))) {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 't128-')); fs.writeFileSync(path.join(dir, 'xp.json'), JSON.stringify(SEED));
      const srv = spawn(process.execPath, ['server.js', '--port', '8099', '--no-fetch', '--data', dir, ...(o.args || [])], { cwd: ROOT, env: { ...process.env, T128_TEST: '1', ...(o.env || {}) }, stdio: ['ignore', 'pipe', 'pipe'] });
      let log = ''; srv.stdout.on('data', d => log += d); srv.stderr.on('data', d => log += d);
      let r; if (!(await waitUp(8099))) r = { ok: false, secs: '0', out: 'server did not start\n' + log };
      else r = await new Promise(ok => { const t0 = Date.now(); const c = spawn(process.execPath, [T(n + '.js'), ...(o.targs || [])], { cwd: ROOT }); let out = ''; c.stdout.on('data', d => out += d); c.stderr.on('data', d => out += d);
        const k = setTimeout(() => c.kill('SIGKILL'), 400000); c.on('exit', code => { clearTimeout(k); ok({ ok: code === 0, secs: ((Date.now() - t0) / 1000).toFixed(1), out }); }); });
      srv.kill('SIGTERM'); await new Promise(ok => { srv.on('exit', ok); setTimeout(ok, 3000); });
      if (/Error|uncaught/i.test(log) && /TypeError|ReferenceError|RangeError/.test(log)) { r.ok = false; r.out += '\nSERVER LOG:\n' + log.slice(-3000); }
      fs.rmSync(dir, { recursive: true, force: true });
      res.push([n, r]); console.log((r.ok ? 'PASS ' : 'FAIL ') + n.padEnd(22) + r.secs + 's'); if (!r.ok) console.log(r.out.split('\n').slice(-25).join('\n'));
    }
  }
  restore();
  const bad = res.filter(x => !x[1].ok); console.log('\n' + (res.length - bad.length) + '/' + res.length + ' passed' + (bad.length ? ' — FAILED: ' + bad.map(x => x[0]).join(', ') : ''));
  process.exit(bad.length ? 1 : 0);
})();
