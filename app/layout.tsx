import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Analytics } from "@vercel/analytics/react";
import BottomNav from "./components/bottom-nav";
import SwRegister from "./components/sw-register";

export const metadata: Metadata = {
  title: "Seoul Indie Live | Concert Schedule",
  description: "서울 인디 공연 일정을 보는 사이트",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "IndieLive",
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
