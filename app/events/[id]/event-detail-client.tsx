"use client";

// 공연 상세 — 인터랙티브 부분 (저장, 타임테이블 뷰어, 나만의 라인업)
// 데이터는 서버 컴포넌트(page.tsx)에서 받아옵니다.

import { useMemo, useState } from "react";
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
import { useArtistPrefs, eventArtists } from "@/lib/artist-prefs";
import { addEventToCalendar } from "@/lib/ics";
import { shareEventImage } from "@/lib/share-image";

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

        <section className="panel animate-fade-in p-6 md:p-8 flex flex-col md:flex-row gap-8 items-start">
          {/* 포스터 이미지 (적당한 사이즈) */}
          {timetableUrl && (
            <div 
              className="w-full max-w-sm md:w-72 shrink-0 overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--panel-2)] cursor-pointer hover:border-[var(--accent-border)] transition-colors relative group"
              onClick={() => setShowTimetable(true)}
              title="크게 보기"
            >
              <img
                src={timetableUrl.startsWith('http') ? `/api/proxy-image?url=${encodeURIComponent(timetableUrl)}` : timetableUrl}
                alt="공연 포스터"
                referrerPolicy="no-referrer"
                className="w-full h-auto object-cover group-hover:scale-105 transition-transform duration-500"
              />
              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <span className="text-white text-xs font-bold bg-black/50 px-3 py-1.5 rounded-lg backdrop-blur-sm">크게 보기</span>
              </div>
            </div>
          )}

          {/* 공연 정보 영역 */}
          <div className="flex-1 w-full">
            <p className="text-sm font-medium text-[var(--muted)]">{formatSchedule(event)}</p>

            <h1 className="mt-3 text-4xl font-semibold tracking-[-0.04em] text-[var(--text)] md:text-5xl">
              {event.title || "제목 없는 공연"}
            </h1>

            <div className="mt-8 grid gap-4 md:grid-cols-2">
              {event.venueName && venueSlug ? (
                <Link
                  href={`/venues/${encodeURIComponent(venueSlug)}`}
                  className="rounded-2xl border border-[var(--line)] bg-[var(--panel-2)] p-5 transition-colors hover:border-[var(--accent-border)]"
                >
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--muted)]">장소</p>
                  <p className="mt-3 text-base font-medium text-[var(--text)]">
                    {event.venueName}
                    <span className="ml-2 text-xs font-semibold text-[var(--accent)]">이 공연장의 다른 공연 →</span>
                  </p>
                </Link>
              ) : (
                <InfoCard label="장소" value={event.venueName || "미정"} />
              )}
              <InfoCard label="일정" value={`${formatSchedule(event)}${event.time ? ` · ${event.time}` : ""}`} />
              <InfoCard label="티켓" value={priceLines.join("\n") || "정보 없음"} preserveLineBreak />
            </div>

          {/* 페스티벌(날짜별 라인업)은 Day by Day로, 일반 공연은 관심/숨김 등록 UI로 */}
          {dayLineups.length > 0 ? (
            <DayLineupView event={event} />
          ) : (
            <ArtistPrefsSection event={event} />
          )}

          <div className="mt-8 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => toggleSave(event)}
              className={`secondary-btn ${saved ? "border-[var(--accent-border)] bg-[var(--accent-soft)] text-[var(--accent-2)]" : ""}`}
            >
              {saved ? "★ 저장됨" : "☆ 티켓북에 저장"}
            </button>

            <button
              type="button"
              onClick={() => addEventToCalendar(event)}
              className="secondary-btn"
              title="구글 캘린더에 일정 추가"
            >
              캘린더 추가
            </button>

            <button
              type="button"
              onClick={() => shareEventImage(event)}
              className="secondary-btn"
              title="LP 카드 이미지로 공유 (인스타 스토리/피드용)"
            >
              이미지 공유
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
                {event.timetableImageUrl ? "타임테이블 크게 보기" : "포스터 크게 보기"}
              </button>
            ) : null}
          </div>
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
      <p className={`mt-3 text-base font-medium text-[var(--text)] ${preserveLineBreak ? "whitespace-pre-line" : ""}`}>
        {value}
      </p>
    </div>
  );
}

