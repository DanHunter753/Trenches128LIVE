'use strict';
const test = require('node:test'), assert = require('node:assert'), fs = require('fs'), os = require('os'), path = require('path');
const S = require('../lib/settings');

test('defaults on first run and on a damaged file', () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 't128l-')), f = path.join(d, 'settings.json');
  assert.deepStrictEqual(S.load(f), S.clean(null));
  fs.writeFileSync(f, '{not json'); assert.strictEqual(S.load(f).fullscreen, true);
});
test('bad values are replaced, good ones kept', () => {
  const s = S.clean({ callsign: 'Tommy\u0000Atkins-the-Brave', fullscreen: 'yes', autoJoin: false, favourites: ['a.com', 'javascript:x', 'a.com', 5], recent: 'x', masterUrl: 'file:///etc/passwd', lastServer: 'http://10.0.0.2:8080/x' });
  assert.strictEqual(s.callsign, 'TommyAtkins-the-'); assert.strictEqual(s.fullscreen, true); assert.strictEqual(s.autoJoin, false);
  assert.deepStrictEqual(s.favourites, ['https://a.com']); assert.deepStrictEqual(s.recent, []); assert.strictEqual(s.masterUrl, ''); assert.strictEqual(s.lastServer, 'http://10.0.0.2:8080');
});
test('built-in defaults apply when the player has not chosen', () => {
  const s = S.clean({}, { masterUrl: 'list.example.com', fullscreen: false }); assert.strictEqual(s.masterUrl, 'https://list.example.com'); assert.strictEqual(s.fullscreen, false);
});
test('saves atomically and reads back; playing a server moves it to the top of recent', () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 't128l-')), f = path.join(d, 'sub', 'settings.json');
  let s = S.clean({ recent: ['https://a.com', 'https://b.com'] }); s = S.played(s, 'b.com'); S.save(f, s);
  const r = S.load(f); assert.deepStrictEqual(r.recent, ['https://b.com', 'https://a.com']); assert.strictEqual(r.lastServer, 'https://b.com');
  assert.deepStrictEqual(fs.readdirSync(path.dirname(f)), ['settings.json']);
  for (let i = 0; i < 15; i++) s = S.played(s, 'https://s' + i + '.com'); assert.strictEqual(s.recent.length, 10);
});
