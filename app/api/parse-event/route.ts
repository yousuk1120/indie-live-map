import { NextResponse } from "next/server";
import OpenAI from "openai";

export async function POST(req: Request) {
  try {
    const { posts, accountName, caption } = await req.json();

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { success: false, error: "서버에 OPENAI_API_KEY가 설정되지 않았습니다. .env.local 파일을 확인해주세요." },
        { status: 500 }
      );
    }

    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    const postsArray = Array.isArray(posts) ? posts : [{ instaLink: "수동입력", caption: caption || "" }];

    const postsText = postsArray.map((p, i) => `[게시물 ${i}]\n- 캡션: ${p.caption}`).join("\n\n");

    const prompt = `
당신은 인디 밴드와 공연 관련 게시물을 분석하는 AI입니다. (@${accountName || "알수없음"} 계정의 게시물)

★ [매우 중요한 연도 및 날짜 규칙] ★
1. 현재 기준 연도는 무조건 "2026년" 입니다.
2. 본문에 연도가 생략되어 있고 월/일만 있다면 무조건 2026년으로 간주하세요. (예: 4월 4일 -> 2026-04-04)
3. 현재 날짜(2026년)를 기준으로 이미 지나간 과거의 공연 정보는 절대 추출하지 말고 무시하세요.

아래 제공된 최근 게시물 목록 중 **"앞으로 개최될 예정인 오프라인 라이브 공연이나 콘서트를 가장 잘 홍보하는 포스터 게시물"**을 단 하나 골라서 핵심 정보를 추출하세요.

[엄격한 무시 조건 - 절대 고르지 마세요!]
- 이미 지나간, 과거 공연의 후기나 리캡(Recap), 감사 인사 영상 등은 절대 고르면 안 됩니다!
- 공연 발매 공지, 일상 글, 굿즈 발매, 뮤비 티저, 멤버 잡담 등은 무시하세요.
- 모든 게시물이 이에 해당하면 아무것도 추출하지 말고 chosenIndex를 -1로 둡니다.

[게시물 목록]
${postsText}

[출력 JSON 구조]
1. "chosenIndex": (숫자) 선택한 예비 공연 게시물의 인덱스 번호. 없으면 -1
2. "title": 공연 제목. 없으면 ""
3. "date": 공연 날짜. 반드시 "YYYY-MM-DD" 혹은 "MM-DD" 문자열. 없으면 ""
4. "time": 공연 시작 시간. 반드시 "HH:mm" 24시간제 문자열. 없으면 ""
5. "venueName": 장소명. 없으면 ""
6. "artistNames": 라인업 아티스트명. 쉼표로만 구분
7. "ticketUrl": 예매 또는 안내 URL/안내문
8. "price": 티켓 가격 정보. 예: "예매 30,000원, 현매 35,000원"
`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
    });

    const parsedContent = response.choices[0].message.content || "{}";
    const data = JSON.parse(parsedContent);

    if (data.chosenIndex !== -1) {
      if (!data.date || !data.venueName || !data.title || data.title === "") {
        return NextResponse.json({
          success: true,
          data: { ...data, chosenIndex: -1 },
          message: "필수 정보(날짜/장소/제목) 부족으로 자동 필터링되었습니다.",
        });
      }
    }

    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    console.error("parse-event 오류:", error);
    return NextResponse.json(
      {
        success: false,
        error: error?.message || "공연 파싱 중 오류가 발생했습니다.",
      },
      { status: 500 }
    );
  }
}
