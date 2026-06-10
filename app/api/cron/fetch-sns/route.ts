import { NextResponse } from "next/server";
import OpenAI from "openai";
import { buildEventExtractionPrompt, sanitizeParsedEvent } from "@/lib/ai-event-prompt";
import {
  type ConcertRecord,
  hasMinimumEventInfo,
  isSameConcert,
  mergeConcerts,
  normalizeDateString,
} from "@/lib/event-merge";

// 빌드 타임에 정적 처리 금지 — 항상 런타임에서만 실행
export const dynamic = "force-dynamic";

// Vercel Cron Job 또는 외부 스케줄러에서 GET으로 호출합니다.
// 보안을 위해 CRON_SECRET 과 일치하는 secret 파라미터가 있어야 실행됩니다.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const querySecret = searchParams.get("secret");
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  const isAuthorized =
    !!cronSecret &&
    (querySecret === cronSecret || authHeader === `Bearer ${cronSecret}`);

  if (!isAuthorized) {
    console.error("[CRON] 인증 실패 - secret 불일치 또는 CRON_SECRET 환경변수 미설정");
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  // 환경변수 사전 검증
  if (!process.env.APIFY_API_TOKEN) {
    console.error("[CRON] APIFY_API_TOKEN 환경변수 누락");
    return NextResponse.json({ success: false, error: "APIFY_API_TOKEN missing" }, { status: 500 });
  }
  if (!process.env.OPENAI_API_KEY) {
    console.error("[CRON] OPENAI_API_KEY 환경변수 누락");
    return NextResponse.json({ success: false, error: "OPENAI_API_KEY missing" }, { status: 500 });
  }

  try {
    // firebase-admin은 런타임에만 동적으로 로드 (빌드 타임 에러 방지)
    const { getAdminDb } = await import("@/lib/firebase/admin");
    const { FieldValue } = await import("firebase-admin/firestore");
    const db = await getAdminDb();

    // Admin DB 초기화 실패 체크
    if (!db || !db.collection) {
      console.error("[CRON] Firebase Admin DB 초기화 실패 - 환경변수(FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY) 확인 필요");
      return NextResponse.json({ success: false, error: "Firebase Admin init failed" }, { status: 500 });
    }

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    // 1. 활성화된(isActive = true) 타겟 계정 목록 불러오기 (Admin SDK 사용)
    const sourcesSnap = await db
      .collection("source_accounts")
      .where("isActive", "==", true)
      .get();

    if (sourcesSnap.empty) {
      console.log("[CRON] 수집할 활성 계정이 없습니다.");
      return NextResponse.json({ success: true, message: "수집할 활성 계정이 없습니다." });
    }

    // 기존 events 목록 로드 (중복 체크 + 병합용)
    const existingEventsSnap = await db.collection("events").get();
    const existingEvents: ConcertRecord[] = existingEventsSnap.docs.map((d: any) => ({
      id: d.id,
      ...d.data(),
    }));

    const results = [];
    let newCandidateCount = 0;
    let autoPublishCount = 0;
    let mergedCount = 0;
    let skippedCount = 0;

    for (const docSnap of sourcesSnap.docs) {
      const accountData = docSnap.data();
      const accountId = docSnap.id;
      const accountName = accountData.accountName;

      try {
        console.log(`[CRON][${accountName}] 크롤링 시작...`);

        // [STEP 1] Apify 크롤링으로 최근 게시물 가져오기
        const apifyRes = await fetch(
          `https://api.apify.com/v2/acts/apify~instagram-profile-scraper/run-sync-get-dataset-items?token=${process.env.APIFY_API_TOKEN}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              usernames: [accountName],
              resultsLimit: 3,
            }),
          }
        );

        if (!apifyRes.ok) {
          console.error(`[CRON][${accountName}] Apify 크롤링 실패: ${apifyRes.status} ${apifyRes.statusText}`);
          results.push({ accountName, status: "error", error: `Apify ${apifyRes.status}` });
          continue;
        }

        const apifyData = await apifyRes.json();
        const profileData = Array.isArray(apifyData) ? apifyData[0] : null;
        const latestPosts = profileData?.latestPosts ?? [];

        if (latestPosts.length === 0) {
          console.log(`[CRON][${accountName}] 최근 게시물이 없습니다.`);
          results.push({ accountName, status: "skip", reason: "no posts" });
          continue;
        }

        const realPosts = latestPosts.slice(0, 10).map((p: any) => ({
          instaLink: p.url ?? `https://www.instagram.com/p/${p.shortCode}/`,
          caption: p.caption ?? "",
          posterUrl: p.displayUrl ?? p.thumbnailUrl ?? "",
        }));

        // [중복 검사] 이미 raw_posts에 존재하는 게시물 제외
        const newPosts = [];
        for (const p of realPosts) {
          const existing = await db
            .collection("raw_posts")
            .where("instaLink", "==", p.instaLink)
            .limit(1)
            .get();
          if (existing.empty) {
            newPosts.push(p);
          }
        }

        if (newPosts.length === 0) {
          console.log(`[CRON][${accountName}] 모든 최근 게시물이 이미 수집됨. 건너뜁니다.`);
          results.push({ accountName, status: "skip", reason: "all duplicates" });
          continue;
        }

        // [STEP 2] OpenAI로 공연 포스터 선별 및 정보 추출 (공유 프롬프트 사용)
        const postsText = newPosts.map((p, i) => `[게시물 ${i}]\n- 캡션: ${p.caption}`).join("\n\n");

        const aiRes = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [{ role: "user", content: buildEventExtractionPrompt(postsText, accountName) }],
          response_format: { type: "json_object" },
        });

        const parsedInfo = sanitizeParsedEvent(JSON.parse(aiRes.choices[0].message.content || "{}"));

        // [STEP 3] 새 게시물 모두 raw_posts에 저장 (중복 방지용)
        let targetRawPostId = "";
        const bestIndex = (parsedInfo.chosenIndex !== undefined && parsedInfo.chosenIndex !== -1)
          ? parsedInfo.chosenIndex : 0;

        for (let i = 0; i < newPosts.length; i++) {
          const p = newPosts[i];
          const rawRef = await db.collection("raw_posts").add({
            sourceAccountId: accountId,
            sourceAccountName: accountName,
            instaLink: p.instaLink,
            caption: p.caption,
            posterUrl: p.posterUrl,
            fetchedAt: FieldValue.serverTimestamp(),
          });
          if (i === bestIndex) targetRawPostId = rawRef.id;
        }

        // [STEP 4] AI 판단 결과에 따라 분기:
        //   정보 부족 → 수집 안 함 / 기존 공연과 동일 → 병합 업데이트 / 완전 → 자동 발행 / 장소만 누락 → 승인 큐
        if (parsedInfo.chosenIndex === -1) {
          console.log(`[CRON][${accountName}] 공연 게시물 아님으로 판별 → 수집 생략`);
          results.push({ accountName, status: "skip", reason: "not concert post" });
        } else if (!hasMinimumEventInfo(parsedInfo)) {
          // 최소 기준(제목+날짜) 미달 → 아예 수집하지 않음
          skippedCount++;
          console.log(`[CRON][${accountName}] 정보 부족(제목/날짜 누락) → 수집 생략`);
          results.push({ accountName, status: "skip", reason: "insufficient info" });
        } else {
          const realPost = newPosts[bestIndex];

          const incoming: ConcertRecord = {
            title: parsedInfo.title,
            date: normalizeDateString(parsedInfo.date),
            endDate: normalizeDateString(parsedInfo.endDate),
            time: parsedInfo.time,
            venueName: parsedInfo.venueName,
            artistNames: parsedInfo.artistNames,
            sourceUrl: parsedInfo.ticketUrl,
            instagramUrl: realPost.instaLink || "",
            price: parsedInfo.price,
            posterUrl: realPost.posterUrl || "",
            dayLineups: parsedInfo.dayLineups.map((d) => ({
              date: normalizeDateString(d.date),
              artists: d.artists,
            })).filter((d) => d.date),
          };

          // 같은 공연이 이미 등록되어 있으면 → 병합 업데이트 (페스티벌 라인업 추가/수정 자동 반영)
          const matched = existingEvents.find((ev) => isSameConcert(ev, incoming));

          if (matched && matched.id) {
            const merged = mergeConcerts(matched, incoming);
            await db.collection("events").doc(matched.id).update({
              ...merged,
              updatedAt: FieldValue.serverTimestamp(),
            });
            Object.assign(matched, merged);
            mergedCount++;
            console.log(`[CRON][${accountName}] 🔄 기존 공연에 병합: "${merged.title}"`);
            results.push({ accountName, status: "merged", title: merged.title });
          } else if (incoming.venueName) {
            // ✅ 완전한 정보(제목+날짜+장소) → events에 직접 등록 (자동 발행)
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
              dayLineups: incoming.dayLineups || [],
              createdAt: FieldValue.serverTimestamp(),
              autoPublished: true, // 자동 발행 표시
            };
            const ref = await db.collection("events").add(payload);
            existingEvents.push({ id: ref.id, ...payload });
            autoPublishCount++;
            console.log(`[CRON][${accountName}] ✅ 자동 발행 완료: "${incoming.title}"`);
            results.push({ accountName, status: "auto-published", title: incoming.title });
          } else {
            // ⏳ 제목+날짜는 있으나 장소 누락 → candidate_events로 (수동 승인 대기)
            await db.collection("candidate_events").add({
              rawPostId: targetRawPostId,
              sourceAccountId: accountId,
              sourceAccountName: accountName,
              instaLink: realPost.instaLink,
              caption: realPost.caption,
              posterUrl: realPost.posterUrl,
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
              notes: "Cron Job: 장소 정보 누락으로 수동 승인 필요",
              createdAt: FieldValue.serverTimestamp(),
            });
            newCandidateCount++;
            console.log(`[CRON][${accountName}] ⏳ 승인 큐 상신: "${incoming.title}" (장소 누락)`);
            results.push({ accountName, status: "queued", title: incoming.title });
          }
        }

        // [STEP 5] 마지막 수집시간 업데이트
        await db.collection("source_accounts").doc(accountId).update({
          lastFetchedAt: FieldValue.serverTimestamp(),
        });

      } catch (accountError: any) {
        console.error(`[CRON][${accountName}] 처리 중 오류:`, accountError.message);
        results.push({ accountName, status: "error", error: accountError.message });
      }
    }

    const summary = `${sourcesSnap.size}개 계정 순회 완료. 자동 발행 ${autoPublishCount}건, 병합 ${mergedCount}건, 승인 대기 ${newCandidateCount}건, 정보 부족 생략 ${skippedCount}건.`;
    console.log(`[CRON] ${summary}`);

    return NextResponse.json({
      success: true,
      message: summary,
      results,
    });

  } catch (error: any) {
    console.error("[CRON] 크론잡 실행 에러:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
