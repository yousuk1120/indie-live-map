// 국내 페스티벌 공식 인스타 계정을 수집 타겟(source_accounts)에 category="페스티벌"로 추가합니다.
// → 공식 포스터/전체 라인업이 직접 수집되고, 밴드 공지 글이 공식 포스터를 덮지 못합니다(posterLocked).
//   (아티스트가 "○○페스티벌 나간다"고 공지하면, 그 페스티벌 공식 계정이 타겟에 있으므로
//    공식 포스터·라인업이 갱신됩니다. 해외 페스티벌은 넣지 않습니다.)
// 사용법: node scripts/add-festival-sources.js
//
// 핸들은 2026-06-25 웹 검색으로 검증한 "국내(한국 개최)" 페스티벌 공식 계정입니다.
const { loadEnv, initAdmin } = require("./_lib");

// 신규 추가 대상 (국내 페스티벌 공식 계정)
const FESTIVALS = [
  { accountName: "oneuniversefestival", label: "원유니버스 페스티벌" },
  { accountName: "pentaportrf", label: "인천펜타포트 락 페스티벌" },
  { accountName: "dmzpeacetrain", label: "DMZ 피스트레인 뮤직 페스티벌" },
  { accountName: "parkmusicfestival_", label: "서울파크뮤직페스티벌" },
  { accountName: "soundplanetfestival", label: "사운드 플래닛 페스티벌" },
  { accountName: "jarasumjazzfestival", label: "자라섬 재즈 페스티벌" },
  { accountName: "seouljazzfestival", label: "서울재즈페스티벌" },
  { accountName: "seoulspringfestival_official", label: "서울스프링페스티벌" },
];

// 이미 등록돼 있으나 category가 페스티벌이 아니어서 포스터 보호가 안 되던 계정 — category 승격
const UPGRADE_TO_FESTIVAL = ["grandmintfestival", "zandarifesta"];

function norm(s) {
  return String(s || "").trim().toLowerCase().replace(/^@/, "");
}

async function main() {
  const env = loadEnv();
  const admin = initAdmin(env);
  const db = admin.firestore();
  const FieldValue = admin.firestore.FieldValue;

  const snap = await db.collection("source_accounts").get();
  const byName = new Map(snap.docs.map((d) => [norm(d.data().accountName), { id: d.id, ...d.data() }]));

  let added = 0, skipped = 0, upgraded = 0;

  for (const f of FESTIVALS) {
    const key = norm(f.accountName);
    const existing = byName.get(key);
    if (existing) {
      if (existing.category !== "페스티벌") {
        await db.collection("source_accounts").doc(existing.id).update({ category: "페스티벌" });
        console.log(`↑ 카테고리 승격: @${f.accountName} → 페스티벌 (${f.label})`);
        upgraded++;
      } else {
        console.log(`건너뜀(이미 있음): @${f.accountName}`);
        skipped++;
      }
      continue;
    }
    await db.collection("source_accounts").add({
      accountName: f.accountName,
      category: "페스티벌",
      isActive: true,
      note: f.label,
      createdAt: FieldValue.serverTimestamp(),
    });
    console.log(`+ 추가: [페스티벌] @${f.accountName} (${f.label})`);
    added++;
  }

  for (const name of UPGRADE_TO_FESTIVAL) {
    const existing = byName.get(norm(name));
    if (existing && existing.category !== "페스티벌") {
      await db.collection("source_accounts").doc(existing.id).update({ category: "페스티벌" });
      console.log(`↑ 카테고리 승격: @${name} → 페스티벌`);
      upgraded++;
    }
  }

  console.log(`\n완료: ${added}개 추가, ${upgraded}개 페스티벌 승격, ${skipped}개 건너뜀.`);
}

main().then(() => process.exit(0)).catch((e) => { console.error("스크립트 실패:", e); process.exit(1); });
