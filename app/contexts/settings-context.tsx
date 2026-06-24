"use client";

// 전역 사용자 환경설정 (글자 크기 등) — Context + localStorage 영속화.
// <html data-font-size="..."> 속성을 통해 CSS 루트 font-size를 조절하여
// rem 기반 본문 텍스트가 사이트 전체에서 즉시 반영됩니다.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type FontSize = "small" | "normal" | "large";

export const FONT_SIZE_STORAGE_KEY = "lcm:font-size";
const VALID_FONT_SIZES: FontSize[] = ["small", "normal", "large"];

export const FONT_SIZE_LABELS: Record<FontSize, string> = {
  small: "작게",
  normal: "보통",
  large: "크게",
};

type SettingsContextValue = {
  fontSize: FontSize;
  setFontSize: (size: FontSize) => void;
};

const SettingsContext = createContext<SettingsContextValue | null>(null);

function isValidFontSize(value: unknown): value is FontSize {
  return typeof value === "string" && (VALID_FONT_SIZES as string[]).includes(value);
}

function readStoredFontSize(): FontSize {
  if (typeof window === "undefined") return "normal";
  try {
    const stored = window.localStorage.getItem(FONT_SIZE_STORAGE_KEY);
    return isValidFontSize(stored) ? stored : "normal";
  } catch {
    return "normal";
  }
}

function applyFontSizeAttribute(size: FontSize) {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.fontSize = size;
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  // 초기값은 'normal'로 두고, 마운트 후 저장값으로 동기화 (SSR/CSR 불일치 방지)
  const [fontSize, setFontSizeState] = useState<FontSize>("normal");

  useEffect(() => {
    const stored = readStoredFontSize();
    setFontSizeState(stored);
    applyFontSizeAttribute(stored);
  }, []);

  const setFontSize = useCallback((size: FontSize) => {
    setFontSizeState(size);
    applyFontSizeAttribute(size);
    try {
      window.localStorage.setItem(FONT_SIZE_STORAGE_KEY, size);
    } catch {
      // 저장 실패(시크릿 모드 등)는 무시 — 현재 세션 동안은 정상 동작
    }
  }, []);

  const value = useMemo<SettingsContextValue>(() => ({ fontSize, setFontSize }), [fontSize, setFontSize]);

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) {
    throw new Error("useSettings must be used within a SettingsProvider");
  }
  return ctx;
}
