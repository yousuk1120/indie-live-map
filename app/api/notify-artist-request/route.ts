import { NextResponse } from "next/server";
import { notifyArtistRequestNow, alertApiError } from "@/lib/notify-admin";

// 아티스트 추가 요청이 제출되면 클라이언트가 이 라우트를 호출해 관리자에게 즉시 알립니다.
// 실제 artist_requests 문서(docId)를 확인해 알리므로, 임의 호출로는 알림을 보낼 수 없습니다(스팸 방지).
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const { docId } = (await req.json()) as { docId?: string };
    if (!docId || typeof docId !== "string") {
      return NextResponse.json({ success: false, error: "docId가 필요합니다." }, { status: 400 });
    }

    const { getAdminDb } = await import("@/lib/firebase/admin");
    const { FieldValue } = await import("firebase-admin/firestore");
    const db = await getAdminDb();
    if (!db || !db.collection) {
      // 알림 실패는 사용자 흐름에 영향 없음 — 조용히 성공 처리
      return NextResponse.json({ success: true, notified: false, reason: "admin-db-unavailable" });
    }

    const notified = await notifyArtistRequestNow(db, FieldValue, docId);
    return NextResponse.json({ success: true, notified });
  } catch (error) {
    await alertApiError("notify-artist-request", error);
    // 알림 경로 실패가 사용자 제출을 막지 않도록 200으로 반환
    return NextResponse.json({ success: true, notified: false });
  }
}
