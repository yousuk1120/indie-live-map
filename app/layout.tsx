import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Analytics } from "@vercel/analytics/react";
import BottomNav from "./components/bottom-nav";
import SwRegister from "./components/sw-register";
import InstallPrompt from "./components/install-prompt";
import UpdatePrompt from "./components/update-prompt";
import RequestApprovedBanner from "./components/request-approved-banner";
import ToastHost from "./components/toast-host";
import InitialSplash from "./components/initial-splash";
import { SettingsProvider } from "./contexts/settings-context";
import { SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "라이브클럽맵 | 인디 공연 일정",
  description: "라이브클럽맵 (Live Club Map) — 인디씬 라이브 공연 일정을 목록·지도·달력으로 한눈에.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "라이브클럽맵",
  },
  icons: {
    apple: "/icons/apple-touch-icon.png",
  },
  // 소유확인 메타태그 — 구글 서치콘솔 / 네이버 서치어드바이저 HTML 태그 방식.
  verification: {
    google: "FJ0ELW5O3czFxi3ONklI1nejoka2wznOxVWx8jSPKs4",
    other: { "naver-site-verification": "0f9964e147d02307f29d1879e597a4840411a8bb" },
  },
};

export const viewport: Viewport = {
  themeColor: "#faf9f7",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <head>
        {/* 글자 크기 설정 즉시 적용 — 하이드레이션 전 깜빡임(FOUC) 방지 */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{var s=localStorage.getItem('lcm:font-size');if(s==='small'||s==='large')document.documentElement.dataset.fontSize=s;}catch(e){}",
          }}
        />
      </head>
      <body>
        <SettingsProvider>
          {children}
          <BottomNav />
          <InstallPrompt />
          <UpdatePrompt />
          <RequestApprovedBanner />
          <ToastHost />
          <InitialSplash />
        </SettingsProvider>
        <SwRegister />
        <Analytics />
      </body>
    </html>
  );
}
