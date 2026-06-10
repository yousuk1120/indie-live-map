"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import Script from "next/script";
import { useRouter } from "next/navigation";
import {
  type EventItem,
  eventTimestamp,
  isFutureEvent,
  isKoreanEvent,
  isFestivalEvent,
  deduplicateEvents,
  formatSchedule,
  formatPriceLines,
  getInstagramLink,
  getDaysUntil,
  getEventDates,
  getLineupForDate,
  venueSearchCandidates,
  toText,
} from "@/lib/events";

declare global {
  interface Window {
    kakao?: any;
  }
}

type CalendarCell = {
  key: string;
  day: number;
  events: EventItem[];
};

type ViewMode = "list" | "map" | "calendar";

const DEFAULT_CENTER = { lat: 37.5559, lng: 126.9234 };

interface HomeClientProps {
  initialEvents: EventItem[];
  loadError: string;
}

export default function HomeClient({ initialEvents, loadError }: HomeClientProps) {
  const router = useRouter();

  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("list");

  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState("");

  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState("");
  const [origin, setOrigin] = useState("");
  const [activeVenue, setActiveVenue] = useState("");

  const [savedEvents, setSavedEvents] = useState<Set<string>>(new Set());

  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const markersRef = useRef<any[]>([]);
  const mapRef = useRef<any>(null);
  const venuePositionsRef = useRef<Map<string, any>>(new Map());
  const kakaoKey = process.env.NEXT_PUBLIC_KAKAO_MAP_API_KEY;

  useEffect(() => {
    if (typeof window !== "undefined") {
      setOrigin(window.location.origin);
      const stored = localStorage.getItem("indieLiveSaved");
      if (stored) setSavedEvents(new Set(JSON.parse(stored)));
    }
  }, []);

  const toggleSave = (id: string) => {
    setSavedEvents((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      localStorage.setItem("indieLiveSaved", JSON.stringify(Array.from(next)));
      return next;
    });
  };

  const koreanEvents = useMemo(() => initialEvents.filter(isKoreanEvent), [initialEvents]);

  const filteredEvents = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return koreanEvents;

    return koreanEvents.filter((event) =>
      [event.title, event.venueName, event.artistNames]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(q))
    );
  }, [koreanEvents, searchQuery]);

  const sortedEvents = useMemo(() => {
    const valid = [...filteredEvents].filter(isFutureEvent);
    return deduplicateEvents(valid).sort((a, b) => eventTimestamp(a) - eventTimestamp(b));
  }, [filteredEvents]);

  const venueBuckets = useMemo(() => {
    // 공백/특수문자 제거한 키로 그룹핑 + 별칭 처리
    const normalizeVenue = (v: string) => {
      const nv = v.replace(/\s+/g, "").toLowerCase();
      if (nv.includes("pentaport") || nv.includes("펜타포트")) return "펜타포트";
      return nv;
    };
    const bucket = new Map<string, { displayName: string; events: EventItem[] }>();
    sortedEvents.forEach((event) => {
      const venue = toText(event.venueName);
      if (!venue) return;
      const key = normalizeVenue(venue);
      const existing = bucket.get(key);
      if (existing) {
        existing.events.push(event);
        // 한글 이름이 나오면 한글 우선으로 덮어씀 (예: SUPER NOVA 대신 수퍼노바)
        if (/[가-힣]/.test(venue) && !/[가-힣]/.test(existing.displayName)) {
          existing.displayName = venue;
        }
      } else {
        bucket.set(key, { displayName: venue, events: [event] });
      }
    });

    return Array.from(bucket.values())
      .map(b => ({ venueName: b.displayName, events: b.events }))
      .sort((a, b) => b.events.length - a.events.length);
  }, [sortedEvents]);

  useEffect(() => {
    if (venueBuckets.length === 0) {
      setActiveVenue("");
      return;
    }

    if (!venueBuckets.some((bucket) => bucket.venueName === activeVenue)) {
      setActiveVenue(venueBuckets[0].venueName);
    }
  }, [activeVenue, venueBuckets]);

  const activeVenueEvents = useMemo(() => {
    if (!activeVenue) return [] as EventItem[];
    return sortedEvents.filter((event) => event.venueName === activeVenue);
  }, [activeVenue, sortedEvents]);

  const calendarCells = useMemo(() => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const totalDays = new Date(year, month + 1, 0).getDate();
    const cells: Array<CalendarCell | null> = [];

    for (let i = 0; i < firstDay; i += 1) cells.push(null);

    for (let day = 1; day <= totalDays; day += 1) {
      const key = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      // 멀티데이 공연(페스티벌)은 진행되는 모든 날짜에 표시
      const dayEvents = sortedEvents.filter((event) => getEventDates(event).includes(key));
      cells.push({ key, day, events: dayEvents });
    }

    return cells;
  }, [currentMonth, sortedEvents]);

  useEffect(() => {
    const validKeys = calendarCells.filter(Boolean).map((cell) => cell!.key);
    if (selectedDate && validKeys.includes(selectedDate)) return;

    const firstWithEvents = calendarCells.find((cell) => cell && cell.events.length)?.key || "";
    setSelectedDate(firstWithEvents);
  }, [calendarCells, selectedDate]);

  const selectedDateEvents = useMemo(() => {
    if (!selectedDate) return [] as EventItem[];
    return sortedEvents.filter((event) => getEventDates(event).includes(selectedDate));
  }, [selectedDate, sortedEvents]);

  useEffect(() => {
    if (!mapReady) return;

    const timer = window.setTimeout(() => {
      if (!window.kakao?.maps) {
        setMapError(`카카오 지도 스크립트를 불러오지 못했습니다. Kakao Developers에 ${origin || "현재 도메인"} 을 JavaScript SDK 도메인으로 등록하세요.`);
      }
    }, 1200);

    return () => window.clearTimeout(timer);
  }, [mapReady, origin]);

  useEffect(() => {
    if (viewMode !== "map") return;
    if (!mapReady || !window.kakao?.maps || !mapContainerRef.current) return;

    let cancelled = false;

    window.kakao.maps.load(() => {
      if (cancelled || !mapContainerRef.current) return;

      const map = new window.kakao.maps.Map(mapContainerRef.current, {
        center: new window.kakao.maps.LatLng(DEFAULT_CENTER.lat, DEFAULT_CENTER.lng),
        level: 6,
      });

      mapRef.current = map;
      markersRef.current.forEach((marker) => marker.setMap(null));
      markersRef.current = [];
      venuePositionsRef.current.clear();

      if (!venueBuckets.length) {
        setMapError("");
        return;
      }

      const places = new window.kakao.maps.services.Places();
      const bounds = new window.kakao.maps.LatLngBounds();
      let found = 0;
      let resolved = 0;

      const done = () => {
        resolved += 1;
        if (resolved === venueBuckets.length) {
          if (found > 0) {
            map.setBounds(bounds);
            setMapError("");
          } else {
            setMapError(`공연장 좌표를 찾지 못했습니다. Kakao Developers에 ${origin || "현재 도메인"} 을 JavaScript SDK 도메인으로 등록했는지 확인하세요.`);
          }
        }
      };

      venueBuckets.forEach((bucket) => {
        const queries = venueSearchCandidates(bucket.venueName);

        const searchAt = (index: number) => {
          if (cancelled) return;
          if (index >= queries.length) {
            done();
            return;
          }

          places.keywordSearch(queries[index], (data: any, status: any) => {
            if (cancelled) return;

            if (status === window.kakao.maps.services.Status.OK && data?.length) {
              const place = data[0];
              const position = new window.kakao.maps.LatLng(Number(place.y), Number(place.x));
              const marker = new window.kakao.maps.Marker({ map, position });
              markersRef.current.push(marker);
              venuePositionsRef.current.set(bucket.venueName, position);
              bounds.extend(position);
              found += 1;

              // 마커 클릭 시 해당 공연장 선택 (이름 표시 없음)
              window.kakao.maps.event.addListener(marker, "click", () => {
                setActiveVenue(bucket.venueName);
                map.panTo(position);
              });

              done();
              return;
            }

            searchAt(index + 1);
          });
        };

        searchAt(0);
      });
    });

    return () => {
      cancelled = true;
      markersRef.current.forEach((marker) => marker.setMap(null));
      venuePositionsRef.current.clear();
    };
  }, [viewMode, mapReady, venueBuckets, origin]);

  return (
    <main className="relative min-h-screen overflow-x-clip bg-[var(--bg)] text-[var(--text)]">
      {/* 배경 글로우 (장식) */}
      <div aria-hidden className="bg-aurora" />

      {kakaoKey ? (
        <Script
          src={`https://dapi.kakao.com/v2/maps/sdk.js?appkey=${kakaoKey}&libraries=services&autoload=false`}
          strategy="afterInteractive"
          onLoad={() => setMapReady(true)}
          onError={() =>
            setMapError(`카카오 지도 스크립트를 불러오지 못했습니다. Kakao Developers에 ${origin || "현재 도메인"} 을 JavaScript SDK 도메인으로 등록하세요.`)
          }
        />
      ) : null}

      <div className="relative mx-auto max-w-5xl px-4 pb-24 pt-10 md:px-6 md:pt-16">
        {/* ─── Header ─── */}
        <header className="mb-12 animate-fade-in">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="mb-3 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.32em] text-[var(--accent)]">
                <span className="live-dot" />
                Seoul Indie Live
              </p>
              <h1 className="text-4xl font-extrabold leading-[1.05] tracking-[-0.045em] text-white md:text-6xl">
                Concert
                <br className="md:hidden" />{" "}
                <span className="text-gradient">Schedule</span>
              </h1>
              <p className="mt-4 max-w-md text-sm leading-relaxed text-[var(--muted)]">
                서울 인디씬의 라이브 공연을 한곳에서. 목록·지도·달력으로 탐색하세요.
              </p>
            </div>

            <Link href="/admin" className="secondary-btn text-xs">
              Admin
            </Link>
          </div>
          <div className="mt-8 h-px bg-gradient-to-r from-[var(--accent-soft)] via-white/5 to-transparent" />
        </header>

        {/* ─── Search + View Toggle ─── */}
        <section className="mb-8 animate-fade-in" style={{ animationDelay: "0.08s" }}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="search-field relative flex-1">
              <svg
                className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted)] transition-colors"
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

            <div className="flex items-center gap-1 rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-1 backdrop-blur">
              <ViewTab active={viewMode === "list"} onClick={() => setViewMode("list")}>목록</ViewTab>
              <ViewTab active={viewMode === "map"} onClick={() => setViewMode("map")}>지도</ViewTab>
              <ViewTab active={viewMode === "calendar"} onClick={() => setViewMode("calendar")}>달력</ViewTab>
            </div>
          </div>

          {/* 공연 수 요약 */}
          <p className="mt-3 pl-1 text-xs text-[var(--muted)]">
            다가오는 공연{" "}
            <span className="font-bold tabular-nums text-[var(--accent)]">{sortedEvents.length}</span>건
          </p>
        </section>

        {/* ─── Content ─── */}
        {loadError ? (
          <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-6 text-sm text-red-400">
            {loadError}
          </div>
        ) : (
          <>
            {/* ─── List View ─── */}
            {viewMode === "list" && (
              <section className="animate-slide-up">
                {sortedEvents.length ? (
                  <div className="space-y-3">
                    {sortedEvents.map((event, idx) => (
                      <EventListRow
                        key={event.id}
                        event={event}
                        onOpen={() => router.push(`/events/${event.id}`)}
                        isSaved={savedEvents.has(event.id)}
                        onToggleSave={() => toggleSave(event.id)}
                        index={idx}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-14 text-center text-sm text-[var(--muted)]">
                    검색 결과가 없습니다.
                  </div>
                )}
              </section>
            )}

            {/* ─── Map View ─── */}
            {viewMode === "map" && (
              <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px] animate-slide-up">
                <div className="order-1 overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--panel)]">
                  <div className="flex items-center justify-between border-b border-[var(--line)] px-4 py-3">
                    <h2 className="text-sm font-semibold text-white">Map</h2>
                    {mapError ? <p className="text-xs text-[var(--muted)]">{mapError}</p> : null}
                  </div>
                  <div ref={mapContainerRef} className="h-[400px] w-full lg:h-[520px]" />
                </div>

                <aside className="order-2 flex h-[400px] flex-col lg:h-[520px]">
                  <div className="mb-3 flex flex-shrink-0 items-center justify-between px-1">
                    <h2 className="mr-2 truncate text-sm font-semibold text-white">
                      {activeVenue ? activeVenue : "공연장 정보"}
                    </h2>
                    <div className="flex shrink-0 gap-2 text-[10px] font-bold">
                      <span className="rounded-md border border-[var(--fest-border)] bg-[var(--fest-bg)] px-1.5 py-0.5 text-[var(--fest-text)]">페스티벌</span>
                      <span className="rounded-md bg-white/10 px-1.5 py-0.5 text-white/70">일반</span>
                    </div>
                  </div>

                  <div className="custom-scrollbar flex-1 space-y-2 overflow-y-auto pr-2">
                    {activeVenueEvents.length ? (
                      activeVenueEvents.map((event) => (
                        <ScheduleRow
                          key={event.id}
                          event={event}
                          onOpen={() => router.push(`/events/${event.id}`)}
                          isSaved={savedEvents.has(event.id)}
                          onToggleSave={() => toggleSave(event.id)}
                        />
                      ))
                    ) : (
                      <div className="flex h-full items-center justify-center rounded-2xl border border-[var(--line)] bg-[var(--panel)] px-4 py-8 text-center text-sm text-[var(--muted)]">
                        지도에서 공연장 마커를 클릭하면<br />공연 일정이 표시됩니다.
                      </div>
                    )}
                  </div>
                </aside>
              </section>
            )}

            {/* ─── Calendar View ─── */}
            {viewMode === "calendar" && (
              <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px] animate-slide-up">
                <div className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-4 md:p-6">
                  <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1))}
                        className="icon-btn"
                        aria-label="이전 달"
                      >
                        ‹
                      </button>
                      <h2 className="min-w-[140px] text-center text-lg font-bold tabular-nums tracking-tight text-white">
                        {currentMonth.getFullYear()}년 {currentMonth.getMonth() + 1}월
                      </h2>
                      <button
                        type="button"
                        onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1))}
                        className="icon-btn"
                        aria-label="다음 달"
                      >
                        ›
                      </button>
                    </div>
                    <div className="flex gap-3 text-[11px] font-semibold">
                      <span className="flex items-center gap-1.5 text-[var(--fest-text)]"><span className="h-2 w-2 rounded-full bg-[var(--fest-text)]" />페스티벌</span>
                      <span className="flex items-center gap-1.5 text-[var(--accent)]"><span className="h-2 w-2 rounded-full bg-[var(--accent)]" />일반 공연</span>
                    </div>
                  </div>

                  <div className="mb-1 grid grid-cols-7 gap-1">
                    {["일", "월", "화", "수", "목", "금", "토"].map((day, i) => (
                      <div key={`${day}-${i}`} className={`py-2 text-center text-xs font-semibold ${i === 0 ? "text-red-400/70" : i === 6 ? "text-sky-400/70" : "text-[var(--muted)]"}`}>{day}</div>
                    ))}
                  </div>

                  <div className="grid grid-cols-7 gap-1">
                    {calendarCells.map((cell, index) => {
                      const dayOfWeek = index % 7;
                      return cell ? (
                        <button
                          key={cell.key}
                          type="button"
                          onClick={() => setSelectedDate(cell.key)}
                          className={`relative h-[56px] rounded-xl px-1 py-1.5 text-center transition-all duration-200 active:scale-95 md:h-[64px] ${
                            cell.key === selectedDate
                              ? "bg-[var(--accent)] shadow-[0_4px_24px_var(--accent-glow)]"
                              : cell.events.length > 0
                              ? "border border-[var(--line)] bg-[var(--panel-2)] hover:border-[var(--accent-border)] hover:bg-[var(--panel-3)]"
                              : "hover:bg-[var(--panel-2)]"
                          }`}
                        >
                          <span className={`text-sm font-semibold ${
                            cell.key === selectedDate ? "text-[#0a0a12]" :
                            dayOfWeek === 0 ? "text-red-400/80" :
                            dayOfWeek === 6 ? "text-sky-400/80" : "text-white"
                          }`}>{cell.day}</span>
                          {cell.events.length > 0 && (
                            <div className="mt-1 flex justify-center gap-0.5">
                              {Array.from({ length: Math.min(cell.events.length, 3) }).map((_, i) => (
                                <span
                                  key={i}
                                  className={`h-1 w-1 rounded-full ${
                                    cell.key === selectedDate
                                      ? "bg-[#0a0a12]/60"
                                      : isFestivalEvent(cell.events[i])
                                      ? "bg-[var(--fest-text)]"
                                      : "bg-[var(--accent)]"
                                  }`}
                                />
                              ))}
                            </div>
                          )}
                        </button>
                      ) : (
                        <div key={`blank-${index}`} className="h-[56px] md:h-[64px]" />
                      );
                    })}
                  </div>
                </div>

                <aside className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-4 md:p-5">
                  <div className="mb-4 border-b border-[var(--line)] pb-3">
                    <h2 className="text-sm font-semibold text-white">선택한 날짜</h2>
                    <p className="mt-1 text-xs text-[var(--muted)]">{selectedDate || "이 달에 일정이 없습니다."}</p>
                  </div>

                  <div className="space-y-2">
                    {selectedDateEvents.length ? (
                      selectedDateEvents.map((event) => (
                        <ScheduleRow
                          key={event.id}
                          event={event}
                          forDate={selectedDate}
                          onOpen={() => router.push(`/events/${event.id}`)}
                          isSaved={savedEvents.has(event.id)}
                          onToggleSave={() => toggleSave(event.id)}
                        />
                      ))
                    ) : (
                      <div className="rounded-2xl border border-[var(--line)] bg-[var(--panel-2)] px-4 py-6 text-center text-sm text-[var(--muted)]">
                        선택한 날짜에 공연이 없습니다.
                      </div>
                    )}
                  </div>
                </aside>
              </section>
            )}
          </>
        )}
      </div>
    </main>
  );
}

