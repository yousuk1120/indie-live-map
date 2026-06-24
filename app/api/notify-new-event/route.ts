import { NextResponse } from "next/server";
import { verifyAdminRequest } from "@/lib/api-auth";
import { getAdminDb, getAdminMessaging } from "@/lib/firebase/admin";

// 아티스트 이름 정규화 — 클라이언트(lib/artist-prefs)의 normalizeArtistKey와 동일해야 매칭됩니다.
function normalizeArtistKey(name: string): string {
  return name.toLowerCase().replace(/[\s\-_.,!?'"()\[\]]/g, "");
}

function splitArtists(value: string): string[] {
  return value
    .split(/[,/|·]+/)
    .map((a) => a.trim())
    .filter((a) => a.length > 0);
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// 관심 아티스트가 새 공연에 출연하는 구독자에게 웹 푸시를 발송합니다.
// 호출: 어드민 수동 수집/등록 후 (관리자 인증 필수)
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

    const artistList = splitArtists(String(artists || ""));
    const keys = Array.from(new Set(artistList.map(normalizeArtistKey).filter(Boolean)));
    if (keys.length === 0) {
      return NextResponse.json({ success: true, sent: 0, reason: "출연 아티스트 정보 없음" });
    }

    const db = await getAdminDb();
    const messaging = await getAdminMessaging();
    if (!db?.collection || !messaging?.sendEachForMulticast) {
      return NextResponse.json(
        { success: false, error: "서버 푸시 모듈 초기화 실패 (Firebase Admin 환경변수 확인)" },
        { status: 500 }
      );
    }

    // favoriteKeys array-contains-any 는 쿼리당 최대 30개 → 청크로 나눠 조회
    const tokenToKeys = new Map<string, Set<string>>();
    const tokenDocRefs = new Map<string, { delete: () => Promise<unknown> }>();

    for (const keyChunk of chunk(keys, 30)) {
      const snap = await db
        .collection("pushSubscriptions")
        .where("favoriteKeys", "array-contains-any", keyChunk)
        .get();

      snap.forEach((docSnap: any) => {
        const data = docSnap.data() as { token?: string; favoriteKeys?: string[] };
        const token = data.token || docSnap.id;
        const matched = (data.favoriteKeys || []).filter((k) => keys.includes(k));
        if (matched.length === 0) return;
        if (!tokenToKeys.has(token)) tokenToKeys.set(token, new Set());
        matched.forEach((k) => tokenToKeys.get(token)!.add(k));
        tokenDocRefs.set(token, docSnap.ref);
      });
    }

    const tokens = Array.from(tokenToKeys.keys());
    if (tokens.length === 0) {
      return NextResponse.json({ success: true, sent: 0, reason: "대상 구독자 없음" });
    }

    // 매칭된 아티스트 표시명 복원 (키 → 첫 매칭 표시명)
    const keyToName = new Map<string, string>();
    for (const name of artistList) {
      const k = normalizeArtistKey(name);
      if (!keyToName.has(k)) keyToName.set(k, name);
    }

    const url = eventId ? `/events/${eventId}` : "/";
    const eventTitle = String(title || "새 공연");

    // 토큰별로 매칭된 아티스트명을 본문에 넣어 개인화 발송
    const messages = tokens.map((token) => {
      const matchedNames = Array.from(tokenToKeys.get(token)!)
        .map((k) => keyToName.get(k))
        .filter(Boolean) as string[];
      const lead = matchedNames.length > 0 ? matchedNames.slice(0, 2).join(", ") : "관심 아티스트";
      return {
        token,
        notification: {
          title: `🎤 ${lead}의 새 공연`,
          body: eventTitle,
        },
        data: { url, title: `🎤 ${lead}의 새 공연`, body: eventTitle, tag: eventId || "lcm-event" },
        webpush: {
          fcmOptions: { link: url },
          notification: { icon: "/icons/icon-192.png", badge: "/icons/icon-192.png" },
        },
      };
    });

    // sendEachForMulticast는 동일 알림 전송용이라 토큰별 개인화에는 sendEach 사용
    const response = await messaging.sendEach(messages);

    // 무효 토큰 정리
    const cleanup: Promise<unknown>[] = [];
    response.responses.forEach((r: { success: boolean; error?: { code?: string } }, i: number) => {
      if (r.success) return;
      const code = r.error?.code || "";
      if (
        code === "messaging/registration-token-not-registered" ||
        code === "messaging/invalid-registration-token" ||
        code === "messaging/invalid-argument"
      ) {
        const ref = tokenDocRefs.get(tokens[i]);
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
    console.error("푸시 발송 실패:", error);
    return NextResponse.json({ success: false, error: "푸시 발송 중 오류가 발생했습니다." }, { status: 500 });
  }
}
