(async () => {
'use strict';
/* ============================================================================
   AhaKudos web app — V30 (AhaHandbook-ready)
   Sections: 1 Config & assets · 2 API client · 3 Boot & data store · 4 Shared renderers
             5 Employee pages · 6 Admin pages · 7 Router & bindings · 8 Deep link & start
   Identity is resolved on the server from the AhaHandbook session. The UI never chooses
   or switches the user; all permission checks are repeated server-side in Apps Script.
   ========================================================================== */

// ---- 1. Config & assets ----------------------------------------------------
const CONFIG=(()=>{try{return JSON.parse(document.getElementById('ahakudos-config').textContent||'{}');}catch(e){return {};}})();
const BASE=String(CONFIG.basePath||'');
const ART=window.AHAKUDOS_ART;
const A={logoLight:BASE+'/branding/logo-light.png',logoDark:BASE+'/branding/logo-dark.png',logoMark:BASE+'/branding/logo-mark.png',kudosLogo:BASE+'/branding/ahamove-logo-kudos.png',mascotCutout:BASE+'/illustrations/mascot-cutout.png'};
// Base KUDOS backgrounds are static files in /public/backgrounds; event backgrounds come from tab EVENTS.
const BG=(()=>{
 const LIST=[{id:'wish',name:'Tri ân',sticker:'🧧',fallback:'#FFF4D8'},{id:'move',name:'Đồng đội',sticker:'🛵',fallback:'#FFF0DB'},{id:'birthday',name:'Sinh nhật',sticker:'🎂',fallback:'#FFE3EA'},{id:'tech',name:'Cảm hứng',sticker:'🤖',fallback:'#DDEEFF'}];
 const byId={};LIST.forEach(t=>{byId[t.id]=t;});
 return {LIST,get(id){const t=byId[id]||LIST[0];return {id:t.id,name:t.name,sticker:t.sticker,fallback:t.fallback,url:BASE+'/backgrounds/'+t.id+'.png'};}};
})();
function safeGet(key){try{return localStorage.getItem(key);}catch(e){return null;}}
function safeSet(key,value){try{if(value===null)localStorage.removeItem(key);else localStorage.setItem(key,value);return true;}catch(e){return false;}}

// ---- 2. API client ---------------------------------------------------------
class ApiError extends Error{constructor(message,code,status){super(message);this.code=code||'ERROR';this.status=status||0;}}
async function rpc(method,...args){
 const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),58000);
 try{
  const response=await fetch(BASE+'/api/bridge',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify({method,args}),signal:controller.signal});
  const result=await response.json().catch(()=>null);
  if(response.status===401)throw new ApiError('Phiên đăng nhập AhaHandbook đã hết hạn. Vui lòng tải lại trang.','UNAUTHENTICATED',401);
  if(!result||typeof result.ok!=='boolean')throw new ApiError('Phản hồi máy chủ không hợp lệ.','INVALID_RESPONSE',response.status);
  if(!result.ok)throw new ApiError(result.error||'Không thực hiện được thao tác.',result.code,response.status);
  return result.data;
 }catch(e){
  if(e&&e.name==='AbortError')throw new ApiError('Máy chủ phản hồi quá lâu. Thao tác có thể đã được lưu — tải lại trang để kiểm tra trước khi thử lại.','TIMEOUT',0);
  if(e instanceof ApiError)throw e;
  console.error('[AhaKudos] network error',e);
  throw new ApiError('Không thể kết nối AhaKudos. Vui lòng kiểm tra mạng và thử lại.','NETWORK',0);
 }finally{clearTimeout(timer);}
}

// ---- 3. Boot & data store --------------------------------------------------
let BOOT;
try{BOOT=await rpc('layTrangThai');if(!BOOT||!BOOT.me)throw new ApiError('Thiếu dữ liệu khởi tạo.','INVALID_RESPONSE');}
catch(e){
 const copy=e.code==='NOT_IN_MASTER_DATA'?{title:'Tài khoản chưa có trong Master Data',message:e.message}
  :e.code==='UNAUTHENTICATED'?{title:'Phiên đăng nhập đã hết hạn',message:'Vui lòng tải lại trang để đăng nhập lại AhaHandbook.'}
  :e.code==='FORBIDDEN'?{title:'Không có quyền truy cập',message:e.message}:null;
 window.AhaKudosBoot.fail(e,copy);return;
}
const legacyLinkId=new URLSearchParams(location.search).get('id')||''; // V28 emails used ?id=<kudosId>

const PEOPLE=BOOT.people||[]; // Master Data directory (email, name, dept, section, birthday MM-DD)
const employees=PEOPLE;
const CULTURE={fair:'Công bằng & Tôn trọng',share:'Học hỏi & Chia sẻ',grow:'Gắn kết & Cùng phát triển'};
const store={received:BOOT.received||[],sent:BOOT.sent||[],community:BOOT.community||[],detail:{}};
let QUOTA=BOOT.quota||{used:0,limit:5,remaining:5};
const ADMIN={loaded:false,loading:false,error:'',records:[],blacklist:[],settings:{},master:null,upcoming:{birthdays:[],anniversaries:[]},health:{}};
let employeeStale=false;

function me(){return BOOT.me;}
function personByEmail(e){const k=String(e||'').trim().toLowerCase();return PEOPLE.find(p=>p.email===k)||null;}
// Tenure comes from Master Data: "Tenure (Days)" first, else computed server-side from "Onboard Day"; else null (never a fake number).
function employeeTenureDays(p){return p&&typeof p.tenureDays==='number'&&Number.isFinite(p.tenureDays)&&p.tenureDays>=0?Math.floor(p.tenureDays):null;}
function uid(){const a=new Uint8Array(12);crypto.getRandomValues(a);return 'r'+Array.from(a,b=>b.toString(16).padStart(2,'0')).join('');}
function replaceIn(list,rec){const i=list.findIndex(k=>k.id===rec.id);if(i>=0){list[i]=rec;return true;}return false;}
function takeRecord(rec){
 if(!rec||!rec.id)return;
 let found=false;
 ['received','sent','community'].forEach(key=>{if(replaceIn(store[key],rec))found=true;});
 if(store.detail[rec.id]){store.detail[rec.id]=rec;found=true;}
 if(!found&&rec.senderEmail&&rec.senderEmail===me().email)store.sent.unshift(rec);
 if(rec.isCommunity===false)store.community=store.community.filter(k=>k.id!==rec.id);
}
function takeAdminRecord(rec){if(!rec||!rec.id)return;if(!replaceIn(ADMIN.records,rec))ADMIN.records.unshift(rec);employeeStale=true;}
function kudosById(id){if(!id)return null;return store.received.concat(store.sent,store.community).find(k=>k.id===id)||store.detail[id]||null;}
function adminRecordById(id){return ADMIN.records.find(k=>k.id===id)||null;}
function receivedFor(){return store.received;}
function sentBy(){return store.sent;}
function publicFeedList(){return store.community;}
async function refreshEmployeeData(){
 const d=await rpc('layTrangThai');
 BOOT=d;store.received=d.received||[];store.sent=d.sent||[];store.community=d.community||[];QUOTA=d.quota||QUOTA;
 EVENTS_LIST=d.events||[];ACTIVE_EVENT_IDS=d.activeEventIds||[];employeeStale=false;
}
async function loadAdminData(force){
 if(ADMIN.loading||(ADMIN.loaded&&!force))return;
 ADMIN.loading=true;ADMIN.error='';
 try{const d=await rpc('layDuLieuAdmin');Object.assign(ADMIN,{records:d.records||[],blacklist:d.blacklist||[],settings:d.settings||{},master:d.master||null,upcoming:d.upcoming||{birthdays:[],anniversaries:[]},health:d.health||{},loaded:true});}
 catch(e){ADMIN.error=e.message;console.error('[AhaKudos] admin data',e);}
 finally{ADMIN.loading=false;}
 if(state.mode==='admin')render();
}
/** Admin pages render this placeholder until layDuLieuAdmin has loaded. */
function adminGate(){
 if(ADMIN.loaded)return '';
 if(!ADMIN.loading&&!ADMIN.error)setTimeout(()=>loadAdminData(false),0);
 return `<section class="page active"><div class="empty"><div class="icon">${ADMIN.error?'!':'…'}</div><h3>${ADMIN.error?'Chưa tải được dữ liệu quản trị':'Đang tải dữ liệu quản trị…'}</h3><p>${escapeHtml(ADMIN.error||'Vui lòng chờ trong giây lát.')}</p>${ADMIN.error?'<button class="btn primary" data-admin-reload>Thử lại</button>':''}</div></section>`;
}
const BANNERS=BOOT.banners||{};
function banner(id){return BANNERS[id]||null;}
function mailStatusText(k){
 return ({AWAITING_APPROVAL:'Email sẽ gửi sau khi Admin duyệt',PENDING:'Email thông báo đang chờ gửi',SENDING:'Đang gửi email thông báo',SENT:'Đã gửi email thông báo',FAILED:'Email chưa gửi được — Admin đang xử lý',CANCELLED:'Không gửi email thông báo'})[k&&k.emailStatus]||'Email chưa được xác nhận';
}
function modStatusOf(k){return (k&&(k.moderationStatus||(k.moderation&&k.moderation.status)))||'HELD';}

// ---- 4. Shared renderers ---------------------------------------------------
// Thiệp KUDOS ở TRANG CHI TIẾT (đã xác thực): nội dung đầy đủ TRÊN background 3D người gửi chọn.
function buildKudosCard(k,opts){
 opts=opts||{};
 const bg=(typeof bgFor==='function'?bgFor(k.templateId):null)||{};
 const bgUrl=bg.url||'';
 const CULT=CULTURE;
 const vals=(k.values||[]).map(v=>CULT[v]||v);
 const chips=vals.map(n=>`<span class="kd-value-chip">${escapeHtml(n)}</span>`).join('');
 const rawMsg=String(k.message||'').trim();
 const msg=escapeHtml(rawMsg).replace(/\r?\n/g,'<br>');
 const msgLen=rawMsg.replace(/\s+/g,' ').length;
 const lineCount=(rawMsg.match(/\r?\n/g)||[]).length+1;
 const msgClass=msgLen>700||lineCount>14?' kd-card-msg--xxxlong':msgLen>520||lineCount>11?' kd-card-msg--xxlong':msgLen>360||lineCount>8?' kd-card-msg--xlong':msgLen>240||lineCount>6?' kd-card-msg--long':msgLen>140||lineCount>4?' kd-card-msg--medium':'';
 const senderName=escapeHtml(k.senderName||'Người gửi');
 const senderDept=escapeHtml(k.senderDept||'');
 const senderSection=escapeHtml(k.senderSection||'');
 const senderOrg=[senderDept,senderSection].filter(Boolean).join(' · ');
 const bgLayer=bgUrl
   ?`<img class="kd-card-bg" src="${escapeHtml(bgUrl)}" alt="Background KUDOS ${escapeHtml(bg.name||'')}" loading="eager">`
   :`<div class="kd-card-bg kd-card-bg-fallback" aria-hidden="true"></div>`;
 const cardLabel=opts.mode==='public'?'NỘI DUNG KUDOS':'LỜI GHI NHẬN DÀNH CHO BẠN';
 return `<div class="kd-card kd-card-fullbg tpl-${escapeHtml(bg.id||k.templateId||'wish')} ${opts.mode==='public'?'kd-card-public':''}">
   ${bgLayer}
   <div class="kd-card-shade" aria-hidden="true"></div>
   <div class="kd-card-content">
     <div class="kd-template-brand"><span class="kd-template-brand-logo">${kudosLogo()}</span><span class="kd-template-brand-name"><b>Aha</b><strong>Kudos</strong></span></div>
     <div class="kd-card-label">${cardLabel}</div>
     <div class="kd-sender-stack">
       <span class="kd-sender-caption">TỪ</span>
       <b class="kd-sender-name">${senderName}</b>
       ${senderOrg?`<span class="kd-sender-dept">${senderOrg}</span>`:''}
     </div>
     <div class="kd-card-msg${msgClass}">${msg}</div>
     ${vals.length?`<div class="kd-values-block"><div class="kd-value-caption">Giá trị văn hoá được ghi nhận</div><div class="kd-value-row">${chips}</div></div>`:''}
   </div>
 </div>`;
}
// ---- Banner / notification components (dùng chung web app) --------------------
function bannerHero(id,opts){
 opts=opts||{};const b=banner(id);if(!b)return '';
 const tone=opts.tone||(b.type==='system'?'tone-calm':(b.type==='receive'||b.type==='celebrate'?'':'tone-blue'));
 const img=b.image?`<img class="aha-illu" src="${escapeHtml(BASE+b.image)}" alt="${escapeHtml(b.headline)}" data-hide-on-error>`:'';
 const label=escapeHtml(opts.ctaLabel||b.ctaLabel||'');
 const cta=(b.ctaLabel&&b.ctaRoute)?`<button class="aha-cta" data-cta-route="${b.ctaRoute}"${opts.ctaId?` data-cta-id="${escapeHtml(opts.ctaId)}"`:''}>${label} <span aria-hidden="true">→</span></button>`:'';
 const sub=escapeHtml(opts.subheadline||b.subheadline||'');
 return `<div class="aha-banner ${tone}">${img}<div class="aha-copy"><div class="aha-eyebrow">${escapeHtml(b.headline)}</div><p class="aha-sub">${sub}</p>${cta}</div></div>`;
}
// CTA deep-link routing: dẫn tới đúng màn hình trong AhaKudos.
function ctaGo(route,id){
 switch(route){
  case 'compose': goToPage('send-kudos');break;
  case 'home': goToPage(state.mode==='admin'?'admin-home':'employee-home');break;
  case 'inbox': case 'received': goToPage('kudos-profile');break;
  case 'kudos-detail': if(id)openKudos(id);else goToPage('kudos-profile');break;
  case 'leaderboard': goToPage('public-feed');break;
  case 'milestone': goToPage('kudos-profile');break;
  default: goToPage(state.mode==='admin'?'admin-home':'employee-home');
 }
}
function modReasonsTextClient(reasons){
 const map={admin_review:'Chờ Admin duyệt',blacklist:'Chứa từ trong danh sách cấm',placeholder:'Nội dung rỗng nghĩa/placeholder',low_content:'Nội dung quá ngắn/ít thông tin',spammy_repeat:'Lặp ký tự bất thường',duplicate:'Trùng nội dung gửi gần đây'};
 return (reasons||[]).map(r=>{const k=String(r).split(':')[0];const extra=String(r).indexOf(':')>=0?(' ('+String(r).split(':').slice(1).join(':')+')'):'';return (map[k]||k)+extra;});
}

// ---- App state (UI only; never identity) -----------------------------------
const AVATAR_KEY='ahakudos-avatar:'+me().email, AVATAR_SCALE_KEY='ahakudos-avatar-scale:'+me().email;
const state={
  mode:me().inMasterData===false&&BOOT.isAdmin?'admin':'employee',
  page:me().inMasterData===false&&BOOT.isAdmin?'admin-home':'employee-home',
  values:new Set(),
  selectedTemplate:(BG.LIST[0]||{id:'wish'}).id,
  sendVisibility:'public', // Nhân viên luôn đề xuất CỘNG ĐỒNG KUDOS; Admin kiểm soát trước khi publish.
  prefillRecipient:'',
  selectedRecipient:null,
  manualRecipient:false,
  viewKudosId:null,
  adminPrefill:null,
  avatarData:safeGet(AVATAR_KEY)||'',
  avatarScale:Number(safeGet(AVATAR_SCALE_KEY)||1)||1
};

let liveFeedTimer=null;

function birthdaySuggestionsFor(currentEmail){
 const now=new Date();const year=now.getFullYear();const start=new Date(year,now.getMonth(),now.getDate());
 return PEOPLE.filter(p=>p.email!==currentEmail&&/^\d{2}-\d{2}$/.test(p.birthday||'')).map(p=>{
   const [mm,dd]=p.birthday.split('-').map(Number);
   let next=new Date(year,mm-1,dd);if(next<start)next=new Date(year+1,mm-1,dd);
   const days=Math.round((next-start)/86400000);if(days<0||days>30)return null;
   return {initials:initials(p.name),name:p.name,dept:p.dept||'',section:p.section||'',email:p.email,date:String(dd).padStart(2,'0')+'/'+String(mm).padStart(2,'0'),when:days===0?'Hôm nay':days===1?'Ngày mai':'Còn '+days+' ngày',days};
 }).filter(Boolean).sort((a,b)=>a.days-b.days).slice(0,5);
}
// Background templates = 4 ảnh 3D thật (backgrounds.js). Fallback nếu module vắng.
const cardTemplates=(BG&&BG.LIST&&BG.LIST.length)
  ? BG.LIST.map(t=>({id:t.id,name:t.name,sticker:t.sticker}))
  : [{id:'warm',name:'Ấm áp',sticker:'💛'}];
// Background theo sự kiện (Admin quản lý) — chỉ hiện sự kiện đang kích hoạt trong picker.
let EVENTS_LIST=BOOT.events||[];
let ACTIVE_EVENT_IDS=BOOT.activeEventIds||[];
let editingEventId=null;
function eventById(id){return (EVENTS_LIST||[]).find(e=>e.id===id)||null;}
function recomputeActiveEvents(){const t=new Date().toISOString().slice(0,10);ACTIVE_EVENT_IDS=(EVENTS_LIST||[]).filter(e=>e.active&&(!e.from||t>=e.from)&&(!e.to||t<=e.to)).map(e=>e.id);}
function activeEventTemplates(){return (EVENTS_LIST||[]).filter(e=>ACTIVE_EVENT_IDS.includes(e.id)).map(e=>({id:e.id,name:e.name,sticker:'🎁',event:true,url:e.url}));}
function allTemplates(){return cardTemplates.concat(activeEventTemplates());}
function templateMeta(id){return allTemplates().find(t=>t.id===id)||cardTemplates[0];}
function bgFor(id){const e=eventById(id);if(e)return {id:e.id,name:e.name,sticker:'🎁',fallback:'#FFF3E6',url:e.url};return BG?BG.get(id):null;}

const icons={
home:'<path d="M3 11.5 12 4l9 7.5"/><path d="M5 10.5V20h14v-9.5"/><path d="M9 20v-6h6v6"/>',
send:'<path d="m3 11 18-8-7 18-3-7-8-3Z"/><path d="m11 14 4-4"/>',
profile:'<circle cx="12" cy="8" r="3"/><path d="M5 20a7 7 0 0 1 14 0"/>',
grid:'<rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><rect x="14" y="14" width="6" height="6" rx="1"/>',
shield:'<path d="M12 3 20 6v5c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6l8-3Z"/><path d="m9 12 2 2 4-4"/>',
team:'<circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2"/><path d="M3 20a6 6 0 0 1 12 0"/><path d="M15 15a5 5 0 0 1 6 5"/>',
culture:'<path d="M12 3v18M3 12h18"/><circle cx="12" cy="12" r="4"/>',
settings:'<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.86 2.86-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21H9.4v-.1A1.7 1.7 0 0 0 9 19.8a1.7 1.7 0 0 0-1-.4 1.7 1.7 0 0 0-1.88.34l-.06.06-2.86-2.86.06-.06A1.7 1.7 0 0 0 3.6 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1.1-.4H2V9.4h.1A1.7 1.7 0 0 0 3.2 9a1.7 1.7 0 0 0 .4-1 1.7 1.7 0 0 0-.34-1.88l-.06-.06L6.06 3.2l.06.06A1.7 1.7 0 0 0 8 3.6a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1.1V2h4.2v.1a1.7 1.7 0 0 0 .4 1.1 1.7 1.7 0 0 0 1 .4 1.7 1.7 0 0 0 1.88-.34l.06-.06 2.86 2.86-.06.06A1.7 1.7 0 0 0 19.4 8c.1.36.3.7.6 1 .3.27.7.4 1.1.4h.1v4.2h-.1a1.7 1.7 0 0 0-1.1.4c-.3.3-.5.64-.6 1Z"/>',
search:'<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
feed:'<path d="M5 5h14M5 12h14M5 19h9"/><circle cx="3" cy="5" r=".6"/><circle cx="3" cy="12" r=".6"/><circle cx="3" cy="19" r=".6"/>',
image:'<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9.5" r="1.8"/><path d="m4 18 5-4.5 4 3 3.5-3L20 17"/>',
mail:'<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>'
};
const svg=(n)=>`<svg viewBox="0 0 24 24">${icons[n]}</svg>`;
const avatarMarkup=(className='')=>{
  if(state.avatarData){
    return `<div class="avatar-media ${className}" data-avatar-edit><img src="${state.avatarData}" alt="Avatar cá nhân" style="transform:scale(${state.avatarScale})"></div>`;
  }
  return `<div class="avatar-fallback ${className}" data-avatar-edit>${initials(me().name)}</div>`;
};
const logo=(light=true)=>`<img src="${light?A.logoLight:A.logoDark}" alt="Ahamove">`;
const kudosLogo=()=>`<img src="${A.kudosLogo||A.logoLight}" alt="Ahamove">`;
const mascotIllustration=()=>`<img src="${A.mascotCutout||A.logoLight}" alt="Mascot Ahamove">`;

