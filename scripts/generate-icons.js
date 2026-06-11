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

// LP판 디자인: 비닐 블랙 배경 + 그루브(동심원) + 번트 오렌지 라벨 + 스핀들 홀
function drawIcon(size) {
  const px = Buffer.alloc(size * size * 4);
  const bg = hexToRgb("#111111");
  const grooveDark = hexToRgb("#141414");
  const grooveLight = hexToRgb("#1f1f1f");
  const rim = hexToRgb("#2e2e2e");
  const labelOuter = hexToRgb("#e87c51");
  const labelInner = hexToRgb("#d95a2b");
  const hole = hexToRgb("#0c0c0c");

  const cx = size / 2;
  const cy = size / 2;
  // maskable 안전 영역(중앙 80%) 안에 디스크 배치
  const discR = size * 0.4;
  const labelR = size * 0.135;
  const holeR = size * 0.032;
  const grooveStep = Math.max(2, Math.round(size * 0.018));

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - cx + 0.5;
      const dy = y - cy + 0.5;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const i = (y * size + x) * 4;

      let color = bg;

      if (dist <= discR) {
        if (dist <= holeR) {
          color = hole;
        } else if (dist <= labelR) {
          // 라벨: 중심에서 바깥으로 미세한 그라데이션
          const t = dist / labelR;
          color = [
            lerp(labelOuter[0], labelInner[0], t),
            lerp(labelOuter[1], labelInner[1], t),
            lerp(labelOuter[2], labelInner[2], t),
          ];
        } else if (dist >= discR - Math.max(1, size * 0.006)) {
          color = rim;
        } else {
          // 그루브: 동심원 줄무늬
          const band = Math.floor(dist / grooveStep) % 2;
          color = band === 0 ? grooveDark : grooveLight;
        }
      }

      px[i] = color[0];
      px[i + 1] = color[1];
      px[i + 2] = color[2];
      px[i + 3] = 255;
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
