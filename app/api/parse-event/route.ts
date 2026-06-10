import { NextResponse } from "next/server";
import OpenAI from "openai";
import { buildEventExtractionPrompt, sanitizeParsedEvent } from "@/lib/ai-event-prompt";
import { hasMinimumEventInfo } from "@/lib/event-merge";

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

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: buildEventExtractionPrompt(postsText, accountName) }],
      response_format: { type: "json_object" },
    });

    const parsedContent = response.choices[0].message.content || "{}";
    const data = sanitizeParsedEvent(JSON.parse(parsedContent));

    // 최소 기준(제목 + 날짜) 미달이면 수집 대상에서 제외합니다.
    if (data.chosenIndex !== -1 && !hasMinimumEventInfo(data)) {
      return NextResponse.json({
        success: true,
        data: { ...data, chosenIndex: -1 },
        message: "필수 정보(제목/날짜) 부족으로 자동 필터링되었습니다.",
      });
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
