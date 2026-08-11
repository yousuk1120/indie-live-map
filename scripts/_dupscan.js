// 읽기 전용: 같은 날짜범위 + 같은(유사) 장소인데 문서가 여러 개인 중복 후보를 찾음.
const fs = require("fs"), path = require("path");
function loadEnv(){const raw=fs.readFileSync(path.join(__dirname,"..",".env.local"),"utf8");const e={};for(const l of raw.split(/\r?\n/)){const m=l.match(/^([A-Z0-9_]+)=(.*)$/);if(!m)continue;let v=m[2];if(v.startsWith('"')&&v.endsWith('"'))v=v.slice(1,-1);e[m[1]]=v;}return e;}
function venueCore(v){return String(v||"").split("/")[0].toLowerCase().replace(/[\s\-_.,()]/g,"").slice(0,10);}
function artCount(e){return (e.artistNames||"").split(/[,/|·]/).map(s=>s.trim()).filter(Boolean).length;}
(async()=>{
  const env=loadEnv();const admin=require("firebase-admin");
  if(!admin.apps.length){admin.initializeApp({credential:admin.credential.cert({projectId:env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,clientEmail:env.FIREBASE_CLIENT_EMAIL,privateKey:(env.FIREBASE_PRIVATE_KEY||"").replace(/\\n/g,"\n")})});}
  const db=admin.firestore();
  const ev=(await db.collection("events").get()).docs.map(d=>({id:d.id,...d.data()}));
  console.log(`전체 이벤트 ${ev.length}개`);
  // 그룹 키: 시작일 + 종료일 + 장소코어
  const groups={};
  for(const e of ev){
    const key=`${e.date||"?"}|${e.endDate||""}|${venueCore(e.venueName)}`;
    (groups[key]=groups[key]||[]).push(e);
  }
  const dups=Object.entries(groups).filter(([,g])=>g.length>1);
  console.log(`\n중복 후보 그룹 ${dups.length}개:\n`);
  let totalExtra=0;
  for(const [key,g] of dups.sort((a,b)=>b[1].length-a[1].length)){
    totalExtra += g.length-1;
    console.log(`● ${key}  (${g.length}건)`);
    g.sort((a,b)=>(artCount(b)+ (b.dayLineups||[]).length)-(artCount(a)+(a.dayLineups||[]).length));
    g.forEach((e,i)=>console.log(`   ${i===0?"KEEP":"dup "} [${e.id}] "${e.title}" artists=${artCount(e)} days=${(e.dayLineups||[]).length} poster=${e.posterUrl?"O":"X"} venue="${(e.venueName||"").slice(0,30)}"`));
  }
  console.log(`\n중복 그룹 ${dups.length}개, 삭제 후보(그룹당 1건 유지) 총 ${totalExtra}건`);
  await admin.app().delete();
})().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1);});
