"use client";

// 티켓북 탭: 저장한 공연 + 과거 관람 기록 아카이브
// 둘러보기는 로그인 없이 가능하지만, 저장/관람기록 확인은 Google 로그인 시에만 노출합니다.

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { formatSchedule, normalizeDate } from "@/lib/events";
import { useTicketbook, type TicketRecord } from "@/lib/ticketbook";
import { EventListRow } from "./event-cards";

export default function TicketbookView() {
  const { saved, records, syncState, userEmail, linkWithGoogle } = useTicketbook();
  const [tab, setTab] = useState<"upcoming" | "history">("upcoming");
  const [linking, setLinking] = useState(false);

  const handleLink = async () => {
    setLinking(true);
    try {
      const result = await linkWithGoogle();
      alert(result.message);
    } finally {
      setLinking(false);
    }
  };

  // 로그인(Google 연결) 전에는 저장/관람기록을 보여주지 않고 로그인 안내만 표시
  if (syncState !== "linked") {
    return <TicketbookLoginGate onLink={handleLink} linking={linking} />;
  }

  // 통계
  const stats = useMemo(() => {
    const year = new Date().getFullYear();
    const thisYear = records.filter((r) => (r.watchedDate || "").startsWith(String(year))).length;

    const venueCount = new Map<string, number>();
    records.forEach((r) => {
      const v = (r.venueName || "").trim();
      if (v) venueCount.set(v, (venueCount.get(v) || 0) + 1);
    });
    const topVenue = Array.from(venueCount.entries()).sort((a, b) => b[1] - a[1])[0];

    return { total: records.length, thisYear, topVenue };
  }, [records]);

  // 연도-월별 그룹핑
  const grouped = useMemo(() => {
    const groups = new Map<string, TicketRecord[]>();
    for (const record of records) {
      const key = (record.watchedDate || "").slice(0, 7) || "날짜 미상";
      const list = groups.get(key) || [];
      list.push(record);
      groups.set(key, list);
    }
    return Array.from(groups.entries()).sort(([a], [b]) => (a > b ? -1 : 1));
  }, [records]);

  return (
    <>
      {/* ─── 동기화 상태 ─── */}
      <section className="mb-4 animate-fade-in">
        {syncState === "linked" ? (
          <div className="flex items-center justify-between rounded-2xl border border-[var(--line)] bg-[var(--panel)] px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="live-dot" />
              <p className="text-xs text-[var(--text-secondary)]">
                <span className="font-semibold text-[var(--text)]">Google 계정으로 동기화 중</span>
                {userEmail && <span className="ml-1.5 text-[var(--muted)]">{userEmail}</span>}
              </p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3 rounded-2xl border border-[var(--accent-border)] bg-[var(--accent-soft)] px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs leading-relaxed text-[var(--text-secondary)]">
              <span className="font-semibold text-[var(--text)]">기기를 바꿔도 티켓북을 잃지 마세요.</span>
              <br className="sm:hidden" />
              <span className="text-[var(--muted)]"> Google 계정을 연결하면 폰과 PC가 자동 동기화됩니다.</span>
            </p>
            <button
              type="button"
              onClick={handleLink}
              disabled={linking}
              className="primary-btn shrink-0 text-xs disabled:opacity-50"
            >
              {linking ? "연결 중..." : "Google로 연결"}
            </button>
          </div>
        )}
      </section>

      {/* ─── 통계 카드 ─── */}
      <section className="mb-6 grid grid-cols-3 gap-2 animate-fade-in md:gap-3">
        <StatCard label="총 관람" value={`${stats.total}회`} />
        <StatCard label={`${new Date().getFullYear()}년`} value={`${stats.thisYear}회`} />
        <StatCard
          label="최다 방문"
          value={stats.topVenue ? stats.topVenue[0] : "—"}
          sub={stats.topVenue ? `${stats.topVenue[1]}회` : ""}
        />
      </section>

      {/* ─── 탭 ─── */}
      <div className="mb-6 flex items-center gap-1 rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-1">
        <button
          type="button"
          onClick={() => setTab("upcoming")}
          className={`flex h-10 flex-1 items-center justify-center rounded-xl text-sm font-semibold transition-all duration-300 active:scale-95 ${
            tab === "upcoming" ? "bg-[var(--accent)] text-[#0a0a12] shadow-[0_2px_16px_var(--accent-glow)]" : "text-[var(--muted)] hover:text-[var(--text)]"
          }`}
        >
          저장한 공연 {saved.length > 0 && <span className="ml-1.5 tabular-nums">{saved.length}</span>}
        </button>
        <button
          type="button"
          onClick={() => setTab("history")}
          className={`flex h-10 flex-1 items-center justify-center rounded-xl text-sm font-semibold transition-all duration-300 active:scale-95 ${
            tab === "history" ? "bg-[var(--accent)] text-[#0a0a12] shadow-[0_2px_16px_var(--accent-glow)]" : "text-[var(--muted)] hover:text-[var(--text)]"
          }`}
        >
          관람 기록 {records.length > 0 && <span className="ml-1.5 tabular-nums">{records.length}</span>}
        </button>
      </div>

      {/* ─── 저장한 공연 ─── */}
      {tab === "upcoming" && (
        <section className="animate-slide-up">
          {saved.length ? (
            <div className="space-y-3">
              {[...saved]
                .sort((a, b) => (normalizeDate(a.date) < normalizeDate(b.date) ? -1 : 1))
                .map((event, idx) => (
                  <EventListRow key={event.id} event={event} index={idx} showCalendarAdd />
                ))}
            </div>
          ) : (
            <EmptyState
              title="저장한 공연이 없습니다"
              description="공연 목록에서 ☆ 저장을 누르면 여기에 모입니다. 공연이 끝나면 자동으로 관람 기록으로 이동해요."
            />
          )}
        </section>
      )}

      {/* ─── 관람 기록 ─── */}
      {tab === "history" && (
        <section className="animate-slide-up space-y-8">
          {grouped.length ? (
            grouped.map(([month, list]) => (
              <div key={month}>
                <h2 className="mb-3 px-1 text-sm font-bold tabular-nums text-[var(--accent)]">
                  {month === "날짜 미상" ? month : `${month.slice(0, 4)}년 ${Number(month.slice(5, 7))}월`}
                </h2>
                <div className="space-y-3">
                  {list.map((record) => (
                    <RecordCard key={record.id} record={record} />
                  ))}
                </div>
              </div>
            ))
          ) : (
            <EmptyState
              title="아직 관람 기록이 없습니다"
              description="저장한 공연이 끝나면 이곳에 자동으로 기록됩니다. 별점과 한줄평, 셋리스트를 남겨보세요."
            />
          )}
        </section>
      )}
    </>
  );
}

