"use client";

// PWA 설치 유도 배너 — 웹사이트(브라우저)에선 "앱 설치" 배너를 띄웁니다.
// 앱(standalone)으로 실행 중이면 띄우지 않습니다(거기선 업데이트 배너만 표시).
//
// 버튼을 누르면 곧바로 네이티브 설치창을 띄웁니다(triggerInstall).
// 단, 시크릿 모드·iOS Safari·Firefox는 브라우저가 PWA 설치(beforeinstallprompt)를
// 지원/허용하지 않아 설치창이 뜨지 않습니다. 이때는 안내 문구만 노출됩니다.
//
// 닫기(X)는 현재 화면에서만 숨기며, 다시 방문/새로고침하면 또 노출됩니다.

import { useEffect, useState } from "react";
import { useInstall } from "./use-install";

export default function InstallPrompt() {
  const { canInstall, standalone, triggerInstall } = useInstall();
  const [dismissed, setDismissed] = useState(false);
  const [note, setNote] = useState("");
  // 마운트 후에만 노출 — standalone 여부는 클라이언트에서만 알 수 있어,
  // 서버/초기 렌더(둘 다 null)와 일치시켜 하이드레이션 불일치를 막습니다.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const handleInstall = async () => {
    const result = await triggerInstall();
    if (result === "accepted") {
      setDismissed(true);
    } else if (result === "unavailable") {
      // 시크릿/iOS/Firefox 등 설치 API 미지원 — 자동 설치 불가 안내
      setNote("이 브라우저에선 자동 설치가 안 돼요. 일반(시크릿 아님) 창에서 열거나, 브라우저 메뉴의 ‘앱 설치/홈 화면에 추가’를 눌러주세요.");
    }
    // dismissed(취소)는 배너 유지 — 다시 누를 수 있게
  };

  // 앱(standalone)에선 숨김. 웹사이트에선 항상 노출.
  if (!mounted || standalone || dismissed) return null;

  return (
    <div
      className="fixed inset-x-0 z-50 px-4 animate-slide-up"
      style={{ bottom: "calc(4rem + env(safe-area-inset-bottom) + 12px)" }}
    >
      <div className="mx-auto max-w-md rounded-2xl border border-[var(--accent-border)] bg-[var(--panel)] p-3 shadow-[0_8px_30px_rgba(0,0,0,0.18)]">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-soft)]">
            <span className="vinyl-disc" style={{ width: 32, height: 32 }} aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-[var(--text)]">앱으로 설치하기</p>
            <p className="truncate text-xs text-[var(--muted)]">홈 화면에 추가하면 앱처럼 빠르게 열려요</p>
          </div>
          <button
            type="button"
            onClick={handleInstall}
            className="shrink-0 rounded-xl bg-gradient-to-br from-[var(--accent)] to-[var(--accent-deep)] px-4 py-2.5 text-xs font-bold text-white transition-all active:scale-95"
          >
            {canInstall ? "설치" : "앱 다운로드"}
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
        {note && (
          <p className="mt-2 rounded-lg bg-[var(--panel-2)] px-3 py-2 text-[11px] leading-relaxed text-[var(--text-secondary)]">
            {note}
          </p>
        )}
      </div>
    </div>
  );
}