/* ─── View Tab ─── */
function ViewTab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex h-10 items-center rounded-xl px-5 text-sm font-semibold transition-all duration-300 active:scale-95 ${
        active
          ? "bg-[var(--accent)] text-[#0a0a12] shadow-[0_2px_16px_var(--accent-glow)]"
          : "text-[var(--muted)] hover:bg-white/5 hover:text-white"
      }`}
    >
      {children}
    </button>
  );
}

/* ─── Event List Row ─── */
function EventListRow({
  event,
  onOpen,
  isSaved,
  onToggleSave,
  index,
}: {
  event: EventItem;
  onOpen: () => void;
  isSaved: boolean;
  onToggleSave: () => void;
  index: number;
}) {
  const priceLines = formatPriceLines(event.price);
  const instagramUrl = getInstagramLink(event);
  const daysTag = getDaysUntil(event);
  const isFest = isFestivalEvent(event);
  const totalDays = getEventDates(event).length;

  return (
    <article
      className={`group rounded-2xl border ${isFest ? "border-[var(--fest-border)] bg-[var(--fest-bg)]" : "border-[var(--line)] bg-[var(--panel)]"} hover-card animate-fade-in p-4 transition md:p-5`}
      style={{ animationDelay: `${Math.min(index * 0.04, 0.4)}s` }}
    >
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left">
          {/* Date + D-Day Tag */}
          <div className="mb-2 flex items-center gap-2">
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

          {/* Title */}
          <h3 className="text-lg font-bold leading-snug tracking-[-0.02em] text-white transition-colors duration-300 group-hover:text-[var(--accent)] md:text-xl">
            {event.title || "제목 없는 공연"}
          </h3>

          {/* Info Grid */}
          <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-sm">
            {event.venueName && (
              <div className="flex items-center gap-1.5">
                <span className="text-[var(--muted)]">📍</span>
                <span className="text-[var(--text-secondary)]">{event.venueName}</span>
              </div>
            )}
            {event.artistNames && (
              <div className="flex min-w-0 items-start gap-1.5">
                <span className="shrink-0 text-[var(--muted)]">🎤</span>
                <span className="line-clamp-1 break-words text-[var(--text-secondary)]">{event.artistNames}</span>
              </div>
            )}
            {priceLines.length > 0 && (
              <div className="flex items-center gap-1.5">
                <span className="text-[var(--muted)]">🎫</span>
                <span className="font-semibold text-white">{priceLines[0]}</span>
              </div>
            )}
          </div>
        </button>

        {/* Action Buttons */}
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleSave();
            }}
            className={`secondary-btn text-xs ${isSaved ? "border-[var(--accent-border)] bg-[var(--accent-soft)] text-[var(--accent)]" : ""}`}
          >
            {isSaved ? "★ 저장됨" : "☆ 저장"}
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

/* ─── Schedule Row (Compact) ─── */
function ScheduleRow({
  event,
  onOpen,
  isSaved,
  onToggleSave,
  forDate,
}: {
  event: EventItem;
  onOpen: () => void;
  isSaved: boolean;
  onToggleSave: () => void;
  forDate?: string; // 달력에서 선택한 날짜 — 페스티벌은 그날의 라인업만 표시
}) {
  const priceLines = formatPriceLines(event.price);
  const instagramUrl = getInstagramLink(event);
  const isFest = isFestivalEvent(event);
  const dayLineup = forDate ? getLineupForDate(event, forDate) : "";
  const lineupText = dayLineup || event.artistNames;

  return (
    <div className={`overflow-hidden rounded-2xl border ${isFest ? "border-[var(--fest-border)] bg-[var(--fest-bg)]" : "border-[var(--line)] bg-[var(--panel-2)]"} hover-card p-3 transition`}>
      <button type="button" onClick={onOpen} className="block w-full min-w-0 text-left">
        <p className="text-[11px] font-medium text-[var(--muted)]">{formatSchedule(event)}</p>
        <p className="mt-1 text-sm font-semibold leading-snug text-white">{event.title || "제목 없는 공연"}</p>

        <div className="mt-2 space-y-1.5">
          {event.venueName && (
            <p className="text-xs text-[var(--text-secondary)]">📍 {event.venueName}</p>
          )}
          {lineupText && (
            <p className="line-clamp-2 text-xs text-[var(--text-secondary)]">
              🎤 {dayLineup && <span className="font-semibold text-[var(--accent)]">이날 라인업 · </span>}
              {lineupText}
            </p>
          )}
          {priceLines.length > 0 && (
            <p className="text-xs font-semibold text-white">🎫 {priceLines.join(" / ")}</p>
          )}
        </div>
      </button>

      <div className="mt-3 flex gap-1.5 border-t border-[var(--line)] pt-2.5">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleSave();
          }}
          className={`secondary-btn h-8 text-[11px] ${isSaved ? "border-[var(--accent-border)] bg-[var(--accent-soft)] text-[var(--accent)]" : ""}`}
        >
          {isSaved ? "★" : "☆"}
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
