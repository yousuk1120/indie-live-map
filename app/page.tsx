"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Script from "next/script";
import { useRouter } from "next/navigation";
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

type VenueBucket = {
  venueName: string;
  events: EventItem[];
};

const DEFAULT_CENTER = { lat: 37.5559, lng: 126.9234 };

function toText(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(toText).filter(Boolean).join(", ");
  if (typeof value === "object") return Object.values(value as Record<string, unknown>).map(toText).filter(Boolean).join(", ");
  return "";
}

function normalizeDate(date?: string) {
  const value = toText(date);
  if (!value) return "";
  const parts = value.split("-");
  if (parts.length !== 3) return value;
  const [yy, mm, dd] = parts;
  const year = yy.length === 2 ? `20${yy}` : yy;
  return `${year}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
}

function eventTimestamp(event: EventItem) {
  const date = normalizeDate(event.date);
  if (!date) return Number.POSITIVE_INFINITY;
  const time = toText(event.time) || "23:59";
  const parsed = new Date(`${date}T${time}`);
  return Number.isNaN(parsed.getTime()) ? Number.POSITIVE_INFINITY : parsed.getTime();
}

function formatSchedule(event: EventItem) {
  const date = normalizeDate(event.date);
  const time = toText(event.time);
  if (!date) return "일정 미정";

  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return [toText(event.date), time].filter(Boolean).join(" · ") || "일정 미정";

  const week = ["일", "월", "화", "수", "목", "금", "토"][parsed.getDay()];
  return `${parsed.getMonth() + 1}.${parsed.getDate()} (${week})${time ? ` · ${time}` : ""}`;
}

function formatExternalUrl(value?: string) {
  const raw = toText(value);
  if (!raw) return "";
  if (raw.startsWith("http://") || raw.startsWith("https://")) return raw;
  if (raw.startsWith("@")) return `https://www.instagram.com/${raw.slice(1)}`;
  if (/^(www\.)?[\w.-]+\.[a-z]{2,}(\/.*)?$/i.test(raw) && !raw.includes(" ")) return `https://${raw}`;
  return "";
}

function formatPriceLines(value?: string): string[] {
  const raw = toText(value);
  if (!raw) return [] as string[];

  const flattened = raw
    .replace(/\r?\n/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\s*\/\s*/g, "\n")
    .replace(/\s*\|\s*/g, "\n")
    .replace(/\s*·\s*/g, "\n")
    .replace(/(?<!^)\s*(예매|현매|예판|당일|door)\s*[:：]?\s*/gi, "\n$1 ")
    .replace(/\n+/g, "\n")
    .trim();

  const lines = flattened
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line: string) => {
      const priceMatch = line.match(/(\d[\d,\s]*\d|\d)\s*원/i);
      let next = line;

      if (priceMatch) {
        const digits = priceMatch[1].replace(/[^\d]/g, "");
        if (digits) {
          next = next.replace(priceMatch[0], `${Number(digits).toLocaleString("ko-KR")}원`);
        }
      }

      next = next.replace(/^(예매|현매|예판|당일|door)\s*/i, (_match: string, label: string) => `${label} `);
      return next.replace(/\s{2,}/g, " ").trim();
    });

  return Array.from(new Set(lines));
}

function isValidPoster(url?: string) {
  const value = toText(url);
  return !!value && !value.startsWith("data:") && (value.startsWith("http://") || value.startsWith("https://"));
}

function venueSearchCandidates(venueName: string) {
  const value = toText(venueName);
  return Array.from(new Set([value, `${value} 라이브클럽`, `${value} 공연장`, `${value} 서울`, `${value} 홍대`].filter(Boolean)));
}

function normalizeEvent(id: string, raw: Record<string, unknown>): EventItem {
  return {
    id,
    title: toText(raw.title),
    date: toText(raw.date),
    time: toText(raw.time),
    venueName: toText(raw.venueName),
    artistNames: toText(raw.artistNames),
    sourceUrl: toText(raw.sourceUrl),
    price: toText(raw.price),
    posterUrl: toText(raw.posterUrl),
  };
}

