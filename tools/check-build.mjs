import {existsSync,readFileSync} from 'node:fs';
for(const p of ['private/workspace.html','api/page.js','api/bridge.js','lib/security.js','public/robots.txt'])if(!existsSync(p))throw new Error('Missing '+p);
const workspace=readFileSync('private/workspace.html','utf8');
if(!workspace.includes('window.AHAKUDOS_PRODUCTION=true'))throw new Error('Workspace is not production build.');
if(workspace.includes('VERCEL + GOOGLE · BẢN TEST'))throw new Error('Test UI still present.');
if(workspace.includes('demo-role-select'))throw new Error('Demo role switcher still present.');
console.log('AhaKudos AhaHandbook Production files OK.');
