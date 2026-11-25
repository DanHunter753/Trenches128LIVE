'use strict';
// In-process: starts the server, joins one client, makes blue (the first attacker) take all three sectors, checks end -> reset -> respawn and that the sides swap.
process.argv = ['node', 'x', '--port', '8097', '--fill', '12'];
const S = require('../server.js'); const T = require('../shared.js');
const ws = new WebSocket('ws://localhost:8097'); ws.binaryType = 'arraybuffer'; const seen = [];
let alive = 0, respawnsAfterReset = 0, reset = false;
ws.onopen = () => ws.send(JSON.stringify({ t: 'hello', name: 'RoundTest' }));
ws.onmessage = ev => {
  if (typeof ev.data !== 'string') { if (new Uint8Array(ev.data)[0] === 4) return;   // binary tracer frame (v0.23)
 const fl = new DataView(ev.data).getUint8(26); if (reset && (fl & 1)) respawnsAfterReset++; return; }
  const m = JSON.parse(ev.data);
  if (m.t === 'prof') ws.send(JSON.stringify({ t: 'join', cls: 'assault', w: 'smg', u: 'tool', sq: 2 }));
  if (m.t === 'w') setTimeout(() => { for (const i of [3, 4, 5]) { S._test.OB[i].owner = 0; S._test.OB[i].p = 1; S._test.sectorFalls(i); } }, 1500);
  if (['end', 'reset'].includes(m.t)) { seen.push(m.t + (m.win !== undefined ? ':' + m.win : '')); if (m.t === 'reset') reset = true; }
  if (m.t === 'xp') seen.push('xp:' + m.xp);
};
setTimeout(() => { const out = { seen, respawnsAfterReset, obOwners: S._test.OB.map(o => o.owner), attackerNow: S._test.op().att };
  const ok = seen.includes('end:0') && seen.includes('reset') && respawnsAfterReset > 0 && out.obOwners.join('') === '000111' && out.attackerNow === 1;
  console.log(JSON.stringify(out)); console.log(ok ? 'ROUND OK' : 'ROUND FAIL'); process.exit(ok ? 0 : 1); }, 20000);
