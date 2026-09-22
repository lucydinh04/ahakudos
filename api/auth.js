import {accessKey,appOrigin,checkPost,bodyObject,same,session,createSession,setSession,clearSession,noCache,fail,HttpError} from '../lib/security.js';
// 256-bit random access key only, not a human password. No key in source or logs.
// No claim of distributed rate-limiting. Use Vercel Authentication / Firewall as additional protection.
export default async function handler(req,res){
 noCache(res);
 try{
  if(req.method==='GET'){accessKey();appOrigin();return res.status(200).json({ok:true,authenticated:session(req)});}
  checkPost(req);const b=bodyObject(req,1000);
  if(b.action==='logout'){clearSession(res);return res.status(200).json({ok:true});}
  if(b.action!=='login')throw new HttpError(400,'Thao tác không hợp lệ.');
  const input=typeof b.key==='string'?b.key.trim():'';
  if(!/^[a-f0-9]{64}$/.test(input)||!same(input,accessKey())){
   await new Promise(resolve=>setTimeout(resolve,350));
   throw new HttpError(401,'Mã chưa đúng. Dùng MÃ VÀO BẢN TEST, không dùng khóa kết nối Google hoặc mật khẩu email.');
  }
  setSession(res,createSession());return res.status(200).json({ok:true});
 }catch(e){return fail(res,e);}
}