function sidebar(){
 const emp=[
  ['employee-home','home','Trang chủ'],
  ['send-kudos','send','Gửi KUDOS'],
  ['public-feed','feed','CỘNG ĐỒNG KUDOS'],
  ['kudos-profile','profile','Hồ sơ KUDOS']
 ];
 const adm=[
  ['admin-home','grid','Tổng quan'],
  ['admin-notify','mail','Email thông báo'],
  ['admin-recognition','send','Gửi AhaKudos'],
  ['admin-quality','shield','Duyệt nội dung'],
   ['admin-events','image','Nền sự kiện'],
  ['admin-dept','team','Phòng ban'],
  ['admin-culture','culture','Giá trị văn hóa'],
  ['admin-ops','settings','Sinh nhật & Thâm niên']
 ];
 const items=state.mode==='employee'?emp:adm;
 const active=(id)=>state.page===id||(id==='kudos-profile'&&state.page==='kudos-detail');
 const badge=(id)=>{if(id==='admin-notify'){const n=ADMIN.records.filter(k=>k.email&&k.email.status==='FAILED').length;return n?`<span class="nav-badge" aria-label="${n} email cần xử lý">${n>99?'99+':n}</span>`:'';}return '';};
 return `<nav class="hb-nav" aria-label="${state.mode==='employee'?'Điều hướng AhaKudos':'Điều hướng quản trị'}">
  ${items.map(([id,ic,lb])=>`<button class="nav-btn ${active(id)?'active':''}" data-page="${id}" ${active(id)?'aria-current="page"':''}>${svg(ic)}<span>${lb}</span>${badge(id)}</button>`).join('')}
 </nav>`;
}
function topbar(){
 const u=me();
 return `<header class="hb-header">
  <div class="hb-header-inner">
   <button class="hb-brand" data-page="${state.mode==='employee'?'employee-home':'admin-home'}" aria-label="AhaKudos — Trang chủ">
    <span class="hb-brand-logo">${logo(true)}</span><span class="hb-brand-divider"></span><span class="hb-product">AhaKudos<span>GHI NHẬN & CẢM ƠN</span></span>
   </button>
   ${sidebar()}
   <div class="hb-header-actions">
    ${BOOT.isAdmin&&me().inMasterData!==false?`<button class="switch-btn" data-switch="${state.mode==='employee'?'admin':'employee'}" title="Chuyển giữa giao diện Nhân viên và Quản trị">${svg(state.mode==='employee'?'shield':'home')}<span>${state.mode==='employee'?'Giao diện Admin':'Giao diện Nhân viên'}</span></button>`:''}
    <button class="hb-account" data-page="${state.mode==='employee'?'kudos-profile':'admin-home'}" aria-label="Hồ sơ ${escapeHtml(u.name)}">${state.avatarData?`<img src="${state.avatarData}" alt="" style="transform:scale(${state.avatarScale})">`:initials(u.name)}</button>
   </div>
  </div>
 </header>`;
}
function envBadge(){
 // Chỉ hiện ở development/staging để tránh nhầm môi trường. Production không có nhãn này.
 return CONFIG.env&&CONFIG.env!=='production'?`<span class="hb-demo-label" title="Môi trường ${escapeHtml(CONFIG.env)}"><i></i>${escapeHtml(String(CONFIG.env).toUpperCase())}</span>`:'';
}
function contextbar(){
 const u=me();
 const firstName=escapeHtml((u.name||'bạn').split(' ').slice(-1)[0]);
 const tenureDays=employeeTenureDays(u);
 const tenureLine=tenureDays!==null
   ?`Cảm ơn bạn đã đồng hành cùng Ahamove <strong class="tenure-days">${tenureDays.toLocaleString('vi-VN')}</strong> ngày.`
   :'Cảm ơn bạn đã đồng hành cùng Ahamove.';
 const employeeGreeting=`<b>Xin chào, ${firstName}! <span class="wave" aria-hidden="true">👋</span></b><span>${tenureLine}</span>`;
 return `<div class="hb-contextbar">
  <div class="hb-context-left"><span class="hb-context-icon">${svg(state.mode==='employee'?'profile':'shield')}</span><div class="greeting">${state.mode==='employee'?employeeGreeting:'<b>Trung tâm quản trị</b><span>Không gian vận hành AhaKudos toàn công ty.</span>'}</div></div>
  <div class="hb-context-right">${envBadge()}<div class="search hb-directory"><input id="hb-directory-search" placeholder="Tìm đồng nghiệp, phòng ban..." autocomplete="off" aria-label="Tìm đồng nghiệp trong Master Data" aria-expanded="false" aria-controls="hb-directory-results">${svg('search')}<div class="recipient-suggestions hidden" id="hb-directory-results"></div></div></div>
 </div>`;
}
function shell(content){
 return `<div class="app-shell ${state.mode==='admin'?'admin-shell':''}">
  <a class="hb-skip-link" href="#main-content">Đến nội dung chính</a>
  ${topbar()}
  <main class="main-wrap" id="main-content" tabindex="-1">${contextbar()}${content}</main>
  ${state.mode==='employee'?`<button class="aha-floating-kudos" data-page="send-kudos" aria-label="Gửi KUDOS ngay" title="Gửi KUDOS"><img src="${BASE}/illustrations/mascot-cutout.png" alt=""></button>`:''}
  <footer class="hb-footer"><b>AhaKudos <span>· Ahamove</span></b><span>Always Moving Together</span></footer>
 </div>`;
}

// ---- Home ------------------------------------------------------------------
function receivedFeedItem(k,{big=false}={}){
 const cn=(k.values||[]).map(v=>CULTURE[v]||v);
 const tags=cn.map(n=>`<span>${escapeHtml(n)}</span>`).join('');
 return `<div class="feed-item kudos-open" role="button" tabindex="0" data-open-kudos="${k.id}">
   <div class="feed-head"><div class="mini-avatar">${initials(k.senderName)}</div><div class="who"><b>${escapeHtml(k.senderName)}</b><span>${escapeHtml(k.senderDept||'')}</span></div><time>${escapeHtml(k.sentAtLabel||'')}</time></div>
   <p>${escapeHtml(k.message)}</p>
   <div class="value-tags">${tags}</div>
 </div>`;
}
function employeeHome(){
 const u=me();
 const rec=receivedFor(u.email);
 const latest=rec[0];
 const sentCount=sentBy(u.email).length;
 const birthdaySuggestions=birthdaySuggestionsFor(u.email);
 const heroNote=latest?`
   <div class="hb-hero-note">
    <div class="hb-note-label"><span>✦</span> KUDOS gần nhất dành cho bạn</div>
    <div class="kudos-highlight kudos-open" role="button" tabindex="0" data-open-kudos="${latest.id}">
     <span class="hb-note-heart" aria-hidden="true">♥</span>
     <div class="person-row"><div class="mini-avatar">${initials(latest.senderName)}</div><div><b>${escapeHtml(latest.senderName)}</b><span>${escapeHtml(latest.senderDept||'')} · ${escapeHtml(latest.sentAtLabel||'')}</span></div></div>
     <p>${escapeHtml(latest.message)}</p>
     <div class="value-tags">${(latest.values||[]).map(v=>`<span>${escapeHtml(CULTURE[v]||v)}</span>`).join('')}</div>
     <div class="hb-note-signoff">Nhấn để mở lời ghi nhận <span>— và giữ lại cho riêng bạn</span></div>
    </div>
   </div>`:`
   <div class="hb-hero-note">
    <div class="hb-note-label"><span>✦</span> KUDOS gần nhất dành cho bạn</div>
    <div class="kudos-highlight"><p>Bạn chưa nhận KUDOS nào. Khi một đồng nghiệp ghi nhận bạn, lời đó sẽ xuất hiện tại đây và được lưu trong Hồ sơ để bạn xem lại.</p></div>
   </div>`;
 const recentList=rec.slice(0,2).map(k=>receivedFeedItem(k)).join('')||`<div class="empty"><div class="icon">✦</div><h3>Chưa có KUDOS đã nhận</h3><p>Những lời ghi nhận dành cho bạn sẽ xuất hiện và được lưu tại đây.</p></div>`;
 const approvedCommunity=publicFeedList().slice(0,2);
 const pendingOwn=sentBy(u.email).filter(k=>k.visibility==='public'&&k.publicConsent!=='approved'&&modStatusOf(k)!=='HIDDEN').slice(0,2);
 const homeCommunityItems=approvedCommunity.length?approvedCommunity:pendingOwn;
 const homeCommunityMode=approvedCommunity.length?'approved':(pendingOwn.length?'pending':'empty');
 const homeCommunityCards=homeCommunityItems.map(k=>`<article class="home-community-item">
    <div class="home-community-item-head">
      <div><b>${escapeHtml(k.senderName||'')}</b><span>${escapeHtml(k.senderDept||'')}</span></div>
      <span class="home-community-status ${homeCommunityMode}">${homeCommunityMode==='approved'?'Admin đã duyệt':'Chờ Admin duyệt'}</span>
    </div>
    <button class="home-community-visual kudos-open" data-open-kudos="${k.id}" aria-label="Mở KUDOS">${buildKudosCard(k,{mode:'public'})}</button>
   </article>`).join('');
 const homePrimaryCard=sentCount===0?`
   <article class="home-start-card">
    <div class="home-start-head">
     <div>
      <span class="home-start-kicker">BẮT ĐẦU</span>
      <h2 class="home-start-title">Gửi KUDOS đầu tiên</h2>
      <p class="home-start-sub">Chưa gửi KUDOS nào? Bắt đầu lan tỏa một lời ghi nhận thật lòng nhé.</p>
     </div>
    </div>
    <div class="home-start-grid">
     <article class="home-start-step">
      <span class="home-step-badge">1</span>
      <img src="${BASE}/illustrations/home-step-select-person.png" alt="Chọn người bạn muốn ghi nhận">
      <h3>Chọn người bạn muốn ghi nhận</h3>
      <p>Tìm đồng nghiệp mà bạn muốn gửi một lời cảm ơn thật là woah.</p>
     </article>
     <article class="home-start-step">
      <span class="home-step-badge">2</span>
      <img src="${BASE}/illustrations/home-step-write-message.png" alt="Nội dung ghi nhận bạn muốn chia sẻ">
      <h3>Nội dung ghi nhận bạn muốn chia sẻ</h3>
      <p>Chia sẻ cụ thể điều bạn muốn cảm ơn hoặc muốn ghi nhận ở đồng nghiệp.</p>
     </article>
     <article class="home-start-step">
      <span class="home-step-badge">3</span>
      <img src="${BASE}/illustrations/home-step-send-kudos.png" alt="Chọn giá trị và gửi KUDOS">
      <h3>Chọn giá trị &amp; gửi KUDOS</h3>
      <p>Chọn giá trị văn hoá phù hợp và gửi lời ghi nhận của bạn đi.</p>
     </article>
    </div>
    <button class="btn primary home-start-cta" data-page="send-kudos">Gửi KUDOS đầu tiên →</button>
   </article>`:`
   <article class="home-community-card">
    <div class="home-community-head">
      <div><div class="kicker">CỘNG ĐỒNG KUDOS</div><h2>${homeCommunityMode==='pending'?'KUDOS của bạn đang chờ được lan tỏa':'Những chuyển động tích cực đang được lan tỏa'}</h2><p>${homeCommunityMode==='approved'?'Những KUDOS đã được Admin duyệt gần đây.':homeCommunityMode==='pending'?'Chưa có KUDOS nào được Admin duyệt. Trong lúc chờ, đây là lời ghi nhận bạn vừa gửi.':'Chưa có KUDOS nào được Admin duyệt để hiển thị.'}</p></div>
      <button class="link-btn" data-page="public-feed">Xem tất cả →</button>
    </div>
    <div class="home-community-list">${homeCommunityCards||`<div class="empty"><div class="icon">✦</div><h3>Cộng đồng đang chờ lời ghi nhận đầu tiên</h3><p>Khi Admin duyệt KUDOS, những lời ghi nhận sẽ xuất hiện tại đây.</p></div>`}</div>
   </article>`
const recvCount=rec.length, noJourneyYet=sentCount===0&&recvCount===0;
 const recvJourneyCard=noJourneyYet
  ? `<div class="hb-journey-stat hb-journey-stat-empty"><strong>✦</strong><div><b>Bắt đầu hành trình KUDOS</b><span>Chưa có KUDOS nào được gửi hoặc nhận. Hãy bắt đầu bằng lời ghi nhận đầu tiên.</span></div></div>`
  : `<div class="hb-journey-stat"><strong>${recvCount}</strong><div><b>${recvCount===0?'Chưa có KUDOS nào nhận được':'KUDOS bạn đã nhận'}</b><span>${recvCount===0?'Khi đồng nghiệp gửi lời ghi nhận, bạn sẽ thấy tại đây.':'Được lưu để xem lại bất cứ lúc nào'}</span></div></div>`;
 const sentJourneyCard=sentCount===0
  ? `<div class="hb-journey-stat hb-journey-stat-warm"><strong>→</strong><div><b>Gửi KUDOS đầu tiên</b><span>Lan tỏa lời ghi nhận đầu tiên của bạn tới đồng nghiệp ngay hôm nay.</span><button class="hb-journey-mini-cta" data-page="send-kudos">Gửi KUDOS ngay →</button></div></div>`
  : sentCount===1
   ? `<div class="hb-journey-stat hb-journey-stat-warm"><strong class="hb-gift-stat" aria-label="Quà KUDOS">🎁</strong><div><b class="hb-first-kudos-title">Chúc mừng bạn đã gửi <span>KUDOS đầu tiên!</span></b><span>Hãy chờ đón một món quà nhỏ đặc biệt dành cho cột mốc này nhé.</span></div></div>`
   : `<div class="hb-journey-stat hb-journey-stat-warm"><strong>${sentCount}</strong><div><b>KUDOS bạn đã gửi</b><span>Lan tỏa điều tích cực đến đồng nghiệp.</span></div></div>`;
 return `<section class="page active hb-home">
 <article class="recognition-hero hb-hero">
  <div class="moment-copy">
   <span class="eyebrow">KHOẢNH KHẮC ĐƯỢC GHI NHẬN · AHAMOVE</span>
   <h1>Cùng lan tỏa văn hoá ghi nhận <br>từ một lời cảm ơn.</h1>
   <p>Mỗi AHAKUDOS gửi đi là một dấu ấn được lưu lại, để điều tích cực tiếp tục lan tỏa.</p>
   <div class="hb-hero-actions"><button class="btn primary" data-page="send-kudos">${svg('send')} Gửi KUDOS ngay <span aria-hidden="true">→</span></button><button class="btn hb-btn-light" data-page="kudos-profile">Xem hồ sơ ${svg('profile')}</button></div>
  </div>
 </article>
 <div class="profile-strip hb-journey-strip">
  <div class="profile-intro"><div class="avatar-edit-wrap">${avatarMarkup('home-avatar')}<button class="avatar-edit-btn" data-avatar-edit title="Cập nhật avatar" aria-label="Cập nhật ảnh đại diện">✎</button></div><div><b>${escapeHtml(u.name)} ✨</b><p>${escapeHtml(u.dept||'')}${u.section?` · ${escapeHtml(u.section)}`:''}${u.dateOfBirth?` · Sinh nhật ${escapeHtml(u.dateOfBirth.slice(8,10)+'/'+u.dateOfBirth.slice(5,7))}`:''}</p></div></div>
  ${recvJourneyCard}
  ${sentJourneyCard}
 </div>
 <section class="home-about-kudos home-handbook-layout" aria-label="Thông tin về AhaKudos">
  <div class="home-handbook-progress" aria-label="Các phần chính của AhaKudos">
   <div class="home-progress-count"><b>1/3</b><span style="--progress:33.333%"></span></div>
   <a href="#home-about" class="active"><strong>01</strong><span>Định nghĩa</span></a>
   <i></i>
   <a href="#home-goals"><strong>02</strong><span>Mục tiêu</span></a>
   <i></i>
   <a href="#home-how"><strong>03</strong><span>Gửi KUDOS</span></a>
  </div>

  <div class="home-handbook-grid">
   <article id="home-about" class="home-handbook-feature">
    <div class="home-handbook-badge">ĐỊNH NGHĨA</div>
    <div class="home-definition-panel">
     <div class="home-definition-copy">
      <h2>AhaKudos là gì?</h2>
      <p class="home-definition-lead"><strong>AHAKUDOS</strong> là nền tảng ghi nhận nội bộ của Ahamove, được xây dựng để giúp nhân viên dễ dàng gửi lời cảm ơn, ghi nhận những hành động tích cực và lan tỏa các giá trị văn hóa trong công việc hằng ngày.</p>
      <div class="home-handbook-quote">Khi một đồng nghiệp làm điều gì đó có ý nghĩa, đóng góp ấy xứng đáng được nhìn thấy và trân trọng.</div>
      <p class="home-definition-support">Đó có thể là khi một đồng nghiệp chủ động hỗ trợ bạn, giải quyết một vấn đề khó, chia sẻ kiến thức, đồng hành cùng team hoặc tạo ra một tác động tích cực.</p>
      <div class="home-definition-note">AHAKUDOS là chương trình ghi nhận văn hóa và <strong>không thay thế hệ thống đánh giá hiệu suất</strong>.</div>
     </div>
     <div class="home-definition-visual">
      <img src="${BASE}/illustrations/definition-mascot-rider.png" alt="Mascot Ahamove ôm trái tim" class="home-definition-mascot">
     </div>
    </div>
   </article>

   <div id="home-goals" class="home-handbook-objectives">
    <article class="home-handbook-card home-handbook-goals">
     <div class="home-handbook-card-icon">🎯</div>
     <div class="home-handbook-card-copy">
      <span class="home-handbook-card-kicker">MỤC TIÊU</span>
      <h2>AHAKUDOS được phát triển nhằm</h2>
      <div class="home-handbook-goal-list">
       <span>Khuyến khích thói quen ghi nhận và cảm ơn trong công việc hằng ngày.</span>
       <span>Giúp những đóng góp tích cực được nhìn thấy và ghi nhận đúng lúc.</span>
       <span>Lan tỏa hành vi văn hóa tích cực bằng những câu chuyện thật.</span>
       <span>Tăng sự kết nối giữa các Ahamovers trong quá trình làm việc.</span>
      </div>
     </div>
    </article>

    <article class="home-handbook-card home-handbook-sources">
     <div class="home-handbook-card-icon">🎁</div>
     <div class="home-handbook-card-copy">
      <span class="home-handbook-card-kicker">BẠN CÓ THỂ NHẬN KUDOS TỪ ĐÂU?</span>
      <h2>Những khoảnh khắc có thể nhận KUDOS</h2>
      <div class="home-handbook-source-row">
       <div><i>👥</i><b>Từ đồng nghiệp</b><p>Khi một đồng nghiệp nhìn thấy một hành động hoặc đóng góp tích cực của bạn, họ có thể chủ động gửi KUDOS để ghi nhận điều đó.</p></div>
       <div><i>🎂</i><b>Từ những cột mốc đáng nhớ</b><p>AHAKUDOS cũng sẽ gửi lời chúc và ghi nhận vào một số dịp đặc biệt như <strong>Sinh nhật</strong> hoặc <strong>Kỷ niệm ngày vào công ty / Thâm niên</strong>.</p></div>
      </div>
     </div>
    </article>
   </div>
  </div>

  <article id="home-how" class="home-handbook-journey">
   <div class="home-handbook-journey-head">
    <div class="home-handbook-card-icon">✈️</div>
    <div>
     <span class="home-handbook-card-kicker">GỬI MỘT KUDOS NHƯ THẾ NÀO?</span>
     <h2>Gửi KUDOS trong 3 bước</h2>
     <p>Hãy chia sẻ hành động, tác động và điều khiến bạn muốn ghi nhận đồng nghiệp. Sau đó, bạn có thể chọn tối đa 3 Giá trị văn hóa — từ gợi ý của AI hoặc tự chọn theo cách bạn cảm nhận.</p>
    </div>
   </div>
   <div class="home-handbook-steps">
    <div class="home-handbook-step"><b>01</b><div class="home-handbook-step-icon"><img src="${BASE}/illustrations/home-step-select-person.png" alt="Chọn đồng nghiệp"></div><h3>Chọn đồng nghiệp bạn muốn ghi nhận</h3><p>Tìm đồng nghiệp mà bạn muốn gửi một lời cảm ơn thật là woah.</p></div>
    <div class="home-handbook-step"><b>02</b><div class="home-handbook-step-icon"><img src="${BASE}/illustrations/home-step-write-message.png" alt="Viết nội dung"></div><h3>Nội dung ghi nhận bạn muốn chia sẻ</h3><p>Chia sẻ cụ thể điều bạn muốn cảm ơn hoặc muốn ghi nhận ở đồng nghiệp.</p></div>
    <div class="home-handbook-step"><b>03</b><div class="home-handbook-step-icon"><img src="${BASE}/illustrations/home-step-send-kudos.png" alt="Chọn giá trị và gửi KUDOS"></div><h3>Chọn giá trị &amp; gửi KUDOS</h3><p>Chọn Giá trị văn hoá phù hợp và gửi lời ghi nhận của bạn đi.</p><button class="home-step-kudos-cta" data-page="send-kudos">Gửi KUDOS ngay →</button></div>
   </div>
  </article>

  <div class="home-handbook-extra">
   <article class="home-handbook-mini home-birthday-master">
    <div class="home-handbook-mini-head">
     <div class="home-handbook-mini-icon">🎂</div>
     <div>
      <span class="home-handbook-mini-kicker">SINH NHẬT · MASTER DATA</span>
      <h3>Sinh nhật đồng nghiệp sắp tới</h3>
     </div>
    </div>
    <div class="home-master-birthday-list">${birthdaySuggestions.length?birthdaySuggestions.slice(0,3).map(b=>`<div class="home-master-birthday-row"><div class="mini-avatar birthday-avatar">${b.initials}</div><div><b>${escapeHtml(b.name)}</b><span>${escapeHtml(b.dept||'')} · ${escapeHtml(b.when)} · ${escapeHtml(b.date)}</span></div><button data-birthday="${escapeHtml(b.email)}">Gửi lời chúc →</button></div>`).join(''):`<div class="home-master-empty">Chưa có sinh nhật nào trong 30 ngày tới theo Master Data.</div>`}</div>
   </article>

   <article class="home-handbook-mini">
    <div class="home-handbook-mini-head">
     <div class="home-handbook-mini-icon">📅</div>
     <div>
      <span class="home-handbook-mini-kicker">SỰ KIỆN</span>
      <h3>Thông báo sự kiện sắp diễn ra</h3>
     </div>
    </div>
    <p>Khu vực này sẽ hiển thị các sự kiện nội bộ liên quan đến văn hoá ghi nhận để Ahamovers tiện theo dõi và tham gia.</p>
    <span class="home-handbook-mini-chip">Coming soon</span>
   </article>
  </div>

  <div class="home-handbook-bottom">
   <div class="home-handbook-bottom-icon">💬</div>
   <div><b>Bạn đã sẵn sàng gửi một lời ghi nhận?</b><span>Một lời cảm ơn nhỏ có thể tạo nên động lực lớn cho đồng nghiệp.</span></div>
   <button class="btn primary" data-page="send-kudos">Gửi KUDOS ngay →</button>
  </div>
 </section>
</section>`;
}

