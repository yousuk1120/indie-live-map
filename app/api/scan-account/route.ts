import { NextResponse } from "next/server";
import OpenAI from "openai";
import { verifyAdminRequest } from "@/lib/api-auth";
import { buildEventExtractionPrompt, sanitizeParsedEvent } from "@/lib/ai-event-prompt";
import {
  type ConcertRecord,
  hasMinimumEventInfo,
  isSameConcert,
  mergeConcerts,
  normalizeDateString,
  extractDateRange,
} from "@/lib/event-merge";
import { canonicalVenueName, venueForAccount } from "@/lib/venues";
import { persistPosterImage } from "@/lib/poster";
import { isKoreanEvent } from "@/lib/events";
import { alertApiError, sendAdminAlert } from "@/lib/notify-admin";
import { notifyNewEventFromRecord, notifyMergedEventNewArtists } from "@/lib/push-new-event";

// 아티스트/계정 하나를 "깊게" 훑어 앞으로 열릴 공연을 전부 수집합니다.
// 크론은 계정마다 최근 게시물에서 "가장 좋은 1건"만 뽑지만, 여기서는 게시물마다 개별
// 추출해 그 계정의 예정 공연을 빠짐없이 등록합니다. (새 아티스트 추가 시 백필용)
//
// 인증: 관리자 ID 토큰(Authorization: Bearer) 또는 ?secret=CRON_SECRET.
// 호출: POST { accountName, category?, limit? }  또는  GET ?account=..&category=..&limit=..&secret=..
export const dynamic = "force-dynamic";
export const maxDuration = 300;

async function authorize(req: Request, params: URLSearchParams): Promise<{ ok: boolean; status?: number; error?: string }> {
  const secret = params.get("secret");
  if (process.env.CRON_SECRET && secret === process.env.CRON_SECRET) return { ok: true };
  const admin = await verifyAdminRequest(req);
  return admin.ok ? { ok: true } : { ok: false, status: admin.status, error: admin.error };
}

export async function POST(req: Request) {
  return handle(req);
}
export async function GET(req: Request) {
  return handle(req);
}

