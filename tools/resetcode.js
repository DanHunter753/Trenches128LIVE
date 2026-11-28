'use strict';
// Server operator: make a new recovery code for an account whose owner forgot the password (and lost the code).
// Run on the server's own machine:  docker compose exec game node tools/resetcode.js NAME   (or: node tools/resetcode.js NAME [port])
// Give the code to the player; on the first screen they choose "Forgot password?" and enter it with a new password.
const name = process.argv[2], port = +process.argv[3] || +process.env.PORT || +process.env.T128_PORT || 8080;
if (!name) { console.log('usage: node tools/resetcode.js NAME [port]'); process.exit(1); }
fetch('http://127.0.0.1:' + port + '/api/opcode', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name }) })
  .then(r => r.json()).then(j => { if (j.err) { console.log('Error:', j.err); process.exit(1); } console.log('Recovery code for ' + j.name + ': ' + j.rc + '\n(It replaces any earlier code. It works once.)'); })
  .catch(e => { console.log('Could not reach the game server on port ' + port + ':', e.message); process.exit(1); });
