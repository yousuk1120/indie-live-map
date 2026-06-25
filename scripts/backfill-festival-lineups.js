// 라인업이 빈약한 국내 페스티벌의 포스터 이미지를 비전 분석해 누락된 출연 아티스트를
// artistNames / dayLineups에 채웁니다. (포스터에 라인업이 다 적혀 있는데 데이터엔 빠진 경우)
// 기존 라인업은 지우지 않고 합집합으로 누적합니다.
// 사용법: node scripts/backfill-festival-lineups.js
const { loadEnv, initAdmin, fetchImageAsDataUrl } = require("./_lib");

const FEST_PATTERN = /페스티벌|festival|페스타|festa|펜타포트|pentaport|캠프|camp|dmz|디엠지|jumf|뮤직위크|록\s?페|rock\s?fes|위크앤드|weekend|팔레트|palette|패치룸|patchroom|어쩌다|영희|잔다리|zandari/i;

function splitArtists(v) {
  return String(v || "").split(/[,/|·]+/).map((a) => a.trim()).filter(Boolean);
}
function keyOf(name) {
  return name.toLowerCase().replace(/[\s\-_.,!?'"()\[\]]/g, "");
}
function mergeArtists(...lists) {
  const seen = new Set(), out = [];
  for (const list of lists) for (const a of splitArtists(list)) {
    const k = keyOf(a);
    if (!k || seen.has(k)) continue;
    seen.add(k); out.push(a);
  }
  return out.join(", ");
}
function uniqueCount(ev) {
  const all = [ev.artistNames, ...((ev.dayLineups || []).map((d) => d.artists))];
  return new Set(splitArtists(mergeArtists(...all)).map(keyOf)).size;
}
function normDate(v) {
  const m = String(v || "").match(/(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : "";
}

async function main() {
  const env = loadEnv();
  const admin = initAdmin(env);
  const db = admin.firestore();
  const FieldValue = admin.firestore.FieldValue;
  const OpenAI = require("openai");
  const openai = new OpenAI.default({ apiKey: env.OPENAI_API_KEY });

  const snap = await db.collection("events").get();
  const all = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

  // 대상: 페스티벌(제목 키워드 또는 멀티데이) + 라인업 빈약(<8팀) + 포스터 있음
  const targets = all.filter((ev) => {
    const isFest = FEST_PATTERN.test(String(ev.title || "")) || (ev.endDate && ev.endDate > ev.date);
    const poster = String(ev.posterUrl || "").trim();
    return isFest && poster && !ev.posterUnavailable && uniqueCount(ev) < 8;
  });

  console.log(`라인업 백필 대상 ${targets.length}개:`);
  targets.forEach((t) => console.log(`  · "${t.title}" (현재 ${uniqueCount(t)}팀)`));
  console.log("");

  let updated = 0;
  for (const ev of targets) {
    const tag = `"${ev.title}"`;
    try {
      let dataUrl;
      try {
        dataUrl = await fetchImageAsDataUrl(ev.posterUrl, env.BLOB_READ_WRITE_TOKEN);
      } catch (e) {
        console.log(`  ⚠️ ${tag} 포스터 다운로드 실패(${e.message}) → 스킵`);
        continue;
      }

      const prompt = `당신은 페스티벌 라인업 분석 AI입니다. 첨부된 "${ev.title}" 포스터 이미지를 보고 출연 아티스트를 빠짐없이 읽어내세요.
시작일 ${ev.date}${ev.endDate ? ` ~ 종료일 ${ev.endDate}` : ""}. 연도 없으면 2026년.

[규칙]
1. 포스터에 적힌 모든 팀(헤드라이너~신인) 이름을 artistNames에 쉼표로 나열. 표기는 포스터 그대로(영문/한글).
2. DAY1/DAY2/날짜·요일로 구분돼 있으면 dayLineups에 날짜별 분류. 구분 없으면 dayLineups는 빈 배열.
3. 어느 날인지 불확실하면 dayLineups에 넣지 말고 artistNames에만 (추측 금지).
4. 장소명·스폰서·"○○ ARTISTS" 같은 문구는 아티스트가 아님 — 제외.
5. 포스터에 라인업이 안 보이면 모두 빈 값.

[출력 JSON] { "artistNames": "쉼표 구분", "dayLineups": [{"date":"YYYY-MM-DD","artists":"..."}], "endDate": "YYYY-MM-DD 또는 \\"\\"", "note": "한 줄" }`;

      const res = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: [
          { type: "text", text: prompt },
          { type: "image_url", image_url: { url: dataUrl } },
        ] }],
        response_format: { type: "json_object" },
      });
      const parsed = JSON.parse(res.choices[0].message.content || "{}");

      const newDayLineups = (Array.isArray(parsed.dayLineups) ? parsed.dayLineups : [])
        .map((d) => ({ date: normDate(d.date), artists: String(d.artists || "").trim() }))
        .filter((d) => d.date && d.artists);

      // 병합 (기존 보존)
      const byDate = new Map();
      for (const d of [...(ev.dayLineups || []), ...newDayLineups]) {
        const k = normDate(d.date); if (!k || !d.artists) continue;
        byDate.set(k, byDate.has(k) ? mergeArtists(byDate.get(k), d.artists) : d.artists);
      }
      const mergedDayLineups = [...byDate.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([date, artists]) => ({ date, artists }));
      const mergedArtists = mergeArtists(ev.artistNames, parsed.artistNames, ...mergedDayLineups.map((d) => d.artists));

      const before = uniqueCount(ev);
      const after = new Set(splitArtists(mergedArtists).map(keyOf)).size;

      if (after <= before) {
        console.log(`  – ${tag} 새 아티스트 없음 (${before}팀 유지) ${parsed.note ? `[${parsed.note}]` : ""}`);
        continue;
      }

      const update = { artistNames: mergedArtists, updatedAt: FieldValue.serverTimestamp() };
      if (mergedDayLineups.length) update.dayLineups = mergedDayLineups;
      const endDate = [normDate(ev.endDate), normDate(parsed.endDate)].filter(Boolean).sort().reverse()[0];
      if (endDate && endDate > normDate(ev.date)) update.endDate = endDate;

      await db.collection("events").doc(ev.id).update(update);
      updated++;
      console.log(`  ✅ ${tag} ${before}→${after}팀${update.endDate ? ` / 종료일 ${update.endDate}` : ""}`);
    } catch (e) {
      console.log(`  ❌ ${tag} 실패: ${e.message}`);
    }
  }

  console.log(`\n─── ${updated}/${targets.length}개 라인업 보강 완료 ───`);
}

main().then(() => process.exit(0)).catch((e) => { console.error("스크립트 실패:", e); process.exit(1); });
