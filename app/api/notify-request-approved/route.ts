import { NextResponse } from "next/server";
import { verifyAdminRequest } from "@/lib/api-auth";
import { getAdminDb, getAdminMessaging } from "@/lib/firebase/admin";
import { alertApiError } from "@/lib/notify-admin";

// 아티스트 추가 요청이 승인되면, 요청한 사용자에게 "추가됐어요" 웹 푸시를 발송합니다.
// 요청 문서의 uid로 pushSubscriptions(uid 일치)를 찾아 그 사용자의 모든 기기에 보냅니다.
// 호출: 관리자 승인 직후 (관리자 인증 필수). 실패해도 승인 자체는 유지됩니다(best-effort).
export async function POST(req: Request) {
  const auth = await verifyAdminRequest(req);
  if (!auth.ok) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
  }

  try {
    const { docId } = (await req.json()) as { docId?: string };
    if (!docId) return NextResponse.json({ success: false, error: "docId가 필요합니다." }, { status: 400 });

    const db = await getAdminDb();
    const messaging = await getAdminMessaging();
    if (!db?.collection || !messaging?.sendEach) {
      return NextResponse.json({ success: false, error: "서버 푸시 모듈 초기화 실패" }, { status: 500 });
    }

    const snap = await db.collection("artist_requests").doc(docId).get();
    if (!snap.exists) return NextResponse.json({ success: false, error: "요청을 찾을 수 없습니다." }, { status: 404 });
    const r = snap.data() as { uid?: string; artistName?: string; accountName?: string };
    const uid = r.uid;
    if (!uid) return NextResponse.json({ success: true, sent: 0, reason: "요청에 uid 없음" });

    // 이 사용자의 푸시 구독 토큰 조회
    const subsSnap = await db.collection("pushSubscriptions").where("uid", "==", uid).get();
    const tokenRefs = new Map<string, { delete: () => Promise<unknown> }>();
    subsSnap.forEach((d: any) => {
      const token = d.data()?.token || d.id;
      if (token) tokenRefs.set(token, d.ref);
    });
    const tokens = Array.from(tokenRefs.keys());
    if (tokens.length === 0) return NextResponse.json({ success: true, sent: 0, reason: "대상 기기 없음" });

    const name = (r.artistName || r.accountName || "요청하신 아티스트").toString();
    const heading = "🎉 요청하신 아티스트가 추가됐어요";
    const body = `${name} · 이제 관심 등록하면 새 공연 알림을 받을 수 있어요`;
    const url = "/settings";

    const messages = tokens.map((token) => ({
      token,
      notification: { title: heading, body },
      data: { url, title: heading, body, tag: `req-approved-${docId}` },
      webpush: {
        fcmOptions: { link: url },
        notification: { icon: "/icons/icon-192.png", badge: "/icons/icon-192.png" },
      },
    }));

    const response = await messaging.sendEach(messages);

    // 무효 토큰 정리
    const cleanup: Promise<unknown>[] = [];
    response.responses.forEach((res: { success: boolean; error?: { code?: string } }, i: number) => {
      if (res.success) return;
      const code = res.error?.code || "";
      if (
        code === "messaging/registration-token-not-registered" ||
        code === "messaging/invalid-registration-token" ||
        code === "messaging/invalid-argument"
      ) {
        const ref = tokenRefs.get(tokens[i]);
        if (ref) cleanup.push(ref.delete().catch(() => {}));
      }
    });
    await Promise.all(cleanup);

    return NextResponse.json({
      success: true,
      sent: response.successCount,
      failed: response.failureCount,
      targeted: tokens.length,
    });
  } catch (error) {
    console.error("승인 알림 발송 실패:", error);
    await alertApiError("notify-request-approved", error);
    return NextResponse.json({ success: false, error: "승인 알림 발송 중 오류가 발생했습니다." }, { status: 500 });
  }
}
