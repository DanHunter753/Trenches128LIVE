'use strict';
// v0.34 bots use the wire and the mines: bots splice their side's cut telephone wire, sapper bots dig the mine galleries,
// and bots near the listening post countermine a gallery once it has been heard.
process.argv = ['node', 'x', '--port', '8087', '--fill', '128', '--no-fetch', '--data', require('fs').mkdtempSync(require('path').join(require('os').tmpdir(), 't128bj-'))];
process.env.T128_TEST = '1';
const S = require('../server.js'), X = S._test;
const sleep = ms => new Promise(r => setTimeout(r, ms)), R = {}, ck = (k, v) => { R[k] = !!v; };
(async () => {
  await sleep(3000); X.phoneSet(0, 1, true, null); X.phoneSet(3, 2, true, null);
  let w = 0; while (X.phoneCut.size && w < 100000) { await sleep(2000); w += 2000; } R.spliceS = w / 1000; ck('botsSplice', X.phoneCut.size === 0 && X.BSTAT.splice > 0 && w < 100000);   // (breaks also mend themselves after 120 s)
  if (w < 40000) await sleep(40000 - w); ck('sappersDig', X.TUN.some(u => u.p > .05) && X.BSTAT.dig > 0);
  // a gallery heard under the enemy line brings their bots to countermine it
  const i = X.TUN.findIndex(u => u.p > .05) >= 0 ? X.TUN.findIndex(u => u.p > .05) : 0, u = X.TUN[i]; u.p = .6; u.heard = true;
  let t = 0; while (u.heard && t < 40000) { await sleep(1000); t += 1000; } R.counterS = t / 1000;
  ck('botsCountermine', !u.heard && X.BSTAT.counter > 0);
  console.log(JSON.stringify(R)); const bad = Object.keys(R).filter(k => R[k] === false); console.log(bad.length ? 'FAILED: ' + bad.join(', ') : 'ALL ' + Object.keys(R).filter(k => typeof R[k] === 'boolean').length + ' CHECKS PASSED'); process.exit(bad.length ? 1 : 0);
})().catch(e => { console.log('TEST ERROR', e); process.exit(1); });
