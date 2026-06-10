// PWA 앱 아이콘 생성 스크립트 (의존성 없음 — node 내장 zlib로 PNG 인코딩)
// 사용법: node scripts/generate-icons.js
// 디자인: 딥 잉크 배경 + 바이올렛 이퀄라이저 바 (라이브 음악 모티프)

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

// ─── PNG 인코더 ───

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, "ascii");
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function encodePng(size, pixels) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  // 스캔라인마다 필터 바이트(0) 추가
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    pixels.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }

  return Buffer.concat([
    signature,
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ─── 아이콘 드로잉 ───

function hexToRgb(hex) {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}

function lerp(a, b, t) {
  return Math.round(a + (b - a) * t);
}

function drawIcon(size) {
  const px = Buffer.alloc(size * size * 4);
  const bgTop = hexToRgb("#12121f");
  const bgBottom = hexToRgb("#08080d");

  // 배경: 위→아래 미세한 그라데이션
  for (let y = 0; y < size; y++) {
    const t = y / size;
    const r = lerp(bgTop[0], bgBottom[0], t);
    const g = lerp(bgTop[1], bgBottom[1], t);
    const b = lerp(bgTop[2], bgBottom[2], t);
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      px[i] = r; px[i + 1] = g; px[i + 2] = b; px[i + 3] = 255;
    }
  }

  // 이퀄라이저 바 (maskable 안전 영역인 중앙 60% 안에 배치)
  const barTop = hexToRgb("#c4b5fd");
  const barBottom = hexToRgb("#7c3aed");
  const bars = [
    { cx: 0.30, h: 0.20 },
    { cx: 0.4334, h: 0.34 },
    { cx: 0.5667, h: 0.26 },
    { cx: 0.70, h: 0.15 },
  ];
  const barWidth = Math.round(size * 0.085);
  const baseline = Math.round(size * 0.67);

  for (const bar of bars) {
    const barHeight = Math.round(size * bar.h);
    const x0 = Math.round(size * bar.cx - barWidth / 2);
    const yTop = baseline - barHeight;
    const radius = Math.floor(barWidth / 2);

    for (let y = yTop; y < baseline; y++) {
      const t = (y - yTop) / barHeight;
      const r = lerp(barTop[0], barBottom[0], t);
      const g = lerp(barTop[1], barBottom[1], t);
      const b = lerp(barTop[2], barBottom[2], t);

      for (let x = x0; x < x0 + barWidth; x++) {
        // 바 양 끝 모서리를 둥글게
        const fromTop = y - yTop;
        const fromBottom = baseline - 1 - y;
        const edge = Math.min(fromTop, fromBottom);
        if (edge < radius) {
          const dx = Math.abs(x - (x0 + barWidth / 2 - 0.5));
          const maxDx = Math.sqrt(Math.max(0, radius * radius - (radius - edge) * (radius - edge))) + barWidth / 2 - radius;
          if (dx > maxDx) continue;
        }
        const i = (y * size + x) * 4;
        px[i] = r; px[i + 1] = g; px[i + 2] = b; px[i + 3] = 255;
      }
    }
  }

  return encodePng(size, px);
}

// ─── 출력 ───

const outDir = path.join(__dirname, "..", "public", "icons");
fs.mkdirSync(outDir, { recursive: true });

const targets = [
  { file: "icon-192.png", size: 192 },
  { file: "icon-512.png", size: 512 },
  { file: "apple-touch-icon.png", size: 180 },
];

for (const { file, size } of targets) {
  fs.writeFileSync(path.join(outDir, file), drawIcon(size));
  console.log(`생성: public/icons/${file} (${size}x${size})`);
}
