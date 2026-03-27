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

    // 만약 과거 호환용(단일 caption)으로 호출됐다면 배열로 감싸줌
    const postsArray = Array.isArray(posts) ? posts : [{ instaLink: "수동입력", caption: caption || "" }];

    let postsText = postsArray.map((p, i) => `[게시물 ${i}]\n- 캡션: ${p.caption}`).join('\n\n');

    // ★ AI가 2026년을 기준으로 생각하도록 프롬프트 강력하게 수정 ★
    const prompt = `
당신은 인디 밴드와 공연 관련 게시물을 분석하는 AI입니다. (@${accountName || '알수없음'} 계정의 게시물)

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

[추출 규칙]
가장 유력한 "미래 공연" 홍보 게시물을 1개 선택하여 아래 필드값을 무조건 하나의 JSON 객체로 응답하세요.

[출력 JSON 구조]
1. "chosenIndex": (숫자) 선택한 예비 공연 게시물의 인덱스 번호 (0, 1, 2). 없으면 -1
2. "title": 공연 제목 (없으면 메인 밴드명이나 기획 이름 추출, 아예 없으면 "")
3. "date": 공연 날짜 (반드시 "YYYY-MM-DD" 혹은 "MM-DD 형태"로 정규화해서 문자열로 출력, 요일 제외, 예: "2026-05-02", 없으면 "")
4. "time": 공연 시작 시간 (반드시 "HH:mm" 24시간제 포맷으로 출력, 예: "18:00", 시간 정보가 없으면 "")
5. "venueName": 장소명 (클럽명이나 오프라인 라이브홀 이름, 없으면 "")
6. "artistNames": 라인업 인디 밴드들 (반드시 쉼표로만 구분, "와", "그리고" 같은 수식어 제거)
7. "ticketUrl": 예매처 관련 안내사항 (웹사이트 주소만 뽑거나, 계좌번호 추출. 만약 '예매 오픈 시간'이 포함되어 있다면 "오후 8시" 등의 표현을 무조건 "20:00" 같은 24시간제 HH:mm 포맷으로 변환해서 작성)
8. "price": 티켓 가격 정보 (예: "예매 30,000원, 현매 35,000원", "무료" 등, 없으면 "")
    `;

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini", // 가장 빠르고 가성비 좋은 최신 경량 파싱 모델
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" }, // JSON 형태를 강제하는 옵션
    });

    const parsedContent = response.choices[0].message.content || "{}";
    const data = JSON.parse(parsedContent);

    // ★ 유석님을 위한 자동 필터링 bouncer (날짜, 장소, 제목 중 하나라도 없으면 입구 컷!)
    if (data.chosenIndex !== -1) {
      if (!data.date || !data.venueName || !data.title || data.title === "") {
        console.log("⚠️ 필수 정보 누락으로 자동 거름:", data.title);
        // 인덱스를 -1로 바꿔서 '선택 안 됨'으로 처리해버립니다.
        return NextResponse.json({
          success: true,
          data: { ...data, chosenIndex: -1 },
          message: "필수 정보(날짜/장소/제목) 부족으로 자동 필터링되었습니다."
        });
      }
    }

    return NextResponse.json({ success: true, data });

  } catch (error: any) {
    console.error("parse-event 오류:", error);
    return NextResponse.json(
      { success: false, error: error?.message || "Unknown error" },
      { status: 500 }
    );
  }
}