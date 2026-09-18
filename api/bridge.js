import { createHmac, randomBytes } from 'node:crypto';
import { appOrigin, checkPost, bodyObject, requireSession, noCache, fail, HttpError } from '../lib/security.js';
const METHODS={layTrangThai:0,taoKudos:1,doiDongY:3,ghiDaMo:2,doiReaction:3,batEmail:1,guiEmailVeToi:2,henEmailThu:3,dungThu:0,duyetKudos:1,anKudos:2,suaKudosDuyet:2,datTuCam:1};
export function gasUrl(){
 const raw=(process.env.GAS_EXEC_URL||'').trim();
 const pattern=/^https:\/\/script\.google\.com\/(?:macros\/s\/|a\/macros\/[A-Za-z0-9.-]+\/s\/|a\/[A-Za-z0-9.-]+\/macros\/s\/)[A-Za-z0-9_-]+\/exec$/;
 if(!pattern.test(raw))throw new HttpError(503,'GAS_EXEC_URL phải là Web app URL của Apps Script, kết thúc bằng /exec.');
 return raw;
}
export function signedEnvelope(method,args){
 const secret=process.env.GAS_BRIDGE_SECRET||'';
 if(!/^[a-f0-9]{64}$/.test(secret))throw new HttpError(503,'Thiếu GAS_BRIDGE_SECRET hợp lệ trong Vercel.');
 if(secret===process.env.TEST_ACCESS_KEY)throw new HttpError(503,'Hai khóa phải khác nhau. Tạo lại hai khóa riêng trong file hướng dẫn.');
 const payload=JSON.stringify({v:28,ts:Date.now(),nonce:randomBytes(16).toString('hex'),origin:appOrigin(),method,args});
 const signature=createHmac('sha256',secret).update('AHAKUDOS/V28\n'+payload).digest('hex');
 return {payload,signature};
}
export async function callGoogle(method,args){
 // Follow only documented ContentService redirects; never forward signature/body to arbitrary hosts.
 const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),50000);
 try{
  let response=await fetch(gasUrl(),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(signedEnvelope(method,args)),redirect:'manual',signal:controller.signal});
  if([301,302,303].includes(response.status)){
   const where=new URL(response.headers.get('location')||'');
   if(where.protocol!=='https:'||where.hostname!=='script.googleusercontent.com'||where.username||where.password)throw new HttpError(502,'Google yêu cầu đăng nhập hoặc trả chuyển hướng khác dự kiến. Kiểm tra quyền backend với IT, không tự tắt bảo mật.');
   response=await fetch(where,{method:'GET',redirect:'error',signal:controller.signal});
  }
  if(!response.ok)throw new HttpError(502,'Google chưa phản hồi hợp lệ. Kiểm tra Apps Script deployment, quyền truy cập và nhật ký Executions.');
  const text=await response.text();
  if(text.length>2500000)throw new HttpError(502,'Phản hồi Google vượt giới hạn của bản test.');
  let result;try{result=JSON.parse(text);}catch(e){throw new HttpError(502,'Google trả trang đăng nhập/lỗi thay vì JSON. Kiểm tra /exec và policy Web app với IT.');}
  if(!result||typeof result.ok!=='boolean')throw new HttpError(502,'Phản hồi Google không đúng định dạng V28.');
  if(!result.ok)throw new HttpError(400,String(result.error||'Google từ chối thao tác.').slice(0,700));
  return result.data;
 }catch(e){if(e.name==='AbortError')throw new HttpError(504,'Google phản hồi quá lâu. Kết quả có thể đã được lưu; kiểm tra Sheet trước khi gửi lại.');if(e instanceof HttpError)throw e;throw new HttpError(502,'Chưa kết nối được Google. Kiểm tra cấu hình, deployment và trạng thái của dịch vụ.');}
 finally{clearTimeout(timeout);}
}
export default async function handler(req,res){
 noCache(res);
 try{
  checkPost(req);requireSession(req);
  const b=bodyObject(req);
  if(!Object.prototype.hasOwnProperty.call(METHODS,b.method)||!Array.isArray(b.args)||b.args.length!==METHODS[b.method])throw new HttpError(400,'Thao tác không được cho phép.');
  const data=await callGoogle(b.method,b.args);
  return res.status(200).json({ok:true,data});
 }catch(e){return fail(res,e);}
}
