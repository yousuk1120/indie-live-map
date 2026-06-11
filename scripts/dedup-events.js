// DB 차원 중복 공연 병합 스크립트 (1회 실행용)
// lib/event-merge.ts의 공용 판정/병합 로직을 컴파일해 그대로 사용합니다.
// 사용법: npx tsc lib/event-merge.ts lib/venues.ts --outDir .tmp-merge --module commonjs --target es2020 --skipLibCheck
//        node scripts/dedup-events.js

const fs = require("fs");
const path = require("path");

function loadEnvLocal() {
  const content = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8");
  const env = {};
  for (const line of content.split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (!match) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    env[match[1]] = value;
  }
  return env;
}

async function main() {
  const env = loadEnvLocal();
  const { isSameConcert, mergeConcerts } = require("../.tmp-merge/event-merge.js");

  const { initializeApp, cert } = require("firebase-admin/app");
  const { getFirestore, FieldValue } = require("firebase-admin/firestore");

  initializeApp({
    credential: cert({
      projectId: env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      clientEmail: env.FIREBASE_CLIENT_EMAIL,
      privateKey: env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
    }),
  });
  const db = getFirestore();

  const snap = await db.collection("events").get();
  const events = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  console.log(`전체 공연 ${events.length}개 로드`);

  // 같은 공연끼리 그룹핑
  const groups = [];
  for (const ev of events) {
    const group = groups.find((g) => g.some((member) => isSameConcert(member, ev)));
    if (group) group.push(ev);
    else groups.push([ev]);
  }

  let mergedGroups = 0;
  let deleted = 0;

  for (const group of groups) {
    if (group.length <= 1) continue;

    let merged = { ...group[0] };
    for (let i = 1; i < group.length; i++) {
      merged = { ...merged, ...mergeConcerts(merged, group[i]) };
    }

    const keepId = group[0].id;
    const { id, createdAt, updatedAt, ...fields } = merged;

    // undefined 필드 제거 (Firestore 거부 방지)
    const clean = Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined));

    await db.collection("events").doc(keepId).update({ ...clean, updatedAt: FieldValue.serverTimestamp() });
    for (let i = 1; i < group.length; i++) {
      await db.collection("events").doc(group[i].id).delete();
      deleted++;
    }
    mergedGroups++;
    console.log(`  ✅ 병합: "${clean.title}" (${group.length}개 → 1개)`);
  }

  console.log(`\n완료: ${mergedGroups}개 그룹 병합, ${deleted}개 중복 문서 삭제`);

  // 검증
  const after = await db.collection("events").get();
  console.log(`병합 후 전체 공연: ${after.size}개`);
}

main().then(() => process.exit(0)).catch((e) => {
  console.error("실패:", e);
  process.exit(1);
});
