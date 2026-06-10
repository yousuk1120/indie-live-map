import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Analytics } from "@vercel/analytics/react";
import BottomNav from "./components/bottom-nav";
import SwRegister from "./components/sw-register";

export const metadata: Metadata = {
  title: "라이브클럽맵 | 인디 공연 일정",
  description: "라이브클럽맵 (Live Club Map) — 인디씬 라이브 공연 일정을 목록·지도·달력으로 한눈에.",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "라이브클럽맵",
  },
  icons: {
    apple: "/icons/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#08080d",
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
      <body>
        {children}
        <BottomNav />
        <SwRegister />
        <Analytics />
      </body>
    </html>
  );
}
