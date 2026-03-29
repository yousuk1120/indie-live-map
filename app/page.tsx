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
  instagramUrl?: string;
  price?: string;
  posterUrl?: string;
};

type CalendarCell = {
  key: string;
  day: number;
  events: EventItem[];
};

type VenueBucket = {
  venueName: string;
  events: EventItem[];
};

type ViewMode = "list" | "map" | "calendar";

const DEFAULT_CENTER = { lat: 37.5559, lng: 126.9234 };

function toText(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(toText).filter(Boolean).join(", ");
  if (typeof value === "object") return Object.values(value as Record<string, unknown>).map(toText).filter(Boolean).join(", ");
  return "";
}

function normalizeDate(value?: string) {
  const raw = toText(value);
  if (!raw) return "";

  const match = raw.match(/(\d{2,4})[./-](\d{1,2})[./-](\d{1,2})/);
  if (!match) return "";

  const [, y, m, d] = match;
  const year = y.length === 2 ? `20${y}` : y;
  return `${year}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
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
  if (!date) return "일정 미정";

  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return [toText(event.date), toText(event.time)].filter(Boolean).join(" · ") || "일정 미정";
  }

  const week = ["일", "월", "화", "수", "목", "금", "토"][parsed.getDay()];
  return `${parsed.getFullYear()}.${String(parsed.getMonth() + 1).padStart(2, "0")}.${String(parsed.getDate()).padStart(2, "0")} (${week})${event.time ? ` · ${event.time}` : ""}`;
}

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
  if (looseUrl && !raw.includes(" ")) {
    return `https://${looseUrl[0].replace(/^https?:\/\//i, "")}`;
  }

  return "";
}

function extractInstagramUrl(event: EventItem) {
  const candidates = [toText(event.instagramUrl), toText(event.sourceUrl)].filter(Boolean);

  for (const raw of candidates) {
    const instaPath = raw.match(/(?:https?:\/\/)?(?:www\.)?instagram\.com\/[A-Za-z0-9_./?=&%-]+/i);
    if (instaPath) {
      const cleaned = instaPath[0].replace(/^https?:\/\//i, "").replace(/[),.;]+$/, "");
      return `https://${cleaned}`;
    }

    const handle = raw.match(/@[A-Za-z0-9._]{2,30}/);
    if (handle) return `https://www.instagram.com/${handle[0].slice(1)}`;
  }

  return "";
}

function buildInstagramFallback(event: EventItem) {
  const query = encodeURIComponent(
    [event.title, event.venueName, event.artistNames].filter(Boolean).join(" ")
  );
  return `https://www.instagram.com/explore/search/keyword/?q=${query || "concert"}`;
}

function getInstagramLink(event: EventItem) {
  return extractInstagramUrl(event) || buildInstagramFallback(event);
}

function extractInfoLink(event: EventItem) {
  const source = extractExternalUrl(event.sourceUrl);
  const instagram = extractInstagramUrl(event);
  if (source && source !== instagram) return source;
  return "";
}

function formatMoneyToken(token: string) {
  const digits = token.replace(/[^\d]/g, "");
  if (!digits) return token.trim();
  return `${Number(digits).toLocaleString("ko-KR")}원`;
}

function normalizeMoneyInText(text: string) {
  return text.replace(/\d[\d,\s]*원/g, (token) => formatMoneyToken(token));
}

function formatPriceLines(value?: string) {
  const raw = toText(value);
  if (!raw) return [] as string[];

  const normalized = raw
    .replace(/\r?\n/g, "\n")
    .replace(/\s*\/\s*/g, "\n")
    .replace(/\s*\|\s*/g, "\n")
    .replace(/\s*·\s*/g, "\n")
    .replace(/\s{2,}/g, " ")
    .trim();

  const parts = normalized.split("\n").map((part) => normalizeMoneyInText(part.trim())).filter(Boolean);

  return Array.from(
    new Set(
      parts.map((part) => {
        if (/free entry|무료/i.test(part)) return part;

        const labelMatch = part.match(/(예매|현매|예판|당일|door)/i);
        const label = labelMatch ? labelMatch[1].replace(/^door$/i, "현매") : "";
        const amounts = Array.from(part.matchAll(/\d[\d,]*원/g)).map((m) => m[0]);
        const amount = amounts.length ? amounts[amounts.length - 1] : "";

        if (label && amount) return `${label} ${amount}`;
        return part;
      })
    )
  );
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
    instagramUrl: toText((raw as Record<string, unknown>).instagramUrl),
    price: toText(raw.price),
    posterUrl: toText(raw.posterUrl),
  };
}

function venueSearchCandidates(venueName: string) {
  const value = toText(venueName);
  return Array.from(new Set([value, `${value} 공연장`, `${value} 라이브클럽`, `${value} 서울`, `${value} 홍대`].filter(Boolean)));
}

