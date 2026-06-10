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
    <header className="mb-7 animate-fade-in md:mb-10">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="mb-2.5 text-[11px] font-extrabold uppercase tracking-[0.26em] text-[var(--accent)]">
            Live Club Map
          </p>
          <h1 className="text-[28px] font-extrabold leading-[1.12] tracking-[-0.035em] text-white md:text-[40px]">
            {title}
          </h1>
          {subtitle && (
            <p className="mt-2.5 max-w-md text-[13px] leading-relaxed text-[var(--muted)]">{subtitle}</p>
          )}
        </div>
        {action}
      </div>
      <div className="mt-6 h-px bg-[var(--line)]" />
    </header>
  );
}
