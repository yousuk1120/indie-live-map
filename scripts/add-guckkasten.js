// 국카스텐(@guckkasten_official)을 밴드 소스로 source_accounts에 추가하고,
// "새 아티스트 추가됨" 관리자 알림을 발송합니다. (이미 있으면 건너뜀)
//
// 알림은 서버 라우트(scan-account)와 동일하게 ADMIN_WEBHOOK_URL(Slack/Discord) /
// RESEND(이메일)로 나갑니다. 추가 시 newSourceNotifiedAt 를 세팅해 이후 백필에서
// 중복 알림이 나가지 않도록 합니다.
const fs = require("fs");
const path = require("path");

const TARGET = { accountName: "guckkasten_official", category: "밴드", artistName: "국카스텐" };

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

function norm(s) {
  return String(s || "").trim().toLowerCase().replace(/^@/, "");
}

// 관리자 알림 발송 — lib/notify-admin.ts 와 동일한 채널/포맷(이메일 우선, 없으면 웹훅).
async function sendAdminAlert(env, subject, lines) {
  const body = lines.filter(Boolean).join("\n");
  try {
    if (env.RESEND_API_KEY && env.ALERT_EMAIL) {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: env.ALERT_FROM || "라이브클럽맵 <onboarding@resend.dev>",
          to: [env.ALERT_EMAIL],
          subject,
          text: body,
        }),
      });
      if (res.ok) return { sent: true, via: "email" };
      console.warn("[알림] 이메일 실패, 웹훅 시도:", res.status);
    }
    if (env.ADMIN_WEBHOOK_URL) {
      const content = `*${subject}*\n${body}`;
      const res = await fetch(env.ADMIN_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: content, content }),
      });
      if (res.ok) return { sent: true, via: "webhook" };
      console.warn("[알림] 웹훅 실패:", res.status);
      return { sent: false };
    }
    console.warn("[알림] 채널 미설정 — 건너뜀");
    return { sent: false };
  } catch (e) {
    console.error("[알림] 발송 예외:", e.message || e);
    return { sent: false };
  }
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
  const FieldValue = admin.firestore.FieldValue;

  const snap = await db.collection("source_accounts").get();
  const existing = new Set(snap.docs.map((d) => norm(d.data().accountName)));
  if (existing.has(norm(TARGET.accountName))) {
    console.log(`건너뜀(이미 있음): @${TARGET.accountName}`);
    return;
  }

  await db.collection("source_accounts").add({
    accountName: TARGET.accountName,
    category: TARGET.category,
    isActive: true,
    createdAt: FieldValue.serverTimestamp(),
    newSourceNotifiedAt: FieldValue.serverTimestamp(), // 아래에서 알림 보냄 → 백필 중복 알림 방지
  });
  console.log(`추가됨: [${TARGET.category}] ${TARGET.artistName} @${TARGET.accountName}`);

  const siteUrl = env.ALERT_SITE_URL || "";
  const result = await sendAdminAlert(env, "🆕 새 아티스트 추가됨", [
    `${TARGET.artistName} · @${TARGET.accountName}  [${TARGET.category}]`,
    `https://www.instagram.com/${TARGET.accountName}/`,
    siteUrl ? `관리자: ${siteUrl.replace(/\/$/, "")}/admin` : "",
  ]);
  console.log(result.sent ? `알림 발송됨(${result.via})` : "알림 미발송(채널 미설정)");
  console.log("\n예정 공연 수집(백필)은 /admin 에서 해당 계정 추가 후 자동 실행되거나, 매일 크론으로 점진 수집됩니다.");
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
