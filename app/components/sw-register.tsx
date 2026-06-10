"use client";

// PWA 서비스 워커 등록 (설치 가능 조건 충족 + 정적 자원 캐싱)

import { useEffect } from "react";

export default function SwRegister() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch((error) => {
      console.error("서비스 워커 등록 실패:", error);
    });
  }, []);

  return null;
}
