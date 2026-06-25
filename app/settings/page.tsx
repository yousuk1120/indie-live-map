"use client";

// 환경설정 화면 — 글자 크기 등 사용자 개인화 설정.
// 설정은 즉시 사이트 전체에 반영되며 localStorage에 저장됩니다.

import { useEffect, useState } from "react";
import PageShell from "../components/page-shell";
import AppHeader from "../components/app-header";
import {
  FONT_SIZE_LABELS,
  useSettings,
  type FontSize,
} from "../contexts/settings-context";
import { useArtistPrefs, normalizeArtistKey } from "@/lib/artist-prefs";
import { useTicketbook } from "@/lib/ticketbook";
import {
  isPushSupported,
  getPermission,
  getStoredToken,
  enablePush,
  disablePush,
} from "@/lib/fcm";

const FONT_SIZE_OPTIONS: { value: FontSize; preview: string }[] = [
  { value: "small", preview: "가" },
  { value: "normal", preview: "가" },
  { value: "large", preview: "가" },
];

export default function SettingsPage() {
  const { fontSize, setFontSize } = useSettings();
  const { favorites, hidden, removeFavorite, removeHidden } = useArtistPrefs();

  return (
    <PageShell>
      <AppHeader
        title="환경설정"
        subtitle="앱을 내 취향에 맞게 조절하세요. 변경 사항은 즉시 적용됩니다."
        showSettings={false}
      />

      <div className="flex flex-col gap-6">
        {/* ─── 계정 (로그인/로그아웃) ─── */}
        <AccountSection />

        {/* ─── 글자 크기 ─── */}
        <section className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-5 md:p-6">
          <div className="mb-1 flex items-center justify-between">
            <h2 className="text-sm font-bold text-[var(--text)]">글자 크기</h2>
            <span className="rounded-md bg-[var(--accent-soft)] px-2 py-0.5 text-[11px] font-semibold text-[var(--accent)]">
              {FONT_SIZE_LABELS[fontSize]}
            </span>
          </div>
          <p className="mb-4 text-xs text-[var(--muted)]">
            목록과 상세 화면의 본문 글자 크기를 조절합니다.
          </p>

          <div
            role="radiogroup"
            aria-label="글자 크기"
            className="grid grid-cols-3 gap-2 rounded-2xl border border-[var(--line)] bg-[var(--panel-2)] p-1.5"
          >
            {FONT_SIZE_OPTIONS.map((option) => {
              const active = fontSize === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setFontSize(option.value)}
                  className={`flex flex-col items-center justify-center gap-1.5 rounded-xl py-3 transition-all duration-200 active:scale-95 ${
                    active
                      ? "bg-[var(--accent)] text-[#0a0a12] shadow-[0_2px_14px_var(--accent-glow)]"
                      : "text-[var(--muted)] hover:bg-[var(--panel-3)] hover:text-[var(--text)]"
                  }`}
                >
                  <span
                    className="font-extrabold leading-none"
                    style={{
                      fontSize:
                        option.value === "small" ? 16 : option.value === "normal" ? 20 : 26,
                    }}
                  >
                    {option.preview}
                  </span>
                  <span className="text-[11px] font-semibold">{FONT_SIZE_LABELS[option.value]}</span>
                </button>
              );
            })}
          </div>

          {/* 실시간 미리보기 */}
          <div className="mt-4 rounded-xl border border-[var(--line)] bg-[var(--bg)] p-4">
            <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-[var(--faint)]">
              미리보기
            </p>
            <p className="text-base font-semibold text-[var(--text)]">실리카겔 단독 공연</p>
            <p className="mt-1 text-sm text-[var(--muted)]">
              롤링홀 · 6월 28일 토 · 오후 7시
            </p>
          </div>
        </section>

        {/* ─── 앱 설치 ─── */}
        <InstallSection />

        {/* ─── 푸시 알림 ─── */}
        <PushSection favorites={favorites} />

        {/* ─── 관심 아티스트 ─── */}
        <ArtistListSection
          title="관심 아티스트"
          description="관심 아티스트의 새 공연이 등록되면 알림을 받고, 홈의 ★ 관심 필터로 모아볼 수 있어요."
          emptyText="아직 관심 아티스트가 없습니다. 공연 상세 화면에서 아티스트를 ★ 관심 등록해보세요."
          names={favorites}
          accent
          onRemove={removeFavorite}
        />

        {/* ─── 숨긴 아티스트 ─── */}
        <ArtistListSection
          title="숨긴 아티스트"
          description="숨긴 아티스트가 출연하는 공연은 홈과 목록에서 보이지 않습니다."
          emptyText="숨긴 아티스트가 없습니다."
          names={hidden}
          onRemove={removeHidden}
        />
      </div>
    </PageShell>
  );
}

