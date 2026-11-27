'use strict';
// v0.45 map rotation: --maps rotate plays two random trench maps, then Wake Atoll, then trench again. Each switch brings the
// right mode (Operations on trench maps, Domination on the island), soldiers on dry land, and no errors.
process.argv = ['node', 'x', '--port', '8085', '--fill', '12', '--no-fetch', '--maps', 'rotate', '--data', require('fs').mkdtempSync(require('path').join(require('os').tmpdir(), 't128rot-'))];
process.env.T128_TEST = '1';
const errs = []; process.on('uncaughtException', e => errs.push(String(e && e.stack || e).slice(0, 300)));
const S = require('../server.js'), X = S._test, T = require('../shared.js');
const sleep = ms => new Promise(r => setTimeout(r, ms)), R = {}, ck = (k, v) => { R[k] = !!v; };
(async () => {
  await sleep(1200); const seen = [T.MP.kind];
  for (let k = 0; k < 3; k++) {
    X.endRound(0); await sleep(300); X.resetRound(); await sleep(4000);
    const H = X.terr().H, wake = T.MP.kind === 'wake', alive = [...X.ents.values()].filter(e => e.alive && !e.mg);
    const wet = wake ? alive.filter(e => T.hAt(H, e.x, e.z) < T.SEA_WADE).length : 0;
    seen.push(T.MP.kind); R['r' + k] = { kind: T.MP.kind, op: !!X.op(), dom: !!X.domState(), structs: T.STRUCT.length, alive: alive.length, wet };
    ck('mode' + k, wake ? (!X.op() && X.domState() && T.STRUCT.length > 80 && T.AA.length === 5) : (!!X.op() && T.FL.length === 6 && T.WTR.length === 0 || !!X.op()));
    ck('land' + k, alive.length > 6 && wet === 0);
  }
  R.seen = seen.join(','); ck('pattern', seen.join(',') === 'trench,trench,wake,trench');
  ck('noErrors', !errs.length); R.errs = errs.slice(0, 2);
  console.log(JSON.stringify(R)); const bad = Object.keys(R).filter(k => R[k] === false); console.log(bad.length ? 'FAILED: ' + bad.join(', ') : 'ALL ' + Object.keys(R).filter(k => typeof R[k] === 'boolean').length + ' CHECKS PASSED'); process.exit(bad.length ? 1 : 0);
})().catch(e => { console.log('TEST ERROR', e); process.exit(1); });
