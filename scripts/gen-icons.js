// LP판(바이닐) 느낌의 앱 아이콘 PNG 생성 — sharp로 SVG를 래스터화합니다.
// 웜 화이트 카드 위에 검은 레코드 + 번트 오렌지 라벨 + 스핀들 홀.
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const ICON_DIR = path.join(__dirname, "..", "public", "icons");

// 그루브(홈) 링들 — 라벨 바깥부터 디스크 가장자리까지 촘촘히
function grooves() {
  let g = "";
  for (let r = 96; r <= 228; r += 6) {
    const op = r % 12 === 0 ? 0.10 : 0.045;
    g += `<circle cx="256" cy="256" r="${r}" fill="none" stroke="rgba(255,255,255,${op})" stroke-width="1.4"/>`;
  }
  return g;
}

const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <defs>
    <radialGradient id="disc" cx="42%" cy="38%" r="70%">
      <stop offset="0%" stop-color="#262626"/>
      <stop offset="55%" stop-color="#141414"/>
      <stop offset="100%" stop-color="#070707"/>
    </radialGradient>
    <radialGradient id="label" cx="38%" cy="35%" r="75%">
      <stop offset="0%" stop-color="#e8743f"/>
      <stop offset="70%" stop-color="#d95a2b"/>
      <stop offset="100%" stop-color="#ad4319"/>
    </radialGradient>
    <linearGradient id="sheen" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="rgba(255,255,255,0.16)"/>
      <stop offset="22%" stop-color="rgba(255,255,255,0)"/>
      <stop offset="60%" stop-color="rgba(255,255,255,0)"/>
      <stop offset="80%" stop-color="rgba(255,255,255,0.06)"/>
      <stop offset="100%" stop-color="rgba(255,255,255,0)"/>
    </linearGradient>
  </defs>

  <!-- 배경 카드 -->
  <rect width="512" height="512" rx="0" fill="#faf9f7"/>

  <!-- 레코드 디스크 -->
  <circle cx="256" cy="256" r="232" fill="url(#disc)"/>
  <circle cx="256" cy="256" r="232" fill="url(#sheen)"/>
  ${grooves()}

  <!-- 라벨 -->
  <circle cx="256" cy="256" r="88" fill="url(#label)"/>
  <circle cx="256" cy="256" r="88" fill="none" stroke="rgba(0,0,0,0.18)" stroke-width="1.5"/>

  <!-- 스핀들 홀 -->
  <circle cx="256" cy="256" r="13" fill="#faf9f7"/>
  <circle cx="256" cy="256" r="13" fill="none" stroke="rgba(0,0,0,0.25)" stroke-width="1"/>
</svg>
`;

async function main() {
  const buf = Buffer.from(svg);
  const targets = [
    { file: "icon-512.png", size: 512 },
    { file: "icon-192.png", size: 192 },
    { file: "apple-touch-icon.png", size: 180 },
  ];
  for (const t of targets) {
    await sharp(buf).resize(t.size, t.size).png().toFile(path.join(ICON_DIR, t.file));
    console.log("생성:", t.file, `${t.size}x${t.size}`);
  }
}

main().then(() => console.log("아이콘 생성 완료")).catch((e) => { console.error(e); process.exit(1); });
