// 기존 source_accounts 목록을 읽어옵니다 (firebase-admin, .env.local 자격증명).
const fs = require("fs");
const path = require("path");

function loadEnv() {
  const p = path.join(__dirname, "..", ".env.local");
  const raw = fs.readFileSync(p, "utf8");
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
  const admin = require("firebase-admin");
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
        clientEmail: env.FIREBASE_CLIENT_EMAIL,
        privateKey: (env.FIREBASE_PRIVATE_KEY || "").replace(/\\n/g, "\n"),
      }),
    });
  }
  const db = admin.firestore();
  const snap = await db.collection("source_accounts").get();
  const rows = snap.docs.map((d) => d.data());
  console.log("총", rows.length, "개 등록됨:");
  for (const r of rows.sort((a, b) => (a.category || "").localeCompare(b.category || ""))) {
    console.log(` - [${r.category || "?"}] @${r.accountName}  (active=${r.isActive})`);
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
