// 누락(빈)·만료위험(인스타 CDN) 포스터를 Apify 재스크랩 + Blob 영구화로 복구합니다.
// 사용법: node scripts/recover-posters.js
//
// 근본 원인: 인스타그램 CDN URL(scontent-*.cdninstagram.com / *.fbcdn.net)은
// 서명된 임시 URL이라 며칠 뒤 만료 → 이미지가 조용히 404가 됩니다.
// 수집 당시 Blob 영구화에 실패(스토어 미설정/권한)했던 항목이 만료 URL로 남아 있던 것.
const { loadEnv, initAdmin, scrapePostDetail, persistToBlob } = require("./_lib");

function needsRecovery(ev) {
  if (ev.posterUnavailable) return false; // 원본 게시물 삭제로 복구 불가 표시됨 → 스킵
  const p = String(ev.posterUrl || "").trim();
  if (!p) return true; // 없음
  return /cdninstagram|fbcdn|instagram/.test(p); // 만료위험 인스타 URL
}

async function main() {
  const env = loadEnv();
  const admin = initAdmin(env);
  const db = admin.firestore();
  const FieldValue = admin.firestore.FieldValue;

  const snap = await db.collection("events").get();
  const targets = snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((ev) => needsRecovery(ev) && String(ev.instagramUrl || "").trim());

  console.log(`복구 대상 ${targets.length}개 (빈 포스터 또는 인스타 만료 URL)\n`);

  let recovered = 0;
  const failures = [];
  for (let i = 0; i < targets.length; i++) {
    const ev = targets[i];
    const tag = `[${i + 1}/${targets.length}] "${ev.title}"`;
    try {
      let scraped = "";
      let notFound = false;
      try {
        const detail = await scrapePostDetail(env, ev.instagramUrl);
        scraped = detail.image;
        notFound = detail.notFound;
      } catch (scrapeErr) {
        console.log(`${tag} ⚠️  스크랩 오류(${scrapeErr.message}) → 기존 URL 폴백 시도`);
      }
      // 재스크랩이 비면, 기존에 저장된 인스타 CDN URL이 아직 살아 있으면 그걸 영구화 (폴백)
      if (!scraped && !notFound && /^https?:\/\//.test(String(ev.posterUrl || ""))) {
        scraped = ev.posterUrl;
        console.log(`${tag} ↩️  기존 인스타 URL로 폴백`);
      }
      if (!scraped) {
        // 원본 게시물이 삭제된 경우 영구 표시 → 이후 크론/스크립트가 재시도하지 않음 (Apify 낭비 방지)
        if (notFound) {
          await db.collection("events").doc(ev.id).update({
            posterUnavailable: true,
            updatedAt: FieldValue.serverTimestamp(),
          });
        }
        failures.push({ ev, reason: notFound ? "원본 게시물 삭제됨(복구 불가) → posterUnavailable 표시" : "스크랩 결과 없음 + 폴백 URL 없음" });
        console.log(`${tag} ⚠️  ${notFound ? "원본 삭제(복구 불가)" : "스크랩 실패(폴백 불가)"}`);
        continue;
      }
      const persisted = await persistToBlob(env, scraped);
      if (!persisted || /cdninstagram|fbcdn|instagram/.test(persisted)) {
        failures.push({ ev, reason: "영구화 실패(원본 URL 유지)" });
        console.log(`${tag} ⚠️  영구화 실패`);
        continue;
      }
      await db.collection("events").doc(ev.id).update({
        posterUrl: persisted,
        updatedAt: FieldValue.serverTimestamp(),
      });
      recovered++;
      console.log(`${tag} ✅ 복구 완료`);
    } catch (e) {
      failures.push({ ev, reason: e.message });
      console.log(`${tag} ❌ ${e.message}`);
    }
  }

  console.log(`\n─── 결과: ${recovered}/${targets.length} 복구 ───`);
  if (failures.length) {
    console.log("실패 항목:");
    for (const f of failures) console.log(`  · "${f.ev.title}" — ${f.reason}\n    insta: ${f.ev.instagramUrl}`);
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error("스크립트 실패:", e); process.exit(1); });
