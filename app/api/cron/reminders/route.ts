import { NextResponse } from "next/server";
import { sendEventPushToFavoriters } from "@/lib/push-new-event";
import { normalizeArtistKey } from "@/lib/artist-key";

// 리마인더 크론 — 매일 아침(KST) 1회.
//   1) 🎟️ 오늘 예매 오픈하는 공연 알림 (ticketOpenAt 기준)
//   2) ⏰ 내일 열리는 공연 D-1 리마인더 (date 기준)
//   3) 📅 월요일: 지난 7일간 새로 올라온 관심 아티스트 공연 주간 다이제스트
// 대상 선정은 push-new-event 와 동일(favoriteKeys ∪ prefs). CRON_SECRET 필요.
export const dynamic = "force-dynamic";
export const maxDuration = 120;

// KST(UTC+9) 기준 달력 날짜 문자열 (offsetDays 만큼 가감)
function kstDateStr(offsetDays = 0): string {
  const shifted = Date.now() + (9 * 60 + offsetDays * 24 * 60) * 60 * 1000;
  return new Date(shifted).toISOString().slice(0, 10);
}
function kstWeekday(): number {
  return new Date(Date.now() + 9 * 3600 * 1000).getUTCDay(); // 0=일 .. 1=월
}

function splitArtists(v: string): string[] {
  return String(v || "").split(/[,/|·]+/).map((a) => a.trim()).filter(Boolean);
}
// 공연의 전체 출연 아티스트 문자열 (artistNames + 날짜별 라인업)
function eventArtists(ev: any): string {
  const lineup = (ev.dayLineups || []).map((d: any) => d.artists).filter(Boolean).join(", ");
  return [ev.artistNames, lineup].filter(Boolean).join(", ");
}
function artistKeySet(ev: any): Set<string> {
  return new Set(splitArtists(eventArtists(ev)).map(normalizeArtistKey).filter(Boolean));
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const secret = searchParams.get("secret");
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || (secret !== cronSecret && authHeader !== `Bearer ${cronSecret}`)) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
  if (process.env.ADMIN_ENABLED === "true") {
    return NextResponse.json({ success: true, message: "어드민 배포에서는 리마인더 크론을 실행하지 않습니다." });
  }

  try {
    const { getAdminDb, getAdminMessaging } = await import("@/lib/firebase/admin");
    const { FieldValue } = await import("firebase-admin/firestore");
    const db = await getAdminDb();
    if (!db || !db.collection) {
      return NextResponse.json({ success: false, error: "Firebase Admin init failed" }, { status: 500 });
    }

    const today = kstDateStr(0);
    const tomorrow = kstDateStr(1);
    const eventsSnap = await db.collection("events").get();
    const events = eventsSnap.docs.map((d: any) => ({ id: d.id, ref: d.ref, ...d.data() }));

    const result = { ticketOpen: 0, dayBefore: 0, digest: 0 };

    // ── 1) 오늘 예매 오픈 ──
    for (const ev of events) {
      const openDate = String(ev.ticketOpenAt || "").slice(0, 10);
      if (openDate !== today || ev.ticketOpenNotifiedAt) continue;
      const artists = eventArtists(ev);
      if (!artists.trim()) continue;
      const timeLabel = String(ev.ticketOpenAt || "").slice(11, 16); // "HH:MM" (있으면)
      const res = await sendEventPushToFavoriters({
        artists,
        eventId: ev.id,
        tag: `open-${ev.id}`,
        build: (names) => {
          const lead = names.length ? names.slice(0, 2).join(", ") : "관심 아티스트";
          return {
            title: `🎟️ ${lead} 예매 오픈`,
            body: timeLabel ? `${ev.title} · 오늘 ${timeLabel} 예매 시작` : `${ev.title} · 오늘 예매 시작`,
          };
        },
      });
      await ev.ref.update({ ticketOpenNotifiedAt: FieldValue.serverTimestamp() }).catch(() => {});
      if (res.targeted > 0) result.ticketOpen += res.targeted;
    }

    // ── 2) 내일 공연 D-1 리마인더 ──
    for (const ev of events) {
      if (String(ev.date || "") !== tomorrow || ev.reminderNotifiedAt) continue;
      const artists = eventArtists(ev);
      if (!artists.trim()) continue;
      const res = await sendEventPushToFavoriters({
        artists,
        eventId: ev.id,
        tag: `d1-${ev.id}`,
        build: (names) => {
          const lead = names.length ? names.slice(0, 2).join(", ") : "관심 아티스트";
          return { title: `⏰ 내일 ${lead} 공연`, body: `${ev.title}${ev.venueName ? ` · ${ev.venueName}` : ""}` };
        },
      });
      await ev.ref.update({ reminderNotifiedAt: FieldValue.serverTimestamp() }).catch(() => {});
      if (res.targeted > 0) result.dayBefore += res.targeted;
    }

    // ── 3) 월요일 주간 다이제스트 ──
    if (kstWeekday() === 1) {
      result.digest = await sendWeeklyDigest(db, getAdminMessaging, events);
    }

    return NextResponse.json({ success: true, today, ...result });
  } catch (error) {
    console.error("[CRON reminders] 실패:", error);
    const { alertApiError } = await import("@/lib/notify-admin");
    await alertApiError("cron/reminders", error).catch(() => {});
    return NextResponse.json({ success: false, error: "reminders cron failed" }, { status: 500 });
  }
}

