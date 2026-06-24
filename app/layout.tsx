import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Analytics } from "@vercel/analytics/react";
import BottomNav from "./components/bottom-nav";
import SwRegister from "./components/sw-register";
import InstallPrompt from "./components/install-prompt";
import InitialSplash from "./components/initial-splash";
import { SettingsProvider } from "./contexts/settings-context";

export const metadata: Metadata = {
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
          <InitialSplash />
        </SettingsProvider>
        <SwRegister />
        <Analytics />
      </body>
    </html>
  );
}
