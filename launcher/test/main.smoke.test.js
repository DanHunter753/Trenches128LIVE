'use strict';
// main.js under a stand-in `electron` module: start-up, IPC guard, server list + health probes against a real local HTTP
// server, opening / replacing / closing the game window, navigation and permission rules, update events.
const test = require('node:test'), assert = require('node:assert'), Module = require('module'), http = require('http'), os = require('os'), fs = require('fs'), path = require('path'), EventEmitter = require('events');

function fakeElectron() {
  const ud = fs.mkdtempSync(path.join(os.tmpdir(), 't128main-')), handlers = {}, listeners = {}, wins = [], opened = [], perms = {};
  class WC extends EventEmitter { constructor(win) { super(); this.win = win; this.sent = []; this.openHandler = null; } send(ch, d) { this.sent.push([ch, d]); } setWindowOpenHandler(f) { this.openHandler = f; } openDevTools() { } }
  class BW extends EventEmitter {
    constructor(o) { super(); this.o = o; this.webContents = new WC(this); this.destroyed = false; this.fs = !!o.fullscreen; this.visible = false; this.min = false; wins.push(this); }
    loadFile(f) { this.url = 'file://' + f; this.webContents.url = this.url; } loadURL(u) { this.url = u; }
    once(ev, f) { return super.once(ev, f); } show() { this.visible = true; } hide() { this.visible = false; } focus() { } minimize() { this.min = true; } restore() { this.min = false; } isMinimized() { return this.min; }
    isDestroyed() { return this.destroyed; } destroy() { if (this.destroyed) return; this.destroyed = true; this.emit('closed'); } setFullScreen(v) { this.fs = v; } isFullScreen() { return this.fs; }
  }
  const ses = name => (perms[name] = perms[name] || { setPermissionRequestHandler(f) { this.req = f; }, setPermissionCheckHandler(f) { this.chk = f; } });
  let readyRes; const ready = new Promise(r => readyRes = r);
  const app = Object.assign(new EventEmitter(), { requestSingleInstanceLock: () => true, setAppUserModelId() { }, getPath: () => ud, getVersion: () => '1.0.0', isPackaged: false, quit() { app.quitted = true; }, whenReady: () => ready });
  return {
    m: { app, BrowserWindow: BW, Menu: { setApplicationMenu() { } }, dialog: { showErrorBox() { } }, shell: { openExternal: u => opened.push(u), showItemInFolder() { } },
      session: { defaultSession: ses('default'), fromPartition: p => ses(p) }, net: { fetch: (u, o) => fetch(u, o) },
      ipcMain: { handle: (ch, f) => { handlers[ch] = f; }, on: (ch, f) => { listeners[ch] = f; } } },
    ud, handlers, listeners, wins, opened, perms, start: () => readyRes(), app,
  };
}

