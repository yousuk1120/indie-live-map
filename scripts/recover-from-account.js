// 원본 게시물이 삭제된(포스터 불가) "다가오는" 공연을, 출처 계정 프로필을 다시 스크랩해
// 같은 공연을 가리키는 현재 게시물을 AI로 찾아 포스터를 복구합니다.
// 사용법: node scripts/recover-from-account.js
const { loadEnv, initAdmin, scrapeProfilePosts, persistToBlob } = require("./_lib");

function isFuture(ev) {
  const d = String(ev.endDate || ev.date || "").match(/(\d{4})-(\d{2})-(\d{2})/);
  return d ? new Date(`${d[0]}T23:59:59`).getTime() > Date.now() : false;
}
function needsPoster(ev) {
  const p = String(ev.posterUrl || "").trim();
  return ev.posterUnavailable || !p || /cdninstagram|fbcdn|instagram/.test(p);
}

async function main() {
  const env = loadEnv();
  const admin = initAdmin(env);
  const db = admin.firestore();
  const FieldValue = admin.firestore.FieldValue;
  const OpenAI = require("openai");
  const openai = new OpenAI.default({ apiKey: env.OPENAI_API_KEY });

  const snap = await db.collection("events").get();
  const targets = snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((e) => isFuture(e) && needsPoster(e));
  console.log(`복구 시도(다가오는, 포스터 필요): ${targets.length}개\n`);

  let recovered = 0;
  for (const ev of targets) {
    const tag = `"${ev.title}" (${ev.date})`;
    // 출처 계정 찾기
    let account = "";
    if (ev.instagramUrl) {
      const rs = await db.collection("raw_posts").where("instaLink", "==", ev.instagramUrl).limit(1).get();
      if (!rs.empty) account = rs.docs[0].data().sourceAccountName || "";
    }
    if (!account) { console.log(`⏭️  ${tag} — 출처 계정 불명, 스킵`); continue; }

    console.log(`🔎 ${tag} — @${account} 프로필 재스크랩...`);
    let posts = [];
    try { posts = await scrapeProfilePosts(env, account, 12); }
    catch (e) { console.log(`   ⚠️ 스크랩 실패: ${e.message}`); continue; }
    const withImg = posts.filter((p) => /^https?:\/\//.test(p.displayUrl));
    if (withImg.length === 0) { console.log(`   ⚠️ 이미지 있는 게시물 없음`); continue; }

    // AI로 같은 공연 게시물 인덱스 찾기 (캡션 기반, 텍스트 전용)
    const list = withImg.map((p, i) => `[${i}] ${String(p.caption || "").replace(/\s+/g, " ").slice(0, 300)}`).join("\n");
    const prompt = `아래는 @${account} 인스타그램 게시물 캡션 목록입니다.
이 중 "${ev.title}" (날짜 ${ev.date}${ev.endDate ? `~${ev.endDate}` : ""}) 공연을 안내하는 게시물의 인덱스를 고르세요.
같은 공연이 확실하지 않으면 index를 -1로 하세요. (포스터/라인업/예매 안내 글 우선)

${list}

[출력 JSON] { "index": 정수, "reason": "한 줄" }`;
    let pick = { index: -1 };
    try {
      const res = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
      });
      pick = JSON.parse(res.choices[0].message.content || "{}");
    } catch (e) { console.log(`   ⚠️ AI 매칭 실패: ${e.message}`); continue; }

    if (!Number.isInteger(pick.index) || pick.index < 0 || pick.index >= withImg.length) {
      console.log(`   ❌ 일치 게시물 없음 (${pick.reason || "현재 프로필에 해당 공연 글 없음"})`);
      continue;
    }
    const post = withImg[pick.index];
    try {
      const persisted = await persistToBlob(env, post.displayUrl);
      if (!persisted || !/blob\.vercel-storage\.com|firebasestorage/.test(persisted)) {
        console.log(`   ⚠️ 영구화 실패`); continue;
      }
      await db.collection("events").doc(ev.id).update({
        posterUrl: persisted,
        instagramUrl: post.instaLink,
        posterUnavailable: FieldValue.delete(), // 불가 표시 해제
        updatedAt: FieldValue.serverTimestamp(),
      });
      recovered++;
      console.log(`   ✅ 복구! (게시물 ${pick.index}, ${post.instaLink}) — ${pick.reason || ""}`);
    } catch (e) { console.log(`   ❌ ${e.message}`); }
  }
  console.log(`\n─── ${recovered}/${targets.length} 복구 ───`);
}
main().then(() => process.exit(0)).catch((e) => { console.error("스크립트 실패:", e); process.exit(1); });
