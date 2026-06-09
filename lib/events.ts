// 공연 이벤트 도메인 유틸리티 — 서버 컴포넌트와 클라이언트 컴포넌트 양쪽에서 사용됩니다.
// 순수 함수만 포함하므로 "use client" 지시문이 없습니다.

export type EventItem = {
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

  const eventEnd = new Date(`${date}T23:59:59`).getTime();
  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);

  return eventEnd > endOfToday.getTime();
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

export function deduplicateEvents(events: EventItem[]): EventItem[] {
  const merged = new Map<string, EventItem>();

  const getScore = (e: EventItem) => {
    let score = 0;
    if (e.title) score += 2;
    if (e.venueName) score += 1;
    if (e.artistNames) score += 1;
    if (e.price) score += 1;
    if (e.time) score += 1;
    if (/[가-힣]/.test(e.title || "")) score += 1; // 한글 제목 우선
    return score;
  };

  const getDedupeKey = (e: EventItem) => {
    const date = normalizeDate(e.date);
    const title = (e.title || "").toLowerCase().replace(/\s+/g, "");

    // 주요 페스티벌 묶기 (한/영 혼용 방지)
    const festKeywords = [
      ["펜타포트", "pentaport"],
      ["원유니버스", "oneuniverse"],
      ["dmz", "디엠지", "피스트레인", "peacetrain"],
      ["점프", "jumf", "전주얼티밋"],
      ["그랜드민트", "gmf", "grandmint"],
      ["뷰티풀민트", "bml", "beautifulmint"],
      ["부산국제록", "birs", "busanrock"],
      ["사운드베리", "soundberry"],
    ];

    for (const group of festKeywords) {
      if (group.some(k => title.includes(k))) {
        return `${date}-${group[0]}`; // 페스티벌은 날짜 + 키워드로 통합
      }
    }

    // 일반 공연은 날짜 + 띄어쓰기 제거 제목
    return `${date}-${title}`;
  };

  events.forEach(ev => {
    const key = getDedupeKey(ev);
    if (!merged.has(key)) {
      merged.set(key, { ...ev });
    } else {
      const existing = merged.get(key)!;
      if (getScore(ev) > getScore(existing)) {
        const best = { ...ev };
        if (!best.artistNames && existing.artistNames) best.artistNames = existing.artistNames;
        if (!best.price && existing.price) best.price = existing.price;
        if (!best.venueName && existing.venueName) best.venueName = existing.venueName;
        merged.set(key, best);
      } else {
        const patched = { ...existing };
        if (!patched.artistNames && ev.artistNames) patched.artistNames = ev.artistNames;
        if (!patched.price && ev.price) patched.price = ev.price;
        if (!patched.venueName && ev.venueName) patched.venueName = ev.venueName;
        merged.set(key, patched);
      }
    }
  });

  return Array.from(merged.values());
}

export function formatSchedule(event: EventItem) {
  const date = normalizeDate(event.date);
  if (!date) return "일정 미정";

  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return [toText(event.date), toText(event.time)].filter(Boolean).join(" · ") || "일정 미정";
  }

  const week = ["일", "월", "화", "수", "목", "금", "토"][parsed.getDay()];
  return `${parsed.getFullYear()}.${String(parsed.getMonth() + 1).padStart(2, "0")}.${String(parsed.getDate()).padStart(2, "0")} (${week})${event.time ? ` · ${event.time}` : ""}`;
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

function normalizeMoneyInText(text: string) {
  return text.replace(/\d[\d,\s]*원/g, (token) => formatMoneyToken(token));
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
  return {
    id,
    title: toText(raw.title),
    date: toText(raw.date),
    time: toText(raw.time),
    venueName: toText(raw.venueName),
    artistNames: toText(raw.artistNames),
    sourceUrl: toText(raw.sourceUrl),
    instagramUrl: toText(raw.instagramUrl),
    price: toText(raw.price),
    posterUrl: toText(raw.posterUrl),
  };
}

export function venueSearchCandidates(venueName: string) {
  const value = toText(venueName);
  return Array.from(
    new Set([value, `${value} 공연장`, `${value} 라이브클럽`, `${value} 서울`, `${value} 홍대`].filter(Boolean))
  );
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
