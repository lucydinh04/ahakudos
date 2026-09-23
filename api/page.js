import {readFile} from 'node:fs/promises';
import path from 'node:path';

const USERS={
  quocanh:'quocanh.demo@ahamove.com',
  ngocphuong:'ngocphuong.demo@ahamove.com'
};

export default async function handler(req,res){
  if(req.method!=='GET'){res.status(405).end();return;}
  const raw=String(req.query?.as||'quocanh').toLowerCase();
  const email=USERS[raw]||USERS.quocanh;
  let html=await readFile(path.join(process.cwd(),'private','workspace.html'),'utf8');
  const boot=`<script>window.AHAKUDOS_USER_EMAIL=${JSON.stringify(email)};window.AHAKUDOS_VISUAL_TEST=true;</script>`;
  const toolbar=`<script>(function(){
    function add(){
      if(document.getElementById('visual-test-switcher'))return;
      var box=document.createElement('div');
      box.id='visual-test-switcher';
      box.innerHTML='<b>VISUAL TEST</b><span>Đổi vai:</span><a href="/?as=quocanh">Vương Quốc Anh</a><a href="/?as=ngocphuong">Ngọc Phương</a>';
      box.style.cssText='position:fixed;right:18px;bottom:18px;z-index:99999;display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:10px 12px;background:#0e4174;color:white;border-radius:14px;box-shadow:0 12px 30px rgba(0,0,0,.22);font:600 12px system-ui';
      box.querySelectorAll('a').forEach(function(a){a.style.cssText='color:#0e4174;background:white;padding:7px 9px;border-radius:9px;text-decoration:none;font-weight:700'});
      document.body.appendChild(box);
    }
    if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',add);else add();
  })();</script>`;
  html=html.replace('</head>',boot+'</head>').replace('</body>',toolbar+'</body>');
  res.setHeader('Cache-Control','no-store');
  res.setHeader('Content-Type','text/html; charset=utf-8');
  res.setHeader('X-Robots-Tag','noindex, nofollow, noarchive');
  return res.status(200).send(html);
}
