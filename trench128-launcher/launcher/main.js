'use strict';
// Trench 128 launcher (Electron main process).
//
// The launcher is a small window: patch notes, a server browser, callsign and settings, and a Play button. Play opens the
// game window on the chosen server's own page, so the game itself is always the version that server runs: there are no
// game files to patch on the player's machine. The launcher keeps itself up to date with electron-updater (see
// package.json "build.publish" for where updates are published).
const { app, BrowserWindow, ipcMain, shell, session, net, Menu, dialog } = require('electron');
const path = require('path'), fs = require('fs');
const { normalizeServer, cleanInfo, mergeServers, gameUrl } = require('./lib/servers');
const settingsLib = require('./lib/settings');

const DEFAULTS = (() => { try { return JSON.parse(fs.readFileSync(path.join(__dirname, 'defaults.json'), 'utf8')); } catch (e) { return {}; } })();
const UI = path.join(__dirname, 'ui', 'index.html');
const SETTINGS_FILE = () => path.join(app.getPath('userData'), 'settings.json');
const LOG_FILE = () => path.join(app.getPath('userData'), 'launcher.log');
function log(...a) { try { fs.appendFileSync(LOG_FILE(), new Date().toISOString() + ' ' + a.map(String).join(' ') + '\n'); } catch (e) { } }

const firstInstance = app.requestSingleInstanceLock(); if (!firstInstance) app.quit();   // a second launch focuses the running launcher instead
app.setAppUserModelId('com.trench128.launcher');        // Windows taskbar grouping and notifications

let launcherWin = null, gameWin = null, settings = null, update = { state: 'idle' }, updater = null;
const saveSettings = () => { try { settingsLib.save(SETTINGS_FILE(), settings); } catch (e) { log('settings save failed', e.message); } };
const toLauncher = (ch, data) => { if (launcherWin && !launcherWin.isDestroyed()) launcherWin.webContents.send(ch, data); };

/* ---------------------------------------------------------------- network (main process only; the pages have no network) */
async function getJson(url, ms = 3500) {
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), ms), t0 = Date.now();
  try {
    const r = await net.fetch(url, { signal: ctl.signal, cache: 'no-store', headers: { 'user-agent': 'Trench128Launcher/' + app.getVersion() } });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const txt = await r.text(); if (txt.length > 512 * 1024) throw new Error('reply too large');
    return { json: JSON.parse(txt), ms: Date.now() - t0 };
  } finally { clearTimeout(t); }
}
async function probe(origin) {
  const o = normalizeServer(origin); if (!o) return { url: origin, ok: false, err: 'not a server address' };
  try { const { json, ms } = await getJson(o + '/health'); if (!json || json.t128 !== 1) return { url: o, ok: false, err: 'not a Trench 128 server' }; return { url: o, ok: true, ping: ms, info: cleanInfo(json) }; }
  catch (e) { return { url: o, ok: false, err: e.name === 'AbortError' ? 'no answer' : 'unreachable' }; }
}
async function serverList() {
  let listed = [], listErr = '';
  const master = settings.masterUrl || normalizeServer(DEFAULTS.masterUrl);
  if (master) { try { const { json } = await getJson(master + '/servers'); listed = Array.isArray(json && json.servers) ? json.servers.slice(0, 200) : []; } catch (e) { listErr = 'Server list unavailable (' + (e.name === 'AbortError' ? 'no answer' : e.message) + ')'; } }
  const all = mergeServers(listed, [...(DEFAULTS.servers || []), ...settings.favourites], settings.recent);
  const probed = await Promise.all(all.slice(0, 60).map(async e => ({ ...e, ...(await probe(e.url)) })));
  return { servers: probed, err: listErr, master: master || '' };
}
async function news() {
  const url = DEFAULTS.newsUrl && /^https:\/\//.test(DEFAULTS.newsUrl) ? DEFAULTS.newsUrl : '';
  if (url) { try { const { json } = await getJson(url, 5000); if (Array.isArray(json)) return json.slice(0, 20); } catch (e) { log('news fetch failed', e.message); } }
  try { return JSON.parse(fs.readFileSync(path.join(__dirname, 'ui', 'news.json'), 'utf8')); } catch (e) { return []; }
}

