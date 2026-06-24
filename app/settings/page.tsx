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

function PushSection({ favorites }: { favorites: string[] }) {
  const [supported, setSupported] = useState(true);
  const [enabled, setEnabled] = useState(false);
  const [permission, setPermission] = useState<string>("default");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    setSupported(isPushSupported());
    setPermission(getPermission());
    setEnabled(!!getStoredToken());
  }, []);

  const handleToggle = async () => {
    setBusy(true);
    setMessage("");
    try {
      if (enabled) {
        await disablePush();
        setEnabled(false);
        setMessage("알림을 껐습니다.");
      } else {
        const keys = favorites.map(normalizeArtistKey);
        const result = await enablePush(keys);
        setEnabled(!!getStoredToken());
        setPermission(getPermission());
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
            disabled={busy || permission === "denied"}
            onClick={handleToggle}
            className={`relative h-6 w-11 shrink-0 rounded-full p-0.5 transition-colors duration-300 disabled:opacity-50 ${
              enabled ? "bg-[var(--accent)]" : "bg-[var(--panel-3)]"
            }`}
          >
            <span
              className={`block h-5 w-5 rounded-full bg-white shadow transition-transform duration-300 ${
                enabled ? "translate-x-5" : "translate-x-0"
              }`}
            />
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