/* ─── 로그인 게이트 (저장/관람기록은 로그인 후에만) ─── */
function TicketbookLoginGate({ onLink, linking }: { onLink: () => void; linking: boolean }) {
  const router = useRouter();
  return (
    <section className="animate-fade-in">
      <div className="rounded-3xl border border-[var(--line)] bg-[var(--panel)] p-8 text-center md:p-10">
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--accent-soft)]">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="text-[var(--accent)]">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 7a2 2 0 012-2h12a2 2 0 012 2v3a2 2 0 100 4v3a2 2 0 01-2 2H6a2 2 0 01-2-2v-3a2 2 0 100-4V7z" />
            <path strokeLinecap="round" d="M13 5v2.5M13 11v2M13 16.5V19" strokeDasharray="0.1 3" />
          </svg>
        </div>

        <h2 className="text-lg font-bold text-[var(--text)]">로그인하고 내 티켓북 보기</h2>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-[var(--muted)]">
          저장한 공연과 관람 기록은 <span className="font-semibold text-[var(--text-secondary)]">Google 로그인</span> 후에 확인할 수 있어요.
          기기를 바꿔도 기록이 그대로 따라옵니다.
        </p>

        <button
          type="button"
          onClick={onLink}
          disabled={linking}
          className="mx-auto mt-6 flex h-12 w-full max-w-xs items-center justify-center gap-2 rounded-2xl bg-gradient-to-br from-[var(--accent)] to-[var(--accent-deep)] px-5 text-sm font-bold text-white transition-all active:scale-[0.98] disabled:opacity-50"
        >
          {linking ? (
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

        <p className="mt-4 text-[11px] text-[var(--faint)]">
          로그인 없이도 공연 둘러보기·검색은 자유롭게 이용할 수 있어요.
        </p>

        <button
          type="button"
          onClick={() => router.push("/")}
          className="mt-5 text-xs font-semibold text-[var(--muted)] underline underline-offset-4 transition-colors hover:text-[var(--text)]"
        >
          공연 둘러보기 →
        </button>
      </div>
    </section>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] px-3 py-4 text-center">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]">{label}</p>
      <p className="mt-1 truncate text-sm font-extrabold text-[var(--text)] md:text-base">{value}</p>
      {sub && <p className="mt-0.5 text-[10px] text-[var(--accent)]">{sub}</p>}
    </div>
  );
}

