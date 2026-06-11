"use client";

// 티켓북 탭: 저장한 공연 + 과거 관람 기록 아카이브 (기기 로컬 저장, 로그인 불필요)

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
                <span className="font-semibold text-white">Google 계정으로 동기화 중</span>
                {userEmail && <span className="ml-1.5 text-[var(--muted)]">{userEmail}</span>}
              </p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3 rounded-2xl border border-[var(--accent-border)] bg-[var(--accent-soft)] px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs leading-relaxed text-[var(--text-secondary)]">
              <span className="font-semibold text-white">기기를 바꿔도 티켓북을 잃지 마세요.</span>
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
            tab === "upcoming" ? "bg-[var(--accent)] text-[#0a0a12] shadow-[0_2px_16px_var(--accent-glow)]" : "text-[var(--muted)] hover:text-white"
          }`}
        >
          저장한 공연 {saved.length > 0 && <span className="ml-1.5 tabular-nums">{saved.length}</span>}
        </button>
        <button
          type="button"
          onClick={() => setTab("history")}
          className={`flex h-10 flex-1 items-center justify-center rounded-xl text-sm font-semibold transition-all duration-300 active:scale-95 ${
            tab === "history" ? "bg-[var(--accent)] text-[#0a0a12] shadow-[0_2px_16px_var(--accent-glow)]" : "text-[var(--muted)] hover:text-white"
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

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] px-3 py-4 text-center">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]">{label}</p>
      <p className="mt-1 truncate text-sm font-extrabold text-white md:text-base">{value}</p>
      {sub && <p className="mt-0.5 text-[10px] text-[var(--accent)]">{sub}</p>}
    </div>
  );
}

function EmptyState({ title, description }: { title: string; description: string }) {
  const router = useRouter();
  return (
    <div className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-10 text-center">
      <p className="text-sm font-semibold text-white">{title}</p>
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
            <h3 className="mt-1 text-base font-bold leading-snug text-white">{record.title || "제목 없는 공연"}</h3>
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
                    (record.rating || 0) >= star ? "text-[var(--fest-text)]" : "text-white/15 hover:text-white/40"
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
              className="w-full rounded-xl border border-[var(--line)] bg-white/5 px-4 py-3 text-xs text-white outline-none transition-colors placeholder:text-white/20 focus:border-[var(--accent-border)]"
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
              className="custom-scrollbar h-28 w-full resize-none rounded-xl border border-[var(--line)] bg-white/5 px-4 py-3 text-xs leading-relaxed text-white outline-none transition-colors placeholder:text-white/20 focus:border-[var(--accent-border)]"
            />
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleDelete}
              className="rounded-lg px-3 py-1.5 text-[11px] font-semibold text-white/30 transition-colors hover:bg-red-500/10 hover:text-red-400"
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
      <span className="text-white/15">{"★".repeat(5 - rating)}</span>
    </span>
  );
}