// 구독자별로 지난 7일간 새로 올라온 '관심 아티스트 공연' 개수를 세어 한 번에 요약 푸시.
async function sendWeeklyDigest(db: any, getAdminMessaging: any, events: any[]): Promise<number> {
  const messaging = await getAdminMessaging();
  if (!messaging?.sendEach) return 0;

  const weekAgo = Date.now() - 7 * 24 * 3600 * 1000;
  const recent = events.filter((ev) => {
    const ms = ev.createdAt?.toDate?.()?.getTime?.() ?? (ev.createdAt?.seconds ? ev.createdAt.seconds * 1000 : 0);
    return ms >= weekAgo;
  });
  if (recent.length === 0) return 0;
  const recentKeys = recent.map(artistKeySet);

  const subsSnap = await db.collection("pushSubscriptions").get();
  if (subsSnap.empty) return 0;
  const subs = subsSnap.docs;
  const uids = Array.from(new Set(subs.map((d: any) => d.data().uid).filter(Boolean))) as string[];
  const prefsByUid = new Map<string, Set<string>>();
  if (uids.length) {
    const snaps = await db.getAll(...uids.map((u) => db.doc(`users/${u}/prefs/artists`)));
    snaps.forEach((s: any, i: number) =>
      prefsByUid.set(uids[i], new Set(((s.exists ? s.data()?.favorites : []) || []).map(normalizeArtistKey).filter(Boolean)))
    );
  }

  const messages: any[] = [];
  for (const d of subs) {
    const data = d.data();
    const token = data.token || d.id;
    if (!token) continue;
    const fav = new Set<string>(data.favoriteKeys || []);
    prefsByUid.get(data.uid)?.forEach((k) => fav.add(k));
    if (fav.size === 0) continue;
    const count = recentKeys.filter((ks) => [...ks].some((k) => fav.has(k))).length;
    if (count === 0) continue;
    const title = `📅 이번 주 관심 아티스트 새 공연 ${count}건`;
    const body = "앱에서 새로 올라온 공연을 확인해보세요";
    messages.push({
      token,
      notification: { title, body },
      data: { url: "/", title, body, tag: "weekly-digest" },
      webpush: { fcmOptions: { link: "/" }, notification: { icon: "/icons/icon-192.png", badge: "/icons/icon-192.png" } },
    });
  }
  if (!messages.length) return 0;
  const res = await messaging.sendEach(messages);
  return res.successCount;
}