function EmptyState({ title, description }: { title: string; description: string }) {
  const router = useRouter();
  return (
    <div className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-10 text-center">
      <p className="text-sm font-semibold text-[var(--text)]">{title}</p>
      <p className="mx-auto mt-2 max-w-xs text-xs leading-relaxed text-[var(--muted)]">{description}</p>
      <button type="button" onClick={() => router.push("/")} className="primary-btn mt-6 text-xs">
        공연 둘러보기
      </button>
    </div>
  );
}

/* ─── 관람 기록 카드 (별점/한줄평/셋리스트 메모) ─── */
function RecordCard({ record }: { record: TicketRecord }) {
  const { updateRecord, removeRecord } = useTicketbook();
  const [expanded, setExpanded] = useState(false);
  const [review, setReview] = useState(record.review || "");
  const [setlist, setSetlist] = useState(record.setlist || "");

  const handleDelete = () => {
    if (window.confirm("이 관람 기록을 삭제하시겠습니까?")) {
      removeRecord(record.id);
    }
  };

  return (
    <article className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-4 transition-all duration-300 md:p-5">
      <button type="button" onClick={() => setExpanded(!expanded)} className="block w-full text-left">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-medium text-[var(--muted)]">{formatSchedule(record)}</p>
            <h3 className="mt-1 text-base font-bold leading-snug text-[var(--text)]">{record.title || "제목 없는 공연"}</h3>
            {record.venueName && (
              <p className="mt-1.5 text-xs text-[var(--text-secondary)]">{record.venueName}</p>
            )}
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1.5">
            <StarDisplay rating={record.rating || 0} />
            <span className={`text-[var(--muted)] transition-transform duration-300 ${expanded ? "rotate-180" : ""}`}>⌄</span>
          </div>
        </div>
        {!expanded && record.review && (
          <p className="mt-2 line-clamp-1 text-xs italic text-[var(--text-secondary)]">"{record.review}"</p>
        )}
      </button>

      {expanded && (
        <div className="mt-4 space-y-4 border-t border-[var(--line)] pt-4 animate-fade-in">
          {/* 별점 */}
          <div>
            <p className="mb-2 text-[11px] font-semibold text-[var(--muted)]">별점</p>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onClick={() => updateRecord(record.id, { rating: record.rating === star ? 0 : star })}
                  className={`text-2xl transition-all duration-150 active:scale-75 ${
                    (record.rating || 0) >= star ? "text-[var(--fest-text)]" : "text-[var(--line-strong)] hover:text-[var(--muted)]"
                  }`}
                  aria-label={`별점 ${star}점`}
                >
                  ★
                </button>
              ))}
            </div>
          </div>

          {/* 한줄평 */}
          <div>
            <p className="mb-2 text-[11px] font-semibold text-[var(--muted)]">한줄평</p>
            <input
              value={review}
              onChange={(e) => setReview(e.target.value)}
              onBlur={() => updateRecord(record.id, { review })}
              placeholder="이 공연, 어땠나요?"
              className="w-full rounded-xl border border-[var(--line)] bg-[var(--panel-2)] px-4 py-3 text-xs text-[var(--text)] outline-none transition-colors placeholder:text-[var(--faint)] focus:border-[var(--accent-border)]"
            />
          </div>

          {/* 셋리스트 메모 */}
          <div>
            <p className="mb-2 text-[11px] font-semibold text-[var(--muted)]">셋리스트 메모 (한 줄에 한 곡)</p>
            <textarea
              value={setlist}
              onChange={(e) => setSetlist(e.target.value)}
              onBlur={() => updateRecord(record.id, { setlist })}
              placeholder={"1. 오프닝 곡\n2. ..."}
              className="custom-scrollbar h-28 w-full resize-none rounded-xl border border-[var(--line)] bg-[var(--panel-2)] px-4 py-3 text-xs leading-relaxed text-[var(--text)] outline-none transition-colors placeholder:text-[var(--faint)] focus:border-[var(--accent-border)]"
            />
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleDelete}
              className="rounded-lg px-3 py-1.5 text-[11px] font-semibold text-[var(--faint)] transition-colors hover:bg-red-500/10 hover:text-red-400"
            >
              기록 삭제
            </button>
          </div>
        </div>
      )}
    </article>
  );
}

function StarDisplay({ rating }: { rating: number }) {
  if (!rating) return <span className="text-[10px] text-[var(--muted)]">평가 전</span>;
  return (
    <span className="text-xs text-[var(--fest-text)]">
      {"★".repeat(rating)}
      <span className="text-[var(--line-strong)]">{"★".repeat(5 - rating)}</span>
    </span>
  );
}
