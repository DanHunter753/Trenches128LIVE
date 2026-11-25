'use strict';
// Fast-forward Operations simulation for balance work: T128_FAST=1 FILL=64 SECS=240 node tools/opsim.js
// Prints the operation state every simulated minute and on every change (sector, battalion, stall, lines, depots).
process.argv = ['n', 'x', '--port', '8096', '--fill', +process.env.FILL || 64];
const S = require('../server.js'), X = S._test; let last = '', t0 = Date.now(), tk = 0;
const iv = setInterval(() => { const o = X.op(); const st = o ? `att ${o.att} sector ${o.sector} bat ${o.bat} tk ${o.tk}/${o.tkMax} stall ${o.stall ? 1 : 0} regroup ${Math.ceil(o.regroup)}` : 'none';
  const owners = X.OB.map(q => q.owner).join(''); const dp = X.DP.map(d => d.owner).join(',');
  const key = o ? [o.att, o.sector, o.bat, o.stall ? 1 : 0, o.regroup > 0 ? 1 : 0, owners, dp].join('|') : 'none'; const line = st + ' | lines ' + owners + ' | depots ' + dp; tk++; const t = X.tickNo(); if (t - (global.lp || 0) >= 1200) { global.lp = t; console.log('[' + t + '] ' + line); }
  if (key !== last) { console.log('[' + X.tickNo() + '] * ' + line); last = key; } }, 50);
setTimeout(() => { console.log('wall', ((Date.now() - t0) / 1000).toFixed(0) + 's'); process.exit(0); }, +process.env.SECS * 1000 || 120000);
