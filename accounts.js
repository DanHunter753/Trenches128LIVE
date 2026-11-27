'use strict';
// Trench 128 accounts (v0.27): name + password (scrypt), session tokens, XP per account. Zero dependencies.
// Stored in <data>/accounts.json (written atomically, debounced). Login attempts are rate-limited per IP and per name.
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const SCRYPT = { N: 16384, r: 8, p: 1 }, KEYLEN = 32, SESSION_DAYS = 30;
const NAME_RE = /^[A-Za-z0-9_\-\[\]\.]{3,16}$/, RESERVED = /^(admin|server|system|moderator|mod|officer|tank crew|panzer crew)$/i;

module.exports = function makeAccounts(dir) {
  const FILE = path.join(dir, 'accounts.json');
  let db = { users: {}, sessions: {} };
  try { const j = JSON.parse(fs.readFileSync(FILE, 'utf8')); if (j && j.users) db = { users: j.users, sessions: j.sessions || {} }; } catch (e) { }
  let dirty = false, timer = null;
  function save(now) {
    dirty = true; if (timer && !now) return;
    const write = () => { timer = null; if (!dirty) return; dirty = false; const tmp = FILE + '.tmp';
      try { fs.writeFileSync(tmp, JSON.stringify(db)); fs.renameSync(tmp, FILE); } catch (e) { console.error('accounts: save failed', e.message); } };
    if (now) { clearTimeout(timer); write(); } else timer = setTimeout(write, 2000);
  }
  const key = n => String(n).toLowerCase();
  const scrypt = (pass, salt) => new Promise((ok, no) => crypto.scrypt(pass, salt, KEYLEN, SCRYPT, (e, k) => e ? no(e) : ok(k)));
  // rate limits: 8 attempts a minute per IP, 10 per 10 minutes per name
  const tries = new Map();
  function limited(k, max, ms) { const now = Date.now(), a = (tries.get(k) || []).filter(t => now - t < ms); a.push(now); tries.set(k, a); return a.length > max; }
  setInterval(() => { const now = Date.now(); for (const [k, a] of tries) if (!a.some(t => now - t < 600000)) tries.delete(k); for (const [t, s] of Object.entries(db.sessions)) if (s.exp < now) { delete db.sessions[t]; dirty = true; } if (dirty) save(); }, 60000).unref();
  function newSession(u) {
    const token = crypto.randomBytes(24).toString('hex'); db.sessions[token] = { u: key(u.name), exp: Date.now() + SESSION_DAYS * 864e5 }; save();
    return { token, name: u.name, xp: u.xp || 0 };
  }
  async function register(name, pass, ip, carryXp) {
    name = String(name || '').trim(); pass = String(pass || '');
    if (!NAME_RE.test(name) || RESERVED.test(name)) return { err: 'Names are 3-16 letters, digits or _ - [ ] .' };
    if (pass.length < 8 || pass.length > 128) return { err: 'Passwords need 8 to 128 characters.' };
    if (limited('r:' + ip, 5, 600000)) return { err: 'Too many new accounts from your address. Try again later.' };
    if (db.users[key(name)]) return { err: 'That name is taken.' };
    const salt = crypto.randomBytes(16).toString('hex'), hash = (await scrypt(pass, salt)).toString('hex');
    if (db.users[key(name)]) return { err: 'That name is taken.' };
    const u = db.users[key(name)] = { name, salt, hash, xp: Math.max(0, carryXp | 0), created: Date.now(), last: Date.now() };
    save(); return newSession(u);
  }
  async function login(name, pass, ip) {
    name = String(name || '').trim(); pass = String(pass || '');
    if (limited('l:' + ip, 8, 60000) || limited('n:' + key(name), 10, 600000)) return { err: 'Too many attempts. Wait a minute and try again.' };
    const u = db.users[key(name)], salt = u ? u.salt : 'x'.repeat(32), want = u ? Buffer.from(u.hash, 'hex') : Buffer.alloc(KEYLEN);
    const got = await scrypt(pass, salt);   // hash even for unknown names, so timing doesn't reveal which names exist
    if (!u || !crypto.timingSafeEqual(got, want)) return { err: 'Wrong name or password.' };
    if (u.banned) return { err: 'This account is banned.' };
    u.last = Date.now(); return newSession(u);
  }
  function session(token) {
    const s = typeof token === 'string' && token.length === 48 ? db.sessions[token] : null; if (!s || s.exp < Date.now()) return null;
    const u = db.users[s.u]; if (!u || u.banned) return null; return u;
  }
  function logout(token) { if (db.sessions[token]) { delete db.sessions[token]; save(); } }
  const isRegistered = name => !!db.users[key(name)];
  function addXp(u, n) { u.xp = (u.xp || 0) + n; save(); return u.xp; }
  function ban(name, on) { const u = db.users[key(name)]; if (!u) return false; u.banned = !!on; if (on) for (const [t, s] of Object.entries(db.sessions)) if (s.u === key(name)) delete db.sessions[t]; save(true); return true; }
  return { register, login, session, logout, isRegistered, addXp, ban, touch: () => save(), flush: () => save(true), count: () => Object.keys(db.users).length, _db: () => db };
};
