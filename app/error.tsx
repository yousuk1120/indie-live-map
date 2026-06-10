"use client";

// 전역 에러 화면 — 런타임 오류 시 Next 기본 화면 대신 표시됩니다.

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("화면 렌더링 오류:", error);
  }, [error]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-[var(--bg)] px-6 text-center">
      <p className="text-[11px] font-extrabold uppercase tracking-[0.26em] text-[var(--accent)]">Live Club Map</p>
      <h1 className="mt-3 text-2xl font-extrabold tracking-tight text-white">일시적인 오류가 발생했습니다</h1>
      <p className="mt-3 max-w-sm text-sm leading-relaxed text-[var(--muted)]">
        잠시 후 다시 시도해주세요. 문제가 계속되면 새로고침을 해주세요.
      </p>
      <div className="mt-8 flex gap-2">
        <button type="button" onClick={reset} className="primary-btn">
          다시 시도
        </button>
        <a href="/" className="secondary-btn">
          홈으로
        </a>
      </div>
    </main>
  );
}
