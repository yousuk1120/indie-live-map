// 사운드플래닛 중복 2건을 하나의 멀티데이 페스티벌로 병합.
// 기본은 dry-run(출력만). 실제 반영하려면:  node scripts/fix-soundplanet.js --apply
const fs = require("fs"), path = require("path");
const raw = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8");
const env = {};
for (const l of raw.split(/\r?\n/)) { const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m) { let v = m[2]; if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1); env[m[1]] = v; } }
const admin = require("firebase-admin");
admin.initializeApp({ credential: admin.credential.cert({ projectId: env.NEXT_PUBLIC_FIREBASE_PROJECT_ID, clientEmail: env.FIREBASE_CLIENT_EMAIL, privateKey: (env.FIREBASE_PRIVATE_KEY || "").replace(/\\n/g, "\n") }) });
const db = admin.firestore();

const KEEP_ID = "vzU5CKVf3PTWCEYXyDQe";   // "사운드 플래닛 페스티벌 2026"
const DROP_ID = "aVuIQVySpsHduEuZMEud";   // "사운드플래닛"
const apply = process.argv.includes("--apply");

(async () => {
  const keepDoc = await db.collection("events").doc(KEEP_ID).get();
  const dropDoc = await db.collection("events").doc(DROP_ID).get();
  if (!keepDoc.exists || !dropDoc.exists) {
    console.log("이미 처리됨 또는 문서 없음. keep:", keepDoc.exists, "drop:", dropDoc.exists);
    process.exit(0);
  }
  const keep = keepDoc.data();
  const drop = dropDoc.data();
  console.log("=== KEEP 원본 ===\n", JSON.stringify(keep, null, 1));
  console.log("=== DROP 원본 ===\n", JSON.stringify(drop, null, 1));

  // 어떤 필드명을 쓰는지 자동 감지 (venue vs venueName)
  const venueField = keep.venueName !== undefined || drop.venueName !== undefined ? "venueName" : "venue";
  const pick = (a, b) => (String(a || "").trim() ? a : b);

  // 라인업 합집합 (공백/대소문자 무시 중복 제거)
  const splitA = (v) => String(v || "").split(/[,/|·]+/).map((s) => s.trim()).filter(Boolean);
  const unionArtists = (() => {
    const seen = new Set(); const out = [];
    for (const a of [...splitA(keep.artistNames), ...splitA(drop.artistNames)]) {
      const k = a.toLowerCase().replace(/\s+/g, "");
      if (k && !seen.has(k)) { seen.add(k); out.push(a); }
    }
    return out.join(", ");
  })();

  // 날짜별 라인업: 9/5 = KEEP, 9/6 = DROP
  const dayLineups = [];
  if (splitA(keep.artistNames).length) dayLineups.push({ date: "2026-09-05", artists: splitA(keep.artistNames).join(", ") });
  if (splitA(drop.artistNames).length) dayLineups.push({ date: "2026-09-06", artists: splitA(drop.artistNames).join(", ") });

  const merged = {
    ...keep,
    title: "사운드 플래닛 페스티벌 2026",
    date: "2026-09-05",
    endDate: "2026-09-06",
    [venueField]: "파라다이스시티",
    artistNames: unionArtists,
    dayLineups,
    // 비어 있으면 DROP 쪽 값 보강
    posterUrl: pick(keep.posterUrl, drop.posterUrl),
    sourceUrl: pick(keep.sourceUrl, drop.sourceUrl),
    instagramUrl: pick(keep.instagramUrl, drop.instagramUrl),
    price: pick(keep.price, drop.price),
    timetableImageUrl: pick(keep.timetableImageUrl, drop.timetableImageUrl),
    ticketOpenAt: pick(keep.ticketOpenAt, drop.ticketOpenAt),
  };
  if (keep.venue !== undefined && venueField !== "venue") merged.venue = "파라다이스시티";

  console.log("\n=== 병합 결과(KEEP 문서에 반영) ===\n", JSON.stringify(merged, null, 1));
  console.log("\n삭제 대상:", DROP_ID, `(${drop.title})`);

  if (!apply) {
    console.log("\n[DRY-RUN] 실제 반영하려면 --apply 를 붙여 다시 실행하세요.");
    process.exit(0);
  }

  // Firestore는 undefined를 허용하지 않음 — 제거
  const clean = Object.fromEntries(Object.entries(merged).filter(([, v]) => v !== undefined));
  await db.collection("events").doc(KEEP_ID).set(clean, { merge: true });
  await db.collection("events").doc(DROP_ID).delete();
  console.log("\n✅ 반영 완료: KEEP 업데이트 + DROP 삭제");
  process.exit(0);
})().catch((e) => { console.error("ERR", e.message); process.exit(1); });
