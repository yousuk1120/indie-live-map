// Firebase 프로젝트의 실제 Storage 버킷 이름을 조회합니다 (서비스계정 자격증명).
const fs = require("fs");
const path = require("path");

function loadEnv() {
  const raw = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8");
  const env = {};
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    let v = m[2];
    if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
    env[m[1]] = v;
  }
  return env;
}

async function main() {
  const env = loadEnv();
  const projectId = env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const credentials = {
    client_email: env.FIREBASE_CLIENT_EMAIL,
    private_key: (env.FIREBASE_PRIVATE_KEY || "").replace(/\\n/g, "\n"),
  };

  console.log("projectId:", projectId);
  console.log("env storageBucket:", env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET);

  const { Storage } = require("@google-cloud/storage");
  const storage = new Storage({ projectId, credentials });

  try {
    const [buckets] = await storage.getBuckets();
    console.log("\n프로젝트의 실제 버킷 목록:");
    if (buckets.length === 0) console.log("  (없음 — Storage 미활성화)");
    for (const b of buckets) console.log("  -", b.name);
  } catch (e) {
    console.log("버킷 목록 조회 실패:", e.message);
  }

  // 후보 이름 존재 확인
  const candidates = [
    env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    `${projectId}.firebasestorage.app`,
    `${projectId}.appspot.com`,
  ].filter(Boolean);
  console.log("\n후보 버킷 존재 여부:");
  for (const name of [...new Set(candidates)]) {
    try {
      const [exists] = await storage.bucket(name).exists();
      console.log(`  ${name} → ${exists ? "존재 ✅" : "없음 ❌"}`);
    } catch (e) {
      console.log(`  ${name} → 에러: ${e.message}`);
    }
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