// ---- Public feed -----------------------------------------------------------
function publicFeedPage(){
 const reactionMeta={heart:['💛','Đồng cảm'],clap:['👏','Vỗ tay'],cheer:['🙌','Tuyệt vời'],spark:['✨','Lan tỏa']};
 const list=publicFeedList();
 const cards=list.map(k=>{
   const tags=(k.values||[]).map(v=>`<span>${escapeHtml(CULTURE[v]||v)}</span>`).join('');
   const template=templateMeta(k.templateId);
   return `<article class="card public-kudos-card" data-public-card="${k.id}">
     <div class="public-card-top">
       <div class="public-route">
         <div class="mini-avatar">${initials(k.senderName)}</div>
         <div class="public-person"><b>${escapeHtml(k.senderName)}</b><span>${escapeHtml(k.senderDept||'')}</span></div>
         <span class="route-arrow">→</span>
         <div class="mini-avatar recipient-public-avatar">${initials(k.recipientName)}</div>
         <div class="public-person"><b>${escapeHtml(k.recipientName)}</b><span>${escapeHtml(k.recipientDept||'')}</span></div>
       </div>
       <div class="public-time"><span class="public-badge">◎ CỘNG ĐỒNG KUDOS</span><time>${escapeHtml(k.sentAtLabel||'Vừa xong')}</time></div>
     </div>
     <div class="public-kudos-visual kudos-open" role="button" tabindex="0" data-open-kudos="${k.id}">
       ${buildKudosCard(k,{mode:'public'})}
     </div>
     <div class="reaction-row">
       <div class="reaction-buttons">
         ${Object.entries(reactionMeta).map(([key,meta])=>`<button class="reaction-btn ${k.myReactions&&k.myReactions[key]?'active':''}" data-reaction="${key}" data-public-id="${k.id}" title="${meta[1]}"><span>${meta[0]}</span><b>${Number((k.reactions&&k.reactions[key])||0)}</b></button>`).join('')}
       </div>
       <span class="reaction-note">Reaction dùng để hưởng ứng lời ghi nhận</span>
     </div>
   </article>`;
 }).join('');
 return `<section class="page active">
   <div class="page-head public-feed-head">
     <div>
       <div class="kicker">CỘNG ĐỒNG KUDOS</div>
       <h1>Những chuyển động tích cực đang được lan toả tại Ahamove</h1>
       <p class="page-sub">Những KUDOS được Admin duyệt cho phạm vi CỘNG ĐỒNG KUDOS sẽ xuất hiện tại đây.</p>
     </div>
     <div class="realtime-status"><i></i><div><b>Realtime</b><span>Đang cập nhật</span></div></div>
   </div>
   <div class="public-feed-layout">
     <div class="public-feed-list" id="public-feed-list">${cards||`<div class="empty"><div class="icon">✦</div><h3>Chưa có CỘNG ĐỒNG KUDOS</h3><p>Những lời ghi nhận được Admin duyệt cho CỘNG ĐỒNG KUDOS sẽ xuất hiện tại đây.</p></div>`}</div>
     <aside class="public-feed-rail">
       <article class="card public-feed-side-card">
         <div class="rail-title"><span>Lan tỏa hôm nay</span></div>
         <div class="public-stat"><strong>${list.length}</strong><span>CỘNG ĐỒNG KUDOS</span></div>
         <div class="public-stat"><strong>${list.reduce((s,k)=>s+Object.values(k.reactions||{}).reduce((a,b)=>a+Number(b||0),0),0)}</strong><span>Reaction</span></div>
       </article>
       <article class="card public-feed-side-card public-feed-mascot-card">
         
         <div class="public-feed-mascot-wrap">${mascotIllustration()}</div>
         <p>Một lời cảm ơn nhỏ có thể bắt đầu từ hôm nay — gửi một KUDOS để ghi nhận điều tốt đẹp bạn vừa nhìn thấy.</p>
       </article>
       <button class="btn primary wide" data-page="send-kudos">+ Gửi một KUDOS</button>
     </aside>
   </div>
 </section>`;
}

// ---- Compose (single column) ----------------------------------------------
function composeRecord(){
 // Build a live record from current compose inputs — the SAME shape the email uses.
 const u=me();
 const manual=!!state.manualRecipient;
 const r=state.selectedRecipient;
 const rawEmail=(document.querySelector('#recipient-email')?document.querySelector('#recipient-email').value.trim():state.prefillRecipient)||'';
 const manualName=(document.querySelector('#recipient-manual-name')?.value||'').trim();
 const manualDept=(document.querySelector('#recipient-manual-dept')?.value||'').trim();
 const manualEmail=(document.querySelector('#recipient-manual-email')?.value||'').trim();
 return {
   senderName:u.name,senderDept:u.dept,senderSection:u.section||'',senderEmail:u.email,
   recipientManual:manual,
   recipientName:manual?manualName:(r?r.name:''),recipientDept:manual?manualDept:(r?r.dept:''),recipientEmail:manual?manualEmail:(r?r.email:rawEmail),
   message:(document.querySelector('#message')?document.querySelector('#message').value:'')||'',
   templateId:state.selectedTemplate,values:[...state.values],
   visibility:'public',publicConsent:'pending',
   ctaUrl:'#'
 };
}
function sendKudos(){
return `<section class="page active kudos-compose-page">
 <div class="compose-hero">
  <div class="ch-copy">
   <div class="ch-eyebrow">AHAKUDOS · GHI NHẬN & CẢM ƠN</div>
   <h1>Ghi nhận điều tuyệt vời mỗi ngày!</h1>
   <p>Một lời ghi nhận xuất phát từ sự chân thành của bạn có thể trở thành động lực rất lớn cho đồng nghiệp của bạn trên hành trình chuyển động cùng Ahamove.</p>
  </div>
  <div class="ch-art">${ART?ART.heroCharacter():''}<span class="ch-glow" aria-hidden="true"></span></div>
 </div>
 <div class="hb-compose-steps" aria-label="Các bước gửi KUDOS"><span class="hb-step-intro">GỬI MỘT LỜI GHI NHẬN</span><ol><li><span>01</span>Người nhận & background</li><li><span>02</span>Nội dung KUDOS</li><li><span>03</span>Xem trước KUDOS</li><li><span>04</span>Gửi & chờ Admin duyệt</li></ol></div>
 <div class="form-layout kudos-compose-layout">
  <article class="card form-card kudos-compose-form">
   <div class="field recipient-search-field">
    <label>Email người bạn muốn ghi nhận</label>
    <label class="recipient-mode-toggle"><input id="recipient-no-company-email" type="checkbox" ${state.manualRecipient?'checked':''}><span>Người nhận không có mail công ty</span></label>
    <div id="recipient-company-mode" class="recipient-company-mode ${state.manualRecipient?'hidden':''}">
      <div class="email-search-wrap">
        <input id="recipient-email" class="input" type="email" autocomplete="off" placeholder="Nhập email Ahamove của đồng nghiệp..." value="${escapeHtml(state.prefillRecipient||'')}">
        <span class="email-search-icon" aria-hidden="true">⌕</span>
        <div id="recipient-suggestions" class="recipient-suggestions hidden"></div>
      </div>
      <div id="selected-recipient" class="selected-recipient hidden"></div>
      <span class="field-hint">Tìm trong Master Data bằng email Ahamove để lấy đúng họ tên và phòng ban.</span>
    </div>
    <div id="recipient-manual-mode" class="recipient-manual-mode ${state.manualRecipient?'':'hidden'}">
      <div class="recipient-manual-grid">
        <div><label for="recipient-manual-name">Họ tên người nhận</label><input id="recipient-manual-name" class="input" type="text" maxlength="120" placeholder="Nhập họ tên"></div>
        <div><label for="recipient-manual-dept">Phòng ban / Bộ phận</label><input id="recipient-manual-dept" class="input" type="text" maxlength="120" placeholder="Nhập phòng ban hoặc bộ phận"></div>
      </div>
      <label for="recipient-manual-email">Email liên hệ</label>
      <input id="recipient-manual-email" class="input" type="email" autocomplete="off" placeholder="name@example.com">
      <span class="field-hint">Có thể nhập email ngoài @ahamove.com. KUDOS sẽ được đưa vào hàng chờ CỘNG ĐỒNG KUDOS; Admin là người duyệt trước khi hiển thị công khai.</span>
    </div>
   </div>
   <div class="field template-field">
    <label id="background-picker-label">Chọn background cho KUDOS</label>
    <div class="bg-carousel">
     <button type="button" class="bg-nav prev" data-bg-nav="-1" aria-label="Xem các background trước">‹</button>
     <div class="template-gallery kudos-background-gallery" role="group" aria-labelledby="background-picker-label">
      ${allTemplates().map((t,i)=>`<button type="button" class="template-option ${state.selectedTemplate===t.id?'selected':''}" data-template="${t.id}" aria-label="Background ${escapeHtml(t.name)}" aria-pressed="${state.selectedTemplate===t.id}">
        <span class="template-thumb tpl-${t.id}" style="${BG?`background:${bgFor(t.id).fallback}`:''}">${BG?`<img class="art-img" src="${bgFor(t.id).url}" alt="" aria-hidden="true">`:(ART?ART.scene(t.id):`<i aria-hidden="true">${t.sticker}</i>`)}<span class="thumb-tick" aria-hidden="true">✓</span></span>
      </button>`).join('')}
     </div>
     <button type="button" class="bg-nav next" data-bg-nav="1" aria-label="Xem các background tiếp theo">›</button>
    </div>
    <span class="field-hint">Vuốt hoặc dùng mũi tên để xem thêm. Background sẽ được dùng khi người nhận mở lời ghi nhận trong AhaKudos.</span>
   </div>

   <div class="compose-writing">
    <div class="field message-field">
     <label for="message">Nội dung KUDOS</label>
     <div class="kudos-content-format" aria-label="Format nội dung KUDOS">
      <b>Format gợi ý cho một KUDOS:</b>
      <span><strong>01</strong> Hành động cụ thể bạn đã nhìn thấy</span>
      <span><strong>02</strong> Tác động hành động đó tạo ra</span>
      <span><strong>03</strong> Điều bạn thật sự trân trọng ở đồng nghiệp</span>
     </div>
     <textarea id="message" class="textarea" aria-describedby="count" placeholder="Ví dụ: Cảm ơn bạn đã chủ động hỗ trợ team xử lý gấp đầu việc trước deadline. Nhờ vậy cả team kịp tiến độ và tránh được một lỗi quan trọng. Mình rất trân trọng sự chủ động và tinh thần đồng đội của bạn."></textarea>
     <span class="field-hint" id="count">0 ký tự</span>
    </div>
    <div class="coach" role="region" aria-label="Trợ lý viết nội dung KUDOS">
     <div class="coach-head">
      <span class="coach-title"><span aria-hidden="true">✦</span> Trợ lý viết nội dung KUDOS</span>
      <span class="coach-live"><i aria-hidden="true"></i>Realtime</span>
      <button type="button" class="coach-toggle" id="coach-toggle" aria-expanded="false" aria-controls="coach-more">Xem thêm</button>
     </div>
     <p class="coach-nudge" id="coach-nudge" role="status" aria-live="polite">Bắt đầu viết, mình sẽ kiểm tra xem nội dung đã đủ Hành động → Tác động → Điều trân trọng chưa.</p>
     <div class="coach-more hidden" id="coach-more">
      <p>Một nội dung KUDOS đầy đủ thường có:</p>
      <ul>
       <li>Một <b>hành động cụ thể</b> bạn đã thấy (không chỉ "cảm ơn nhiều nha").</li>
       <li><b>Tác động</b> mà hành động đó tạo ra cho bạn, đội nhóm hoặc công việc.</li>
       <li>Điều <b>bạn thật sự trân trọng</b> ở đồng nghiệp.</li>
      </ul>
      <p class="coach-note">Gợi ý dựa trên quy tắc viết — chưa dùng mô hình AI. Bạn luôn là người quyết định câu chữ; trợ lý không tự sửa lời của bạn.</p>
     </div>
    </div>
   </div>

   <div class="field culture-field ${state.selectedTemplate==='birthday'?'hidden':''}" id="culture-field">
    <label id="culture-picker-label">Giá trị văn hóa <span class="optional-label">· chọn từ 1 đến 3</span></label>
    <div class="culture-picker" role="group" aria-labelledby="culture-picker-label">
     <button type="button" class="culture-chip ${state.values.has('fair')?'selected':''}" data-value="fair" aria-pressed="${state.values.has('fair')}">Công bằng & Tôn trọng</button>
     <button type="button" class="culture-chip ${state.values.has('share')?'selected':''}" data-value="share" aria-pressed="${state.values.has('share')}">Học hỏi & Chia sẻ</button>
     <button type="button" class="culture-chip ${state.values.has('grow')?'selected':''}" data-value="grow" aria-pressed="${state.values.has('grow')}">Gắn kết & Cùng phát triển</button>
    </div>
    <span class="field-hint" id="ai-values">Gợi ý sẽ được làm nổi nhẹ theo nội dung — bạn luôn là người tự chọn.</span>
   </div>

   <section class="compose-kudos-review" id="kudos-preview" aria-labelledby="kudos-review-title">
    <div class="email-review-heading">
     <div><div class="kicker">KUDOS PREVIEW</div><h2 id="kudos-review-title" tabindex="-1">Xem trước KUDOS mà người ấy sẽ nhận</h2><p>Đây là nội dung đầy đủ người nhận sẽ thấy sau khi bấm “Mở lời ghi nhận này” trong email thông báo.</p></div>
     <span class="email-review-sync"><i aria-hidden="true"></i>Tự động cập nhật</span>
    </div>
    <div class="kudos-review-recipient"><span>Người nhận</span><strong id="kudos-preview-recipient">Chưa chọn người nhận</strong></div>
    <div class="kudos-review-canvas">
      <div id="kudos-preview-card" class="kudos-preview-card" aria-live="polite"></div>
    </div>
    <p class="email-preview-note">Email chỉ thông báo rằng có KUDOS mới và dẫn vào màn này; nội dung lời ghi nhận không hiển thị trực tiếp trong email.</p>
   </section>
   <div class="compose-send-footer">
    <button type="button" class="link-btn" data-modal="rules">Xem quy tắc →</button>
    <div class="form-actions"><button type="button" class="btn secondary" id="preview">Xem lại KUDOS ↑</button><button type="button" class="btn primary" id="send">Gửi KUDOS ${svg('send')}</button></div>
   </div>
  </article>
 </div>
</section>`;
}

// ---- Profile ---------------------------------------------------------------
function profile(){
 const u=me();
 const rec=receivedFor(u.email);
 const sent=sentBy(u.email);
 const receivedHtml=rec.length?`<div class="feed">${rec.map(k=>receivedFeedItem(k)).join('')}</div>`
   :`<div class="received-empty-state">
      <img class="received-empty-mascot" src="${BASE}/illustrations/empty-received-mascot.png" alt="Mascot Ahamove đang chờ Kudos" data-fallback="${BASE}/illustrations/mascot-cutout.png">
      <div class="received-empty-copy">
        <span class="received-empty-kicker">Đã nhận</span>
        <h3>Chưa có Kudos nào</h3>
        <p>Khi đồng nghiệp gửi lời ghi nhận, bạn sẽ thấy ở đây.</p>
        <button class="btn primary" data-page="send-kudos">Gửi Kudos ngay →</button>
      </div>
    </div>`;
 const sentHtml=sent.length?`<div class="feed sent-history">${sent.map(k=>{
     const cn=(k.values||[]).map(v=>CULTURE[v]||v);
     const ms=modStatusOf(k);
     const statusText=ms==='HIDDEN'?'● Không được duyệt hiển thị':ms==='HELD'?'🕓 Chờ Admin duyệt':k.visibility==='public'?'◎ CỘNG ĐỒNG KUDOS · Admin đã duyệt':'● Chỉ người nhận biết · Admin đã duyệt';
     return `<div class="feed-item sent-feed-item kudos-open" role="button" tabindex="0" data-open-kudos="${k.id}">
       <div class="feed-head"><div class="mini-avatar">${initials(k.recipientName)}</div><div class="who"><b>${escapeHtml(k.recipientName)}</b><span>${escapeHtml(k.recipientEmail)}</span></div><time>${escapeHtml(k.sentAtLabel||'Đã gửi')}</time></div>
       <p>${escapeHtml(k.message)}</p>
       <div class="sent-item-footer"><div>${cn.length?`<div class="sent-values-label">Giá trị văn hoá được ghi nhận</div><div class="value-tags">${cn.map(n=>`<span>${escapeHtml(n)}</span>`).join('')}</div>`:''}<span class="sent-visibility ${k.visibility==='public'?'public':'private'}">${statusText}</span></div><button class="link-btn" data-open-kudos="${k.id}">Xem chi tiết</button></div>
     </div>`;
   }).join('')}</div>`
   :`<div class="received-empty-state sent-empty-state">
      <img class="received-empty-mascot" src="${BASE}/illustrations/empty-sent-mascot.png" alt="Mascot Ahamove với hộp quà" data-fallback="${BASE}/illustrations/mascot-cutout.png">
      <div class="received-empty-copy">
        <h3>Chưa có Kudos – Gửi lời khen đầu tiên</h3>
        <p>Bắt đầu bằng một lời cảm ơn dành cho đồng nghiệp bạn muốn ghi nhận.</p>
        <button class="btn primary" data-page="send-kudos">Gửi KUDOS đầu tiên →</button>
      </div>
    </div>`;
return `<section class="page active"><div class="page-head"><div><div class="kicker">HÀNH TRÌNH GHI NHẬN</div><h1>Hồ sơ KUDOS</h1><p class="page-sub">Xem lại những KUDOS bạn đã nhận và đã gửi — tất cả được lưu để bạn mở lại bất cứ lúc nào.</p></div></div>
 <div class="profile-grid">
  <article class="card profile-card"><div class="profile-avatar-edit">${avatarMarkup('profile-big-avatar')}<button class="avatar-edit-btn profile-avatar-btn" data-avatar-edit title="Cập nhật avatar">✎</button></div><h2>${escapeHtml(u.name)}</h2><p>${escapeHtml(u.dept)} · Ahamove</p><button class="profile-avatar-link" data-avatar-edit>Cập nhật ảnh đại diện</button><div class="profile-stats profile-stats-two"><div class="pstat"><b>${rec.length}</b><span>Đã nhận</span></div><div class="pstat"><b>${sent.length}</b><span>Đã gửi</span></div></div></article>
  <article class="card card-pad">
   <div class="tabs"><button class="tab active" data-tab="received">Đã nhận</button><button class="tab" data-tab="sent">Đã gửi</button></div>
   <div class="tab-panel active" id="tab-received">${receivedHtml}</div>
   <div class="tab-panel" id="tab-sent">${sentHtml}</div>
  </article>
 </div>
</section>`;
}

// ---- KUDOS detail (deep link #/k/<id>) — server decides who may see what -----
const detailLoad={};
function kudosDetail(){
 const id=state.viewKudosId;
 const k=kudosById(id);
 const u=me();
 const back=`<button class="kd-back" data-page="employee-home">← Về trang chủ</button>`;
 if(!k){
   const d=detailLoad[id];
   if(!d&&id){
     detailLoad[id]={loading:true};
     rpc('xemKudos',id).then(rec=>{store.detail[id]=rec;detailLoad[id]={done:true};})
       .catch(e=>{detailLoad[id]={error:e};if(e.code!=='KUDOS_NOT_AVAILABLE')console.error('[AhaKudos] xemKudos',e);})
       .finally(()=>{if(state.page==='kudos-detail'&&state.viewKudosId===id)render();});
   }
   if(id&&(!d||d.loading))return `<section class="page active kudos-detail-page">${back}<div class="empty"><div class="icon">…</div><h3>Đang mở lời ghi nhận…</h3></div></section>`;
   const msg=d&&d.error&&d.error.code!=='KUDOS_NOT_AVAILABLE'?escapeHtml(d.error.message):'KUDOS không tồn tại, chưa được Admin duyệt, hoặc bạn không có quyền xem lời ghi nhận này.';
   return `<section class="page active kudos-detail-page">${back}<div class="empty"><div class="icon">✦</div><h3>Không mở được lời ghi nhận</h3><p>${msg}</p></div></section>`;
 }
 const isRecipient=!!k.recipientEmail&&k.recipientEmail===u.email;
 const isSender=!!k.senderEmail&&k.senderEmail===u.email;
 if(!isRecipient&&!isSender&&!k.isCommunity){
   return `<section class="page active kudos-detail-page">${back}<div class="empty"><div class="icon">✦</div><h3>Không mở được lời ghi nhận</h3><p>Bạn không có quyền xem lời ghi nhận này.</p></div></section>`;
 }
 // Mark as viewed only when the recipient actually opens the detail.
 if(isRecipient&&!k.viewedAt&&!k._markingViewed){
  k._markingViewed=true;
  rpc('ghiDaMo',k.id).then(takeRecord).catch(e=>{console.warn('[AhaKudos] ghiDaMo',e);}).finally(()=>{k._markingViewed=false;});
 }
 const status=modStatusOf(k);
 const emailStatusPill=isSender&&!isRecipient?`<span class="status-pill status-queued"><i></i>${escapeHtml(mailStatusText(k))}</span>`:'';
 const visPill=status==='HIDDEN'?`<span class="status-pill status-private"><i></i>Không được duyệt hiển thị</span>`
   :k.visibility==='public'
   ?(status==='APPROVED'?`<span class="status-pill status-public"><i></i>CỘNG ĐỒNG KUDOS · Admin đã duyệt</span>`
     :`<span class="status-pill status-pending"><i></i>Chờ Admin duyệt CỘNG ĐỒNG KUDOS</span>`)
   :`<span class="status-pill status-private"><i></i>Chỉ người nhận biết</span>`;
 let senderBlock='';
 if(isSender&&!isRecipient){
   const s=status==='HIDDEN'?'KUDOS này không được Admin duyệt hiển thị. Người nhận sẽ không nhận được thông báo.'
     :status==='HELD'?'KUDOS đang chờ Admin duyệt. Người nhận sẽ nhận email thông báo sau khi Admin duyệt.'
     :k.visibility==='public'?'Admin đã duyệt CỘNG ĐỒNG KUDOS. Lời ghi nhận đang hiển thị công khai với danh tính người gửi.'
     :`Admin đã duyệt. Lời ghi nhận được gửi riêng cho ${escapeHtml(k.recipientName)}.`;
   senderBlock=`<div class="kd-panel"><h3>Trạng thái</h3><p class="kd-sender-status">${s}</p></div>`;
 }
 const backTarget=isSender&&!isRecipient?'kudos-profile':(k.isCommunity&&!isRecipient?'public-feed':'employee-home');
 const kicker=isRecipient?'KUDOS DÀNH CHO BẠN':isSender?'KUDOS BẠN ĐÃ GỬI':'CỘNG ĐỒNG KUDOS';
 const title=isRecipient?'Có một lời ghi nhận dành riêng cho bạn 💛':isSender?'Lời ghi nhận bạn đã gửi':'Một lời ghi nhận đang được lan tỏa';
 const sub=isRecipient?'Một đồng đội đã nhìn thấy điều bạn làm và muốn gửi đến bạn lời ghi nhận này.':isSender?'Đây là lời ghi nhận bạn đã gửi (trên background đã chọn).':'Lời ghi nhận đã được Admin duyệt cho CỘNG ĐỒNG KUDOS.';
 return `<section class="page active kudos-detail-page">
   <button class="kd-back" data-page="${backTarget}">← ${backTarget==='kudos-profile'?'Về Hồ sơ':backTarget==='public-feed'?'Về Cộng đồng':'Về trang chủ'}</button>
   <div class="page-head"><div><div class="kicker">${kicker}</div><h1>${title}</h1><p class="page-sub">${sub}</p></div></div>
   ${buildKudosCard(k,{mode:isRecipient?'':'public'})}
   <div class="kd-panel"><div class="kd-row">${emailStatusPill}${visPill}</div>${isRecipient?'<div class="kd-save-note"><span>💾</span><div>Lời ghi nhận này được <b>tự động lưu</b> trong Hồ sơ KUDOS của bạn — không cần bấm "Lưu". Bạn có thể mở lại bất cứ lúc nào.</div></div>':''}</div>
   ${senderBlock}
 </section>`;
}

