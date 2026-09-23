const PEOPLE=[
  {email:'quocanh.demo@ahamove.com',name:'Vương Quốc Anh',dept:'Central Operations',section:'Operations Excellence',dateOfBirth:'1994-10-03',joinDate:'2023-04-10',tenureDays:1261,status:'ACTIVE',notes:'Visual demo user — empty journey'},
  {email:'ngocphuong.demo@ahamove.com',name:'Ngọc Phương',dept:'HR',section:'People Experience',dateOfBirth:'1996-11-15',joinDate:'2024-02-01',tenureDays:964,status:'ACTIVE',notes:'Visual demo user — populated journey'}
];
const records=[
  {id:'demo-approved-001',requestId:'demo-001',senderName:'Vương Quốc Anh',senderDept:'Central Operations',senderSection:'Operations Excellence',senderEmail:'quocanh.demo@ahamove.com',recipientName:'Ngọc Phương',recipientDept:'HR',recipientSection:'People Experience',recipientEmail:'ngocphuong.demo@ahamove.com',recipientManual:false,message:'Cảm ơn Phương đã chủ động tổng hợp feedback và giúp team chốt nội dung đúng deadline. Nhờ vậy mọi người phối hợp nhanh hơn và hạn chế được các vòng chỉnh sửa.',values:['share','grow'],templateId:'move',backgroundId:'move',visibility:'public',publicConsent:'approved',createdAt:'2026-09-21T09:30:00+07:00',sentAtLabel:'21/09, 09:30',emailStatus:'SUBMITTED',viewedAt:'2026-09-21T09:45:00+07:00',source:'EMPLOYEE',moderation:{status:'APPROVED',reasons:[],automatedRiskStatus:'APPROVED',decidedBy:'admin@ahamove.com',decidedAt:'2026-09-21T09:35:00+07:00'},reactions:{heart:3,clap:1,cheer:2,spark:1},myReactions:{},_reactionActors:{}},
  {id:'demo-approved-002',requestId:'demo-002',senderName:'Ngọc Phương',senderDept:'HR',senderSection:'People Experience',senderEmail:'ngocphuong.demo@ahamove.com',recipientName:'Ngọc Phương',recipientDept:'HR',recipientSection:'People Experience',recipientEmail:'ngocphuong.demo@ahamove.com',recipientManual:false,message:'Cảm ơn bạn đã chia sẻ lại cách xử lý dữ liệu và dành thời gian hướng dẫn team khi mọi người còn vướng.',values:['share'],templateId:'tech',backgroundId:'tech',visibility:'public',publicConsent:'approved',createdAt:'2026-09-20T15:10:00+07:00',sentAtLabel:'20/09, 15:10',emailStatus:'SUBMITTED',viewedAt:'2026-09-20T15:30:00+07:00',source:'EMPLOYEE',moderation:{status:'APPROVED',reasons:[],automatedRiskStatus:'APPROVED',decidedBy:'admin@ahamove.com',decidedAt:'2026-09-20T15:15:00+07:00'},reactions:{heart:4,clap:2,cheer:1,spark:2},myReactions:{},_reactionActors:{}}
];
function baseUrl(req){return 'https://visual-test.local';}
function banners(){const base='';const state={
 leaderboard_top_week:{id:'leaderboard_top_week',type:'celebrate',headline:'Top Kudos tuần này',subheadline:'Cùng xem ai đang lan toả nhiều lời ghi nhận nhất tuần.',ctaLabel:'Xem bảng xếp hạng',ctaRoute:'leaderboard',image:'/illustrations/top.png'},
 compose_hero:{id:'compose_hero',type:'action',headline:'Viết Kudos – Gửi lời khen',subheadline:'Một lời ghi nhận nhỏ, một ngày vui hơn cho đồng nghiệp.',ctaLabel:'Viết Kudos ngay',ctaRoute:'compose',image:'/illustrations/compose.png'},
 first_kudos:{id:'first_kudos',type:'empty',headline:'Chưa có Kudos – Gửi lời khen đầu tiên',subheadline:'Bắt đầu bằng một lời cảm ơn dành cho đồng nghiệp bạn muốn ghi nhận.',ctaLabel:'Gửi Kudos đầu tiên',ctaRoute:'compose',image:'/illustrations/empty.png'},
 empty_received:{id:'empty_received',type:'empty',headline:'Chưa có Kudos nào',subheadline:'Khi đồng nghiệp gửi lời ghi nhận, bạn sẽ thấy ở đây.',ctaLabel:'Gửi Kudos ngay',ctaRoute:'compose',image:'/illustrations/empty.png'},
 send_success:{id:'send_success',type:'success',headline:'Đã gửi Kudos!',subheadline:'Lời ghi nhận của bạn đang trên đường đến đồng nghiệp.',ctaLabel:'Về trang chủ',ctaRoute:'home',image:'/illustrations/send-success.png'},
 ai_review:{id:'ai_review',type:'system',headline:'AI kiểm tra lời nhắn',subheadline:'Những lời ghi nhận cần xem lại được giữ ở đây trước khi gửi.',ctaLabel:'',ctaRoute:'',image:'/illustrations/ai-review.png'},
 new_kudos_received:{id:'new_kudos_received',type:'receive',headline:'Bạn nhận được 1 Kudos mới!',subheadline:'Có một lời ghi nhận đang chờ bạn trong AhaKudos.',ctaLabel:'Mở lời ghi nhận này',ctaRoute:'kudos-detail',image:'/illustrations/received-new.png'},
 received_emotional:{id:'received_emotional',type:'receive',headline:'Cảm động quá!',subheadline:'Bạn vừa nhận được một lời khen từ đồng nghiệp.',ctaLabel:'Xem Kudos',ctaRoute:'kudos-detail',image:'/illustrations/received-emotional.png'},
 loading:{id:'loading',type:'system',headline:'Chờ một chút nhé',subheadline:'AhaKudos đang cập nhật thông tin…',ctaLabel:'',ctaRoute:'',image:'/illustrations/loading.png'},
 milestone_complete:{id:'milestone_complete',type:'celebrate',headline:'Bạn đã hoàn thành cột mốc!',subheadline:'Một dấu mốc đáng tự hào trong hành trình của bạn.',ctaLabel:'Xem chi tiết',ctaRoute:'kudos-detail',image:'/illustrations/milestone.png'},
 celebration:{id:'celebration',type:'celebrate',headline:'Chúc mừng bạn!',subheadline:'Một thành tích đáng được ghi nhận và lan toả.',ctaLabel:'Mở AhaKudos',ctaRoute:'home',image:'/illustrations/celebration.png'},
 birthday:{id:'birthday',type:'celebrate',headline:'Chúc mừng sinh nhật',subheadline:'AhaKudos chúc bạn một ngày thật rực rỡ!',ctaLabel:'Mở AhaKudos',ctaRoute:'home',image:'/illustrations/birthday.png'}
};return state;}
function state(actor){return {people:PEOPLE,masterData:PEOPLE,currentUserEmail:actor,isAdmin:false,records:records,moderation:{blacklist:['test spam']},banners:banners(),events:[],activeEventIds:[],app:{version:'V29-VISUAL-TEST',mailEnabled:false,automationEnabled:false,attemptsToday:0,dailyLimit:0,employeeDailyKudosLimit:5,webUrl:''}};}
function person(email){return PEOPLE.find(p=>p.email===email)||PEOPLE[0];}
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='POST')return res.status(405).json({ok:false,error:'POST only'});
  const b=req.body||{};const actor=String(b.actorEmail||PEOPLE[0].email).toLowerCase();
  const method=b.method;const args=Array.isArray(b.args)?b.args:[];
  if(method==='layTrangThai')return res.status(200).json({ok:true,data:state(actor)});
  if(method==='taoKudos'){
    const d=args[0]||{};const a=person(actor);const r=PEOPLE.find(p=>p.email===String(d.recipientEmail||'').toLowerCase())||PEOPLE[1];
    const rec={id:'visual-'+Date.now(),requestId:d.requestId||'visual',senderName:a.name,senderDept:a.dept,senderSection:a.section,senderEmail:a.email,recipientName:r.name,recipientDept:r.dept,recipientSection:r.section,recipientEmail:r.email,recipientManual:false,message:String(d.message||'Cảm ơn bạn!'),values:Array.isArray(d.values)?d.values:[],templateId:d.templateId||'wish',backgroundId:d.templateId||'wish',visibility:'public',publicConsent:'pending',createdAt:new Date().toISOString(),sentAtLabel:'Vừa xong',emailStatus:'NOT_SENT',viewedAt:null,source:'EMPLOYEE',moderation:{status:'PENDING',reasons:[],automatedRiskStatus:'APPROVED',decidedBy:'',decidedAt:''},reactions:{heart:0,clap:0,cheer:0,spark:0},myReactions:{},_reactionActors:{}};
    return res.status(200).json({ok:true,data:{record:rec,app:state(actor).app,notice:'Visual test: KUDOS chỉ tồn tại trong phiên hiện tại.'}});
  }
  if(['ghiDaMo','doiReaction','duyetKudos','anKudos','suaKudosDuyet','datPhamViKudos'].includes(method)){
    const id=String(args[0]||'');const rec=records.find(x=>x.id===id)||records[0];return res.status(200).json({ok:true,data:{record:rec,app:state(actor).app}});
  }
  if(method==='datTuCam')return res.status(200).json({ok:true,data:{moderation:{blacklist:Array.isArray(args[0])?args[0]:[]},app:state(actor).app}});
  if(['luuEvent','xoaEvent','datEventKichHoat'].includes(method))return res.status(200).json({ok:true,data:{events:[],app:state(actor).app}});
  return res.status(400).json({ok:false,error:'Visual test chưa mô phỏng thao tác này.'});
}
