'use strict';
// v0.42 rifle reach: rifles carry much further (bolt 240 m, carbine 190 m, marksman 300 m, sniper 360 m), the one-shot
// sweet spots are longer, and sights are zeroed at 100 m (scoped rifles 150 m) so a bullet is back on the line of sight there.
process.argv = ['node', 'x', '--port', '8083', '--fill', '0', '--no-fetch', '--maps', 'wake', '--data', require('fs').mkdtempSync(require('path').join(require('os').tmpdir(), 't128rg-'))];
process.env.T128_TEST = '1';
const S = require('../server.js'), X = S._test, T = require('../shared.js');
const sleep = ms => new Promise(r => setTimeout(r, ms)), R = {}, ck = (k, v) => { R[k] = !!v; };
const sh = { id: 1, team: 0, bot: false, cls: 'rifleman', w: 'bolt', msgs: [], st: { k: 0, hs: 0, sc: 0 } };
const heightAt = (wk, d) => { const w = T.WPN[wk]; X.fireBullet(sh, 0, 60, -190, Math.PI, X.sightZero(w), w.rng, w.dmg, wk, w.vel, w.sw); let y = null, n = 0; while (X.bullets.length && n++ < 300) { const b = X.bullets[0], d0 = b.d; X.bulletsTick(); if (d0 < d && b.d >= d) { y = b.y - 60; break; } } X.bullets.length = 0; return y; };
(async () => {
  await sleep(1500);
  ck('boltReaches200', heightAt('bolt', 200) != null && heightAt('bolt', 200) > -.8);
  ck('boltZeroedAt100', Math.abs(heightAt('bolt', 100)) < .08);
  ck('carbineReaches180', heightAt('carbine', 180) != null);
  ck('sniperReaches300', heightAt('sniper', 300) != null && heightAt('sniper', 300) > -1);
  ck('sniperZeroedAt150', Math.abs(heightAt('sniper', 150)) < .15);
  ck('sweetSpotsLonger', T.WPN.bolt.sw[1] >= 110 && T.WPN.mark.sw[1] >= 170 && T.WPN.sniper.sw[1] >= 250);
  ck('smgShotgunUnchanged', T.WPN.smg.rng === 60 && T.WPN.shotgun.rng === 28);
  // v0.49: rifles reach 800 m; past their reach-start the damage falls to a floor instead of the round vanishing
  ck('riflesReach800', ['bolt', 'carbine', 'mark', 'sniper'].every(k => T.WPN[k].rng === 800));
  ck('sniperKillsTo260', T.rangeDmg(T.WPN.sniper, 30) === 100 && T.rangeDmg(T.WPN.sniper, 260) === 100 && T.rangeDmg(T.WPN.sniper, 800) === 50);
  ck('falloffFloors', T.rangeDmg(T.WPN.bolt, 800) === 20 && T.rangeDmg(T.WPN.carbine, 800) === 15 && T.rangeDmg(T.WPN.mark, 800) === 35 && T.rangeDmg(T.WPN.bolt, 520) > 20 && T.rangeDmg(T.WPN.bolt, 520) < 50);
  ck('sniperReaches500', heightAt('sniper', 500) != null);
  R.h = { bolt200: heightAt('bolt', 200), sniper300: heightAt('sniper', 300) };
  console.log(JSON.stringify(R)); const bad = Object.keys(R).filter(k => R[k] === false); console.log(bad.length ? 'FAILED: ' + bad.join(', ') : 'ALL ' + Object.keys(R).filter(k => typeof R[k] === 'boolean').length + ' CHECKS PASSED'); process.exit(bad.length ? 1 : 0);
})().catch(e => { console.log('TEST ERROR', e); process.exit(1); });