// ---- Admin (giữ nguyên) ----------------------------------------------------
// ---- Dashboard dữ liệu thật + lọc ngày + export CSV (feedback #4) ----
let dashFrom='',dashTo='',dashDept='';
function dashFiltered(){return (ADMIN.records||[]).filter(r=>{const d=(r.createdAt||'').slice(0,10);if(dashFrom&&d<dashFrom)return false;if(dashTo&&d>dashTo)return false;return true;});}
function dashScoped(){return dashFiltered().filter(r=>!dashDept||r.recipientDept===dashDept);}
function deptOptions(){var set={};(ADMIN.records||[]).forEach(r=>{if(r.recipientDept)set[r.recipientDept]=1;});return Object.keys(set).sort();}
// Thanh lọc dùng chung: ngày (preset + tùy chọn) + phòng ban + xuất CSV. exportKey: 'kudos'|'dept'|'culture'.
function filterBar(exportKey){
 const opts=deptOptions().map(d=>`<option value="${escapeHtml(d)}" ${dashDept===d?'selected':''}>${escapeHtml(d)}</option>`).join('');
 return `<style>
   .dash-filter{display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:space-between;margin:6px 0 0}
   .dash-presets{display:flex;gap:6px;flex-wrap:wrap}
   .chip-btn{border:1px solid var(--line);background:#fff;color:var(--navy);border-radius:999px;padding:7px 12px;font-size:13px;font-weight:700;cursor:pointer}
   .chip-btn:hover{border-color:#BCD3EA}
   .dash-range{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
   .dash-range .input,.dash-range .select{height:40px;width:auto}
   @media(max-width:820px){.dash-filter{flex-direction:column;align-items:stretch}.dash-range{flex-wrap:wrap}}
  </style>
  <div class="dash-filter">
   <div class="dash-presets">
     <button class="chip-btn" data-dash-preset="7">7 ngày</button>
     <button class="chip-btn" data-dash-preset="30">30 ngày</button>
     <button class="chip-btn" data-dash-preset="month">Tháng này</button>
     <button class="chip-btn" data-dash-preset="all">Tất cả</button>
   </div>
   <div class="dash-range">
     <input id="dash-from" class="input" type="date" value="${dashFrom}"><span>→</span><input id="dash-to" class="input" type="date" value="${dashTo}">
     <select id="dash-dept" class="select"><option value="">Tất cả phòng ban</option>${opts}</select>
     <button class="btn secondary" id="dash-apply">Lọc</button>
     <button class="btn primary" data-export="${exportKey}">⬇ Xuất CSV</button>
   </div>
  </div>`;
}
function deptAgg(recs){
 const CULT={fair:'Công bằng & Tôn trọng',share:'Học hỏi & Chia sẻ',grow:'Gắn kết & Cùng phát triển'};
 const m={};recs.forEach(r=>{const d=r.recipientDept||'—';if(!m[d])m[d]={dept:d,received:0,senders:{},receivers:{},cult:{fair:0,share:0,grow:0}};const o=m[d];o.received++;if(r.senderEmail)o.senders[r.senderEmail]=1;if(r.recipientEmail)o.receivers[r.recipientEmail]=1;(r.values||[]).forEach(v=>{if(o.cult[v]!=null)o.cult[v]++;});});
 return Object.keys(m).map(k=>{const o=m[k];const top=Object.keys(o.cult).sort((a,b)=>o.cult[b]-o.cult[a])[0];return {dept:o.dept,received:o.received,senders:Object.keys(o.senders).length,receivers:Object.keys(o.receivers).length,topCult:o.received&&o.cult[top]?CULT[top]:'—'};}).sort((a,b)=>b.received-a.received);
}
function csvEsc(v){const s=String(v==null?'':v).replace(/"/g,'""');return /[",\n\r]/.test(s)?`"${s}"`:s;}
function downloadCsv(lines,prefix){try{const csv='﻿'+lines.join('\r\n');const blob=new Blob([csv],{type:'text/csv;charset=utf-8'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=prefix+new Date().toISOString().slice(0,10)+'.csv';document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove();},600);toast('Đã xuất CSV ('+(lines.length-1)+' dòng).');}catch(e){toast('Không xuất được CSV: '+e.message);}}
function deptExportCsv(){const agg=deptAgg(dashScoped());const head=['Phong_ban','KUDOS_nhan','Nguoi_gui','Nguoi_nhan','Gia_tri_noi_bat'];const lines=[head.join(',')];agg.forEach(a=>lines.push([a.dept,a.received,a.senders,a.receivers,a.topCult].map(csvEsc).join(',')));downloadCsv(lines,'ahakudos_phongban_');}
function cultureExportCsv(){const recs=dashScoped();const deptSet=[];recs.forEach(r=>{if(r.recipientDept&&deptSet.indexOf(r.recipientDept)<0)deptSet.push(r.recipientDept);});const head=['Phong_ban','Gan_ket_Cung_phat_trien','Hoc_hoi_Chia_se','Cong_bang_Ton_trong'];const lines=[head.join(',')];deptSet.forEach(d=>{const rr=recs.filter(x=>x.recipientDept===d);const c={fair:0,share:0,grow:0};rr.forEach(x=>(x.values||[]).forEach(v=>{if(c[v]!=null)c[v]++;}));lines.push([d,c.grow,c.share,c.fair].map(csvEsc).join(','));});downloadCsv(lines,'ahakudos_giatri_');}
function adminDataDashboard(){
 const recs=dashScoped();
 const uniq=(a)=>Array.from(new Set(a.filter(Boolean))).length;
 const senders=uniq(recs.map(r=>r.senderEmail));
 const receivers=uniq(recs.map(r=>r.recipientEmail));
 const sent=recs.filter(r=>r.email&&r.email.status==='SENT').length;
 const held=recs.filter(r=>modStatusOf(r)==='HELD').length;
 const pub=recs.filter(r=>r.visibility==='public'&&r.publicConsent==='approved').length;
 const CULT={fair:'Công bằng & Tôn trọng',share:'Học hỏi & Chia sẻ',grow:'Gắn kết & Cùng phát triển'};
 const cultCount={fair:0,share:0,grow:0};recs.forEach(r=>(r.values||[]).forEach(v=>{if(cultCount[v]!=null)cultCount[v]++;}));
 const deptCount={};recs.forEach(r=>{const d=r.recipientDept||'—';deptCount[d]=(deptCount[d]||0)+1;});
 const deptTop=Object.entries(deptCount).sort((a,b)=>b[1]-a[1]).slice(0,6);
 const maxDept=Math.max(1,...deptTop.map(d=>d[1]));
 const maxCult=Math.max(1,cultCount.fair,cultCount.share,cultCount.grow);
 const tile=(ic,label,val,sub)=>`<article class="metric"><div class="metric-icon">${ic}</div><span>${label}</span><strong>${val}</strong><em>${sub||''}</em></article>`;
 const rangeLabel=(dashFrom||dashTo)?`${dashFrom||'…'} → ${dashTo||'…'}`:'toàn bộ';
 return `<article class="card admin-card" style="padding:18px;margin-bottom:14px">
   <style>
    .dash-breakdown{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:16px}
    .dash-col h4{margin:0 0 10px;font-size:14px;color:var(--navy)}
    .dash-bar-row{display:grid;grid-template-columns:minmax(120px,1.4fr) 2fr auto;gap:10px;align-items:center;margin-bottom:9px;font-size:13px;color:var(--text)}
    .dash-bar{height:9px;background:#EDF2F7;border-radius:999px;overflow:hidden}
    .dash-bar i{display:block;height:100%;border-radius:999px;background:linear-gradient(90deg,var(--orange),#FFB55E)}
    .dash-bar-row b{color:var(--navy)}
    @media(max-width:820px){.dash-breakdown{grid-template-columns:1fr}}
   </style>
   <div class="card-head"><div><div class="kicker">DỮ LIỆU THẬT · TỪ GOOGLE SHEET</div><h3>Tổng quan KUDOS</h3><div class="sub">Lọc theo thời gian tạo KUDOS (${rangeLabel})${dashDept?(' · '+escapeHtml(dashDept)):''}. Xuất CSV để làm báo cáo.</div></div></div>
   ${filterBar('kudos')}
   <div class="metric-grid" style="margin-top:14px">
     ${tile('⌘','Tổng KUDOS',recs.length,rangeLabel==='toàn bộ'?'toàn bộ':'trong khoảng')}
     ${tile('👥','Người gửi',senders,'khác nhau')}
     ${tile('★','Người nhận',receivers,'khác nhau')}
     ${tile('✉','Đã gửi email',sent,'SENT')}
     ${tile('△','Chờ duyệt',held,'kiểm duyệt')}
     ${tile('◎','Công khai',pub,'đã duyệt')}
   </div>
   <div class="dash-breakdown">
     <div class="dash-col"><h4>Theo giá trị văn hoá</h4>${['grow','share','fair'].map(k=>`<div class="dash-bar-row"><span>${CULT[k]}</span><div class="dash-bar"><i style="width:${Math.round(cultCount[k]/maxCult*100)}%"></i></div><b>${cultCount[k]}</b></div>`).join('')}</div>
     <div class="dash-col"><h4>Theo phòng ban (nhận nhiều nhất)</h4>${deptTop.length?deptTop.map(([d,c])=>`<div class="dash-bar-row"><span>${escapeHtml(d)}</span><div class="dash-bar"><i style="width:${Math.round(c/maxDept*100)}%"></i></div><b>${c}</b></div>`).join(''):'<p class="sub">Chưa có dữ liệu trong khoảng lọc.</p>'}</div>
   </div>
 </article>`;
}
function dashExportCsv(){
 const recs=dashScoped();
 const CULT={fair:'Cong bang & Ton trong',share:'Hoc hoi & Chia se',grow:'Gan ket & Cung phat trien'};
 const head=['Thoi_gian_tao','Nguoi_gui','Phong_ban_gui','Nguoi_nhan','Phong_ban_nhan','Gia_tri_van_hoa','Pham_vi','Duyet_cong_khai','Kiem_duyet','Email','Noi_dung'];
 const esc=(v)=>{const s=String(v==null?'':v).replace(/"/g,'""');return /[",\n\r]/.test(s)?`"${s}"`:s;};
 const lines=[head.join(',')];
 recs.forEach(r=>{lines.push([r.createdAt||'',r.senderName||'',r.senderDept||'',r.recipientName||'',r.recipientDept||'',(r.values||[]).map(v=>CULT[v]||v).join(' | '),r.visibility||'',r.publicConsent||'',modStatusOf(r),(r.email&&r.email.status)||'AWAITING_APPROVAL',String(r.message||'').replace(/\r?\n/g,' ')].map(esc).join(','));});
 const csv='﻿'+lines.join('\r\n');
 try{
  const blob=new Blob([csv],{type:'text/csv;charset=utf-8'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='ahakudos_export_'+new Date().toISOString().slice(0,10)+'.csv';
  document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove();},600);
  toast('Đã xuất '+recs.length+' KUDOS ra CSV.');
 }catch(e){toast('Không xuất được CSV: '+e.message);}
}
function bindAdminFilters(){
 document.querySelectorAll('[data-dash-preset]').forEach(b=>b.addEventListener('click',()=>{
   const p=b.dataset.dashPreset,now=new Date(),iso=d=>d.toISOString().slice(0,10);
   if(p==='all'){dashFrom='';dashTo='';}
   else if(p==='month'){dashFrom=iso(new Date(now.getFullYear(),now.getMonth(),1));dashTo=iso(now);}
   else{const days=parseInt(p,10),from=new Date(now);from.setDate(now.getDate()-days+1);dashFrom=iso(from);dashTo=iso(now);}
   render();
 }));
 const apply=document.querySelector('#dash-apply');if(apply)apply.addEventListener('click',()=>{dashFrom=(document.querySelector('#dash-from').value||'');dashTo=(document.querySelector('#dash-to').value||'');const ds=document.querySelector('#dash-dept');if(ds)dashDept=ds.value;render();});
 const ds=document.querySelector('#dash-dept');if(ds)ds.addEventListener('change',()=>{dashDept=ds.value;render();});
 document.querySelectorAll('[data-export]').forEach(b=>b.addEventListener('click',()=>{const k=b.dataset.export;if(k==='dept')deptExportCsv();else if(k==='culture')cultureExportCsv();else dashExportCsv();}));
}
function adminHome(){
 const gate=adminGate();if(gate)return gate;
 const recs=ADMIN.records;
 const agg=deptAgg(recs).slice(0,6);
 const maxR=Math.max(1,...agg.map(a=>a.received));
 const held=recs.filter(k=>modStatusOf(k)==='HELD');
 const cnt={fair:0,share:0,grow:0};recs.forEach(r=>(r.values||[]).forEach(v=>{if(cnt[v]!=null)cnt[v]++;}));
 const totalV=(cnt.fair+cnt.share+cnt.grow)||1;
 const up=ADMIN.upcoming||{birthdays:[],anniversaries:[]};
 const emailFailed=recs.filter(k=>k.email&&k.email.status==='FAILED').length;
 const emailPending=recs.filter(k=>k.email&&k.email.status==='PENDING').length;
 const mi=(ADMIN.master&&ADMIN.master.issues)||{};
 const masterWarn=ADMIN.master&&(mi.missingTab||(mi.missingRequired||[]).length||mi.skippedNoEmail||mi.skippedNoName||mi.invalidEmail||(mi.duplicates||[]).length)
   ?`<div class="ops-note" role="status">⚠ Master Data: ${escapeHtml([mi.missingTab?'thiếu tab DATA':'',(mi.missingRequired||[]).length?'thiếu cột '+mi.missingRequired.join(', '):'',mi.skippedNoEmail?mi.skippedNoEmail+' dòng thiếu Work Email':'',mi.skippedNoName?mi.skippedNoName+' dòng thiếu Full Name':'',mi.invalidEmail?mi.invalidEmail+' email sai định dạng':'',(mi.duplicates||[]).length?(mi.duplicates.length+' email trùng'):''].filter(Boolean).join(' · '))}. Các dòng này được bỏ qua.</div>`:'';
 return `<section class="page active">
 <div class="admin-head"><div class="admin-logo-chip">${logo(true)}</div><div><h1>Trung tâm quản trị</h1><p>Không gian vận hành AhaKudos toàn công ty.</p></div></div>
 <div class="page-head"><div><div class="kicker">PROGRAM CONTROL</div><h1>Tổng quan AhaKudos</h1><p class="page-sub">Ghi nhận · Chất lượng · AhaKudos từ Admin · Sinh nhật & Thâm niên · Dữ liệu văn hóa</p></div><button class="btn primary" data-page="admin-recognition">+ Gửi AhaKudos</button></div>
 ${masterWarn}
 ${adminDataDashboard()}
 <div class="admin-grid">
  <article class="card admin-card"><div class="card-head"><div><div class="kicker">PHÒNG BAN</div><h3>Mức độ được ghi nhận</h3><div class="sub">Theo số KUDOS nhận (toàn bộ dữ liệu).</div></div><button class="link-btn" data-page="admin-dept">Chi tiết →</button></div>
   <div class="table-wrap"><table><thead><tr><th>Phòng ban</th><th>KUDOS nhận</th><th>Người gửi</th><th>Người nhận</th></tr></thead><tbody>${agg.length?agg.map(a=>`<tr><td>${escapeHtml(a.dept)}</td><td><span class="bar"><i style="width:${Math.round(a.received/maxR*100)}%"></i></span>${a.received}</td><td>${a.senders}</td><td>${a.receivers}</td></tr>`).join(''):'<tr><td colspan="4" style="color:var(--muted);padding:14px">Chưa có dữ liệu.</td></tr>'}</tbody></table></div>
  </article>
  <article class="card admin-card"><div class="card-head"><div><div class="kicker">HÀNG CHỜ</div><h3>Nội dung cần duyệt (${held.length})</h3></div><button class="link-btn" data-page="admin-quality">Xem tất cả →</button></div>
   <div class="review-list">${held.slice(0,3).map(k=>`<div class="review-row"><div class="mini-avatar">${escapeHtml(initials(k.senderName))}</div><div><b>${escapeHtml(k.senderName||'')}</b><p>${escapeHtml(String(k.message||'').slice(0,90))}${String(k.message||'').length>90?'…':''}</p></div><span class="flag">${escapeHtml(modReasonsTextClient((k.moderation&&k.moderation.reasons||[]).filter(r=>r!=='admin_review'))[0]||'Chờ duyệt')}</span></div>`).join('')||'<p class="sub">Không có KUDOS nào đang chờ duyệt.</p>'}</div>
  </article>
  <article class="card admin-card"><div class="card-head"><div><div class="kicker">GIÁ TRỊ VĂN HÓA</div><h3>Đang được ghi nhận</h3></div><button class="link-btn" data-page="admin-culture">Chi tiết →</button></div>
   <div class="culture-bars">${['grow','share','fair'].map(v=>`<div class="culture-item"><div class="culture-bar-head"><span>${CULTURE[v]}</span><b>${Math.round(cnt[v]/totalV*100)}%</b></div><div class="culture-line"><i style="width:${Math.round(cnt[v]/totalV*100)}%"></i></div></div>`).join('')}</div>
  </article>
  <article class="card admin-card"><div class="card-head"><div><div class="kicker">MASTER DATA · 30 NGÀY TỚI</div><h3>Sinh nhật, Thâm niên & Email</h3></div><button class="link-btn" data-page="admin-ops">Chi tiết →</button></div>
   <div class="ops-row"><b>Sinh nhật</b><strong>${up.birthdays.length}</strong><span>trong ${up.windowDays||30} ngày tới</span></div>
   <div class="ops-row"><b>Thâm niên</b><strong>${up.anniversaries.length}</strong><span>kỷ niệm năm làm việc</span></div>
   <div class="ops-row"><b>Email</b><strong>${emailPending}</strong><span>chờ gửi · ${emailFailed} lỗi cần xử lý</span></div>
  </article>
 </div>
</section>`;
}
function adminDept(){
 const gate=adminGate();if(gate)return gate;
 const recs=dashScoped();
 const agg=deptAgg(recs);
 const maxR=Math.max(1,...agg.map(a=>a.received));
 const rows=agg.length?agg.map(a=>`<tr><td>${escapeHtml(a.dept)}</td><td><span class="bar"><i style="width:${Math.round(a.received/maxR*100)}%"></i></span>${a.received}</td><td>${a.senders}</td><td>${a.receivers}</td><td>${escapeHtml(a.topCult)}</td></tr>`).join(''):`<tr><td colspan="5" style="color:var(--muted);padding:14px">Chưa có dữ liệu trong khoảng lọc.</td></tr>`;
 return `<section class="page active">
   <div class="page-head"><div><div class="kicker">THEO PHÒNG BAN</div><h1>Mức độ ghi nhận & tham gia</h1><p class="page-sub">Dữ liệu thật từ KUDOS. Lọc theo thời gian / phòng ban và xuất CSV để báo cáo.</p></div></div>
   ${filterBar('dept')}
   <article class="card admin-card" style="padding:16px 18px;margin-top:14px"><div class="table-wrap"><table>
     <thead><tr><th>Phòng ban</th><th>KUDOS nhận</th><th>Người gửi</th><th>Người nhận</th><th>Giá trị nổi bật</th></tr></thead>
     <tbody>${rows}</tbody></table></div></article>
 </section>`;
}
function adminCulture(){
 const gate=adminGate();if(gate)return gate;
 const recs=dashScoped();
 const CULT={grow:'Gắn kết & Cùng phát triển',share:'Học hỏi & Chia sẻ',fair:'Công bằng & Tôn trọng'};
 const cnt={fair:0,share:0,grow:0};recs.forEach(r=>(r.values||[]).forEach(v=>{if(cnt[v]!=null)cnt[v]++;}));
 const total=(cnt.fair+cnt.share+cnt.grow)||1;
 const bars=['grow','share','fair'].map(k=>`<div class="culture-item"><div class="culture-bar-head"><b>${CULT[k]}</b><span>${cnt[k]} · ${Math.round(cnt[k]/total*100)}%</span></div><div class="culture-line"><i style="width:${Math.round(cnt[k]/total*100)}%"></i></div></div>`).join('');
 const deptSet=[];recs.forEach(r=>{if(r.recipientDept&&deptSet.indexOf(r.recipientDept)<0)deptSet.push(r.recipientDept);});
 const rows=deptSet.length?deptSet.map(d=>{const rr=recs.filter(x=>x.recipientDept===d);const c={fair:0,share:0,grow:0};rr.forEach(x=>(x.values||[]).forEach(v=>{if(c[v]!=null)c[v]++;}));return `<tr><td>${escapeHtml(d)}</td><td>${c.grow}</td><td>${c.share}</td><td>${c.fair}</td></tr>`;}).join(''):`<tr><td colspan="4" style="color:var(--muted);padding:14px">Chưa có dữ liệu trong khoảng lọc.</td></tr>`;
 return `<section class="page active">
   <div class="page-head"><div><div class="kicker">DỮ LIỆU VĂN HÓA</div><h1>Giá trị văn hóa đang được thể hiện</h1><p class="page-sub">Dữ liệu thật từ KUDOS (theo lượt chọn giá trị). Lọc theo thời gian / phòng ban và xuất CSV.</p></div></div>
   ${filterBar('culture')}
   <article class="card admin-card" style="padding:16px 18px;margin-top:14px"><div class="card-head"><div><div class="kicker">TỶ TRỌNG</div><h3>Toàn công ty</h3></div></div><div class="culture-bars">${bars}</div></article>
   <article class="card admin-card" style="padding:16px 18px;margin-top:14px"><div class="card-head"><div><div class="kicker">THEO PHÒNG BAN</div><h3>Lượt giá trị theo phòng ban</h3></div></div><div class="table-wrap"><table><thead><tr><th>Phòng ban</th><th>Gắn kết & Cùng phát triển</th><th>Học hỏi & Chia sẻ</th><th>Công bằng & Tôn trọng</th></tr></thead><tbody>${rows}</tbody></table></div></article>
 </section>`;
}

