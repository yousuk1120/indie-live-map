"use client";

// PWA 설치 상태 공유 모듈.
//
// beforeinstallprompt 이벤트는 페이지 로드 직후(컴포넌트 마운트 전) 일찍 발생할 수 있어
// 컴포넌트별 useEffect 리스너로는 놓치기 쉽습니다. 그래서 이 모듈이 임포트되는 즉시
// (= 클라이언트 번들 실행 시점) window 리스너를 달아 이벤트를 전역에 저장합니다.
// 배너·설정 페이지가 같은 상태를 공유하므로, 배너를 닫아도 설정에서 항상 설치할 수 있습니다.

import { useEffect, useState } from "react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

let deferred: BeforeInstallPromptEvent | null = null;
let installed = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e: Event) => {
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
    emit();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    installed = true;
    emit();
  });
}

// 네이티브 설치 프롬프트를 띄웁니다. 프롬프트가 없으면(이미 설치/미지원/iOS) "unavailable".
export async function triggerInstall(): Promise<"accepted" | "dismissed" | "unavailable"> {
  if (!deferred) return "unavailable";
  try {
    await deferred.prompt();
    const choice = await deferred.userChoice;
    if (choice.outcome === "accepted") installed = true;
    deferred = null;
    emit();
    return choice.outcome;
  } catch {
    return "unavailable";
  }
}

export function getPlatform(): { standalone: boolean; ios: boolean } {
  if (typeof window === "undefined") return { standalone: false, ios: false };
  const standalone =
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true;
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  return { standalone, ios };
}

// 설치 상태를 구독하는 훅. canInstall=네이티브 프롬프트 사용 가능.
export function useInstall() {
  const [, force] = useState(0);
  useEffect(() => {
    const cb = () => force((n) => n + 1);
    listeners.add(cb);
    return () => {
      listeners.delete(cb);
    };
  }, []);

  const { standalone, ios } = getPlatform();
  return { canInstall: !!deferred, installed, standalone, ios, triggerInstall };
}
