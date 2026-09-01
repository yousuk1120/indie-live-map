import { NextResponse } from "next/server";

// 현재 "배포된" 빌드 식별자를 반환합니다. 클라이언트는 자기 번들에 박제된
// NEXT_PUBLIC_BUILD_TIME 과 이 값을 비교해, 새 배포가 있으면 인앱 업데이트 배너를 띄웁니다.
// (배포마다 next.config가 새 타임스탬프를 주입하므로 값이 바뀝니다.)
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  return NextResponse.json(
    {
      build: process.env.NEXT_PUBLIC_BUILD_TIME || "",
      sha: process.env.NEXT_PUBLIC_BUILD_SHA || "",
    },
    {
      headers: {
        // CDN/브라우저 캐시로 옛 값이 물리지 않도록 항상 최신 응답
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      },
    }
  );
}