export default function Home() {
  const router = useRouter();
  const [events, setEvents] = useState<EventItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<"list" | "map" | "calendar">("list");
  const [mapLoaded, setMapLoaded] = useState(false);
  const [mapError, setMapError] = useState("");
  const [activeVenue, setActiveVenue] = useState<string>("");
  const [activeDate, setActiveDate] = useState<string>("");
  const [currentMonth, setCurrentMonth] = useState(new Date());

  const mapRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const overlaysRef = useRef<any[]>([]);

  const kakaoKey = process.env.NEXT_PUBLIC_KAKAO_MAP_API_KEY;

  useEffect(() => {
    const fetchEvents = async () => {
      try {
        const snapshot = await getDocs(collection(db, "events"));
        const next = snapshot.docs.map((doc) => normalizeEvent(doc.id, doc.data() as Record<string, unknown>));
        setEvents(next);
        setLoadError("");
      } catch (error) {
        console.error("공연 데이터 로딩 실패:", error);
        setLoadError("공연 데이터를 불러오지 못했습니다.");
      } finally {
        setLoading(false);
      }
    };

    fetchEvents();
  }, []);

  const filteredEvents = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return events;

    return events.filter((event) =>
      [event.title, event.venueName, event.artistNames]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(q))
    );
  }, [events, searchQuery]);

  const sortedEvents = useMemo(
    () => [...filteredEvents].sort((a, b) => eventTimestamp(a) - eventTimestamp(b)),
    [filteredEvents]
  );

  const venueBuckets = useMemo(() => {
    const map = new Map<string, EventItem[]>();
    sortedEvents.forEach((event) => {
      const venue = toText(event.venueName);
      if (!venue) return;
      map.set(venue, [...(map.get(venue) ?? []), event]);
    });

    return Array.from(map.entries()).map(([venueName, bucketEvents]) => ({
      venueName,
      events: bucketEvents,
    }));
  }, [sortedEvents]);

  const activeVenueBucket = useMemo(() => {
    const venue = activeVenue || venueBuckets[0]?.venueName || "";
    return venueBuckets.find((bucket) => bucket.venueName === venue) ?? null;
  }, [activeVenue, venueBuckets]);

  useEffect(() => {
    if (!activeVenueBucket && venueBuckets[0]?.venueName) {
      setActiveVenue(venueBuckets[0].venueName);
    }
  }, [activeVenueBucket, venueBuckets]);

  const highlightedEvent = sortedEvents[0] ?? null;
  const cardEvents = highlightedEvent ? sortedEvents.slice(1) : sortedEvents;

  useEffect(() => {
    if (viewMode !== "map") return;
    if (!kakaoKey) {
      setMapError("NEXT_PUBLIC_KAKAO_MAP_API_KEY를 확인하세요.");
      return;
    }
    if (!mapLoaded || !window.kakao?.maps || !mapRef.current) return;

    let cancelled = false;
    let initialized = false;
    setMapError("");

    const timer = window.setTimeout(() => {
      if (!initialized && !cancelled) {
        setMapError("지도 초기화에 실패했습니다. 카카오 Developers에 현재 도메인을 등록했는지 확인하세요.");
      }
    }, 3000);

    window.kakao.maps.load(() => {
      initialized = true;
      window.clearTimeout(timer);
      if (cancelled || !mapRef.current) return;

      const map = new window.kakao.maps.Map(mapRef.current, {
        center: new window.kakao.maps.LatLng(DEFAULT_CENTER.lat, DEFAULT_CENTER.lng),
        level: 6,
      });

      mapInstanceRef.current = map;

      markersRef.current.forEach((marker) => marker.setMap(null));
      overlaysRef.current.forEach((overlay) => overlay.setMap(null));
      markersRef.current = [];
      overlaysRef.current = [];

      const bounds = new window.kakao.maps.LatLngBounds();
      const places = new window.kakao.maps.services.Places();

      if (!venueBuckets.length) {
        setMapError("지도에 표시할 공연장이 없습니다.");
        return;
      }

      let resolved = 0;
      let found = 0;

      const finishOne = () => {
        resolved += 1;
        if (resolved === venueBuckets.length) {
          if (found > 0) {
            map.setBounds(bounds);
            setMapError("");
          } else {
            setMapError("공연장 좌표를 찾지 못했습니다. 카카오 도메인 설정과 장소명을 확인하세요.");
          }
        }
      };

      venueBuckets.forEach((bucket) => {
        const queries = venueSearchCandidates(bucket.venueName);

        const searchAt = (index: number) => {
          if (cancelled) return;
          if (index >= queries.length) {
            finishOne();
            return;
          }

          places.keywordSearch(queries[index], (data: any, status: any) => {
            if (cancelled) return;

            if (status === window.kakao.maps.services.Status.OK && data?.length) {
              const first = data[0];
              const position = new window.kakao.maps.LatLng(Number(first.y), Number(first.x));
              const marker = new window.kakao.maps.Marker({ map, position });
              markersRef.current.push(marker);
              bounds.extend(position);
              found += 1;

              const overlay = new window.kakao.maps.CustomOverlay({
                position,
                yAnchor: 1.6,
                content: `<button class="kakao-dot-label">${bucket.venueName}</button>`,
              });
              overlay.setMap(map);
              overlaysRef.current.push(overlay);

              window.kakao.maps.event.addListener(marker, "click", () => {
                setActiveVenue(bucket.venueName);
              });

              finishOne();
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
      window.clearTimeout(timer);
    };
  }, [viewMode, mapLoaded, kakaoKey, venueBuckets]);

  const calendarDays = useMemo(() => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells: Array<{ day: number; key: string; events: EventItem[] } | null> = [];

    for (let i = 0; i < firstDay; i += 1) cells.push(null);

    for (let day = 1; day <= daysInMonth; day += 1) {
      const key = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const dayEvents = sortedEvents.filter((event) => normalizeDate(event.date) === key);
      cells.push({ day, key, events: dayEvents });
    }

    return cells;
  }, [currentMonth, sortedEvents]);

  const selectedDateEvents = useMemo(() => {
    if (!activeDate) return [] as EventItem[];
    return sortedEvents.filter((event) => normalizeDate(event.date) === activeDate);
  }, [activeDate, sortedEvents]);

  return (
    <main className="min-h-screen px-4 pb-14 pt-6 md:px-8 md:pb-20 md:pt-8">
      {kakaoKey ? (
        <Script
          src={`https://dapi.kakao.com/v2/maps/sdk.js?appkey=${kakaoKey}&libraries=services&autoload=false`}
          strategy="afterInteractive"
          onLoad={() => setMapLoaded(true)}
          onError={() => setMapError("카카오 지도 스크립트를 불러오지 못했습니다.")}
        />
      ) : null}

      <div className="mx-auto max-w-[1440px] space-y-8">
        <header className="site-shell overflow-hidden rounded-[32px] px-5 py-5 md:px-7 md:py-6">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-300">
                <span className="h-2 w-2 rounded-full bg-cyan-300" />
                Live Club Schedule
              </div>
              <h1 className="max-w-4xl text-[44px] font-black leading-[0.92] tracking-[-0.06em] text-white md:text-[72px] lg:text-[92px]">
                라이브클럽과
                <br />
                인디공연장 일정
              </h1>
            </div>

            <div className="flex flex-wrap items-center gap-3 lg:justify-end">
              <Link
                href="/admin"
                className="inline-flex h-11 items-center rounded-full border border-white/10 bg-white/5 px-5 text-sm font-semibold text-white transition hover:bg-white/10"
              >
                Admin
              </Link>
            </div>
          </div>
        </header>

        <section className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="site-shell rounded-[32px] p-4 md:p-5">
            <div className="grid gap-3 md:grid-cols-[1fr_auto]">
              <div className="rounded-[24px] border border-white/10 bg-black/20 px-4 py-3">
                <input
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="공연명, 공연장, 아티스트 검색"
                  className="w-full bg-transparent text-base text-white outline-none placeholder:text-slate-500"
                />
              </div>
              <div className="grid grid-cols-3 gap-2 rounded-[24px] border border-white/10 bg-black/20 p-1.5">
                <ModeButton active={viewMode === "list"} onClick={() => setViewMode("list")}>목록</ModeButton>
                <ModeButton active={viewMode === "map"} onClick={() => setViewMode("map")}>지도</ModeButton>
                <ModeButton active={viewMode === "calendar"} onClick={() => setViewMode("calendar")}>달력</ModeButton>
              </div>
            </div>
          </div>

          <div className="grid gap-5 md:grid-cols-3 lg:grid-cols-3">
            <StatCard label="공연" value={String(sortedEvents.length).padStart(2, "0")} />
            <StatCard label="공연장" value={String(venueBuckets.length).padStart(2, "0")} />
            <StatCard label="보기" value={viewMode === "list" ? "LIST" : viewMode === "map" ? "MAP" : "CAL"} />
          </div>
        </section>

        {loading ? (
          <section className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="site-shell h-[440px] animate-pulse rounded-[32px]" />
            <div className="grid gap-5">
              <div className="site-shell h-[210px] animate-pulse rounded-[32px]" />
              <div className="site-shell h-[210px] animate-pulse rounded-[32px]" />
            </div>
          </section>
        ) : loadError ? (
          <section className="site-shell rounded-[32px] p-8 text-center text-rose-200">{loadError}</section>
        ) : viewMode === "list" ? (
          <section className="space-y-5">
            {highlightedEvent ? (
              <button
                type="button"
                onClick={() => router.push(`/events/${highlightedEvent.id}`)}
                className="event-hero-card group w-full overflow-hidden rounded-[32px] border border-white/10 text-left shadow-[0_30px_90px_rgba(0,0,0,0.32)] transition hover:-translate-y-0.5"
              >
                <div className="grid min-h-[420px] gap-0 lg:grid-cols-[0.84fr_1.16fr]">
                  <div className="border-b border-white/10 bg-black/25 lg:border-b-0 lg:border-r">
                    {isValidPoster(highlightedEvent.posterUrl) ? (
                      <img
                        src={highlightedEvent.posterUrl}
                        alt={highlightedEvent.title || "공연 포스터"}
                        className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.02]"
                        loading="lazy"
                        decoding="async"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="flex h-full min-h-[280px] items-end bg-[radial-gradient(circle_at_top_left,rgba(61,197,255,0.22),transparent_28%),linear-gradient(180deg,#10182d,#0a1020)] p-6">
                        <span className="rounded-full border border-white/10 bg-white/8 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-slate-200">
                          Featured
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col justify-between p-6 md:p-8 lg:p-10">
                    <div className="space-y-5">
                      <div className="flex flex-wrap gap-2">
                        <Chip>{formatSchedule(highlightedEvent)}</Chip>
                        {highlightedEvent.venueName ? <Chip>{highlightedEvent.venueName}</Chip> : null}
                      </div>

                      <h2 className="max-w-4xl text-3xl font-black leading-[1.02] tracking-[-0.05em] text-white md:text-5xl lg:text-6xl">
                        {highlightedEvent.title || "제목 없는 공연"}
                      </h2>

                      {highlightedEvent.artistNames ? (
                        <p className="max-w-3xl text-base leading-8 text-slate-300 md:text-lg">{highlightedEvent.artistNames}</p>
                      ) : null}
                    </div>

                    <div className="grid gap-6 border-t border-white/10 pt-6 md:grid-cols-[1fr_auto] md:items-end">
                      <div className="space-y-3 text-sm text-slate-300">
                        {formatPriceLines(highlightedEvent.price).slice(0, 2).map((line) => (
                          <p key={`${highlightedEvent.id}-${line}`} className="text-base font-semibold text-cyan-300">
                            {line}
                          </p>
                        ))}
                      </div>
                      <div className="inline-flex items-center gap-2 text-sm font-semibold text-white">
                        상세 보기
                        <span className="transition-transform group-hover:translate-x-1">→</span>
                      </div>
                    </div>
                  </div>
                </div>
              </button>
            ) : null}

            <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              {cardEvents.map((event) => (
                <EventCard key={event.id} event={event} onOpen={() => router.push(`/events/${event.id}`)} />
              ))}
            </div>
          </section>
        ) : viewMode === "map" ? (
          <section className="grid gap-5 xl:grid-cols-[1.35fr_0.65fr]">
            <div className="site-shell overflow-hidden rounded-[32px] p-3 md:p-4">
              <div className="relative overflow-hidden rounded-[24px] border border-white/10 bg-[#08101d]">
                <div ref={mapRef} className="h-[72vh] min-h-[520px] w-full" />
                {!mapLoaded && !mapError ? (
                  <div className="absolute inset-0 flex items-center justify-center bg-[#08101d]/70">
                    <p className="text-sm font-medium text-slate-400">지도를 불러오는 중입니다.</p>
                  </div>
                ) : null}
                {mapError ? (
                  <div className="absolute left-4 right-4 top-4 rounded-2xl border border-amber-300/20 bg-black/70 p-4 text-sm leading-6 text-amber-100 backdrop-blur">
                    {mapError}
                    <div className="mt-2 text-amber-200/80">
                      Kakao Developers → 앱 → 플랫폼 키 → JavaScript 키 → JavaScript SDK 도메인에 현재 Vercel 주소를 추가하세요.
                    </div>
                  </div>
                ) : null}
              </div>
            </div>

            <aside className="site-shell rounded-[32px] p-4 md:p-5">
              <div className="flex items-center justify-between border-b border-white/10 pb-4">
                <h2 className="text-lg font-bold text-white">공연장</h2>
                <span className="text-sm text-slate-400">{venueBuckets.length}</span>
              </div>

              <div className="custom-scrollbar mt-4 max-h-[68vh] space-y-2 overflow-y-auto pr-1">
                {venueBuckets.map((bucket) => {
                  const active = bucket.venueName === (activeVenueBucket?.venueName || activeVenue);
                  return (
                    <button
                      key={bucket.venueName}
                      type="button"
                      onClick={() => setActiveVenue(bucket.venueName)}
                      className={`w-full rounded-[22px] border px-4 py-4 text-left transition ${
                        active
                          ? "border-cyan-300/30 bg-cyan-300/12"
                          : "border-white/10 bg-black/16 hover:bg-white/[0.04]"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-base font-semibold text-white">{bucket.venueName}</p>
                          <p className="mt-1 text-sm text-slate-400">{bucket.events.length}개의 일정</p>
                        </div>
                        <span className="rounded-full bg-white/8 px-2.5 py-1 text-xs font-semibold text-slate-300">
                          {bucket.events.length}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>

              {activeVenueBucket ? (
                <div className="mt-5 space-y-3 border-t border-white/10 pt-5">
                  {activeVenueBucket.events.map((event) => (
                    <EventRow key={event.id} event={event} onOpen={() => router.push(`/events/${event.id}`)} />
                  ))}
                </div>
              ) : null}
            </aside>
          </section>
        ) : (
          <section className="site-shell rounded-[32px] p-4 md:p-5">
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <button
                type="button"
                onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1))}
                className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/10"
              >
                ←
              </button>
              <h2 className="text-xl font-bold text-white">
                {currentMonth.getFullYear()}년 {currentMonth.getMonth() + 1}월
              </h2>
              <button
                type="button"
                onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1))}
                className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/10"
              >
                →
              </button>
            </div>

            <div className="mt-5 grid grid-cols-7 gap-2 text-center text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 md:gap-3 md:text-sm">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
                <div key={day} className="py-2">{day}</div>
              ))}
            </div>

            <div className="mt-3 grid grid-cols-7 gap-2 md:gap-3">
              {calendarDays.map((cell, index) =>
                cell ? (
                  <button
                    key={cell.key}
                    type="button"
                    onClick={() => cell.events.length && setActiveDate(cell.key)}
                    className={`aspect-[1/1.02] rounded-[24px] border p-3 text-left transition ${
                      cell.events.length
                        ? "border-cyan-300/15 bg-cyan-300/[0.06] hover:bg-cyan-300/[0.1]"
                        : "border-white/8 bg-black/16"
                    }`}
                  >
                    <div className="text-lg font-bold text-white">{cell.day}</div>
                    {cell.events.length ? (
                      <div className="mt-3 space-y-1">
                        {cell.events.slice(0, 2).map((event) => (
                          <p key={event.id} className="truncate text-[11px] font-medium text-cyan-200 md:text-xs">
                            {event.title}
                          </p>
                        ))}
                        {cell.events.length > 2 ? (
                          <p className="text-[11px] text-slate-400 md:text-xs">+{cell.events.length - 2}</p>
                        ) : null}
                      </div>
                    ) : null}
                  </button>
                ) : (
                  <div key={`blank-${index}`} className="aspect-[1/1.02] rounded-[24px] border border-transparent" />
                )
              )}
            </div>
          </section>
        )}
      </div>

      {activeDate && selectedDateEvents.length ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 md:items-center md:p-4" onClick={() => setActiveDate("")}>
          <div
            className="site-shell custom-scrollbar max-h-[84vh] w-full max-w-2xl overflow-y-auto rounded-t-[32px] p-5 md:rounded-[32px] md:p-6"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-xl font-bold text-white">{activeDate}</h3>
              <button
                type="button"
                onClick={() => setActiveDate("")}
                className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/10"
              >
                닫기
              </button>
            </div>
            <div className="space-y-3">
              {selectedDateEvents.map((event) => (
                <EventRow key={event.id} event={event} onOpen={() => router.push(`/events/${event.id}`)} />
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}

function ModeButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-[18px] px-4 py-3 text-sm font-semibold transition ${
        active ? "bg-white text-slate-950" : "text-slate-400 hover:text-white"
      }`}
    >
      {children}
    </button>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="site-shell rounded-[28px] px-5 py-5">
      <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-slate-500">{label}</p>
      <p className="mt-4 text-[32px] font-black tracking-[-0.05em] text-white">{value}</p>
    </div>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-slate-200">{children}</span>;
}

function EventCard({ event, onOpen }: { event: EventItem; onOpen: () => void }) {
  const priceLines = formatPriceLines(event.price);
  const externalUrl = formatExternalUrl(event.sourceUrl);

  return (
    <button
      type="button"
      onClick={onOpen}
      className="site-shell group overflow-hidden rounded-[28px] border border-white/10 text-left transition hover:-translate-y-0.5"
    >
      <div className="flex h-full flex-col">
        {isValidPoster(event.posterUrl) ? (
          <div className="aspect-[1.2/1] overflow-hidden border-b border-white/10 bg-black/20">
            <img
              src={event.posterUrl}
              alt={event.title || "공연 포스터"}
              className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"
              loading="lazy"
              decoding="async"
              referrerPolicy="no-referrer"
            />
          </div>
        ) : (
          <div className="aspect-[1.2/1] border-b border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(61,197,255,0.15),transparent_28%),linear-gradient(180deg,#0c1426,#09111d)]" />
        )}

        <div className="flex flex-1 flex-col p-5">
          <div className="flex flex-wrap gap-2">
            <Chip>{formatSchedule(event)}</Chip>
            {event.venueName ? <Chip>{event.venueName}</Chip> : null}
          </div>

          <h3 className="mt-4 text-[28px] font-black leading-[1.08] tracking-[-0.04em] text-white">
            {event.title || "제목 없는 공연"}
          </h3>

          {event.artistNames ? (
            <p className="mt-4 line-clamp-2 text-sm leading-7 text-slate-300">{event.artistNames}</p>
          ) : null}

          {priceLines.length ? (
            <div className="mt-5 flex flex-wrap gap-2">
              {priceLines.map((line) => (
                <span key={`${event.id}-${line}`} className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1.5 text-sm font-semibold text-cyan-200">
                  {line}
                </span>
              ))}
            </div>
          ) : null}

          <div className="mt-auto flex items-center justify-between border-t border-white/10 pt-5 text-sm">
            <span className="font-semibold text-white">상세 보기</span>
            <span className="text-slate-500">{externalUrl ? "링크 있음" : "정보 확인"}</span>
          </div>
        </div>
      </div>
    </button>
  );
}

function EventRow({ event, onOpen }: { event: EventItem; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full rounded-[22px] border border-white/10 bg-black/16 px-4 py-4 text-left transition hover:bg-white/[0.04]"
    >
      <p className="text-sm font-semibold text-cyan-200">{formatSchedule(event)}</p>
      <p className="mt-2 text-base font-semibold text-white">{event.title || "제목 없는 공연"}</p>
      {event.artistNames ? <p className="mt-2 line-clamp-2 text-sm text-slate-400">{event.artistNames}</p> : null}
    </button>
  );
}
