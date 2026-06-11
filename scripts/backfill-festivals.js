// 페스티벌 멀티데이 백필 스크립트 (1회 실행용)
// DB의 페스티벌/멀티데이 의심 공연을 AI(포스터 비전 + 캡션)로 재분석해
// endDate / dayLineups / artistNames 를 채웁니다.
// 사용법: node scripts/backfill-festivals.js

const fs = require("fs");
const path = require("path");

function loadEnvLocal() {
  const content = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8");
  const env = {};
  for (const line of content.split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (!match) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    env[match[1]] = value;
  }
  return env;
}

const env = loadEnvLocal();

// ─── 유틸 ───

function normalizeDate(value) {
  if (!value) return "";
  const m = String(value).match(/(\d{2,4})[./-](\d{1,2})[./-](\d{1,2})/);
  if (!m) return "";
  const year = m[1].length === 2 ? `20${m[1]}` : m[1];
  return `${year}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
}

function splitArtists(value) {
  return String(value || "").split(/[,/|·]+/).map((a) => a.trim()).filter(Boolean);
}

function mergeArtists(a, b) {
  const seen = new Set();
  const out = [];
  for (const artist of [...splitArtists(a), ...splitArtists(b)]) {
    const key = artist.toLowerCase().replace(/[\s\-_.,!?'"()\[\]]/g, "");
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(artist);
  }
  return out.join(", ");
}

// 페스티벌 의심 판정: 제목 키워드 또는 출연진 8팀 이상
const FEST_PATTERN = /페스티벌|festival|페스타|festa|펜타포트|pentaport|캠프|camp|dmz|디엠지|피스트레인|peacetrain|jumf|점프|뮤직위크|록\s?페|rock\s?fes/i;

// 사용자 확인 정보(권위 있는 날짜) — AI 실패 시 폴백
const KNOWN_FESTIVALS = [
  { keys: ["dmz", "디엠지", "피스트레인", "peacetrain"], start: "2026-06-12", end: "2026-06-14" },
  { keys: ["jumf", "점프", "전주얼티밋"], start: "2026-08-14", end: "2026-08-16" },
];

function knownRange(title) {
  const t = String(title || "").toLowerCase();
  for (const fest of KNOWN_FESTIVALS) {
    if (fest.keys.some((k) => t.includes(k))) return fest;
  }
  return null;
}

async function main() {
  const projectId = env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const { initializeApp, cert } = require("firebase-admin/app");
  const { getFirestore, FieldValue } = require("firebase-admin/firestore");
  const OpenAI = require("openai");

  initializeApp({
    credential: cert({
      projectId,
      clientEmail: env.FIREBASE_CLIENT_EMAIL,
      privateKey: env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
    }),
  });
  const db = getFirestore();
  const openai = new OpenAI.default({ apiKey: env.OPENAI_API_KEY });

  const snap = await db.collection("events").get();
  const events = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  console.log(`전체 공연 ${events.length}개 로드`);

  // 대상: 페스티벌 의심 + (endDate 없음 또는 dayLineups 없음)
  const targets = events.filter((ev) => {
    const festish = FEST_PATTERN.test(ev.title || "") || splitArtists(ev.artistNames).length >= 8;
    const incomplete = !ev.endDate || !(Array.isArray(ev.dayLineups) && ev.dayLineups.length > 0);
    return festish && incomplete && normalizeDate(ev.date);
  });
  console.log(`백필 대상 ${targets.length}개:`, targets.map((t) => t.title).join(" | "));

  for (const ev of targets) {
    try {
      // 인스타 캡션 찾기
      let caption = "";
      if (ev.instagramUrl) {
        const rawSnap = await db.collection("raw_posts").where("instaLink", "==", ev.instagramUrl).limit(1).get();
        if (!rawSnap.empty) caption = rawSnap.docs[0].data().caption || "";
      }

      const prompt = `
당신은 페스티벌 포스터/라인업 분석 AI입니다. 아래 공연의 정보(와 포스터 이미지가 있다면 이미지)를 분석해
"종료 날짜"와 "날짜별 라인업"을 추출하세요. 연도가 없으면 2026년입니다.

[공연 정보]
- 제목: ${ev.title || ""}
- 시작일: ${ev.date || ""}
- 알려진 전체 라인업: ${ev.artistNames || "(없음)"}
${caption ? `- 인스타 캡션:\n${caption.slice(0, 2000)}` : ""}

[규칙]
1. 날짜별 라인업이 구분돼 있으면 그대로 분류. 어느 날인지 모르는 아티스트는 넣지 말 것(추측 금지).
2. 여러 날 진행이면 endDate에 마지막 날짜.
3. 정보가 없으면 빈 값으로.

[출력 JSON]
{ "endDate": "YYYY-MM-DD 또는 \\"\\"", "dayLineups": [{ "date": "YYYY-MM-DD", "artists": "쉼표 구분" }] }
`;

      const content = [{ type: "text", text: prompt }];
      if (ev.posterUrl && /^https?:\/\//.test(ev.posterUrl)) {
        content.push({ type: "image_url", image_url: { url: ev.posterUrl } });
      }

      let parsed = {};
      try {
        const res = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [{ role: "user", content }],
          response_format: { type: "json_object" },
        });
        parsed = JSON.parse(res.choices[0].message.content || "{}");
      } catch (visionErr) {
        console.warn(`  [${ev.title}] 이미지 분석 실패 → 텍스트만 재시도`);
        const res = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [{ role: "user", content: prompt }],
          response_format: { type: "json_object" },
        });
        parsed = JSON.parse(res.choices[0].message.content || "{}");
      }

      const start = normalizeDate(ev.date);
      let endDate = normalizeDate(parsed.endDate);
      let dayLineups = (Array.isArray(parsed.dayLineups) ? parsed.dayLineups : [])
        .map((d) => ({ date: normalizeDate(d?.date), artists: String(d?.artists || "").trim() }))
        .filter((d) => d.date && d.artists);

      // 권위 있는 날짜 폴백 (사용자 확인 정보)
      const known = knownRange(ev.title);
      if (known) {
        if (!endDate || endDate <= start) endDate = known.end;
        // 시작일이 알려진 시작일과 다르면 교정
        if (start !== known.start) {
          console.log(`  [${ev.title}] 시작일 교정: ${start} → ${known.start}`);
        }
      }

      if (!endDate && dayLineups.length > 1) {
        endDate = dayLineups.map((d) => d.date).sort().reverse()[0];
      }

      if (!endDate && dayLineups.length === 0) {
        console.log(`  [${ev.title}] 분석 결과 없음 → 건너뜀`);
        continue;
      }

      let artistNames = ev.artistNames || "";
      for (const day of dayLineups) artistNames = mergeArtists(artistNames, day.artists);

      const update = {
        updatedAt: FieldValue.serverTimestamp(),
      };
      if (known && start !== known.start) update.date = known.start;
      if (endDate && endDate > (update.date || start)) update.endDate = endDate;
      if (dayLineups.length) update.dayLineups = dayLineups;
      if (artistNames) update.artistNames = artistNames;

      await db.collection("events").doc(ev.id).update(update);
      console.log(`  ✅ [${ev.title}] endDate=${update.endDate || "(유지)"} dayLineups=${dayLineups.length}일`);
    } catch (error) {
      console.error(`  ❌ [${ev.title}] 실패:`, error.message);
    }
  }

  // 검증: 업데이트 결과 다시 읽기
  console.log("\n─── 검증 (페스티벌 의심 공연 현황) ───");
  const after = await db.collection("events").get();
  for (const d of after.docs) {
    const ev = d.data();
    if (FEST_PATTERN.test(ev.title || "")) {
      console.log(`  ${ev.title}: ${ev.date}${ev.endDate ? ` ~ ${ev.endDate}` : " (단일)"} / 날짜별 라인업 ${Array.isArray(ev.dayLineups) ? ev.dayLineups.length : 0}일`);
    }
  }
}

main().then(() => process.exit(0)).catch((e) => {
  console.error("스크립트 실패:", e);
  process.exit(1);
});
