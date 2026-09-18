import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {noCache,session} from '../lib/security.js';
export default async function handler(req,res){
 noCache(res);
 res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self'; frame-src 'self' blob: data:; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'");
 res.setHeader('Permissions-Policy','camera=(), microphone=(), geolocation=()');
 if(req.method!=='GET'){res.status(405).end();return;}
 try{
  const file=session(req)?'workspace.html':'login.html';
  const html=await readFile(path.join(process.cwd(),'private',file),'utf8');
  res.setHeader('Content-Type','text/html; charset=utf-8');return res.status(200).send(html);
 }catch(e){res.setHeader('Content-Type','text/plain; charset=utf-8');return res.status(500).send('Thiếu file giao diện. Giữ nguyên thư mục private/ khi đưa mã lên GitHub.');}
}
