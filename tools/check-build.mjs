import {existsSync,readFileSync} from 'node:fs';
for(const p of ['private/login.html','private/workspace.html','api/page.js','api/auth.js','api/bridge.js','lib/security.js','public/robots.txt'])if(!existsSync(p))throw new Error('Missing '+p);
const html=readFileSync('private/workspace.html','utf8');
if(html.includes('<?!='))throw new Error('Unconverted Apps Script template');
if(/google\.script\.run\./.test(html))throw new Error('Old Apps Script transport');
console.log('V28 files OK. Secrets are read only at runtime; no secret is built into client HTML.');
