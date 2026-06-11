// 공연 이벤트 도메인 유틸리티 — 서버 컴포넌트와 클라이언트 컴포넌트 양쪽에서 사용됩니다.
// 순수 함수만 포함하므로 "use client" 지시문이 없습니다.

import { isSameConcert, mergeConcerts, extractDateRange } from "./event-merge";
import { canonicalVenueName } from "./venues";

export type DayLineup = { date: string; artists: string };

export type EventItem = {
  id: string;
  title?: string;
  date?: string;
  endDate?: string; // 멀티데이(페스티벌) 종료일. 하루짜리는 빈 문자열
  time?: string;
  venueName?: string;
  artistNames?: string;
  sourceUrl?: string;
  instagramUrl?: string;
  price?: string;
  posterUrl?: string;
  timetableImageUrl?: string; // 주최측 타임테이블 이미지 (페스티벌)
  ticketOpenAt?: string; // 티켓 예매 오픈 일시 "YYYY-MM-DD HH:mm"
  dayLineups?: DayLineup[]; // 날짜별 라인업 (페스티벌)
};

export function toText(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(toText).filter(Boolean).join(", ");
  if (typeof value === "object") {
    return Object.values(value as Record<string, unknown>).map(toText).filter(Boolean).join(", ");
  }
  return "";
}

export function normalizeDate(value?: string) {
  const raw = toText(value);
  if (!raw) return "";

  const match = raw.match(/(\d{2,4})[./-](\d{1,2})[./-](\d{1,2})/);
  if (!match) return "";

  const [, y, m, d] = match;
  const year = y.length === 2 ? `20${y}` : y;
  return `${year}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

export function parseTime24(raw: string): string {
  const t = raw.trim();
  // "19:00" 형태
  const hm = t.match(/^(\d{1,2}):(\d{2})$/);
  if (hm) return `${hm[1].padStart(2, "0")}:${hm[2]}`;
  // "오후 7시", "PM 7" 등 처리
  const korean = t.match(/(오후|오전|PM|AM)\s*(\d{1,2})/i);
  if (korean) {
    let h = Number(korean[2]);
    if (/오후|PM/i.test(korean[1]) && h < 12) h += 12;
    if (/오전|AM/i.test(korean[1]) && h === 12) h = 0;
    return `${String(h).padStart(2, "0")}:00`;
  }
  return "";
}

export function eventTimestamp(event: EventItem) {
  const date = normalizeDate(event.date);
  if (!date) return Number.POSITIVE_INFINITY;
  const time = parseTime24(toText(event.time)) || "23:59";
  const parsed = new Date(`${date}T${time}`);
  return Number.isNaN(parsed.getTime()) ? Number.POSITIVE_INFINITY : parsed.getTime();
}

export function isFutureEvent(event: EventItem) {
  const date = normalizeDate(event.date);
  if (!date) return false;

  // 멀티데이 공연은 종료일 기준으로 판정 (진행 중인 페스티벌도 노출)
  const endDate = normalizeDate(event.endDate) || date;
  const eventEnd = new Date(`${endDate}T23:59:59`).getTime();
  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);

  return eventEnd > endOfToday.getTime();
}

// 공연이 진행되는 모든 날짜 키(YYYY-MM-DD) 목록. 달력 표시용. (최대 21일로 제한)
export function getEventDates(event: EventItem): string[] {
  const start = normalizeDate(event.date);
  if (!start) return [];

  const end = normalizeDate(event.endDate);
  if (!end || end <= start) return [start];

  const dates: string[] = [];
  const cursor = new Date(`${start}T00:00:00`);
  const endTime = new Date(`${end}T00:00:00`).getTime();
  if (Number.isNaN(cursor.getTime()) || Number.isNaN(endTime)) return [start];

  while (cursor.getTime() <= endTime && dates.length < 21) {
    dates.push(
      `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}-${String(cursor.getDate()).padStart(2, "0")}`
    );
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
}

// 특정 날짜의 라인업 (날짜별 라인업이 있는 페스티벌용). 없으면 빈 문자열.
export function getLineupForDate(event: EventItem, dateKey: string): string {
  if (!event.dayLineups?.length || !dateKey) return "";
  const found = event.dayLineups.find((d) => normalizeDate(d.date) === dateKey);
  return found?.artists || "";
}

export function isKoreanEvent(event: EventItem) {
  const text = [
    event.title,
    event.venueName,
    event.artistNames,
    event.sourceUrl,
    event.instagramUrl,
  ]
    .map(toText)
    .join(" ");

  // 해외 공연 키워드 (일본 + 글로벌)
  const foreignPattern =
    /도쿄|오사카|교토|시부야|신주쿠|시모키타|나고야|후쿠오카|삿포로|Tokyo|Osaka|Kyoto|Shibuya|Shinjuku|Shimokitazawa|Nagoya|Fukuoka|Sapporo|Japan|日本|東京|大阪|京都|渋谷|新宿|下北沢|名古屋|福岡|札幌|Taiwan|Taipei|Bangkok|Shanghai|Beijing|Hong Kong|Singapore|New York|London|Berlin|Paris|LA|Los Angeles|Brooklyn|Chicago|Toronto|Sydney|Melbourne|Manila|Jakarta|Vietnam|Hanoi|Ho Chi Minh|Thailand|China|Philippines|Indonesia|Malaysia|USA|UK|Europe|Cotoba|COTOBA/i;

  return !foreignPattern.test(text);
}

export function isFestivalEvent(event: EventItem) {
  const title = toText(event.title).toLowerCase();
  if (/페스티벌|festival|페스타|festa|펜타포트|pentaport|캠프|camp|dmz|디엠지/i.test(title)) {
    return true;
  }

  const artistsStr = toText(event.artistNames);
  const priceStr = toText(event.price);
  if (artistsStr && priceStr) {
    const artistsCount = artistsStr.split(/[,/|·&]+/).map(a => a.trim()).filter(a => a.length > 0).length;

    const numbers = priceStr.match(/\d{1,3}(,\d{3})+|\d{4,}/g);
    let maxPrice = 0;
    if (numbers) {
      maxPrice = Math.max(...numbers.map(m => parseInt(m.replace(/,/g, ""), 10)));
    }

    if (artistsCount >= 10 && maxPrice >= 70000) {
      return true;
    }
  }

  return false;
}

// 뷰어 표시용 중복 제거 — 같은 공연(한/영 표기, 제목 상이, 라인업 겹침 포함)을
// 하나로 병합합니다. 병합 시 한국어 표기가 우선됩니다. (lib/event-merge 공용 로직 사용)
export function deduplicateEvents(events: EventItem[]): EventItem[] {
  const result: EventItem[] = [];

  for (const ev of events) {
    const idx = result.findIndex((existing) => isSameConcert(existing, ev));
    if (idx === -1) {
      result.push({ ...ev });
    } else {
      const existing = result[idx];
      result[idx] = { ...existing, ...mergeConcerts(existing, ev), id: existing.id };
    }
  }

  return result;
}

const WEEKDAYS_KO = ["일", "월", "화", "수", "목", "금", "토"];

function formatDateLabel(dateKey: string, withYear: boolean) {
  const parsed = new Date(`${dateKey}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return "";
  const week = WEEKDAYS_KO[parsed.getDay()];
  const base = `${String(parsed.getMonth() + 1).padStart(2, "0")}.${String(parsed.getDate()).padStart(2, "0")} (${week})`;
  return withYear ? `${parsed.getFullYear()}.${base}` : base;
}

