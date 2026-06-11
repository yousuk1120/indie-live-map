"use client";

// 홈 탭: 검색 + 오늘의 공연 하이라이트 + 전체 목록

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  type EventItem,
  prepareUpcomingEvents,
  getEventDates,
  formatSchedule,
} from "@/lib/events";
import { useTicketbook } from "@/lib/ticketbook";
import { EventListRow } from "./event-cards";

function todayKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export default function ListView({
  initialEvents,
  loadError,
}: {
  initialEvents: EventItem[];
  loadError: string;
}) {
  const router = useRouter();
  const { syncLegacyIds } = useTicketbook();
  const [searchQuery, setSearchQuery] = useState("");

  // 구버전 북마크(ID 배열) → 스냅샷 자동 복원
  useEffect(() => {
    syncLegacyIds(initialEvents);
  }, [initialEvents, syncLegacyIds]);

  const upcomingEvents = useMemo(() => prepareUpcomingEvents(initialEvents), [initialEvents]);

  const filteredEvents = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return upcomingEvents;
    return upcomingEvents.filter((event) =>
      [event.title, event.venueName, event.artistNames]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(q))
    );
  }, [upcomingEvents, searchQuery]);

  const todayEvents = useMemo(
    () => upcomingEvents.filter((event) => getEventDates(event).includes(todayKey())),
    [upcomingEvents]
  );

  return (
    <>
      {/* ─── Search ─── */}
      <section className="mb-6 animate-fade-in" style={{ animationDelay: "0.08s" }}>
        <div className="relative">
          <svg
            width={16} height={16}
            style={{ width: 16, height: 16 }}
            className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[var(--muted)]"
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 10.5a6.5 6.5 0 11-13 0 6.5 6.5 0 0113 0z" />
          </svg>
          <input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="공연명, 공연장, 아티스트 검색"
            className="h-12 w-full rounded-2xl border border-[var(--line)] bg-[var(--panel)] pl-11 pr-4 text-sm text-white outline-none transition-all duration-300 placeholder:text-[var(--muted)] focus:border-[var(--accent-border)] focus:bg-[var(--panel-2)] focus:shadow-[0_0_0_4px_var(--accent-soft)]"
          />
        </div>
        <p className="mt-3 pl-1 text-xs text-[var(--muted)]">
          다가오는 공연{" "}
          <span className="font-bold tabular-nums text-[var(--accent)]">{upcomingEvents.length}</span>건
        </p>
      </section>

      {loadError ? (
        <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-6 text-sm text-red-400">
          {loadError}
        </div>
      ) : (
        <>
          {/* ─── 오늘의 공연 (가로 스크롤 하이라이트) ─── */}
          {!searchQuery && todayEvents.length > 0 && (
            <section className="mb-8 animate-fade-in" style={{ animationDelay: "0.12s" }}>
              <h2 className="mb-3 flex items-center gap-2.5 px-1 text-sm font-bold text-white">
                <span className="vinyl-disc shrink-0" style={{ width: 18, height: 18 }} aria-hidden />
                <span className="label-mono text-[var(--accent)]">Now Playing</span>
                <span className="text-[var(--faint)]">·</span>
                오늘의 공연
              </h2>
              <div className="custom-scrollbar -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 md:mx-0 md:px-0">
                {todayEvents.map((event) => (
                  <button
                    key={event.id}
                    type="button"
                    onClick={() => router.push(`/events/${event.id}`)}
                    className="w-[260px] shrink-0 snap-start rounded-2xl border border-[var(--accent-border)] bg-gradient-to-br from-[var(--accent-soft)] to-transparent p-4 text-left transition-all duration-300 hover:shadow-[0_4px_24px_var(--accent-glow)] active:scale-[0.97]"
                  >
                    <p className="label-mono text-[var(--accent)]">Tonight</p>
                    <p className="mt-1.5 line-clamp-2 text-sm font-bold leading-snug text-white">
                      {event.title || "제목 없는 공연"}
                    </p>
                    <p className="mt-2 text-xs text-[var(--text-secondary)]">
                      {event.venueName ? `📍 ${event.venueName}` : formatSchedule(event)}
                      {event.time ? ` · ${event.time}` : ""}
                    </p>
                  </button>
                ))}
              </div>
            </section>
          )}

          {/* ─── 전체 목록 ─── */}
          <section className="animate-slide-up">
            {filteredEvents.length ? (
              <div className="space-y-3">
                {filteredEvents.map((event, idx) => (
                  <EventListRow key={event.id} event={event} index={idx} />
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-14 text-center text-sm text-[var(--muted)]">
                검색 결과가 없습니다.
              </div>
            )}
          </section>
        </>
      )}
    </>
  );
}
