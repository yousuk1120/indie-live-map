// Firebase 익명 인증 활성화 스크립트 (1회 실행용)
// .env.local의 서비스 계정으로 Identity Toolkit Admin API를 호출합니다.
// 사용법: node scripts/enable-anonymous-auth.js

const fs = require("fs");
const path = require("path");

function loadEnvLocal() {
  const envPath = path.join(__dirname, "..", ".env.local");
  const content = fs.readFileSync(envPath, "utf8");
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
  const projectId = env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const clientEmail = env.FIREBASE_CLIENT_EMAIL;
  const privateKey = (env.FIREBASE_PRIVATE_KEY || "").replace(/\\n/g, "\n");

  if (!projectId || !clientEmail || !privateKey) {
    console.error("환경변수 누락: NEXT_PUBLIC_FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY");
    process.exit(1);
  }

  const { JWT } = require("google-auth-library");
  const client = new JWT({
    email: clientEmail,
    key: privateKey,
    scopes: ["https://www.googleapis.com/auth/identitytoolkit", "https://www.googleapis.com/auth/cloud-platform"],
  });

  // 현재 설정 확인
  const base = `https://identitytoolkit.googleapis.com/admin/v2/projects/${projectId}/config`;
  const current = await client.request({ url: base, method: "GET" });
  const enabled = current.data?.signIn?.anonymous?.enabled === true;
  console.log("현재 익명 인증 상태:", enabled ? "활성화됨" : "비활성화");

  if (enabled) {
    console.log("이미 활성화되어 있습니다. 종료합니다.");
    return;
  }

  const res = await client.request({
    url: `${base}?updateMask=signIn.anonymous.enabled`,
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    data: { signIn: { anonymous: { enabled: true } } },
  });

  console.log("✅ 익명 인증 활성화 완료:", res.data?.signIn?.anonymous);
}

main().catch((error) => {
  console.error("실패:", error?.response?.data?.error?.message || error.message);
  console.error("→ Firebase 콘솔 > Authentication > Sign-in method 에서 '익명'을 수동으로 켜주세요.");
  process.exit(1);
});
