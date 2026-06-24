// events 데이터 진단 — 포스터 누락/만료, 중복 의심, 라인업 상태, 공연장 미정 등.
const fs = require("fs");
const path = require("path");

function loadEnv() {
  const raw = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8");
  const env = {};
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    let v = m[2];
    if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
    env[m[1]] = v;
  }
  return env;
}

function normTitle(t) {
  return String(t || "").toLowerCase().replace(/[\s\-_.,!?'"()\[\]]/g, "").replace(/[^\w가-힣]/g, "");
}

async function main() {
  const env = loadEnv();
  const admin = require("firebase-admin");
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
        clientEmail: env.FIREBASE_CLIENT_EMAIL,
        privateKey: (env.FIREBASE_PRIVATE_KEY || "").replace(/\\n/g, "\n"),
      }),
    });
  }
  const db = admin.firestore();
  const snap = await db.collection("events").get();
  const evs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

  let blob = 0, insta = 0, empty = 0, other = 0;
  for (const e of evs) {
    const p = String(e.posterUrl || "").trim();
    if (!p) empty++;
    else if (p.includes(".blob.vercel-storage.com")) blob++;
    else if (/cdninstagram|fbcdn|instagram/.test(p)) insta++;
    else other++;
  }

  console.log(`총 events: ${evs.length}`);
  console.log(`포스터 — Blob영구: ${blob}, 인스타(만료위험): ${insta}, 없음: ${empty}, 기타: ${other}`);

  // 공연장 미정
  const noVenue = evs.filter((e) => !String(e.venueName || "").trim());
  console.log(`공연장 미정: ${noVenue.length}`);

  // 제목+날짜 같은 중복 의심
  const byKey = new Map();
  for (const e of evs) {
    const k = normTitle(e.title) + "|" + String(e.date || "").trim();
    if (!byKey.has(k)) byKey.set(k, []);
    byKey.get(k).push(e);
  }
  const dups = [...byKey.values()].filter((g) => g.length > 1);
  console.log(`\n중복 의심(제목+날짜 동일) 그룹: ${dups.length}`);
  for (const g of dups.slice(0, 15)) {
    console.log(`  · "${g[0].title}" (${g[0].date}) ×${g.length} — 장소: ${g.map((x) => x.venueName || "미정").join(" / ")}`);
  }

  // 라이브클럽데이/사운드플래넷/패치룸 관련 항목
  console.log(`\n관심 키워드 항목:`);
  for (const e of evs) {
    const t = String(e.title || "");
    if (/라이브클럽데이|live\s*club\s*day|사운드플래넷|sound\s*planet|패치룸|patch/i.test(t)) {
      console.log(`  · "${t}" (${e.date}~${e.endDate || ""}) 장소:${e.venueName || "미정"} 라인업수:${(e.dayLineups || []).length} artists:${String(e.artistNames || "").slice(0, 40)} poster:${e.posterUrl ? "O" : "X"}`);
    }
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