function clientNormUrl(u){
 const s=String(u||'').trim();if(!s)return '';
 const m=s.match(/drive\.google\.com\/file\/d\/([A-Za-z0-9_-]{10,})/)||s.match(/[?&]id=([A-Za-z0-9_-]{10,})/);
 if(m&&/drive\.google\.com/.test(s))return 'https://lh3.googleusercontent.com/d/'+m[1];
 return /^https:\/\//i.test(s)?s:'';
}
function adminEvents(){
 const ev=editingEventId?eventById(editingEventId):null;
 const list=EVENTS_LIST||[];
 const today=new Date().toISOString().slice(0,10);
 const statusOf=(e)=>{if(!e.active)return {t:'Đang tắt',c:'#8390a3',b:'#eef1f5'};if(e.from&&today<e.from)return {t:'Chờ tới lịch',c:'#9a6e1d',b:'#fff4e3'};if(e.to&&today>e.to)return {t:'Hết hạn',c:'#8390a3',b:'#eef1f5'};return {t:'Đang chạy',c:'#2a8f5a',b:'#eaf8ef'};};
 const rows=list.length?list.map(e=>{const s=statusOf(e);return `<div class="ev-row">
     <span class="ev-thumb" style="background-image:url('${escapeHtml(e.url)}')"></span>
     <div class="ev-info"><b>${escapeHtml(e.name)}</b><div class="ev-meta"><span class="ev-status" style="color:${s.c};background:${s.b}">${s.t}</span>${(e.from||e.to)?`<span class="ev-dates">${escapeHtml(e.from||'…')} → ${escapeHtml(e.to||'…')}</span>`:''}</div>${e.note?`<div class="ev-note">${escapeHtml(e.note)}</div>`:''}</div>
     <div class="ev-actions">
       <button class="btn secondary" data-ev-toggle="${e.id}" data-on="${e.active?'':'1'}">${e.active?'Tắt':'Bật'}</button>
       <button class="btn secondary" data-ev-edit="${e.id}">Sửa</button>
       <button class="btn danger" data-ev-del="${e.id}">Xoá</button>
     </div>
   </div>`;}).join(''):`<div class="empty"><div class="icon">🖼️</div><h3>Chưa có sự kiện nào</h3><p>Thêm background theo dịp (Tết, sinh nhật, kỷ niệm…) để nhân viên chọn khi gửi Kudos.</p></div>`;
 const pUrl=ev?ev.url:'';
 return `<section class="page active">
  <style>
   .ev-layout{display:grid;grid-template-columns:minmax(0,1fr) minmax(300px,.82fr);gap:16px;align-items:start}
   .ev-form .field{margin-bottom:14px}
   .ev-form label{display:block;font-size:13px;font-weight:700;color:var(--navy);margin-bottom:6px}
   .ev-check{display:flex;align-items:center;gap:8px;font-size:14px;color:var(--ink)}
   .ev-date-row{display:grid;grid-template-columns:1fr 1fr;gap:10px}
   .ev-preview{position:sticky;top:96px}
   .ev-prev-kudos{width:100%;min-height:250px;border-radius:18px;background:#FFF3E6 center/cover no-repeat;border:1px solid var(--line);box-shadow:0 8px 22px rgba(23,58,94,.1);padding:18px;display:flex;align-items:center;justify-content:center;box-sizing:border-box}
   .ev-prev-kudos-card{width:min(92%,420px);background:rgba(255,255,255,.9);border-radius:16px;padding:18px;box-shadow:0 10px 25px rgba(23,58,94,.14)}
   .ev-prev-kudos-card b{display:block;color:var(--navy);font-size:13px;letter-spacing:.08em;text-transform:uppercase;margin-bottom:9px}.ev-prev-kudos-card p{font-size:14px;line-height:1.7;color:var(--text);margin:0}.ev-prev-kudos-card span{display:inline-block;margin-top:10px;background:#EAF2FB;color:#2F6FB8;border-radius:999px;padding:5px 9px;font-size:12px;font-weight:700}
   .ev-hint{font-size:13px;color:var(--muted);line-height:1.7;margin-top:6px}
   .ev-list{display:grid;gap:12px;margin-top:14px}
   .ev-row{display:flex;align-items:center;gap:14px;border:1px solid var(--line);border-radius:16px;padding:12px;background:#fff}
   .ev-thumb{flex:0 0 auto;width:64px;height:64px;border-radius:14px;background:#FFF3E6 center/cover no-repeat}
   .ev-info{flex:1;min-width:0}.ev-info b{font-size:14px;color:var(--navy)}
   .ev-meta{display:flex;gap:8px;align-items:center;margin-top:5px;flex-wrap:wrap}
   .ev-status{font-size:12px;font-weight:700;border-radius:999px;padding:4px 10px}
   .ev-dates{font-size:12px;color:var(--muted)}.ev-note{font-size:12px;color:var(--muted);margin-top:4px}
   .ev-actions{display:flex;gap:6px;flex-wrap:wrap}.ev-actions .btn{padding:8px 12px;font-size:13px}
   @media(max-width:900px){.ev-layout{grid-template-columns:1fr}.ev-preview{position:static}.ev-row{flex-wrap:wrap}.ev-actions{width:100%;justify-content:flex-end}}
  </style>
  <div class="page-head"><div><div class="kicker">NỀN THEO SỰ KIỆN</div><h1>Quản lý background sự kiện</h1><p class="page-sub">Thêm template/background theo dịp bằng URL ảnh (hỗ trợ Google Drive “Bất kỳ ai có link”). Sự kiện đang bật + trong lịch sẽ hiện trong picker của nhân viên và trang chi tiết KUDOS. Email thông báo không dùng ảnh sự kiện.</p></div></div>
  <div class="ev-layout">
   <article class="card admin-card ev-form" style="padding:18px">
     <div class="card-head"><div><div class="kicker">${ev?'SỬA SỰ KIỆN':'THÊM SỰ KIỆN'}</div><h3>${ev?escapeHtml(ev.name):'Sự kiện mới'}</h3></div>${ev?'<button class="link-btn" id="ev-cancel">+ Thêm mới</button>':''}</div>
     <div class="field"><label>Tên sự kiện</label><input id="ev-name" class="input" maxlength="80" placeholder="VD: Tết 2026" value="${ev?escapeHtml(ev.name):''}"></div>
     <div class="field"><label>URL ảnh nền (HTTPS hoặc Google Drive share link)</label><input id="ev-url" class="input" placeholder="https://… hoặc https://drive.google.com/file/d/…/view" value="${escapeHtml(pUrl)}"><div class="ev-hint">Drive: bấm Share → “Anyone with the link” → dán link. Hệ thống tự chuyển sang link hiển thị trực tiếp.</div></div>
     <div class="ev-date-row">
       <div class="field"><label>Từ ngày (tuỳ chọn)</label><input id="ev-from" class="input" type="date" value="${ev?escapeHtml(ev.from||''):''}"></div>
       <div class="field"><label>Đến ngày (tuỳ chọn)</label><input id="ev-to" class="input" type="date" value="${ev?escapeHtml(ev.to||''):''}"></div>
     </div>
     <div class="field"><label>Ghi chú (tuỳ chọn)</label><input id="ev-note" class="input" maxlength="200" value="${ev?escapeHtml(ev.note||''):''}"></div>
     <div class="field"><label class="ev-check"><input id="ev-active" type="checkbox" ${(!ev||ev.active)?'checked':''}> Kích hoạt (cho phép chọn ngay)</label></div>
     <div class="form-actions" style="display:flex;gap:8px;justify-content:flex-end"><button class="btn primary" id="ev-save" data-id="${ev?ev.id:''}">${ev?'Lưu thay đổi':'Thêm sự kiện'}</button></div>
   </article>
   <aside class="card admin-card ev-preview" style="padding:18px">
     <div class="card-head"><div><div class="kicker">XEM TRƯỚC</div><h3>Đồng bộ phía nhân viên & email</h3></div></div>
     <div class="ev-prev-kudos" id="ev-prev" style="${pUrl?`background-image:url('${escapeHtml(pUrl)}')`:''}">
       <div class="ev-prev-kudos-card"><b>Lời ghi nhận dành cho bạn</b><p>Cảm ơn bạn đã chủ động hỗ trợ team hoàn thành công việc đúng hạn. Đây là nội dung mẫu để xem background.</p><span>Gắn kết & Cùng phát triển</span></div>
     </div>
     <div class="ev-hint">Preview KUDOS giống màn người nhận: nội dung nằm trên background sự kiện đã chọn.</div>
   </aside>
  </div>
  <article class="card admin-card" style="padding:16px 18px;margin-top:14px"><div class="card-head"><div><div class="kicker">DANH SÁCH</div><h3>Sự kiện (${list.length})</h3></div></div>
   <div class="ev-list">${rows}</div>
  </article>
 </section>`;
}
function bindAdminEvents(){
 const prev=document.querySelector('#ev-prev');const urlIn=document.querySelector('#ev-url');
 if(urlIn&&prev)urlIn.addEventListener('input',()=>{const u=clientNormUrl(urlIn.value);prev.style.backgroundImage=u?`url('${u}')`:'';});
 const cancel=document.querySelector('#ev-cancel');if(cancel)cancel.addEventListener('click',()=>{editingEventId=null;render();});
 const save=document.querySelector('#ev-save');
 if(save)save.addEventListener('click',async()=>{
   const payload={id:save.dataset.id||'',name:document.querySelector('#ev-name').value.trim(),url:document.querySelector('#ev-url').value.trim(),from:document.querySelector('#ev-from').value,to:document.querySelector('#ev-to').value,note:document.querySelector('#ev-note').value.trim(),active:document.querySelector('#ev-active').checked};
   if(!payload.name){toast('Nhập tên sự kiện.');return;}
   if(!clientNormUrl(payload.url)){toast('URL ảnh chưa hợp lệ (cần HTTPS hoặc Drive link).');return;}
   save.disabled=true;
   try{const res=await rpc('luuEvent',payload);EVENTS_LIST=res.events||[];recomputeActiveEvents();editingEventId=null;toast(res.notice||'Đã lưu.');render();}catch(e){save.disabled=false;toast(e.message);}
 });
 document.querySelectorAll('[data-ev-edit]').forEach(b=>b.addEventListener('click',()=>{editingEventId=b.dataset.evEdit;render();window.scrollTo(0,0);}));
 document.querySelectorAll('[data-ev-del]').forEach(b=>b.addEventListener('click',async()=>{
   if(!window.confirm('Xoá sự kiện này? Kudos đã gửi vẫn giữ nền của chúng.'))return;
   b.disabled=true;try{const res=await rpc('xoaEvent',b.dataset.evDel);EVENTS_LIST=res.events||[];recomputeActiveEvents();if(editingEventId===b.dataset.evDel)editingEventId=null;toast(res.notice||'Đã xoá.');render();}catch(e){b.disabled=false;toast(e.message);}
 }));
 document.querySelectorAll('[data-ev-toggle]').forEach(b=>b.addEventListener('click',async()=>{
   b.disabled=true;try{const res=await rpc('datEventKichHoat',b.dataset.evToggle,b.dataset.on==='1');EVENTS_LIST=res.events||[];recomputeActiveEvents();toast(res.notice||'Đã cập nhật.');render();}catch(e){b.disabled=false;toast(e.message);}
 }));
}
function adminQuality(){
 const gate=adminGate();if(gate)return gate;
 const held=ADMIN.records.filter(k=>modStatusOf(k)==='HELD');
 const hidden=ADMIN.records.filter(k=>modStatusOf(k)==='HIDDEN');
 const approved=ADMIN.records.filter(k=>modStatusOf(k)==='APPROVED');
 const card=(k)=>{
  const reasons=modReasonsTextClient((k.moderation&&k.moderation.reasons)||[]);
  return `<div class="mod-item" data-mod-row="${escapeHtml(k.id)}">
    <div class="mod-item-head">
      <div class="mini-avatar">${escapeHtml(initials(k.senderName))}</div>
      <div class="mod-item-who"><b>${escapeHtml(k.senderName||'Đồng nghiệp')}</b><span>${escapeHtml(k.senderDept||'')} → ${escapeHtml(k.recipientName||'')}</span></div>
      <span class="mod-flag">Chờ Admin duyệt</span>
    </div>
    <div class="mod-reasons">${reasons.map(r=>`<span class="mod-reason-chip">⚑ ${escapeHtml(r)}</span>`).join('')||'<span class="mod-reason-chip">Chờ Admin duyệt</span>'}</div><div class="mod-scope-control"><span>Phạm vi:</span><button class="btn secondary ${k.visibility==='private'?'active':''}" data-mod-scope="private" data-kid="${k.id}">Riêng tư</button><button class="btn secondary ${k.visibility==='public'?'active':''}" data-mod-scope="public" data-kid="${k.id}">CỘNG ĐỒNG KUDOS</button></div>
    <div class="mod-msg">${escapeHtml(k.message||'').replace(/\r?\n/g,'<br>')}</div>
    <div class="mod-actions">
      <button class="btn secondary" data-mod-detail="${k.id}">Xem chi tiết KUDOS</button><button class="btn secondary" data-mod-preview="${k.id}">Xem email</button>
      <button class="btn secondary" data-mod-edit="${k.id}">Sửa</button>
      <button class="btn danger" data-mod-hide="${k.id}">Ẩn</button>
      <button class="btn primary" data-mod-approve="${k.id}">Duyệt & gửi</button>
    </div>
  </div>`;
 };
 const heldHtml=held.length?held.map(card).join(''):`<div class="empty"><div class="icon">✅</div><h3>Không có KUDOS nào chờ duyệt</h3><p>Mọi KUDOS mới đều chờ Admin duyệt. Khi Admin duyệt, email mới được gửi và CỘNG ĐỒNG KUDOS mới được publish.</p></div>`;
 return `<section class="page active">
  <style>
   .mod-stat-row{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:14px}
   .mod-stat{background:#fff;border:1px solid var(--line);border-radius:16px;padding:14px;box-shadow:var(--shadow)}
   .mod-stat span{font-size:13px;color:var(--muted)}.mod-stat strong{display:block;font-size:22px;color:var(--navy);margin-top:6px}
   .mod-list{display:grid;gap:12px;margin-top:12px}
   .mod-item{border:1px solid #F0D8C6;background:#FFFCF9;border-radius:16px;padding:14px}
   .mod-item-head{display:flex;align-items:center;gap:10px}
   .mod-item-who{flex:1;min-width:0}.mod-item-who b{font-size:14px;color:var(--navy)}.mod-item-who span{display:block;font-size:12px;color:var(--muted);margin-top:2px}
   .mod-flag{background:var(--amber-soft,#FFF4E3);color:#A5751E;border-radius:999px;padding:5px 10px;font-size:12px;font-weight:700;white-space:nowrap}
   .mod-reasons{display:flex;flex-wrap:wrap;gap:6px;margin:10px 0}
   .mod-reason-chip{background:#FDECEC;color:#C0392B;border-radius:999px;padding:5px 10px;font-size:12px;font-weight:600}
   .mod-msg{background:#fff;border:1px solid var(--line);border-radius:12px;padding:12px 14px;font-size:14px;line-height:1.7;color:var(--text);white-space:pre-wrap;overflow-wrap:anywhere}
   .mod-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px;justify-content:flex-end}
   .mod-actions .btn{padding:9px 14px;font-size:13px}
   .mod-scope-control{display:flex;align-items:center;gap:7px;flex-wrap:wrap;margin:10px 0}.mod-scope-control>span{font-size:12px;font-weight:800;color:var(--muted)}.mod-scope-control .btn{padding:6px 10px;font-size:12px}.mod-scope-control .btn.active{background:#EAF2FB;border-color:#9BC4EA;color:#0E4174}
   @media(max-width:640px){.mod-stat-row{grid-template-columns:1fr 1fr}.mod-actions{justify-content:stretch}.mod-actions .btn{flex:1}}
  
</style>
  ${bannerHero('ai_review')}
  <div class="page-head"><div><div class="kicker">ADMIN CONTROL</div><h1>Admin duyệt toàn bộ KUDOS</h1><p class="page-sub">Mọi KUDOS đều được giữ tại đây trước khi gửi email. Admin có thể xem chi tiết, chỉnh nội dung, chọn Riêng tư hoặc CỘNG ĐỒNG KUDOS, rồi mới Duyệt & gửi.</p></div></div>
  <div class="mod-stat-row">
   <div class="mod-stat"><span>Chờ duyệt</span><strong>${held.length}</strong></div>
   <div class="mod-stat"><span>Đã duyệt</span><strong>${approved.length}</strong></div>
   <div class="mod-stat"><span>Đã ẩn</span><strong>${hidden.length}</strong></div>
  </div>
  <article class="card admin-card" style="padding:16px 18px"><div class="card-head"><div><div class="kicker">HÀNG CHỜ</div><h3>Chờ duyệt (${held.length})</h3></div></div>
   <div class="mod-list">${heldHtml}</div>
  </article>
  <article class="card admin-card" style="padding:16px 18px;margin-top:14px"><div class="card-head"><div><div class="kicker">CẤU HÌNH</div><h3>Danh sách từ cấm (${ADMIN.blacklist.length})</h3><div class="sub">Mỗi từ/cụm một dòng, hoặc ngăn bằng dấu phẩy. KUDOS chứa từ này sẽ được giữ lại để duyệt.</div></div></div>
   <textarea id="mod-blacklist" class="textarea" style="min-height:120px;margin-top:10px">${escapeHtml(ADMIN.blacklist.join('\n'))}</textarea>
   <div class="form-actions" style="margin-top:10px;display:flex;justify-content:flex-end"><button class="btn primary" id="mod-blacklist-save">Lưu danh sách</button></div>
  </article>
 </section>`;
}
function openModDetail(id){
 const k=adminRecordById(id);if(!k){toast('Không tìm thấy KUDOS.');return;}
 const reasons=modReasonsTextClient((k.moderation&&k.moderation.reasons)||[]);
 document.querySelector('#modal-root').innerHTML=`<div class="modal-backdrop"><div class="modal mod-detail-modal"><button class="modal-close mod-detail-close" aria-label="Đóng">×</button><div class="kicker">CHI TIẾT KUDOS CẦN DUYỆT</div><h2>${escapeHtml(k.senderName||'')} → ${escapeHtml(k.recipientName||'')}</h2><p class="page-sub">${escapeHtml(k.senderDept||'')}${k.senderSection?` · ${escapeHtml(k.senderSection)}`:''} → ${escapeHtml(k.recipientDept||'')}${k.recipientSection?` · ${escapeHtml(k.recipientSection)}`:''}</p>${buildKudosCard(k)}<div class="mod-reasons" style="margin-top:16px">${reasons.map(r=>`<span class="mod-reason-chip">⚑ ${escapeHtml(r)}</span>`).join('')||'<span class="mod-reason-chip">Cần xem lại</span>'}</div><button class="btn primary wide mod-detail-close">Đóng</button></div></div>`;
 document.querySelectorAll('.mod-detail-close').forEach(b=>b.addEventListener('click',()=>document.querySelector('#modal-root').innerHTML=''));
}
async function openModPreview(id){
 const k=adminRecordById(id);if(!k){toast('Không tìm thấy KUDOS.');return;}
 let mail;
 try{mail=await rpc('xemTruocEmail',id);}catch(e){toast(e.message);return;}
 document.querySelector('#modal-root').innerHTML=`<div class="modal-backdrop"><div class="modal notif-email-modal"><button class="modal-close notif-close" aria-label="Đóng">×</button><div class="kicker">EMAIL NGƯỜI NHẬN SẼ THẤY · ${escapeHtml(mail.mode==='IMAGE_ENHANCED'?'MODE B (CÓ ẢNH)':'MODE A (KHÔNG ẢNH)')}</div><div class="notif-email-envelope"><span><b>Đến:</b> ${escapeHtml(mail.to)}</span><span><b>Tiêu đề:</b> ${escapeHtml(mail.subject)}</span><span class="notif-email-sim">● Bản xem trước được dựng bởi đúng hàm gửi email thật — nội dung KUDOS không có trong email.</span></div><iframe class="notif-email-frame" title="Xem trước email" sandbox="allow-same-origin" style="height:560px"></iframe><button class="btn primary wide notif-close">Đóng</button></div></div>`;
 const fr=document.querySelector('.notif-email-frame');if(fr)fr.srcdoc=mail.html;
 document.querySelectorAll('.notif-close').forEach(b=>b.addEventListener('click',()=>{document.querySelector('#modal-root').innerHTML='';}));
}
function openModEdit(id){
 const k=adminRecordById(id);if(!k)return;
 document.querySelector('#modal-root').innerHTML=`<div class="modal-backdrop"><div class="modal"><button class="modal-close" aria-label="Đóng">×</button><div class="kicker">SỬA NỘI DUNG</div><h2>Sửa lời ghi nhận</h2><p>Chỉnh nội dung rồi lưu; hệ thống sẽ kiểm duyệt lại tự động.</p><textarea id="mod-edit-msg" class="textarea" style="min-height:160px">${escapeHtml(k.message||'')}</textarea><div class="form-actions" style="margin-top:10px;display:flex;gap:8px;justify-content:flex-end"><button class="btn secondary" data-mod-edit-cancel>Huỷ</button><button class="btn primary" data-mod-edit-save="${escapeHtml(k.id)}">Lưu &amp; kiểm duyệt lại</button></div></div></div>`;
 const close=()=>{document.querySelector('#modal-root').innerHTML='';};
 document.querySelector('.modal-close').addEventListener('click',close);
 document.querySelector('[data-mod-edit-cancel]').addEventListener('click',close);
 document.querySelector('[data-mod-edit-save]').addEventListener('click',async(e)=>{
  const msg=document.querySelector('#mod-edit-msg').value;e.target.disabled=true;
  try{const res=await rpc('suaKudosDuyet',id,msg);takeAdminRecord(res.record);toast(res.notice||'Đã lưu.');close();render();}catch(err){e.target.disabled=false;toast(err.message);}
 });
}
function bindAdminQuality(){
 document.querySelectorAll('[data-mod-detail]').forEach(b=>b.addEventListener('click',()=>openModDetail(b.dataset.modDetail)));
 document.querySelectorAll('[data-mod-preview]').forEach(b=>b.addEventListener('click',()=>openModPreview(b.dataset.modPreview)));
 document.querySelectorAll('[data-mod-edit]').forEach(b=>b.addEventListener('click',()=>openModEdit(b.dataset.modEdit)));
 document.querySelectorAll('[data-mod-scope]').forEach(b=>b.addEventListener('click',async()=>{
  b.disabled=true;try{const res=await rpc('datPhamViKudos',b.dataset.kid,b.dataset.modScope);takeAdminRecord(res.record);toast(res.notice||'Đã cập nhật phạm vi.');render();}catch(e){b.disabled=false;toast(e.message);}
 }));
 document.querySelectorAll('[data-mod-approve]').forEach(b=>b.addEventListener('click',async()=>{
  if(!window.confirm('Duyệt KUDOS này? Nếu email đang bật, hệ thống sẽ gửi thông báo cho người nhận.'))return;
  b.disabled=true;try{const res=await rpc('duyetKudos',b.dataset.modApprove);takeAdminRecord(res.record);toast(res.notice||'Đã duyệt.');render();loadAdminData(true);}catch(e){b.disabled=false;toast(e.message);}
 }));
 document.querySelectorAll('[data-mod-hide]').forEach(b=>b.addEventListener('click',async()=>{
  const reason=window.prompt('Lý do ẩn KUDOS này (không bắt buộc):','');
  if(reason===null)return;
  b.disabled=true;try{const res=await rpc('anKudos',b.dataset.modHide,reason);takeAdminRecord(res.record);toast(res.notice||'Đã ẩn.');render();}catch(e){b.disabled=false;toast(e.message);}
 }));
 const save=document.querySelector('#mod-blacklist-save');
 if(save)save.addEventListener('click',async()=>{
  const raw=document.querySelector('#mod-blacklist').value;
  const list=raw.split(/[\n,]/).map(s=>s.trim()).filter(Boolean);
  save.disabled=true;try{const res=await rpc('datTuCam',list);ADMIN.blacklist=res.blacklist||list;toast(res.notice||'Đã lưu danh sách.');render();}catch(e){save.disabled=false;toast(e.message);}
 });
}


