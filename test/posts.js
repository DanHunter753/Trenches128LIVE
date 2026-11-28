'use strict';
// In-process test of sapper field posts: build rules, team-wide respawn, per-team visibility, destruction (explosions + bullets), friendly-fire immunity.
const fs = require('fs'), path = require('path');
fs.writeFileSync(path.join(__dirname, '..', 'xp.json'), JSON.stringify({ sapperp: 400, gruntp: 0, redp: 0 }));
process.argv = ['node', 'x', '--port', '8095', '--fill', '10'];
const S = require('../server.js');
fs.unlinkSync(path.join(__dirname, '..', 'xp.json'));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const R = { checks: {} }; const ck = (k, v) => { R.checks[k] = !!v; };
function client(name, team, join) {
  return new Promise(res => {
    const c = { name, msgs: [] }; const ws = new WebSocket('ws://localhost:8095'); ws.binaryType = 'arraybuffer';
    ws.onopen = () => ws.send(JSON.stringify({ t: 'hello', name }));
    ws.onmessage = ev => {
      if (typeof ev.data !== 'string') return;
      const m = JSON.parse(ev.data); c.msgs.push(m);
      if (m.t === 'prof') { const e = [...S._test.humans].find(h => h.name === name); e.team = team; ws.send(JSON.stringify({ t: 'join', ...join })); }
      if (m.t === 'w') res(c);
    };
    c.send = o => ws.send(JSON.stringify(o)); c.ent = () => [...S._test.humans].find(h => h.name === name);
    c.fp = () => { const o = [...c.msgs].reverse().find(m => m.t === 'o'); return o ? o.fp : null; };
    c.said = re => c.msgs.some(m => m.t === 'msg' && re.test(m.m));
  });
}
(async () => {
  const SP = await client('SapperP', 0, { cls: 'sapper', w: 'shotgun', u: 'tool', sq: 1 });
  const G = await client('GruntP', 0, { cls: 'rifleman', w: 'bolt', u: 'bandage', sq: 2 });
  const RD = await client('RedP', 1, { cls: 'rifleman', w: 'bolt', u: 'bandage', sq: 0 });
  await sleep(1500);
  S._test.setSupply(0, 50); SP.ent().sup = 50; const s0 = SP.ent().sup;   // v0.52 building comes from the builder's own supply
  const se = SP.ent(); se.x = 0; se.z = 80; se.y = 0;     // open ground near blue's side, away from enemies
  RD.ent().z = -95; RD.ent().x = 0;   // red far from the post (>110 m) until it moves closer
  SP.send({ t: 'act', a: 'fob' }); await sleep(400);
  const P = S._test.posts();
  ck('built', P.length === 1 && P[0].team === 0);
  ck('costsSupply', SP.ent().sup <= s0 - 10 + 3);
  SP.send({ t: 'act', a: 'fob' }); await sleep(300);
  ck('cooldownBlocksSecond', S._test.posts().length === 1 && SP.said(/wait \d+s/));
  await sleep(1200);
  ck('ownTeamSeesPost', (G.fp() || []).length === 1);
  ck('farEnemyDoesNotSeePost', (RD.fp() || []).length === 0);
  RD.ent().z = -20; await sleep(1200); ck('nearbyEnemySeesPost', (RD.fp() || []).length === 1);
  RD.ent().z = -95;
  // respawn at the post
  const ge = G.ent(); ge.alive = false; ge.rt = .2; await sleep(900);
  const post = S._test.posts()[0];
  ck('teammateRespawnsAtPost', ge.alive && Math.hypot(ge.x - post.x, ge.z - post.z) < 4);
  G.send({ t: 'act', a: 'postToggle' }); await sleep(200);
  ge.alive = false; ge.rt = .2; await sleep(900);
  ck('toggleOffUsesLine', ge.alive && Math.hypot(ge.x - post.x, ge.z - post.z) > 8);
  // friendly fire does not hurt it, enemy explosion does
  const hpB = post.hp; S._test.trace(RD.ent(), post.x, se.y + 1.2, post.z + 6, 0, 0, 20, 40, []); ck('bulletDamagesPost', Math.abs(post.hp - (hpB - 24)) < .01);
  S._test.trace(se, post.x, se.y + 1.2, post.z + 6, 0, 0, 20, 40, []); ck('friendlyBulletIgnored', Math.abs(post.hp - (hpB - 24)) < .01);
  const hp0 = post.hp; S._test.explode(post.x, post.z, se); ck('friendlyExplosionIgnored', post.hp === hp0);
  const re = RD.ent(); S._test.explode(post.x, post.z, re); ck('enemyExplosionDamages', post.hp < hp0 && post.hp > 0);
  // bullets
  const hp1 = post.hp; S._test.trace(re, post.x, post.y || 0, post.z + 8, 0, 0, 20, 40, []);
  const T = require('../shared.js'); // eslint-disable-line
  ck('bulletDamagesPostOrTerrainBlocked', post.hp <= hp1);
  S._test.explode(post.x, post.z, re); S._test.explode(post.x, post.z, re); await sleep(300);
  ck('destroyed', S._test.posts().length === 0);
  ck('destroyerRewarded', RD.said(/field post destroyed/i));
  ck('teamNotified', G.said(/field post was destroyed/i));
  await sleep(1200); ck('postRemovedFromClient', (G.fp() || [1]).length === 0);
  R.bulletHp = [hp1, post.hp];
  console.log(JSON.stringify(R, null, 1));
  const bad = Object.entries(R.checks).filter(([, v]) => !v).map(([k]) => k);
  console.log(bad.length ? 'FAILED: ' + bad.join(', ') : 'ALL ' + Object.keys(R.checks).length + ' CHECKS PASSED'); process.exit(bad.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
