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

  // ── 권위 있는(drift-proof) 타게팅 ──
  //  구독 문서의 favoriteKeys 는 클라이언트가 best-effort 로 동기화하므로
  //  기기 변경·클라우드 병합·동기화 실패 시 실제 찜 목록과 어긋날 수 있습니다.
  //  따라서 여기서는 구독 전체를 훑어, 각 구독 소유자(uid)의 권위 있는 찜 목록
  //  users/{uid}/prefs/artists.favorites 와 저장된 favoriteKeys 를 합집합으로 매칭합니다.
  const subsSnap = await db.collection("pushSubscriptions").get();
  if (subsSnap.empty) return { sent: 0, failed: 0, targeted: 0, reason: "구독자 없음" };

  // 규모가 커지면 역인덱스/Functions 로 이전 필요 — 현재는 소규모라 전체 스캔이 안전·정확.
  if (subsSnap.size > 500) {
    console.warn(`[push-new-event] 구독 ${subsSnap.size}건 전체 스캔 — 역인덱스 이전 검토 필요`);
  }

  type SubDoc = { token?: string; uid?: string; favoriteKeys?: string[] };
  const subs = subsSnap.docs as any[];

  // 각 uid 의 권위 있는 찜 키를 users/{uid}/prefs/artists 에서 일괄 로드 (uid별 1회)
  const uids = Array.from(
    new Set(subs.map((d) => (d.data() as SubDoc).uid).filter(Boolean) as string[])
  );
  const prefsKeysByUid = new Map<string, Set<string>>();
  if (uids.length > 0) {
    const prefRefs = uids.map((uid) => db.doc(`users/${uid}/prefs/artists`));
    const prefSnaps = await db.getAll(...prefRefs);
    prefSnaps.forEach((snap: any, i: number) => {
      const favs = (snap.exists ? (snap.data()?.favorites as string[] | undefined) : undefined) || [];
      const keySet = new Set(favs.map(normalizeArtistKey).filter(Boolean));
      prefsKeysByUid.set(uids[i], keySet);
    });
  }

  const tokenToKeys = new Map<string, Set<string>>();
  const tokenDocRefs = new Map<string, { delete: () => Promise<unknown> }>();

  for (const docSnap of subs) {
    const data = docSnap.data() as SubDoc;
    const token = data.token || docSnap.id;
    if (!token) continue;

    // 저장된 favoriteKeys ∪ 권위 있는 prefs 찜 키
    const favKeys = new Set<string>(data.favoriteKeys || []);
    const authoritative = data.uid ? prefsKeysByUid.get(data.uid) : undefined;
    if (authoritative) authoritative.forEach((k) => favKeys.add(k));

    const matched = keys.filter((k) => favKeys.has(k));
    if (matched.length === 0) continue;

    if (!tokenToKeys.has(token)) tokenToKeys.set(token, new Set());
    matched.forEach((k) => tokenToKeys.get(token)!.add(k));
    tokenDocRefs.set(token, docSnap.ref);

    // 자가 치유: 저장된 favoriteKeys 가 권위 목록과 다르면 조용히 갱신(다음 발송 fast-path 정확도↑)
    if (authoritative && authoritative.size > 0) {
      const stored = new Set(data.favoriteKeys || []);
      const union = new Set<string>([...stored, ...authoritative]);
      if (union.size !== stored.size) {
        docSnap.ref
          .set({ favoriteKeys: Array.from(union) }, { merge: true })
          .catch(() => {});
      }
    }
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

type ArtistRecord = { title?: string; artistNames?: string; dayLineups?: Array<{ artists?: string }> };

// 레코드의 전체 출연 아티스트 표시명(artistNames + 날짜별 라인업), 키 기준 중복 제거.
function collectArtistNames(record: ArtistRecord): string[] {
  const lineupArtists = (record.dayLineups || []).map((d) => d.artists).filter(Boolean).join(", ");
  const all = splitArtists([record.artistNames, lineupArtists].filter(Boolean).join(", "));
  const seen = new Set<string>();
  const out: string[] = [];
  for (const name of all) {
    const key = normalizeArtistKey(name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  return out;
}

// 공연 레코드에서 아티스트 문자열을 만들어 푸시 발송(수집 파이프라인용 편의 함수).
// artistNames + 날짜별 라인업 아티스트를 합쳐 매칭 정확도를 높입니다. 실패는 삼킵니다.
export async function notifyNewEventFromRecord(
  record: ArtistRecord,
  eventId?: string
): Promise<void> {
  try {
    const artists = collectArtistNames(record).join(", ");
    if (!artists.trim()) return;
    await sendNewEventPush({ title: record.title, artists, eventId });
  } catch (error) {
    console.warn("[push-new-event] 새 공연 푸시 실패(무시):", error);
  }
}

// 기존 공연에 병합(merge)되어 라인업에 "새 아티스트"가 추가된 경우,
// 새로 추가된 아티스트만 대상으로 푸시합니다(기존 라인업 재알림 = 스팸 방지).
// 예: 이미 등록된 페스티벌에 내 관심 아티스트가 라인업 공개로 추가될 때.
export async function notifyMergedEventNewArtists(
  before: ArtistRecord,
  after: ArtistRecord,
  eventId?: string
): Promise<void> {
  try {
    const beforeKeys = new Set(collectArtistNames(before).map(normalizeArtistKey));
    const newNames = collectArtistNames(after).filter((n) => !beforeKeys.has(normalizeArtistKey(n)));
    if (newNames.length === 0) return;
    await sendNewEventPush({ title: after.title, artists: newNames.join(", "), eventId });
  } catch (error) {
    console.warn("[push-new-event] 병합 신규 아티스트 푸시 실패(무시):", error);
  }
}