function AccountSection() {
  const { syncState, userEmail, linkWithGoogle, signOutUser } = useTicketbook();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const isLinked = syncState === "linked";

  const handleLogin = async () => {
    setBusy(true);
    setMessage("");
    try {
      const result = await linkWithGoogle();
      setMessage(result.message);
    } finally {
      setBusy(false);
    }
  };

  const handleLogout = async () => {
    if (!window.confirm("로그아웃하시겠어요? 이 기기의 기록은 남지만, 다른 기기 동기화는 멈춥니다.")) return;
    setBusy(true);
    setMessage("");
    try {
      const result = await signOutUser();
      setMessage(result.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-5 md:p-6">
      <div className="mb-1 flex items-center justify-between gap-3">
        <h2 className="text-sm font-bold text-[var(--text)]">계정</h2>
        {isLinked && (
          <span className="flex items-center gap-1.5 rounded-md bg-[var(--accent-soft)] px-2 py-0.5 text-[11px] font-semibold text-[var(--accent)]">
            <span className="live-dot" /> 동기화 중
          </span>
        )}
      </div>
      <p className="mb-4 text-xs text-[var(--muted)]">
        Google로 로그인하면 저장한 공연·관람 기록이 클라우드에 저장돼,
        <strong className="text-[var(--text-secondary)]"> 앱을 지웠다 다시 깔거나 기기를 바꿔도</strong> 그대로 복원됩니다.
      </p>

      {isLinked ? (
        <div className="flex flex-col gap-3 rounded-xl border border-[var(--line)] bg-[var(--panel-2)] px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-[var(--text)]">Google 계정으로 로그인됨</p>
            {userEmail && <p className="mt-0.5 truncate text-xs text-[var(--muted)]">{userEmail}</p>}
          </div>
          <button
            type="button"
            onClick={handleLogout}
            disabled={busy}
            className="secondary-btn shrink-0 text-xs disabled:opacity-50"
          >
            {busy ? "처리 중..." : "로그아웃"}
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={handleLogin}
          disabled={busy}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-br from-[var(--accent)] to-[var(--accent-deep)] px-5 text-sm font-bold text-white transition-all active:scale-[0.98] disabled:opacity-50"
        >
          {busy ? (
            "로그인 중..."
          ) : (
            <>
              <svg width="18" height="18" viewBox="0 0 24 24" style={{ width: 18, height: 18 }}>
                <path fill="#fff" d="M21.35 11.1H12v2.92h5.35c-.23 1.5-1.6 4.4-5.35 4.4-3.22 0-5.85-2.66-5.85-5.94S8.78 6.54 12 6.54c1.83 0 3.06.78 3.76 1.45l2.56-2.47C16.7 3.92 14.57 3 12 3 6.92 3 2.8 7.12 2.8 12.2S6.92 21.4 12 21.4c5.84 0 9.7-4.1 9.7-9.88 0-.66-.07-1.16-.16-1.42z" />
              </svg>
              Google로 로그인
            </>
          )}
        </button>
      )}

      {message && (
        <p className="mt-3 rounded-xl border border-[var(--line)] bg-[var(--panel-2)] px-4 py-3 text-xs text-[var(--text-secondary)]">
          {message}
        </p>
      )}
    </section>
  );
}

function InstallSection() {
  const [platform, setPlatform] = useState<"installed" | "ios" | "other">("other");

  useEffect(() => {
    const standalone =
      window.matchMedia?.("(display-mode: standalone)").matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    if (standalone) {
      setPlatform("installed");
      return;
    }
    const ua = navigator.userAgent;
    const isIOS = /iphone|ipad|ipod/i.test(ua);
    setPlatform(isIOS ? "ios" : "other");
  }, []);

  return (
    <section className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-5 md:p-6">
      <h2 className="mb-1 text-sm font-bold text-[var(--text)]">앱으로 설치</h2>
      <p className="mb-3 text-xs text-[var(--muted)]">
        홈 화면에 추가하면 앱처럼 전체화면으로 빠르게 열리고, 푸시 알림도 받을 수 있어요.
      </p>

      {platform === "installed" ? (
        <p className="rounded-xl border border-[var(--accent-border)] bg-[var(--accent-soft)] px-4 py-3 text-xs font-semibold text-[var(--accent-2)]">
          ✓ 이미 앱으로 실행 중입니다.
        </p>
      ) : platform === "ios" ? (
        <ol className="space-y-2 rounded-xl border border-[var(--line)] bg-[var(--panel-2)] px-4 py-3 text-xs text-[var(--text-secondary)]">
          <li>1. Safari 하단의 <strong className="text-[var(--text)]">공유 버튼</strong>(□↑)을 누릅니다.</li>
          <li>2. 메뉴에서 <strong className="text-[var(--text)]">‘홈 화면에 추가’</strong>를 선택합니다.</li>
          <li>3. 우상단 <strong className="text-[var(--text)]">‘추가’</strong>를 누르면 완료!</li>
        </ol>
      ) : (
        <p className="rounded-xl border border-[var(--line)] bg-[var(--panel-2)] px-4 py-3 text-xs text-[var(--text-secondary)]">
          설치 가능 시 하단에 <strong className="text-[var(--text)]">‘앱으로 설치하기’</strong> 배너가 자동으로 떠요.
          안 보이면 브라우저 주소창의 <strong className="text-[var(--text)]">설치 아이콘</strong> 또는
          메뉴 → <strong className="text-[var(--text)]">‘앱 설치’</strong>를 눌러주세요.
        </p>
      )}
    </section>
  );
}

function PushSection({ favorites }: { favorites: string[] }) {
  const [supported, setSupported] = useState(true);
  const [enabled, setEnabled] = useState(false);
  const [permission, setPermission] = useState<string>("default");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    setSupported(isPushSupported());
    const perm = getPermission();
    setPermission(perm);
    // 권한이 허용 상태이고 토큰이 있을 때만 '켜짐'으로 — 상태 불일치(나갔다 오면 바뀜) 방지
    setEnabled(!!getStoredToken() && perm === "granted");
  }, []);

  const handleToggle = async () => {
    if (busy) return; // 처리 중 중복 클릭 방지 (랙·깜빡임 방지)
    setBusy(true);
    try {
      if (enabled) {
        setMessage("알림을 끄는 중...");
        await disablePush();
        setEnabled(false);
        setMessage("알림을 껐습니다.");
      } else {
        setMessage("알림을 설정하는 중... (권한 허용을 눌러주세요)");
        const keys = favorites.map(normalizeArtistKey);
        const result = await enablePush(keys);
        const nowPerm = getPermission();
        setPermission(nowPerm);
        setEnabled(!!getStoredToken() && nowPerm === "granted");
        setMessage(result.message);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-5 md:p-6">
      <div className="mb-1 flex items-center justify-between gap-3">
        <h2 className="text-sm font-bold text-[var(--text)]">새 공연 알림</h2>
        {supported ? (
          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            aria-busy={busy}
            disabled={busy || permission === "denied"}
            onClick={handleToggle}
            className={`relative h-6 w-11 shrink-0 rounded-full p-0.5 transition-colors duration-300 disabled:cursor-wait ${
              enabled ? "bg-[var(--accent)]" : "bg-[var(--panel-3)]"
            }`}
          >
            <span
              className={`flex h-5 w-5 items-center justify-center rounded-full bg-white shadow transition-transform duration-300 ${
                enabled ? "translate-x-5" : "translate-x-0"
              }`}
            >
              {busy && (
                <span className="h-3 w-3 animate-spin rounded-full border-2 border-[var(--panel-3)] border-t-[var(--accent)]" />
              )}
            </span>
          </button>
        ) : null}
      </div>
      <p className="mb-3 text-xs text-[var(--muted)]">
        관심 아티스트의 새 공연이 등록되면 브라우저 푸시 알림으로 알려드립니다.
      </p>

      {!supported && (
        <p className="rounded-xl border border-[var(--line)] bg-[var(--panel-2)] px-4 py-3 text-xs text-[var(--muted)]">
          이 브라우저/기기는 웹 푸시를 지원하지 않습니다. <br />
          iPhone은 Safari에서 <strong className="text-[var(--text-secondary)]">공유 → 홈 화면에 추가</strong> 후 앱처럼 열면 알림을 받을 수 있어요.
        </p>
      )}

      {supported && permission === "denied" && (
        <p className="rounded-xl border border-[var(--danger)]/30 bg-[var(--danger)]/5 px-4 py-3 text-xs text-[var(--danger)]">
          알림이 차단되어 있습니다. 브라우저 주소창의 자물쇠 → 알림 허용으로 변경한 뒤 다시 시도해주세요.
        </p>
      )}

      {message && (
        <p className="mt-1 rounded-xl border border-[var(--line)] bg-[var(--panel-2)] px-4 py-3 text-xs text-[var(--text-secondary)]">
          {message}
        </p>
      )}

      {supported && enabled && favorites.length === 0 && (
        <p className="mt-3 text-[11px] text-[var(--muted)]">
          아직 관심 아티스트가 없어요. 공연 상세에서 ★ 관심 등록을 하면 그 아티스트의 새 공연 알림을 받습니다.
        </p>
      )}
    </section>
  );
}

function ArtistListSection({
  title,
  description,
  emptyText,
  names,
  accent = false,
  onRemove,
}: {
  title: string;
  description: string;
  emptyText: string;
  names: string[];
  accent?: boolean;
  onRemove: (name: string) => void;
}) {
  return (
    <section className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-5 md:p-6">
      <div className="mb-1 flex items-center justify-between">
        <h2 className="text-sm font-bold text-[var(--text)]">{title}</h2>
        <span
          className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${
            accent ? "bg-[var(--accent-soft)] text-[var(--accent)]" : "bg-[var(--panel-2)] text-[var(--muted)]"
          }`}
        >
          {names.length}
        </span>
      </div>
      <p className="mb-4 text-xs text-[var(--muted)]">{description}</p>

      {names.length === 0 ? (
        <p className="rounded-xl border border-dashed border-[var(--line)] bg-[var(--panel-2)] px-4 py-5 text-center text-xs text-[var(--muted)]">
          {emptyText}
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {names.map((name) => (
            <span
              key={name}
              className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold ${
                accent
                  ? "border-[var(--accent-border)] bg-[var(--accent-soft)] text-[var(--accent-2)]"
                  : "border-[var(--line)] bg-[var(--panel-2)] text-[var(--text-secondary)]"
              }`}
            >
              {name}
              <button
                type="button"
                onClick={() => onRemove(name)}
                aria-label={`${name} 제거`}
                className="flex h-4 w-4 items-center justify-center rounded-full text-current opacity-60 transition-opacity hover:opacity-100"
              >
                <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} style={{ width: 11, height: 11 }}>
                  <path strokeLinecap="round" d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </span>
          ))}
        </div>
      )}
    </section>
  );
}