export default function Home() {
  const router = useRouter();

  const [events, setEvents] = useState<EventItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
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

  const sortedEvents = useMemo(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const todayTimestamp = now.getTime();

    return [...filteredEvents]
      .filter((event) => {
        const ts = eventTimestamp(event);
        return ts >= todayTimestamp || ts === Number.POSITIVE_INFINITY;
      })
      .sort((a, b) => eventTimestamp(a) - eventTimestamp(b));
  }, [filteredEvents]);

  const venueBuckets = useMemo(() => {
    const bucket = new Map<string, EventItem[]>();
    sortedEvents.forEach((event) => {
      const venue = toText(event.venueName);
      if (!venue) return;
      bucket.set(venue, [...(bucket.get(venue) || []), event]);
    });
    return Array.from(bucket.entries()).map(([venueName, items]) => ({ venueName, events: items }));
  }, [sortedEvents]);

  useEffect(() => {
    if (!activeVenue && venueBuckets[0]?.venueName) {
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
      const dayEvents = sortedEvents.filter((event) => normalizeDate(event.date) === key);
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
    return sortedEvents.filter((event) => normalizeDate(event.date) === selectedDate);
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
    if (!mapReady || !window.kakao?.maps?.services || !mapContainerRef.current) return;
    if (!venueBuckets.length) return;

    let cancelled = false;

    window.kakao.maps.load(() => {
      if (cancelled || !mapContainerRef.current) return;

      const map = new window.kakao.maps.Map(mapContainerRef.current, {
        center: new window.kakao.maps.LatLng(DEFAULT_CENTER.lat, DEFAULT_CENTER.lng),
        level: 6,
      });

      markersRef.current.forEach((marker) => marker.setMap(null));
      markersRef.current = [];

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
              bounds.extend(position);
              found += 1;

              const info = new window.kakao.maps.InfoWindow({
                content: `<div style="padding:8px 10px;font-size:12px;font-weight:700;color:#111827;background:#ffffff;border:1px solid #e5e7eb;border-radius:999px;">${bucket.venueName}</div>`,
              });

              window.kakao.maps.event.addListener(marker, "mouseover", () => info.open(map, marker));
              window.kakao.maps.event.addListener(marker, "mouseout", () => info.close());
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
    };
  }, [viewMode, mapReady, venueBuckets, origin]);

  return (
    <main className="min-h-screen bg-[var(--bg)] text-[var(--text)]">
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

      <div className="mx-auto max-w-6xl px-4 pb-16 pt-8 md:px-8 md:pt-10">
        <header className="mb-8 flex items-end justify-between gap-4 border-b border-[var(--line)] pb-6">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[var(--muted)]">
              Seoul Indie Live
            </p>
            <h1 className="mt-2 text-4xl font-semibold tracking-[-0.04em] text-white md:text-6xl">
              Concert Schedule
            </h1>
          </div>

          <Link
            href="/admin"
            className="inline-flex h-11 items-center rounded-full border border-[var(--line)] px-5 text-sm font-medium text-[var(--text)] transition hover:border-[var(--accent)] hover:text-white"
          >
            Admin
          </Link>
        </header>

        <section className="panel mb-8 p-4 md:p-5">
          <div className="grid gap-4 md:grid-cols-[1fr_auto]">
            <input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="공연명, 공연장, 아티스트 검색"
              className="h-14 w-full rounded-2xl border border-[var(--line)] bg-[var(--panel-2)] px-4 text-base text-white outline-none transition focus:border-[var(--accent)]"
            />

            <div className="flex items-center gap-2 rounded-2xl border border-[var(--line)] bg-[var(--panel-2)] p-1">
              <ViewTab active={viewMode === "list"} onClick={() => setViewMode("list")}>목록</ViewTab>
              <ViewTab active={viewMode === "map"} onClick={() => setViewMode("map")}>지도</ViewTab>
              <ViewTab active={viewMode === "calendar"} onClick={() => setViewMode("calendar")}>달력</ViewTab>
            </div>
          </div>
        </section>

        {loading ? (
          <div className="space-y-4">
            <div className="panel h-32 animate-pulse" />
            <div className="panel h-80 animate-pulse" />
            <div className="panel h-80 animate-pulse" />
          </div>
        ) : loadError ? (
          <div className="panel p-6 text-sm text-rose-300">{loadError}</div>
        ) : (
          <>
            {viewMode === "list" && (
              <section className="panel p-4 md:p-5">
                <div className="divide-y divide-[var(--line)]">
                  {sortedEvents.length ? (
                    sortedEvents.map((event) => (
                      <EventListRow
                        key={event.id}
                        event={event}
                        onOpen={() => router.push(`/events/${event.id}`)}
                        isSaved={savedEvents.has(event.id)}
                        onToggleSave={() => toggleSave(event.id)}
                      />
                    ))
                  ) : (
                    <div className="py-10 text-sm text-[var(--muted)]">검색 결과가 없습니다.</div>
                  )}
                </div>
              </section>
            )}

            {viewMode === "map" && (
              <section className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
                <aside className="panel p-4 md:p-5">
                  <div className="mb-4 border-b border-[var(--line)] pb-4">
                    <h2 className="text-lg font-semibold text-white">공연 지도</h2>
                  </div>

                  <div className="space-y-3">
                    {venueBuckets.length ? (
                      venueBuckets.map((bucket) => (
                        <button
                          key={bucket.venueName}
                          type="button"
                          onClick={() => setActiveVenue(bucket.venueName)}
                          className={`w-full rounded-2xl border px-4 py-4 text-left transition ${bucket.venueName === activeVenue
                              ? "border-[var(--accent)] bg-[var(--accent-soft)]"
                              : "border-[var(--line)] bg-[var(--panel-2)] hover:border-[var(--accent)]/60"
                            }`}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <span className="font-medium text-white">{bucket.venueName}</span>
                            <span className="text-sm text-[var(--muted)]">{bucket.events.length}</span>
                          </div>
                        </button>
                      ))
                    ) : (
                      <div className="rounded-2xl border border-[var(--line)] bg-[var(--panel-2)] px-4 py-5 text-sm text-[var(--muted)]">
                        표시할 공연장이 없습니다.
                      </div>
                    )}
                  </div>

                  {activeVenueEvents.length ? (
                    <div className="mt-5 space-y-3 border-t border-[var(--line)] pt-5">
                      {activeVenueEvents.map((event) => (
                        <ScheduleRow
                          key={event.id}
                          event={event}
                          onOpen={() => router.push(`/events/${event.id}`)}
                          isSaved={savedEvents.has(event.id)}
                          onToggleSave={() => toggleSave(event.id)}
                        />
                      ))}
                    </div>
                  ) : null}
                </aside>

                <div className="panel overflow-hidden p-4 md:p-5">
                  <div className="mb-4 border-b border-[var(--line)] pb-4">
                    <h2 className="text-lg font-semibold text-white">Map</h2>
                    {mapError ? <p className="mt-1 text-sm leading-6 text-[var(--muted)]">{mapError}</p> : null}
                  </div>

                  <div className="overflow-hidden rounded-3xl border border-[var(--line)] bg-[#121418]">
                    <div ref={mapContainerRef} className="h-[520px] w-full" />
                  </div>
                </div>
              </section>
            )}

            {viewMode === "calendar" && (
              <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
                <div className="panel p-4 md:p-5">
                  <div className="mb-5 flex items-center justify-between">
                    <h2 className="text-lg font-semibold text-white">Calendar</h2>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1))}
                        className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[var(--line)] text-sm text-[var(--text)] transition hover:border-[var(--accent)]"
                      >
                        ←
                      </button>
                      <span className="min-w-[120px] text-center text-sm font-medium text-white">
                        {currentMonth.getFullYear()}.{String(currentMonth.getMonth() + 1).padStart(2, "0")}
                      </span>
                      <button
                        type="button"
                        onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1))}
                        className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[var(--line)] text-sm text-[var(--text)] transition hover:border-[var(--accent)]"
                      >
                        →
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-7 gap-2 text-center text-xs font-medium text-[var(--muted)] md:gap-3">
                    {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
                      <div key={day} className="pb-2">{day}</div>
                    ))}
                  </div>

                  <div className="grid grid-cols-7 gap-2 md:gap-3">
                    {calendarCells.map((cell, index) =>
                      cell ? (
                        <button
                          key={cell.key}
                          type="button"
                          onClick={() => setSelectedDate(cell.key)}
                          className={`calendar-cell ${cell.key === selectedDate ? "calendar-cell-active" : ""}`}
                        >
                          <span className="text-sm font-semibold text-white md:text-base">{cell.day}</span>
                          {cell.events.length ? (
                            <span className="mt-2 inline-flex min-h-5 min-w-5 items-center justify-center rounded-full bg-[var(--accent-soft)] px-1.5 text-[11px] font-semibold text-[var(--accent)]">
                              {cell.events.length}
                            </span>
                          ) : null}
                        </button>
                      ) : (
                        <div key={`blank-${index}`} className="calendar-cell-empty" />
                      )
                    )}
                  </div>
                </div>

                <aside className="panel p-4 md:p-5">
                  <div className="border-b border-[var(--line)] pb-4">
                    <h2 className="text-lg font-semibold text-white">Selected Day</h2>
                    <p className="mt-1 text-sm text-[var(--muted)]">{selectedDate || "이 달에 일정이 없습니다."}</p>
                  </div>

                  <div className="mt-4 space-y-3">
                    {selectedDateEvents.length ? (
                      selectedDateEvents.map((event) => (
                        <ScheduleRow
                          key={event.id}
                          event={event}
                          onOpen={() => router.push(`/events/${event.id}`)}
                          isSaved={savedEvents.has(event.id)}
                          onToggleSave={() => toggleSave(event.id)}
                        />
                      ))
                    ) : (
                      <div className="rounded-2xl border border-[var(--line)] bg-[var(--panel-2)] px-4 py-5 text-sm text-[var(--muted)]">
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

function ViewTab({
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
      className={`inline-flex h-12 items-center rounded-2xl px-6 text-base font-medium transition ${active
          ? "bg-white text-slate-950"
          : "text-[var(--muted)] hover:text-white"
        }`}
    >
      {children}
    </button>
  );
}

function EventListRow({
  event,
  onOpen,
  isSaved,
  onToggleSave,
}: {
  event: EventItem;
  onOpen: () => void;
  isSaved: boolean;
  onToggleSave: () => void;
}) {
  const priceLines = formatPriceLines(event.price);
  const instagramUrl = getInstagramLink(event);

  return (
    <article className="py-6 first:pt-0 last:pb-0">
      <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
        <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left">
          <p className="text-sm font-medium text-[var(--muted)]">{formatSchedule(event)}</p>
          <h3 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-white">
            {event.title || "제목 없는 공연"}
          </h3>

          <div className="mt-5 grid gap-5 md:grid-cols-[220px_minmax(0,1fr)_180px]">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">Venue</p>
              <p className="mt-2 break-words text-base text-zinc-200">{event.venueName || "장소 미정"}</p>
            </div>

            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">Artists</p>
              <p className="mt-2 break-words text-base leading-7 text-zinc-200">{event.artistNames || "출연 정보 없음"}</p>
            </div>

            <div className="min-w-0 md:text-right">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">Ticket</p>
              <div className="mt-2 space-y-1">
                {priceLines.length ? (
                  priceLines.map((line) => (
                    <p key={`${event.id}-${line}`} className="text-base font-semibold text-white">{line}</p>
                  ))
                ) : (
                  <p className="text-base text-[var(--muted)]">티켓 정보 없음</p>
                )}
              </div>
            </div>
          </div>
        </button>

        <div className="flex shrink-0 items-start gap-2 xl:pl-6">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleSave();
            }}
            className={`secondary-btn ${isSaved ? "text-yellow-400 border-yellow-400/50" : ""}`}
          >
            {isSaved ? "★ 저장됨" : "☆ 저장"}
          </button>

          <a
            href={instagramUrl}
            target="_blank"
            rel="noreferrer"
            className="secondary-btn"
            onClick={(e) => e.stopPropagation()}
          >
            Instagram ↗
          </a>
        </div>
      </div>
    </article>
  );
}

