"use client";

// 추가 요청 승인 인앱 배너.
//
// 사용자가 보낸 아티스트 추가 요청이 승인(approved)되면, 다음에 앱을 열 때 한 번
// "추가됐어요" 배너를 띄웁니다. 닫으면 그 요청은 다시 뜨지 않습니다(localStorage 기록).
//
// 기존 두 채널의 사각지대를 메우는 능동 알림입니다:
//   - 푸시(/api/notify-request-approved): 알림 권한 허용한 기기만 수신
//   - 설정 > 내 추가 요청: 페이지를 직접 열어야만 확인 가능(수동)
// 이 배너는 푸시를 거부했거나 설정을 안 여는 사용자도 결과를 바로 보게 합니다.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useMyArtistRequests } from "@/lib/artist-requests";

const SEEN_KEY = "indieLive.seenApprovedRequests.v1";

function readSeen(): Set<string> {
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

export default function RequestApprovedBanner() {
  const { requests, ready } = useMyArtistRequests();
  // localStorage는 마운트 후에만 읽어 SSR/하이드레이션 불일치를 피합니다. null = 아직 미확인.
  const [seen, setSeen] = useState<Set<string> | null>(null);

  useEffect(() => {
    setSeen(readSeen());
  }, []);

  // 승인됐지만 아직 안 본 요청 (최신순 정렬은 useMyArtistRequests가 보장)
  const unseen = useMemo(() => {
    if (!ready || !seen) return [];
    return requests.filter((r) => r.status === "approved" && !seen.has(r.id));
  }, [requests, ready, seen]);

  if (unseen.length === 0) return null;

  const primary = unseen[0];
  const name = primary.artistName || (primary.accountName ? `@${primary.accountName}` : "요청하신 아티스트");
  const extra = unseen.length - 1;

  const dismiss = () => {
    const next = new Set(seen ?? []);
    for (const r of unseen) next.add(r.id);
    setSeen(next);
    try {
      localStorage.setItem(SEEN_KEY, JSON.stringify([...next]));
    } catch {
      /* 저장 실패해도 이번 세션 동안은 숨김 유지(state로 제어) */
    }
  };

  return (
    <div
      className="fixed inset-x-0 z-[60] px-4 animate-slide-up"
      style={{ bottom: "calc(4rem + env(safe-area-inset-bottom) + 12px)" }}
    >
      <div className="mx-auto max-w-md rounded-2xl border border-[var(--accent-border)] bg-[var(--panel)] p-3 shadow-[0_8px_30px_rgba(0,0,0,0.18)]">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-soft)] text-lg">
            🎉
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold text-[var(--text)]">
              ‘{name}’{extra > 0 ? ` 외 ${extra}건` : ""} 추가됐어요
            </p>
            <p className="truncate text-xs text-[var(--muted)]">관심 등록하면 새 공연 알림을 받을 수 있어요</p>
          </div>
          <Link
            href="/settings"
            onClick={dismiss}
            className="shrink-0 rounded-xl bg-gradient-to-br from-[var(--accent)] to-[var(--accent-deep)] px-4 py-2.5 text-xs font-bold text-white transition-all active:scale-95"
          >
            보기
          </Link>
          <button
            type="button"
            onClick={dismiss}
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
