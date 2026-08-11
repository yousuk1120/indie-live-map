// 공식 전용 페스티벌 정리:
//  1) @blockpartykorea 를 [페스티벌] source_accounts에 추가 (공식 계정 수집 활성화)
//  2) 비공식 계정(밴드/공연장)에서 잘못 수집된 블록파티 중복 이벤트 삭제
//  3) 프리퀄이 본 행사(메인 페스티벌) 날짜·장소를 훔쳐온 손상 이벤트 삭제
//     (사운드플래닛 "BOOST UP in 보령"이 9/5~6·파라다이스시티를 도용한 건)
//
// 기본은 dry-run(출력만). 실제 반영:  node scripts/fix-official-festivals.js --apply
const { loadEnv, initAdmin } = require("./_lib");

const APPLY = process.argv.includes("--apply");

// lib/official-festivals.ts / event-merge.ts 와 동일한 정규화 (스크립트용 축약 재구현)
function normTitle(t) {
  return String(t || "").toLowerCase().replace(/[\s\-_.,!?'"()\[\]]/g, "").replace(/[^\w가-힣]/g, "");
}
function normDate(v) {
  const m = String(v || "").match(/(\d{2,4})[./-](\d{1,2})[./-](\d{1,2})/);
  if (!m) return "";
  const y = m[1].length === 2 ? `20${m[1]}` : m[1];
  return `${y}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
}
function normVenue(v) {
  return normTitle(v);
}

const BLOCKPARTY_KEYWORDS = ["blockparty", "블록파티", "블럭파티"];
const PREQUEL_MARKERS = ["boostup", "prequel", "preshow", "warmup", "부스트업", "프리퀄", "프리쇼", "프리파티", "사전공연", "워밍업"];
const isBlockParty = (t) => BLOCKPARTY_KEYWORDS.some((k) => normTitle(t).includes(normTitle(k)));
const isPrequel = (t) => PREQUEL_MARKERS.some((m) => normTitle(t).includes(normTitle(m)));

async function main() {
  const env = loadEnv();
  const admin = initAdmin(env);
  const db = admin.firestore();
  const FieldValue = admin.firestore.FieldValue;

  console.log(`=== 공식 전용 페스티벌 정리 (${APPLY ? "APPLY" : "DRY-RUN"}) ===\n`);

  // ── 1) @blockpartykorea 소스 추가 ──
  const saSnap = await db.collection("source_accounts").get();
  const existingHandles = new Set(saSnap.docs.map((d) => String(d.data().accountName || "").trim().toLowerCase()));
  if (existingHandles.has("blockpartykorea")) {
    console.log("[소스] @blockpartykorea 이미 존재 — 건너뜀");
  } else if (APPLY) {
    await db.collection("source_accounts").add({
      accountName: "blockpartykorea",
      category: "페스티벌",
      isActive: true,
      note: "블록파티 (해방촌·이태원 로컬 페스티벌 공식 계정)",
      createdAt: FieldValue.serverTimestamp(),
    });
    console.log("[소스] + 추가: [페스티벌] @blockpartykorea");
  } else {
    console.log("[소스] (예정) + 추가: [페스티벌] @blockpartykorea");
  }

  // ── events 로드 ──
  const evSnap = await db.collection("events").get();
  const evs = evSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const key = (e) => `${normDate(e.date)}|${normVenue(e.venueName)}`;

  const toDelete = [];

  // ── 2) 비공식 블록파티 중복: 라인업 없는(부실) 블록파티 이벤트 삭제, 라인업 있는 대표 1건 유지 ──
  const blockParties = evs.filter((e) => isBlockParty(e.title));
  const withLineup = blockParties.filter((e) => String(e.artistNames || "").trim());
  for (const e of blockParties) {
    const hasLineup = String(e.artistNames || "").trim();
    // 라인업 있는 대표가 따로 있으면, 라인업 없는 부실 블록파티는 비공식 중복으로 보고 삭제
    if (!hasLineup && withLineup.length > 0) {
      toDelete.push({ ev: e, reason: "블록파티 비공식/부실 중복(라인업 없음)" });
    }
  }

  // ── 3) 프리퀄이 본 행사 일정을 도용한 손상 이벤트 삭제 ──
  for (const e of evs) {
    if (!isPrequel(e.title)) continue;
    const d = normDate(e.date), v = normVenue(e.venueName);
    if (!d || !v) continue;
    const stealsFrom = evs.find((o) => o.id !== e.id && !isPrequel(o.title) && key(o) === key(e));
    if (stealsFrom) {
      toDelete.push({ ev: e, reason: `프리퀄이 본 행사 일정 도용 (도용 대상: "${stealsFrom.title}")` });
    }
  }

  // ── 보고 ──
  console.log(`\n[유지] 라인업 보유 블록파티 대표:`);
  for (const e of withLineup) console.log(`  · "${e.title}" (${e.date}~${e.endDate || ""}) @${e.venueName} — artists: ${String(e.artistNames).slice(0, 50)}`);

  console.log(`\n[삭제 대상] ${toDelete.length}건:`);
  for (const { ev, reason } of toDelete) {
    console.log(`  ✗ ${ev.id}  "${ev.title}" (${ev.date}~${ev.endDate || ""}) @${ev.venueName || "미정"}\n     → ${reason}`);
  }

  if (!APPLY) {
    console.log(`\n[DRY-RUN] 실제 반영하려면 --apply 를 붙여 다시 실행하세요.`);
    return;
  }

  for (const { ev } of toDelete) {
    await db.collection("events").doc(ev.id).delete();
    console.log(`  삭제됨: ${ev.id} "${ev.title}"`);
  }
  console.log(`\n✅ 반영 완료: 삭제 ${toDelete.length}건.`);
}

main().then(() => process.exit(0)).catch((e) => { console.error("ERR", e); process.exit(1); });
