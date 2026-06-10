// 관리자 이메일 화이트리스트 — firestore.rules의 isAdmin() 목록과 반드시 일치시켜야 합니다.
export const ADMIN_EMAILS = ["yousuk1120@gmail.com"];

export function isAdminEmail(email?: string | null): boolean {
  return !!email && ADMIN_EMAILS.includes(email);
}
