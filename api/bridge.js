import { appOrigin, checkPost, bodyObject, noCache, fail, HttpError, signedEnvelope, userEmail } from '../lib/security.js';
const METHODS={layTrangThai:0,taoKudos:1,ghiDaMo:2,doiReaction:3,duyetKudos:1,anKudos:2,suaKudosDuyet:2,datPhamViKudos:2,datTuCam:1,luuEvent:1,xoaEvent:1,datEventKichHoat:2};
function gasUrl(){
 const raw=(process.env.GAS_EXEC_URL||'').trim();
 const pattern=/^https:\/\/script\.google\.com\/(?:macros\/s\/|a\/macros\/[A-Za-z0-9.-]+\/s\/|a\/[A-Za-z0-9.-]+\/macros\/s\/)[A-Za-z0-9_-]+\/exec$/;
 if(!pattern.test(raw))throw new HttpError(503,'GAS_EXEC_URL phải là Apps Script Web app URL production kết thúc bằng /exec.');
 return raw;
}
async function callGoogle(req,method,args){
 const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),50000);
 try{
  let response=await fetch(gasUrl(),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(signedEnvelope(req,method,args)),redirect:'manual',signal:controller.signal});
  if([301,302,303].includes(response.status)){
   const where=new URL(response.headers.get('location')||'');
   if(where.protocol!=='https:'||where.hostname!=='script.googleusercontent.com'||where.username||where.password)throw new HttpError(502,'Google trả chuyển hướng không hợp lệ.');
   response=await fetch(where,{method:'GET',redirect:'error',signal:controller.signal});
  }
  if(!response.ok)throw new HttpError(502,'Google chưa phản hồi hợp lệ. Kiểm tra Apps Script deployment và Executions.');
  const text=await response.text();if(text.length>2500000)throw new HttpError(502,'Phản hồi Google vượt giới hạn.');
  let result;try{result=JSON.parse(text);}catch(e){throw new HttpError(502,'Google trả nội dung không phải JSON.');}
  if(!result||typeof result.ok!=='boolean')throw new HttpError(502,'Phản hồi Google không đúng định dạng AhaKudos production.');
  if(!result.ok)throw new HttpError(400,String(result.error||'Google từ chối thao tác.').slice(0,700));
  return result.data;
 }catch(e){if(e.name==='AbortError')throw new HttpError(504,'Google phản hồi quá lâu. Kiểm tra Sheet trước khi thao tác lại.');if(e instanceof HttpError)throw e;throw new HttpError(502,'Chưa kết nối được Google backend.');}
 finally{clearTimeout(timeout);}
}
export default async function handler(req,res){
 noCache(res);
 try{
  checkPost(req);userEmail(req);
  const b=bodyObject(req);
  if(!Object.prototype.hasOwnProperty.call(METHODS,b.method)||!Array.isArray(b.args)||b.args.length!==METHODS[b.method])throw new HttpError(400,'Thao tác không được cho phép.');
  const data=await callGoogle(req,b.method,b.args);
  return res.status(200).json({ok:true,data});
 }catch(e){return fail(res,e);}
}
