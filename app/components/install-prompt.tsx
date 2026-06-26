"use client";

// PWA 설치 유도 배너 — 웹사이트(브라우저)에선 항상 "앱으로 설치" 배너를 띄웁니다.
// 앱(standalone)으로 실행 중이면 띄우지 않습니다(거기선 업데이트 배너만 표시).
//
// 두 가지 모드로 동작합니다.
//  1) 네이티브 모드: 브라우저가 설치 가능 상태(beforeinstallprompt)면 "설치" 버튼으로
//     바로 네이티브 설치 프롬프트를 띄웁니다. (설치 안 한 Android/데스크톱 Chrome)
//  2) 폴백 모드: beforeinstallprompt를 못 받는 환경(iOS Safari·Firefox·시크릿 모드,
//     또는 이미 설치한 브라우저)에선 "방법 보기" 버튼으로 설정의 수동 설치 가이드로 안내합니다.
//
// 닫기(X)는 현재 화면에서만 숨기며, 다시 방문/새로고침하면 또 노출됩니다.
// 설치 이벤트 캡처는 use-install 공유 모듈이 담당합니다(마운트 전 이벤트 누락 방지).

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useInstall } from "./use-install";

// 폴백 안내는 마운트 직후 잠깐 기다렸다 노출 — 그 사이 beforeinstallprompt가
// 도착하면 네이티브 모드로 전환되어 폴백 깜빡임을 막습니다.
const FALLBACK_DELAY_MS = 1500;

export default function InstallPrompt() {
  const router = useRouter();
  const { canInstall, standalone, ios, triggerInstall } = useInstall();
  const [dismissed, setDismissed] = useState(false);
  const [fallbackReady, setFallbackReady] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setFallbackReady(true), FALLBACK_DELAY_MS);
    return () => clearTimeout(t);
  }, []);

  const handleInstall = async () => {
    const result = await triggerInstall();
    if (result !== "accepted") {
      // 설치 거부/불가 시 현재 화면에서만 닫음 (새로고침하면 다시 노출)
      setDismissed(true);
    }
  };

  // 앱(standalone)에선 숨김. 웹사이트에선 설치 여부와 무관하게 항상 노출.
  if (standalone || dismissed) return null;

  // 네이티브 설치가 가능하면 즉시, 아니면 폴백은 짧은 지연 후 노출
  const native = canInstall;
  if (!native && !fallbackReady) return null;

  const subtitle = native
    ? "홈 화면에 추가하면 앱처럼 빠르게 열려요"
    : ios
      ? "공유 → ‘홈 화면에 추가’로 앱처럼 쓸 수 있어요"
      : "홈 화면에 추가하는 방법을 알려드려요";

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
          <p className="truncate text-xs text-[var(--muted)]">{subtitle}</p>
        </div>
        {native ? (
          <button
            type="button"
            onClick={handleInstall}
            className="shrink-0 rounded-xl bg-gradient-to-br from-[var(--accent)] to-[var(--accent-deep)] px-4 py-2.5 text-xs font-bold text-white transition-all active:scale-95"
          >
            설치
          </button>
        ) : (
          <button
            type="button"
            onClick={() => router.push("/settings")}
            className="shrink-0 rounded-xl bg-gradient-to-br from-[var(--accent)] to-[var(--accent-deep)] px-4 py-2.5 text-xs font-bold text-white transition-all active:scale-95"
          >
            방법 보기
          </button>
        )}
        <button
          type="button"
          onClick={() => setDismissed(true)}
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
