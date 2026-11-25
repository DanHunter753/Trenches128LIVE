'use strict';
// Load test: N simulated players connect over WebSocket, deploy, run toward the enemy and fire like real clients
// (input batches every 33 ms, one command per 16 ms frame). Prints bytes received per client and message mix.
// Usage: node tools/loadtest.js [players=200] [seconds=60] [url=ws://localhost:8099]
const N = +process.argv[2] || 200, DUR = (+process.argv[3] || 60) * 1000, URL = process.argv[4] || 'ws://localhost:8099';
const CLS = [['rifleman', 'bolt'], ['assault', 'shotgun'], ['rifleman', 'bolt'], ['medic', 'carbine'], ['rifleman', 'carbine']];
let bin = 0, txt = 0, nbin = 0, ntxt = 0, joined = 0, closed = 0; const kinds = {};
const start = Date.now(); let measureFrom = 0, binM = 0, txtM = 0;
function bot(i) {
  const ws = new WebSocket(URL); ws.binaryType = 'arraybuffer'; let team = 0, seq = 0, yaw = 0, t0 = Math.random() * 1000, tick = 0;
  ws.onopen = () => ws.send(JSON.stringify({ t: 'hello', name: 'load' + i }));
  ws.onmessage = ev => {
    if (typeof ev.data !== 'string') { bin += ev.data.byteLength; nbin++; if (measureFrom) binM += ev.data.byteLength; tick = new DataView(ev.data).getUint32(1, true); return; }
    txt += ev.data.length; ntxt++; if (measureFrom) txtM += ev.data.length;
    const m = JSON.parse(ev.data); kinds[m.t] = (kinds[m.t] || 0) + (measureFrom ? ev.data.length : 0);
    if (m.t === 'prof') { const [c, w] = CLS[i % CLS.length]; ws.send(JSON.stringify({ t: 'join', cls: c, w, u: 'bandage', sq: i % 8 })); }
    if (m.t === 'w') { team = m.team; yaw = team === 0 ? 0 : Math.PI; joined++; }
  };
  ws.onclose = () => closed++;
  const iv = setInterval(() => {
    if (ws.readyState !== 1 || !joined) return; const now = Date.now() + t0, c = [];
    for (let k = 0; k < 2; k++) { const fire = Math.sin(now / 700 + i) > .3 ? 8 : 0, sprint = Math.sin(now / 3000 + i) > .5 ? 1 : 0;
      c.push([++seq, 16, Math.sin(now / 2500 + i * 1.3) > -.3 ? 1 : 0, Math.sin(now / 1100 + i) > .6 ? 1 : 0, fire | (fire ? 0 : sprint), +(yaw + Math.sin(now / 900 + i) * .5).toFixed(4), +(Math.sin(now / 1300 + i) * .05).toFixed(4)]); }
    ws.send(JSON.stringify({ t: 'in', c, rt: tick - 2 }));
  }, 33);
  setTimeout(() => { clearInterval(iv); ws.close(); }, DUR);
}
for (let i = 0; i < N; i++) setTimeout(() => bot(i), i * 15);
setTimeout(() => { measureFrom = Date.now(); }, Math.min(20000, DUR / 3));
setTimeout(() => {
  const secs = (Date.now() - measureFrom) / 1000;
  console.log(JSON.stringify({ players: N, joined, closed, perClientKBs: +((binM + txtM) / secs / N / 1024).toFixed(1), binKBs: +(binM / secs / N / 1024).toFixed(1), jsonKBs: +(txtM / secs / N / 1024).toFixed(1),
    totalMBs: +((binM + txtM) / secs / 1048576).toFixed(2), jsonTop: Object.entries(kinds).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => k + ':' + (v / secs / N / 1024).toFixed(2) + 'KB/s') }));
  process.exit(0);
}, DUR - 500);
