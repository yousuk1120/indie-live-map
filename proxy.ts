import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// 어드민 격리 — 사용자용 배포에서 /admin, /login 을 404로 차단합니다.
//  - 로컬 개발(next dev)에서는 항상 접근 가능
//  - 프로덕션에서 관리자 기능을 쓰려면 Vercel 환경변수 ADMIN_ENABLED=true 설정
//    (권장: 어드민은 별도 Vercel 프로젝트로 분리하고 그쪽에만 ADMIN_ENABLED 부여)
const ADMIN_ENABLED =
  process.env.NODE_ENV === "development" || process.env.ADMIN_ENABLED === "true";

export function proxy(request: NextRequest) {
  if (!ADMIN_ENABLED) {
    const { pathname } = request.nextUrl;
    if (pathname.startsWith("/admin") || pathname.startsWith("/login")) {
      // 존재하지 않는 경로로 rewrite → not-found 화면 렌더 (경로 존재 자체를 숨김)
      return NextResponse.rewrite(new URL("/__blocked", request.url));
    }
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/login/:path*"],
};
