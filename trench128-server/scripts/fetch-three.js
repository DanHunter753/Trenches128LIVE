'use strict';
// Downloads three.js r128 into public/vendor so the game no longer needs a CDN:  node scripts/fetch-three.js
// The server also runs this once by itself at start-up when the file is missing (best effort; pass --no-fetch to skip).
const fs = require('fs'), path = require('path'), https = require('https');
const OUT = path.join(__dirname, '..', 'public', 'vendor', 'three.min.js');
const SRC = ['https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js', 'https://unpkg.com/three@0.128.0/build/three.min.js', 'https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.min.js'];
function get(url, hops = 0) {
  return new Promise((ok, no) => {
    https.get(url, { timeout: 15000 }, r => {
      if (r.statusCode >= 300 && r.statusCode < 400 && r.headers.location && hops < 5) { r.resume(); return ok(get(new URL(r.headers.location, url).href, hops + 1)); }
      if (r.statusCode !== 200) { r.resume(); return no(new Error('HTTP ' + r.statusCode)); }
      const b = []; r.on('data', d => b.push(d)); r.on('end', () => ok(Buffer.concat(b))); r.on('error', no);
    }).on('error', no).on('timeout', function () { this.destroy(new Error('timeout')); });
  });
}
const valid = buf => buf.length > 400000 && buf.includes('WebGLRenderer') && buf.includes('PerspectiveCamera');
async function fetchThree(quiet) {
  if (fs.existsSync(OUT) && valid(fs.readFileSync(OUT))) { if (!quiet) console.log('three.js already in ' + OUT); return true; }
  for (const u of SRC) {
    try { const b = await get(u); if (!valid(b)) throw new Error('unexpected file'); fs.mkdirSync(path.dirname(OUT), { recursive: true }); fs.writeFileSync(OUT, b); console.log('three.js r128 saved to public/vendor (' + (b.length / 1024 | 0) + ' KB) from ' + u); return true; }
    catch (e) { if (!quiet) console.log('  ' + u + ': ' + e.message); }
  }
  console.log('Could not download three.js; players will load it from the CDN instead.'); return false;
}
module.exports = { fetchThree, OUT, valid };
if (require.main === module) fetchThree(false).then(ok => process.exit(ok ? 0 : 1));
