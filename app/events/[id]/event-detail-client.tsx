"use client";

// 공연 상세 — 인터랙티브 부분 (저장, 타임테이블 뷰어, 나만의 라인업)
// 데이터는 서버 컴포넌트(page.tsx)에서 받아옵니다.

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  type EventItem,
  normalizeDate,
  formatSchedule,
  formatPriceLines,
  getInstagramLink,
  toText,
} from "@/lib/events";
import { splitArtists } from "@/lib/event-merge";
import { venueGroupKey } from "@/lib/venues";
import { useTicketbook } from "@/lib/ticketbook";

function extractExternalUrl(value?: string) {
  const raw = toText(value);
  if (!raw) return "";

  const http = raw.match(/https?:\/\/[^\s)]+/i);
  if (http) return http[0].replace(/[),.;]+$/, "");

  const instaPath = raw.match(/(?:www\.)?instagram\.com\/[A-Za-z0-9_./?=&%-]+/i);
  if (instaPath) {
    const cleaned = instaPath[0].replace(/^https?:\/\//i, "").replace(/[),.;]+$/, "");
    return `https://${cleaned}`;
  }

  const handle = raw.match(/@[A-Za-z0-9._]{2,30}/);
  if (handle) return `https://www.instagram.com/${handle[0].slice(1)}`;

  const looseUrl = raw.match(/(?:www\.)?[A-Za-z0-9.-]+\.[A-Za-z]{2,}(?:\/[^\s)]*)?/);
  if (looseUrl && !raw.includes(" ")) return `https://${looseUrl[0].replace(/^https?:\/\//i, "")}`;

  return "";
}

function extractInfoLink(event: EventItem) {
  const source = extractExternalUrl(event.sourceUrl);
  if (source && !/instagram\.com/i.test(source)) return source;
  return "";
}