export function formatSchedule(event: EventItem) {
  const date = normalizeDate(event.date);
  if (!date) return "일정 미정";

  const startLabel = formatDateLabel(date, true);
  if (!startLabel) {
    return [toText(event.date), toText(event.time)].filter(Boolean).join(" · ") || "일정 미정";
  }

  // 멀티데이: "2026.08.14 (금) ~ 08.16 (일)" 형태로 범위 표시
  const endDate = normalizeDate(event.endDate);
  if (endDate && endDate > date) {
    const sameYear = endDate.slice(0, 4) === date.slice(0, 4);
    const endLabel = formatDateLabel(endDate, !sameYear);
    if (endLabel) return `${startLabel} ~ ${endLabel}`;
  }

  return `${startLabel}${event.time ? ` · ${event.time}` : ""}`;
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

export function getInstagramLink(event: EventItem) {
  return extractInstagramUrl(event) || buildInstagramFallback(event);
}

function formatMoneyToken(token: string) {
  const digits = token.replace(/[^\d]/g, "");
  if (!digits) return token.trim();
  return `${Number(digits).toLocaleString("ko-KR")}원`;
}

// 금액 표기 통일: "1만원", "3만 5천원", "10,000 KRW", "₩10000" → 전부 "10,000원" 형식
function normalizeMoneyInText(text: string) {
  let result = text;

  // "1만원", "1.5만원", "3만 5천원"
  result = result.replace(/(\d+(?:\.\d+)?)\s*만\s*(?:(\d)\s*천)?\s*원/g, (_, man, cheon) => {
    const amount = Math.round(parseFloat(man) * 10000) + (cheon ? Number(cheon) * 1000 : 0);
    return `${amount.toLocaleString("ko-KR")}원`;
  });

  // "5천원"
  result = result.replace(/(\d)\s*천\s*원/g, (_, cheon) =>
    `${(Number(cheon) * 1000).toLocaleString("ko-KR")}원`
  );

  // "KRW 10,000", "₩10,000", "10,000 KRW", "10000krw"
  result = result.replace(/(?:KRW|₩)\s*([\d,]+)/gi, (_, num) => formatMoneyToken(num));
  result = result.replace(/([\d,]+)\s*KRW/gi, (_, num) => formatMoneyToken(num));

  // "10000원" → "10,000원" (쉼표 보정)
  result = result.replace(/\d[\d,\s]*원/g, (token) => formatMoneyToken(token));

  return result;
}

export function formatPriceLines(value?: string) {
  const raw = toText(value);
  if (!raw) return [] as string[];

  const normalized = raw
    .replace(/\r?\n/g, "\n")
    .replace(/\s*\/\s*/g, "\n")
    .replace(/\s*\|\s*/g, "\n")
    .replace(/\s*·\s*/g, "\n")
    .replace(/\s{2,}/g, " ")
    .trim();

  const parts = normalized
    .split("\n")
    .map((part) => normalizeMoneyInText(part.trim()))
    .filter(Boolean);

  return Array.from(
    new Set(
      parts.map((part) => {
        if (/free entry|무료/i.test(part)) return part;

        // 숫자만 있는 가격("10000") → "10,000원"
        if (/^[\d,]{4,}$/.test(part.trim())) return formatMoneyToken(part);

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

export function normalizeEvent(id: string, raw: Record<string, unknown>): EventItem {
  const dayLineups = Array.isArray(raw.dayLineups)
    ? (raw.dayLineups as unknown[])
        .map((d) => {
          const day = (d && typeof d === "object" ? d : {}) as Record<string, unknown>;
          return { date: toText(day.date), artists: toText(day.artists) };
        })
        .filter((d) => d.date && d.artists)
    : [];

  // 날짜 범위 복원: date에 "8.14~16" 같은 범위 문자열이 들어 있고 endDate가 비어 있으면 도출
  // (endDate 기능 이전에 수집된 기존 데이터도 표시 단계에서 멀티데이로 살아납니다)
  const rawDate = toText(raw.date);
  let endDate = toText(raw.endDate);
  if (!endDate) {
    const range = extractDateRange(rawDate);
    if (range.end) endDate = range.end;
  }

  // 장소명 정규화: 별칭 통일 + 쓰레기 값("지하" 등) 제거
  const rawVenue = toText(raw.venueName);
  const venueName = canonicalVenueName(rawVenue);

  return {
    id,
    title: toText(raw.title),
    date: rawDate,
    endDate,
    time: toText(raw.time),
    venueName,
    artistNames: toText(raw.artistNames),
    sourceUrl: toText(raw.sourceUrl),
    instagramUrl: toText(raw.instagramUrl),
    price: toText(raw.price),
    posterUrl: toText(raw.posterUrl),
    timetableImageUrl: toText(raw.timetableImageUrl),
    ticketOpenAt: toText(raw.ticketOpenAt),
    dayLineups,
  };
}

export function venueSearchCandidates(venueName: string) {
  const value = toText(venueName);
  return Array.from(
    new Set([value, `${value} 공연장`, `${value} 라이브클럽`, `${value} 서울`, `${value} 홍대`].filter(Boolean))
  );
}

// 뷰어 공통 파이프라인: 국내 공연 → 다가오는 공연 → 중복 병합 → 시간순 정렬
export function prepareUpcomingEvents(events: EventItem[]): EventItem[] {
  const valid = events.filter(isKoreanEvent).filter(isFutureEvent);
  return deduplicateEvents(valid).sort((a, b) => eventTimestamp(a) - eventTimestamp(b));
}

// 달력의 특정 날짜 공연 정렬:
//  1) 페스티벌/멀티데이가 일반 공연보다 무조건 위
//  2) 페스티벌끼리는 기간 긴 순 → 시작일 빠른 순 → 제목순 (항상 같은 순서로 고정)
//  3) 일반 공연은 시작 시간순
export function sortEventsForDay(events: EventItem[]): EventItem[] {
  const isBig = (e: EventItem) => isFestivalEvent(e) || getEventDates(e).length > 1;

  return [...events].sort((a, b) => {
    const bigA = isBig(a);
    const bigB = isBig(b);
    if (bigA !== bigB) return bigA ? -1 : 1;

    if (bigA && bigB) {
      const daysA = getEventDates(a).length;
      const daysB = getEventDates(b).length;
      if (daysA !== daysB) return daysB - daysA;

      const startA = normalizeDate(a.date);
      const startB = normalizeDate(b.date);
      if (startA !== startB) return startA < startB ? -1 : 1;

      return (a.title || "").localeCompare(b.title || "", "ko");
    }

    return eventTimestamp(a) - eventTimestamp(b);
  });
}

// ─── 남은 일수 계산 ───
export function getDaysUntil(event: EventItem): string {
  const date = normalizeDate(event.date);
  if (!date) return "";
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const eventDate = new Date(`${date}T00:00:00`);
  const diff = Math.ceil((eventDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (diff === 0) return "TODAY";
  if (diff === 1) return "D-1";
  if (diff <= 7) return `D-${diff}`;
  return "";
}