function adminRecognition(){
 const gate=adminGate();if(gate)return gate;
 const recognitionTypes=[
  ['acting','Acting / Đảm nhận vai trò tạm thời','Ghi nhận một giai đoạn chủ động nhận thêm vai trò hoặc trách nhiệm.'],
  ['promotion','Thăng cấp / Thăng chức','Ghi dấu một bước phát triển trong hành trình nghề nghiệp.'],
  ['trainer','Trainer / Buddy','Ghi nhận đóng góp trong việc đồng hành và phát triển người khác.'],
  ['project','Milestone dự án','Ghi nhận một dấu mốc hoặc đóng góp nổi bật trong dự án.'],
  ['campaign','Hoạt động / Campaign nội bộ','Ghi nhận đóng góp cho hoạt động chung của công ty.'],
  ['other','Ghi nhận khác','Dành cho trường hợp Admin cần tạo một AhaKudos phù hợp khác.']
 ];
 return `<section class="page active">
   <div class="page-head">
     <div>
       <div class="kicker">AHAKUDOS MỞ RỘNG</div>
       <h1>Gửi AhaKudos từ Admin</h1>
       <p class="page-sub">Ghi nhận thêm vai trò, cột mốc phát triển và những đóng góp trong hoạt động nội bộ của Ahamovers.</p>
     </div>
   </div>
   <div class="admin-recognition-layout">
     <article class="card admin-recognition-form">
       <div class="admin-section-title"><span>1</span><div><b>Chọn nhân sự</b><p>Tìm bằng email Ahamove để đảm bảo gửi đúng người.</p></div></div>
       <div class="field recipient-search-field">
         <label class="recipient-mode-toggle"><input id="admin-no-company-email" type="checkbox"><span>Người nhận không có mail công ty</span></label>
         <div id="admin-company-mode">
           <div class="email-search-wrap">
             <input id="admin-recipient-email" class="input" type="email" autocomplete="off" placeholder="Nhập email Ahamove của nhân sự...">
             <span class="email-search-icon">⌕</span>
             <div id="admin-recipient-suggestions" class="recipient-suggestions hidden"></div>
           </div>
           <div id="admin-selected-recipient" class="selected-recipient hidden"></div>
         </div>
         <div id="admin-manual-mode" class="recipient-manual-mode hidden">
           <div class="recipient-manual-grid">
             <div><label for="admin-manual-name">Họ tên người nhận</label><input id="admin-manual-name" class="input" type="text" maxlength="120" placeholder="Nhập họ tên"></div>
             <div><label for="admin-manual-dept">Phòng ban / Bộ phận</label><input id="admin-manual-dept" class="input" type="text" maxlength="120" placeholder="Nhập phòng ban hoặc bộ phận"></div>
           </div>
           <label for="admin-manual-email">Email liên hệ</label><input id="admin-manual-email" class="input" type="email" placeholder="name@example.com">
           <span class="field-hint">Email ngoài @ahamove.com được phép nhập tự do. KUDOS này sẽ được giữ riêng tư.</span>
         </div>
       </div>
       <div class="admin-section-title"><span>2</span><div><b>Chọn nội dung ghi nhận</b><p>Chọn loại phù hợp với cột mốc hoặc đóng góp thực tế.</p></div></div>
       <div class="recognition-type-grid">
         ${recognitionTypes.map((t,i)=>`<button type="button" class="recognition-type ${i===0?'selected':''}" data-recognition-type="${t[0]}"><strong>${t[1]}</strong><span>${t[2]}</span></button>`).join('')}
       </div>
       <div class="admin-section-title"><span>3</span><div><b>Hoàn thiện lời ghi nhận</b><p>Nội dung sẽ được gửi đến nhân sự qua email và lưu trong Hồ sơ KUDOS.</p></div></div>
       <div class="field"><label>Tiêu đề AhaKudos</label><input id="admin-recognition-title" class="input" value="Cảm ơn bạn vì một hành trình đáng ghi nhận"></div>
       <div class="field"><label>Nội dung</label><textarea id="admin-recognition-message" class="textarea" placeholder="Chia sẻ cột mốc, đóng góp hoặc điều Ahamove muốn ghi nhận ở nhân sự..."></textarea></div>
       <div class="field admin-visibility-field"><label>Ai có thể xem AhaKudos này?</label>
         <div class="visibility-options">
           <button type="button" class="visibility-option selected" data-admin-visibility="public"><span class="visibility-icon">◎</span><div><b>CỘNG ĐỒNG KUDOS</b><p>Hiển thị họ tên + phòng ban người gửi sau khi Admin duyệt; không có chế độ ẩn danh.</p></div><i>✓</i></button>
           <button type="button" class="visibility-option" data-admin-visibility="private"><span class="visibility-icon lock">●</span><div><b>Chỉ người nhận biết</b><p>Không xuất hiện trên feed công khai; vẫn lưu trong Hồ sơ KUDOS của nhân sự.</p></div><i>✓</i></button>
         </div>
       </div>
       <div class="field"><label>Chọn mẫu thiệp</label>
         <div class="template-gallery admin-template-gallery">
           ${cardTemplates.map((t,i)=>`<button type="button" class="template-option ${t.id==='wish'?'selected':''}" data-admin-template="${t.id}" aria-label="Chọn background ${i+1}" aria-pressed="${t.id==='wish'}"><span class="template-thumb tpl-${t.id}"><i>${t.sticker}</i><b>AhaKudos</b></span></button>`).join('')}
         </div>
       </div>
       <div class="admin-recognition-note"><span>ⓘ</span><p><b>AhaKudos từ Admin</b> là lớp ghi nhận chính thức của chương trình. Background được chọn sẽ đi cùng email người nhận và bản lưu trong Hồ sơ KUDOS.</p></div>
       <div class="form-actions"><button class="btn secondary" id="admin-recognition-preview">Xem trước</button><button class="btn primary" id="admin-recognition-send">Gửi AhaKudos</button></div>
     </article>
     <aside class="card admin-recognition-preview">
       <div class="card-head"><div><div class="kicker">PREVIEW</div><h3>AhaKudos gửi đến nhân sự</h3></div></div>
       <div class="recipient-preview" id="admin-recipient-preview"><div class="mini-avatar">@</div><div><b>Chưa chọn người nhận</b><span>Nhập email nhân sự để tìm kiếm</span></div></div>
       <div class="preview-message tpl-celebrate" id="admin-preview-card">
         <div class="card-sticker" id="admin-card-sticker">🎉</div>
         <div class="preview-logo plain">${kudosLogo()}</div>
         <div class="kicker">AHAKUDOS · GHI NHẬN TỪ AHAMOVE</div>
         <h3 id="admin-preview-title">Cảm ơn bạn vì một hành trình đáng ghi nhận</h3>
         <p id="admin-preview-text">Nội dung AhaKudos sẽ xuất hiện tại đây.</p>
         <div class="preview-visibility" id="admin-preview-visibility">◎ CỘNG ĐỒNG KUDOS</div>
       </div>
       <div class="admin-email-preview-note"><span>✉</span><div><b>Email thông báo</b><p>Sau khi Admin duyệt, người nhận nhận email thông báo (không chứa nội dung) và mở lời ghi nhận trong AhaKudos với mẫu thiệp này.</p></div></div>
     </aside>
   </div>
 </section>`;
}
// ---- Admin: Email thông báo (EMAIL_QUEUE state per KUDOS) ------------------
let emailFilter='ALL';
function emailPill(status){
 const map={PENDING:['status-pending','Chờ gửi'],SENDING:['status-queued','Đang gửi'],SENT:['status-public','Đã gửi'],FAILED:['status-private','Lỗi'],CANCELLED:['status-private','Không gửi'],AWAITING_APPROVAL:['status-queued','Chờ duyệt']};
 const m=map[status]||['status-queued',status||'—'];
 return `<span class="status-pill ${m[0]}"><i></i>${escapeHtml(m[1])}</span>`;
}
function adminNotify(){
 const gate=adminGate();if(gate)return gate;
 const st=ADMIN.settings||{};
 const all=ADMIN.records.map(k=>({k,status:k.email?k.email.status:(modStatusOf(k)==='APPROVED'?'PENDING':'AWAITING_APPROVAL')}));
 const counts={};all.forEach(x=>{counts[x.status]=(counts[x.status]||0)+1;});
 const list=all.filter(x=>emailFilter==='ALL'||x.status===emailFilter);
 const filters=[['ALL','Tất cả'],['FAILED','Lỗi'],['PENDING','Chờ gửi'],['SENT','Đã gửi'],['CANCELLED','Không gửi'],['AWAITING_APPROVAL','Chờ duyệt']];
 const rows=list.slice(0,300).map(({k,status})=>{
   const e=k.email||{};
   const unknown=status==='FAILED'&&String(e.lastError||'').indexOf('UNKNOWN_OUTCOME')===0;
   const canSend=modStatusOf(k)==='APPROVED'&&(status==='PENDING'||(status==='FAILED'&&!unknown));
   const canResend=modStatusOf(k)==='APPROVED'&&(status==='SENT'||status==='FAILED');
   return `<div class="notif-row">
     <div class="notif-main">
       <div class="notif-top"><b>${escapeHtml(k.senderName||'')} → ${escapeHtml(k.recipientName||'')}</b><time>${escapeHtml(k.sentAtLabel||'')}</time></div>
       <div class="notif-sub"><span>Đến: ${escapeHtml(k.recipientEmail||'')}</span><span>· Lần gửi: ${Number(e.attempts||0)}</span>${e.sentAt?`<span>· Gửi lúc ${escapeHtml(new Date(e.sentAt).toLocaleString('vi-VN'))}</span>`:''}</div>
       ${e.lastError?`<p>${escapeHtml(e.lastError)}</p>`:''}
     </div>
     <div class="notif-actions">${emailPill(status)}
       <button class="link-btn" data-mail-preview="${escapeHtml(k.id)}">Xem email</button>
       ${canSend?`<button class="btn secondary" data-mail-send="${escapeHtml(k.id)}">Gửi</button>`:''}
       ${canResend?`<button class="btn secondary" data-mail-resend="${escapeHtml(k.id)}">Gửi lại (RESEND)</button>`:''}
     </div>
   </div>`;
 }).join('');
 return `<section class="page active admin-notify-page">
   <div class="page-head"><div><div class="kicker">EMAIL THÔNG BÁO</div><h1>Email thông báo người nhận</h1><p class="page-sub">Email chỉ gửi sau khi Admin duyệt. Mỗi KUDOS có đúng một trạng thái email theo (KUDOS ID + email người nhận); đã gửi thì không gửi lại trừ khi Admin chọn RESEND.</p></div><button class="btn secondary" id="mail-refresh">Làm mới</button></div>
   <article class="card admin-card notif-settings">
     <div class="notif-set-row"><div><b>Gửi email</b><span>${st.mailEnabled?'Đang BẬT':'Đang TẮT'} · đổi bằng hàm batGuiEmail / tatGuiEmail trong Apps Script</span></div><span class="status-pill ${st.mailEnabled?'status-public':'status-private'}"><i></i>${st.mailEnabled?'BẬT':'TẮT'}</span></div>
     <div class="notif-set-row"><div><b>Chế độ email</b><span>${st.emailMode==='IMAGE_ENHANCED'?'MODE B — có ảnh trang trí (nội dung vẫn đọc được khi chặn ảnh)':'MODE A — chỉ HTML, không phụ thuộc hình ảnh'}</span></div><span class="status-pill status-queued"><i></i>${escapeHtml(st.emailMode||'HTML_ONLY')}</span></div>
     <div class="notif-set-row"><div><b>Hạn mức hôm nay</b><span>${Number(st.sentToday||0)} / ${Number(st.dailyLimit||0)} email${st.googleRemainingQuota!=null?' · Google còn '+Number(st.googleRemainingQuota):''}</span></div><span class="status-pill status-queued"><i></i>${escapeHtml(String(st.env||'').toUpperCase())}</span></div>
     ${st.redirectTo?`<div class="notif-hint"><span>ⓘ</span> Môi trường ${escapeHtml(st.env)}: mọi email được chuyển tới hộp thư test <b>${escapeHtml(st.redirectTo)}</b>.</div>`:''}
   </article>
   <div class="dash-presets" style="margin:14px 0">${filters.map(([id,label])=>`<button class="chip-btn ${emailFilter===id?'active':''}" data-mail-filter="${id}">${label} (${id==='ALL'?all.length:(counts[id]||0)})</button>`).join('')}</div>
   <article class="card admin-card notif-list">${rows||`<div class="empty"><div class="icon">✉</div><h3>Không có email trong mục này</h3></div>`}</article>
 </section>`;
}
function bindAdminEmail(){
 document.querySelectorAll('[data-mail-filter]').forEach(b=>b.addEventListener('click',()=>{emailFilter=b.dataset.mailFilter;render();}));
 const refresh=document.querySelector('#mail-refresh');if(refresh)refresh.addEventListener('click',()=>{loadAdminData(true);});
 document.querySelectorAll('[data-mail-preview]').forEach(b=>b.addEventListener('click',()=>openModPreview(b.dataset.mailPreview)));
 const send=async(b,mode)=>{
   if(mode==='RESEND'&&!window.confirm('Gửi lại email thông báo cho KUDOS này? Người nhận có thể nhận 2 email.'))return;
   b.disabled=true;
   try{const res=await rpc('guiEmailKudos',b.dataset.mailSend||b.dataset.mailResend,mode);takeAdminRecord(res.record);toast(res.notice||'Đã xử lý.');render();loadAdminData(true);}
   catch(e){b.disabled=false;toast(e.message);}
 };
 document.querySelectorAll('[data-mail-send]').forEach(b=>b.addEventListener('click',()=>send(b,'SEND')));
 document.querySelectorAll('[data-mail-resend]').forEach(b=>b.addEventListener('click',()=>send(b,'RESEND')));
}

// ---- Admin: Sinh nhật & Thâm niên (from Master Data only) --------------------
function adminOps(){
 const gate=adminGate();if(gate)return gate;
 const up=ADMIN.upcoming||{birthdays:[],anniversaries:[],windowDays:30};
 const fmt=d=>{const p=String(d||'').split('-');return p.length===3?p[2]+'/'+p[1]:'';};
 const when=n=>n===0?'Hôm nay':n===1?'Ngày mai':'Còn '+n+' ngày';
 const row=(r,type)=>`<div class="milestone-admin-row milestone-admin-row--live"><div class="mini-avatar ${type==='birthday'?'birthday-avatar':''}">${escapeHtml(initials(r.name))}</div><div class="milestone-admin-info"><b>${escapeHtml(r.name)}</b><span>${escapeHtml(r.dept||'')}</span><em>${type==='birthday'?'':escapeHtml(r.years+' năm · ')}${escapeHtml(when(r.inDays))} · ${escapeHtml(fmt(r.date))}</em></div><button class="link-btn" data-ops-send="${escapeHtml(r.email)}" data-ops-type="${type}">Gửi AhaKudos →</button></div>`;
 const empty=t=>`<div class="home-master-empty">${t}</div>`;
 const mi=(ADMIN.master&&ADMIN.master.issues)||{};
 const missingDob=(mi.missingOptional||[]).includes('dob');
 return `<section class="page active">
   <div class="page-head"><div><div class="kicker">SINH NHẬT & THÂM NIÊN</div><h1>Cột mốc sắp tới từ Master Data</h1><p class="page-sub">Danh sách lấy trực tiếp từ tab DATA (Date of Birth, Onboard Day) trong ${Number(up.windowDays||30)} ngày tới. Admin gửi AhaKudos cho từng người; gửi tự động theo lịch chưa được bật.</p></div></div>
   <div class="milestone-admin-summary">
     <article class="card milestone-summary-card"><div class="milestone-summary-icon">🎂</div><div><span>Sinh nhật sắp tới</span><strong>${up.birthdays.length}</strong><small>${missingDob?'DATA chưa có cột Date of Birth':'từ cột Date of Birth'}</small></div></article>
     <article class="card milestone-summary-card"><div class="milestone-summary-icon navy">✦</div><div><span>Kỷ niệm thâm niên</span><strong>${up.anniversaries.length}</strong><small>từ cột Onboard Day</small></div></article>
   </div>
   <div class="ops-grid milestone-ops-grid">
     <article class="card admin-card"><div class="card-head"><div><div class="kicker">SINH NHẬT</div><h3>Danh sách sắp tới</h3></div></div>
       <div class="milestone-admin-list">${up.birthdays.map(r=>row(r,'birthday')).join('')||empty(missingDob?'Tab DATA chưa có cột Date of Birth / DOB / Birthday.':'Không có sinh nhật nào trong khoảng này.')}</div></article>
     <article class="card admin-card"><div class="card-head"><div><div class="kicker">THÂM NIÊN</div><h3>Danh sách sắp tới</h3></div></div>
       <div class="milestone-admin-list">${up.anniversaries.map(r=>row(r,'anniversary')).join('')||empty('Không có kỷ niệm thâm niên nào trong khoảng này.')}</div></article>
   </div>
 </section>`;
}
function bindAdminOps(){
 document.querySelectorAll('[data-ops-send]').forEach(b=>b.addEventListener('click',()=>{state.adminPrefill={email:b.dataset.opsSend,template:b.dataset.opsType==='birthday'?'birthday':'wish',type:b.dataset.opsType};goToPage('admin-recognition');}));
}

// ---- KUDOS 16:9 auto-fit ---------------------------------------------------
function fitKudosCard(card){
 if(!card)return;
 const content=card.querySelector('.kd-card-content');
 const msg=card.querySelector('.kd-card-msg');
 if(!content||!msg)return;
 msg.style.fontSize='';msg.style.lineHeight='';content.style.padding='';
 let size=parseFloat(getComputedStyle(msg).fontSize)||20;
 let line=1.48;let guard=0;
 const overflowing=()=>content.scrollHeight>content.clientHeight+1;
 while(overflowing()&&size>8.5&&guard<40){
   size-=0.5;line=Math.max(1.34,line-0.006);
   msg.style.fontSize=size+'px';msg.style.lineHeight=String(line);guard++;
 }
 if(overflowing()){
   content.style.padding='3.3cqw 2.2cqw';guard=0;
   while(overflowing()&&size>7.5&&guard<20){size-=0.4;msg.style.fontSize=size+'px';guard++;}
 }
}
function fitAllKudosCards(scope){
 const root=scope||document;
 requestAnimationFrame(()=>root.querySelectorAll('.kd-card-fullbg').forEach(fitKudosCard));
}

