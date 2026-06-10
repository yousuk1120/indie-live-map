import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/firestore";
import {
  type EventItem,
  normalizeEvent,
  normalizeDate,
  formatSchedule,
} from "@/lib/events";
import { splitArtists } from "@/lib/event-merge";
import EventDetailClient from "./event-detail-client";

// 공연 상세 — 서버 렌더링 (SEO/공유 미리보기/JSON-LD)
export const revalidate = 300;

async function fetchEvent(id: string): Promise<EventItem | null> {
  try {
    const snap = await getDoc(doc(db, "events", id));
    if (!snap.exists()) return null;
    return normalizeEvent(snap.id, snap.data() as Record<string, unknown>);
  } catch (error) {
    console.error("공연 상세 서버 로딩 실패:", error);
    return null;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const event = await fetchEvent(id);
  if (!event) return { title: "공연을 찾을 수 없습니다 | 라이브클럽맵" };

  const title = `${event.title || "공연"} | 라이브클럽맵`;
  const description = [
    formatSchedule(event),
    event.venueName,
    event.artistNames ? `출연: ${event.artistNames}` : "",
  ]
    .filter(Boolean)
    .join(" · ")
    .slice(0, 160);

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "website",
      ...(event.posterUrl ? { images: [{ url: event.posterUrl }] } : {}),
    },
  };
}

// 구글 검색 이벤트 리치 결과용 구조화 데이터 (schema.org MusicEvent)
function buildJsonLd(event: EventItem) {
  const startDate = normalizeDate(event.date);
  const endDate = normalizeDate(event.endDate);
  const performers = splitArtists(event.artistNames).slice(0, 30);

  return {
    "@context": "https://schema.org",
    "@type": "MusicEvent",
    name: event.title || "공연",
    ...(startDate
      ? { startDate: event.time ? `${startDate}T${event.time}:00+09:00` : startDate }
      : {}),
    ...(endDate ? { endDate } : {}),
    eventStatus: "https://schema.org/EventScheduled",
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    ...(event.venueName
      ? {
          location: {
            "@type": "MusicVenue",
            name: event.venueName,
            address: { "@type": "PostalAddress", addressCountry: "KR" },
          },
        }
      : {}),
    ...(performers.length
      ? { performer: performers.map((name) => ({ "@type": "MusicGroup", name })) }
      : {}),
    ...(event.posterUrl ? { image: [event.posterUrl] } : {}),
  };
}

export default async function EventDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const event = await fetchEvent(id);
  if (!event) notFound();

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(buildJsonLd(event)) }}
      />
      <EventDetailClient event={event} />
    </>
  );
}
