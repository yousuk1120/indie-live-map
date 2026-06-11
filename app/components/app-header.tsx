// 각 탭 화면 공통 헤더 — 라이브클럽맵 워드마크 + 화면 제목

import type { ReactNode } from "react";

export default function AppHeader({
  title,
  subtitle,
  action,
}: {
  title: ReactNode;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <header className="mb-6 animate-fade-in md:mb-9">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="label-mono mb-2 text-[var(--accent)]">Live Club Map</p>
          <h1 className="text-[20px] font-extrabold leading-[1.15] tracking-[-0.03em] text-white md:text-[28px]">
            {title}
          </h1>
          {subtitle && (
            <p className="mt-2 max-w-md text-xs leading-relaxed text-[var(--muted)]">{subtitle}</p>
          )}
        </div>
        {/* 액션이 없으면 회전하는 LP 디스크가 헤더의 시그니처 */}
        {action ?? (
          <span
            className="vinyl-disc shrink-0"
            style={{ width: 64, height: 64 }}
            aria-hidden
          />
        )}
      </div>
      <div className="mt-5 h-px bg-[var(--line)]" />
    </header>
  );
}
