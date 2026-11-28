'use strict';
// v0.47.1: a player whose connection dropped (the server may still think it's open) can join again at once: the same account,
// or a guest with the same name from the same browser, takes over the old place (same side and squad); the old window is told.
const fs = require('fs'), os = require('os'), path = require('path');
process.argv = ['node', 'x', '--port', '8088', '--fill', '2', '--no-fetch', '--data', fs.mkdtempSync(path.join(os.tmpdir(), 't128rj-'))];
process.env.T128_TEST = '1';
const S = require('../server.js'), X = S._test;
const sleep = ms => new Promise(r => setTimeout(r, ms)), R = {}, ck = (k, v) => { R[k] = !!v; };
const conn = hello => new Promise(res => { const ws = new WebSocket('ws://localhost:8088'), got = []; ws.onmessage = ev => { if (typeof ev.data === 'string') got.push(JSON.parse(ev.data)); }; ws.onopen = () => { ws.send(JSON.stringify(hello)); setTimeout(() => res({ ws, got }), 700); }; });
const first = (c, t) => c.got.find(m => m.t === t);
(async () => {
  await sleep(800);
  const reg = await X.ACC.register('Dropper', 'longpassword1', '9.9.9.9', 0);
  const a = await conn({ t: 'hello', name: 'Dropper', token: reg.token }); const pa = first(a, 'prof');
  a.ws.send(JSON.stringify({ t: 'sq', sq: 2 })); await sleep(300);
  const sqA = [...X.humans].find(h => h.name === 'Dropper').sq;
  const b = await conn({ t: 'hello', name: 'Dropper', token: reg.token }); const pb = first(b, 'prof');
  R.acct = { a: pa && pa.team, b: pb && pb.team, err: (first(b, 'err') || {}).m };
  ck('accountRejoins', pa && pb && !first(b, 'err'));
  ck('sameSide', pb && pb.team === pa.team);
  ck('oldWindowTold', !!first(a, 'kicked'));
  ck('onlyOnce', [...X.humans].filter(h => h.name === 'Dropper').length === 1);
  // guests: same name + same browser id takes over; another browser with that name is still refused
  const c = await conn({ t: 'hello', name: 'Guesty', cid: 'browser-1' }); const d = await conn({ t: 'hello', name: 'Guesty', cid: 'browser-1' });
  ck('guestRejoins', first(c, 'prof') && first(d, 'prof') && !first(d, 'err') && first(c, 'kicked'));
  const e = await conn({ t: 'hello', name: 'Guesty', cid: 'browser-2' }); ck('otherBrowserRefused', /in use/.test((first(e, 'err') || {}).m || ''));
  console.log(JSON.stringify(R)); const bad = Object.keys(R).filter(k => R[k] === false); console.log(bad.length ? 'FAILED: ' + bad.join(', ') : 'ALL ' + Object.keys(R).filter(k => typeof R[k] === 'boolean').length + ' CHECKS PASSED'); process.exit(bad.length ? 1 : 0);
})().catch(e => { console.log('TEST ERROR', e); process.exit(1); });
