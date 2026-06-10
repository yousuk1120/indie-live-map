"use client";

// 모바일 하단 탭 네비게이션 — 앱 셸의 핵심.
// /admin, /login 에서는 표시하지 않습니다.

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

type Tab = {
  href: string;
  label: string;
  icon: (active: boolean) => ReactNode;
  match: (pathname: string) => boolean;
};

const TABS: Tab[] = [
  {
    href: "/",
    label: "홈",
    match: (p) => p === "/" || p.startsWith("/events"),
    icon: (active) => (
      <svg viewBox="0 0 24 24" width={20} height={20} fill="none" stroke="currentColor" strokeWidth={active ? 2.4 : 1.8} style={{ width: 20, height: 20 }}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 10.5L12 3l9 7.5M5 9.5V21h14V9.5" />
      </svg>
    ),
  },
  {
    href: "/calendar",
    label: "달력",
    match: (p) => p.startsWith("/calendar"),
    icon: (active) => (
      <svg viewBox="0 0 24 24" width={20} height={20} fill="none" stroke="currentColor" strokeWidth={active ? 2.4 : 1.8} style={{ width: 20, height: 20 }}>
        <rect x="3" y="5" width="18" height="16" rx="2.5" />
        <path strokeLinecap="round" d="M3 10h18M8 3v4M16 3v4" />
      </svg>
    ),
  },
  {
    href: "/map",
    label: "지도",
    match: (p) => p.startsWith("/map"),
    icon: (active) => (
      <svg viewBox="0 0 24 24" width={20} height={20} fill="none" stroke="currentColor" strokeWidth={active ? 2.4 : 1.8} style={{ width: 20, height: 20 }}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 21s-7-5.5-7-11a7 7 0 1114 0c0 5.5-7 11-7 11z" />
        <circle cx="12" cy="10" r="2.5" />
      </svg>
    ),
  },
  {
    href: "/ticketbook",
    label: "티켓북",
    match: (p) => p.startsWith("/ticketbook"),
    icon: (active) => (
      <svg viewBox="0 0 24 24" width={20} height={20} fill="none" stroke="currentColor" strokeWidth={active ? 2.4 : 1.8} style={{ width: 20, height: 20 }}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 7a2 2 0 012-2h12a2 2 0 012 2v3a2 2 0 100 4v3a2 2 0 01-2 2H6a2 2 0 01-2-2v-3a2 2 0 100-4V7z" />
        <path strokeLinecap="round" d="M13 5v2.5M13 11v2M13 16.5V19" strokeDasharray="0.1 3" />
      </svg>
    ),
  },
];

export default function BottomNav() {
  const pathname = usePathname();

  // 관리자/로그인 화면에서는 앱 탭바 숨김
  if (pathname.startsWith("/admin") || pathname.startsWith("/login")) return null;

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--line)] bg-[color-mix(in_srgb,var(--bg)_85%,transparent)] backdrop-blur-xl"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="mx-auto flex h-16 max-w-5xl items-stretch justify-around px-2">
        {TABS.map((tab) => {
          const active = tab.match(pathname);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`relative flex flex-1 flex-col items-center justify-center gap-1 rounded-xl transition-all duration-300 active:scale-90 ${
                active ? "text-[var(--accent)]" : "text-[var(--muted)] hover:text-white"
              }`}
            >
              {active && (
                <span className="absolute top-0 h-0.5 w-8 rounded-full bg-[var(--accent)] shadow-[0_0_8px_var(--accent-glow)]" />
              )}
              {tab.icon(active)}
              <span className={`text-[10px] ${active ? "font-bold" : "font-medium"}`}>{tab.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
