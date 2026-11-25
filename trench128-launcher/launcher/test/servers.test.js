'use strict';
const test = require('node:test'), assert = require('node:assert');
const { normalizeServer, cleanInfo, mergeServers, versionBehind, gameUrl } = require('../lib/servers');

test('server addresses are cleaned to an origin', () => {
  assert.strictEqual(normalizeServer('play.example.com'), 'https://play.example.com');
  assert.strictEqual(normalizeServer('192.168.1.20:8080'), 'http://192.168.1.20:8080');
  assert.strictEqual(normalizeServer('localhost:8080'), 'http://localhost:8080');
  assert.strictEqual(normalizeServer('http://1.2.3.4:8080/some/path?x=1#h'), 'http://1.2.3.4:8080');
  assert.strictEqual(normalizeServer('wss://play.example.com/ws'), 'https://play.example.com');
  assert.strictEqual(normalizeServer(' HTTPS://Play.Example.com/ '), 'https://play.example.com');
});
test('things that are not servers are refused', () => {
  for (const bad of ['', '   ', null, undefined, 'javascript:alert(1)', 'file:///c:/x', 'data:text/html,x', 'ftp://x', 'http://user:pw@x.com', 'a b.com', 'x'.repeat(400), 'http://', 'chrome://settings', '5', 5, '0x7f000001', '2130706433:8080'])
    assert.strictEqual(normalizeServer(bad), null, String(bad));
});
test('server info is cut to plain fields', () => {
  const i = cleanInfo({ name: 'A\u0000B<script>' + 'x'.repeat(100), players: '12', max: -3, bots: 1e9, version: { a: 1 }, accounts: 1, region: 'EU' });
  assert.strictEqual(i.name.length, 48); assert.ok(!/\u0000/.test(i.name)); assert.strictEqual(i.players, 12); assert.strictEqual(i.max, 0); assert.strictEqual(i.version, '[object Object]'); assert.strictEqual(i.accounts, true);
  assert.strictEqual(cleanInfo(null), null); assert.strictEqual(cleanInfo('x'), null);
});
test('lists merge: favourites first, then the busiest, no duplicates', () => {
  const m = mergeServers([{ url: 'https://a.com', players: 3 }, { url: 'https://b.com/', players: 40 }, { url: 'javascript:x' }, null, 'x'], ['c.com', 'https://a.com'], ['https://b.com']);
  assert.deepStrictEqual(m.map(e => e.url), ['https://a.com', 'https://c.com', 'https://b.com']);
  assert.ok(m[0].fav && m[0].listed); assert.ok(m[2].recent && m[2].listed);
  assert.deepStrictEqual(mergeServers(undefined, undefined, undefined), []);
});
test('version comparison', () => {
  assert.ok(versionBehind('0.29.0', '0.29.1')); assert.ok(!versionBehind('0.30.0', '0.29.9')); assert.ok(versionBehind('0.9.0', '0.10.0')); assert.ok(!versionBehind('1.0.0', '1.0.0'));
});
test('game URL carries the callsign and auto-join only when there is a name', () => {
  assert.strictEqual(gameUrl('play.example.com', 'Sgt Pepper', true), 'https://play.example.com/?name=Sgt+Pepper&auto=1');
  assert.strictEqual(gameUrl('play.example.com', '', true), 'https://play.example.com/');
  assert.strictEqual(gameUrl('play.example.com', 'A\u0007very long callsign indeed', false), 'https://play.example.com/?name=Avery+long+calls');
  assert.strictEqual(gameUrl('javascript:alert(1)', 'x', true), null);
});
