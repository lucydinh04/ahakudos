import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
const COOKIE='__Host-ahakudos_v28';
const AGE=8*60*60;
export class HttpError extends Error{constructor(status,message){super(message);this.status=status;}}
export function accessKey(){
 const key=process.env.TEST_ACCESS_KEY||'';
 if(!/^[a-f0-9]{64}$/.test(key))throw new HttpError(503,'Thiếu TEST_ACCESS_KEY hợp lệ. Mở hướng dẫn V28, tạo khóa 64 ký tự rồi điền trong Vercel.');
 return key;
}
export function appOrigin(){
 try{
  const raw=(process.env.APP_ORIGIN||'').trim().replace(/\/$/,'');const u=new URL(raw);
  if(u.protocol!=='https:'||u.username||u.password||u.port||u.origin!==raw||u.pathname!=='/'||u.search||u.hash)throw new Error();
  return u.origin;
 }catch(e){throw new HttpError(503,'Thiếu APP_ORIGIN hợp lệ: điền URL Vercel chính, có https://, không thêm đường dẫn.');}
}
export function same(a,b){const x=Buffer.from(String(a)),y=Buffer.from(String(b));return x.length===y.length&&timingSafeEqual(x,y);}
export function checkPost(req){
 if(req.method!=='POST')throw new HttpError(405,'Chỉ chấp nhận POST.');
 if(req.headers.origin!==appOrigin())throw new HttpError(403,'Mở đúng URL Vercel chính đã cấu hình trong APP_ORIGIN. Không dùng link preview ngẫu nhiên.');
 const type=String(req.headers['content-type']||'').split(';')[0];
 if(type!=='application/json')throw new HttpError(415,'Yêu cầu phải là JSON.');
}
export function bodyObject(req,limit=80000){
 try{
  const b=req.body;
  if(!b||typeof b!=='object'||Array.isArray(b)||Buffer.byteLength(JSON.stringify(b),'utf8')>limit)throw new Error();
  return b;
 }catch(e){throw new HttpError(400,'Nội dung yêu cầu không hợp lệ hoặc quá dài.');}
}
function mac(s){return createHmac('sha256',accessKey()).update('AHAKUDOS_SESSION_V28\n'+s).digest('base64url');}
export function createSession(){
 const now=Math.floor(Date.now()/1000);
 const p=Buffer.from(JSON.stringify({v:28,iat:now,exp:now+AGE,aud:appOrigin(),jti:randomBytes(16).toString('hex')})).toString('base64url');
 return p+'.'+mac(p);
}
export function session(req){
 const c=String(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(COOKIE+'='));
 if(!c)return false;
 try{
  const token=c.slice(COOKIE.length+1);if(token.length>2000)return false;
  const pieces=token.split('.');if(pieces.length!==2||!same(mac(pieces[0]),pieces[1]))return false;
  const p=JSON.parse(Buffer.from(pieces[0],'base64url').toString('utf8')),now=Math.floor(Date.now()/1000);
  return p.v===28&&Number.isSafeInteger(p.exp)&&Number.isSafeInteger(p.iat)&&p.exp>now&&p.iat<=now+30&&p.exp-p.iat===AGE&&p.aud===appOrigin();
 }catch(e){return false;}
}
export function requireSession(req){if(!session(req))throw new HttpError(401,'Cần nhập mã để mở bản test.');}
export function setSession(res,token){res.setHeader('Set-Cookie',`${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${AGE}`);}
export function clearSession(res){res.setHeader('Set-Cookie',`${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`);}
export function noCache(res){res.setHeader('Cache-Control','private, no-store, max-age=0');res.setHeader('Vercel-CDN-Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Robots-Tag','noindex, nofollow, noarchive');}
export function fail(res,e){const code=e instanceof HttpError?e.status:500;return res.status(code).json({ok:false,error:e instanceof HttpError?e.message:'Có lỗi xử lý. Không bấm gửi lại ngay; kiểm tra Sheet trước.'});}
