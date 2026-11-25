'use strict';
// Launcher settings in the user's profile folder (settings.json): read with defaults and types checked, written atomically.
const fs = require('fs'), path = require('path');
const { normalizeServer } = require('./servers');

const DEFAULTS = Object.freeze({ callsign: '', lastServer: '', favourites: [], recent: [], fullscreen: true, autoJoin: true, closeOnPlay: false, masterUrl: '' });

function clean(raw, defaults) {
  const d = { ...DEFAULTS, ...(defaults || {}) }, r = raw && typeof raw === 'object' ? raw : {};
  const urls = (a, n) => [...new Set((Array.isArray(a) ? a : []).map(normalizeServer).filter(Boolean))].slice(0, n);
  return {
    callsign: String(r.callsign == null ? d.callsign : r.callsign).replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 16),
    lastServer: normalizeServer(r.lastServer) || normalizeServer(d.lastServer) || '',
    favourites: urls(r.favourites != null ? r.favourites : d.favourites, 30),
    recent: urls(r.recent, 10),
    fullscreen: typeof r.fullscreen === 'boolean' ? r.fullscreen : !!d.fullscreen,
    autoJoin: typeof r.autoJoin === 'boolean' ? r.autoJoin : !!d.autoJoin,
    closeOnPlay: typeof r.closeOnPlay === 'boolean' ? r.closeOnPlay : !!d.closeOnPlay,
    masterUrl: normalizeServer(r.masterUrl) || normalizeServer(d.masterUrl) || '',
  };
}

function load(file, defaults) {
  let raw = null; try { raw = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { /* first run or a damaged file: defaults */ }
  return clean(raw, defaults);
}

function save(file, s) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + '.' + process.pid + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(s, null, 2)); fs.renameSync(tmp, file);   // never a half-written file
}

/** Note a server as just played: first in "recent", remembered as last. */
function played(s, url) { const o = normalizeServer(url); if (!o) return s; return { ...s, lastServer: o, recent: [o, ...s.recent.filter(u => u !== o)].slice(0, 10) }; }

module.exports = { DEFAULTS, clean, load, save, played };