// ---- Router ----------------------------------------------------------------
function render(){
 clearTimeout(liveFeedTimer);
 let content='';
 if(state.mode==='employee'){
  content=state.page==='public-feed'?publicFeedPage():state.page==='send-kudos'?sendKudos():state.page==='kudos-profile'?profile():state.page==='kudos-detail'?kudosDetail():employeeHome();
 } else {
  content=state.page==='admin-notify'?adminNotify():state.page==='admin-recognition'?adminRecognition():state.page==='admin-quality'?adminQuality():state.page==='admin-events'?adminEvents():state.page==='admin-dept'?adminDept():state.page==='admin-culture'?adminCulture():state.page==='admin-ops'?adminOps():adminHome();
 }
 document.querySelector('#app').innerHTML=shell(content);
 bind();
 fitAllKudosCards(document.querySelector('#app'));
}

function initials(name=''){
 return String(name).split(' ').filter(Boolean).slice(-2).map(x=>x[0]).join('').toUpperCase()||'AK';
}

// ---- Public feed reactions + periodic refresh --------------------------------
async function toggleReaction(id,reaction){
 try{const k=await rpc('doiReaction',id,reaction);takeRecord(k);render();}
 catch(e){toast(e.message);}
}
// Community feed refresh: every 60s while the tab is visible (keeps Apps Script load bounded).
function schedulePublicFeedDemo(){
 clearTimeout(liveFeedTimer);
 if(state.page!=='public-feed'||state.mode!=='employee')return;
 liveFeedTimer=setTimeout(async()=>{
  if(document.visibilityState!=='visible'){schedulePublicFeedDemo();return;}
  try{await refreshEmployeeData();if(state.page==='public-feed')render();}
  catch(e){console.warn('[AhaKudos] feed refresh',e);schedulePublicFeedDemo();}
 },60000);
}
function bindPublicFeed(){
 document.querySelectorAll('[data-reaction][data-public-id]').forEach(btn=>btn.addEventListener('click',(e)=>{e.stopPropagation();toggleReaction(btn.dataset.publicId,btn.dataset.reaction);}));
 schedulePublicFeedDemo();
}

// ---- Intro banner (giữ nguyên vibe tím–xanh) ------------------------------
function showEmployeeHomeIntroBanner(){
 const existing=document.querySelector('.employee-home-intro-overlay');
 if(existing)existing.remove();
 const previousOverflow=document.body.style.overflow;
 document.body.style.overflow='hidden';
 const overlay=document.createElement('div');
 overlay.className='employee-home-intro-overlay';
 overlay.setAttribute('role','dialog');overlay.setAttribute('aria-label','Giới thiệu AhaKudos');overlay.setAttribute('aria-modal','true');
 overlay.innerHTML=`
   <div class="employee-home-intro-banner centered-layout">
     <button class="home-intro-close" aria-label="Đóng">×</button>
     <div class="home-intro-header"><div class="home-intro-brandmark">${logo(true)}</div><div class="kicker">CHÀO MỪNG ĐẾN VỚI AHAKUDOS</div><p>AhaKudos là nơi bạn gửi lời ghi nhận đến đồng nghiệp, theo dõi những lời cảm ơn đang lan tỏa trong công ty và lưu lại hành trình ghi nhận của chính mình.</p></div>
     <div class="home-intro-card-grid">
       <div class="intro-showcase-card card-send"><div class="intro-showcase-icon" aria-hidden="true">💛</div><h3>Gửi KUDOS</h3><p>Viết lời ghi nhận cho một hành động cụ thể mà bạn trân trọng ở đồng nghiệp.</p><button class="intro-showcase-btn" data-home-intro-action="send">Gửi ngay</button></div>
       <div class="intro-showcase-card card-feed"><div class="intro-showcase-icon" aria-hidden="true">🚀</div><h3>CỘNG ĐỒNG KUDOS</h3><p>Khám phá những lời ghi nhận đã được Admin duyệt để hiển thị công khai.</p><button class="intro-showcase-btn" data-home-intro-action="feed">Khám phá</button></div>
       <div class="intro-showcase-card card-profile"><div class="intro-showcase-icon" aria-hidden="true">🏆</div><h3>Hồ sơ KUDOS</h3><p>Xem lại những KUDOS bạn đã gửi, đã nhận và giữ lại để đọc về sau.</p><button class="intro-showcase-btn" data-home-intro-action="profile">Xem thêm</button></div>
       <div class="intro-showcase-card card-milestone"><div class="intro-showcase-icon" aria-hidden="true">🎁</div><h3>Lời chúc đặc biệt</h3><p>Gửi lời chúc cho sinh nhật và những dấu mốc đặc biệt của đồng nghiệp.</p><button class="intro-showcase-btn" data-home-intro-action="explore">Đã rõ</button></div>
     </div>
     <div class="home-intro-bottom-note">Bạn có thể bắt đầu bằng một lời ghi nhận nhỏ, nhưng đó có thể là điều rất ý nghĩa với người nhận.</div>
   </div>`;
 document.body.appendChild(overlay);
 requestAnimationFrame(()=>overlay.classList.add('show'));
 let closed=false;
 const close=()=>{if(closed)return;closed=true;document.removeEventListener('keydown',onKeydown);overlay.classList.remove('show');document.body.style.overflow=previousOverflow;setTimeout(()=>overlay.remove(),220);};
 const onKeydown=e=>{if(e.key==='Escape'){e.preventDefault();close();}if(e.key==='Tab'){const buttons=[...overlay.querySelectorAll('button')];const first=buttons[0],last=buttons[buttons.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}};
 document.addEventListener('keydown',onKeydown);
 requestAnimationFrame(()=>overlay.querySelector('.home-intro-close').focus({preventScroll:true}));
 overlay.addEventListener('click',e=>{if(e.target===overlay)close();});
 overlay.querySelector('.home-intro-close').addEventListener('click',close);
 overlay.querySelectorAll('[data-home-intro-action]').forEach(btn=>btn.addEventListener('click',()=>{const action=btn.dataset.homeIntroAction;const destinations={send:'send-kudos',feed:'public-feed',profile:'kudos-profile'};close();if(destinations[action]){state.page=destinations[action];setTimeout(()=>{render();window.scrollTo(0,0);},230);}}));
}

// ---- Handbook directory search + rules modal ------------------------------
function bindHandbookUI(){
 const input=document.querySelector('#hb-directory-search');
 const results=document.querySelector('#hb-directory-results');
 if(input&&results){
  const normalize=s=>s.normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/đ/gi,'d').toLowerCase();
  const hide=()=>{results.classList.add('hidden');input.setAttribute('aria-expanded','false');};
  input.addEventListener('input',()=>{
   const q=normalize(input.value.trim());
   if(!q){hide();return;}
   const pool=state.mode==='employee'?employees.filter(e=>e.email!==me().email):employees;
   const matches=pool.filter(e=>normalize(e.name+' '+e.email+' '+e.dept).includes(q)).slice(0,5);
   results.innerHTML=matches.length?matches.map(e=>`<button class="recipient-suggestion" data-directory-email="${escapeHtml(e.email)}"><div class="mini-avatar">${escapeHtml(initials(e.name))}</div><div><b>${escapeHtml(e.name)}</b><span>${escapeHtml(e.email)}</span><em>${escapeHtml(e.dept)}</em></div><i aria-hidden="true">↗</i></button>`).join(''):'<div class="recipient-no-result">Không có đồng nghiệp phù hợp trong Master Data.</div>';
   results.classList.remove('hidden');input.setAttribute('aria-expanded','true');
   results.querySelectorAll('[data-directory-email]').forEach(btn=>btn.addEventListener('click',()=>{
    const email=btn.dataset.directoryEmail;
    if(state.mode==='employee'){state.prefillRecipient=email;state.selectedRecipient=personByEmail(email);state.page='send-kudos';render();}
    else{state.page='admin-recognition';render();const target=document.querySelector('#admin-recipient-email');target.value=email;target.dispatchEvent(new Event('input',{bubbles:true}));document.querySelector(`[data-admin-email="${CSS.escape(email)}"]`)?.click();}
    window.scrollTo(0,0);
   }));
  });
  input.addEventListener('keydown',e=>{if(e.key==='Escape')hide();if(e.key==='ArrowDown'){e.preventDefault();results.querySelector('button')?.focus();}});
  document.querySelector('.hb-directory').addEventListener('focusout',()=>setTimeout(()=>{if(!document.querySelector('.hb-directory')?.contains(document.activeElement))hide();},150));
 }
 document.querySelectorAll('.field').forEach(field=>{const label=field.querySelector('label');const control=field.querySelector('input[id],textarea[id],select[id]');if(label&&control)label.setAttribute('for',control.id);});
 const sendPreview=document.querySelector('#preview');
 if(sendPreview)sendPreview.addEventListener('click',()=>{const review=document.querySelector('#kudos-preview');review?.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});document.querySelector('#kudos-review-title')?.focus({preventScroll:true});});
 const adminPreview=document.querySelector('#admin-recognition-preview');
 if(adminPreview)adminPreview.addEventListener('click',()=>{document.querySelector('.admin-recognition-preview')?.scrollIntoView({behavior:'smooth',block:'start'});});
 document.querySelectorAll('[data-modal="rules"]').forEach(btn=>btn.addEventListener('click',()=>{
  document.querySelector('#modal-root').innerHTML=`<div class="modal-backdrop"><div class="modal" role="dialog" aria-modal="true" aria-labelledby="hb-rules-title"><button class="modal-close" aria-label="Đóng">×</button><div class="kicker">GỬI KUDOS</div><h2 id="hb-rules-title">Quy tắc ghi nhận</h2><div class="rules"><div class="rule"><b>Người nhận</b><span>Tìm email Ahamove trong Master Data; nếu không có mail công ty, tick lựa chọn và nhập thông tin người nhận thủ công.</span></div><div class="rule"><b>Nội dung</b><span>Chia sẻ hành động cụ thể, tác động tạo ra và điều đáng ghi nhận.</span></div><div class="rule"><b>Giá trị văn hóa</b><span>Chọn từ 1 đến 3 Giá trị văn hóa phù hợp. Riêng KUDOS Sinh nhật không bắt buộc.</span></div><div class="rule"><b>Phạm vi</b><span>Mặc định được đề xuất lên CỘNG ĐỒNG KUDOS và chỉ hiển thị sau khi Admin duyệt.</span></div><div class="rule"><b>Hạn mức gửi</b><span>Mỗi nhân sự trong Master Data được gửi tối đa 5 KUDOS mỗi ngày.</span></div></div><button class="btn primary wide hb-rules-close">Đã hiểu</button></div></div>`;
  document.querySelectorAll('.modal-close,.hb-rules-close').forEach(b=>b.addEventListener('click',()=>document.querySelector('#modal-root').innerHTML=''));
 }));
}

// ---- Bind ------------------------------------------------------------------
function bind(){
 let introShown=true;try{introShown=!!sessionStorage.getItem('ahakudos-intro-shown');}catch(e){}
 if(state.mode==='employee'&&state.page==='employee-home'&&!introShown){try{sessionStorage.setItem('ahakudos-intro-shown','1');}catch(e){}showEmployeeHomeIntroBanner();}
 document.querySelectorAll('[data-page]').forEach(b=>b.addEventListener('click',()=>{goToPage(b.dataset.page);}));
 document.querySelectorAll('[data-switch]').forEach(b=>b.addEventListener('click',async()=>{
   state.mode=b.dataset.switch;state.page=state.mode==='employee'?'employee-home':'admin-home';
   if(state.mode==='employee'&&employeeStale){try{await refreshEmployeeData();}catch(e){toast(e.message);}}
   render();window.scrollTo(0,0);
 }));
 document.querySelectorAll('[data-admin-reload]').forEach(b=>b.addEventListener('click',()=>{ADMIN.error='';loadAdminData(true);render();}));
 document.querySelectorAll('[data-open-kudos]').forEach(el=>{
   const open=(e)=>{e.stopPropagation();openKudos(el.getAttribute('data-open-kudos'));};
   el.addEventListener('click',open);
   if(el.getAttribute('role')==='button')el.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();open(e);}});
 });
 if(state.page==='send-kudos') bindSend();
 if(state.page==='public-feed') bindPublicFeed();
 if(state.page==='kudos-profile') bindTabs();
 if(state.page==='admin-recognition'&&ADMIN.loaded) bindAdminRecognition();
 if(state.page==='admin-ops'&&ADMIN.loaded) bindAdminOps();
 if(state.page==='admin-notify'&&ADMIN.loaded) bindAdminEmail();
 if(state.page==='admin-quality'&&ADMIN.loaded) bindAdminQuality();
 if(state.page==='admin-events') bindAdminEvents();
 if((state.page==='admin-home'||state.page==='admin-dept'||state.page==='admin-culture')&&ADMIN.loaded) bindAdminFilters();
 document.querySelectorAll('[data-cta-route]').forEach(b=>b.addEventListener('click',()=>ctaGo(b.dataset.ctaRoute,b.dataset.ctaId)));
 document.querySelectorAll('[data-birthday]').forEach(b=>b.addEventListener('click',()=>{state.prefillRecipient=b.dataset.birthday;state.selectedRecipient=personByEmail(b.dataset.birthday)||null;state.selectedTemplate='birthday';state.page='send-kudos';render();toast('Đã chọn đồng nghiệp và mẫu Sinh nhật. Hãy viết lời chúc.');}));
 document.querySelectorAll('[data-avatar-edit]').forEach(b=>b.addEventListener('click',openAvatarEditor));
 bindHandbookUI();
}
function goToPage(page){state.page=page;if(page!=='kudos-detail')state.viewKudosId=null;render();window.scrollTo(0,0);}
function openKudos(id){state.viewKudosId=id;state.page='kudos-detail';try{history.replaceState(null,'','#/k/'+id);}catch(e){}render();window.scrollTo(0,0);}

function bindTabs(){
 document.querySelectorAll('.tab').forEach(t=>t.addEventListener('click',()=>{document.querySelectorAll('.tab').forEach(x=>x.classList.remove('active'));t.classList.add('active');document.querySelectorAll('.tab-panel').forEach(x=>x.classList.remove('active'));document.querySelector('#tab-'+t.dataset.tab).classList.add('active');}));
}

function bindAdminRecognition(){
 const emailInput=document.querySelector('#admin-recipient-email');const suggestions=document.querySelector('#admin-recipient-suggestions');const selectedBox=document.querySelector('#admin-selected-recipient');const message=document.querySelector('#admin-recognition-message');const title=document.querySelector('#admin-recognition-title');
 const noCompany=document.querySelector('#admin-no-company-email');const companyMode=document.querySelector('#admin-company-mode');const manualMode=document.querySelector('#admin-manual-mode');const manualName=document.querySelector('#admin-manual-name');const manualDept=document.querySelector('#admin-manual-dept');const manualEmail=document.querySelector('#admin-manual-email');
 let selectedEmployee=null;let selectedTemplate='wish';let selectedType='acting';let selectedVisibility='public';let manualRecipient=false;
 function renderEmployee(emp){selectedEmployee=emp;if(!emp){selectedBox.classList.add('hidden');selectedBox.innerHTML='';document.querySelector('#admin-recipient-preview').innerHTML='<div class="mini-avatar">@</div><div><b>Chưa chọn người nhận</b><span>Nhập email nhân sự để tìm kiếm</span></div>';return;}selectedBox.innerHTML=`<div class="mini-avatar">${initials(emp.name)}</div><div><b>${escapeHtml(emp.name)}</b><span>${escapeHtml(emp.email)}</span><em>${escapeHtml(emp.dept||'')}</em></div><span class="recipient-ok">✓ Đã chọn</span>`;selectedBox.classList.remove('hidden');document.querySelector('#admin-recipient-preview').innerHTML=`<div class="mini-avatar">${initials(emp.name)}</div><div><b>${escapeHtml(emp.name)}</b><span>${escapeHtml(emp.email)}</span><em>${escapeHtml(emp.dept||'')}</em></div>`;}
 function visibilityUi(){document.querySelectorAll('[data-admin-visibility]').forEach(x=>{x.disabled=false;x.classList.remove('disabled');x.classList.toggle('selected',x.dataset.adminVisibility===selectedVisibility);});}
 function syncManualPreview(){if(!manualRecipient)return;const emp={name:manualName.value.trim(),dept:manualDept.value.trim(),email:manualEmail.value.trim(),manual:true};if(emp.name||emp.email)renderEmployee(emp);else renderEmployee(null);updatePreview();}
 function applyMode(on){manualRecipient=!!on;companyMode.classList.toggle('hidden',manualRecipient);manualMode.classList.toggle('hidden',!manualRecipient);if(manualRecipient){emailInput.value='';suggestions.classList.add('hidden');renderEmployee(null);}visibilityUi();syncManualPreview();updatePreview();}
 function updatePreview(){document.querySelector('#admin-preview-title').textContent=title.value.trim()||'AhaKudos dành cho bạn';document.querySelector('#admin-preview-text').textContent=message.value.trim()||'Nội dung AhaKudos sẽ xuất hiện tại đây.';const card=document.querySelector('#admin-preview-card');cardTemplates.forEach(t=>card.classList.remove('tpl-'+t.id));card.classList.add('tpl-'+selectedTemplate);document.querySelector('#admin-card-sticker').textContent=templateMeta(selectedTemplate).sticker;const visibility=document.querySelector('#admin-preview-visibility');if(visibility){visibility.textContent=selectedVisibility==='public'?'◎ CỘNG ĐỒNG KUDOS':'● Chỉ người nhận biết';visibility.classList.toggle('private',selectedVisibility==='private');}}
 noCompany?.addEventListener('change',()=>applyMode(noCompany.checked));
 [manualName,manualDept,manualEmail].forEach(el=>el?.addEventListener('input',syncManualPreview));
 emailInput.addEventListener('input',()=>{if(manualRecipient)return;selectedEmployee=null;renderEmployee(null);const q=emailInput.value.trim().toLowerCase();if(!q){suggestions.classList.add('hidden');suggestions.innerHTML='';return}const matches=employees.filter(e=>e.email.toLowerCase().includes(q)).slice(0,5);suggestions.innerHTML=matches.length?matches.map(e=>`<button type="button" class="recipient-suggestion" data-admin-email="${escapeHtml(e.email)}"><div class="mini-avatar">${escapeHtml(initials(e.name))}</div><div><b>${escapeHtml(e.name)}</b><span>${escapeHtml(e.email)}</span><em>${escapeHtml(e.dept)}</em></div></button>`).join(''):'<div class="recipient-no-result">Không tìm thấy email phù hợp. Có thể tick “không có mail công ty”.</div>';suggestions.classList.remove('hidden');suggestions.querySelectorAll('[data-admin-email]').forEach(btn=>btn.addEventListener('click',()=>{const emp=employees.find(e=>e.email===btn.dataset.adminEmail);emailInput.value=emp.email;suggestions.classList.add('hidden');renderEmployee(emp);}));});
 emailInput.addEventListener('blur',()=>setTimeout(()=>suggestions.classList.add('hidden'),150));
 document.querySelectorAll('[data-recognition-type]').forEach(btn=>btn.addEventListener('click',()=>{selectedType=btn.dataset.recognitionType;document.querySelectorAll('[data-recognition-type]').forEach(x=>x.classList.toggle('selected',x===btn));const defaults={acting:'Cảm ơn bạn đã chủ động đảm nhận thêm một vai trò',promotion:'Chúc mừng một bước phát triển mới',trainer:'Cảm ơn bạn đã đồng hành và phát triển người khác',project:'Ghi nhận một dấu mốc đáng nhớ của dự án',campaign:'Cảm ơn đóng góp của bạn cho hoạt động chung',other:'Một điều đáng được Ahamove ghi nhận'};title.value=defaults[selectedType]||defaults.other;updatePreview();}));
 document.querySelectorAll('[data-admin-template]').forEach(btn=>btn.addEventListener('click',()=>{selectedTemplate=btn.dataset.adminTemplate;document.querySelectorAll('[data-admin-template]').forEach(x=>{x.classList.toggle('selected',x===btn);x.setAttribute('aria-pressed',String(x===btn));});updatePreview();}));
 document.querySelectorAll('[data-admin-visibility]').forEach(btn=>btn.addEventListener('click',()=>{selectedVisibility=btn.dataset.adminVisibility;visibilityUi();updatePreview();}));
 title.addEventListener('input',updatePreview);message.addEventListener('input',updatePreview);
 document.querySelector('#admin-recognition-preview').addEventListener('click',()=>{updatePreview();toast('Đã cập nhật bản xem trước.')});
 document.querySelector('#admin-recognition-send').addEventListener('click',async()=>{
  if(manualRecipient){const name=manualName.value.trim(),dept=manualDept.value.trim(),email=manualEmail.value.trim().toLowerCase();if(name.length<2||dept.length<2||!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)){toast('Điền đủ họ tên, phòng ban/đơn vị và email liên hệ hợp lệ.');return;}selectedEmployee={name,dept,email,manual:true};}
  if(!selectedEmployee||message.value.trim().length<20){toast('Chọn người nhận và viết lời ghi nhận trước.');return;}
  const btn=document.querySelector('#admin-recognition-send');btn.disabled=true;
  const payload={type:'admin',recipientEmail:selectedEmployee.email,recipientManual:!!selectedEmployee.manual,recipientName:selectedEmployee.name,recipientDept:selectedEmployee.dept,message:message.value.trim(),values:[],templateId:selectedTemplate,visibility:selectedVisibility};
  const fp=JSON.stringify(payload);if(!window.__ahakudosAdminPending||window.__ahakudosAdminPending.fp!==fp)window.__ahakudosAdminPending={fp,id:uid()};payload.requestId=window.__ahakudosAdminPending.id;
  try{const result=await rpc('taoKudos',payload);window.__ahakudosAdminPending=null;loadAdminData(true);showAdminRecognitionSuccess(selectedEmployee,title.value.trim(),payload.visibility);toast(result.notice);}
  catch(e){window.alert(e.message);}finally{btn.disabled=false;}
 });
 applyMode(false);updatePreview();
 if(state.adminPrefill){
  const pre=state.adminPrefill;state.adminPrefill=null;
  const emp=employees.find(e=>e.email===pre.email);
  if(emp){emailInput.value=emp.email;renderEmployee(emp);}
  const tplBtn=document.querySelector(`[data-admin-template="${pre.template}"]`);if(tplBtn)tplBtn.click();
  if(pre.type==='birthday'){title.value='Chúc mừng sinh nhật bạn 🎂';}else if(pre.type==='anniversary'){title.value='Cảm ơn bạn vì một hành trình đáng nhớ cùng Ahamove';}
  updatePreview();
 }
}
function showAdminRecognitionSuccess(employee,title,visibility='public'){
 document.querySelector('#modal-root').innerHTML=`<div class="modal-backdrop"><div class="modal admin-recognition-success"><div class="success-sticker"><span>✨</span><i>✦</i><i>★</i><i>●</i></div><div class="kicker">AHAKUDOS ĐÃ ĐƯỢC LƯU</div><h2>${escapeHtml(title||'Lời ghi nhận đã được lưu')}</h2><p>AhaKudos đã được lưu và sẽ xuất hiện trong Hồ sơ KUDOS của <b>${escapeHtml(employee.name)}</b>.</p><div class="sent-visibility-detail ${visibility==='public'?'public':'private'}">${visibility==='public'?'◎ CỘNG ĐỒNG KUDOS · Chờ Admin duyệt':'● Chỉ người nhận biết · Không hiển thị trên CỘNG ĐỒNG KUDOS'}</div><div class="email-delivery-note"><span>✉</span><div><b>Chờ Admin duyệt</b><p>AhaKudos được đưa vào hàng chờ duyệt. Sau khi duyệt, email thông báo sẽ gửi tới <strong>${escapeHtml(employee.email)}</strong>.</p></div></div><button class="btn primary wide admin-recognition-done">Hoàn tất</button></div></div>`;
 document.querySelector('.admin-recognition-done').addEventListener('click',()=>{document.querySelector('#modal-root').innerHTML='';state.page='admin-home';render()});
}

