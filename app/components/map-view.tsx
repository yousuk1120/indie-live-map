"use client";

// 지도 탭: 카카오맵 + 공연장별 일정 목록

import { useEffect, useMemo, useRef, useState } from "react";
import Script from "next/script";
import {
  type EventItem,
  prepareUpcomingEvents,
  venueSearchCandidates,
  toText,
} from "@/lib/events";
import { venueGroupKey, canonicalVenueName } from "@/lib/venues";
import { ScheduleRow } from "./event-cards";

declare global {
  interface Window {
    kakao?: any;
  }
}

const DEFAULT_CENTER = { lat: 37.5559, lng: 126.9234 };

// 공연장 좌표 캐시 — 한 번 검색한 좌표는 기기에 저장해 재방문 시 즉시 표시
const COORDS_CACHE_KEY = "indieLive.venueCoords.v1";

type CoordsCache = Record<string, { lat: number; lng: number }>;

function loadCoordsCache(): CoordsCache {
  try {
    const raw = localStorage.getItem(COORDS_CACHE_KEY);
    return raw ? (JSON.parse(raw) as CoordsCache) : {};
  } catch {
    return {};
  }
}

function saveCoordsCache(cache: CoordsCache) {
  try {
    localStorage.setItem(COORDS_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // ignore
  }
}

type VenueBucket = {
  venueName: string;
  events: EventItem[];
};

export default function MapView({
  initialEvents,
  loadError,
}: {
  initialEvents: EventItem[];
  loadError: string;
}) {
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState("");
  const [origin, setOrigin] = useState("");
  const [activeVenue, setActiveVenue] = useState("");

  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const markersRef = useRef<any[]>([]);
  const mapRef = useRef<any>(null);
  const venuePositionsRef = useRef<Map<string, any>>(new Map());
  const kakaoKey = process.env.NEXT_PUBLIC_KAKAO_MAP_API_KEY;

  useEffect(() => {
    if (typeof window !== "undefined") {
      setOrigin(window.location.origin);
      // 탭 이동 후 돌아왔을 때 SDK가 이미 로드돼 있으면 바로 사용
      if (window.kakao?.maps) setMapReady(true);
    }
  }, []);

  const sortedEvents = useMemo(() => prepareUpcomingEvents(initialEvents), [initialEvents]);

  const venueBuckets = useMemo(() => {
    // 별칭 매핑(lib/venues) 기반 그룹핑 — 같은 공연장의 한/영 표기를 하나로 통일
    const bucket = new Map<string, { displayName: string; events: EventItem[] }>();
    sortedEvents.forEach((event) => {
      const venue = toText(event.venueName);
      if (!venue) return;
      const key = venueGroupKey(venue);
      if (!key) return;
      const displayName = canonicalVenueName(venue) || venue;
      const existing = bucket.get(key);
      if (existing) {
        existing.events.push(event);
        if (/[가-힣]/.test(displayName) && !/[가-힣]/.test(existing.displayName)) {
          existing.displayName = displayName;
        }
      } else {
        bucket.set(key, { displayName, events: [event] });
      }
    });

    return Array.from(bucket.values())
      .map((b): VenueBucket => ({ venueName: b.displayName, events: b.events }))
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
    const activeKey = venueGroupKey(activeVenue);
    return sortedEvents.filter((event) => venueGroupKey(event.venueName) === activeKey);
  }, [activeVenue, sortedEvents]);

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
    if (!mapReady || !window.kakao?.maps || !mapContainerRef.current) return;

    let cancelled = false;

    window.kakao.maps.load(() => {
      if (cancelled || !mapContainerRef.current) return;

      const map = new window.kakao.maps.Map(mapContainerRef.current, {
        center: new window.kakao.maps.LatLng(DEFAULT_CENTER.lat, DEFAULT_CENTER.lng),
        level: 6,
        draggable: true,
      });

      // PC 마우스 드래그/스크롤 줌 명시 활성화 + 레이아웃 보정
      map.setDraggable(true);
      map.setZoomable(true);
      window.setTimeout(() => map.relayout(), 0);

      // 마커 클릭 시 장소명을 보여줄 인포윈도우 (지도당 1개 재사용)
      const infoWindow = new window.kakao.maps.InfoWindow({ zIndex: 10 });

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
      const coordsCache = loadCoordsCache();
      let cacheDirty = false;
      let found = 0;
      let resolved = 0;

      const done = () => {
        resolved += 1;
        if (resolved === venueBuckets.length) {
          if (cacheDirty) saveCoordsCache(coordsCache);
          if (found > 0) {
            map.setBounds(bounds);
            setMapError("");
          } else {
            setMapError(`공연장 좌표를 찾지 못했습니다. Kakao Developers에 ${origin || "현재 도메인"} 을 JavaScript SDK 도메인으로 등록했는지 확인하세요.`);
          }
        }
      };

      const addMarker = (bucket: VenueBucket, position: any) => {
        const marker = new window.kakao.maps.Marker({ map, position });
        markersRef.current.push(marker);
        venuePositionsRef.current.set(bucket.venueName, position);
        bounds.extend(position);
        found += 1;

        // 마커 클릭: 장소명 팝업 + 해당 공연장 일정 선택 + 지도 이동
        window.kakao.maps.event.addListener(marker, "click", () => {
          setActiveVenue(bucket.venueName);
          infoWindow.setContent(
            `<div style="padding:6px 12px;font-size:12px;font-weight:700;color:#111;white-space:nowrap;">${bucket.venueName}<span style="margin-left:6px;font-weight:500;color:#7c3aed;">${bucket.events.length}개 공연</span></div>`
          );
          infoWindow.open(map, marker);
          map.panTo(position);
        });
      };

      venueBuckets.forEach((bucket) => {
        const cacheKey = venueGroupKey(bucket.venueName);

        // 캐시된 좌표가 있으면 검색 없이 즉시 마커 생성
        const cached = cacheKey ? coordsCache[cacheKey] : undefined;
        if (cached) {
          addMarker(bucket, new window.kakao.maps.LatLng(cached.lat, cached.lng));
          done();
          return;
        }

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
              const lat = Number(place.y);
              const lng = Number(place.x);
              addMarker(bucket, new window.kakao.maps.LatLng(lat, lng));

              if (cacheKey) {
                coordsCache[cacheKey] = { lat, lng };
                cacheDirty = true;
              }

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
  }, [mapReady, venueBuckets, origin]);

  if (loadError) {
    return (
      <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-6 text-sm text-red-400">
        {loadError}
      </div>
    );
  }

  return (
    <>
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

      {/* 주의: transform 애니메이션은 카카오맵 드래그 좌표를 깨뜨리므로 opacity 전용 사용 */}
      <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px] animate-fade-pure">
        <div className="order-1 overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--panel)]">
          <div className="flex items-center justify-between border-b border-[var(--line)] px-4 py-3">
            <h2 className="text-sm font-semibold text-white">Map</h2>
            {mapError ? <p className="text-xs text-[var(--muted)]">{mapError}</p> : null}
          </div>
          <div ref={mapContainerRef} className="h-[380px] w-full lg:h-[520px]" />
        </div>

        <aside className="order-2 flex h-[380px] flex-col lg:h-[520px]">
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
                <ScheduleRow key={event.id} event={event} />
              ))
            ) : (
              <div className="flex h-full items-center justify-center rounded-2xl border border-[var(--line)] bg-[var(--panel)] px-4 py-8 text-center text-sm text-[var(--muted)]">
                지도에서 공연장 마커를 클릭하면<br />공연 일정이 표시됩니다.
              </div>
            )}
          </div>
        </aside>
      </section>
    </>
  );
}
