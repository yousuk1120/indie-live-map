"use client";

import Script from "next/script";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { collection, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase/firestore";

declare global {
  interface Window {
    kakao: any;
  }
}

type EventItem = {
  id: string;
  title: string;
  date: string;
  time: string;
  venueName: string;
  artistNames: string;
  sourceUrl: string;
  price: string;
  posterUrl: string;
};

const safeText = (value: unknown): string => {
  if (value == null) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    return value.map(safeText).filter(Boolean).join(", ");
  }
  if (typeof value === "object") {
    if ("seconds" in (value as Record<string, unknown>)) return "";
    return Object.values(value as Record<string, unknown>).map(safeText).filter(Boolean).join(", ");
  }
  return "";
};

const normalizeEvent = (id: string, raw: Record<string, unknown>): EventItem => ({
  id,
  title: safeText(raw.title),
  date: safeText(raw.date),
  time: safeText(raw.time),
  venueName: safeText(raw.venueName),
  artistNames: safeText(raw.artistNames),
  sourceUrl: safeText(raw.sourceUrl),
  price: safeText(raw.price),
  posterUrl: safeText(raw.posterUrl),
});

const getExternalLink = (value?: string) => {
  const trimmed = safeText(value);
  if (!trimmed) return "";
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) return trimmed;
  if (trimmed.startsWith("@")) return `https://www.instagram.com/${trimmed.slice(1)}`;
  if (/^(www\.)?[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}(\/.*)?$/.test(trimmed)) return `https://${trimmed}`;
  return "";
};

const getPriceLines = (value?: string) => {
  const text = safeText(value);
  if (!text) return [] as string[];

  const normalized = text
    .replace(/\r\n|\r|\n/g, ", ")
    .replace(/\s*\/\s*/g, ", ")
    .replace(/\s*·\s*/g, ", ")
    .replace(/,\s*(예매|현매)\s*/g, "\n$1 ")
    .replace(/(예매|현매)\s*(\d)/g, "$1 $2")
    .trim();

  const lines = normalized
    .split("\n")
    .flatMap((line) => line.split(","))
    .map((line) => line.trim().replace(/\s{2,}/g, " "))
    .filter(Boolean);

  const merged: string[] = [];
  for (const line of lines) {
    if (/^(예매|현매)$/.test(line) && merged.length) {
      merged[merged.length - 1] = `${merged[merged.length - 1]} ${line}`;
    } else {
      merged.push(line);
    }
  }

  return [...new Set(merged)];
};

const isRenderablePoster = (url?: string) => {
  const value = safeText(url);
  if (!value) return false;
  if (value.startsWith("data:")) return false;
  return value.startsWith("http://") || value.startsWith("https://");
};

const parseEventTime = (event: EventItem) => {
  if (!event.date) return Number.POSITIVE_INFINITY;

  try {
    const parts = event.date.split("-");
    if (parts.length !== 3) return Number.POSITIVE_INFINITY;
    if (parts[0].length === 2) parts[0] = `20${parts[0]}`;
    const normalizedTime = event.time || "23:59";
    return new Date(`${parts.join("-")}T${normalizedTime}`).getTime();
  } catch {
    return Number.POSITIVE_INFINITY;
  }
};

const venueQueries = (venue: string) => {
  const v = safeText(venue);
  return [...new Set([v, `${v} 라이브클럽`, `${v} 공연장`, `${v} 홍대`].filter(Boolean))];
};

