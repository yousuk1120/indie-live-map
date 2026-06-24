// 각 탭 화면 공통 헤더 — 라이브클럽맵 워드마크 + 화면 제목

import Link from "next/link";
import type { ReactNode } from "react";

export default function AppHeader({
  title,
  subtitle,
  action,
  showSettings = true,
}: {
  title: ReactNode;
  subtitle?: string;
  action?: ReactNode;
  showSettings?: boolean;
}) {
  return (
    <header className="mb-6 animate-fade-in md:mb-9">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="label-mono mb-2 text-[var(--accent)]">Live Club Map</p>
          <h1 className="text-[20px] font-extrabold leading-[1.15] tracking-[-0.03em] text-[var(--text)] md:text-[28px]">
            {title}
          </h1>
          {subtitle && (
            <p className="mt-2 max-w-md text-xs leading-relaxed text-[var(--muted)]">{subtitle}</p>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {/* 환경설정 진입 (글자 크기 등) */}
          {showSettings && (
            <Link
              href="/settings"
              aria-label="환경설정"
              title="환경설정"
              className="flex h-10 w-10 items-center justify-center rounded-full border border-[var(--line)] bg-[var(--panel)] text-[var(--muted)] transition-all duration-200 hover:border-[var(--accent-border)] hover:text-[var(--accent)] active:scale-90"
            >
              <svg viewBox="0 0 24 24" width={18} height={18} fill="none" stroke="currentColor" strokeWidth={1.8} style={{ width: 18, height: 18 }}>
                <circle cx="12" cy="12" r="3" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </Link>
          )}

          {/* 액션이 없으면 회전하는 LP 디스크가 헤더의 시그니처 */}
          {action ?? (
            <span
              className="vinyl-disc"
              style={{ width: 64, height: 64 }}
              aria-hidden
            />
          )}
        </div>
      </div>
      <div className="mt-5 h-px bg-[var(--line)]" />
    </header>
  );
}
