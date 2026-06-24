// 공연 정보 추출용 AI 프롬프트 — cron 파이프라인과 /api/parse-event 가 공유합니다.
// 프롬프트를 한곳에서 관리해 수동 수집과 자동 수집의 추출 품질이 갈라지지 않게 합니다.

export type ParsedEventInfo = {
  chosenIndex: number;
  title: string;
  date: string;
  endDate: string;
  time: string;
  venueName: string;
  artistNames: string;
  ticketUrl: string;
  price: string;
  ticketOpenAt: string; // 티켓 예매 오픈 일시 "YYYY-MM-DD HH:mm"
  dayLineups: Array<{ date: string; artists: string }>;
};

export const EMPTY_PARSED_EVENT: ParsedEventInfo = {
  chosenIndex: -1,
  title: "",
  date: "",
  endDate: "",
  time: "",
  venueName: "",
  artistNames: "",
  ticketUrl: "",
  price: "",
  ticketOpenAt: "",
  dayLineups: [],
};

// AI 응답을 안전한 형태로 정규화 (누락 필드 보정, 타입 검증)
export function sanitizeParsedEvent(raw: unknown): ParsedEventInfo {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

  const dayLineups = Array.isArray(r.dayLineups)
    ? r.dayLineups
        .map((d) => {
          const day = (d && typeof d === "object" ? d : {}) as Record<string, unknown>;
          return { date: str(day.date), artists: str(day.artists) };
        })
        .filter((d) => d.date && d.artists)
    : [];

  return {
    chosenIndex: typeof r.chosenIndex === "number" ? r.chosenIndex : -1,
    title: str(r.title),
    date: str(r.date),
    endDate: str(r.endDate),
    time: str(r.time),
    venueName: str(r.venueName),
    artistNames: str(r.artistNames),
    ticketUrl: str(r.ticketUrl),
    price: str(r.price),
    ticketOpenAt: str(r.ticketOpenAt),
    dayLineups,
  };
}

