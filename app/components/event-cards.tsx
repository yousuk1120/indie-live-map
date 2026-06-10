"use client";

// 공연 카드 공통 컴포넌트 — 목록/지도/달력 화면에서 공유합니다.

import { useRouter } from "next/navigation";
import {
  type EventItem,
  isFestivalEvent,
  formatSchedule,
  formatPriceLines,
  getInstagramLink,
  getDaysUntil,
  getEventDates,
  getLineupForDate,
} from "@/lib/events";
import { useTicketbook } from "@/lib/ticketbook";

/* 메타 정보용 미니 아이콘 (이모지 대체 — 절제된 라인 아이콘) */
function MetaIcon({ type }: { type: "venue" | "artist" | "price" }) {
  const paths = {
    venue: <path strokeLinecap="round" strokeLinejoin="round" d="M12 21s-6-4.8-6-9.5a6 6 0 1112 0C18 16.2 12 21 12 21zM12 13a2 2 0 100-4 2 2 0 000 4z" />,
    artist: <path strokeLinecap="round" strokeLinejoin="round" d="M12 15a3.5 3.5 0 003.5-3.5v-5a3.5 3.5 0 10-7 0v5A3.5 3.5 0 0012 15zm6-3.5a6 6 0 01-12 0M12 18v3" />,
    price: <path strokeLinecap="round" strokeLinejoin="round" d="M4 8a2 2 0 012-2h12a2 2 0 012 2v1.5a2.5 2.5 0 000 5V16a2 2 0 01-2 2H6a2 2 0 01-2-2v-1.5a2.5 2.5 0 000-5V8z" />,
  };
  return (
    <svg
      viewBox="0 0 24 24"
      width={14}
      height={14}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      className="shrink-0 text-[var(--muted)]"
      style={{ width: 14, height: 14, minWidth: 14 }}
    >
      {paths[type]}
    </svg>
  );
}

/* ─── Event List Row (홈 목록용) ─── */
export function EventListRow({ event, index }: { event: EventItem; index: number }) {
  const router = useRouter();
  const { isSaved, toggleSave } = useTicketbook();

  const priceLines = formatPriceLines(event.price);
  const instagramUrl = getInstagramLink(event);
  const daysTag = getDaysUntil(event);
  const isFest = isFestivalEvent(event);
  const totalDays = getEventDates(event).length;
  const saved = isSaved(event.id);

  return (
    <article
      className={`group rounded-2xl border ${isFest ? "border-[var(--fest-border)] bg-[var(--fest-bg)]" : "border-[var(--line)] bg-[var(--panel)]"} hover-card animate-fade-in p-4 transition md:p-5`}
      style={{ animationDelay: `${Math.min(index * 0.04, 0.4)}s` }}
    >
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <button
          type="button"
          onClick={() => router.push(`/events/${event.id}`)}
          className="min-w-0 flex-1 text-left"
        >
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <p className="text-xs font-medium text-[var(--muted)]">{formatSchedule(event)}</p>
            {daysTag && (
              <span
                className={`rounded-md px-2 py-0.5 text-[10px] font-bold tracking-wide ${
                  daysTag === "TODAY"
                    ? "bg-[var(--accent)] text-[#0a0a12] shadow-[0_2px_12px_var(--accent-glow)] animate-pulse-soft"
                    : "border border-[var(--accent-border)] bg-[var(--accent-soft)] text-[var(--accent)]"
                }`}
              >
                {daysTag}
              </span>
            )}
            {isFest && (
              <span className="rounded-md border border-[var(--fest-border)] bg-[var(--fest-bg)] px-2 py-0.5 text-[10px] font-bold text-[var(--fest-text)]">
                FESTIVAL
              </span>
            )}
            {totalDays > 1 && (
              <span className="rounded-md bg-white/10 px-2 py-0.5 text-[10px] font-bold text-white/70">
                {totalDays}일간
              </span>
            )}
          </div>

          <h3 className="text-lg font-bold leading-snug tracking-[-0.02em] text-white transition-colors duration-300 group-hover:text-[var(--accent)] md:text-xl">
            {event.title || "제목 없는 공연"}
          </h3>

          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm">
            {event.venueName && (
              <div className="flex items-center gap-1.5">
                <MetaIcon type="venue" />
                <span className="text-[var(--text-secondary)]">{event.venueName}</span>
              </div>
            )}
            {event.artistNames && (
              <div className="flex min-w-0 items-center gap-1.5">
                <MetaIcon type="artist" />
                <span className="line-clamp-1 break-words text-[var(--text-secondary)]">{event.artistNames}</span>
              </div>
            )}
            {priceLines.length > 0 && (
              <div className="flex items-center gap-1.5">
                <MetaIcon type="price" />
                <span className="font-semibold text-white">{priceLines[0]}</span>
              </div>
            )}
          </div>
        </button>

        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              toggleSave(event);
            }}
            className={`secondary-btn text-xs ${saved ? "border-[var(--accent-border)] bg-[var(--accent-soft)] text-[var(--accent)]" : ""}`}
          >
            {saved ? "★ 저장됨" : "☆ 저장"}
          </button>

          <a
            href={instagramUrl}
            target="_blank"
            rel="noreferrer"
            className="secondary-btn text-xs"
            onClick={(e) => e.stopPropagation()}
          >
            IG ↗
          </a>
        </div>
      </div>
    </article>
  );
}

