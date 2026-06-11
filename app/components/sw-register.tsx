"use client";

// PWA 서비스 워커 등록 + 자동 갱신
// 새 버전 SW가 활성화되면 열려 있는 탭을 1회 자동 새로고침해서
// 옛 캐시가 화면을 잡고 있는 문제를 방지합니다.

import { useEffect } from "react";

export default function SwRegister() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

    let reloaded = false;

    // 새 SW가 제어권을 가져오면 1회 새로고침 (무한 루프 방지 가드)
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (reloaded) return;
      reloaded = true;
      window.location.reload();
    });

    navigator.serviceWorker
      .register("/sw.js", { updateViaCache: "none" })
      .then((registration) => {
        // 페이지 진입 시마다 새 버전 확인
        registration.update().catch(() => {});
      })
      .catch((error) => {
        console.error("서비스 워커 등록 실패:", error);
      });
  }, []);

  return null;
}
