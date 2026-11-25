'use strict';
// Copies the browser client into ./docs so GitHub Pages can serve it (Settings → Pages → Deploy from branch → /docs).
const fs = require('fs'), path = require('path'); const root = path.join(__dirname, '..'), out = path.join(root, 'docs');
fs.rmSync(out, { recursive: true, force: true }); fs.mkdirSync(out);
fs.copyFileSync(path.join(root, 'public', 'index.html'), path.join(out, 'index.html'));
fs.copyFileSync(path.join(root, 'shared.js'), path.join(out, 'shared.js'));
fs.cpSync(path.join(root, 'public', 'assets'), path.join(out, 'assets'), { recursive: true });
if (fs.existsSync(path.join(root, 'public', 'vendor'))) fs.cpSync(path.join(root, 'public', 'vendor'), path.join(out, 'vendor'), { recursive: true });   // three.js, if fetched (npm run vendor)
fs.writeFileSync(path.join(out, '.nojekyll'), '');
console.log('docs/ ready');
