// 공연 중복 판정 + 병합 로직 — cron 파이프라인(서버), 관리자 페이지(클라이언트) 공용.
// 순수 함수만 포함합니다.
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
  return normalizeConcertTitle(value || "");
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

// ─── 같은 공연 판정 ───
//
// 날짜가 겹치는 두 레코드가 아래 중 하나를 만족하면 같은 공연으로 봅니다:
//  a) 제목이 유사하고 장소가 충돌하지 않음 (한쪽이 비어 있어도 허용)
//  b) 장소가 동일(비어 있지 않음)하고 라인업이 절반 이상 겹침
//  c) 라인업이 70% 이상 겹침 (양쪽 모두 2팀 이상) — 제목을 다르게 뽑아온 같은 공연 케이스
export function isSameConcert(a: ConcertRecord, b: ConcertRecord): boolean {
  if (!dateRangesOverlap(a, b)) return false;

  const venueA = normalizeVenueKey(a.venueName);
  const venueB = normalizeVenueKey(b.venueName);
  const venueEqual = !!venueA && venueA === venueB;
  const venueCompatible = !venueA || !venueB || venueA === venueB;

  if (areSimilarTitles(a.title || "", b.title || "") && venueCompatible) return true;

  const overlap = lineupOverlapRatio(a.artistNames, b.artistNames);
  if (venueEqual && overlap >= 0.5) return true;

  const countA = splitArtists(a.artistNames).length;
  const countB = splitArtists(b.artistNames).length;
  if (overlap >= 0.7 && countA >= 2 && countB >= 2 && venueCompatible) return true;

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

  return {
    title: preferKoreanText(existing.title, incoming.title),
    date: start,
    endDate: end && end !== start ? end : "",
    time: pickNonEmpty(existing.time, incoming.time),
    venueName: preferKoreanText(existing.venueName, incoming.venueName),
    artistNames,
    sourceUrl: pickNonEmpty(existing.sourceUrl, incoming.sourceUrl),
    instagramUrl: pickNonEmpty(incoming.instagramUrl, existing.instagramUrl),
    price: priceB.length > priceA.length ? priceB : priceA,
    posterUrl: pickNonEmpty(existing.posterUrl, incoming.posterUrl),
    dayLineups,
  };
}