function formatDayLabel(dateKey: string) {
  const normalized = normalizeDate(dateKey);
  const parsed = new Date(`${normalized}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return dateKey;
  const week = ["일", "월", "화", "수", "목", "금", "토"][parsed.getDay()];
  return `${String(parsed.getMonth() + 1).padStart(2, "0")}.${String(parsed.getDate()).padStart(2, "0")} (${week})`;
}

export default function EventDetailClient({ event }: { event: EventItem }) {
  const router = useRouter();
  const [showTimetable, setShowTimetable] = useState(false);
  const { isSaved, toggleSave } = useTicketbook();

  const instagramUrl = useMemo(() => getInstagramLink(event), [event]);
  const infoUrl = useMemo(() => extractInfoLink(event), [event]);
  const priceLines = useMemo(() => formatPriceLines(event.price), [event.price]);

  const dayLineups = event.dayLineups || [];
  const saved = isSaved(event.id);
  // 타임테이블 전용 이미지가 없으면 인스타 원본 포스터로 폴백
  const timetableUrl = event.timetableImageUrl || event.posterUrl || "";
  const venueSlug = venueGroupKey(event.venueName);

  return (
    <main className="relative min-h-screen overflow-x-clip bg-[var(--bg)] px-4 pb-32 pt-8 text-[var(--text)] md:px-8 md:pt-10">
      <div aria-hidden className="bg-aurora" />

      {showTimetable && timetableUrl && (
        <TimetableViewer url={timetableUrl} onClose={() => setShowTimetable(false)} />
      )}

      <div className="relative mx-auto max-w-4xl">
        <button type="button" onClick={() => router.back()} className="secondary-btn mb-6">
          ← 뒤로 가기
        </button>

        <section className="panel animate-fade-in p-6 md:p-8">
          <p className="text-sm font-medium text-[var(--muted)]">{formatSchedule(event)}</p>

          <h1 className="mt-3 text-4xl font-semibold tracking-[-0.04em] text-white md:text-5xl">
            {event.title || "제목 없는 공연"}
          </h1>

          <div className="mt-8 grid gap-4 md:grid-cols-2">
            {event.venueName && venueSlug ? (
              <Link
                href={`/venues/${encodeURIComponent(venueSlug)}`}
                className="rounded-2xl border border-[var(--line)] bg-[var(--panel-2)] p-5 transition-colors hover:border-[var(--accent-border)]"
              >
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--muted)]">장소</p>
                <p className="mt-3 text-base font-medium text-white">
                  {event.venueName}
                  <span className="ml-2 text-xs font-semibold text-[var(--accent)]">이 공연장의 다른 공연 →</span>
                </p>
              </Link>
            ) : (
              <InfoCard label="장소" value={event.venueName || "미정"} />
            )}
            <InfoCard label="출연" value={event.artistNames || "미정"} />
            <InfoCard label="일정" value={`${formatSchedule(event)}${event.time ? ` · ${event.time}` : ""}`} />
            <InfoCard label="티켓" value={priceLines.join("\n") || "정보 없음"} preserveLineBreak />
          </div>

          {/* 날짜별 라인업 + 나만의 라인업 선택 (멀티데이 페스티벌) */}
          {dayLineups.length > 0 && <MyLineupBuilder event={event} />}

          <div className="mt-8 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => toggleSave(event)}
              className={`secondary-btn ${saved ? "border-[var(--accent-border)] bg-[var(--accent-soft)] text-[var(--accent)]" : ""}`}
            >
              {saved ? "★ 저장됨" : "☆ 티켓북에 저장"}
            </button>

            <a href={instagramUrl} target="_blank" rel="noreferrer" className="primary-btn">
              Instagram ↗
            </a>

            {infoUrl ? (
              <a href={infoUrl} target="_blank" rel="noreferrer" className="secondary-btn">
                예매 / 안내 링크 ↗
              </a>
            ) : null}

            {timetableUrl ? (
              <button type="button" onClick={() => setShowTimetable(true)} className="secondary-btn">
                {event.timetableImageUrl ? "타임테이블 보기" : "포스터 보기"}
              </button>
            ) : null}
          </div>
        </section>
      </div>
    </main>
  );
}

function InfoCard({
  label,
  value,
  preserveLineBreak = false,
}: {
  label: string;
  value: string;
  preserveLineBreak?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-[var(--line)] bg-[var(--panel-2)] p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--muted)]">{label}</p>
      <p className={`mt-3 text-base font-medium text-white ${preserveLineBreak ? "whitespace-pre-line" : ""}`}>
        {value}
      </p>
    </div>
  );
}

/* ─── 타임테이블/포스터 이미지 뷰어 (확대/축소 + 드래그 스크롤) ─── */
function TimetableViewer({ url, onClose }: { url: string; onClose: () => void }) {
  const [zoom, setZoom] = useState(1);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/95 backdrop-blur-sm animate-fade-in">
      <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3" style={{ paddingTop: "max(12px, env(safe-area-inset-top))" }}>
        <p className="text-sm font-semibold text-white">타임테이블</p>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setZoom((z) => Math.max(1, z - 0.5))} className="icon-btn" aria-label="축소">−</button>
          <span className="w-10 text-center text-xs tabular-nums text-white/60">{Math.round(zoom * 100)}%</span>
          <button type="button" onClick={() => setZoom((z) => Math.min(4, z + 0.5))} className="icon-btn" aria-label="확대">+</button>
          <button type="button" onClick={onClose} className="icon-btn ml-2" aria-label="닫기">✕</button>
        </div>
      </div>
      <div className="custom-scrollbar flex-1 overflow-auto" style={{ touchAction: "pan-x pan-y pinch-zoom" }}>
        <img
          src={url}
          alt="공연 타임테이블"
          referrerPolicy="no-referrer"
          className="origin-top-left transition-transform duration-200"
          style={{ transform: `scale(${zoom})`, maxWidth: zoom === 1 ? "100%" : "none" }}
        />
      </div>
    </div>
  );
}

/* ─── 나만의 라인업 빌더 (날짜별 아티스트 선택, 기기 로컬 저장) ─── */
function MyLineupBuilder({ event }: { event: EventItem }) {
  const storageKey = `indieLive.mylineup.${event.id}`;
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) setSelected(new Set(JSON.parse(raw)));
    } catch {
      // ignore
    }
  }, [storageKey]);

  const toggle = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      try {
        localStorage.setItem(storageKey, JSON.stringify(Array.from(next)));
      } catch {
        // ignore
      }
      return next;
    });
  };

  const dayLineups = event.dayLineups || [];

  return (
    <div className="mt-8">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--accent)]">
          Day by Day Lineup
        </p>
        <p className="text-[11px] text-[var(--muted)]">
          아티스트를 눌러 <span className="font-semibold text-[var(--accent)]">나만의 라인업</span>을 만들어 보세요
          {selected.size > 0 && <span className="ml-1 font-bold text-[var(--accent)]">({selected.size}팀 선택)</span>}
        </p>
      </div>
      <div className="space-y-2">
        {dayLineups.map((day) => (
          <div key={day.date} className="rounded-2xl border border-[var(--line)] bg-[var(--panel-2)] p-4">
            <p className="mb-2.5 text-sm font-bold tabular-nums text-[var(--accent)]">{formatDayLabel(day.date)}</p>
            <div className="flex flex-wrap gap-1.5">
              {splitArtists(day.artists).map((artist) => {
                const key = `${day.date}__${artist}`;
                const active = selected.has(key);
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => toggle(key)}
                    className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-all duration-200 active:scale-90 ${
                      active
                        ? "border-[var(--accent-border)] bg-[var(--accent)] font-bold text-[#0a0a12]"
                        : "border-[var(--line)] bg-white/5 text-[var(--text-secondary)] hover:border-[var(--accent-border)] hover:text-white"
                    }`}
                  >
                    {active ? "✓ " : ""}{artist}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
