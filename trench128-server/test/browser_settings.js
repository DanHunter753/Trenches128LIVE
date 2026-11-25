// Settings UI test (stubbed THREE). Server must run with T128_TEST=1 and xp.json {"settester":900}: node test/browser_settings.js
const { chromium } = require('playwright');
const STUB = `(function(){function mk(){const store={};const f=function(){return mk()};return new Proxy(f,{get(t,k){if(k===Symbol.toPrimitive)return()=>0;if(k in store)return store[k];if(k==='length')return 0;store[k]=mk();return store[k]},set(t,k,v){store[k]=v;return true},apply(){return mk()},construct(){return mk()}})}window.THREE=new Proxy({},{get(t,k){if(/Filter$/.test(String(k)))return 1;return function(){return mk()}}})})();`;
const R={};const ck=(k,v)=>{R[k]=!!v};
(async()=>{const b=await chromium.launch({executablePath:'/usr/bin/google-chrome',args:['--no-sandbox']});const ctx=await b.newContext({viewport:{width:1100,height:800}});const p=await ctx.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.addInitScript(()=>{window.__sent=[];const o=WebSocket.prototype.send;WebSocket.prototype.send=function(d){if(typeof d==='string')window.__sent.push(d);return o.call(this,d)}});
await p.route('**/three.min.js',r=>r.fulfill({contentType:'text/javascript',body:STUB}));
await p.goto((process.argv[2]||'http://localhost:8099'));await p.waitForSelector('#nm');
// settings from the connect screen via gear
await p.click('#gear');ck('gearOpens',await p.isVisible('#set'));
await p.evaluate(()=>{const r=document.querySelector('#setb input[data-k="master"]');r.value=.3;r.dispatchEvent(new Event('input',{bubbles:true}))});
ck('masterApplied',await p.evaluate(()=>S.master===.3));
await p.click('#setb [data-t="controls"]');
await p.evaluate(()=>{const r=document.querySelector('#setb input[data-k="sens"]');r.value=2;r.dispatchEvent(new Event('input',{bubbles:true}))});
await p.click('#setb [data-b="reload"]');ck('rebindPrompt',/Press a key/.test(await p.innerText('#setb')));
await p.keyboard.press('KeyT');ck('rebound',await p.evaluate(()=>S.binds.reload==='KeyT'));
await p.click('#setb [data-b="grenade"]');await p.keyboard.press('KeyT');
ck('conflictSwapped',await p.evaluate(()=>S.binds.grenade==='KeyT'&&S.binds.reload==='KeyG'));
await p.click('#setb [data-b="grenade"]');await p.keyboard.press('Escape');ck('escCancelsRebind',await p.evaluate(()=>S.binds.grenade==='KeyT')&&await p.isVisible('#set'));
await p.click('#setb [data-b="grenade"]');await p.keyboard.press('KeyY');await p.click('#setb [data-b="reload"]');await p.keyboard.press('KeyT');
ck('finalBinds',await p.evaluate(()=>S.binds.reload==='KeyT'&&S.binds.grenade==='KeyY'));
await p.click('#setb [data-t="hud"]');await p.selectOption('#setb select[data-s="cross"]','plus');ck('crossPlus',await p.evaluate(()=>document.getElementById('cross').className==='plus'));
await p.click('#setb [data-t="video"]');await p.evaluate(()=>{const c=document.querySelector('#setb input[data-c="fps"]');c.checked=true;c.dispatchEvent(new Event('change',{bubbles:true}));const r=document.querySelector('#setb input[data-k="fov"]');r.value=95;r.dispatchEvent(new Event('input',{bubbles:true}))});
ck('fpsFov',await p.evaluate(()=>S.fps&&S.fov===95&&cam.fov===95&&document.getElementById('fps').style.display==='block'));
await p.keyboard.press('Escape');ck('escClosesSettings',!(await p.isVisible('#set')));
// persistence
await p.reload();await p.waitForSelector('#nm');
ck('persisted',await p.evaluate(()=>S.master===.3&&S.sens===2&&S.binds.reload==='KeyT'&&S.fov===95&&S.cross==='plus'));
// in game
await p.fill('#nm','SetTester');await p.click('#cn');await p.waitForSelector('#go');await p.click('#go');await p.waitForFunction(()=>me.alive===true,null,{timeout:8000});
await p.evaluate(()=>{Object.defineProperty(document,'pointerLockElement',{get:()=>document.getElementById('c'),configurable:true})});
await p.evaluate(()=>{window.__sent.length=0});await p.keyboard.press('KeyT');await p.waitForTimeout(100);
ck('reboundKeySendsReload',await p.evaluate(()=>window.__sent.some(m=>m.includes('"a":"reload"'))));
await p.evaluate(()=>{window.__sent.length=0});await p.keyboard.press('KeyG');await p.waitForTimeout(100);
ck('oldKeyIsGrenadeNoMore',await p.evaluate(()=>!window.__sent.some(m=>m.includes('"a":"grenade"'))));
await p.keyboard.press('KeyY');await p.waitForTimeout(100);ck('newGrenadeKey',await p.evaluate(()=>window.__sent.some(m=>m.includes('"a":"grenade"'))));
// sensitivity + invert
const dy=async()=>p.evaluate(()=>{const y0=me.yaw,p0=me.pitch;window.dispatchEvent(new MouseEvent('mousemove',{movementX:100,movementY:50}));return [y0-me.yaw,me.pitch-p0]});
let a=await dy();await p.evaluate(()=>{S.sens=1});let b1=await dy();ck('sensScales',Math.abs(a[0]/b1[0]-2)<.01);
await p.evaluate(()=>{S.invY=true;me.pitch=0});let c1=await dy();ck('invertY',c1[1]>0);await p.evaluate(()=>{S.invY=false});
// toggle crouch
await p.evaluate(()=>{S.togCrouch=true});await p.keyboard.press('KeyC');await p.waitForTimeout(250);
await p.keyboard.up('KeyC');await p.waitForTimeout(250);ck('toggleCrouchHolds',await p.evaluate(()=>tCrouch===true));
await p.keyboard.press('KeyC');await p.waitForTimeout(100);ck('toggleCrouchOff',await p.evaluate(()=>tCrouch===false));
// ESC pause flow (pointer lock released)
await p.evaluate(()=>{delete document.pointerLockElement;document.exitPointerLock()});await p.waitForTimeout(600);
ck('pauseShown',await p.isVisible('#st'));await p.click('#st');ck('settingsFromPause',await p.isVisible('#set'));await p.click('#setb [data-close]');ck('closeKeepsPause',await p.isVisible('#rs'));
// reset
await p.click('#gear');await p.click('#setb [data-reset]');ck('resetWorks',await p.evaluate(()=>S.master===.8&&S.binds.reload==='KeyR'&&S.fov===85));
R.errs=errs;console.log(JSON.stringify(R,null,1));const bad=Object.entries(R).filter(([k,v])=>k!=='errs'&&!v);console.log(bad.length||errs.length?'FAILED '+bad.map(x=>x[0])+' '+errs:'ALL '+Object.keys(R).length+' PASSED');await b.close()})().catch(e=>{console.error('FAIL',e.message);process.exit(1)});
