'use strict';
// Real Chrome decodes every gun/reload clip and plays own/remote shots through the sampled path (THREE stubbed).
// usage: T128_TEST=1 node server.js --port 8099 & node test/browser_audio.js http://localhost:8099
const { chromium } = require('playwright'); const fs = require('fs');
const url = process.argv[2] || 'http://localhost:8099';
const STUB = fs.readFileSync(__dirname + '/browser.js', 'utf8').match(/const STUB = `([\s\S]*?)`;/)[1];
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
  const p = await b.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.route(/three(\.min)?\.js/, r => r.fulfill({ body: STUB, contentType: 'text/javascript' }));
  await p.goto(url); await p.waitForTimeout(800);
  const r = await p.evaluate(async () => {
    AC = new AudioContext(); sfxLoad();
    for (let i = 0; i < 50 && Object.keys(SFX).length < SFXN.length; i++) await new Promise(r => setTimeout(r, 100));
    const own = play('s_rifle', .5), far = play('s_mg', .2, { lp: 2000, at: .1, pan: -.5 }); let thrown = null;
    try { me.x = 0; me.z = 0; me.yaw = 0; shotSnd(30, 40, 'smg'); shotSnd(5, 5, 'unknown'); ownShot('shotgun'); reloadSnd('bolt'); reloadSnd('shotgun'); reloadSnd('lmg', true) } catch (e) { thrown = e.message }
    return { loaded: Object.keys(SFX).sort(), want: SFXN.length, durs: Object.fromEntries(Object.entries(SFX).map(([k, v]) => [k, +v.duration.toFixed(2)])), own, far, thrown };
  });
  console.log(JSON.stringify(r, null, 1));
  const ok = r.loaded.length === r.want && r.own && r.far && !r.thrown && !errs.length;
  console.log(ok ? 'AUDIO BROWSER OK' : 'AUDIO BROWSER FAIL ' + errs.join('; ')); await b.close(); process.exit(ok ? 0 : 1);
})().catch(e => { console.log('TEST ERROR', e.message); process.exit(1) });
