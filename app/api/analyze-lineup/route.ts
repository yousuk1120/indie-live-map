import { NextResponse } from "next/server";
import OpenAI from "openai";
import { verifyAdminRequest } from "@/lib/api-auth";
import {
  normalizeDateString,
  mergeDayLineups,
  mergeArtistNames,
  type DayLineup,
} from "@/lib/event-merge";

// 페스티벌 날짜별 라인업 분석 (관리자 전용)
// 포스터 이미지(비전) + 인스타 캡션을 함께 분석해 endDate / dayLineups를 추출하고
// 기존 events 문서에 병합 업데이트합니다.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  const auth = await verifyAdminRequest(req);
  if (!auth.ok) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
  }

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ success: false, error: "OPENAI_API_KEY 미설정" }, { status: 500 });
  }

  try {
    const { eventId } = await req.json();
    if (!eventId) {
      return NextResponse.json({ success: false, error: "eventId가 필요합니다." }, { status: 400 });
    }

    const { getAdminDb } = await import("@/lib/firebase/admin");
    const { FieldValue } = await import("firebase-admin/firestore");
    const db = await getAdminDb();
    if (!db || !db.collection) {
      return NextResponse.json({ success: false, error: "Firebase Admin 초기화 실패" }, { status: 500 });
    }

    const snap = await db.collection("events").doc(eventId).get();
    if (!snap.exists) {
      return NextResponse.json({ success: false, error: "공연을 찾을 수 없습니다." }, { status: 404 });
    }
    const ev = snap.data();

    // 원본 인스타 캡션 찾기 (수집 시 저장된 raw_posts에서)
    let caption = "";
    if (ev.instagramUrl) {
      const rawSnap = await db
        .collection("raw_posts")
        .where("instaLink", "==", ev.instagramUrl)
        .limit(1)
        .get();
      if (!rawSnap.empty) caption = rawSnap.docs[0].data().caption || "";
    }

    const prompt = `
당신은 페스티벌 포스터/라인업 분석 AI입니다. 아래 공연의 포스터 이미지와 정보를 분석해
"날짜별 라인업"과 "종료 날짜"를 추출하세요.

★ 연도 규칙: 현재 기준 연도는 2026년입니다. 연도가 없으면 2026년으로 간주하세요.

[공연 정보]
- 제목: ${ev.title || ""}
- 시작일: ${ev.date || ""}
- 알려진 종료일: ${ev.endDate || "(없음)"}
- 알려진 전체 라인업: ${ev.artistNames || "(없음)"}
${caption ? `- 인스타 원문 캡션:\n${caption.slice(0, 2000)}` : ""}

[규칙]
1. 포스터 이미지에 날짜별(DAY 1/2/3, 날짜, 요일별) 라인업이 구분돼 있으면 그대로 분류하세요.
2. 캡션에 날짜별 구분이 있으면 함께 활용하세요.
3. 어느 날 출연인지 알 수 없는 아티스트는 dayLineups에 넣지 마세요 (추측 금지).
4. 여러 날 진행되는 공연이면 endDate에 마지막 날짜를 넣으세요.

[출력 JSON — 반드시 이 형태]
{
  "endDate": "YYYY-MM-DD (하루짜리거나 알 수 없으면 \\"\\")",
  "dayLineups": [{ "date": "YYYY-MM-DD", "artists": "그날 라인업, 쉼표 구분" }],
  "note": "분석 근거 한 줄"
}
`;

    const content: Array<
      | { type: "text"; text: string }
      | { type: "image_url"; image_url: { url: string } }
    > = [{ type: "text", text: prompt }];

    if (ev.posterUrl && /^https?:\/\//.test(ev.posterUrl)) {
      content.push({ type: "image_url", image_url: { url: ev.posterUrl } });
    }
    if (ev.timetableImageUrl && /^https?:\/\//.test(ev.timetableImageUrl)) {
      content.push({ type: "image_url", image_url: { url: ev.timetableImageUrl } });
    }

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    let parsed: { endDate?: string; dayLineups?: DayLineup[]; note?: string } = {};
    try {
      const aiRes = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content }],
        response_format: { type: "json_object" },
      });
      parsed = JSON.parse(aiRes.choices[0].message.content || "{}");
    } catch (visionError) {
      // 이미지 URL 만료 등으로 비전 호출 실패 시 텍스트만으로 재시도
      console.warn("[analyze-lineup] 이미지 분석 실패, 텍스트만 재시도:", visionError);
      const aiRes = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
      });
      parsed = JSON.parse(aiRes.choices[0].message.content || "{}");
    }

    const startDate = normalizeDateString(ev.date);
    const newEndDate = normalizeDateString(parsed.endDate);
    const newDayLineups = (Array.isArray(parsed.dayLineups) ? parsed.dayLineups : [])
      .map((d) => ({ date: normalizeDateString(d?.date), artists: String(d?.artists || "").trim() }))
      .filter((d) => d.date && d.artists);

    if (!newEndDate && newDayLineups.length === 0) {
      return NextResponse.json({
        success: true,
        updated: false,
        message: "분석 결과 날짜별 라인업/종료일을 찾지 못했습니다." + (parsed.note ? ` (${parsed.note})` : ""),
      });
    }

    // 기존 데이터와 병합 (추출 결과가 기존 정보를 지우지 않도록)
    const mergedDayLineups = mergeDayLineups(ev.dayLineups || [], newDayLineups);
    let artistNames = ev.artistNames || "";
    for (const day of mergedDayLineups) {
      artistNames = mergeArtistNames(artistNames, day.artists);
    }
    const finalEndDate =
      [normalizeDateString(ev.endDate), newEndDate].filter(Boolean).sort().reverse()[0] || "";

    await db.collection("events").doc(eventId).update({
      ...(finalEndDate && finalEndDate > startDate ? { endDate: finalEndDate } : {}),
      ...(mergedDayLineups.length ? { dayLineups: mergedDayLineups } : {}),
      ...(artistNames ? { artistNames } : {}),
      updatedAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({
      success: true,
      updated: true,
      data: { endDate: finalEndDate, dayLineups: mergedDayLineups },
      message: `분석 완료: ${mergedDayLineups.length}개 날짜 라인업${finalEndDate ? `, 종료일 ${finalEndDate}` : ""}`,
    });
  } catch (error: any) {
    console.error("[analyze-lineup] 오류:", error);
    return NextResponse.json({ success: false, error: error?.message || "분석 실패" }, { status: 500 });
  }
}
