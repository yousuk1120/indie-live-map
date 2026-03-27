import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { username } = await req.json();
    
    // Apify API Key 확인
    if (!process.env.APIFY_API_TOKEN) {
      return NextResponse.json({ 
        success: false, 
        error: "서버에 APIFY_API_TOKEN 환경변수가 설정되지 않았습니다. .env.local을 확인하세요."
      }, { status: 500 });
    }

    if (!username) {
      return NextResponse.json({ success: false, error: "username 파라미터가 필요합니다." }, { status: 400 });
    }

    // Apify 공식 인스타그램 프로필 스크래퍼 Actor 호출 
    // https://apify.com/apify/instagram-profile-scraper
    const APIFY_ACTOR_URL = `https://api.apify.com/v2/acts/apify~instagram-profile-scraper/run-sync-get-dataset-items?token=${process.env.APIFY_API_TOKEN}`;

    const apifyReqBody = {
      usernames: [username],
    };

    const apifyRes = await fetch(APIFY_ACTOR_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(apifyReqBody)
    });

    if (!apifyRes.ok) {
        throw new Error(`Apify 호출 실패: ${apifyRes.statusText}`);
    }

    const data = await apifyRes.json();
    
    // Actor가 반환한 데이터 중 작성자의 최신 게시물 최대 3개를 추출합니다.
    let recentPosts = [];
    if (data && data.length > 0 && data[0].latestPosts && data[0].latestPosts.length > 0) {
       for (let i = 0; i < Math.min(3, data[0].latestPosts.length); i++) {
         const rawPost = data[0].latestPosts[i];
         recentPosts.push({
           instaLink: rawPost.url,
           caption: rawPost.caption || "",
           posterUrl: rawPost.displayUrl || rawPost.videoUrl || "",
         });
       }
    }

    if (recentPosts.length === 0) {
       return NextResponse.json({ success: true, warning: "최근 게시물이 없거나 파싱 불가", posts: [] });
    }

    return NextResponse.json({ success: true, posts: recentPosts });

  } catch (error: any) {
    console.error("인스타 크롤링 API 연동 실패:", error);
    return NextResponse.json({ 
      success: false, 
      error: error.message || "Apify 크롤링 중 오류가 발생했습니다." 
    }, { status: 500 });
  }
}
