// 공연장 이름 정규화 — 같은 공연장의 한/영/축약 표기를 대표 명칭 하나로 통일합니다.
// 수집 파이프라인(저장 시)과 지도/중복판정(표시 시) 양쪽에서 사용됩니다.

function normalizeKey(value: string): string {
  return value.toLowerCase().replace(/[\s\-_.,!?'"()\[\]]/g, "").replace(/[^\w가-힣]/g, "");
}

// 대표 명칭(첫 번째) ← 별칭들. 카카오맵/인스타에서 가장 통용되는 표기를 대표로 둡니다.
// 새 공연장 별칭이 발견되면 이 목록에 추가하면 수집/표시 전체에 반영됩니다.
const VENUE_ALIAS_GROUPS: string[][] = [
  ["롤링홀", "rolling hall", "rollinghall", "클럽 롤링홀"],
  ["클럽 FF", "club ff", "clubff", "에프에프"],
  ["수퍼노바", "super nova", "supernova", "슈퍼노바", "클럽 수퍼노바"],
  ["채널1969", "channel 1969", "channel1969", "채널 1969"],
  ["언플러그드", "unplugged", "카페 언플러그드", "언플러그드 홍대"],
  ["제비다방", "jebidabang", "cafe 제비다방"],
  ["프리즘홀", "prism hall", "prismhall", "프리즘 홀"],
  ["웨스트브릿지", "west bridge", "westbridge", "웨스트브릿지 라이브홀"],
  ["벨로주", "veloso", "벨로주 홍대"],
  ["생기스튜디오", "생기 스튜디오", "saengki studio"],
  ["스트레인지프룻", "strange fruit", "스트레인지 프룻"],
  ["클럽 빵", "club 빵", "빵", "클럽빵"],
  ["고고스2", "gogos2", "고고스 2", "클럽 고고스2"],
  ["살롱 노마드", "salon nomad", "살롱노마드"],
  ["네스트나다", "nest nada", "nestnada"],
  ["무대륙", "mudaeruk"],
  ["온스테이지", "onstage"],
  ["KT&G 상상마당", "상상마당", "상상마당 라이브홀", "ktg상상마당"],
  ["펜타포트", "pentaport", "펜타포트 락 페스티벌"],
  ["송도달빛축제공원", "songdo moonlight festival park", "songdo moonlight festival park incheon", "달빛축제공원"],
  ["난지한강공원", "nanji hangang park", "난지 한강공원"],
  ["올림픽공원", "olympic park", "올림픽 공원"],
];

const ALIAS_LOOKUP: Map<string, string> = (() => {
  const map = new Map<string, string>();
  for (const group of VENUE_ALIAS_GROUPS) {
    const canonical = group[0];
    for (const alias of group) {
      map.set(normalizeKey(alias), canonical);
    }
  }
  return map;
})();

// 장소명으로 쓸 수 없는 쓰레기 값 (AI가 위치 묘사를 장소로 오인한 경우)
const GARBAGE_VENUE_PATTERN =
  /^(지하|지상|반지하|b1|b2|1층|2층|3층|지하\s*1층|지하\s*2층|루프탑|rooftop|옥상|야외|실내|홀|공연장|라이브홀|클럽|소극장|미정|추후\s*공지|추후공지|tba|tbd|online|온라인|장소|venue|입구|주차장)$/i;

// 장소명이 유효하지 않으면 true (단독 층수/위치 표현, 너무 짧거나 긴 값)
export function isGarbageVenue(raw?: string): boolean {
  const value = (raw || "").trim();
  if (!value) return true;
  if (value.length < 2 || value.length > 60) return true;
  if (GARBAGE_VENUE_PATTERN.test(value)) return true;
  // 숫자/기호로만 구성된 값
  if (/^[\d\s\-~.,/층호]+$/.test(value)) return true;
  return false;
}

// 장소명 정규화: 쓰레기 값이면 "" 반환, 별칭이면 대표 명칭으로 통일
export function canonicalVenueName(raw?: string): string {
  const value = (raw || "").trim().replace(/\s{2,}/g, " ");
  if (isGarbageVenue(value)) return "";

  const key = normalizeKey(value);
  const exact = ALIAS_LOOKUP.get(key);
  if (exact) return exact;

  // 접두 매칭: "언플러그드 홍대 지하공연장"처럼 별칭 뒤에 수식어가 붙은 변형 처리
  for (const [aliasKey, canonical] of ALIAS_LOOKUP) {
    if (aliasKey.length >= 4 && key.startsWith(aliasKey)) return canonical;
  }

  return value;
}

// 중복 판정/그룹핑용 키 — 별칭이 같은 공연장이면 같은 키를 반환
export function venueGroupKey(raw?: string): string {
  const canonical = canonicalVenueName(raw);
  return canonical ? normalizeKey(canonical) : "";
}
