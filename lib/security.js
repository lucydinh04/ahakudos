import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
export class HttpError extends Error{constructor(status,message){super(message);this.status=status;}}
export function appOrigin(){
 const raw=(process.env.APP_ORIGIN||'').trim().replace(/\/$/,'');
 try{const u=new URL(raw);if(u.protocol!=='https:'||u.username||u.password||u.port||u.origin!==raw||u.pathname!=='/'||u.search||u.hash)throw new Error();return u.origin;}
 catch(e){throw new HttpError(503,'Thiếu APP_ORIGIN production hợp lệ.');}
}
export function handbookOrigin(){
 const raw=(process.env.HANDBOOK_ORIGIN||'').trim().replace(/\/$/,'');
 if(!raw)return '';
 try{const u=new URL(raw);if(u.protocol!=='https:'||u.username||u.password||u.port||u.origin!==raw)throw new Error();return u.origin;}
 catch(e){throw new HttpError(503,'HANDBOOK_ORIGIN không hợp lệ.');}
}
export function userEmail(req){
 const header=String(process.env.HANDBOOK_USER_HEADER||'x-ahamove-user-email').toLowerCase();
 const email=String(req.headers[header]||'').trim().toLowerCase();
 if(!/^[^@\s]+@ahamove\.com$/i.test(email))throw new HttpError(401,'AhaKudos chưa nhận được danh tính nhân sự từ AhaHandbook.');
 return email;
}
export function bridgeSecret(){
 const s=String(process.env.GAS_BRIDGE_SECRET||'').trim();
 if(!/^[a-f0-9]{64}$/.test(s))throw new HttpError(503,'Thiếu GAS_BRIDGE_SECRET production hợp lệ.');
 return s;
}
export function same(a,b){const x=Buffer.from(String(a)),y=Buffer.from(String(b));return x.length===y.length&&timingSafeEqual(x,y);}
export function checkPost(req){
 if(req.method!=='POST')throw new HttpError(405,'Chỉ chấp nhận POST.');
 const origin=String(req.headers.origin||'');
 const allowed=[appOrigin(),handbookOrigin()].filter(Boolean);
 if(origin&&!allowed.includes(origin))throw new HttpError(403,'Nguồn yêu cầu không được phép.');
 const type=String(req.headers['content-type']||'').split(';')[0];
 if(type!=='application/json')throw new HttpError(415,'Yêu cầu phải là JSON.');
}
export function bodyObject(req,limit=80000){
 try{const b=req.body;if(!b||typeof b!=='object'||Array.isArray(b)||Buffer.byteLength(JSON.stringify(b),'utf8')>limit)throw new Error();return b;}
 catch(e){throw new HttpError(400,'Nội dung yêu cầu không hợp lệ hoặc quá dài.');}
}
export function noCache(res){res.setHeader('Cache-Control','private, no-store, max-age=0');res.setHeader('Vercel-CDN-Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Robots-Tag','noindex, nofollow, noarchive');}
export function fail(res,e){const code=e instanceof HttpError?e.status:500;return res.status(code).json({ok:false,error:e instanceof HttpError?e.message:'Có lỗi xử lý. Kiểm tra dữ liệu trước khi thao tác lại.'});}
export function signedEnvelope(req,method,args){
 const payload=JSON.stringify({v:29,ts:Date.now(),nonce:randomBytes(16).toString('hex'),origin:appOrigin(),actorEmail:userEmail(req),method,args});
 const signature=createHmac('sha256',bridgeSecret()).update('AHAKUDOS/V29\n'+payload).digest('hex');
 return {payload,signature};
}
