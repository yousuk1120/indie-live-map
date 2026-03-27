import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // firebase-admin은 순수 서버 전용 Node.js 패키지입니다.
  // Next.js가 번들링하면 instanceof 체크가 깨지므로 external로 지정합니다.
  // (클라이언트 firebase SDK인 @firebase/firestore는 여기에 넣으면 안 됩니다!)
  serverExternalPackages: ["firebase-admin", "@google-cloud/firestore"],
};

export default nextConfig;
