"use client";

// 인앱 업데이트 배너.
//
// PWA는 앱을 다시 설치하지 않아도 내용이 갱신됩니다(서비스워커 + 네트워크 우선 HTML).
// 다만 앱을 계속 켜둔 채 사용 중이면 새 배포를 못 받은 상태로 남을 수 있어,
// 이 배너가 "새 버전이 있어요 → [업데이트]"를 띄워 즉시 최신화할 수 있게 합니다.
//
// 감지 방법(둘 중 하나라도 걸리면 표시):
//   1) 서버 /api/version 의 빌드값 ≠ 내 번들에 박제된 빌드값  → 새 배포 존재
//   2) 서비스워커에 대기(waiting) 중인 새 버전이 있음
// [업데이트] 클릭 → 대기 워커에 SKIP_WAITING 전송 후 새로고침(네트워크 우선이라 최신 로드).

import { useCallback, useEffect, useRef, useState } from "react";

const CURRENT_BUILD = process.env.NEXT_PUBLIC_BUILD_TIME || "";

export default function UpdatePrompt() {
  const [available, setAvailable] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const checking = useRef(false);

  // 서버 배포 버전과 내 번들 버전 비교
  const checkServerVersion = useCallback(async () => {
    if (checking.current || !CURRENT_BUILD) return;
    checking.current = true;
    try {
      const res = await fetch("/api/version", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { build?: string };
      if (data.build && data.build !== CURRENT_BUILD) setAvailable(true);
    } catch {
      // 오프라인 등 — 조용히 무시
    } finally {
      checking.current = false;
    }
  }, []);

  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;

    checkServerVersion();

    // 앱을 다시 볼 때마다 재확인 (오래 켜둔 앱도 새 배포를 잡도록)
    const onVisible = () => {
      if (document.visibilityState === "visible") checkServerVersion();
    };
    document.addEventListener("visibilitychange", onVisible);

    // 서비스워커 대기 버전도 신호로 사용
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.getRegistration().then((reg) => {
        if (reg?.waiting) setAvailable(true);
        reg?.addEventListener("updatefound", () => {
          const nw = reg.installing;
          nw?.addEventListener("statechange", () => {
            if (nw.state === "installed" && navigator.serviceWorker.controller) setAvailable(true);
          });
        });
      });
    }

    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [checkServerVersion]);

  const handleUpdate = useCallback(async () => {
    setBusy(true);
    try {
      if ("serviceWorker" in navigator) {
        const reg = await navigator.serviceWorker.getRegistration();
        reg?.waiting?.postMessage({ type: "SKIP_WAITING" });
      }
    } catch {
      // 무시하고 새로고침으로 진행
    }
    // 네트워크 우선이라 새로고침만으로 최신 HTML/자원을 받아옵니다.
    window.location.reload();
  }, []);

  if (!available || dismissed) return null;

  return (
    <div
      className="fixed inset-x-0 z-[60] px-4 animate-slide-up"
      style={{ bottom: "calc(4rem + env(safe-area-inset-bottom) + 12px)" }}
    >
      <div className="mx-auto max-w-md rounded-2xl border border-[var(--accent-border)] bg-[var(--panel)] p-3 shadow-[0_8px_30px_rgba(0,0,0,0.18)]">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-soft)]">
            <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth={2.2} style={{ width: 22, height: 22 }} aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v6h6M20 20v-6h-6" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M20 10a8 8 0 0 0-14.9-3M4 14a8 8 0 0 0 14.9 3" />
            </svg>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-[var(--text)]">새 버전이 나왔어요</p>
            <p className="truncate text-xs text-[var(--muted)]">눌러서 바로 최신 버전으로 업데이트하세요</p>
          </div>
          <button
            type="button"
            onClick={handleUpdate}
            disabled={busy}
            className="shrink-0 rounded-xl bg-gradient-to-br from-[var(--accent)] to-[var(--accent-deep)] px-4 py-2.5 text-xs font-bold text-white transition-all active:scale-95 disabled:opacity-60"
          >
            {busy ? "업데이트 중..." : "업데이트"}
          </button>
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
    </div>
  );
}
