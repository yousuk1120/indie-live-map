"use client";

// 홈 — 포스터 갤러리. 공연 포스터를 크게 살린 반응형 그리드 +
// 카테고리 필터 칩 · 스태거 등장 · 호버 리빌 인터랙션.

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  type EventItem,
  prepareUpcomingEvents,
  getEventDates,
  isFestivalEvent,
  formatSchedule,
  getDaysUntil,
} from "@/lib/events";
import { useTicketbook } from "@/lib/ticketbook";
import { useArtistPrefs } from "@/lib/artist-prefs";

type Filter = "all" | "today" | "week" | "festival" | "favorite";

function todayKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function daysToStart(event: EventItem): number {
  const dates = getEventDates(event);
  if (!dates.length) return Infinity;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const first = new Date(`${dates[0]}T00:00:00`);
  return Math.round((first.getTime() - today.getTime()) / 86_400_000);
}

function HeartIcon({ filled }: { filled: boolean }) {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" style={{ width: 16, height: 16, flexShrink: 0 }}
      fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
    </svg>
  );
}

/* ─── 포스터 카드 ─── */
function PosterCard({ event, index }: { event: EventItem; index: number }) {
  const router = useRouter();
  const { isSaved, toggleSave } = useTicketbook();
  const { eventHasFavorite } = useArtistPrefs();
  const [imgError, setImgError] = useState(false);

  const isFest = isFestivalEvent(event);
  const daysTag = getDaysUntil(event);
  const saved = isSaved(event.id);
  const hasFavorite = eventHasFavorite(event);
  const poster = event.posterUrl
    ? (event.posterUrl.startsWith("http") ? `/api/proxy-image?url=${encodeURIComponent(event.posterUrl)}` : event.posterUrl)
    : null;
  const showImg = poster && !imgError;

  return (
    <article
      className="group relative animate-rise overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--panel)] transition-all duration-300 hover:-translate-y-1 hover:border-[var(--accent-border)] hover:shadow-[0_18px_40px_rgba(0,0,0,0.12)]"
      style={{ animationDelay: `${Math.min(index * 0.035, 0.6)}s` }}
    >
      <button
        type="button"
        onClick={() => router.push(`/events/${event.id}`)}
        className="block w-full text-left"
      >
        {/* 포스터 (4:5) */}
        <div className="relative aspect-[4/5] w-full overflow-hidden bg-[var(--panel-3)]">
          {showImg ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={poster}
              alt={event.title || "공연 포스터"}
              referrerPolicy="no-referrer"
              loading="lazy"
              onError={() => setImgError(true)}
              className="h-full w-full object-cover transition-transform duration-[600ms] ease-out group-hover:scale-[1.06]"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[var(--accent-soft)] via-[var(--panel-2)] to-[var(--panel-3)] p-4">
              <p className="line-clamp-4 text-center text-sm font-bold text-[var(--text-secondary)]">
                {event.title || "공연"}
              </p>
            </div>
          )}

          {/* 호버 그라데이션 리빌 */}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />

          {/* 상단 배지 */}
          <div className="absolute left-2 top-2 flex flex-col items-start gap-1">
            {isFest && (
              <span className="rounded-md bg-[var(--accent)] px-2 py-0.5 text-[10px] font-bold text-white shadow-sm">
                FESTIVAL
              </span>
            )}
            {daysTag && (
              <span
                className={`rounded-md px-2 py-0.5 text-[10px] font-bold shadow-sm ${
                  daysTag === "TODAY"
                    ? "animate-pulse-soft bg-[var(--accent)] text-white"
                    : "bg-[rgba(255,255,255,0.88)] text-[var(--accent-2)] backdrop-blur-sm"
                }`}
              >
                {daysTag}
              </span>
            )}
            {hasFavorite && (
              <span
                className="flex items-center gap-1 rounded-md bg-[rgba(255,255,255,0.88)] px-1.5 py-0.5 text-[10px] font-bold text-[var(--accent-2)] shadow-sm backdrop-blur-sm"
                title="관심 아티스트 출연"
              >
                <svg width={10} height={10} viewBox="0 0 24 24" fill="currentColor" style={{ width: 10, height: 10 }}>
                  <path d="M12 2l2.9 6.3 6.9.8-5.1 4.7 1.4 6.8L12 17.8 5.9 20.6l1.4-6.8L2.2 9.1l6.9-.8z" />
                </svg>
                관심
              </span>
            )}
          </div>

          {/* 호버 CTA 칩 */}
          <div className="pointer-events-none absolute bottom-2 right-2 flex translate-y-1.5 items-center gap-1 rounded-full bg-[var(--accent)] px-2.5 py-1 text-[10px] font-bold text-white opacity-0 shadow-md transition-all duration-300 group-hover:translate-y-0 group-hover:opacity-100">
            자세히 →
          </div>
        </div>

        {/* 정보 */}
        <div className="p-3">
          <h3 className="line-clamp-2 text-sm font-bold leading-snug tracking-[-0.01em] text-[var(--text)] transition-colors group-hover:text-[var(--accent-2)]">
            {event.title || "제목 없는 공연"}
          </h3>
          <p className="mt-1.5 line-clamp-1 text-xs text-[var(--muted)]">
            {event.venueName || "공연장 미정"}
          </p>
          <p className="mt-0.5 text-xs font-medium text-[var(--text-secondary)]">
            {formatSchedule(event)}
          </p>
        </div>
      </button>

      {/* 저장 버튼 */}
      <button
        type="button"
        aria-label={saved ? "저장 취소" : "티켓북에 저장"}
        onClick={(e) => {
          e.stopPropagation();
          toggleSave(event);
        }}
        className={`absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full backdrop-blur-md transition-all active:scale-90 ${
          saved
            ? "bg-[var(--accent)] text-white"
            : "bg-[rgba(255,255,255,0.82)] text-[var(--text-secondary)] hover:scale-110 hover:text-[var(--accent)]"
        }`}
      >
        <HeartIcon filled={saved} />
      </button>
    </article>
  );
}

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "전체" },
  { key: "favorite", label: "관심 아티스트" },
  { key: "today", label: "오늘" },
  { key: "week", label: "이번 주" },
  { key: "festival", label: "페스티벌" },
];