/* ---------------------------------------------------------------- windows */
function hardenContents(wc, allowOrigin) {
  wc.setWindowOpenHandler(({ url }) => { if (/^https:\/\//.test(url)) shell.openExternal(url); return { action: 'deny' }; });   // links open in the player's browser
  wc.on('will-navigate', (e, url) => { let ok = false; try { ok = allowOrigin && new URL(url).origin === allowOrigin; } catch (x) { } if (!ok) { e.preventDefault(); if (/^https:\/\//.test(url)) shell.openExternal(url); } });
  wc.on('will-attach-webview', e => e.preventDefault());
}

function createLauncher() {
  launcherWin = new BrowserWindow({
    width: 1040, height: 660, minWidth: 860, minHeight: 560, show: false, backgroundColor: '#14120e', title: 'Trench 128',
    icon: path.join(__dirname, 'build', 'icon.png'), autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload-launcher.js'), contextIsolation: true, sandbox: true, nodeIntegration: false, spellcheck: false },
  });
  hardenContents(launcherWin.webContents, null);
  launcherWin.loadFile(UI);
  launcherWin.once('ready-to-show', () => launcherWin.show());
  launcherWin.on('closed', () => { launcherWin = null; if (!gameWin) app.quit(); });
}

function openGame(origin) {
  const o = normalizeServer(origin); if (!o) return { ok: false, err: 'not a server address' };
  const url = gameUrl(o, settings.callsign, settings.autoJoin);
  settings = settingsLib.played(settings, o); saveSettings();
  if (gameWin && !gameWin.isDestroyed()) gameWin.destroy();
  const ses = session.fromPartition('persist:game');   // the game's saved settings and logins live here, apart from the launcher
  const w = gameWin = new BrowserWindow({
    width: 1600, height: 900, fullscreen: !!settings.fullscreen, show: false, backgroundColor: '#000000', title: 'Trench 128',
    icon: path.join(__dirname, 'build', 'icon.png'), autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload-game.js'), contextIsolation: true, sandbox: true, nodeIntegration: false, session: ses,
      autoplayPolicy: 'no-user-gesture-required', backgroundThrottling: false, spellcheck: false },
  });
  hardenContents(gameWin.webContents, o);
  gameWin.webContents.on('before-input-event', (e, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F11') { e.preventDefault(); gameWin.setFullScreen(!gameWin.isFullScreen()); }
    if (input.key === 'F12' && !app.isPackaged) gameWin.webContents.openDevTools({ mode: 'detach' });
  });
  gameWin.webContents.on('did-fail-load', (e, code, desc, failedUrl, isMain) => {
    if (!isMain || code === -3) return;   // -3: aborted by a navigation of our own
    log('game load failed', code, desc, failedUrl); closeGame('Could not open ' + o + ' (' + desc + ')');
  });
  gameWin.webContents.on('render-process-gone', (e, d) => { log('game renderer gone', d.reason); closeGame('The game stopped (' + d.reason + ').'); });
  gameWin.once('ready-to-show', () => { gameWin.show(); gameWin.focus(); });
  gameWin.on('closed', () => { if (gameWin !== w) return; gameWin = null; if (launcherWin) { launcherWin.show(); launcherWin.focus(); toLauncher('t128:game', { open: false }); } else app.quit(); });
  gameWin.loadURL(url);
  if (launcherWin) { if (settings.closeOnPlay) launcherWin.hide(); else launcherWin.minimize(); }
  toLauncher('t128:game', { open: true, url: o });
  return { ok: true };
}
function closeGame(err) {
  if (gameWin && !gameWin.isDestroyed()) gameWin.destroy();
  if (launcherWin) { launcherWin.show(); launcherWin.focus(); if (err) toLauncher('t128:error', err); }
}

/* ---------------------------------------------------------------- self-update (electron-updater, NSIS install) */
function setUpdate(u) { update = { ...update, ...u }; toLauncher('t128:update', update); }
function initUpdater() {
  if (!app.isPackaged || process.env.T128_NO_UPDATE) { setUpdate({ state: 'dev' }); return; }   // running from source: nothing to update
  try { updater = require('electron-updater').autoUpdater; } catch (e) { log('electron-updater missing', e.message); setUpdate({ state: 'error', msg: 'updater unavailable' }); return; }
  updater.autoDownload = true; updater.autoInstallOnAppQuit = true; updater.allowPrerelease = !!DEFAULTS.prerelease; updater.logger = { info: log, warn: log, error: log, debug: () => { } };
  updater.on('checking-for-update', () => setUpdate({ state: 'checking' }));
  updater.on('update-available', i => setUpdate({ state: 'downloading', version: i.version, notes: notesText(i.releaseNotes), pct: 0 }));
  updater.on('update-not-available', () => setUpdate({ state: 'current', checked: Date.now() }));
  updater.on('download-progress', p => setUpdate({ state: 'downloading', pct: Math.round(p.percent || 0), bps: Math.round(p.bytesPerSecond || 0) }));
  updater.on('update-downloaded', i => setUpdate({ state: 'ready', version: i.version, notes: notesText(i.releaseNotes) }));
  updater.on('error', e => { log('update error', e && e.stack || e); setUpdate({ state: 'error', msg: 'Update check failed — the game still works; we will try again later.' }); });
  const check = () => updater.checkForUpdates().catch(e => log('check failed', e.message));
  check(); setInterval(check, 4 * 3600 * 1000).unref();
}
function notesText(n) {   // release notes may be HTML or a list of {version, note}: shown as plain text
  const s = Array.isArray(n) ? n.map(x => (x.version ? x.version + ': ' : '') + (x.note || '')).join('\n') : String(n || '');
  return s.replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|li|h\d)>/gi, '\n').replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim().slice(0, 4000);
}

/* ---------------------------------------------------------------- IPC: only from our own launcher page */
function fromLauncher(e) { try { return !!launcherWin && e.sender === launcherWin.webContents && new URL(e.senderFrame.url).protocol === 'file:'; } catch (x) { return false; } }
function handle(ch, fn) { ipcMain.handle(ch, async (e, ...a) => { if (!fromLauncher(e)) throw new Error('denied'); return fn(...a); }); }
handle('t128:state', () => ({ settings, version: app.getVersion(), update, gameOpen: !!gameWin, brand: { site: DEFAULTS.site || '', discord: DEFAULTS.discord || '' } }));
handle('t128:settings', patch => { settings = settingsLib.clean({ ...settings, ...(patch && typeof patch === 'object' ? patch : {}) }, DEFAULTS); saveSettings(); return settings; });
handle('t128:servers', () => serverList());
handle('t128:probe', url => probe(url));
handle('t128:news', () => news());
handle('t128:play', url => openGame(url));
handle('t128:favourite', (url, on) => { const o = normalizeServer(url); if (!o) return settings; const f = settings.favourites.filter(u => u !== o); settings = { ...settings, favourites: on ? [o, ...f] : f }; saveSettings(); return settings; });
handle('t128:update-check', () => { if (updater) updater.checkForUpdates().catch(e => log('check failed', e.message)); return update; });
handle('t128:update-install', () => { if (update.state === 'ready' && updater) { setImmediate(() => updater.quitAndInstall(true, true)); return true; } return false; });   // silent install, then start the new launcher
handle('t128:open', url => { if (/^https:\/\/[^\s]+$/.test(String(url))) shell.openExternal(String(url)); });
handle('t128:logs', () => shell.showItemInFolder(LOG_FILE()));
// from the game page (its preload): back to the launcher, fullscreen toggle
ipcMain.on('t128:back', e => { if (gameWin && e.sender === gameWin.webContents) closeGame(); });
ipcMain.on('t128:fs', e => { if (gameWin && e.sender === gameWin.webContents) gameWin.setFullScreen(!gameWin.isFullScreen()); });

/* ---------------------------------------------------------------- start */
app.on('second-instance', () => { const w = gameWin || launcherWin; if (w) { if (w.isMinimized()) w.restore(); w.show(); w.focus(); } });
app.on('web-contents-created', (e, wc) => { wc.on('will-attach-webview', ev => ev.preventDefault()); });
app.on('window-all-closed', () => app.quit());
app.whenReady().then(() => {
  if (!firstInstance) return;
  Menu.setApplicationMenu(null);
  settings = settingsLib.load(SETTINGS_FILE(), DEFAULTS);
  // the game may lock the pointer and go fullscreen; nothing else (camera, microphone, location, notifications...)
  for (const ses of [session.defaultSession, session.fromPartition('persist:game')]) {
    ses.setPermissionRequestHandler((wc, perm, cb) => cb(perm === 'pointerLock' || perm === 'fullscreen'));
    ses.setPermissionCheckHandler((wc, perm) => perm === 'pointerLock' || perm === 'fullscreen');
  }
  createLauncher(); initUpdater();
}).catch(e => { log('startup failed', e && e.stack || e); dialog.showErrorBox('Trench 128', 'The launcher could not start: ' + (e && e.message)); app.quit(); });
process.on('uncaughtException', e => log('uncaught', e && e.stack || e));
