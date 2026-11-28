'use strict';
// v0.47.1 password recovery: a recovery code at registration, reset with it (logs out old sessions, rotates the code), change
// password while logged in, a new code on request, the operator tool (server machine only), and limits on guessing.
const fs = require('fs'), os = require('os'), path = require('path');
process.argv = ['node', 'x', '--port', '8089', '--fill', '0', '--no-fetch', '--data', fs.mkdtempSync(path.join(os.tmpdir(), 't128rc-'))];
process.env.T128_TEST = '1';
const S = require('../server.js'), X = S._test;
const sleep = ms => new Promise(r => setTimeout(r, ms)), R = {}, ck = (k, v) => { R[k] = !!v; };
const api = async (p, b) => { const r = await fetch('http://127.0.0.1:8089' + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) }); return { s: r.status, j: await r.json() }; };
(async () => {
  await sleep(800);
  const reg = await api('/api/register', { name: 'Forgetful', pass: 'firstpassword' }); const rc = reg.j.rc; R.rc = rc;
  ck('codeAtRegister', /^[A-Z2-9]{4}(-[A-Z2-9]{4}){3}$/.test(rc || ''));
  ck('wrongCodeRefused', (await api('/api/reset', { name: 'Forgetful', code: 'AAAA-BBBB-CCCC-DDDD', pass: 'newpassword1' })).s === 400);
  const rs = await api('/api/reset', { name: 'forgetful', code: rc.toLowerCase().replace(/-/g, ' '), pass: 'newpassword1' });
  ck('resetWorks', rs.s === 200 && rs.j.token && rs.j.rc && rs.j.rc !== rc);
  ck('oldSessionGone', !X.ACC.session(reg.j.token) && !!X.ACC.session(rs.j.token));
  ck('loginNewPassword', (await api('/api/login', { name: 'Forgetful', pass: 'newpassword1' })).s === 200 && (await api('/api/login', { name: 'Forgetful', pass: 'firstpassword' })).s === 401);
  ck('codeUsedUp', (await api('/api/reset', { name: 'Forgetful', code: rc, pass: 'another123' })).s === 400);
  const cp = await api('/api/password', { token: rs.j.token, old: 'wrongwrong', pass: 'thirdpassword' }); ck('changeNeedsOld', cp.s === 400);
  const cp2 = await api('/api/password', { token: rs.j.token, old: 'newpassword1', pass: 'thirdpassword' }); ck('changeWorks', cp2.s === 200 && (await api('/api/login', { name: 'Forgetful', pass: 'thirdpassword' })).s === 200);
  const nr = await api('/api/recovery', { token: cp2.j.token }); ck('newCode', nr.s === 200 && /-/.test(nr.j.rc) && (await api('/api/reset', { name: 'Forgetful', code: rs.j.rc, pass: 'xxxxxxxx1' })).s === 400);
  const op = await api('/api/opcode', { name: 'forgetful' }); ck('operatorLocal', op.s === 200 && /-/.test(op.j.rc));
  const op2 = await fetch('http://127.0.0.1:8089/api/opcode', { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': '5.6.7.8' }, body: '{"name":"forgetful"}' }); ck('operatorNotViaProxy', op2.status === 403);
  ck('operatorCodeWorks', (await api('/api/reset', { name: 'Forgetful', code: op.j.rc, pass: 'fourthpass' })).s === 200);
  let last = 0; for (let i = 0; i < 8; i++) last = (await api('/api/reset', { name: 'Forgetful', code: 'ZZZZ-ZZZZ-ZZZZ-ZZZZ', pass: 'whatever12' })).j.err; ck('guessingLimited', /Too many attempts/.test(last || ''));
  console.log(JSON.stringify(R)); const bad = Object.keys(R).filter(k => R[k] === false); console.log(bad.length ? 'FAILED: ' + bad.join(', ') : 'ALL ' + Object.keys(R).filter(k => typeof R[k] === 'boolean').length + ' CHECKS PASSED'); process.exit(bad.length ? 1 : 0);
})().catch(e => { console.log('TEST ERROR', e); process.exit(1); });
