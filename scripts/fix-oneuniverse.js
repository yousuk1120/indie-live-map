// 원유니버스페스티벌: 밴드(크라잉넛) 공지 포스터 → 공식 포스터 + 전체 라인업으로 교체.
// @oneuniversefestival 공식 계정을 스크랩해 공식 라인업 포스터를 찾아 Blob 영구화하고,
// 비전 분석으로 날짜별 전체 라인업을 채운 뒤 posterLocked로 잠급니다.
// 사용법: node scripts/fix-oneuniverse.js
const { loadEnv, initAdmin, scrapeProfilePosts, fetchImageAsDataUrl, persistToBlob } = require("./_lib");

const OFFICIAL_ACCOUNT = "oneuniversefestival";
const TITLE_MATCH = /원유니버스|oneuniverse|one universe/i;

async function main() {
  const env = loadEnv();
  const admin = initAdmin(env);
  const db = admin.firestore();
  const FieldValue = admin.firestore.FieldValue;
  const OpenAI = require("openai");
  const openai = new OpenAI.default({ apiKey: env.OPENAI_API_KEY });

  // 1) 대상 이벤트 찾기
  const snap = await db.collection("events").get();
  const target = snap.docs.map((d) => ({ id: d.id, ...d.data() })).find((e) => TITLE_MATCH.test(String(e.title || "")));
  if (!target) {
    console.log("원유니버스 이벤트를 찾지 못했습니다.");
    return;
  }
  console.log(`대상: "${target.title}" (${target.id}) — 현재 라인업: ${target.artistNames}`);

  // 2) 공식 계정 스크랩
  console.log(`@${OFFICIAL_ACCOUNT} 스크랩 중...`);
  const posts = await scrapeProfilePosts(env, OFFICIAL_ACCOUNT, 12);
  const withImg = posts.filter((p) => /^https?:\/\//.test(p.displayUrl)).slice(0, 7);
  console.log(`이미지 있는 게시물 ${withImg.length}개 분석`);
  if (withImg.length === 0) {
    console.log("공식 계정 게시물을 가져오지 못했습니다. (Apify 한도/비공개 가능)");
    return;
  }

  // 인스타 CDN 이미지는 OpenAI가 직접 못 받으므로 우리가 내려받아 base64로 인라인 전달
  const dataUrls = [];
  for (const p of withImg) {
    try {
      dataUrls.push(await fetchImageAsDataUrl(p.displayUrl));
    } catch (e) {
      dataUrls.push("");
      console.log(`  이미지 다운로드 실패(스킵): ${e.message}`);
    }
  }

  // 3) 비전 분석: 공식 전체 라인업 포스터 선택 + 날짜별 라인업 추출
  const prompt = `당신은 페스티벌 라인업 분석 AI입니다. 아래는 'ONE UNIVERSE FESTIVAL 2026'(원유니버스페스티벌, 2026-07-25~26) 공식 인스타그램 게시물들의 캡션과 이미지입니다.
이 중에서 "전체 라인업이 모두 적힌 공식 라인업 포스터"인 게시물 하나를 골라 인덱스를 chosenIndex에 넣고,
그 포스터(및 캡션)에서 전체 출연 아티스트를 빠짐없이 추출하세요.

[규칙]
1. 날짜별(DAY1=7/25, DAY2=7/26)로 구분돼 있으면 dayLineups에 날짜별로 분류. 구분이 없으면 dayLineups는 빈 배열로 두고 artistNames에 전체를 넣으세요.
2. 어느 날인지 확실치 않은 아티스트는 dayLineups에 넣지 말고 artistNames에만 넣으세요 (추측 금지).
3. 헤드라이너/서브헤드 표기는 무시하고 팀 이름만. 가능한 한 포스터 표기 그대로(영문은 영문, 한글은 한글).
4. 라인업 포스터가 여러 장이면 가장 많은 팀이 적힌 최신 포스터를 선택.

[출력 JSON]
{ "chosenIndex": 0, "artistNames": "쉼표 구분 전체 라인업", "dayLineups": [{"date":"2026-07-25","artists":"..."},{"date":"2026-07-26","artists":"..."}], "endDate": "2026-07-26", "note":"근거 한 줄" }`;

  const content = [{ type: "text", text: prompt }];
  withImg.forEach((p, i) => {
    content.push({ type: "text", text: `\n[게시물 ${i}] 캡션: ${String(p.caption || "").slice(0, 600)}` });
    if (dataUrls[i]) content.push({ type: "image_url", image_url: { url: dataUrls[i] } });
  });

  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content }],
    response_format: { type: "json_object" },
  });
  const parsed = JSON.parse(res.choices[0].message.content || "{}");
  console.log("분석 결과:", JSON.stringify({ chosenIndex: parsed.chosenIndex, note: parsed.note }, null, 2));

  const idx = Number.isInteger(parsed.chosenIndex) && parsed.chosenIndex >= 0 && parsed.chosenIndex < withImg.length
    ? parsed.chosenIndex : 0;
  const chosenPost = withImg[idx];

  // 4) 공식 포스터 Blob 영구화
  console.log(`공식 포스터 영구화 중 (게시물 ${idx}, ${chosenPost.instaLink})...`);
  const persisted = await persistToBlob(env, chosenPost.displayUrl);
  if (!persisted || !/blob\.vercel-storage\.com|firebasestorage/.test(persisted)) {
    console.log("⚠️ 포스터 영구화 실패 — 중단 (포스터 교체 안 함)");
    return;
  }

  // 5) 라인업 정리
  const dayLineups = (Array.isArray(parsed.dayLineups) ? parsed.dayLineups : [])
    .map((d) => ({ date: String(d.date || "").trim(), artists: String(d.artists || "").trim() }))
    .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d.date) && d.artists);
  const artistNames = String(parsed.artistNames || "").trim() || target.artistNames || "";

  const update = {
    posterUrl: persisted,
    posterLocked: true, // 공식 포스터 잠금 — 밴드 공지 글이 못 덮음
    instagramUrl: chosenPost.instaLink,
    updatedAt: FieldValue.serverTimestamp(),
  };
  if (artistNames) update.artistNames = artistNames;
  if (dayLineups.length) update.dayLineups = dayLineups;
  if (parsed.endDate && /^\d{4}-\d{2}-\d{2}$/.test(parsed.endDate)) update.endDate = parsed.endDate;

  await db.collection("events").doc(target.id).update(update);
  console.log("\n✅ 원유니버스 공식 포스터+라인업 교체 완료");
  console.log("   posterUrl:", persisted.slice(0, 80));
  console.log("   artistNames:", artistNames.slice(0, 200));
  console.log("   dayLineups:", JSON.stringify(dayLineups));
}

main().then(() => process.exit(0)).catch((e) => { console.error("스크립트 실패:", e); process.exit(1); });