// ---- Compose binding + coach + single-source preview ----------------------
function qualityCoach(text,ctx){
 // Rule-based WRITING COACH — surfaces ONE most-useful nudge.
 // Never scores, never blocks, never claims to verify sincerity. Swappable for a
 // real model later: keep signature (text, ctx) -> {nudge, note}.
 const low=(text||'').toLowerCase();
 const name=ctx&&ctx.recipientFirst?ctx.recipientFirst:'';
 const len=(text||'').trim().length;
 const hasAction=/(đã|chủ động|hỗ trợ|chia sẻ|xử lý|chuẩn bị|phối hợp|hoàn thành|hướng dẫn|giải thích|tổng hợp|kết nối)/i.test(low);
 const hasImpact=['nhờ','giúp','kịp','tránh','hoàn thành','hiệu quả','cải thiện','tăng','giảm','đúng hạn','tốt hơn','nhanh hơn','rõ hơn'].some(w=>low.includes(w));
 const hasHeart=['cảm ơn','trân trọng','biết ơn','tận tâm','quý','ấn tượng'].some(w=>low.includes(w));
 let nudge;
 if(len===0){nudge=`Bắt đầu bằng một hành động cụ thể bạn thấy${name?` ở ${name}`:''} — điều gì khiến bạn muốn cảm ơn?`;}
 else if(len<25||!hasAction){nudge=`Hãy kể một <b>hành động cụ thể</b>${name?` mà ${name} đã làm`:''} thay vì chỉ nói cảm ơn chung chung.`;}
 else if(!hasImpact){nudge=`Điều đó đã <b>giúp gì</b> cho bạn, đội nhóm hoặc công việc? Một chi tiết về tác động sẽ khiến lời ghi nhận đáng nhớ hơn.`;}
 else if(!hasHeart){nudge=`Bạn có thể thêm một câu về <b>điều bạn thật sự trân trọng</b> ở họ.`;}
 else{nudge=`Lời ghi nhận của bạn đã khá cụ thể và ấm áp. Khi thấy ổn, bạn có thể gửi.`;}
 return {nudge};
}
function updatePreview(){
 const card=document.querySelector('#kudos-preview-card');
 if(!card)return;
 const rec=composeRecord();
 const recipient=document.querySelector('#kudos-preview-recipient');
 if(recipient)recipient.textContent=rec.recipientName?`${rec.recipientName} · ${rec.recipientEmail}`:(rec.recipientEmail||'Chưa chọn người nhận');
 // Preview dùng đúng renderer của màn KUDOS detail để người gửi thấy chính xác nội dung + background người nhận sẽ mở ra.
 card.innerHTML=buildKudosCard(rec);
 fitAllKudosCards(card);
}
function renderSelectedRecipient(employee){
 const box=document.querySelector('#selected-recipient');if(!box)return;
 if(!employee){box.classList.add('hidden');box.innerHTML='';return;}
 box.innerHTML=`<div class="mini-avatar">${initials(employee.name)}</div><div class="sr-main"><b>${escapeHtml(employee.name)}</b><span>${escapeHtml(employee.email)} · ${escapeHtml(employee.dept)}</span></div><span class="recipient-ok">✓ Đã chọn</span><button type="button" class="sr-remove" id="recipient-remove" title="Đổi người nhận" aria-label="Bỏ chọn người nhận">×</button>`;
 box.classList.remove('hidden');
 const rm=document.querySelector('#recipient-remove');
 if(rm)rm.addEventListener('click',()=>{
   state.selectedRecipient=null;state.prefillRecipient='';
   const inp=document.querySelector('#recipient-email');if(inp){inp.value='';inp.focus();}
   renderSelectedRecipient(null);updatePreview();
 });
}
function runCoach(){
 const msg=document.querySelector('#message');if(!msg)return;
 const r=state.selectedRecipient;
 const out=qualityCoach(msg.value,{recipientFirst:r?r.name.split(' ').slice(-1)[0]:''});
 const nudge=document.querySelector('#coach-nudge');if(nudge)nudge.innerHTML=out.nudge;
 // gentle culture suggestions (highlight only — never auto-select)
 const low=msg.value.toLowerCase();const sug=[];
 if(['hỗ trợ','team','đồng hành','phối hợp','cùng','kết nối'].some(w=>low.includes(w)))sug.push('grow');
 if(['chia sẻ','hướng dẫn','trainer','workshop','kiến thức','giải thích','học'].some(w=>low.includes(w)))sug.push('share');
 if(['tôn trọng','công bằng','lắng nghe','minh bạch'].some(w=>low.includes(w)))sug.push('fair');
 document.querySelectorAll('.culture-chip').forEach(c=>c.classList.remove('suggested'));
 sug.slice(0,3).forEach(v=>document.querySelector(`[data-value="${v}"]`)?.classList.add('suggested'));
 const hint=document.querySelector('#ai-values');
 if(hint)hint.textContent=sug.length&&msg.value.trim()?'Gợi ý theo nội dung: '+sug.map(v=>CULTURE[v]).join(' · ')+' · Bạn luôn tự quyết định.':'Gợi ý sẽ được làm nổi nhẹ theo nội dung — bạn luôn là người tự chọn.';
}
function syncCultureRequirement(){
 const field=document.querySelector('#culture-field');const birthday=state.selectedTemplate==='birthday';
 if(birthday){state.values.clear();document.querySelectorAll('.culture-chip').forEach(c=>{c.classList.remove('selected','suggested');c.setAttribute('aria-pressed','false');});}
 if(field)field.classList.toggle('hidden',birthday);
 const hint=document.querySelector('#ai-values');if(hint&&birthday)hint.textContent='Sinh nhật không yêu cầu chọn Giá trị văn hóa.';
}
function bindSend(){
 const msg=document.querySelector('#message');
 const emailInput=document.querySelector('#recipient-email');
 const suggestions=document.querySelector('#recipient-suggestions');
 const noCompany=document.querySelector('#recipient-no-company-email');
 const companyMode=document.querySelector('#recipient-company-mode');
 const manualMode=document.querySelector('#recipient-manual-mode');
 const manualInputs=['#recipient-manual-name','#recipient-manual-dept','#recipient-manual-email'].map(x=>document.querySelector(x));
 let coachTimer=null;
 function setVisibilityUi(){document.querySelectorAll('[data-visibility]').forEach(x=>{x.disabled=false;x.removeAttribute('aria-disabled');x.classList.remove('disabled');x.classList.toggle('selected',x.dataset.visibility===state.sendVisibility);x.setAttribute('aria-pressed',String(x.dataset.visibility===state.sendVisibility));});}
 function applyRecipientMode(on){
   state.manualRecipient=!!on;
   companyMode?.classList.toggle('hidden',state.manualRecipient);
   manualMode?.classList.toggle('hidden',!state.manualRecipient);
   if(state.manualRecipient){
     state.selectedRecipient=null;state.prefillRecipient='';
     if(emailInput)emailInput.value='';
     suggestions?.classList.add('hidden');renderSelectedRecipient(null);
     }
   setVisibilityUi();updatePreview();runCoach();
 }
 function syncPrefill(){if(state.manualRecipient||!emailInput)return;const exact=employees.find(e=>e.email.toLowerCase()===emailInput.value.trim().toLowerCase()&&e.email!==me().email);if(exact){state.selectedRecipient=exact;renderSelectedRecipient(exact);}}
 syncPrefill();applyRecipientMode(!!noCompany?.checked);
 noCompany?.addEventListener('change',()=>applyRecipientMode(noCompany.checked));
 manualInputs.forEach(el=>el?.addEventListener('input',()=>{updatePreview();runCoach();}));
 emailInput?.addEventListener('input',()=>{
   if(state.manualRecipient)return;
   state.selectedRecipient=null;renderSelectedRecipient(null);
   const q=emailInput.value.trim().toLowerCase();
   if(!q){suggestions.classList.add('hidden');suggestions.innerHTML='';updatePreview();return;}
   const matches=employees.filter(e=>e.email.toLowerCase().includes(q)&&e.email!==me().email).slice(0,5);
   suggestions.innerHTML=matches.length?matches.map(e=>`<button type="button" class="recipient-suggestion" data-email="${escapeHtml(e.email)}"><div class="mini-avatar">${escapeHtml(initials(e.name))}</div><div><b>${escapeHtml(e.name)}</b><span>${escapeHtml(e.email)}</span><em>${escapeHtml(e.dept)}</em></div></button>`).join(''):`<div class="recipient-no-result">Không tìm thấy email phù hợp. Nếu người nhận không có mail công ty, tick lựa chọn phía trên.</div>`;
   suggestions.classList.remove('hidden');
   suggestions.querySelectorAll('[data-email]').forEach(btn=>btn.addEventListener('click',()=>{const employee=employees.find(e=>e.email===btn.dataset.email);state.selectedRecipient=employee;emailInput.value=employee.email;suggestions.classList.add('hidden');renderSelectedRecipient(employee);updatePreview();runCoach();}));
   const exact=employees.find(e=>e.email.toLowerCase()===q&&e.email!==me().email);if(exact){state.selectedRecipient=exact;renderSelectedRecipient(exact);}
   updatePreview();runCoach();
 });
 emailInput?.addEventListener('blur',()=>setTimeout(()=>{if(document.activeElement!==emailInput&&!suggestions?.contains(document.activeElement))suggestions?.classList.add('hidden');},150));
 msg.addEventListener('input',()=>{document.querySelector('#count').textContent=msg.value.trim().length+' ký tự';updatePreview();clearTimeout(coachTimer);coachTimer=setTimeout(runCoach,160);});
 document.querySelectorAll('[data-template]').forEach(c=>c.addEventListener('click',()=>{state.selectedTemplate=c.dataset.template;document.querySelectorAll('.template-option').forEach(x=>{x.classList.toggle('selected',x===c);x.setAttribute('aria-pressed',String(x===c));});syncCultureRequirement();updatePreview();}));
 document.querySelectorAll('.culture-chip').forEach(c=>c.addEventListener('click',()=>{const v=c.dataset.value;if(state.values.has(v)){state.values.delete(v);c.classList.remove('selected')}else if(state.values.size<3){state.values.add(v);c.classList.add('selected')}c.setAttribute('aria-pressed',String(state.values.has(v)));updatePreview();}));
 document.querySelectorAll('[data-visibility]').forEach(btn=>btn.addEventListener('click',()=>{state.sendVisibility=btn.dataset.visibility;setVisibilityUi();updatePreview();}));
 const coachToggle=document.querySelector('#coach-toggle');
 coachToggle.addEventListener('click',()=>{const ex=coachToggle.getAttribute('aria-expanded')!=='true';coachToggle.setAttribute('aria-expanded',String(ex));document.querySelector('#coach-more').classList.toggle('hidden',!ex);coachToggle.textContent=ex?'Thu gọn':'Xem thêm';});
 const gallery=document.querySelector('.kudos-background-gallery');
 document.querySelectorAll('[data-bg-nav]').forEach(btn=>btn.addEventListener('click',()=>{if(!gallery)return;const step=(gallery.querySelector('.template-option')?.offsetWidth||160)+14;gallery.scrollBy({left:Number(btn.dataset.bgNav)*step*2,behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});}));
 const cont=document.querySelector('#continue-visibility');
 if(cont)cont.addEventListener('click',()=>{const vf=document.querySelector('#visibility-field');vf?.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});vf?.querySelector('.visibility-option:not(:disabled)')?.focus?.();});
 document.querySelector('#send').addEventListener('click',send);
 syncCultureRequirement();updatePreview();runCoach();
}
let sending=false;
async function send(){
 if(sending)return;
 const btn=document.querySelector('#send'),text=document.querySelector('#message').value.trim();
 let recipient=null;
 if(state.manualRecipient){
   const name=(document.querySelector('#recipient-manual-name')?.value||'').trim();
   const dept=(document.querySelector('#recipient-manual-dept')?.value||'').trim();
   const email=(document.querySelector('#recipient-manual-email')?.value||'').trim().toLowerCase();
   if(name.length<2){toast('Nhập họ tên người nhận.');return;}
   if(dept.length<2){toast('Nhập Phòng ban / Bộ phận người nhận.');return;}
   if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)){toast('Nhập email liên hệ hợp lệ.');return;}
   if(email===me().email.toLowerCase()){toast('Bạn không thể gửi cho chính mình.');return;}
   recipient={name,dept,email,manual:true};
 }else{
   const email=(document.querySelector('#recipient-email')?.value||'').trim().toLowerCase();
   const exact=employees.find(e=>e.email.toLowerCase()===email);
   if(!exact||!state.selectedRecipient){toast('Hãy tìm và chọn đúng email đồng nghiệp trong Master Data.');return;}
   if(exact.email===me().email){toast('Bạn không thể gửi cho chính mình.');return;}
   recipient=exact;
 }
 if(text.length<15||text.length>6000){toast('Nội dung KUDOS cần từ 15 đến 6.000 ký tự.');return;}
 if(QUOTA&&QUOTA.limit&&QUOTA.remaining<=0){toast('Bạn đã dùng đủ '+QUOTA.limit+' lượt gửi KUDOS hôm nay. Hạn mức được làm mới vào ngày mai.');return;}
 if(state.selectedTemplate!=='birthday'&&state.values.size===0){toast('Hãy chọn ít nhất 1 Giá trị văn hóa.');return;}
 const first=sentBy(me().email).length===0;
 const payload={recipientEmail:recipient.email,recipientManual:!!recipient.manual,recipientName:recipient.name,recipientDept:recipient.dept,message:text,values:[...state.values],templateId:state.selectedTemplate,visibility:'public'};
 const fingerprint=JSON.stringify(payload);
 if(!window.__ahakudosPendingSend||window.__ahakudosPendingSend.fingerprint!==fingerprint)window.__ahakudosPendingSend={fingerprint,requestId:uid()};
 payload.requestId=window.__ahakudosPendingSend.requestId;
 sending=true;btn.disabled=true;btn.textContent='Đang gửi KUDOS…';
 try{
  const result=await rpc('taoKudos',payload);window.__ahakudosPendingSend=null;
  takeRecord(result.record);if(result.quota)QUOTA=result.quota;
  state.prefillRecipient='';state.selectedRecipient=null;state.manualRecipient=false;state.values.clear();state.sendVisibility='public';
  state.page='kudos-detail';state.viewKudosId=result.record.id;
  try{history.replaceState(null,'','#/k/'+result.record.id);}catch(e){}
  render();window.scrollTo(0,0);showSuccessBanner(result.record,first);
  if(result.notice)toast(result.notice);
 }catch(e){if(e.code==='QUOTA'&&QUOTA)QUOTA.remaining=0;window.alert(e.code==='TIMEOUT'||e.code==='NETWORK'?e.message+'\nBấm Gửi lại sẽ KHÔNG tạo bản trùng (cùng mã lần gửi).':e.message);}
 finally{sending=false;if(document.contains(btn)){btn.disabled=false;btn.textContent='Gửi KUDOS';}}
}
function escapeHtml(str=''){return String(str).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));}
function showSuccessBanner(record,isFirst){
 const root=document.querySelector('#toast-root');root.querySelector('.kudos-success-banner')?.remove();
 const b=document.createElement('div');b.className='kudos-success-banner'+(isFirst?' first-kudos-banner':'');b.setAttribute('role','status');
 const vis='CỘNG ĐỒNG KUDOS · đang chờ Admin duyệt.';
 b.innerHTML=`<div class="success-banner-icon">${isFirst?'🎉':'✓'}</div><div class="success-banner-copy"><strong>${isFirst?'Chúc mừng! Bạn vừa gửi KUDOS đầu tiên':'Đã gửi lời ghi nhận'}</strong><span>Người nhận sẽ nhận email thông báo sau khi Admin duyệt.</span><em>${vis}</em></div><button class="success-banner-close" aria-label="Đóng">×</button>`;
 root.appendChild(b);requestAnimationFrame(()=>b.classList.add('show'));const close=()=>b.remove();b.querySelector('button').onclick=close;setTimeout(close,6500);
}
function openAvatarEditor(){
 let tempData=state.avatarData;let tempScale=state.avatarScale;
 document.querySelector('#modal-root').innerHTML=`<div class="modal-backdrop"><div class="modal avatar-modal"><button class="modal-close avatar-cancel">×</button><div class="kicker">HỒ SƠ CÁ NHÂN</div><h2>Cập nhật ảnh đại diện</h2><p>Chọn ảnh của bạn và điều chỉnh mức zoom để căn khung theo ý muốn.</p><div class="avatar-editor-preview" id="avatar-preview">${tempData?`<img src="${tempData}" alt="Ảnh đại diện xem trước" style="transform:scale(${tempScale})">`:`<span>${initials(me().name)}</span>`}</div><label class="avatar-file-btn">Chọn ảnh<input id="avatar-file" type="file" accept="image/*"></label><div class="zoom-row"><label for="avatar-zoom">Thu nhỏ</label><input id="avatar-zoom" type="range" min="0.8" max="2.4" step="0.05" value="${tempScale}"><label>Phóng to</label></div><div class="avatar-actions"><button class="btn secondary avatar-cancel">Hủy</button><button class="btn primary" id="avatar-save">Lưu ảnh</button></div></div></div>`;
 const file=document.querySelector('#avatar-file');const zoom=document.querySelector('#avatar-zoom');const preview=document.querySelector('#avatar-preview');
 const draw=()=>{preview.innerHTML=tempData?`<img src="${tempData}" alt="Ảnh đại diện xem trước" style="transform:scale(${tempScale})">`:`<span>${initials(me().name)}</span>`;};
 file.addEventListener('change',()=>{const f=file.files?.[0];if(!f)return;const reader=new FileReader();reader.onload=()=>{tempData=String(reader.result);tempScale=1;zoom.value='1';draw()};reader.readAsDataURL(f);});
 zoom.addEventListener('input',()=>{tempScale=Number(zoom.value);draw()});
 document.querySelectorAll('.avatar-cancel').forEach(b=>b.addEventListener('click',()=>document.querySelector('#modal-root').innerHTML=''));
 document.querySelector('#avatar-save').addEventListener('click',()=>{if(tempData&&!safeSet(AVATAR_KEY,tempData)){toast('Ảnh quá lớn để lưu trên trình duyệt này. Hãy chọn ảnh nhỏ hơn.');return;}if(!tempData)safeSet(AVATAR_KEY,null);safeSet(AVATAR_SCALE_KEY,String(tempScale));state.avatarData=tempData;state.avatarScale=tempScale;document.querySelector('#modal-root').innerHTML='';render();toast('Đã cập nhật ảnh đại diện.');});
}
function toast(text){const t=document.createElement('div');t.className='toast';t.textContent=text;document.querySelector('#toast-root').appendChild(t);setTimeout(()=>t.remove(),2200)}

function initHomeHandbookProgress(){
 const root=document.querySelector('.home-handbook-progress');
 if(!root||root.dataset.bound==='1')return;
 root.dataset.bound='1';
 const links=[...root.querySelectorAll('a[href^="#home-"]')];
 const count=root.querySelector('.home-progress-count b');
 const bar=root.querySelector('.home-progress-count span');
 const update=(index)=>{
   links.forEach((a,i)=>a.classList.toggle('active',i===index));
   if(count)count.textContent=`${index+1}/3`;
   if(bar)bar.style.setProperty('--progress',`${(index+1)/3*100}%`);
 };
 links.forEach((a,i)=>a.addEventListener('click',()=>update(i)));
 const byHash=()=>{
   const idx=links.findIndex(a=>a.getAttribute('href')===location.hash);
   update(idx>=0?idx:0);
 };
 window.addEventListener('hashchange',byHash);
 byHash();
}

// ---- Deep link (#/k/<id>) --------------------------------------------------
function handleDeepLink(){
 let id=((location.hash||'').match(/^#\/k\/([A-Za-z0-9_-]{3,90})$/)||[])[1]||'';
 if(!id&&legacyLinkId&&!window.__ahakudosLegacyLinkUsed&&/^[A-Za-z0-9_-]{3,90}$/.test(legacyLinkId)){window.__ahakudosLegacyLinkUsed=true;id=legacyLinkId;try{history.replaceState(null,'',location.pathname+'#/k/'+id);}catch(e){}}
 if(id){state.mode='employee';state.page='kudos-detail';state.viewKudosId=id;return true;}
 return false;
}
window.addEventListener('hashchange',()=>{if(handleDeepLink())render();initHomeHandbookProgress();});

// ---- 8. Start ---------------------------------------------------------------
handleDeepLink();
render();
initHomeHandbookProgress();
window.AhaKudosBoot.ready();
window.addEventListener('error',e=>{if(e.target&&e.target!==window)return;console.error('[AhaKudos] runtime error',e.error||e.message);toast('Có lỗi hiển thị. Nếu màn hình không phản hồi, vui lòng tải lại trang.');});
window.addEventListener('unhandledrejection',e=>{console.error('[AhaKudos] unhandled',e.reason);});
})();
