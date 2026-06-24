import type { Metadata } from "next";

// 어드민 라우트 전용 메타데이터 — 별도 PWA(앱 아이콘)로 설치할 수 있게
// 루트 manifest 대신 admin.webmanifest(start_url:/admin)를 사용합니다.
// 폰 홈 화면에 추가하면 "관리자" 전용 앱으로 열립니다.
export const metadata: Metadata = {
  title: "라이브클럽맵 관리자",
  manifest: "/admin.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "관리자",
  },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
