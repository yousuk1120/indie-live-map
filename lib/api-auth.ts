// API 라우트용 관리자 인증 — Firebase ID 토큰 검증 + 이메일 화이트리스트.
// OpenAI/Apify 비용이 발생하는 엔드포인트는 반드시 이 검증을 통과해야 합니다.

import { isAdminEmail } from "./admin-config";

export type AdminAuthResult =
  | { ok: true; email: string }
  | { ok: false; status: number; error: string };

export async function verifyAdminRequest(req: Request): Promise<AdminAuthResult> {
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();

  if (!token) {
    return { ok: false, status: 401, error: "인증 토큰이 필요합니다." };
  }

  const { getAdminAuth } = await import("./firebase/admin");
  const adminAuth = await getAdminAuth();

  if (!adminAuth) {
    return { ok: false, status: 500, error: "서버 인증 모듈 초기화 실패 (FIREBASE_CLIENT_EMAIL/PRIVATE_KEY 환경변수 확인)" };
  }

  try {
    const decoded = await adminAuth.verifyIdToken(token);
    if (!isAdminEmail(decoded.email)) {
      return { ok: false, status: 403, error: "관리자 권한이 없습니다." };
    }
    return { ok: true, email: decoded.email };
  } catch (error) {
    console.error("ID 토큰 검증 실패:", error);
    return { ok: false, status: 401, error: "유효하지 않은 인증 토큰입니다." };
  }
}
