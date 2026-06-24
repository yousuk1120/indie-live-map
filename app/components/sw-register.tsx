"use client";

// PWA 서비스 워커 등록 + "새 버전 업데이트" 알림.
//
// 새 버전이 배포되면 서비스워커가 대기(waiting) 상태가 되고,
// 하단에 "새 버전이 나왔어요 — 업데이트" 배너를 띄웁니다.
// 사용자가 누르면 SKIP_WAITING을 보내 새 버전을 적용하고 새로고침합니다.

import { useEffect, useState } from "react";

export default function SwRegister() {
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

    // 개발 모드: 서비스 워커 등록하지 않고 기존 SW/캐시 정리
    if (process.env.NODE_ENV !== "production") {
      navigator.serviceWorker.getRegistrations().then((regs) => regs.forEach((r) => r.unregister()));
      if ("caches" in window) {
        caches.keys().then((keys) => keys.forEach((k) => caches.delete(k)));
      }
      return;
    }

    // 새 버전이 제어권을 가져오면 1회 새로고침 (업데이트 적용 직후)
    let refreshing = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    });

    navigator.serviceWorker
      .register("/sw.js", { updateViaCache: "none" })
      .then((registration) => {
        // 이미 대기 중인 새 버전이 있으면 즉시 알림 (이전 방문에서 받아둔 경우)
        if (registration.waiting && navigator.serviceWorker.controller) {
          setWaitingWorker(registration.waiting);
          setShow(true);
        }

        // 새 버전 설치 감지
        registration.addEventListener("updatefound", () => {
          const newWorker = registration.installing;
          if (!newWorker) return;
          newWorker.addEventListener("statechange", () => {
            // 설치 완료 + 기존 제어 워커 존재 = 업데이트 (첫 설치는 제외)
            if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
              setWaitingWorker(newWorker);
              setShow(true);
            }
          });
        });

        // 진입 시 새 버전 확인
        registration.update().catch(() => {});
      })
      .catch((error) => {
        console.error("서비스 워커 등록 실패:", error);
      });
  }, []);

  const applyUpdate = () => {
    setShow(false);
    if (waitingWorker) {
      waitingWorker.postMessage({ type: "SKIP_WAITING" });
      // controllerchange 이벤트가 새로고침을 처리합니다.
    } else {
      window.location.reload();
    }
  };

  if (!show) return null;

  return (
    <div
      className="fixed inset-x-0 z-[60] px-4"
      style={{ bottom: "calc(4rem + env(safe-area-inset-bottom) + 12px)" }}
    >
      <div className="mx-auto flex max-w-md items-center gap-3 rounded-2xl border border-[var(--accent-border)] bg-[var(--panel)] p-3 shadow-[0_8px_30px_rgba(0,0,0,0.18)] animate-slide-up">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)]">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 20, height: 20 }}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v6h6M20 20v-6h-6" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M20 10a8 8 0 0 0-14.3-3.7L4 8M4 14a8 8 0 0 0 14.3 3.7L20 16" />
          </svg>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-[var(--text)]">새 버전이 나왔어요</p>
          <p className="truncate text-xs text-[var(--muted)]">업데이트하면 최신 기능으로 바뀌어요</p>
        </div>
        <button
          type="button"
          onClick={applyUpdate}
          className="shrink-0 rounded-xl bg-gradient-to-br from-[var(--accent)] to-[var(--accent-deep)] px-4 py-2.5 text-xs font-bold text-white transition-all active:scale-95"
        >
          업데이트
        </button>
        <button
          type="button"
          onClick={() => setShow(false)}
          aria-label="나중에"
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
