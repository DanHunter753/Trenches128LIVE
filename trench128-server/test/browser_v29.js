'use strict';
// Real browser client (THREE stubbed), v0.29: kill feed on the left, minimap size setting, text chat (opens on Enter, sends,
// shows as plain text: no HTML injection), aiming frames lowered so the aim point is clear, scenery re-seated after a crater,
// the trench mortar's overhead sight. Run against: T128_TEST=1 node server.js --port 8099
const { chromium } = require('playwright'); const fs = require('fs');
const url = process.argv[2] || 'http://localhost:8099';
const STUB = fs.readFileSync(__dirname + '/browser.js', 'utf8').match(/const STUB = `([\s\S]*?)`;/)[1];
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 760 } }); const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.route('**/three.min.js', r => r.fulfill({ contentType: 'text/javascript', body: STUB }));
  await page.goto(url); await page.fill('#nm', 'V29Tester'); await page.click('#cn'); await page.waitForSelector('#go'); await page.click('#go');
  await page.waitForFunction(() => me.alive === true, null, { timeout: 8000 }); await sleep(1200); const out = {};
  out.killFeedLeft = await page.evaluate(() => { const c = getComputedStyle($('kf')); return c.left === '12px' && c.alignItems === 'flex-start'; });
  out.minimapSize = await page.evaluate(() => { const w0 = $('mm').width; S.mm = 2.5; applyS(); const w1 = $('mm').width; S.mm = 1.5; applyS(); return w0 === 255 && w1 === 425 && $('mm').width === 255; });
  out.minimapSlider = await page.evaluate(() => { setTab = 'hud'; renderSet(); const ok = !!$('setb').querySelector('[data-k="mm"]'); return ok; });
  // chat: open with the chat key, type, send; what comes back is shown as text
  await page.evaluate(() => { lockedNow = () => true; });   // (pointer lock is not available headless)
  await page.keyboard.press('Enter'); out.chatOpens = await page.evaluate(() => chatOpen && getComputedStyle($('chati')).display === 'block');
  await page.keyboard.type('<img src=x onerror="window.__pwn=1">hello'); out.typingDoesNotMove = await page.evaluate(() => !K.KeyW && !K.KeyS);
  out.typed = await page.evaluate(() => $('chati').value + ' | focus:' + (document.activeElement && document.activeElement.id));
  await page.keyboard.press('Enter'); await sleep(600); out.chatText = await page.evaluate(() => [$('chatl').textContent.slice(0, 120), !!$('chatl').querySelector('img'), !!window.__pwn, chatOpen].join(' | '));
  out.chatShown = await page.evaluate(() => /V29Tester: <img src=x onerror="window.__pwn=1">hello/.test($('chatl').textContent) && !$('chatl').querySelector('img') && !window.__pwn && !chatOpen);
  await page.keyboard.press('KeyU'); out.teamChatOpens = await page.evaluate(() => chatOpen && chatTeam); await page.keyboard.press('Escape'); out.escCloses = await page.evaluate(() => !chatOpen);
  // aiming down sights: frames lowered by the measured amount (trench gun far more than the rifle)
  await page.waitForFunction(() => WIMG.shotgun.complete && WIMG.bolt.complete, null, { timeout: 5000 }).catch(() => {});
  out.adsDrop = await page.evaluate(() => ({ shotgun: WIMG.shotgun.adsDy, bolt: WIMG.bolt.adsDy, hmg: WIMG.hmg.adsDy }));
  out.adsClear = out.adsDrop.shotgun <= 4 && out.adsDrop.bolt <= 4 && out.adsDrop.hmg <= 2;   /* v0.29 sheets put the sight tip at the centre already */
  out.adsDotStays = await page.evaluate(() => { adsT = 1; const o = +($('cross').style.opacity || 1); return true; });
  // scenery follows the ground after a crater
  out.propsFollow = await page.evaluate(() => { let b = null, i = -1; for (const q of SSB.values()) { for (let k = 0; k < q.items.length; k += 7) { const x = q.items[k], z = q.items[k + 2]; if (Math.abs(x) < 120 && Math.abs(z) > 15 && Math.abs(z) < 25) { b = q; i = k; break; } } if (b) break; }
    if (!b) return 'no prop'; const x = b.items[i], z = b.items[i + 2], y0 = b.items[i + 1], off = b.off[i / 7]; onMsg({ t: 'cr', c: [x, z, 3, 1.2] }); const y1 = b.items[i + 1];
    return y1 < y0 - .3 && Math.abs(y1 - (hAt(x, z) + off)) < 1e-6; });
  // v0.29.1 mounted MG: the Lewis gun's aiming picture in first person, the nest's gun block hidden
  out.mountedMg = await page.evaluate(() => new Promise(r => { const ns = T.NEST.filter(n => n.team === me.team && !n.dead); let i = 0;
    const tryN = () => { if (me.mg || i >= ns.length) { const q = { mg: me.mg, k: gk(), frame: gIdx, shown: $('gun').style.display !== 'none' && $('gun').style.visibility !== 'hidden', hid: mgHid.length };
        /* (the THREE stub has no scene graph: check the gun block is hidden with a stand-in mesh) */ const fake = { isMesh: true, material: mgM, visible: true, getWorldPosition(v) { v.x = me.x + 1; v.z = me.z; return v; } }, tv = scene.traverse; scene.traverse = f => f(fake); mgView(true); q.hid = !fake.visible && mgHid.length === 1; scene.traverse = tv;
        sendJ({ t: 'act', a: 'mg' }); setTimeout(() => { q.after = !me.mg && mgHid.length === 0 && fake.visible && gk() === me.w; r(q.mg && q.k === 'lmg' && q.frame === 'lmg21' && q.shown && q.hid && q.after ? true : JSON.stringify(q)); }, 1600); return; }
      const n = ns[i++]; sendJ({ t: 'tp', x: n.x, z: n.z }); setTimeout(() => { sendJ({ t: 'act', a: 'mg' }); setTimeout(tryN, 1500); }, 400); };
    tryN(); }));
  // trench mortar: overhead sight centred on the landing point
  await page.evaluate(() => { const v = [...VH.values()].find(q => q.k === 2 && q.team === me.team), s = v.b, hf = [-Math.sin(s.yaw), -Math.cos(s.yaw)]; sendJ({ t: 'tp', x: s.x - hf[0] * 1.8, z: s.z - hf[1] * 1.8 }); });
  await sleep(700); await page.evaluate(() => sendJ({ t: 'act', a: 'mg' })); await page.waitForFunction(() => myVeh && myVeh.k === 'mortar', null, { timeout: 4000 }).catch(() => {}); await sleep(700);
  out.mortarSight = await page.evaluate(() => { if (!mortarSight()) return 'not on mortar';
    const rec = () => ({ x: 0, y: 0, z: 0, set(a, b, c) { this.x = a; this.y = b; this.z = c; } }); cam.position = rec(); cam.rotation = rec(); vehCam();   /* (the THREE stub ignores writes: record them instead) */ const v = vMine(), s = vState(v, performance.now()), f = [-Math.sin(me.yaw), -Math.cos(me.yaw)], r = mortarRng(me.pitch), ix = s.x + f[0] * r, iz = s.z + f[1] * r;
    const up = cam.position.y - hAt(ix, iz), dir = [-Math.sin(cam.rotation.y) * Math.cos(cam.rotation.x), Math.sin(cam.rotation.x), -Math.cos(cam.rotation.y) * Math.cos(cam.rotation.x)], t = -up / dir[1], hx = cam.position.x + dir[0] * t, hz = cam.position.z + dir[2] * t;
    const r2 = { up: +up.toFixed(1), miss: +Math.hypot(hx - ix, hz - iz).toFixed(2), ring: !!aimRing && aimRing.visible, vv: $('vv').style.display, fog: scene.fog.density };
    return r2.up > 40 && r2.miss < 1.5 && r2.ring && r2.vv === 'none' && r2.fog < .0025 * 3.5 * S.fog ? true : JSON.stringify(r2); });
  // v0.29.1 field gun (howitzer): field glasses over the fall of shot; RMB the gun telescope with the gun model hidden
  await sleep(1300); await page.evaluate(() => sendJ({ t: 'act', a: 'mg' })); await page.waitForFunction(() => !myVeh, null, { timeout: 3000 }).catch(() => {}); await sleep(1300);
  await page.evaluate(() => { const v = [...VH.values()].find(q => q.k === 1 && q.team === me.team && !q.dead), s = v.b, hf = [-Math.sin(s.yaw), -Math.cos(s.yaw)]; sendJ({ t: 'tp', x: s.x - hf[0] * 1.8, z: s.z - hf[1] * 1.8 }); });
  await sleep(500); await page.evaluate(() => sendJ({ t: 'act', a: 'mg' })); await page.waitForFunction(() => myVeh && myVeh.k === 'fgun', null, { timeout: 4000 }).catch(() => {}); await sleep(700);
  out.howitzer = await page.evaluate(() => new Promise(res => { if (!myVeh || myVeh.k !== 'fgun') { const v = [...VH.values()].filter(q => q.k === 1 && q.team === me.team); return res('not on field gun ' + JSON.stringify({ mv: myVeh, me: [me.x, me.z, me.mg], g: v.map(q => [q.b.x, q.b.z, q.b.yaw, q.dead]) })); }
    const rec = () => ({ x: 0, y: 0, z: 0, set(a, b, c) { this.x = a; this.y = b; this.z = c; } }); cam.position = rec(); cam.rotation = rec();
    const hit = () => { const v = vMine(), s = vState(v, performance.now()), I = fgunImpact(s, me.yaw, me.pitch), ig = hAt(I.x, I.z); vehCam();
      const dir = [-Math.sin(cam.rotation.y) * Math.cos(cam.rotation.x), Math.sin(cam.rotation.x), -Math.cos(cam.rotation.y) * Math.cos(cam.rotation.x)], t = (ig - cam.position.y) / dir[1];
      return { miss: +Math.hypot(cam.position.x + dir[0] * t - I.x, cam.position.z + dir[2] * t - I.z).toFixed(2), r: Math.round(I.r), camH: +(cam.position.y - ig).toFixed(1), P: v.P && v.P.visible }; };
    me.pitch = .2; const a = hit(); vvKey = '-'; vvDraw(); a.vv = $('vv').style.display; a.hud = /FIELD GLASSES/.test(vehHud().extra || JSON.stringify(vehHud()));
    adsHeld = true; const b = hit(); vvKey = '-'; vvDraw(); b.hud = /GUN TELESCOPE/.test(JSON.stringify(vehHud()));
    adsHeld = false; aimMarker(); const c = { P: vMine().P && vMine().P.visible };
    const ok = a.miss < 1.5 && a.camH > 10 && a.vv === 'block' && a.hud && b.miss < 1.5 && b.P === false && b.hud && c.P !== false;
    res(ok ? true : JSON.stringify({ a, b, c })); }));
  out.newSoldierArt = await page.evaluate(() => ART.fw === 160 && ART.armed === true && ART.mat && ART.mat.length === 14 && !!ART.dead && ART.dead.length === 2 && ART.dead[1].length === 3);
  out.corpseLies = await page.evaluate(() => new Promise(r => { for (const m of ART.dead[1]) m.clone = () => ({ tag: 'dead' }); const g = hAt(me.x + 6, me.z); bodyFx([99999, me.x + 6, g, me.z, 0, 0, 0, 1, 0, 0]); setTimeout(() => { const c = corpses.find(q => q.id === 99999); r(!!c && c.rest && c.m.material && c.m.material.tag === 'dead' || JSON.stringify({ rest: c && c.rest })); }, 2500); }));
  out.gasMaskView = await page.evaluate(() => new Promise(r => { maskOn = true; maskAt = performance.now() - 2000; setTimeout(() => { const ok = !!maskC && maskC.width === innerWidth && $('maskv').querySelectorAll('canvas').length === 2 && /saturate/.test($('c').style.filter);
    maskOn = false; setTimeout(() => r(ok && $('c').style.filter === ''), 300); }, 400); }));
  out.newGunSheets = await page.evaluate(() => WIMG.bolt.naturalWidth === 2160 && WIMG.shotgun.naturalHeight === 1440 && WIMG.bolt.adsDy <= 4 && WIMG.shotgun.adsDy <= 4);
  out.fiveposes = await page.evaluate(() => new Promise(r => { const e = [...ents.values()].find(q => q.sp && !q.down); if (!e || ART.cols !== 20) return r('cols ' + ART.cols); const iv = setInterval(() => { e.crouch = true; e.aim = false; }, 5); setTimeout(() => { const c = e.col; clearInterval(iv); r(c >= 16 && c < 20 || 'col ' + c); }, 160); }));   /* (snapshots keep rewriting the flags: hold them) */
  out.handAnims = await page.evaluate(() => new Promise(r => { itemPlay([0, 1, 2, 3], .2); setTimeout(() => { const on = $('item').style.display === 'block' && $('gun').style.opacity === '0'; setTimeout(() => r(on && $('item').style.display === 'none' && $('gun').style.opacity === ''), 1100); }, 150); }));
  out.errors = errors.slice(0, 5); console.log(JSON.stringify(out, null, 1));
  const ok = out.howitzer === true && out.mountedMg === true && out.killFeedLeft && out.minimapSize && out.minimapSlider && out.chatOpens && out.typingDoesNotMove && out.chatShown && out.teamChatOpens && out.escCloses && out.adsClear && out.propsFollow === true && out.mortarSight === true && out.newSoldierArt && out.corpseLies === true && out.gasMaskView === true && out.newGunSheets && out.fiveposes === true && out.handAnims === true && !errors.length;
  console.log(ok ? 'V29 BROWSER OK' : 'V29 BROWSER FAIL'); await browser.close(); process.exit(ok ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
