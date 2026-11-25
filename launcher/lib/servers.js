'use strict';
// Server addresses and the server list: pure functions (no Electron), unit-tested in test/servers.test.js.

/** Turn what a player typed ("play.example.com", "1.2.3.4:8080", "https://x/") into a clean origin URL, or null. */
function normalizeServer(input) {
  let s = String(input == null ? '' : input).trim();
  if (!s || s.length > 300 || /\s/.test(s)) return null;
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) s = (/^(localhost|127\.|10\.|192\.168\.|\[?::1)/i.test(s) ? 'http://' : 'https://') + s;
  let u; try { u = new URL(s); } catch (e) { return null; }
  if (u.protocol === 'ws:') u = new URL('http:' + s.slice(3)); else if (u.protocol === 'wss:') u = new URL('https:' + s.slice(4));
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  if (u.username || u.password || !u.hostname) return null;
  { const raw = s.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '').split(/[/:?#]/)[0]; if (/^\d+$/.test(raw) || /^0x/i.test(raw)) return null; }   // '5' or '0x7f1' would parse as an IP
  return u.origin;   // path, query and hash dropped: the game page is always at the server's root
}

/** A server's /health answer (or a list entry) cut down to the fields the launcher shows, with types forced. */
function cleanInfo(j) {
  if (!j || typeof j !== 'object') return null;
  const num = v => (Number.isFinite(+v) ? Math.max(0, Math.round(+v)) : 0), str = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]/g, '').slice(0, n);
  return { name: str(j.name, 48) || 'Trench 128 server', version: str(j.version, 16), players: num(j.players), max: num(j.max), bots: num(j.bots), region: str(j.region, 24), wx: str(j.wx, 16), accounts: !!j.accounts };
}

/** Merge the master list, favourites and recent servers into one list (favourites first, then by players). */
function mergeServers(listed, favourites, recent) {
  const out = new Map();
  const add = (url, info, tag) => { const o = normalizeServer(url); if (!o) return; const e = out.get(o) || { url: o, info: null, fav: false, recent: false, listed: false }; if (info && !e.info) e.info = cleanInfo(info); e[tag] = true; out.set(o, e); };
  for (const s of Array.isArray(listed) ? listed : []) if (s && typeof s === 'object') add(s.url, s, 'listed');
  for (const u of Array.isArray(favourites) ? favourites : []) add(u, null, 'fav');
  for (const u of Array.isArray(recent) ? recent : []) add(u, null, 'recent');
  return [...out.values()].sort((a, b) => (b.fav - a.fav) || ((b.info ? b.info.players : -1) - (a.info ? a.info.players : -1)) || a.url.localeCompare(b.url));
}

/** Is `client` (the launcher's idea of the game version) older than `server`? Compares x.y.z numerically. */
function versionBehind(a, b) {
  const p = v => String(v || '').split(/[.-]/).slice(0, 3).map(n => parseInt(n, 10) || 0);
  const x = p(a), y = p(b); for (let i = 0; i < 3; i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) < (y[i] || 0); } return false;
}

/** The URL the game window opens: the server's own page, with the callsign and auto-join for the launcher. */
function gameUrl(origin, callsign, autoJoin) {
  const o = normalizeServer(origin); if (!o) return null;
  const u = new URL(o + '/'); const n = String(callsign || '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 16);
  if (n) u.searchParams.set('name', n); if (autoJoin && n) u.searchParams.set('auto', '1');
  return u.toString();
}

module.exports = { normalizeServer, cleanInfo, mergeServers, versionBehind, gameUrl };
