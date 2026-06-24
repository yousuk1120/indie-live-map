"use client";

// PWA 설치 유도 배너 — 브라우저가 설치 가능 상태가 되면(beforeinstallprompt)
// 하단에 "앱 설치" 배너를 띄웁니다. 닫으면 일정 기간 다시 표시하지 않습니다.
// (이미 설치됐거나 standalone 모드면 노출하지 않음. iOS 안내는 /settings에서 처리)

import { useEffect, useState } from "react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const DISMISS_KEY = "lcm:install-dismissed";
const DISMISS_DAYS = 14;

function recentlyDismissed(): boolean {
  try {
    const ts = Number(localStorage.getItem(DISMISS_KEY) || 0);
    return ts > 0 && Date.now() - ts < DISMISS_DAYS * 86_400_000;
  } catch {
    return false;
  }
}

export default function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // 이미 앱으로 실행 중(standalone)이면 표시하지 않음
    const standalone =
      window.matchMedia?.("(display-mode: standalone)").matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    if (standalone || recentlyDismissed()) return;

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setVisible(true);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);

    const onInstalled = () => setVisible(false);
    window.addEventListener("appinstalled", onInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const handleInstall = async () => {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice.catch(() => undefined);
    setDeferred(null);
    setVisible(false);
  };

  const handleDismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      // ignore
    }
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div
      className="fixed inset-x-0 z-50 px-4 animate-slide-up"
      style={{ bottom: "calc(4rem + env(safe-area-inset-bottom) + 12px)" }}
    >
      <div className="mx-auto flex max-w-md items-center gap-3 rounded-2xl border border-[var(--accent-border)] bg-[var(--panel)] p-3 shadow-[0_8px_30px_rgba(0,0,0,0.18)]">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-soft)]">
          <span className="vinyl-disc" style={{ width: 32, height: 32 }} aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-[var(--text)]">앱으로 설치하기</p>
          <p className="truncate text-xs text-[var(--muted)]">홈 화면에 추가하면 앱처럼 빠르게 열려요</p>
        </div>
        <button
          type="button"
          onClick={handleInstall}
          className="shrink-0 rounded-xl bg-gradient-to-br from-[var(--accent)] to-[var(--accent-deep)] px-4 py-2.5 text-xs font-bold text-white transition-all active:scale-95"
        >
          설치
        </button>
        <button
          type="button"
          onClick={handleDismiss}
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
