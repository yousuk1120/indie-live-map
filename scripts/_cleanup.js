const fs = require("fs"), path = require("path");
function loadEnv(){const raw=fs.readFileSync(path.join(__dirname,"..",".env.local"),"utf8");const e={};for(const l of raw.split(/\r?\n/)){const m=l.match(/^([A-Z0-9_]+)=(.*)$/);if(!m)continue;let v=m[2];if(v.startsWith('"')&&v.endsWith('"'))v=v.slice(1,-1);e[m[1]]=v;}return e;}
const norm=s=>s.toLowerCase().replace(/[\s\-_.,!?'"()\[\]]/g,"");
const split=v=>String(v||"").split(/[,/|·]+/).map(s=>s.trim()).filter(Boolean);
function unionArtists(a,b){const out=[],seen=new Set();for(const n of [...split(a),...split(b)]){const k=norm(n);if(k&&!seen.has(k)){seen.add(k);out.push(n);}}return out.join(", ");}

const DELETE=["EN9GpF1RlnErBEV0GC6y","og2y94x5Af4WC8U5Twq3","sEEUb9xLLgsP1cOehGBq","sxTKbgOIf65RRk8n06X8","jEXdIqCRbU6MucVTGu8a"];
const MERGE=[
  {keep:"rZsR7czduQsjpU8hDK4d",dup:"4HMkzk4IF89tSvmMqUKp"}, // 모래내극락 7.03
  {keep:"CHfsoyoNAawTsenqfebr",dup:"V43eBo0TmI36dpBeFXWq"}, // 모래내극락 7.11
  {keep:"L2c97zJPjh7LkXRh9IdW",dup:"ipu1GS33d0SyNRbZT0ey"}, // 클럽FF 7.18
  {keep:"rNW6VIO74DWS5Pmv5ywt",dup:"xsnZVuOGNS2KIlemeUeZ"}, // 모래내극락 6.26
];
(async()=>{
  const env=loadEnv();const admin=require("firebase-admin");
  if(!admin.apps.length){admin.initializeApp({credential:admin.credential.cert({projectId:env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,clientEmail:env.FIREBASE_CLIENT_EMAIL,privateKey:(env.FIREBASE_PRIVATE_KEY||"").replace(/\\n/g,"\n")})});}
  const db=admin.firestore();const FieldValue=admin.firestore.FieldValue;

  console.log("=== 명백 중복 삭제 ===");
  for(const id of DELETE){const s=await db.collection("events").doc(id).get();if(!s.exists){console.log("이미 없음:",id);continue;}await s.ref.delete();console.log("삭제:",`"${s.data().title}"`);}

  console.log("\n=== 클럽 중복 병합 ===");
  for(const {keep,dup} of MERGE){
    const ks=await db.collection("events").doc(keep).get();const ds=await db.collection("events").doc(dup).get();
    if(!ks.exists){console.log("유지대상 없음, 스킵:",keep);continue;}
    if(!ds.exists){console.log("중복 이미 없음:",dup);continue;}
    const k=ks.data(),d=ds.data();
    const artists=unionArtists(k.artistNames,d.artistNames);
    const upd={artistNames:artists,updatedAt:FieldValue.serverTimestamp()};
    if(!k.posterUrl&&d.posterUrl)upd.posterUrl=d.posterUrl;
    if((!k.dayLineups||!k.dayLineups.length)&&d.dayLineups&&d.dayLineups.length)upd.dayLineups=d.dayLineups;
    if(!k.venueName&&d.venueName)upd.venueName=d.venueName;
    await ks.ref.update(upd);
    await ds.ref.delete();
    console.log(`병합: "${k.title}" ← "${d.title}"  (아티스트 ${split(k.artistNames).length}+${split(d.artistNames).length}→${split(artists).length})`);
  }
  await admin.app().delete();
})().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1);});
