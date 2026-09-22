import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {noCache,userEmail,handbookOrigin,fail} from '../lib/security.js';
export default async function handler(req,res){
 noCache(res);
 try{
  if(req.method!=='GET'){res.status(405).end();return;}
  const email=userEmail(req);
  let html=await readFile(path.join(process.cwd(),'private','workspace.html'),'utf8');
  html=html.replace('</head>',`<script>window.AHAKUDOS_USER_EMAIL=${JSON.stringify(email)};</script></head>`);
  const hb=handbookOrigin();
  const frameAncestors=hb?`'self' ${hb}`:`'self'`;
  res.setHeader('Content-Security-Policy',`default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self'; frame-src 'self' blob: data:; base-uri 'self'; object-src 'none'; frame-ancestors ${frameAncestors}; form-action 'self'`);
  res.setHeader('Permissions-Policy','camera=(), microphone=(), geolocation=()');
  res.setHeader('Content-Type','text/html; charset=utf-8');return res.status(200).send(html);
 }catch(e){return fail(res,e);}
}
