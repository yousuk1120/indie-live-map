// 아티스트 이름 정규화 + 한/영 별칭 통합 — 순수 모듈(클라이언트/서버 공용).
//
// 문제: 같은 밴드가 라인업마다 한글/영문/띄어쓰기 제각각으로 들어옵니다.
//   "BYE BYE BADMAN" · "바이 바이 배드맨" · "바이바이 배드맨" …
// 단순 정규화(공백·기호 제거)만으로는 한글 "바이바이배드맨"과 영문 "byebyebadman"이
// 서로 다른 키가 되어, 찜/필터/새 공연 푸시 매칭이 표기별로 갈라집니다.
//
// 그래서 잘 알려진 1:1 한↔영 동의어만 canonical(대개 한글)로 모아, 표기가 달라도
// 같은 아티스트로 매칭되게 합니다. 표는 보수적으로 — 확실한 동일 밴드만 넣습니다.
// (artist-prefs·push-new-event 양쪽이 이 함수를 공유해야 매칭이 일치합니다.)

// 기본 정규화: 소문자 + 공백/문장부호 제거. (기존 동작과 동일 — 목록에 없는 이름은 그대로)
function baseKey(name: string): string {
  return name.toLowerCase().replace(/[\s\-_.,!?'"()\[\]]/g, "");
}

// 동의어 그룹 — 각 그룹의 표기들은 모두 같은 아티스트. canonical = 그룹의 첫 항목.
// 새 별칭이 필요하면 여기에 그룹만 추가하면 됩니다.
const ALIAS_GROUPS: string[][] = [
  ["바이 바이 배드맨", "바이바이 배드맨", "Bye Bye Badman"],
  ["아디오스오디오", "아디오스 오디오", "Adios Audio", "Adios,Audio"],
  ["실리카겔", "Silica Gel"],
  ["국카스텐", "Guckkasten"],
  ["크라잉넛", "Crying Nut"],
  ["노브레인", "No Brain"],
  ["갤럭시 익스프레스", "Galaxy Express"],
  ["쏜애플", "Thornapple", "Thorn Apple"],
  ["크랙샷", "Crackshot", "Crack Shot"],
  ["터치드", "Touched"],
  ["페퍼톤스", "Peppertones"],
  ["장기하", "Jang Kiha"],
  ["새소년", "Se So Neon", "SeSoNeon"],
  ["잔나비", "Jannabi"],
  ["아디오스오디오", "AdiosAudio"],
];

// 정규화 키(baseKey) → canonical 정규화 키
const ALIAS_LOOKUP: Map<string, string> = (() => {
  const map = new Map<string, string>();
  for (const group of ALIAS_GROUPS) {
    const canonical = baseKey(group[0]);
    for (const alias of group) map.set(baseKey(alias), canonical);
  }
  return map;
})();

// 매칭용 최종 키 — 정규화 후 별칭을 canonical로 접습니다.
export function normalizeArtistKey(name: string): string {
  const key = baseKey(name);
  return ALIAS_LOOKUP.get(key) || key;
}
