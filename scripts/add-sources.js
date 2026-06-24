// 검증된 신규 수집 타겟 계정을 source_accounts에 추가합니다 (이미 있으면 건너뜀).
const fs = require("fs");
const path = require("path");

// 2026-06-24 웹 검색으로 핸들 검증한 신규 계정 (기획사/레이블·페스티벌 — 기존 0개 영역 보강)
const CANDIDATES = [
  { accountName: "msbsound", category: "기획사" },                 // 매직스트로베리사운드
  { accountName: "dooroodooroo.ac", category: "기획사" },          // 두루두루 아티스트 컴퍼니
  { accountName: "poclanos", category: "기획사" },                 // 포크라노스
  { accountName: "bgbgrecord", category: "기획사" },               // 붕가붕가레코드
  { accountName: "happy_robot_records", category: "기획사" },      // 해피로봇 레코드
  { accountName: "mirrorballmusic_official", category: "기획사" }, // 미러볼뮤직
  { accountName: "grandmintfestival", category: "기획사" },        // 그랜드민트페스티벌
  { accountName: "zandarifesta", category: "기획사" },             // 잔다리페스타
];

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

function norm(s) {
  return String(s || "").trim().toLowerCase().replace(/^@/, "");
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

  const snap = await db.collection("source_accounts").get();
  const existing = new Set(snap.docs.map((d) => norm(d.data().accountName)));

  let added = 0;
  let skipped = 0;
  for (const c of CANDIDATES) {
    if (existing.has(norm(c.accountName))) {
      console.log(`건너뜀(이미 있음): @${c.accountName}`);
      skipped++;
      continue;
    }
    await db.collection("source_accounts").add({
      accountName: c.accountName,
      category: c.category,
      isActive: true,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    console.log(`추가됨: [${c.category}] @${c.accountName}`);
    added++;
  }
  console.log(`\n완료: ${added}개 추가, ${skipped}개 건너뜀.`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
