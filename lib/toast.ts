"use client";

// 최소 전역 토스트 — 한 번에 하나만 표시(최신이 이전 것을 대체).
// artist-prefs와 같은 "모듈 상태 + 리스너" 패턴. 외부 의존성 없음.
// 자동 사라짐 타이머는 표시 컴포넌트(ToastHost)가 담당합니다.

import { useSyncExternalStore } from "react";

export type ToastAction = { label: string; onClick: () => void | Promise<void> };
export type ToastData = { id: number; message: string; action?: ToastAction; duration: number };

let current: ToastData | null = null;
let seq = 0;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

export function showToast(input: { message: string; action?: ToastAction; duration?: number }) {
  seq += 1;
  current = {
    id: seq,
    message: input.message,
    action: input.action,
    // 액션(버튼)이 있으면 읽고 누를 시간을 더 줍니다.
    duration: input.duration ?? (input.action ? 6000 : 3000),
  };
  emit();
}

export function dismissToast(id?: number) {
  if (id != null && current?.id !== id) return; // 이미 다른 토스트로 교체됨 → 무시
  current = null;
  emit();
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
function getSnapshot() {
  return current;
}
function getServerSnapshot(): ToastData | null {
  return null;
}

export function useToast(): ToastData | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
