"use client";

// PWA 서비스 워커 등록 + "자동 업데이트".
//
// 새 버전이 배포되면 자동으로 적용합니다(배너 없이). 다만 사용 중 갑자기 새로고침되어
// 끊기지 않도록, 새 버전 적용에 따른 새로고침은 **화면이 가려질 때(앱 전환/백그라운드)**
// 수행합니다. 이미 화면이 꺼져 있으면 즉시 적용합니다.
//  - 앱(standalone)/웹 모두 동일하게 자동 적용
//  - 앱을 다시 열 때마다(visible) 새 버전이 있는지 확인 → 오래 켜둔 앱도 최신화

import { useEffect } from "react";

export default function SwRegister() {
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

    // 새 버전이 제어권을 가져오면 새로고침 — 단, 사용 중이면 방해하지 않도록
    // 화면이 가려질 때(다른 앱 전환/닫기)로 미룹니다. 이미 숨김 상태면 즉시 실행.
    let refreshing = false;
    const reloadWhenHidden = () => {
      if (refreshing) return;
      refreshing = true;
      if (document.visibilityState === "hidden") {
        window.location.reload();
        return;
      }
      const onHide = () => {
        if (document.visibilityState === "hidden") {
          document.removeEventListener("visibilitychange", onHide);
          window.location.reload();
        }
      };
      document.addEventListener("visibilitychange", onHide);
    };
    navigator.serviceWorker.addEventListener("controllerchange", reloadWhenHidden);

    // 새 버전(installed 상태)이 감지되면 즉시 자동 적용(SKIP_WAITING).
    // 적용 후 controllerchange가 위 로직으로 (숨김 시) 새로고침합니다.
    const applyNewWorker = (worker: ServiceWorker) => {
      worker.postMessage({ type: "SKIP_WAITING" });
    };

    let swRegistration: ServiceWorkerRegistration | null = null;

    navigator.serviceWorker
      .register("/sw.js", { updateViaCache: "none" })
      .then((registration) => {
        swRegistration = registration;

        // 이미 대기 중인 새 버전이 있으면 적용 (이전 방문에서 받아둔 경우)
        if (registration.waiting && navigator.serviceWorker.controller) {
          applyNewWorker(registration.waiting);
        }

        // 새 버전 설치 감지
        registration.addEventListener("updatefound", () => {
          const newWorker = registration.installing;
          if (!newWorker) return;
          newWorker.addEventListener("statechange", () => {
            // 설치 완료 + 기존 제어 워커 존재 = 업데이트 (첫 설치는 제외)
            if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
              applyNewWorker(newWorker);
            }
          });
        });

        // 진입 시 새 버전 확인
        registration.update().catch(() => {});
      })
      .catch((error) => {
        console.error("서비스 워커 등록 실패:", error);
      });

    // 앱을 다시 볼 때마다 새 버전 확인 — 오래 켜둔 설치 앱도 최신 버전을 받아옵니다.
    const checkOnVisible = () => {
      if (document.visibilityState === "visible") {
        swRegistration?.update().catch(() => {});
      }
    };
    document.addEventListener("visibilitychange", checkOnVisible);

    return () => {
      navigator.serviceWorker.removeEventListener("controllerchange", reloadWhenHidden);
      document.removeEventListener("visibilitychange", checkOnVisible);
    };
  }, []);

  return null;
}