export default function Home() {
  const router = useRouter();
  const [events, setEvents] = useState<EventItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<"list" | "map" | "calendar">("list");
  const [mapLoaded, setMapLoaded] = useState(false);
  const [mapError, setMapError] = useState("");
  const [selectedVenue, setSelectedVenue] = useState<string | null>(null);
  const [selectedDateEvents, setSelectedDateEvents] = useState<{ date: string; events: EventItem[] } | null>(null);
  const [currentMonth, setCurrentMonth] = useState(new Date());

  const kakaoApiKey = process.env.NEXT_PUBLIC_KAKAO_MAP_API_KEY;

  useEffect(() => {
    const fetchEvents = async () => {
      try {
        const snapshot = await getDocs(collection(db, "events"));
        const items = snapshot.docs.map((doc) => normalizeEvent(doc.id, doc.data() as Record<string, unknown>));
        setEvents(items);
        setLoadError("");
      } catch (error) {
        console.error("홈 데이터 로딩 에러:", error);
        setLoadError("공연 데이터를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.");
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
      [event.title, event.venueName, event.artistNames].some((field) => field.toLowerCase().includes(q))
    );
  }, [events, searchQuery]);

  const sortedEvents = useMemo(
    () => [...filteredEvents].sort((a, b) => parseEventTime(a) - parseEventTime(b)),
    [filteredEvents]
  );

  const featuredEvents = useMemo(() => sortedEvents.slice(0, 3), [sortedEvents]);
  const listEvents = useMemo(() => sortedEvents.slice(3), [sortedEvents]);
  const uniqueVenues = useMemo(
    () => Array.from(new Set(sortedEvents.map((event) => event.venueName).filter(Boolean))),
    [sortedEvents]
  );

  useEffect(() => {
    if (viewMode !== "map") return;
    if (!kakaoApiKey) {
      setMapError("카카오 지도 API 키가 없습니다. Vercel 환경변수를 확인해주세요.");
      return;
    }
    if (!mapLoaded || !window.kakao?.maps?.services) return;

    let cancelled = false;

    window.kakao.maps.load(() => {
      if (cancelled) return;

      const container = document.getElementById("kakao-map");
      if (!container) return;
      container.innerHTML = "";

      const map = new window.kakao.maps.Map(container, {
        center: new window.kakao.maps.LatLng(37.5559, 126.9234),
        level: 6,
      });

      if (!uniqueVenues.length) {
        setMapError("지도에 표시할 공연장이 없습니다.");
        return;
      }

      setMapError("");
      const bounds = new window.kakao.maps.LatLngBounds();
      const places = new window.kakao.maps.services.Places();
      let resolved = 0;
      let success = 0;

      const finalize = () => {
        resolved += 1;
        if (resolved === uniqueVenues.length && success === 0) {
          setMapError("공연장 위치를 찾지 못했습니다. 카카오 콘솔의 도메인 설정을 확인해주세요.");
        }
      };

      uniqueVenues.forEach((venueName) => {
        const queries = venueQueries(venueName);

        const searchWithFallback = (index: number) => {
          if (cancelled) return;
          if (index >= queries.length) {
            finalize();
            return;
          }

          places.keywordSearch(queries[index], (data: any, status: any) => {
            if (cancelled) return;

            if (status === window.kakao.maps.services.Status.OK && data?.length) {
              const coords = new window.kakao.maps.LatLng(Number(data[0].y), Number(data[0].x));
              const marker = new window.kakao.maps.Marker({ map, position: coords });
              const info = new window.kakao.maps.InfoWindow({
                content: `<div style="padding:8px 12px;border-radius:999px;background:#0f172a;color:#f8fafc;font-size:13px;font-weight:700;white-space:nowrap;">${venueName}</div>`,
                disableAutoPan: true,
              });

              bounds.extend(coords);
              success += 1;
              if (success === 1) map.setCenter(coords);
              else map.setBounds(bounds);

              window.kakao.maps.event.addListener(marker, "mouseover", () => info.open(map, marker));
              window.kakao.maps.event.addListener(marker, "mouseout", () => info.close());
              window.kakao.maps.event.addListener(marker, "click", () => setSelectedVenue(venueName));
              finalize();
              return;
            }

            searchWithFallback(index + 1);
          });
        };

        searchWithFallback(0);
      });
    });

    return () => {
      cancelled = true;
    };
  }, [viewMode, mapLoaded, uniqueVenues, kakaoApiKey]);

  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayOfMonth = new Date(year, month, 1).getDay();

  const getDateKey = (day: number) => {
    const yy = String(year).slice(-2);
    const mm = String(month + 1).padStart(2, "0");
    const dd = String(day).padStart(2, "0");
    return `${yy}-${mm}-${dd}`;
  };

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#06111f_0%,#08101d_35%,#050914_100%)] text-white">
      {kakaoApiKey && (
        <Script
          src={`https://dapi.kakao.com/v2/maps/sdk.js?appkey=${kakaoApiKey}&libraries=services&autoload=false`}
          onLoad={() => setMapLoaded(true)}
          onError={() => setMapError("카카오 지도 스크립트를 불러오지 못했습니다. 도메인 등록 상태를 확인해주세요.")}
        />
      )}

      <div className="mx-auto max-w-7xl px-4 pb-20 pt-8 md:px-8 md:pt-10">
        <section className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top_right,rgba(129,140,248,.22),transparent_28%),radial-gradient(circle_at_left,rgba(34,197,94,.10),transparent_24%),linear-gradient(135deg,rgba(15,23,42,.98),rgba(9,14,26,.98))] p-7 shadow-[0_30px_120px_rgba(0,0,0,.35)] md:p-10">
            <div className="absolute -top-10 right-0 h-40 w-40 rounded-full bg-sky-400/10 blur-3xl" />
            <div className="absolute bottom-0 left-0 h-32 w-32 rounded-full bg-emerald-400/10 blur-3xl" />

            <div className="relative">
              <div className="mb-5 flex flex-wrap gap-2">
                <span className="rounded-full border border-white/10 bg-white/6 px-3 py-1 text-xs font-semibold text-sky-200">Live Club Archive</span>
                <span className="rounded-full border border-white/10 bg-white/6 px-3 py-1 text-xs font-semibold text-indigo-200">Indie Schedule</span>
                <span className="rounded-full border border-white/10 bg-white/6 px-3 py-1 text-xs font-semibold text-emerald-200">Map · Calendar · Curated</span>
              </div>

              <h1 className="max-w-3xl text-4xl font-black tracking-[-0.04em] text-white md:text-6xl">
                라이브클럽과 인디공연장 일정을
                <span className="block bg-gradient-to-r from-sky-300 via-white to-indigo-300 bg-clip-text text-transparent">
                  가장 보기 좋게 모아보는 곳
                </span>
              </h1>

              <p className="mt-5 max-w-2xl text-sm leading-7 text-slate-300 md:text-base">
                핀터레스트 무드보드처럼 감도 있게, 토스처럼 읽기 쉽게. 홍대 · 합정 · 망원 공연 일정을 목록, 지도, 달력으로 한 번에 확인하세요.
              </p>

              <div className="mt-8 grid gap-3 sm:grid-cols-3">
                <MetricCard label="등록 공연" value={`${events.length}`} description="현재 확인 가능한 일정" />
                <MetricCard label="공연장" value={`${uniqueVenues.length}`} description="지도에 올릴 수 있는 장소" />
                <MetricCard label="현재 보기" value={viewMode === "list" ? "목록" : viewMode === "map" ? "지도" : "달력"} description="원하는 방식으로 탐색" />
              </div>
            </div>
          </div>

          <div className="grid gap-5">
            <div className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-6 backdrop-blur">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Quick Notes</p>
              <div className="mt-5 space-y-4">
                <MoodItem title="지금 제일 빠른 탐색" body="공연명, 장소, 아티스트를 한 번에 검색하고 카드 클릭으로 상세 정보를 봅니다." />
                <MoodItem title="지도 뷰" body="공연장을 기준으로 마커를 찍고, 마커를 누르면 그 장소 일정만 모아서 보여줍니다." />
                <MoodItem title="티켓 표기" body="예매 25,000원 / 현매 30,000원처럼 줄바꿈해서 읽기 좋게 정리합니다." />
              </div>
            </div>

            <div className="rounded-[2rem] border border-white/10 bg-[linear-gradient(180deg,rgba(17,24,39,.88),rgba(15,23,42,.88))] p-6">
              <p className="text-sm font-semibold text-slate-300">검색 & 보기 전환</p>
              <div className="mt-4 space-y-3">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="공연명, 장소, 아티스트 검색"
                  className="w-full rounded-2xl border border-white/10 bg-[#0B1220]/80 px-4 py-3.5 text-white placeholder:text-slate-500 outline-none transition focus:border-sky-400/60"
                />
                <div className="grid grid-cols-3 gap-2 rounded-2xl border border-white/10 bg-black/20 p-1.5">
                  <ViewButton active={viewMode === "list"} onClick={() => setViewMode("list")}>목록</ViewButton>
                  <ViewButton active={viewMode === "map"} onClick={() => setViewMode("map")}>지도</ViewButton>
                  <ViewButton active={viewMode === "calendar"} onClick={() => setViewMode("calendar")}>달력</ViewButton>
                </div>
              </div>
            </div>
          </div>
        </section>

        {loading ? (
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="h-56 animate-pulse rounded-[1.75rem] border border-white/10 bg-white/[0.04]" />
            ))}
          </div>
        ) : loadError ? (
          <section className="mt-8 rounded-[2rem] border border-rose-400/20 bg-rose-500/10 p-8 text-center text-rose-100">
            <p className="text-lg font-semibold">{loadError}</p>
          </section>
        ) : sortedEvents.length === 0 ? (
          <section className="mt-8 rounded-[2rem] border border-white/10 bg-white/[0.04] p-16 text-center">
            <p className="text-lg font-semibold text-slate-300">검색 결과가 없습니다.</p>
          </section>
        ) : (
          <>
            {viewMode === "list" && (
              <section className="mt-8 space-y-6">
                <div className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
                  {featuredEvents[0] && (
                    <FeaturedCard event={featuredEvents[0]} onOpen={(id) => router.push(`/events/${id}`)} />
                  )}

                  <div className="grid gap-5">
                    {featuredEvents.slice(1, 3).map((event) => (
                      <MiniFeatureCard key={event.id} event={event} onOpen={(id) => router.push(`/events/${id}`)} />
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {listEvents.map((event) => (
                    <EventCard key={event.id} event={event} onOpen={(id) => router.push(`/events/${id}`)} />
                  ))}
                </div>
              </section>
            )}

            {viewMode === "map" && (
              <section className="mt-8 rounded-[2rem] border border-white/10 bg-white/[0.04] p-4 shadow-[0_20px_80px_rgba(0,0,0,.25)] md:p-5">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3 px-2">
                  <div>
                    <h2 className="text-xl font-bold text-white">공연장 지도</h2>
                    <p className="mt-1 text-sm text-slate-400">마커를 누르면 해당 공연장 일정만 따로 볼 수 있습니다.</p>
                  </div>
                  {mapError && <p className="text-sm font-medium text-rose-300">{mapError}</p>}
                </div>
                <div className="relative h-[68vh] min-h-[460px] overflow-hidden rounded-[1.6rem] border border-white/10 bg-[#09111d]">
                  {!mapLoaded && !mapError && (
                    <div className="absolute inset-0 z-10 flex items-center justify-center">
                      <p className="text-sm font-medium text-slate-400">지도를 불러오는 중입니다...</p>
                    </div>
                  )}
                  <div id="kakao-map" className="h-full w-full" />
                </div>
              </section>
            )}

            {viewMode === "calendar" && (
              <section className="mt-8 rounded-[2rem] border border-white/10 bg-white/[0.04] p-5 md:p-8">
                <div className="mb-8 flex items-center justify-between border-b border-white/10 pb-5">
                  <CircleButton onClick={() => setCurrentMonth(new Date(year, month - 1, 1))}>◀</CircleButton>
                  <h2 className="text-2xl font-bold text-white">{year}년 {month + 1}월</h2>
                  <CircleButton onClick={() => setCurrentMonth(new Date(year, month + 1, 1))}>▶</CircleButton>
                </div>

                <div className="mb-4 grid grid-cols-7 gap-2 text-center text-sm font-bold">
                  {["일", "월", "화", "수", "목", "금", "토"].map((day) => (
                    <div key={day} className={day === "일" ? "text-rose-400" : day === "토" ? "text-sky-400" : "text-slate-400"}>
                      {day}
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-7 gap-2 md:gap-3">
                  {Array.from({ length: firstDayOfMonth }).map((_, index) => (
                    <div key={`empty-${index}`} className="aspect-square" />
                  ))}

                  {Array.from({ length: daysInMonth }).map((_, index) => {
                    const day = index + 1;
                    const dateKey = getDateKey(day);
                    const dayEvents = sortedEvents.filter((event) => event.date.includes(dateKey));
                    const hasEvents = dayEvents.length > 0;

                    return (
                      <button
                        key={day}
                        type="button"
                        onClick={() => hasEvents && setSelectedDateEvents({ date: dateKey, events: dayEvents })}
                        className={`aspect-square rounded-2xl border p-2 transition ${hasEvents
                            ? "border-sky-400/20 bg-sky-500/10 hover:bg-sky-500/20"
                            : "border-white/6 bg-black/10 text-slate-600"
                          }`}
                      >
                        <div className={`text-lg font-bold ${hasEvents ? "text-sky-200" : ""}`}>{day}</div>
                        {hasEvents && (
                          <span className="mt-2 inline-flex rounded-full bg-sky-500 px-2 py-0.5 text-[11px] font-bold text-white">
                            {dayEvents.length}건
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </section>
            )}
          </>
        )}

        {selectedVenue && (
          <Modal title={`${selectedVenue} 공연 일정`} onClose={() => setSelectedVenue(null)}>
            <div className="space-y-4">
              {sortedEvents
                .filter((event) => event.venueName === selectedVenue)
                .map((event) => (
                  <EventCard key={event.id} event={event} compact onOpen={(id) => router.push(`/events/${id}`)} />
                ))}
            </div>
          </Modal>
        )}

        {selectedDateEvents && (
          <Modal title={`${selectedDateEvents.date} 공연 일정`} onClose={() => setSelectedDateEvents(null)}>
            <div className="space-y-4">
              {selectedDateEvents.events.map((event) => (
                <EventCard key={event.id} event={event} compact onOpen={(id) => router.push(`/events/${id}`)} />
              ))}
            </div>
          </Modal>
        )}
      </div>
    </main>
  );
}

function ViewButton({
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
      className={`rounded-[1rem] px-4 py-3 text-sm font-semibold transition ${active ? "bg-white text-slate-900 shadow-sm" : "text-slate-400 hover:text-white"
        }`}
    >
      {children}
    </button>
  );
}

function CircleButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white transition hover:bg-white/10"
    >
      {children}
    </button>
  );
}

function MetricCard({ label, value, description }: { label: string; value: string; description: string }) {
  return (
    <div className="rounded-[1.4rem] border border-white/10 bg-white/[0.05] p-4 backdrop-blur">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <p className="mt-3 text-2xl font-black tracking-tight text-white">{value}</p>
      <p className="mt-1 text-sm text-slate-400">{description}</p>
    </div>
  );
}

function MoodItem({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-[1.4rem] border border-white/10 bg-black/20 p-4">
      <p className="text-sm font-semibold text-white">{title}</p>
      <p className="mt-2 text-sm leading-6 text-slate-400">{body}</p>
    </div>
  );
}

function FeaturedCard({ event, onOpen }: { event: EventItem; onOpen: (id: string) => void }) {
  const priceLines = getPriceLines(event.price);

  return (
    <button
      type="button"
      onClick={() => onOpen(event.id)}
      className="overflow-hidden rounded-[2rem] border border-white/10 bg-[linear-gradient(160deg,rgba(15,23,42,.96),rgba(11,18,32,.92))] text-left shadow-[0_24px_80px_rgba(0,0,0,.28)] transition hover:-translate-y-0.5"
    >
      <div className="grid h-full gap-0 lg:grid-cols-[0.86fr_1.14fr]">
        <div className="relative min-h-[260px] border-b border-white/10 bg-black/20 lg:min-h-full lg:border-b-0 lg:border-r">
          {isRenderablePoster(event.posterUrl) ? (
            <img
              src={event.posterUrl}
              alt={event.title || "공연 포스터"}
              className="h-full w-full object-cover"
              loading="lazy"
              decoding="async"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="flex h-full items-end bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,.25),transparent_35%),linear-gradient(180deg,#111827,#020617)] p-6">
              <span className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs font-semibold text-sky-100">
                Featured Live
              </span>
            </div>
          )}
        </div>

        <div className="flex flex-col justify-between p-6 md:p-8">
          <div>
            <div className="mb-4 flex flex-wrap gap-2">
              {event.date && <span className="rounded-full bg-sky-400/10 px-3 py-1 text-xs font-semibold text-sky-200">{event.date}</span>}
              {event.venueName && <span className="rounded-full bg-white/6 px-3 py-1 text-xs font-semibold text-slate-300">{event.venueName}</span>}
            </div>
            <h2 className="text-2xl font-black leading-snug tracking-tight text-white md:text-3xl">{event.title || "제목 없는 공연"}</h2>
            {event.artistNames && <p className="mt-4 text-base leading-7 text-slate-300">{event.artistNames}</p>}
          </div>

          <div className="mt-6 space-y-3 text-sm text-slate-300">
            {(event.date || event.time) && (
              <p className="flex gap-3"><span className="w-10 text-slate-500">일시</span><span className="font-medium text-white">{[event.date, event.time].filter(Boolean).join(" ")}</span></p>
            )}
            {priceLines.length > 0 && (
              <div className="flex gap-3"><span className="w-10 text-slate-500">티켓</span><div className="space-y-1">{priceLines.map((line) => <p key={line} className="font-bold text-sky-300">{line}</p>)}</div></div>
            )}
          </div>
        </div>
      </div>
    </button>
  );
}

function MiniFeatureCard({ event, onOpen }: { event: EventItem; onOpen: (id: string) => void }) {
  const infoText = [event.date, event.time, event.venueName].filter(Boolean).join(" · ");

  return (
    <button
      type="button"
      onClick={() => onOpen(event.id)}
      className="rounded-[1.8rem] border border-white/10 bg-white/[0.04] p-5 text-left transition hover:-translate-y-0.5 hover:bg-white/[0.06]"
    >
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Curated Pick</p>
      <h3 className="mt-3 text-xl font-bold leading-snug text-white">{event.title || "제목 없는 공연"}</h3>
      <p className="mt-3 text-sm leading-6 text-slate-400">{infoText || "상세 정보를 확인해보세요."}</p>
      {event.artistNames && <p className="mt-4 line-clamp-2 text-sm leading-6 text-slate-300">{event.artistNames}</p>}
    </button>
  );
}

function EventCard({
  event,
  onOpen,
  compact = false,
}: {
  event: EventItem;
  onOpen: (id: string) => void;
  compact?: boolean;
}) {
  const priceLines = getPriceLines(event.price);
  const externalLink = getExternalLink(event.sourceUrl);

  return (
    <button
      type="button"
      onClick={() => onOpen(event.id)}
      className={`w-full rounded-[1.7rem] border border-white/10 bg-white/[0.04] p-5 text-left transition hover:-translate-y-0.5 hover:border-white/15 hover:bg-white/[0.06] ${compact ? "" : "min-h-[280px]"}`}
    >
      <div className="flex h-full flex-col">
        <div className="mb-4 flex flex-wrap gap-2">
          {event.date && <span className="rounded-full bg-white/6 px-3 py-1 text-xs font-semibold text-slate-300">{event.date}</span>}
          {event.time && <span className="rounded-full bg-white/6 px-3 py-1 text-xs font-semibold text-slate-300">{event.time}</span>}
        </div>

        <h3 className="text-xl font-bold leading-snug tracking-tight text-white">{event.title || "제목 없는 공연"}</h3>

        <div className="mt-4 flex-1 space-y-3 text-sm text-slate-300">
          {event.venueName && <InfoRow label="장소" value={event.venueName} />}
          {event.artistNames && <InfoRow label="출연" value={event.artistNames} />}
          {priceLines.length > 0 && (
            <div className="flex items-start gap-3">
              <span className="w-10 shrink-0 text-slate-500">티켓</span>
              <div className="space-y-1">
                {priceLines.map((line) => (
                  <p key={`${event.id}-${line}`} className="font-bold text-sky-300">
                    {line}
                  </p>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="mt-5 flex items-center justify-between border-t border-white/10 pt-4 text-sm">
          <span className="font-semibold text-white">상세 보기</span>
          <span className="text-slate-500">{externalLink ? "외부 안내 링크 있음" : "상세 정보 확인"}</span>
        </div>
      </div>
    </button>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <p className="flex items-start gap-3">
      <span className="w-10 shrink-0 text-slate-500">{label}</span>
      <span className="font-medium text-white">{value}</span>
    </p>
  );
}

function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 md:items-center md:p-4" onClick={onClose}>
      <div
        className="flex max-h-[88vh] w-full max-w-3xl flex-col rounded-t-[2rem] border border-white/10 bg-[#0f172a] p-6 shadow-2xl md:rounded-[2rem] md:p-8"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-6 flex items-center justify-between">
          <h3 className="text-2xl font-black tracking-tight text-white">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 text-slate-200 transition hover:bg-white/10"
          >
            ✕
          </button>
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto pr-1">{children}</div>
      </div>
    </div>
  );
}