async function handle(req: Request) {
  const { searchParams } = new URL(req.url);
  const auth = await authorize(req, searchParams);
  if (!auth.ok) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status || 401 });

  let accountName = searchParams.get("account") || "";
  let category = searchParams.get("category") || "밴드";
  let limit = Math.min(Number(searchParams.get("limit")) || 12, 24);
  // 새 아티스트/소스 추가 신호(관리자 UI가 백필 시 함께 보냄) + 표시용 이름(선택).
  let notifyNew = searchParams.get("notifyNew") === "1" || searchParams.get("notifyNew") === "true";
  let artistName = searchParams.get("artistName") || "";
  if (req.method === "POST") {
    try {
      const b = await req.json();
      if (b.accountName) accountName = String(b.accountName);
      if (b.category) category = String(b.category);
      if (b.limit) limit = Math.min(Number(b.limit) || limit, 24);
      if (b.notifyNew) notifyNew = Boolean(b.notifyNew);
      if (b.artistName) artistName = String(b.artistName);
    } catch {
      /* 본문 없으면 쿼리 파라미터 사용 */
    }
  }
  accountName = accountName.trim().replace(/^@/, "").replace(/[^a-zA-Z0-9._]/g, "");
  if (!accountName) return NextResponse.json({ success: false, error: "account(accountName)가 필요합니다." }, { status: 400 });
  if (!process.env.APIFY_API_TOKEN || !process.env.OPENAI_API_KEY) {
    return NextResponse.json({ success: false, error: "APIFY/OPENAI 환경변수 누락" }, { status: 500 });
  }

  try {
    const { getAdminDb } = await import("@/lib/firebase/admin");
    const { FieldValue } = await import("firebase-admin/firestore");
    const db = await getAdminDb();
    if (!db || !db.collection) {
      return NextResponse.json({ success: false, error: "Firebase Admin 초기화 실패" }, { status: 500 });
    }

    // 소스 계정 등록(없으면 추가) — "추가 + 백필"을 한 번에.
    const srcSnap = await db
      .collection("source_accounts")
      .where("accountName", "==", accountName)
      .limit(1)
      .get();
    let sourceRef;
    let alreadyNotified = false;
    if (srcSnap.empty) {
      sourceRef = await db.collection("source_accounts").add({
        accountName,
        category,
        isActive: true,
        createdAt: FieldValue.serverTimestamp(),
      });
    } else {
      const existing = srcSnap.docs[0];
      sourceRef = existing.ref;
      category = existing.data().category || category;
      alreadyNotified = Boolean(existing.data().newSourceNotifiedAt);
    }

    // 새 아티스트/소스가 추가되면 관리자에게 알림(계정당 한 번만).
    // 서버가 방금 만들었거나(관리자 아닌 직접 호출) 관리자 UI가 notifyNew=true 를 보낸 경우 발송.
    // 스크랩 성공 여부와 무관하게 먼저 알리도록, 무거운 Apify 호출 전에 처리합니다.
    if ((srcSnap.empty || notifyNew) && !alreadyNotified) {
      const label = artistName ? `${artistName} · @${accountName}` : `@${accountName}`;
      const siteUrl = process.env.ALERT_SITE_URL || "";
      await sendAdminAlert("🆕 새 아티스트 추가됨", [
        `${label}  [${category}]`,
        `https://www.instagram.com/${accountName}/`,
        siteUrl ? `관리자: ${siteUrl.replace(/\/$/, "")}/admin` : "",
      ]);
      await sourceRef.update({ newSourceNotifiedAt: FieldValue.serverTimestamp() }).catch(() => {});
    }

    // 계정 게시물 깊게 스크랩
    const apifyRes = await fetch(
      `https://api.apify.com/v2/acts/apify~instagram-profile-scraper/run-sync-get-dataset-items?token=${process.env.APIFY_API_TOKEN}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ usernames: [accountName], resultsLimit: limit }),
      }
    );
    if (!apifyRes.ok) return NextResponse.json({ success: false, error: `Apify ${apifyRes.status}` }, { status: 502 });
    const data = await apifyRes.json();
    const profile = Array.isArray(data) ? data[0] : null;
    const posts = (profile?.latestPosts ?? [])
      .slice(0, limit)
      .map((p: any) => ({
        instaLink: p.url ?? `https://www.instagram.com/p/${p.shortCode}/`,
        caption: p.caption ?? "",
        posterUrl: p.displayUrl ?? p.thumbnailUrl ?? "",
      }));
    if (posts.length === 0) return NextResponse.json({ success: true, account: accountName, scanned: 0, message: "게시물이 없습니다." });

    const existingSnap = await db.collection("events").get();
    const existingEvents: ConcertRecord[] = existingSnap.docs.map((d: any) => ({ id: d.id, ...d.data() }));
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const isOfficialFestival = category === "페스티벌";
    // 오늘(KST) 이전에 끝난 공연은 "예정 공연"이 아니므로 제외 —
    // AI 프롬프트는 연도만 알고 오늘 날짜를 몰라, 지난 공연을 걸러내지 못하기 때문.
    const todayKST = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);

    let added = 0, merged = 0, queued = 0, skipped = 0;
    const results: Array<{ title: string; status: string }> = [];

    for (const p of posts) {
      // 게시물마다 개별 추출 (크론의 "계정당 1건 선택"과 달리 모든 예정 공연을 잡기 위함)
      let parsed;
      try {
        const aiRes = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [{ role: "user", content: buildEventExtractionPrompt(`[게시물 0]\n- 캡션: ${p.caption}`, accountName) }],
          response_format: { type: "json_object" },
        });
        parsed = sanitizeParsedEvent(JSON.parse(aiRes.choices[0].message.content || "{}"));
      } catch {
        skipped++;
        continue;
      }

      // 원본 게시물 기록(크론 중복 재처리 방지) — 이미 있으면 스킵
      const existRaw = await db.collection("raw_posts").where("instaLink", "==", p.instaLink).limit(1).get();
      if (existRaw.empty) {
        await db.collection("raw_posts").add({
          sourceAccountName: accountName,
          instaLink: p.instaLink,
          caption: p.caption,
          posterUrl: p.posterUrl,
          fetchedAt: FieldValue.serverTimestamp(),
        });
      }

      if (parsed.chosenIndex === -1 || !hasMinimumEventInfo(parsed)) {
        skipped++;
        continue;
      }

      const range = extractDateRange(parsed.date);
      const incoming: ConcertRecord = {
        title: parsed.title,
        date: range.start || normalizeDateString(parsed.date),
        endDate: normalizeDateString(parsed.endDate) || range.end,
        time: parsed.time,
        venueName:
          canonicalVenueName(parsed.venueName) || (category === "공연장" ? venueForAccount(accountName) : ""),
        artistNames: parsed.artistNames,
        sourceUrl: parsed.ticketUrl,
        instagramUrl: p.instaLink,
        price: parsed.price,
        // 대표 이미지가 실제 포스터일 때만 사용 (티켓정보/타임테이블/안내카드면 비움)
        posterUrl: parsed.imageIsPoster === false ? "" : await persistPosterImage(p.posterUrl || ""),
        ticketOpenAt: parsed.ticketOpenAt || "",
        dayLineups: parsed.dayLineups
          .map((d) => ({ date: normalizeDateString(d.date), artists: d.artists }))
          .filter((d) => d.date),
      };

      if (!isKoreanEvent(incoming as any)) {
        skipped++;
        continue;
      }

      // 지난 공연 제외 (종료일 기준). 예정 공연만 백필.
      const evStart = incoming.date || "";
      const evEnd = (incoming.endDate && incoming.endDate >= evStart ? incoming.endDate : evStart) || "";
      if (evEnd && evEnd < todayKST) {
        skipped++;
        continue;
      }

      const matched = existingEvents.find((ev) => isSameConcert(ev, incoming));
      if (matched && matched.id) {
        // 병합 전 라인업 스냅샷 — 새로 추가된 아티스트만 알림 대상으로 삼기 위함
        const beforeMerge = { artistNames: matched.artistNames, dayLineups: matched.dayLineups };
        const mergedRec = mergeConcerts(matched, incoming, { incomingIsOfficial: isOfficialFestival });
        await db.collection("events").doc(matched.id).update({ ...mergedRec, updatedAt: FieldValue.serverTimestamp() });
        Object.assign(matched, mergedRec);
        merged++;
        results.push({ title: mergedRec.title || "", status: "merged" });
        // 기존 공연에 관심 아티스트가 라인업으로 새로 추가되면 그 아티스트만 알림
        await notifyMergedEventNewArtists(beforeMerge, mergedRec, matched.id);
      } else if (incoming.venueName) {
        const payload = {
          title: incoming.title,
          date: incoming.date,
          endDate: incoming.endDate || "",
          time: incoming.time || "",
          venueName: incoming.venueName,
          artistNames: incoming.artistNames || "",
          sourceUrl: incoming.sourceUrl || "",
          instagramUrl: incoming.instagramUrl || "",
          price: incoming.price || "",
          posterUrl: incoming.posterUrl || "",
          ...(isOfficialFestival && incoming.posterUrl ? { posterLocked: true } : {}),
          ticketOpenAt: incoming.ticketOpenAt || "",
          dayLineups: incoming.dayLineups || [],
          createdAt: FieldValue.serverTimestamp(),
          autoPublished: true,
        };
        const ref = await db.collection("events").add(payload);
        existingEvents.push({ id: ref.id, ...payload });
        added++;
        results.push({ title: incoming.title || "", status: "added" });
        // 좋아요(관심) 아티스트가 출연하면 구독자에게 새 공연 푸시 (실패해도 백필 흐름 유지)
        await notifyNewEventFromRecord(incoming, ref.id);
      } else {
        // 장소 누락 → 승인 큐
        await db.collection("candidate_events").add({
          sourceAccountName: accountName,
          instaLink: p.instaLink,
          caption: p.caption,
          posterUrl: p.posterUrl,
          parsedTitle: incoming.title || "",
          parsedDate: incoming.date || "",
          parsedEndDate: incoming.endDate || "",
          parsedTime: incoming.time || "",
          parsedVenue: "",
          parsedArtists: incoming.artistNames || "",
          parsedTicket: incoming.sourceUrl || "",
          parsedPrice: incoming.price || "",
          parsedDayLineups: incoming.dayLineups || [],
          confidence: 0.9,
          notes: "scan-account: 장소 정보 누락으로 수동 승인 필요",
          createdAt: FieldValue.serverTimestamp(),
        });
        queued++;
        results.push({ title: incoming.title || "", status: "queued" });
      }
    }

    return NextResponse.json({
      success: true,
      account: accountName,
      scanned: posts.length,
      added,
      merged,
      queued,
      skipped,
      results,
    });
  } catch (error: any) {
    await alertApiError("scan-account", error, `account=${accountName}`);
    return NextResponse.json({ success: false, error: error?.message || "스캔 실패" }, { status: 500 });
  }
}
