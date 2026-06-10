import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { fetchEvents } from "@/lib/fetch-events";
import { prepareUpcomingEvents } from "@/lib/events";
import { venueGroupKey } from "@/lib/venues";
import PageShell from "../../components/page-shell";
import AppHeader from "../../components/app-header";
import VenueEventList from "./venue-event-list";

// 공연장 프로필 — 이 공연장의 다가오는 공연 전체 (서버 렌더링, SEO 자산)
export const revalidate = 300;

async function getVenueEvents(slug: string) {
  const { events } = await fetchEvents();
  const upcoming = prepareUpcomingEvents(events);
  const venueEvents = upcoming.filter((event) => venueGroupKey(event.venueName) === slug);
  const venueName = venueEvents[0]?.venueName || "";
  return { venueEvents, venueName };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const { venueName, venueEvents } = await getVenueEvents(decodeURIComponent(slug));
  if (!venueName) return { title: "공연장 | 라이브클럽맵" };

  return {
    title: `${venueName} 공연 일정 | 라이브클럽맵`,
    description: `${venueName}의 다가오는 라이브 공연 ${venueEvents.length}개 — 라이브클럽맵에서 확인하세요.`,
  };
}

export default async function VenuePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { venueEvents, venueName } = await getVenueEvents(decodeURIComponent(slug));

  if (!venueName) notFound();

  const kakaoMapUrl = `https://map.kakao.com/?q=${encodeURIComponent(venueName)}`;

  return (
    <PageShell>
      <AppHeader
        title={venueName}
        subtitle={`이 공연장의 다가오는 공연 ${venueEvents.length}개`}
        action={
          <a href={kakaoMapUrl} target="_blank" rel="noreferrer" className="secondary-btn text-xs">
            카카오맵 ↗
          </a>
        }
      />

      <VenueEventList events={venueEvents} />

      <div className="mt-8 text-center">
        <Link href="/map" className="text-xs font-semibold text-[var(--muted)] transition-colors hover:text-[var(--accent)]">
          ← 공연장 지도로 돌아가기
        </Link>
      </div>
    </PageShell>
  );
}
