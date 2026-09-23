import {existsSync,readFileSync} from 'node:fs';
import vm from 'node:vm';

for(const p of ['private/login.html','private/workspace.html','api/page.js','api/auth.js','api/bridge.js','lib/security.js','public/robots.txt']){
  if(!existsSync(p)) throw new Error('Missing '+p);
}

const html=readFileSync('private/workspace.html','utf8');
if(html.includes('<?!=')) throw new Error('Unconverted Apps Script template');
if(/google\.script\.run\./.test(html)) throw new Error('Old Apps Script transport');

// Catch client-side syntax errors before Vercel deploy. This would have caught
// the duplicate `const sentCount` that previously left the UI stuck at
// "Đang kết nối Google Sheets…".
const scriptRe=/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi;
let match;
let count=0;
while((match=scriptRe.exec(html))){
  count++;
  try{
    new vm.Script(match[1],{filename:`workspace-inline-${count}.js`});
  }catch(err){
    throw new Error(`Client JS syntax error in inline script #${count}: ${err.message}`);
  }
}

if(count===0) throw new Error('No inline scripts found in workspace.html');
console.log(`V28 files OK. Parsed ${count} inline scripts successfully.`);
