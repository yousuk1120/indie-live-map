// 공식 계정 전용 페스티벌 가드 + 프리퀄(사전공연) 판별 — 순수 함수.
// cron 수집 파이프라인에서 두 가지 오수집을 막습니다:
//
//  1) [공식 전용 페스티벌] 특정 페스티벌(예: 블록파티)은 "공식 계정" 게시물에서만
//     수집/갱신합니다. 밴드·공연장·기획사 계정이 "○○ 나가요/○○과 함께"라며 올린 글은
//     같은 제목이어도 수집하지 않습니다. (서브라이엇·밴드 계정이 블록파티 중복 이벤트를
//     만들던 문제 방지)
//
//  2) [프리퀄/사전공연] "부스트업/프리쇼/프리퀄/워밍업"처럼 본 행사와 별개로 미리 열리는
//     사전 공연 게시물이, 캡션에 같이 적힌 "본 행사(메인 페스티벌)의 날짜·장소"를 빌려와
//     가짜 이벤트로 둔갑하는 것을 막습니다. (사운드플래닛 "BOOST UP in 보령"이
//     본 페스티벌 날짜 9/5~6·파라다이스시티를 훔쳐가던 문제 방지)

import { normalizeConcertTitle } from "./event-merge";

export function normalizeHandle(value?: string): string {
  return String(value || "").trim().toLowerCase().replace(/^@/, "");
}

export type OfficialFestivalGuard = {
  official: string; // 공식 인스타 핸들 (소문자, @ 제외)
  keywords: string[]; // 제목 매칭 키워드 (normalizeConcertTitle 기준 부분일치)
  label: string;
};

// 공식 계정에서만 수집/갱신할 페스티벌 목록.
// 여기 넣으면: 다른 계정(밴드/공연장/기획사)이 같은 제목으로 올린 글은 수집하지 않습니다.
//
// ⚠️ 트레이드오프: 이 목록의 페스티벌은 "공식 계정 글"만 신뢰합니다. 즉 밴드가
//    "○○페스티벌 나가요"라고 올린 글로는 라인업이 더 이상 누적되지 않습니다.
//    (공식 계정이 전체 라인업을 직접 올리므로 대개 문제 없음. 밴드 공지 병합을
//     다시 원하면 해당 항목을 목록에서 빼세요.)
//
// official 핸들은 source_accounts의 accountName과 정확히 일치해야 합니다(소문자, @ 제외).
export const OFFICIAL_ONLY_FESTIVALS: OfficialFestivalGuard[] = [
  { official: "blockpartykorea", keywords: ["blockparty", "블록파티", "블럭파티"], label: "블록파티" },
  { official: "soundplanetfestival", keywords: ["사운드플래닛", "사운드플래넷", "soundplanet"], label: "사운드 플래닛 페스티벌" },
  { official: "oneuniversefestival", keywords: ["원유니버스", "oneuniverse"], label: "원유니버스 페스티벌" },
  { official: "pentaportrf", keywords: ["펜타포트", "pentaport"], label: "인천펜타포트 락 페스티벌" },
  { official: "dmzpeacetrain", keywords: ["피스트레인", "peacetrain"], label: "DMZ 피스트레인" },
  // "파크뮤직/parkmusicfestival"는 해외 "Kaohsiung Park Music Festival" 등과 오매칭되므로
  // 국내 공식 명칭에 특정된 키워드만 사용합니다.
  { official: "parkmusicfestival_", keywords: ["서울파크뮤직", "seoulparkmusic"], label: "서울파크뮤직페스티벌" },
  { official: "jarasumjazzfestival", keywords: ["자라섬", "jarasum"], label: "자라섬 재즈 페스티벌" },
  { official: "seouljazzfestival", keywords: ["서울재즈페스티벌", "seouljazzfestival"], label: "서울재즈페스티벌" },
  { official: "seoulspringfestival_official", keywords: ["서울스프링", "seoulspring"], label: "서울스프링페스티벌" },
  { official: "grandmintfestival", keywords: ["그랜드민트", "grandmint"], label: "그랜드민트페스티벌" },
  { official: "zandarifesta", keywords: ["잔다리", "zandari"], label: "잔다리페스타" },
  { official: "inmufe.official", keywords: ["인무페", "inmufe"], label: "인천뮤직페스티벌" },
];

// 제목이 공식 전용 페스티벌과 일치하면 그 가드를 반환, 아니면 null.
export function matchOfficialOnlyFestival(title?: string): OfficialFestivalGuard | null {
  const t = normalizeConcertTitle(title || "");
  if (!t) return null;
  for (const guard of OFFICIAL_ONLY_FESTIVALS) {
    if (guard.keywords.some((k) => t.includes(normalizeConcertTitle(k)))) return guard;
  }
  return null;
}

// 이 게시물이 "공식 전용 페스티벌" 글이지만 공식 계정이 아닌 출처인가?
// true면 수집하지 않아야 합니다.
export function isNonOfficialFestivalPost(title: string | undefined, accountName: string | undefined): boolean {
  const guard = matchOfficialOnlyFestival(title);
  if (!guard) return false;
  return normalizeHandle(accountName) !== guard.official;
}

// "프리퀄/프리쇼/부스트업/사전공연/워밍업" 등 본 행사와 별개의 사전 공연 판별.
// (오탐을 줄이려 'boost'/'부스트' 단독은 넣지 않고 명확한 표현만 사용)
const PREQUEL_MARKERS = [
  "boostup",
  "prequel",
  "preshow",
  "warmup",
  "부스트업",
  "프리퀄",
  "프리쇼",
  "프리파티",
  "사전공연",
  "워밍업",
];

export function isPrequelTitle(title?: string): boolean {
  const t = normalizeConcertTitle(title || "");
  if (!t) return false;
  return PREQUEL_MARKERS.some((m) => t.includes(normalizeConcertTitle(m)));
}
