import { NextResponse } from "next/server";
import OpenAI from "openai";

// 빌드 타임에 정적 처리 금지 — 항상 런타임에서만 실행
export const dynamic = "force-dynamic";

// Vercel Cron Job 또는 외부 스케줄러에서 GET으로 호출합니다.
// 보안을 위해 CRON_SECRET 과 일치하는 secret 파라미터가 있어야 실행됩니다.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const querySecret = searchParams.get("secret");
  const authHeader = req.headers.get("authorization");

  // 로컬 테스트: ?secret= 쿼리 파라미터
  // Vercel Cron 자동 호출: Authorization 헤더 (Bearer CRON_SECRET)
  const isAuthorized =
    querySecret === process.env.CRON_SECRET ||
    authHeader === `Bearer ${process.env.CRON_SECRET}`;

  if (!isAuthorized) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    // firebase-admin은 런타임에만 동적으로 로드 (빌드 타임 에러 방지)
    const { getAdminDb } = await import("@/lib/firebase/admin");
    const { FieldValue } = await import("firebase-admin/firestore");
    const db = await getAdminDb();

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    // 1. 활성화된(isActive = true) 타겟 계정 목록 불러오기 (Admin SDK 사용)
    const sourcesSnap = await db
      .collection("source_accounts")
      .where("isActive", "==", true)
      .get();

    if (sourcesSnap.empty) {
      return NextResponse.json({ success: true, message: "수집할 활성 계정이 없습니다." });
    }

    const results = [];
    let newCandidateCount = 0;

    for (const docSnap of sourcesSnap.docs) {
      const accountData = docSnap.data();
      const accountId = docSnap.id;
      const accountName = accountData.accountName;

      try {
        // [STEP 1] Apify 크롤링으로 최근 게시물 3개 가져오기
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
          console.warn(`[${accountName}] Apify 크롤링 실패: ${apifyRes.statusText}`);
          continue;
        }

        const apifyData = await apifyRes.json();
        const profileData = Array.isArray(apifyData) ? apifyData[0] : null;
        const latestPosts = profileData?.latestPosts ?? [];

        if (latestPosts.length === 0) {
          console.log(`[${accountName}] 최근 게시물이 없습니다.`);
          continue;
        }

        const realPosts = latestPosts.slice(0, 3).map((p: any) => ({
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
          console.log(`[${accountName}] 모든 최근 게시물이 이미 수집됨. 건너뜁니다.`);
          continue;
        }

        // [STEP 2] OpenAI로 공연 포스터 선별 및 정보 추출
        const postsText = newPosts.map((p, i) => `[게시물 ${i}]\n- 캡션: ${p.caption}`).join("\n\n");

        const prompt = `
당신은 인디 밴드와 공연 관련 게시물을 분석하는 AI입니다. (@${accountName} 계정의 게시물)
아래 제공된 최근 게시물 목록 중 **"앞으로 개최될 예정인 오프라인 라이브 공연이나 콘서트를 가장 잘 홍보하는 포스터 게시물"**을 단 하나 골라서 핵심 정보를 추출하세요.

[엄격한 무시 조건]
- 이미 지나간 공연 후기, 감사 인사, 리캡 영상은 절대 고르면 안 됩니다.
- 일상 글, 굿즈 발매, 뮤비 티저, 멤버 잡담 등은 무시하세요.
- 모든 게시물이 이에 해당하면 chosenIndex를 -1로 둡니다.

[게시물 목록]
${postsText}

[출력 JSON 구조]
반드시 하나의 JSON 객체로만 응답하세요.
1. "chosenIndex": 선택한 게시물의 인덱스 번호 (0, 1, 2). 없으면 -1
2. "title": 공연 제목 (없으면 메인 밴드명, 아예 없으면 "")
3. "date": 공연 날짜 (반드시 "YYYY-MM-DD" 형태로 정규화, 없으면 "")
4. "time": 공연 시작 시간 (반드시 "HH:mm" 24시간제, 없으면 "")
5. "venueName": 장소명 (클럽명이나 라이브홀 이름, 없으면 "")
6. "artistNames": 라인업 밴드들 (반드시 쉼표로만 구분, 없으면 "")
7. "ticketUrl": 예매처 안내사항 (계좌번호 또는 URL, 없으면 "")
8. "price": 티켓 가격 (예: "예매 30,000원, 현매 35,000원", 없으면 "")
    `;

        const aiRes = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [{ role: "user", content: prompt }],
          response_format: { type: "json_object" },
        });

        const parsedInfo = JSON.parse(aiRes.choices[0].message.content || "{}");

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

        // [STEP 4] AI 판단 결과가 공연 포스터인 경우에만 candidate_events에 상신
        if (parsedInfo.chosenIndex !== -1) {
          const realPost = newPosts[bestIndex];
          await db.collection("candidate_events").add({
            rawPostId: targetRawPostId,
            sourceAccountId: accountId,
            sourceAccountName: accountName,
            instaLink: realPost.instaLink,
            caption: realPost.caption,
            posterUrl: realPost.posterUrl,
            parsedTitle: parsedInfo.title || "",
            parsedDate: parsedInfo.date || "",
            parsedTime: parsedInfo.time || "",
            parsedVenue: parsedInfo.venueName || "",
            parsedArtists: parsedInfo.artistNames || "",
            parsedTicket: parsedInfo.ticketUrl || "",
            parsedPrice: parsedInfo.price || "",
            confidence: 0.9,
            notes: "Cron Job: Apify + GPT 자동 수집",
            createdAt: FieldValue.serverTimestamp(),
          });
          newCandidateCount++;
        } else {
          console.log(`[${accountName}] 공연 포스터 아님으로 판별 → 큐 상신 생략`);
        }

        // [STEP 5] 마지막 수집시간 업데이트
        await db.collection("source_accounts").doc(accountId).update({
          lastFetchedAt: FieldValue.serverTimestamp(),
        });

        results.push({ accountName, status: "success" });

      } catch (accountError: any) {
        console.error(`[${accountName}] 처리 중 오류:`, accountError.message);
        results.push({ accountName, status: "error", error: accountError.message });
      }
    }

    return NextResponse.json({
      success: true,
      message: `${sourcesSnap.size}개 계정 순회 완료. 신규 후보 ${newCandidateCount}건 큐 상신.`,
      results,
    });

  } catch (error: any) {
    console.error("크론잡 실행 에러:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
