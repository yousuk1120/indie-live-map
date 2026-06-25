import type { NextConfig } from "next";

// 빌드 시점에 버전 정보를 번들에 주입 — 설정 화면에 표시해 "업데이트가 적용됐는지"
// 사용자가 눈으로 확인할 수 있게 합니다. (배포마다 자동으로 값이 바뀜)
const buildTime = new Date().toISOString();
const commitSha = (process.env.VERCEL_GIT_COMMIT_SHA || "").slice(0, 7);

const nextConfig: NextConfig = {
  // firebase-admin은 순수 서버 전용 Node.js 패키지입니다.
  // Next.js가 번들링하면 instanceof 체크가 깨지므로 external로 지정합니다.
  // (클라이언트 firebase SDK인 @firebase/firestore는 여기에 넣으면 안 됩니다!)
  serverExternalPackages: ["firebase-admin", "@google-cloud/firestore"],
  env: {
    NEXT_PUBLIC_BUILD_TIME: buildTime,
    NEXT_PUBLIC_BUILD_SHA: commitSha,
  },
};

export default nextConfig;
