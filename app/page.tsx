"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Script from "next/script";
import { collection, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase/firestore";

declare global {
  interface Window {
    kakao?: any;
  }
}

type EventItem = {
  id: string;
  title?: string;
  date?: string;
  time?: string;
  venueName?: string;
  artistNames?: string;
  sourceUrl?: string;
  price?: string;
  posterUrl?: string;
};

const KAKAO_KEY = process.env.NEXT_PUBLIC_KAKAO_MAP_API_KEY;
const BRAND_TITLE = "라이브클럽 · 인디공연장 일정";
const BRAND_SUBTITLE = "인디공연장, 라이브클럽, 밴드 공연 일정을 목록·지도·달력으로 한 번에 확인하세요.";
const SEOUL_CENTER = { lat: 37.5547, lng: 126.9226 };

function formatExternalUrl(value?: string) {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) return trimmed;
  if (trimmed.startsWith("@")) return `https://instagram.com/${trimmed.slice(1)}`;
  if (/^(www\.)?[\w.-]+\.[a-z]{2,}(\/.*)?$/i.test(trimmed) && !trimmed.includes(" ")) {
    return `https://${trimmed}`;
  }
  return null;
}

function formatPriceLines(value?: string) {
  if (!value) return [] as string[];
  let normalized = value
    .replace(/\s*\/\s*/g, ", ")
    .replace(/\s*\|\s*/g, ", ")
    .replace(/\s*·\s*/g, ", ");

  normalized = normalized
    .replace(/\s*,\s*(?=(예매|현매|예판|당일|door))/gi, "\n")
    .replace(/(?<!^)(?=(예매|현매|예판|당일|door))/gi, "\n");

  const parts = normalized
    .split(/\n|,(?=\s*(예매|현매|예판|당일|door|무료|일반|학생))/i)
    .map((part) => part.trim())
    .filter(Boolean);

  return parts.length > 0 ? parts : [value.trim()];
}

function parseEventTimestamp(date?: string, time?: string) {
  if (!date) return Number.POSITIVE_INFINITY;

  const parts = date.split("-");
  if (parts.length !== 3) return Number.POSITIVE_INFINITY;

  const [rawYear, rawMonth, rawDay] = parts;
  const year = rawYear.length === 2 ? `20${rawYear}` : rawYear;
  const month = rawMonth.padStart(2, "0");
  const day = rawDay.padStart(2, "0");
  const clock = time?.trim() ? time.trim() : "23:59";
  const parsed = new Date(`${year}-${month}-${day}T${clock}`);

  return Number.isNaN(parsed.getTime()) ? Number.POSITIVE_INFINITY : parsed.getTime();
}

function normalizeDateKey(date?: string) {
  if (!date) return "";
  const parts = date.split("-");
  if (parts.length !== 3) return date;
  const [rawYear, rawMonth, rawDay] = parts;
  const year = rawYear.length === 2 ? `20${rawYear}` : rawYear;
  return `${year}-${rawMonth.padStart(2, "0")}-${rawDay.padStart(2, "0")}`;
}

