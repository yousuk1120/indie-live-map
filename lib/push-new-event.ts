// 서버 전용 — 관심(좋아요) 아티스트가 새 공연에 출연하는 구독자에게 웹 푸시(FCM) 발송.
//
// notify-new-event 라우트뿐 아니라 크론(fetch-sns)·백필(scan-account)의 자동 발행에서도
// 그대로 호출할 수 있게 로직을 한곳에 모았습니다. 실패해도 예외를 던지지 않습니다(수집 흐름 보호).

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

export type NewEventPushInput = {
  title?: string;
  artists?: string; // 콤마/슬래시 등으로 구분된 출연 아티스트 문자열
  eventId?: string;
};

export type NewEventPushResult = {
  sent: number;
  failed: number;
  targeted: number;
  reason?: string;
};

// 관심 아티스트가 새 공연에 출연하는 구독자에게 개인화 푸시 발송.
export async function sendNewEventPush(input: NewEventPushInput): Promise<NewEventPushResult> {
  const artistList = splitArtists(String(input.artists || ""));
  const keys = Array.from(new Set(artistList.map(normalizeArtistKey).filter(Boolean)));
  if (keys.length === 0) return { sent: 0, failed: 0, targeted: 0, reason: "출연 아티스트 정보 없음" };

  const db = await getAdminDb();
  const messaging = await getAdminMessaging();
  if (!db?.collection || !messaging?.sendEach) {
    return { sent: 0, failed: 0, targeted: 0, reason: "서버 푸시 모듈 초기화 실패" };
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
  if (tokens.length === 0) return { sent: 0, failed: 0, targeted: 0, reason: "대상 구독자 없음" };

  // 매칭된 아티스트 표시명 복원 (키 → 첫 매칭 표시명)
  const keyToName = new Map<string, string>();
  for (const name of artistList) {
    const k = normalizeArtistKey(name);
    if (!keyToName.has(k)) keyToName.set(k, name);
  }

  const url = input.eventId ? `/events/${input.eventId}` : "/";
  const eventTitle = String(input.title || "새 공연");

  // 토큰별로 매칭된 아티스트명을 본문에 넣어 개인화 발송
  const messages = tokens.map((token) => {
    const matchedNames = Array.from(tokenToKeys.get(token)!)
      .map((k) => keyToName.get(k))
      .filter(Boolean) as string[];
    const lead = matchedNames.length > 0 ? matchedNames.slice(0, 2).join(", ") : "관심 아티스트";
    const heading = `🎤 ${lead}의 새 공연`;
    return {
      token,
      notification: { title: heading, body: eventTitle },
      data: { url, title: heading, body: eventTitle, tag: input.eventId || "lcm-event" },
      webpush: {
        fcmOptions: { link: url },
        notification: { icon: "/icons/icon-192.png", badge: "/icons/icon-192.png" },
      },
    };
  });

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

  return { sent: response.successCount, failed: response.failureCount, targeted: tokens.length };
}

// 공연 레코드에서 아티스트 문자열을 만들어 푸시 발송(수집 파이프라인용 편의 함수).
// artistNames + 날짜별 라인업 아티스트를 합쳐 매칭 정확도를 높입니다. 실패는 삼킵니다.
export async function notifyNewEventFromRecord(
  record: { title?: string; artistNames?: string; dayLineups?: Array<{ artists?: string }> },
  eventId?: string
): Promise<void> {
  try {
    const lineupArtists = (record.dayLineups || []).map((d) => d.artists).filter(Boolean).join(", ");
    const artists = [record.artistNames, lineupArtists].filter(Boolean).join(", ");
    if (!artists.trim()) return;
    await sendNewEventPush({ title: record.title, artists, eventId });
  } catch (error) {
    console.warn("[push-new-event] 새 공연 푸시 실패(무시):", error);
  }
}
