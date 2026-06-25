// 공연 중복 판정 + 병합 로직 — cron 파이프라인(서버), 관리자 페이지(클라이언트) 공용.
// 순수 함수만 포함합니다.

import { venueGroupKey, canonicalVenueName } from "./venues";
//
// 핵심 정책:
//  1) 같은 공연 판정: 날짜 겹침 + (제목 유사 | 같은 장소+라인업 겹침 | 라인업 대부분 일치)
//  2) 병합 시 한국어 표기 우선 (제목/장소)
//  3) 페스티벌 멀티데이: date~endDate 범위 + 날짜별 라인업(dayLineups) 누적 병합

export type DayLineup = { date: string; artists: string };

export type ConcertRecord = {
  id?: string;
  title?: string;
  date?: string;
  endDate?: string;
  time?: string;
  venueName?: string;
  artistNames?: string;
  sourceUrl?: string;
  instagramUrl?: string;
  price?: string;
  posterUrl?: string;
  timetableImageUrl?: string;
  ticketOpenAt?: string; // 티켓 예매 오픈 일시 "YYYY-MM-DD HH:mm"
  dayLineups?: DayLineup[];
};

export function normalizeDateString(value?: string): string {
  if (!value) return "";
  const match = String(value).match(/(\d{2,4})[./-](\d{1,2})[./-](\d{1,2})/);
  if (!match) return "";
  const [, y, m, d] = match;
  const year = y.length === 2 ? `20${y}` : y;
  return `${year}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

// 날짜 "범위" 인식 — "2026.8.14~16", "6/12-14", "8월 14일~16일", "2026-06-12 ~ 2026-06-14" 등.
// 멀티데이 페스티벌이 date 한 칸에 범위 문자열로 들어온 경우 endDate를 복원합니다.
export function extractDateRange(value?: string): { start: string; end: string } {
  const raw = String(value || "").trim();
  if (!raw) return { start: "", end: "" };

  // 시작일: "2026-06-12" 또는 "2026년 6월 12일" 표기 모두 인식
  let start = normalizeDateString(raw);
  if (!start) {
    const koreanStart = raw.match(/(\d{4})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일/);
    if (koreanStart) {
      start = `${koreanStart[1]}-${koreanStart[2].padStart(2, "0")}-${koreanStart[3].padStart(2, "0")}`;
    }
  }
  if (!start) return { start: "", end: "" };

  // 1) 완전한 날짜 두 개: "2026-06-12 ~ 2026-06-14", "6.12-6.14"
  const fullPair = raw.match(
    /(\d{2,4}[./-]\d{1,2}[./-]\d{1,2})\s*[~\-–—∼]\s*(\d{2,4}[./-]\d{1,2}[./-]\d{1,2})/
  );
  if (fullPair) {
    const end = normalizeDateString(fullPair[2]);
    return { start, end: end > start ? end : "" };
  }

  // 2) 월.일 짧은 종료: "8.14~9.2" (월/일), "6/12-14" (일만)
  const shortPair = raw.match(
    /\d{1,2}[./-](\d{1,2})\s*[~\-–—∼]\s*(?:(\d{1,2})[./-])?(\d{1,2})(?![./-]?\d)/
  );
  if (shortPair) {
    const year = start.slice(0, 4);
    const startMonth = start.slice(5, 7);
    const endMonth = shortPair[2] ? shortPair[2].padStart(2, "0") : startMonth;
    const endDay = shortPair[3].padStart(2, "0");
    const end = `${year}-${endMonth}-${endDay}`;
    return { start, end: end > start ? end : "" };
  }

  // 3) 한국어 표기: "6월 12일 ~ 14일", "8월 14일부터 16일까지"
  const korean = raw.match(/(\d{1,2})\s*월\s*(\d{1,2})\s*일?\s*(?:[~\-–—∼]|부터)\s*(?:(\d{1,2})\s*월\s*)?(\d{1,2})\s*일/);
  if (korean) {
    const year = start.slice(0, 4);
    const endMonth = (korean[3] || korean[1]).padStart(2, "0");
    const endDay = korean[4].padStart(2, "0");
    const end = `${year}-${endMonth}-${endDay}`;
    return { start, end: end > start ? end : "" };
  }

  return { start, end: "" };
}

export function normalizeConcertTitle(title: string): string {
  return title.toLowerCase().replace(/[\s\-_.,!?'"()\[\]]/g, "").replace(/[^\w가-힣]/g, "");
}

// 페스티벌 한/영 동의어 그룹 — 한국어/영문 표기가 달라도 같은 행사로 묶습니다.
export const FESTIVAL_SYNONYM_GROUPS: string[][] = [
  ["펜타포트", "pentaport"],
  ["원유니버스", "oneuniverse"],
  ["dmz", "디엠지", "피스트레인", "peacetrain"],
  ["점프", "jumf", "전주얼티밋"],
  ["그랜드민트", "gmf", "grandmint"],
  ["뷰티풀민트", "bml", "beautifulmint"],
  ["부산국제록", "birs", "busanrock"],
  ["사운드베리", "soundberry"],
];

export function areSimilarTitles(a: string, b: string): boolean {
  const na = normalizeConcertTitle(a);
  const nb = normalizeConcertTitle(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.length >= 4 && nb.length >= 4 && (na.includes(nb) || nb.includes(na))) return true;

  for (const group of FESTIVAL_SYNONYM_GROUPS) {
    if (group.some(k => na.includes(k)) && group.some(k => nb.includes(k))) {
      return true;
    }
  }

  return false;
}

export function hasKorean(value?: string): boolean {
  return /[가-힣]/.test(value || "");
}

// ─── 아티스트 라인업 비교 ───

export function splitArtists(value?: string): string[] {
  if (!value) return [];
  return value
    .split(/[,/|·]+/)
    .map((a) => a.trim())
    .filter((a) => a.length > 0);
}

function normalizeArtistKey(name: string): string {
  return name.toLowerCase().replace(/[\s\-_.,!?'"()\[\]]/g, "");
}

// 두 라인업의 겹침 비율 (작은 쪽 기준). 0~1.
export function lineupOverlapRatio(a?: string, b?: string): number {
  const listA = splitArtists(a).map(normalizeArtistKey).filter(Boolean);
  const listB = splitArtists(b).map(normalizeArtistKey).filter(Boolean);
  if (listA.length === 0 || listB.length === 0) return 0;

  const setB = new Set(listB);
  const common = listA.filter((k) => setB.has(k)).length;
  return common / Math.min(listA.length, listB.length);
}

export function normalizeVenueKey(value?: string): string {
  // 별칭 매핑(lib/venues)을 거쳐 같은 공연장이면 같은 키가 나오도록
  const grouped = venueGroupKey(value);
  return grouped || normalizeConcertTitle(value || "");
}

// ─── 날짜 범위 ───

export function getDateRange(ev: Pick<ConcertRecord, "date" | "endDate">): { start: string; end: string } {
  const start = normalizeDateString(ev.date);
  const endRaw = normalizeDateString(ev.endDate);
  const end = endRaw && endRaw >= start ? endRaw : start;
  return { start, end };
}

export function dateRangesOverlap(a: Pick<ConcertRecord, "date" | "endDate">, b: Pick<ConcertRecord, "date" | "endDate">): boolean {
  const ra = getDateRange(a);
  const rb = getDateRange(b);
  if (!ra.start || !rb.start) return false;
  return ra.start <= rb.end && rb.start <= ra.end;
}

// 두 날짜 범위 사이의 간격(일 수). 겹치면 0, 날짜 정보가 없으면 Infinity.
// 멀티데이 페스티벌이 "9/5", "9/6"처럼 날짜별로 따로 수집된 경우를 잡기 위해 사용합니다.
export function dateRangeGapDays(
  a: Pick<ConcertRecord, "date" | "endDate">,
  b: Pick<ConcertRecord, "date" | "endDate">
): number {
  const ra = getDateRange(a);
  const rb = getDateRange(b);
  if (!ra.start || !rb.start) return Number.POSITIVE_INFINITY;
  if (ra.start <= rb.end && rb.start <= ra.end) return 0;
  const [earlierEnd, laterStart] = ra.end < rb.start ? [ra.end, rb.start] : [rb.end, ra.start];
  const ms = new Date(`${laterStart}T00:00:00`).getTime() - new Date(`${earlierEnd}T00:00:00`).getTime();
  return Math.round(ms / 86_400_000);
}

// ─── 같은 공연 판정 ───
//
// 날짜가 겹치는 두 레코드가 아래 중 하나를 만족하면 같은 공연으로 봅니다:
//  a) 제목이 유사하고 장소가 충돌하지 않음 (한쪽이 비어 있어도 허용)
//  b) 장소가 동일(비어 있지 않음)하고 라인업이 절반 이상 겹침
//  c) 라인업이 70% 이상 겹침 (양쪽 모두 2팀 이상) — 제목을 다르게 뽑아온 같은 공연 케이스
export function isSameConcert(a: ConcertRecord, b: ConcertRecord): boolean {
  const venueA = normalizeVenueKey(a.venueName);
  const venueB = normalizeVenueKey(b.venueName);
  const venueEqual = !!venueA && venueA === venueB;
  // 장소 호환: 한쪽이 비었거나, 같거나, 접두 관계("...Park" vs "...Park, Incheon")
  const venueCompatible =
    !venueA || !venueB || venueA === venueB ||
    venueA.startsWith(venueB) || venueB.startsWith(venueA);

  const sameTitle = areSimilarTitles(a.title || "", b.title || "");
  const overlap = dateRangesOverlap(a, b);

  // 제목이 충분히 유사하면 같은 공연으로 봅니다.
  //  - 날짜가 겹치면(같은/멀티데이 공연) 동일 행사. 장소가 달라도(라이브클럽데이처럼
  //    한 행사가 여러 공연장에서 동시 진행 / 아티스트·기획사 계정 vs 공연장 계정) 묶습니다.
  //  - 날짜가 겹치지 않아도, 장소가 호환되고 날짜가 인접(±3일)하면 멀티데이 페스티벌이
  //    "9/5", "9/6"처럼 날짜별로 따로 수집된 경우로 보고 하나의 기간으로 병합합니다.
  if (sameTitle && (overlap || (venueCompatible && dateRangeGapDays(a, b) <= 3))) return true;

  // 아래 라인업 기반 판정은 날짜가 실제로 겹칠 때만 적용합니다.
  if (!overlap) return false;

  const lineupOverlap = lineupOverlapRatio(a.artistNames, b.artistNames);
  if (venueEqual && lineupOverlap >= 0.5) return true;

  const countA = splitArtists(a.artistNames).length;
  const countB = splitArtists(b.artistNames).length;
  if (lineupOverlap >= 0.7 && countA >= 2 && countB >= 2 && venueCompatible) return true;

  return false;
}

// 최소 수집 기준: 제목 + 날짜. 이보다 정보가 적으면 아예 수집하지 않습니다.
export function hasMinimumEventInfo(p: { title?: string; date?: string }): boolean {
  return !!(p.title && p.title.trim()) && !!normalizeDateString(p.date);
}

// ─── 병합 ───

// 한국어 표기 우선, 둘 다 같은 언어면 더 길고 구체적인 쪽 선택
export function preferKoreanText(a?: string, b?: string): string {
  const ta = (a || "").trim();
  const tb = (b || "").trim();
  if (!ta) return tb;
  if (!tb) return ta;
  if (hasKorean(ta) && !hasKorean(tb)) return ta;
  if (hasKorean(tb) && !hasKorean(ta)) return tb;
  return tb.length > ta.length ? tb : ta;
}

function pickNonEmpty(a?: string, b?: string): string {
  return (a || "").trim() || (b || "").trim();
}

// 라인업 합집합 (기존 순서 유지, 대소문자/공백 무시 중복 제거)
export function mergeArtistNames(a?: string, b?: string): string {
  const seen = new Set<string>();
  const merged: string[] = [];
  for (const artist of [...splitArtists(a), ...splitArtists(b)]) {
    const key = normalizeArtistKey(artist);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    merged.push(artist);
  }
  return merged.join(", ");
}

// 공연장 병합 — 같은 행사가 여러 공연장에서 열리면 "A / B"로 합칩니다 (별칭 기준 중복 제거).
export function mergeVenueNames(a?: string, b?: string): string {
  const split = (v?: string) =>
    String(v || "")
      .split(/\s*\/\s*/)
      .map((s) => s.trim())
      .filter(Boolean);

  const out: string[] = [];
  const seen = new Set<string>();
  for (const v of [...split(a), ...split(b)]) {
    const key = normalizeVenueKey(v);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(v);
  }
  return out.join(" / ");
}

// 날짜별 라인업 병합: 같은 날짜는 아티스트 합집합
export function mergeDayLineups(a?: DayLineup[], b?: DayLineup[]): DayLineup[] {
  const byDate = new Map<string, string>();

  for (const day of [...(a || []), ...(b || [])]) {
    const dateKey = normalizeDateString(day?.date);
    const artists = (day?.artists || "").trim();
    if (!dateKey || !artists) continue;
    const existing = byDate.get(dateKey);
    byDate.set(dateKey, existing ? mergeArtistNames(existing, artists) : artists);
  }

  return Array.from(byDate.entries())
    .sort(([d1], [d2]) => (d1 < d2 ? -1 : 1))
    .map(([date, artists]) => ({ date, artists }));
}

// 두 레코드를 하나로 병합한 필드 값을 반환합니다 (id 제외).
// 페스티벌 라인업 추가 공지처럼 기존 공연에 새 정보가 들어오면 누적됩니다.
export function mergeConcerts(existing: ConcertRecord, incoming: ConcertRecord): Omit<ConcertRecord, "id"> {
  const rangeA = getDateRange(existing);
  const rangeB = getDateRange(incoming);

  const start = [rangeA.start, rangeB.start].filter(Boolean).sort()[0] || "";
  const end = [rangeA.end, rangeB.end].filter(Boolean).sort().reverse()[0] || "";

  const dayLineups = mergeDayLineups(existing.dayLineups, incoming.dayLineups);

  // 전체 라인업 = 양쪽 artistNames + 날짜별 라인업의 합집합
  let artistNames = mergeArtistNames(existing.artistNames, incoming.artistNames);
  for (const day of dayLineups) {
    artistNames = mergeArtistNames(artistNames, day.artists);
  }

  const priceA = (existing.price || "").trim();
  const priceB = (incoming.price || "").trim();

  // 포스터 선택: 새로 들어온 정보의 라인업이 더 풍부하면(가격 포스터 → 라인업 포스터 공개 등)
  // 새 포스터로 교체합니다. 그 외에는 기존 포스터 유지.
  const lineupScore = (r: ConcertRecord) =>
    (r.dayLineups?.length || 0) * 3 + splitArtists(r.artistNames).length;
  const posterUrl =
    incoming.posterUrl && lineupScore(incoming) > lineupScore(existing)
      ? incoming.posterUrl
      : pickNonEmpty(existing.posterUrl, incoming.posterUrl);

  return {
    title: preferKoreanText(existing.title, incoming.title),
    date: start,
    endDate: end && end !== start ? end : "",
    time: pickNonEmpty(existing.time, incoming.time),
    // 여러 공연장에서 열리는 행사는 공연장을 합쳐 표기 (라이브클럽데이 등)
    venueName: mergeVenueNames(existing.venueName, incoming.venueName),
    artistNames,
    sourceUrl: pickNonEmpty(existing.sourceUrl, incoming.sourceUrl),
    instagramUrl: pickNonEmpty(incoming.instagramUrl, existing.instagramUrl),
    price: priceB.length > priceA.length ? priceB : priceA,
    posterUrl,
    timetableImageUrl: pickNonEmpty(existing.timetableImageUrl, incoming.timetableImageUrl),
    ticketOpenAt: pickNonEmpty(existing.ticketOpenAt, incoming.ticketOpenAt),
    dayLineups,
  };
}
