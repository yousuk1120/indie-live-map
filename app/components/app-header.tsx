// 각 탭 화면 공통 헤더 (서버/클라이언트 양쪽에서 사용 가능)

import Link from "next/link";
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
    <header className="mb-6 animate-fade-in md:mb-10">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.32em] text-[var(--accent)]">
            <span className="live-dot" />
            Seoul Indie Live
          </p>
          <h1 className="text-3xl font-extrabold leading-[1.05] tracking-[-0.045em] text-white md:text-5xl">
            {title}
          </h1>
          {subtitle && (
            <p className="mt-3 max-w-md text-sm leading-relaxed text-[var(--muted)]">{subtitle}</p>
          )}
        </div>
        {action ?? (
          <Link href="/admin" className="secondary-btn hidden text-xs md:inline-flex">
            Admin
          </Link>
        )}
      </div>
      <div className="mt-6 h-px bg-gradient-to-r from-[var(--accent-soft)] via-white/5 to-transparent" />
    </header>
  );
}