function formatDateLabel(date?: string) {
  const normalized = normalizeDateKey(date);
  if (!normalized) return "일정 미정";

  const parsed = new Date(`${normalized}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return date ?? "일정 미정";

  return new Intl.DateTimeFormat("ko-KR", {
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(parsed);
}

function venueSearchQueries(venueName: string) {
  return Array.from(
    new Set([
      venueName,
      `${venueName} 공연장`,
      `${venueName} 라이브클럽`,
      `${venueName} 서울`,
      `${venueName} 홍대`,
    ])
  );
}

export default function Home() {
  const [events, setEvents] = useState<EventItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<"list" | "map" | "calendar">("list");
  const [mapLoaded, setMapLoaded] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const [selectedVenue, setSelectedVenue] = useState<string | null>(null);
  const [selectedDateEvents, setSelectedDateEvents] = useState<{ label: string; events: EventItem[] } | null>(null);
  const [currentMonth, setCurrentMonth] = useState(new Date());

  useEffect(() => {
    const fetchEvents = async () => {
      try {
        const snapshot = await getDocs(collection(db, "events"));
        const items = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...(doc.data() as Omit<EventItem, "id">),
        }));
        setEvents(items);
      } catch (error) {
        console.error("데이터 로딩 에러:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchEvents();
  }, []);

  const filteredEvents = useMemo(() => {
    if (!searchQuery.trim()) return events;
    const query = searchQuery.toLowerCase();

    return events.filter((event) => {
      return [event.title, event.venueName, event.artistNames]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(query));
    });
  }, [events, searchQuery]);

  const sortedEvents = useMemo(
    () => [...filteredEvents].sort((a, b) => parseEventTimestamp(a.date, a.time) - parseEventTimestamp(b.date, b.time)),
    [filteredEvents]
  );

  const venueBuckets = useMemo(() => {
    const bucket = new Map<string, EventItem[]>();
    sortedEvents.forEach((event) => {
      if (!event.venueName) return;
      const key = event.venueName.trim();
      bucket.set(key, [...(bucket.get(key) ?? []), event]);
    });

    return Array.from(bucket.entries())
      .map(([venueName, eventsForVenue]) => ({ venueName, events: eventsForVenue }))
      .sort((a, b) => b.events.length - a.events.length || a.venueName.localeCompare(b.venueName));
  }, [sortedEvents]);

  const summary = useMemo(() => {
    const now = new Date();
    const thisMonth = sortedEvents.filter((event) => {
      const normalized = normalizeDateKey(event.date);
      if (!normalized) return false;
      return normalized.startsWith(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);
    }).length;

    return {
      totalEvents: sortedEvents.length,
      totalVenues: venueBuckets.length,
      thisMonth,
    };
  }, [sortedEvents, venueBuckets.length]);

  useEffect(() => {
    if (viewMode !== "map") return;
    if (!KAKAO_KEY) {
      setMapError("카카오 지도 API 키가 없어 지도를 불러올 수 없어요.");
      return;
    }
    if (!mapLoaded || !window.kakao?.maps) return;

    let cancelled = false;
    const markers: any[] = [];
    const overlays: any[] = [];

    setMapError(null);

    window.kakao.maps.load(() => {
      if (cancelled) return;

      const container = document.getElementById("kakao-map");
      if (!container) return;

      const map = new window.kakao.maps.Map(container, {
        center: new window.kakao.maps.LatLng(SEOUL_CENTER.lat, SEOUL_CENTER.lng),
        level: 6,
      });

      const places = new window.kakao.maps.services.Places();
      const bounds = new window.kakao.maps.LatLngBounds();

      if (venueBuckets.length === 0) {
        setMapError("표시할 공연장 정보가 없어요.");
        return;
      }

      let pending = venueBuckets.length;
      let successCount = 0;

      const finishSearch = () => {
        pending -= 1;
        if (pending === 0) {
          if (successCount > 0) {
            map.setBounds(bounds);
          } else {
            setMapError("공연장 위치를 찾지 못했어요. 장소명을 조금 더 구체적으로 입력해보세요.");
          }
        }
      };

      venueBuckets.forEach(({ venueName, events: venueEvents }) => {
        const queries = venueSearchQueries(venueName);

        const searchVenue = (index: number) => {
          if (cancelled) return;
          if (index >= queries.length) {
            finishSearch();
            return;
          }

          places.keywordSearch(
            queries[index],
            (data: any, status: any) => {
              if (cancelled) return;

              if (status === window.kakao.maps.services.Status.OK && data?.length) {
                const first = data[0];
                const position = new window.kakao.maps.LatLng(Number(first.y), Number(first.x));

                const marker = new window.kakao.maps.Marker({ map, position });
                markers.push(marker);
                bounds.extend(position);
                successCount += 1;

                const overlay = new window.kakao.maps.CustomOverlay({
                  position,
                  yAnchor: 1.75,
                  content: `<div class="kakao-overlay-chip">${venueName}<span>${venueEvents.length}</span></div>`,
                });
                overlay.setMap(map);
                overlays.push(overlay);

                window.kakao.maps.event.addListener(marker, "click", () => {
                  setSelectedVenue(venueName);
                });

                finishSearch();
                return;
              }

              searchVenue(index + 1);
            },
            {
              location: new window.kakao.maps.LatLng(SEOUL_CENTER.lat, SEOUL_CENTER.lng),
              radius: 20000,
              size: 5,
            }
          );
        };

        searchVenue(0);
      });
    });

    return () => {
      cancelled = true;
      markers.forEach((marker) => marker.setMap(null));
      overlays.forEach((overlay) => overlay.setMap(null));
    };
  }, [viewMode, mapLoaded, venueBuckets]);

  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayOfMonth = new Date(year, month, 1).getDay();

  const eventsByDate = useMemo(() => {
    const dateMap = new Map<string, EventItem[]>();
    sortedEvents.forEach((event) => {
      const key = normalizeDateKey(event.date);
      if (!key) return;
      dateMap.set(key, [...(dateMap.get(key) ?? []), event]);
    });
    return dateMap;
  }, [sortedEvents]);

  const selectedVenueEvents = selectedVenue
    ? sortedEvents.filter((event) => event.venueName === selectedVenue)
    : [];

  return (
    <main className="min-h-screen text-slate-50 selection:bg-blue-500/30">
      {KAKAO_KEY ? (
        <Script
          src={`https://dapi.kakao.com/v2/maps/sdk.js?appkey=${KAKAO_KEY}&libraries=services&autoload=false`}
          strategy="afterInteractive"
          onLoad={() => setMapLoaded(true)}
          onError={() => setMapError("카카오 지도 스크립트를 불러오지 못했어요. 도메인 설정과 API 키를 확인해주세요.")}
        />
      ) : null}

      <div className="mx-auto max-w-6xl px-4 py-8 md:px-6 md:py-12">
        <section className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-[linear-gradient(135deg,rgba(17,24,39,0.92),rgba(15,23,42,0.82))] px-6 py-8 shadow-[0_30px_80px_rgba(2,6,23,0.45)] md:px-10 md:py-10">
          <div className="absolute -right-16 top-0 h-56 w-56 rounded-full bg-blue-500/20 blur-3xl" />
          <div className="absolute bottom-0 left-0 h-40 w-40 rounded-full bg-cyan-400/10 blur-3xl" />

          <div className="relative grid gap-8 lg:grid-cols-[1.3fr_0.9fr] lg:items-end">
            <div>
              <span className="inline-flex items-center rounded-full border border-blue-400/30 bg-blue-400/10 px-3 py-1 text-xs font-semibold tracking-wide text-blue-200">
                LIVE CLUBS · INDIE SHOWS
              </span>
              <h1 className="mt-4 text-3xl font-semibold tracking-tight text-white md:text-5xl">
                {BRAND_TITLE}
              </h1>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-300 md:text-base">
                {BRAND_SUBTITLE}
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
              <SummaryCard label="전체 공연" value={`${summary.totalEvents}개`} hint="현재 목록 기준" />
              <SummaryCard label="공연장" value={`${summary.totalVenues}곳`} hint="중복 제거 기준" />
              <SummaryCard label="이번 달" value={`${summary.thisMonth}개`} hint="이번 달 일정" />
            </div>
          </div>
        </section>

        <section className="mt-6 grid gap-4 rounded-[1.75rem] border border-white/8 bg-white/5 p-4 backdrop-blur md:grid-cols-[1fr_auto] md:items-center md:p-5">
          <div className="relative">
            <input
              type="text"
              placeholder="공연명, 장소, 아티스트 검색"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-4 text-sm text-white outline-none transition focus:border-blue-400/40 focus:bg-black/40 md:text-base"
            />
          </div>

          <div className="grid grid-cols-3 gap-2 rounded-2xl bg-black/20 p-1">
            <ViewButton active={viewMode === "list"} onClick={() => setViewMode("list")}>목록</ViewButton>
            <ViewButton active={viewMode === "map"} onClick={() => setViewMode("map")}>지도</ViewButton>
            <ViewButton active={viewMode === "calendar"} onClick={() => setViewMode("calendar")}>달력</ViewButton>
          </div>
        </section>

        {loading ? (
          <section className="mt-8 rounded-[2rem] border border-white/8 bg-white/5 p-16 text-center text-slate-300">
            공연 데이터를 불러오고 있어요.
          </section>
        ) : sortedEvents.length === 0 ? (
          <section className="mt-8 rounded-[2rem] border border-white/8 bg-white/5 p-16 text-center">
            <h2 className="text-xl font-semibold text-white">검색 결과가 없어요.</h2>
            <p className="mt-2 text-sm text-slate-400">다른 공연명이나 공연장 이름으로 다시 검색해보세요.</p>
          </section>
        ) : (
          <section className="mt-8">
            {viewMode === "list" && (
              <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
                {sortedEvents.map((event) => (
                  <EventCard key={event.id} event={event} />
                ))}
              </div>
            )}

            {viewMode === "map" && (
              <div className="grid gap-5 lg:grid-cols-[1.45fr_0.75fr]">
                <div className="overflow-hidden rounded-[2rem] border border-white/8 bg-[#121826] shadow-[0_20px_60px_rgba(2,6,23,0.35)]">
                  <div className="flex items-center justify-between border-b border-white/8 px-5 py-4">
                    <div>
                      <h2 className="text-lg font-semibold text-white">공연장 지도</h2>
                      <p className="mt-1 text-xs text-slate-400">마커를 누르면 해당 공연장 일정을 볼 수 있어요.</p>
                    </div>
                    <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300">
                      {venueBuckets.length}개 공연장
                    </span>
                  </div>

                  <div className="relative h-[560px] bg-[#0f172a]">
                    {!mapLoaded && !mapError && (
                      <div className="absolute inset-0 flex items-center justify-center text-sm text-slate-300">
                        지도를 불러오는 중입니다.
                      </div>
                    )}
                    {mapError && (
                      <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-[#0f172a]/90 px-6 text-center">
                        <p className="text-base font-semibold text-white">지도를 표시할 수 없어요.</p>
                        <p className="max-w-sm text-sm leading-6 text-slate-300">{mapError}</p>
                      </div>
                    )}
                    <div id="kakao-map" className="h-full w-full" />
                  </div>
                </div>

                <aside className="flex h-full flex-col gap-4">
                  <div className="rounded-[2rem] border border-white/8 bg-white/5 p-5">
                    <h3 className="text-base font-semibold text-white">지도 사용 팁</h3>
                    <p className="mt-2 text-sm leading-6 text-slate-400">
                      지도가 비어 있으면 카카오 지도 키가 배포 환경에 들어가 있는지, 그리고 그 키의 허용 도메인에 현재 Vercel 주소가 등록되어 있는지 먼저 확인하세요.
                    </p>
                  </div>

                  <div className="rounded-[2rem] border border-white/8 bg-white/5 p-5">
                    <h3 className="text-base font-semibold text-white">공연장 리스트</h3>
                    <div className="mt-4 max-h-[380px] space-y-3 overflow-y-auto pr-1 custom-scrollbar">
                      {venueBuckets.map(({ venueName, events: venueEvents }) => {
                        const active = selectedVenue === venueName;
                        return (
                          <button
                            key={venueName}
                            onClick={() => setSelectedVenue(venueName)}
                            className={`w-full rounded-2xl border px-4 py-3 text-left transition ${
                              active
                                ? "border-blue-400/40 bg-blue-400/10"
                                : "border-white/8 bg-black/20 hover:border-white/15 hover:bg-black/30"
                            }`}
                          >
                            <div className="flex items-center justify-between gap-3">
                              <span className="font-medium text-white">{venueName}</span>
                              <span className="rounded-full bg-white/8 px-2.5 py-1 text-xs text-slate-300">
                                {venueEvents.length}개
                              </span>
                            </div>
                            <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-400">
                              {venueEvents.map((event) => event.title).filter(Boolean).join(" · ")}
                            </p>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </aside>
              </div>
            )}

            {viewMode === "calendar" && (
              <div className="rounded-[2rem] border border-white/8 bg-white/5 p-5 shadow-[0_20px_60px_rgba(2,6,23,0.24)] md:p-7">
                <div className="mb-6 flex items-center justify-between gap-4 border-b border-white/8 pb-5">
                  <button
                    onClick={() => setCurrentMonth(new Date(year, month - 1, 1))}
                    className="rounded-full border border-white/10 bg-black/20 px-4 py-2 text-sm text-white transition hover:bg-black/35"
                  >
                    이전
                  </button>
                  <div className="text-center">
                    <h2 className="text-2xl font-semibold text-white">{year}년 {month + 1}월</h2>
                    <p className="mt-1 text-sm text-slate-400">날짜를 누르면 해당 일자의 공연 목록이 열립니다.</p>
                  </div>
                  <button
                    onClick={() => setCurrentMonth(new Date(year, month + 1, 1))}
                    className="rounded-full border border-white/10 bg-black/20 px-4 py-2 text-sm text-white transition hover:bg-black/35"
                  >
                    다음
                  </button>
                </div>

                <div className="grid grid-cols-7 gap-2 text-center text-xs font-semibold text-slate-400 md:gap-3 md:text-sm">
                  {["일", "월", "화", "수", "목", "금", "토"].map((day) => (
                    <div key={day} className="py-2">{day}</div>
                  ))}
                </div>

                <div className="mt-2 grid grid-cols-7 gap-2 md:gap-3">
                  {Array.from({ length: firstDayOfMonth }).map((_, index) => (
                    <div key={`empty-${index}`} className="aspect-[0.95] rounded-2xl border border-transparent" />
                  ))}

                  {Array.from({ length: daysInMonth }).map((_, index) => {
                    const day = index + 1;
                    const key = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                    const dayEvents = eventsByDate.get(key) ?? [];

                    return (
                      <button
                        key={key}
                        onClick={() => {
                          if (dayEvents.length === 0) return;
                          setSelectedDateEvents({
                            label: new Intl.DateTimeFormat("ko-KR", {
                              year: "numeric",
                              month: "long",
                              day: "numeric",
                              weekday: "short",
                            }).format(new Date(`${key}T00:00:00`)),
                            events: dayEvents,
                          });
                        }}
                        className={`aspect-[0.95] rounded-2xl border p-2 text-left transition md:p-3 ${
                          dayEvents.length > 0
                            ? "border-blue-400/20 bg-blue-400/10 hover:border-blue-300/40 hover:bg-blue-400/15"
                            : "border-white/8 bg-black/10"
                        }`}
                      >
                        <div className="flex h-full flex-col justify-between">
                          <span className="text-sm font-semibold text-white md:text-base">{day}</span>
                          <div>
                            {dayEvents.length > 0 ? (
                              <>
                                <span className="inline-flex rounded-full bg-blue-500 px-2 py-1 text-[10px] font-semibold text-white md:text-xs">
                                  {dayEvents.length}개 일정
                                </span>
                                <p className="mt-2 line-clamp-2 text-[10px] leading-4 text-slate-200 md:text-xs md:leading-5">
                                  {dayEvents.slice(0, 2).map((event) => event.title).filter(Boolean).join(" · ")}
                                </p>
                              </>
                            ) : (
                              <span className="text-[10px] text-slate-500 md:text-xs">일정 없음</span>
                            )}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </section>
        )}

        {selectedVenue && selectedVenueEvents.length > 0 && (
          <Modal title={`${selectedVenue} 일정`} onClose={() => setSelectedVenue(null)}>
            <div className="space-y-4">
              {selectedVenueEvents.map((event) => (
                <EventCard key={event.id} event={event} compact />
              ))}
            </div>
          </Modal>
        )}

        {selectedDateEvents && (
          <Modal title={selectedDateEvents.label} onClose={() => setSelectedDateEvents(null)}>
            <div className="space-y-4">
              {selectedDateEvents.events.map((event) => (
                <EventCard key={event.id} event={event} compact />
              ))}
            </div>
          </Modal>
        )}
      </div>
    </main>
  );
}

function SummaryCard({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-[1.5rem] border border-white/10 bg-white/6 p-4 backdrop-blur">
      <p className="text-xs font-medium uppercase tracking-[0.14em] text-slate-400">{label}</p>
      <p className="mt-3 text-2xl font-semibold text-white">{value}</p>
      <p className="mt-1 text-xs text-slate-400">{hint}</p>
    </div>
  );
}

function ViewButton({
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
      onClick={onClick}
      className={`rounded-xl px-4 py-3 text-sm font-semibold transition ${
        active ? "bg-blue-500 text-white shadow-lg shadow-blue-500/20" : "text-slate-300 hover:bg-white/8"
      }`}
    >
      {children}
    </button>
  );
}

function EventCard({ event, compact = false }: { event: EventItem; compact?: boolean }) {
  const externalUrl = formatExternalUrl(event.sourceUrl);
  const priceLines = formatPriceLines(event.price);

  return (
    <Link
      href={`/events/${event.id}`}
      className={`group block overflow-hidden rounded-[1.75rem] border border-white/8 bg-[linear-gradient(180deg,rgba(18,24,38,0.95),rgba(9,12,18,0.95))] p-5 shadow-[0_20px_50px_rgba(2,6,23,0.28)] transition duration-200 hover:-translate-y-1 hover:border-blue-400/25 hover:shadow-[0_28px_70px_rgba(2,6,23,0.36)] ${compact ? "p-4" : ""}`}
    >
      {event.posterUrl ? (
        <div className={`overflow-hidden rounded-[1.3rem] bg-black/25 ${compact ? "mb-4 aspect-[16/10]" : "mb-5 aspect-[5/4]"}`}>
          <img src={event.posterUrl} alt={event.title || "공연 포스터"} className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]" referrerPolicy="no-referrer" />
        </div>
      ) : (
        <div className={`mb-5 flex items-center justify-center rounded-[1.3rem] border border-dashed border-white/10 bg-white/5 text-sm text-slate-400 ${compact ? "aspect-[16/10]" : "aspect-[5/4]"}`}>
          포스터 이미지 없음
        </div>
      )}

      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-200/80">
            {formatDateLabel(event.date)}
          </p>
          <h2 className={`mt-2 font-semibold leading-snug text-white ${compact ? "text-lg" : "text-xl"}`}>
            {event.title || "제목 없는 공연"}
          </h2>
        </div>
        {externalUrl ? (
          <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-medium text-slate-300">
            예매/원문 있음
          </span>
        ) : null}
      </div>

      <div className="mt-5 space-y-3 text-sm text-slate-300">
        <InfoRow label="시간" value={[event.date, event.time].filter(Boolean).join(" ") || "미정"} />
        <InfoRow label="장소" value={event.venueName || "미정"} />
        <InfoRow label="출연" value={event.artistNames || "추가 예정"} clamp />
      </div>

      {priceLines.length > 0 && (
        <div className="mt-5 rounded-[1.2rem] border border-blue-400/15 bg-blue-400/8 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-200">티켓</p>
          <div className="mt-3 space-y-2">
            {priceLines.map((line) => (
              <p key={line} className="text-sm font-semibold text-white">
                {line}
              </p>
            ))}
          </div>
        </div>
      )}

      <div className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-blue-200">
        상세 보기
        <span className="transition group-hover:translate-x-1">→</span>
      </div>
    </Link>
  );
}

function InfoRow({ label, value, clamp = false }: { label: string; value: string; clamp?: boolean }) {
  return (
    <div className="flex gap-4">
      <span className="w-10 shrink-0 text-slate-500">{label}</span>
      <span className={`text-white ${clamp ? "line-clamp-2" : ""}`}>{value}</span>
    </div>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-3xl rounded-[2rem] border border-white/10 bg-[#0b1020] p-5 shadow-[0_30px_80px_rgba(2,6,23,0.56)] md:p-6">
        <div className="mb-5 flex items-center justify-between gap-4">
          <h2 className="text-xl font-semibold text-white">{title}</h2>
          <button
            onClick={onClose}
            className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-slate-200 transition hover:bg-white/10"
          >
            닫기
          </button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto pr-1 custom-scrollbar">{children}</div>
      </div>
    </div>
  );
}
