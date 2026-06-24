import { NextResponse } from "next/server";
import { verifyAdminRequest } from "@/lib/api-auth";
import { persistPosterImage } from "@/lib/poster";

export async function POST(req: Request) {
  // 관리자 전용 무인증 호출 차단
  const auth = await verifyAdminRequest(req);
  if (!auth.ok) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
  }

  try {
    const { url } = await req.json();

    if (!process.env.APIFY_API_TOKEN) {
      return NextResponse.json({
        success: false,
        error: "서버에 APIFY_API_TOKEN 환경변수가 설정되지 않았습니다.",
      }, { status: 500 });
    }

    if (!url) {
      return NextResponse.json({ success: false, error: "url 파라미터가 필요합니다." }, { status: 400 });
    }

    // Apify의 instagram-scraper 사용 (개별 포스트 URL 지원)
    // https://apify.com/apify/instagram-scraper
    const APIFY_ACTOR_URL = `https://api.apify.com/v2/acts/apify~instagram-scraper/run-sync-get-dataset-items?token=${process.env.APIFY_API_TOKEN}`;

    const apifyReqBody = {
      directUrls: [url],
      resultsType: "details",
    };

    const apifyRes = await fetch(APIFY_ACTOR_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(apifyReqBody),
    });

    if (!apifyRes.ok) {
      throw new Error(`Apify 호출 실패: ${apifyRes.statusText}`);
    }

    const data = await apifyRes.json();

    if (!data || data.length === 0) {
      return NextResponse.json({ success: false, error: "게시물 데이터를 가져올 수 없습니다. 비공개이거나 삭제되었을 수 있습니다." });
    }

    const postData = data[0];
    const rawPosterUrl = postData.displayUrl || postData.videoUrl || "";

    if (!rawPosterUrl) {
      return NextResponse.json({ success: false, error: "게시물에서 이미지 URL을 찾을 수 없습니다." });
    }

    // 인스타 서명 URL은 만료되므로 Vercel Blob에 영구화 (토큰 없으면 원본 유지)
    const posterUrl = await persistPosterImage(rawPosterUrl);

    return NextResponse.json({ success: true, posterUrl });
  } catch (error: any) {
    console.error("인스타 단일 포스트 크롤링 실패:", error);
    return NextResponse.json({
      success: false,
      error: error.message || "스크래핑 중 서버 오류가 발생했습니다.",
    }, { status: 500 });
  }
}