test('main.js end to end with a stand-in Electron', async () => {
  // a pretend game server: /health and /servers
  const srv = http.createServer((q, r) => { r.setHeader('content-type', 'application/json');
    if (q.url === '/health') return r.end(JSON.stringify({ t128: 1, name: 'Test <b>Front</b>', version: '0.29.1', players: 5, max: 256, bots: 40 }));
    if (q.url === '/servers') return r.end(JSON.stringify({ servers: [{ url: 'http://127.0.0.1:' + srv.address().port }, { url: 'javascript:alert(1)' }, { url: 'http://127.0.0.1:1' }] }));
    r.statusCode = 404; r.end('{}'); });
  await new Promise(r => srv.listen(0, '127.0.0.1', r)); const origin = 'http://127.0.0.1:' + srv.address().port;
  const E = fakeElectron(), orig = Module._load;
  Module._load = function (req, ...a) { if (req === 'electron') return E.m; return orig.call(this, req, ...a); };
  try {
    delete require.cache[require.resolve('../main.js')]; require('../main.js'); E.start(); await new Promise(r => setTimeout(r, 50));
    const L = E.wins[0]; assert.ok(L && /ui[\\/]index\.html$/.test(L.url), 'launcher window loads the page');
    assert.strictEqual(L.o.webPreferences.contextIsolation, true); assert.strictEqual(L.o.webPreferences.sandbox, true); assert.strictEqual(L.o.webPreferences.nodeIntegration, false);
    const ev = { sender: L.webContents, senderFrame: { url: L.url } }, call = (ch, ...a) => E.handlers[ch](ev, ...a);
    // IPC from anything but the launcher page is refused
    await assert.rejects(E.handlers['t128:state']({ sender: {}, senderFrame: { url: 'https://evil' } }), /denied/);
    const st = await call('t128:state'); assert.strictEqual(st.version, '1.0.0'); assert.strictEqual(st.update.state, 'dev');
    // settings: hostile values cleaned
    const s1 = await call('t128:settings', { callsign: 'Pte\u0000Atkins', masterUrl: origin + '/x?y', favourites: 'nope', fullscreen: false });
    assert.strictEqual(s1.callsign, 'PteAtkins'); assert.strictEqual(s1.masterUrl, origin); assert.deepStrictEqual(s1.favourites, []); assert.strictEqual(s1.fullscreen, false);
    assert.ok(fs.existsSync(path.join(E.ud, 'settings.json')));
    // list: the registry's entries probed, bad ones dropped, dead one marked
    const list = await call('t128:servers'); const live = list.servers.find(x => x.url === origin), dead = list.servers.find(x => x.url === 'http://127.0.0.1:1');
    assert.ok(live && live.ok && live.info.name === 'Test <b>Front</b>' && live.info.players === 5 && live.ping >= 0); assert.ok(dead && !dead.ok); assert.ok(!list.servers.some(x => /javascript/.test(x.url)));
    assert.strictEqual((await call('t128:probe', 'http://127.0.0.1:1')).ok, false); assert.strictEqual((await call('t128:probe', 'file:///c:/x')).ok, false);
    // play: game window on the server page with callsign + auto join, own session, sandboxed
    const r = await call('t128:play', origin); assert.ok(r.ok); const G = E.wins[1];
    assert.strictEqual(G.url, origin + '/?name=PteAtkins&auto=1'); assert.strictEqual(G.o.fullscreen, false); assert.strictEqual(G.o.webPreferences.sandbox, true); assert.ok(G.o.webPreferences.session === E.perms['persist:game']);
    assert.ok(L.min, 'launcher minimised while playing'); assert.deepStrictEqual((await call('t128:state')).settings.recent, [origin]);
    // navigation: same origin allowed; elsewhere blocked (https opened in the browser)
    let blocked = false; G.webContents.emit('will-navigate', { preventDefault() { blocked = true; } }, origin + '/other'); assert.ok(!blocked);
    G.webContents.emit('will-navigate', { preventDefault() { blocked = true; } }, 'https://elsewhere.example/'); assert.ok(blocked && E.opened.includes('https://elsewhere.example/'));
    assert.deepStrictEqual(G.webContents.openHandler({ url: 'http://x' }), { action: 'deny' });
    // permissions: pointer lock and fullscreen only
    const pr = E.perms['persist:game']; const ans = p => new Promise(res => pr.req(null, p, res));
    assert.strictEqual(await ans('pointerLock'), true); assert.strictEqual(await ans('media'), false); assert.strictEqual(await ans('geolocation'), false);
    // F11 toggles fullscreen; the game page's "back" returns to the launcher; others cannot send it
    G.webContents.emit('before-input-event', { preventDefault() { } }, { type: 'keyDown', key: 'F11' }); assert.strictEqual(G.fs, true);
    E.listeners['t128:back']({ sender: L.webContents }); assert.ok(!G.destroyed, 'back from a stranger ignored');
    // replacing the game window keeps the new one
    await call('t128:play', origin); const G2 = E.wins[2]; assert.ok(G.destroyed && !G2.destroyed);
    E.listeners['t128:back']({ sender: G2.webContents }); assert.ok(G2.destroyed && L.visible); assert.ok(L.webContents.sent.some(([ch, d]) => ch === 't128:game' && d.open === false));
    // a failed load closes the game and tells the launcher
    await call('t128:play', origin); const G3 = E.wins[3]; G3.webContents.emit('did-fail-load', {}, -105, 'ERR_NAME_NOT_RESOLVED', origin, true);
    assert.ok(G3.destroyed && L.webContents.sent.some(([ch, d]) => ch === 't128:error' && /ERR_NAME/.test(d)));
    // external links: https only
    await call('t128:open', 'javascript:alert(1)'); await call('t128:open', 'https://example.com/x'); assert.ok(!E.opened.includes('javascript:alert(1)') && E.opened.includes('https://example.com/x'));
    assert.strictEqual(await call('t128:update-install'), false);
  } finally { Module._load = orig; srv.close(); }
});