export default function GalleryView({
  initialEvents,
  loadError,
}: {
  initialEvents: EventItem[];
  loadError: string;
}) {
  const { syncLegacyIds } = useTicketbook();
  const { eventHasHidden, eventHasFavorite, hidden } = useArtistPrefs();
  const [searchQuery, setSearchQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  useEffect(() => {
    syncLegacyIds(initialEvents);
  }, [initialEvents, syncLegacyIds]);

  // 포스터 갤러리이므로 포스터 없는 공연은 제외 + 숨김 아티스트 공연 제외
  // (홈·필터·카운트 모두 반영. 포스터는 수집 파이프라인에서 자동 채워집니다.)
  const upcomingEvents = useMemo(() => {
    let list = prepareUpcomingEvents(initialEvents).filter((e) => !!(e.posterUrl && e.posterUrl.trim()));
    if (hidden.length > 0) list = list.filter((e) => !eventHasHidden(e));
    return list;
  }, [initialEvents, hidden.length, eventHasHidden]);

  const counts = useMemo(() => {
    const tk = todayKey();
    return {
      all: upcomingEvents.length,
      favorite: upcomingEvents.filter((e) => eventHasFavorite(e)).length,
      today: upcomingEvents.filter((e) => getEventDates(e).includes(tk)).length,
      week: upcomingEvents.filter((e) => daysToStart(e) <= 7).length,
      festival: upcomingEvents.filter((e) => isFestivalEvent(e)).length,
    };
  }, [upcomingEvents, eventHasFavorite]);

  const visibleEvents = useMemo(() => {
    const tk = todayKey();
    let list = upcomingEvents;

    if (filter === "today") list = list.filter((e) => getEventDates(e).includes(tk));
    else if (filter === "week") list = list.filter((e) => daysToStart(e) <= 7);
    else if (filter === "festival") list = list.filter((e) => isFestivalEvent(e));
    else if (filter === "favorite") list = list.filter((e) => eventHasFavorite(e));

    const q = searchQuery.trim().toLowerCase();
    if (q) {
      list = list.filter((e) =>
        [e.title, e.venueName, e.artistNames]
          .filter(Boolean)
          .some((v) => v!.toLowerCase().includes(q))
      );
    }
    return list;
  }, [upcomingEvents, filter, searchQuery, eventHasFavorite]);

  return (
    <>
      {/* 검색 */}
      <section className="mb-5 mt-2 animate-fade-in md:mt-0" style={{ animationDelay: "0.05s" }}>
        <div className="relative">
          <svg
            width={16} height={16} style={{ width: 16, height: 16 }}
            className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[var(--muted)]"
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 10.5a6.5 6.5 0 11-13 0 6.5 6.5 0 0113 0z" />
          </svg>
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="공연명, 공연장, 아티스트 검색"
            className="h-12 w-full rounded-2xl border border-[var(--line)] bg-[var(--panel)] pl-11 pr-4 text-sm text-[var(--text)] outline-none transition-all duration-300 placeholder:text-[var(--muted)] focus:border-[var(--accent-border)] focus:shadow-[0_0_0_4px_var(--accent-soft)]"
          />
        </div>
      </section>

      {/* 필터 칩 */}
      <section className="custom-scrollbar mb-7 -mx-4 flex gap-2 overflow-x-auto px-4 pb-1.5 pt-0.5 animate-fade-in md:mx-0 md:px-0" style={{ animationDelay: "0.08s" }}>
        {FILTERS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            data-active={filter === key}
            onClick={() => setFilter(key)}
            className="chip shrink-0"
          >
            {label}
            <span className="ml-1.5 tabular-nums opacity-70">{counts[key]}</span>
          </button>
        ))}
      </section>

      {loadError ? (
        <div className="rounded-2xl border border-[var(--danger)]/30 bg-[var(--danger)]/5 p-6 text-sm text-[var(--danger)]">
          {loadError}
        </div>
      ) : visibleEvents.length === 0 ? (
        <div className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-14 text-center text-sm text-[var(--muted)]">
          {searchQuery
            ? "검색 결과가 없습니다."
            : filter === "favorite"
              ? "관심 아티스트가 출연하는 다가오는 공연이 없습니다. 공연 상세에서 아티스트를 ★ 관심 등록해보세요."
              : "해당하는 공연이 없습니다."}
        </div>
      ) : (
        <section className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4 lg:grid-cols-4">
          {visibleEvents.map((event, idx) => (
            <PosterCard key={event.id} event={event} index={idx} />
          ))}
        </section>
      )}
    </>
  );
}