export function buildEventExtractionPrompt(postsText: string, accountName?: string): string {
  return `
당신은 한국 인디씬의 공연·페스티벌 게시물을 분석하는 정보 추출 AI입니다. (@${accountName || "알수없음"} 계정의 게시물)

★ [매우 중요한 연도 및 날짜 규칙] ★
1. 현재 기준 연도는 무조건 "2026년" 입니다.
2. 본문에 연도가 생략되어 있고 월/일만 있다면 무조건 2026년으로 간주하세요. (예: 4월 4일 -> 2026-04-04)
3. 현재 날짜(2026년)를 기준으로 이미 지나간 과거의 공연 정보는 절대 추출하지 말고 무시하세요.

아래 게시물 목록 중 **"앞으로 개최될 단일 오프라인 공연 또는 페스티벌을 홍보하는 게시물"**을 단 하나만 골라 정보를 추출하세요.

[엄격한 제외 조건 — 해당하면 절대 고르지 마세요]
- 지난 공연의 후기/리캡/감사 인사
- 굿즈·음원·뮤직비디오 발매, 멤버 일상 글
- 공연장의 월간/주간 "편성표"처럼 서로 다른 여러 공연을 나열만 한 게시물 (단, 하나의 페스티벌 라인업 공개는 추출 대상입니다!)
- "매주 일요일", "Every Sunday" 등 특정 날짜가 없는 정기 반복 이벤트
- 온라인 스트리밍 공연
- ★ 해외(대한민국이 아닌 국가)에서 열리는 공연·페스티벌 — 일본/미국/유럽/대만/태국 등 해외 개최가 명확하면 절대 고르지 마세요. (도쿄, 오사카, Tokyo, Japan, US tour, World tour 등). 국내 개최가 확실한 것만 수집합니다.
- 모든 게시물이 위에 해당하면 chosenIndex를 -1로 두고 나머지 필드는 비우세요.

[아티스트가 '페스티벌·합동공연 출연'을 알리는 게시물 규칙 — 매우 중요]
- 특정 아티스트(@${accountName || "계정"})가 어떤 페스티벌/합동공연/기획공연에 "출연한다"고 알리는 게시물이면,
  그 행사를 그 아티스트의 단독공연으로 만들지 마세요.
- 이 경우 title은 반드시 그 페스티벌/행사명으로, venueName은 그 행사의 장소로 적으세요.
- artistNames에는 본문에 언급된 출연진만 넣으세요(그 아티스트 한 팀만 언급됐으면 그 한 팀만 — 나중에 전체 라인업과 자동 병합됩니다).
- 즉, "○○가 △△페스티벌에 나갑니다" → title:"△△페스티벌", artistNames:"○○" 처럼, 행사 정체성은 페스티벌로 유지하세요.

[제목(title) 추출 규칙 — 가장 중요!]
- 본문에 명시된 공연명/페스티벌명을 반드시 찾아서 그대로 사용하세요. (예: "2026 JUMF 1차 라인업 공개 일정: 8월 14~16일" → title: "2026 JUMF")
- "1차 라인업 공개", "티켓 오픈", "공지" 같은 수식어는 제목에서 빼고 행사명만 남기세요.
- 같은 행사가 한국어와 영어로 같이 적혀 있으면 한국어 표기를 우선하세요.
- 명시적 공연명이 없지만 단독/기획 공연이 확실하면 "메인 아티스트명 + 단독공연" 형태로 만드세요.
- 제목과 날짜 중 하나라도 확정할 수 없으면 정보가 부족한 것이므로 chosenIndex를 -1로 두세요.

[멀티데이 페스티벌 규칙]
- "8월 14일~16일"처럼 여러 날 진행되면 date에 시작일, endDate에 종료일을 넣으세요.
- 하루짜리 공연이면 endDate는 "" 입니다.
- 본문에 날짜별 라인업이 구분되어 있으면 dayLineups에 날짜별로 넣으세요. 구분이 없으면 빈 배열 [].
- 같은 아티스트를 여러 날에 중복해서 넣지 마세요. 각 아티스트는 실제 출연하는 그 날짜에만.

[포스터/게시물 선택 규칙]
- 같은 공연에 대한 게시물이 여러 개면, **가격표·예매 안내만 있는 이미지보다 메인 포스터나 라인업이 담긴 게시물**을 chosenIndex로 고르세요.

[아티스트(artistNames) 규칙]
- 반드시 **실제 출연 팀 이름**을 쉼표로 나열하세요.
- "70 ARTISTS", "라인업 곧 공개", "20여 팀" 같은 **팀 수·설명 문구는 artistNames에 넣지 마세요**(이런 경우 artistNames는 본문에 적힌 실제 팀명만, 없으면 "").

[게시물 목록]
${postsText}

[출력 JSON 구조 — 반드시 이 형태의 JSON 객체 하나로만 응답]
{
  "chosenIndex": 선택한 게시물 인덱스 (숫자, 없으면 -1),
  "title": "공연/페스티벌 제목 (한국어 우선)",
  "date": "시작 날짜 YYYY-MM-DD (없으면 \\"\\")",
  "endDate": "종료 날짜 YYYY-MM-DD (하루짜리면 \\"\\")",
  "time": "시작 시간 HH:mm 24시간제 (없으면 \\"\\")",
  "venueName": "공연장 이름 (없으면 \\"\\")",
  "artistNames": "전체 라인업, 쉼표로만 구분 (없으면 \\"\\")",
  "ticketUrl": "예매 URL 또는 예매처 안내 (없으면 \\"\\")",
  "price": "티켓 가격 (예: \\"예매 30,000원, 현매 35,000원\\", 없으면 \\"\\")",
  "ticketOpenAt": "티켓 예매 오픈 일시 \\"YYYY-MM-DD HH:mm\\" (본문에 '티켓 오픈' 일시가 명시된 경우만, 없으면 \\"\\")",
  "dayLineups": [{ "date": "YYYY-MM-DD", "artists": "그날 라인업, 쉼표 구분" }]
}

[예시 1] 캡션: "2026 JUMF 1차 라인업 공개! 8월 14일(금) 실리카겔, 새소년 / 8월 15일(토) 잔나비 / 일정: 2026.8.14~16 전주종합경기장"
→ { "chosenIndex": 0, "title": "2026 JUMF", "date": "2026-08-14", "endDate": "2026-08-16", "time": "", "venueName": "전주종합경기장", "artistNames": "실리카겔, 새소년, 잔나비", "ticketUrl": "", "price": "", "dayLineups": [{ "date": "2026-08-14", "artists": "실리카겔, 새소년" }, { "date": "2026-08-15", "artists": "잔나비" }] }

[예시 2] 캡션: "5월 편성표가 나왔습니다. 5/2 밴드A 단독, 5/9 밴드B와 친구들, 5/16 어쿠스틱 나잇..."
→ 여러 공연 나열 편성표이므로 { "chosenIndex": -1, ... }
`;
}