/* ─── Schedule Row (지도/달력 사이드용 컴팩트 카드) ─── */
export function ScheduleRow({ event, forDate }: { event: EventItem; forDate?: string }) {
  const router = useRouter();
  const { isSaved, toggleSave } = useTicketbook();

  const priceLines = formatPriceLines(event.price);
  const instagramUrl = getInstagramLink(event);
  const isFest = isFestivalEvent(event);
  const dayLineup = forDate ? getLineupForDate(event, forDate) : "";
  const lineupText = dayLineup || event.artistNames;
  const saved = isSaved(event.id);

  return (
    <div className={`overflow-hidden rounded-2xl border ${isFest ? "border-[var(--fest-border)] bg-[var(--fest-bg)]" : "border-[var(--line)] bg-[var(--panel-2)]"} hover-card p-3 transition`}>
      <button
        type="button"
        onClick={() => router.push(`/events/${event.id}`)}
        className="block w-full min-w-0 text-left"
      >
        <p className="text-[11px] font-medium text-[var(--muted)]">{formatSchedule(event)}</p>
        <p className="mt-1 text-sm font-semibold leading-snug text-white">{event.title || "제목 없는 공연"}</p>

        <div className="mt-2 space-y-1.5">
          {event.venueName && (
            <p className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)]">
              <MetaIcon type="venue" />
              {event.venueName}
            </p>
          )}
          {lineupText && (
            <p className="line-clamp-2 text-xs text-[var(--text-secondary)]">
              {dayLineup && <span className="font-semibold text-[var(--accent)]">이날 라인업 · </span>}
              {lineupText}
            </p>
          )}
          {priceLines.length > 0 && (
            <p className="flex items-center gap-1.5 text-xs font-semibold text-white">
              <MetaIcon type="price" />
              {priceLines.join(" / ")}
            </p>
          )}
        </div>
      </button>

      <div className="mt-3 flex gap-1.5 border-t border-[var(--line)] pt-2.5">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            toggleSave(event);
          }}
          className={`secondary-btn h-8 text-[11px] ${saved ? "border-[var(--accent-border)] bg-[var(--accent-soft)] text-[var(--accent)]" : ""}`}
        >
          {saved ? "★" : "☆"}
        </button>

        <a
          href={instagramUrl}
          target="_blank"
          rel="noreferrer"
          className="secondary-btn h-8 text-[11px]"
          onClick={(e) => e.stopPropagation()}
        >
          IG
        </a>
      </div>
    </div>
  );
}
