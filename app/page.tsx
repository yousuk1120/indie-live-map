"use client";

import { useEffect, useState, useMemo } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase/firestore";
import Script from "next/script";

declare global {
  interface Window {
    kakao: any;
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

const formatUrl = (url?: string) => {
  if (!url) return "#";
  const trimmed = url.trim();
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) return trimmed;
  if (trimmed.startsWith("@")) return `https://instagram.com/${trimmed.substring(1)}`;
  return `https://${trimmed}`;
};

export default function Home() {
  const [events, setEvents] = useState<EventItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<"list" | "map" | "calendar">("list");

  const [mapLoaded, setMapLoaded] = useState(false);
  const [selectedVenue, setSelectedVenue] = useState<string | null>(null);
  const [selectedDateEvents, setSelectedDateEvents] = useState<{ date: string, events: EventItem[] } | null>(null);
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

  // 검색 필터링: 제목, 공연장, 아티스트 이름을 모두 훑습니다.
  const filteredEvents = useMemo(() => {
    if (!searchQuery) return events;

    const q = searchQuery.toLowerCase();
    return events.filter((event) => {
      return (
        event.title?.toLowerCase().includes(q) ||
        event.venueName?.toLowerCase().includes(q) ||
        event.artistNames?.toLowerCase().includes(q)
      );
    });
  }, [events, searchQuery]);

  const sortEvents = (eventsToSort: EventItem[]) => {
    const parseDate = (d?: string, t?: string) => {
      if (!d) return Infinity;
      try {
        const parts = d.split('-');
        if (parts.length === 3) {
          if (parts[0].length === 2) parts[0] = `20${parts[0]}`;
          const timeStr = t || "23:59";
          return new Date(`${parts.join('-')}T${timeStr}`).getTime();
        }
        return Infinity;
      } catch (e) {
        return Infinity;
      }
    };
    return [...eventsToSort].sort((a, b) => parseDate(a.date, a.time) - parseDate(b.date, b.time));
  };

  useEffect(() => {
    if (viewMode === "map" && mapLoaded && window.kakao) {
      window.kakao.maps.load(() => {
        const container = document.getElementById("kakao-map");
        if (!container) return;

        const options = { center: new window.kakao.maps.LatLng(37.5559, 126.9234), level: 6 };
        const map = new window.kakao.maps.Map(container, options);
        const ps = new window.kakao.maps.services.Places();

        const uniqueVenues = Array.from(new Set(filteredEvents.map(e => e.venueName).filter(Boolean))) as string[];

        uniqueVenues.forEach((venueName) => {
          ps.keywordSearch(venueName, (data: any, status: any) => {
            if (status === window.kakao.maps.services.Status.OK) {
              const coords = new window.kakao.maps.LatLng(data[0].y, data[0].x);
              const marker = new window.kakao.maps.Marker({ map, position: coords });

              const infowindow = new window.kakao.maps.InfoWindow({
                content: `<div style="padding:8px;font-size:14px;font-weight:bold;color:#1e293b;white-space:nowrap;border-radius:8px;">${venueName}</div>`,
                disableAutoPan: true,
              });

              window.kakao.maps.event.addListener(marker, 'mouseover', () => infowindow.open(map, marker));
              window.kakao.maps.event.addListener(marker, 'mouseout', () => infowindow.close());
              window.kakao.maps.event.addListener(marker, 'click', () => setSelectedVenue(venueName));
            }
          });
        });
      });
    }
  }, [viewMode, mapLoaded, filteredEvents]);

  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayOfMonth = new Date(year, month, 1).getDay();

  const getFormattedDateString = (d: number) => {
    const yy = String(year).slice(-2);
    const mm = String(month + 1).padStart(2, '0');
    const dd = String(d).padStart(2, '0');
    return `${yy}-${mm}-${dd}`;
  };

  return (
    // 토스 다크모드 특유의 진한 회/검정 배경
    <main className="min-h-screen bg-[#0F0F10] text-[#F2F4F6] font-sans selection:bg-[#3182F6]/30">

      <Script
        src={`https://dapi.kakao.com/v2/maps/sdk.js?appkey=${process.env.NEXT_PUBLIC_KAKAO_MAP_API_KEY}&libraries=services&autoload=false`}
        onLoad={() => setMapLoaded(true)}
      />

      <div className="max-w-5xl mx-auto p-4 md:p-8 pt-12 md:pt-16">
        <header className="mb-10 text-left md:text-center">
          <h1 className="text-3xl md:text-4xl font-extrabold text-[#F9FAFB] mb-3 tracking-tight">Authentic Map</h1>
          <p className="text-[#8B95A1] font-medium text-base">인디 공연과 라이브 클럽 일정을 한눈에.</p>
        </header>

        <div className="flex flex-col md:flex-row gap-4 mb-10 items-center justify-between">
          <div className="relative w-full md:max-w-md">
            <input
              type="text" placeholder="공연명, 장소, 아티스트 검색" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-[#19191B] border border-transparent rounded-2xl py-4 px-5 pr-12 text-[#F9FAFB] placeholder-[#8B95A1] focus:outline-none focus:bg-[#222225] transition-all text-base shadow-sm"
            />
          </div>

          <div className="flex bg-[#19191B] p-1.5 rounded-2xl w-full md:w-auto overflow-x-auto custom-scrollbar shadow-sm">
            <button onClick={() => setViewMode("list")} className={`flex-1 min-w-[90px] md:flex-none px-6 py-3 rounded-xl text-[15px] font-bold transition-all ${viewMode === "list" ? "bg-[#3182F6] text-white shadow-md" : "text-[#8B95A1] hover:text-[#F9FAFB]"}`}>목록</button>
            <button onClick={() => setViewMode("map")} className={`flex-1 min-w-[90px] md:flex-none px-6 py-3 rounded-xl text-[15px] font-bold transition-all ${viewMode === "map" ? "bg-[#3182F6] text-white shadow-md" : "text-[#8B95A1] hover:text-[#F9FAFB]"}`}>지도</button>
            <button onClick={() => setViewMode("calendar")} className={`flex-1 min-w-[90px] md:flex-none px-6 py-3 rounded-xl text-[15px] font-bold transition-all ${viewMode === "calendar" ? "bg-[#3182F6] text-white shadow-md" : "text-[#8B95A1] hover:text-[#F9FAFB]"}`}>달력</button>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-32"><p className="text-[#8B95A1] font-medium text-lg">데이터를 불러오고 있어요</p></div>
        ) : filteredEvents.length === 0 ? (
          <div className="bg-[#19191B] rounded-3xl py-32 text-center"><p className="text-[#8B95A1] font-medium text-lg">검색 결과가 없어요.</p></div>
        ) : (
          <>
            {viewMode === "list" && (
              <div key="view-list" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 md:gap-6 animate-in fade-in duration-300">
                {sortEvents(filteredEvents).map((event) => <EventCard key={event.id} event={event} />)}
              </div>
            )}

            {viewMode === "map" && (
              /* DOM 재활용 버그 방지용 key 추가 */
              <div key="view-map" className="bg-[#19191B] rounded-[2rem] p-2 h-[65vh] min-h-[500px] relative overflow-hidden animate-in fade-in duration-300 shadow-sm">
                {!mapLoaded && <div className="absolute inset-0 flex items-center justify-center bg-[#19191B] z-10"><p className="text-[#8B95A1] font-medium text-sm">지도를 불러오고 있어요...</p></div>}
                <div id="kakao-map" className="w-full h-full rounded-[1.5rem] bg-[#222225]"></div>
              </div>
            )}

            {viewMode === "calendar" && (
              <div key="view-calendar" className="bg-[#19191B] rounded-[2rem] p-6 md:p-10 shadow-sm animate-in fade-in duration-300">
                <div className="flex items-center justify-between mb-8 pb-6 border-b border-[#2A2A2E]">
                  <button onClick={() => setCurrentMonth(new Date(year, month - 1, 1))} className="w-12 h-12 flex items-center justify-center bg-[#2A2A2E] hover:bg-[#3A3A3E] rounded-full text-[#F9FAFB] transition">◀</button>
                  <h2 className="text-2xl font-bold text-[#F9FAFB]">{year}년 {month + 1}월</h2>
                  <button onClick={() => setCurrentMonth(new Date(year, month + 1, 1))} className="w-12 h-12 flex items-center justify-center bg-[#2A2A2E] hover:bg-[#3A3A3E] rounded-full text-[#F9FAFB] transition">▶</button>
                </div>

                <div className="grid grid-cols-7 gap-2 md:gap-4 mb-4 text-center">
                  {['일', '월', '화', '수', '목', '금', '토'].map(day => <div key={day} className={`text-[15px] font-bold ${day === '일' ? 'text-[#F04452]' : day === '토' ? 'text-[#3182F6]' : 'text-[#8B95A1]'}`}>{day}</div>)}
                </div>

                <div className="grid grid-cols-7 gap-2 md:gap-4">
                  {Array.from({ length: firstDayOfMonth }).map((_, i) => <div key={`empty-${i}`} className="aspect-square"></div>)}

                  {Array.from({ length: daysInMonth }).map((_, i) => {
                    const d = i + 1;
                    const dateStr = getFormattedDateString(d);
                    const dayEvents = filteredEvents.filter(e => e.date?.includes(dateStr));
                    const hasEvents = dayEvents.length > 0;

                    return (
                      <div
                        key={d}
                        onClick={() => hasEvents && setSelectedDateEvents({ date: dateStr, events: dayEvents })}
                        className={`aspect-square flex flex-col items-center justify-center rounded-2xl transition-all ${hasEvents ? 'bg-[#3182F6]/10 cursor-pointer hover:bg-[#3182F6]/20' : 'bg-transparent text-[#4E5968]'}`}
                      >
                        <span className={`text-lg md:text-xl font-bold ${hasEvents ? 'text-[#3182F6]' : ''}`}>{d}</span>
                        {hasEvents && <span className="mt-1 text-[11px] md:text-xs font-bold text-white bg-[#3182F6] px-2 py-0.5 rounded-full shadow-sm">{dayEvents.length}건</span>}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}

        {/* 팝업 모달 */}
        {selectedVenue && (
          <Modal title={`${selectedVenue}`} onClose={() => setSelectedVenue(null)}>
            <div className="space-y-4">
              {sortEvents(filteredEvents.filter(e => e.venueName === selectedVenue)).map(event => (
                <EventCard key={event.id} event={event} isCompact />
              ))}
            </div>
          </Modal>
        )}

        {selectedDateEvents && (
          <Modal title={`${selectedDateEvents.date} 공연 일정`} onClose={() => setSelectedDateEvents(null)}>
            <div className="space-y-4">
              {sortEvents(selectedDateEvents.events).map(event => (
                <EventCard key={event.id} event={event} isCompact />
              ))}
            </div>
          </Modal>
        )}
      </div>
    </main>
  );
}

// 토스 스타일 둥글고 부드러운 카드
function EventCard({ event, isCompact = false }: { event: EventItem, isCompact?: boolean }) {
  const targetUrl = formatUrl(event.sourceUrl);

  return (
    <a href={targetUrl} target={targetUrl !== "#" ? "_blank" : "_self"} rel="noopener noreferrer" className="block h-full outline-none focus:ring-2 focus:ring-[#3182F6] rounded-3xl active:scale-[0.98] transition-transform">
      <div className={`bg-[#19191B] hover:bg-[#222225] transition-colors duration-200 flex flex-col h-full overflow-hidden ${isCompact ? 'p-5 rounded-3xl' : 'p-6 md:p-7 rounded-[2rem]'}`}>

        {event.posterUrl && (
          <div className={`w-full bg-[#101010] rounded-2xl overflow-hidden ${isCompact ? 'mb-4 aspect-[4/3]' : 'mb-5 aspect-square'}`}>
            <img src={event.posterUrl} alt="포스터" className="w-full h-full object-contain" referrerPolicy="no-referrer" />
          </div>
        )}

        <h2 className={`${isCompact ? 'text-lg' : 'text-xl'} font-bold text-[#F9FAFB] mb-4 line-clamp-2 leading-snug tracking-tight`}>{event.title || "제목 없는 공연"}</h2>

        <div className="space-y-3 text-[15px] font-medium text-[#B0B8C1] flex-1">
          {(event.date || event.time) && (
            <p className="flex items-start gap-4">
              <span className="shrink-0 text-[#8B95A1] w-8">일시</span>
              <span className="text-[#F9FAFB]">{event.date} {event.time}</span>
            </p>
          )}
          {event.venueName && (
            <p className="flex items-start gap-4">
              <span className="shrink-0 text-[#8B95A1] w-8">장소</span>
              <span className="text-[#F9FAFB]">{event.venueName}</span>
            </p>
          )}
          {event.artistNames && (
            <p className="flex items-start gap-4">
              <span className="shrink-0 text-[#8B95A1] w-8">출연</span>
              <span className="text-[#F9FAFB] line-clamp-2">{event.artistNames}</span>
            </p>
          )}
          {event.price && (
            <p className="flex items-start gap-4 pt-1">
              <span className="shrink-0 text-[#8B95A1] w-8 mt-0.5">티켓</span>
              <span className="text-[#3182F6] font-bold text-lg">{event.price}</span>
            </p>
          )}
        </div>
      </div>
    </a>
  );
}

// 깔끔한 팝업
function Modal({ title, children, onClose }: { title: string, children: React.ReactNode, onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 bg-[#000000]/80 flex items-end md:items-center justify-center animate-in fade-in duration-200" onClick={onClose}>
      <div className="bg-[#19191B] w-full max-w-lg rounded-t-[2rem] md:rounded-[2rem] p-6 md:p-8 shadow-2xl relative max-h-[85vh] flex flex-col animate-in slide-in-from-bottom-10 md:slide-in-from-bottom-0" onClick={e => e.stopPropagation()}>
        {/* 모바일 손잡이 */}
        <div className="w-12 h-1.5 bg-[#2A2A2E] rounded-full mx-auto mb-6 md:hidden"></div>

        <div className="flex justify-between items-center mb-6 pb-2">
          <h3 className="text-xl md:text-2xl font-extrabold text-[#F9FAFB] tracking-tight">{title}</h3>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center bg-[#2A2A2E] hover:bg-[#3A3A3E] rounded-full text-[#B0B8C1] transition font-bold text-lg">✕</button>
        </div>
        <div className="overflow-y-auto custom-scrollbar flex-1 pr-1 pb-4">
          {children}
        </div>
      </div>
    </div>
  );
}