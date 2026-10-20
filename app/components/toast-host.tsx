"use client";

// 전역 토스트 표시부. layout에 한 번 마운트합니다.
// lib/toast의 showToast(...)를 호출하면 여기 하단 토스트로 뜹니다(액션 버튼 선택).

import { useEffect } from "react";
import { useToast, dismissToast } from "@/lib/toast";

export default function ToastHost() {
  const toast = useToast();

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => dismissToast(toast.id), toast.duration);
    return () => clearTimeout(t);
  }, [toast]);

  if (!toast) return null;

  const action = toast.action;

  return (
    <div
      className="fixed inset-x-0 z-[70] px-4"
      style={{ bottom: "calc(4rem + env(safe-area-inset-bottom) + 12px)" }}
    >
      <div className="mx-auto flex max-w-md items-center gap-3 rounded-2xl border border-[var(--accent-border)] bg-[var(--panel)] p-3 shadow-[0_8px_30px_rgba(0,0,0,0.18)] animate-slide-up">
        <p className="min-w-0 flex-1 text-xs font-semibold text-[var(--text)]">{toast.message}</p>
        {action && (
          <button
            type="button"
            onClick={() => {
              dismissToast(toast.id);
              void action.onClick();
            }}
            className="shrink-0 rounded-xl bg-gradient-to-br from-[var(--accent)] to-[var(--accent-deep)] px-3 py-2 text-xs font-bold text-white transition-all active:scale-95"
          >
            {action.label}
          </button>
        )}
        <button
          type="button"
          onClick={() => dismissToast(toast.id)}
          aria-label="닫기"
          className="shrink-0 rounded-lg p-1.5 text-[var(--muted)] transition-colors hover:text-[var(--text)]"
        >
          <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} style={{ width: 16, height: 16 }}>
            <path strokeLinecap="round" d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}
