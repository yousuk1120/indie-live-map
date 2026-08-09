import { NextResponse } from "next/server";
import { verifyAdminRequest } from "@/lib/api-auth";
import { sendNewEventPush } from "@/lib/push-new-event";
import { alertApiError } from "@/lib/notify-admin";

// 관심 아티스트가 새 공연에 출연하는 구독자에게 웹 푸시를 발송합니다.
// 호출: 어드민 수동 수집/등록 후 (관리자 인증 필수). 실제 발송 로직은 lib/push-new-event 공용 함수.
export async function POST(req: Request) {
  const auth = await verifyAdminRequest(req);
  if (!auth.ok) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
  }

  try {
    const { title, artists, eventId } = (await req.json()) as {
      title?: string;
      artists?: string;
      eventId?: string;
    };

    const result = await sendNewEventPush({ title, artists, eventId });
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error("푸시 발송 실패:", error);
    await alertApiError("notify-new-event", error);
    return NextResponse.json({ success: false, error: "푸시 발송 중 오류가 발생했습니다." }, { status: 500 });
  }
}