/* ─── 출연 아티스트 관심/숨김 섹션 ─── */
function ArtistPrefsSection({ event }: { event: EventItem }) {
  const { isFavorite, isHidden, toggleFavorite, toggleHidden } = useArtistPrefs();
  const artists = useMemo(() => eventArtists(event), [event]);

  if (artists.length === 0) {
    return (
      <div className="mt-8 rounded-2xl border border-[var(--line)] bg-[var(--panel-2)] p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--muted)]">출연</p>
        <p className="mt-3 text-base font-medium text-[var(--text)]">미정</p>
      </div>
    );
  }

  return (
    <div className="mt-8">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--muted)]">출연 아티스트</p>
        <p className="text-[11px] text-[var(--muted)]">
          <span className="font-semibold text-[var(--accent)]">★ 관심</span> 등록 시 새 공연 알림 · 홈 필터,
          <span className="ml-1 font-semibold text-[var(--text-secondary)]">숨김</span> 시 목록에서 가려집니다
        </p>
      </div>

      <div className="space-y-2">
        {artists.map((artist) => {
          const fav = isFavorite(artist);
          const hide = isHidden(artist);
          return (
            <div
              key={artist}
              className={`flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 transition-colors ${
                hide
                  ? "border-[var(--line)] bg-[var(--panel-2)] opacity-60"
                  : fav
                    ? "border-[var(--accent-border)] bg-[var(--accent-soft)]"
                    : "border-[var(--line)] bg-[var(--panel-2)]"
              }`}
            >
              <span className={`min-w-0 flex-1 truncate text-sm font-semibold ${hide ? "text-[var(--muted)] line-through" : "text-[var(--text)]"}`}>
                {artist}
              </span>
              <div className="flex shrink-0 items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => toggleFavorite(artist)}
                  aria-pressed={fav}
                  title={fav ? "관심 해제" : "관심 아티스트로 등록"}
                  className={`flex h-9 items-center gap-1.5 rounded-full border px-3 text-xs font-bold transition-all active:scale-90 ${
                    fav
                      ? "border-[var(--accent-border)] bg-[var(--accent)] text-white"
                      : "border-[var(--line)] bg-[var(--panel)] text-[var(--muted)] hover:border-[var(--accent-border)] hover:text-[var(--accent)]"
                  }`}
                >
                  <svg width={13} height={13} viewBox="0 0 24 24" fill={fav ? "currentColor" : "none"} stroke="currentColor" strokeWidth={2} style={{ width: 13, height: 13 }}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 2l2.9 6.3 6.9.8-5.1 4.7 1.4 6.8L12 17.8 5.9 20.6l1.4-6.8L2.2 9.1l6.9-.8z" />
                  </svg>
                  관심
                </button>
                <button
                  type="button"
                  onClick={() => toggleHidden(artist)}
                  aria-pressed={hide}
                  title={hide ? "숨김 해제" : "이 아티스트 공연 숨기기"}
                  className={`flex h-9 w-9 items-center justify-center rounded-full border transition-all active:scale-90 ${
                    hide
                      ? "border-[var(--line-strong)] bg-[var(--panel-3)] text-[var(--text-secondary)]"
                      : "border-[var(--line)] bg-[var(--panel)] text-[var(--muted)] hover:border-[var(--line-strong)] hover:text-[var(--text-secondary)]"
                  }`}
                >
                  <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} style={{ width: 15, height: 15 }}>
                    {hide ? (
                      <>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9.9 4.2A9.1 9.1 0 0112 4c5 0 9 5.5 9 8a12 12 0 01-2 3M6.6 6.6C3.9 8.2 2 11 2 12c0 2.5 4 8 10 8a9 9 0 004-.9" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 3l18 18M9.9 9.9a3 3 0 004.2 4.2" />
                      </>
                    ) : (
                      <>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
                        <circle cx="12" cy="12" r="3" />
                      </>
                    )}
                  </svg>
                </button>
              </div>
            </div>
          );
        })}
      </div>
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
          src={url.startsWith('http') ? `/api/proxy-image?url=${encodeURIComponent(url)}` : url}
          alt="공연 타임테이블"
          referrerPolicy="no-referrer"
          className="origin-top-left transition-transform duration-200"
          style={{ transform: `scale(${zoom})`, maxWidth: zoom === 1 ? "100%" : "none" }}
        />
      </div>
    </div>
  );
}

/* ─── 날짜별 라인업 (읽기 전용) — 같은 아티스트가 여러 날 중복되면 처음 날에만 표시 ─── */
function DayLineupView({ event }: { event: EventItem }) {
  const cleaned = useMemo(() => {
    const seen = new Set<string>();
    return (event.dayLineups || [])
      .map((day) => {
        const artists = splitArtists(day.artists).filter((a) => {
          const key = a.toLowerCase().replace(/[\s\-_.,!?'"()\[\]]/g, "");
          if (!key || seen.has(key)) return false;
          seen.add(key);
          return true;
        });
        return { date: day.date, artists };
      })
      .filter((d) => d.artists.length > 0);
  }, [event.dayLineups]);

  if (cleaned.length === 0) return null;

  return (
    <div className="mt-8">
      <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--accent)]">
        Day by Day Lineup
      </p>
      <div className="space-y-2">
        {cleaned.map((day) => (
          <div key={day.date} className="rounded-2xl border border-[var(--line)] bg-[var(--panel-2)] p-4">
            <p className="mb-2.5 text-sm font-bold tabular-nums text-[var(--accent)]">{formatDayLabel(day.date)}</p>
            <div className="flex flex-wrap gap-1.5">
              {day.artists.map((artist) => (
                <span
                  key={artist}
                  className="rounded-full border border-[var(--line)] bg-[var(--panel)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)]"
                >
                  {artist}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
