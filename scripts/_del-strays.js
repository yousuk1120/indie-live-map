// 사용자 승인 삭제: (1) 해외(대만) Kaohsiung 이벤트, (2) 제목 오염된 "잔다리 페스트"(클럽샤프 8/1 클럽공연).
const { loadEnv, initAdmin } = require("./_lib");

const TARGETS = [
  { id: "ARUZ78o0XLNxdeTHOQ9O", verify: (e) => /kaohsiung|고雄/i.test(`${e.title || ""}${e.venueName || ""}`), note: "해외(대만) 이벤트" },
  { id: "t8QrchazPGpVQpXfxrxp", verify: (e) => /잔다리/.test(e.title || "") && /샤프|sharp/i.test(e.venueName || ""), note: "제목 오염 클럽공연(잔다리 페스트→클럽샤프)" },
];

(async () => {
  const env = loadEnv();
  const db = initAdmin(env).firestore();
  let deleted = 0;
  for (const t of TARGETS) {
    const doc = await db.collection("events").doc(t.id).get();
    if (!doc.exists) { console.log(`이미 없음: ${t.id} (${t.note})`); continue; }
    const e = doc.data();
    if (!t.verify(e)) { console.log(`⚠️ 검증 불일치 — 건너뜀: ${t.id} "${e.title}"`); continue; }
    await db.collection("events").doc(t.id).delete();
    console.log(`✅ 삭제: ${t.id} "${e.title}" @${e.venueName} — ${t.note}`);
    deleted++;
  }
  console.log(`\n완료: ${deleted}건 삭제.`);
})().then(() => process.exit(0)).catch((e) => { console.error("ERR", e); process.exit(1); });
