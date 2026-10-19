"use client";

// PWA 서비스 워커 등록 + "업데이트 배너".
//
// 새 버전이 배포되면 하단에 "새 버전이 나왔어요 — 지금 업데이트" 배너를 띄웁니다.
// 버튼을 누르면 새 워커를 즉시 적용(SKIP_WAITING)하고 새로고침해 바로 최신 버전으로 바뀝니다.
// (예전 '조용한 백그라운드 자동적용'은 기기에 따라 적용이 늦어 안 보이던 문제가 있어
//  명시적 배너 방식으로 변경 — 사용자가 업데이트를 확실히 인지·적용할 수 있게.)

import { useEffect, useState } from "react";

export default function SwRegister() {
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

    // 개발 모드: 서비스 워커 등록하지 않고 기존 SW/캐시 정리
    if (process.env.NODE_ENV !== "production") {
      navigator.serviceWorker.getRegistrations().then((regs) => regs.forEach((r) => r.unregister()));
      if ("caches" in window) caches.keys().then((keys) => keys.forEach((k) => caches.delete(k)));
      return;
    }

    // 업데이트 적용으로 제어권이 바뀌면 새로고침(새 자원 로드). 첫 설치(이전 제어 워커 없음)는 제외.
    const hadController = !!navigator.serviceWorker.controller;
    let refreshing = false;
    const onControllerChange = () => {
      if (refreshing || !hadController) return;
      refreshing = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

    let reg: ServiceWorkerRegistration | null = null;
    navigator.serviceWorker
      .register("/sw.js", { updateViaCache: "none" })
      .then((registration) => {
        reg = registration;
        // 이전 방문에서 받아둔 대기 워커가 있으면 배너 표시
        if (registration.waiting && navigator.serviceWorker.controller) setWaiting(registration.waiting);
        // 새 버전 설치 감지 → 배너 표시
        registration.addEventListener("updatefound", () => {
          const nw = registration.installing;
          if (!nw) return;
          nw.addEventListener("statechange", () => {
            if (nw.state === "installed" && navigator.serviceWorker.controller) setWaiting(nw);
          });
        });
        registration.update().catch(() => {});
      })
      .catch((error) => console.error("서비스 워커 등록 실패:", error));

    // 앱을 다시 볼 때마다 새 버전 확인 — 오래 켜둔 앱도 배너가 뜨게 함
    const checkOnVisible = () => {
      if (document.visibilityState === "visible") reg?.update().catch(() => {});
    };
    document.addEventListener("visibilitychange", checkOnVisible);

    return () => {
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
      document.removeEventListener("visibilitychange", checkOnVisible);
    };
  }, []);

  const applyUpdate = () => {
    if (!waiting) return;
    setApplying(true);
    waiting.postMessage({ type: "SKIP_WAITING" }); // → activate → controllerchange → reload
  };

  if (!waiting) return null;

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-[9999] flex items-center justify-center gap-3 border-t border-[var(--accent-border)] bg-[var(--panel)]/95 px-4 py-3 backdrop-blur-sm"
      style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}
      role="status"
    >
      <span className="text-sm font-medium text-[var(--text)]">새 버전이 나왔어요 🎉</span>
      <button
        type="button"
        onClick={applyUpdate}
        disabled={applying}
        className="shrink-0 rounded-xl bg-[var(--accent)] px-4 py-2 text-sm font-bold text-[#0a0a12] transition-all active:scale-95 disabled:opacity-60"
      >
        {applying ? "업데이트 중…" : "지금 업데이트"}
      </button>
    </div>
  );
}
