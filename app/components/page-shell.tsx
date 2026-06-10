// 탭 화면 공통 셸 — 배경 글로우 + 컨테이너 + 하단 탭 여백

import type { ReactNode } from "react";

export default function PageShell({ children }: { children: ReactNode }) {
  return (
    <main className="relative min-h-screen overflow-x-clip bg-[var(--bg)] text-[var(--text)]">
      <div aria-hidden className="bg-aurora" />
      <div className="relative mx-auto max-w-5xl px-4 pb-32 pt-8 md:px-6 md:pt-14">
        {children}
      </div>
    </main>
  );
}