function ScheduleRow({
  event,
  onOpen,
  isSaved,
  onToggleSave,
}: {
  event: EventItem;
  onOpen: () => void;
  isSaved: boolean;
  onToggleSave: () => void;
}) {
  const priceLines = formatPriceLines(event.price);
  const instagramUrl = getInstagramLink(event);

  return (
    <div className="rounded-2xl border border-[var(--line)] bg-[var(--panel-2)] p-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left">
          <p className="text-sm font-medium text-[var(--muted)]">{formatSchedule(event)}</p>
          <p className="mt-1 text-lg font-semibold text-white">{event.title || "제목 없는 공연"}</p>

          <div className="mt-3 grid gap-3 md:grid-cols-[180px_minmax(0,1fr)_220px]">
            <p className="min-w-0 text-sm text-[var(--muted)]">{event.venueName || "장소 미정"}</p>
            <p className="min-w-0 break-words text-sm leading-6 text-zinc-200">{event.artistNames || "출연 정보 없음"}</p>
            <div className="space-y-1 md:text-right">
              {priceLines.length ? (
                priceLines.map((line) => (
                  <p key={`${event.id}-${line}`} className="text-sm font-medium text-white">{line}</p>
                ))
              ) : (
                <p className="text-sm text-[var(--muted)]">티켓 정보 없음</p>
              )}
            </div>
          </div>
        </button>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleSave();
            }}
            className={`secondary-btn ${isSaved ? "text-yellow-400 border-yellow-400/50" : ""}`}
          >
            {isSaved ? "★" : "☆"}
          </button>

          <a
            href={instagramUrl}
            target="_blank"
            rel="noreferrer"
            className="secondary-btn"
            onClick={(e) => e.stopPropagation()}
          >
            Instagram
          </a>
        </div>
      </div>
    </div>
  );
}