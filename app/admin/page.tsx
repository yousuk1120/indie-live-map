"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, query, serverTimestamp, where, getDocs } from "firebase/firestore";
import { auth } from "@/lib/firebase/auth";
import { db } from "@/lib/firebase/firestore";
import {
  type ConcertRecord,
  type DayLineup,
  hasMinimumEventInfo,
  isSameConcert,
  mergeConcerts,
  normalizeDateString,
  extractDateRange,
} from "@/lib/event-merge";
import { canonicalVenueName } from "@/lib/venues";

type EventItem = {
  id: string;
  title?: string;
  date?: string;
  endDate?: string;
  time?: string;
  venueName?: string;
  artistNames?: string;
  sourceUrl?: string;
  instagramUrl?: string;
  price?: string;
  posterUrl?: string;
  timetableImageUrl?: string;
  dayLineups?: DayLineup[];
};

function adminToText(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(adminToText).filter(Boolean).join(", ");
  if (typeof value === "object") return Object.values(value as Record<string, unknown>).map(adminToText).filter(Boolean).join(", ");
  return "";
}

function adminNormalizeDate(value?: string) {
  const raw = adminToText(value);
  if (!raw) return "";
  const match = raw.match(/(\d{2,4})[./-](\d{1,2})[./-](\d{1,2})/);
  if (!match) return "";
  const [, y, m, d] = match;
  const year = y.length === 2 ? `20${y}` : y;
  return `${year}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

function adminEventTimestamp(item: EventItem) {
  const date = adminNormalizeDate(item.date);
  if (!date) return Number.POSITIVE_INFINITY;
  const time = adminToText(item.time) || "23:59";
  const parsed = new Date(`${date}T${time}`);
  return Number.isNaN(parsed.getTime()) ? Number.POSITIVE_INFINITY : parsed.getTime();
}

function isKoreanAdminEvent(item: EventItem) {
  const text = [item.title, item.venueName, item.artistNames, item.sourceUrl, item.instagramUrl]
    .map(adminToText)
    .join(" ");

  const foreignPattern =
    /도쿄|오사카|교토|시부야|신주쿠|시모키타|나고야|후쿠오카|삿포로|Tokyo|Osaka|Kyoto|Shibuya|Shinjuku|Shimokitazawa|Nagoya|Fukuoka|Sapporo|Japan|日本|東京|大阪|京都|渋谷|新宿|下北沢|名古屋|福岡|札幌|Taiwan|Taipei|Bangkok|Shanghai|Beijing|Hong Kong|Singapore|New York|London|Berlin|Paris|LA|Los Angeles|Brooklyn|Chicago|Toronto|Sydney|Melbourne|Manila|Jakarta|Vietnam|Hanoi|Ho Chi Minh|Thailand|China|Philippines|Indonesia|Malaysia|USA|UK|Europe|Cotoba|COTOBA/i;

  return !foreignPattern.test(text);
}

function adminIsPastDate(dateStr?: string): boolean {
  if (!dateStr) return false;
  const normalized = adminNormalizeDate(dateStr);
  if (!normalized) return false;
  const eventEnd = new Date(`${normalized}T23:59:59`).getTime();
  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);
  return eventEnd <= endOfToday.getTime();
}

// 중복 판정/병합 로직은 lib/event-merge.ts 공용 모듈을 사용합니다.

// 비용 발생 API(parse-event, fetch-insta) 호출용 인증 헤더
async function adminApiHeaders(): Promise<Record<string, string>> {
  const token = await auth.currentUser?.getIdToken();
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

function isExpiredAdminEvent(item: EventItem) {
  const date = adminNormalizeDate(item.date);
  if (!date) return false;

  // 멀티데이 공연은 종료일 기준 (진행 중인 페스티벌이 삭제되지 않도록)
  const endDate = adminNormalizeDate(item.endDate) || date;
  const eventEnd = new Date(`${endDate}T23:59:59`).getTime();
  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);

  return eventEnd <= endOfToday.getTime();
}

type SourceAccount = {
  id: string;
  accountName: string;
  category: "공연장" | "밴드" | "기획사";
  isActive: boolean;
};

type CandidateEvent = {
  id: string;
  rawPostId?: string;
  instaLink: string;
  caption: string;
  posterUrl: string;
  parsedTitle?: string;
  parsedDate?: string;
  parsedEndDate?: string;
  parsedTime?: string;
  parsedVenue?: string;
  parsedArtists?: string;
  parsedTicket?: string;
  parsedPrice?: string;
  parsedDayLineups?: DayLineup[];
};

export default function AdminPage() {
  const router = useRouter();
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [activeTab, setActiveTab] = useState<"events" | "sources" | "candidates">("events");

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (!user) router.push("/login");
      else setLoadingAuth(false);
    });
    return () => unsubscribe();
  }, [router]);

  const handleLogout = async () => {
    await signOut(auth);
    router.push("/login");
  };

  // onAuthStateChanged 판정 전에는 관리자 UI를 절대 렌더하지 않습니다 (깜빡임 방지).
  if (loadingAuth) {
    return (
      <div className="min-h-screen bg-[var(--bg)] text-white flex items-center justify-center">
        <div className="flex flex-col items-center gap-5 animate-fade-in">
          <div className="auth-spinner" />
          <div className="text-center">
            <p className="text-sm font-semibold text-white">관리자 인증 확인 중</p>
            <p className="mt-1 text-xs text-[var(--muted)]">잠시만 기다려주세요...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen overflow-x-clip bg-[var(--bg)] text-[var(--text-secondary)] font-sans">
      <div aria-hidden className="bg-aurora" />

      <div className="relative max-w-[1400px] mx-auto p-4 md:p-8">
        {/* ─── Top Bar ─── */}
        <div className="flex items-center justify-between mb-8">
          <Link href="/" className="text-xs text-[var(--muted)] hover:text-white transition-colors duration-200">
            ← 라이브클럽맵
          </Link>
          <button
            onClick={handleLogout}
            className="text-xs text-[var(--muted)] hover:text-white transition-all duration-200 px-4 py-2 rounded-lg border border-[var(--line)] hover:border-[var(--accent-border)] active:scale-95"
          >
            로그아웃
          </button>
        </div>

        {/* ─── Header ─── */}
        <header className="mb-10 pb-6 border-b border-[var(--line)] animate-fade-in">
          <p className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.28em] text-[var(--accent)]">
            <span className="live-dot" />
            Control Center
          </p>
          <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight text-white">Admin</h1>
          <p className="text-[var(--muted)] text-xs mt-1.5">라이브클럽맵 인벤토리 및 자동화 파이프라인 관리</p>
        </header>

        {/* ─── Tabs ─── */}
        <div className="flex flex-wrap gap-1 mb-8 p-1 bg-[var(--panel)] rounded-2xl w-fit border border-[var(--line)]">
          <TabButton active={activeTab === "events"} onClick={() => setActiveTab("events")} label="공연 일정" />
          <TabButton active={activeTab === "sources"} onClick={() => setActiveTab("sources")} label="수집 타겟" />
          <TabButton active={activeTab === "candidates"} onClick={() => setActiveTab("candidates")} label="승인 대기" />
        </div>

        {/* ─── Tab Content ─── */}
        <main>
          {activeTab === "events" && <EventsTab />}
          {activeTab === "sources" && <SourcesTab />}
          {activeTab === "candidates" && <CandidatesTab />}
        </main>
      </div>
    </div>
  );
}

function TabButton({ active, onClick, label }: { active: boolean, onClick: () => void, label: string }) {
  return (
    <button
      onClick={onClick}
      className={`px-5 py-2.5 rounded-xl text-xs font-semibold transition-all duration-300 active:scale-95 ${active
        ? "bg-[var(--accent)] text-[#0a0a12] shadow-[0_2px_16px_var(--accent-glow)]"
        : "text-[var(--muted)] hover:text-white hover:bg-white/5"
        }`}
    >
      {label}
    </button>
  );
}

// ──────────────────────────────────────────────────
// [Tab 1] EventsTab — onSnapshot 유지 + 낙관적 업데이트(Optimistic UI)
// ──────────────────────────────────────────────────
function EventsTab() {
  const [events, setEvents] = useState<EventItem[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [time, setTime] = useState("");
  const [venueName, setVenueName] = useState("");
  const [artistNames, setArtistNames] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [instagramUrl, setInstagramUrl] = useState("");
  const [price, setPrice] = useState("");
  const [timetableImageUrl, setTimetableImageUrl] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDedupRunning, setIsDedupRunning] = useState(false);
  const [analyzingId, setAnalyzingId] = useState<string | null>(null);

  // Optimistic UI 상태: 서버 확정 전 즉시 화면에 반영하고, 실패 시 롤백합니다.
  const [pendingDeleteIds, setPendingDeleteIds] = useState<Set<string>>(new Set());
  const [optimisticEdits, setOptimisticEdits] = useState<Record<string, Partial<EventItem>>>({});

  // 주의: 지난 공연은 더 이상 삭제하지 않습니다 (유저 티켓북의 과거 관람 기록 보존).
  // 해외 공연 등 노이즈 데이터만 정리합니다.
  useEffect(() => {
    const cleanupForeign = async () => {
      const snapshot = await getDocs(query(collection(db, "events")));
      for (const docSnap of snapshot.docs) {
        const item = { id: docSnap.id, ...docSnap.data() } as EventItem;
        if (!isKoreanAdminEvent(item)) {
          await deleteDoc(doc(db, "events", docSnap.id));
        }
      }
    };

    cleanupForeign();
  }, []);

  useEffect(() => {
    const q = query(collection(db, "events"));
    return onSnapshot(q, (snapshot) => {
      const items = snapshot.docs
        .map((d) => ({ id: d.id, ...d.data() } as EventItem))
        .filter((item) => !isExpiredAdminEvent(item))
        .filter((item) => isKoreanAdminEvent(item))
        .sort((a, b) => adminEventTimestamp(a) - adminEventTimestamp(b));

      setEvents(items);
    });
  }, []);

  // 화면에 보여줄 목록: 삭제 대기 항목 제외 + 수정 대기 내용 병합
  const displayedEvents = useMemo(
    () =>
      events
        .filter((ev) => !pendingDeleteIds.has(ev.id))
        .map((ev) => (optimisticEdits[ev.id] ? { ...ev, ...optimisticEdits[ev.id] } : ev)),
    [events, pendingDeleteIds, optimisticEdits]
  );

  const handleEditClick = (item: EventItem) => {
    setEditingId(item.id);
    setTitle(item.title || "");
    setDate(item.date || "");
    setEndDate(item.endDate || "");
    setTime(item.time || "");
    setVenueName(item.venueName || "");
    setArtistNames(item.artistNames || "");
    setSourceUrl(item.sourceUrl || "");
    setInstagramUrl(item.instagramUrl || "");
    setPrice(item.price || "");
    setTimetableImageUrl(item.timetableImageUrl || "");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setTitle(""); setDate(""); setEndDate(""); setTime(""); setVenueName("");
    setArtistNames(""); setSourceUrl(""); setInstagramUrl(""); setPrice("");
    setTimetableImageUrl("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    setIsSubmitting(true);
    try {
      if (editingId) {
        const id = editingId;
        const payload = { title, date, endDate, time, venueName, artistNames, sourceUrl, instagramUrl, price, timetableImageUrl };

        // 낙관적 업데이트: 서버 응답을 기다리지 않고 즉시 화면에 반영
        setOptimisticEdits((prev) => ({ ...prev, [id]: payload }));
        handleCancelEdit();

        try {
          await updateDoc(doc(db, "events", id), payload);
        } catch (error) {
          console.error("수정 실패:", error);
          alert("수정에 실패했습니다. 변경 사항이 되돌려집니다.");
        } finally {
          // 성공 시 onSnapshot이 서버 데이터를 반영하므로 임시 상태 제거,
          // 실패 시 임시 상태 제거로 원래 데이터로 롤백됩니다.
          setOptimisticEdits((prev) => {
            const next = { ...prev };
            delete next[id];
            return next;
          });
        }
      } else {
        await addDoc(collection(db, "events"), {
          title, date, endDate, time, venueName, artistNames, sourceUrl, instagramUrl, price, timetableImageUrl,
          createdAt: serverTimestamp(),
        });
        handleCancelEdit();
      }
    } catch (error) {
      console.error(error);
      alert("저장에 실패했습니다. 다시 시도해주세요.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("공연을 완전 삭제하시겠습니까?")) return;
    if (editingId === id) handleCancelEdit();

    // 낙관적 삭제: 목록에서 즉시 숨김
    setPendingDeleteIds((prev) => new Set(prev).add(id));
    try {
      await deleteDoc(doc(db, "events", id));
    } catch (error) {
      console.error("삭제 실패:", error);
      alert("삭제에 실패했습니다. 항목이 복원됩니다.");
    } finally {
      // 성공 시 onSnapshot이 이미 항목을 제거했고, 실패 시 항목이 다시 표시됩니다.
      setPendingDeleteIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  // AI 라인업 분석: 포스터 이미지(비전) + 캡션으로 날짜별 라인업/종료일 추출 → 문서 업데이트
  const handleAnalyzeLineup = async (id: string) => {
    setAnalyzingId(id);
    try {
      const res = await fetch("/api/analyze-lineup", {
        method: "POST",
        headers: await adminApiHeaders(),
        body: JSON.stringify({ eventId: id }),
      });
      const data = await res.json();
      alert(data.message || data.error || "분석이 끝났습니다.");
    } catch (error) {
      console.error("라인업 분석 실패:", error);
      alert("라인업 분석 요청에 실패했습니다.");
    } finally {
      setAnalyzingId(null);
    }
  };

  // 중복 정리 유틸리티 — 같은 공연을 찾아 하나로 "병합"합니다 (한국어 제목 우선, 정보 합집합).
  const handleDedup = async () => {
    if (!window.confirm("같은 공연(한/영 표기, 라인업 겹침 포함)을 자동으로 하나로 병합합니다.\n한국어 제목이 우선되며 라인업·가격 등 정보는 합쳐집니다.\n\n진행하시겠습니까?")) return;

    setIsDedupRunning(true);
    try {
      const snapshot = await getDocs(collection(db, "events"));
      const allEvents = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as EventItem));

      // 같은 공연끼리 그룹핑 (공용 isSameConcert 판정 사용)
      const groups: EventItem[][] = [];
      for (const ev of allEvents) {
        const group = groups.find((g) => g.some((member) => isSameConcert(member, ev)));
        if (group) group.push(ev);
        else groups.push([ev]);
      }

      let mergedGroupCount = 0;
      let deletedCount = 0;

      for (const group of groups) {
        if (group.length <= 1) continue;

        // 그룹 전체를 하나로 병합한 뒤, 첫 문서에 병합 결과 저장 + 나머지 삭제
        let merged: ConcertRecord = { ...group[0] };
        for (let i = 1; i < group.length; i++) {
          merged = { ...merged, ...mergeConcerts(merged, group[i]) };
        }

        const keepId = group[0].id;
        const { id: _id, ...mergedFields } = merged;
        await updateDoc(doc(db, "events", keepId), { ...mergedFields });

        for (let i = 1; i < group.length; i++) {
          await deleteDoc(doc(db, "events", group[i].id));
          deletedCount++;
        }
        mergedGroupCount++;
      }

      alert(`중복 정리 완료: ${mergedGroupCount}개 공연으로 병합, 중복 문서 ${deletedCount}개 삭제.`);
    } catch (error) {
      console.error(error);
      alert("중복 정리 중 오류가 발생했습니다.");
    } finally {
      setIsDedupRunning(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8">
      {/* ─── Form Panel ─── */}
      <div className="lg:col-span-4 flex flex-col gap-4 self-start lg:sticky lg:top-8 max-h-[calc(100vh-4rem)] overflow-y-auto custom-scrollbar">
        <div className="bg-[var(--panel)] border border-[var(--line)] rounded-2xl p-6 relative">
          <div className={`absolute top-0 inset-x-0 h-px ${editingId ? "bg-[var(--accent)]" : "bg-white/10"}`} />

          <h2 className="text-sm font-semibold mb-6 text-white flex items-center gap-2">
            <span className={`w-1.5 h-1.5 rounded-full ${editingId ? "bg-[var(--accent)]" : "bg-white/40"}`} />
            {editingId ? "수정하기" : "새 공연 등록"}
          </h2>

          <form onSubmit={handleSubmit} className="space-y-3">
            <Input label="공연 제목" value={title} onChange={setTitle} required />
            <div className="grid grid-cols-2 gap-3">
              <Input label="날짜" placeholder="YYYY-MM-DD" value={date} onChange={setDate} />
              <Input label="시간" placeholder="19:00" value={time} onChange={setTime} />
            </div>
            <Input label="종료 날짜 (멀티데이만, 선택)" placeholder="YYYY-MM-DD" value={endDate} onChange={setEndDate} />
            <Input label="장소명" value={venueName} onChange={setVenueName} />
            <div className="grid grid-cols-2 gap-3">
              <Input label="아티스트" value={artistNames} onChange={setArtistNames} />
              <Input label="티켓 가격" value={price} onChange={setPrice} />
            </div>
            <Input label="예매 링크" value={sourceUrl} onChange={setSourceUrl} />
            <Input label="인스타그램 링크" value={instagramUrl} onChange={setInstagramUrl} />
            <Input label="타임테이블 이미지 URL (페스티벌, 선택)" value={timetableImageUrl} onChange={setTimetableImageUrl} />

            <div className="flex gap-3 pt-3">
              <button
                disabled={isSubmitting}
                className="flex-1 py-3 rounded-xl font-semibold text-sm transition-all duration-300 bg-gradient-to-br from-[var(--accent)] to-[var(--accent-deep)] text-[#0a0a12] hover:brightness-110 hover:shadow-[0_4px_20px_var(--accent-glow)] active:scale-[0.98] disabled:opacity-50"
              >
                {editingId ? "저장" : "추가"}
              </button>

              {editingId && (
                <button
                  type="button"
                  onClick={handleCancelEdit}
                  disabled={isSubmitting}
                  className="px-5 border border-[var(--line-strong)] text-[var(--muted)] hover:text-white hover:border-[var(--accent-border)] rounded-xl text-sm font-medium transition-all duration-200 active:scale-95"
                >
                  취소
                </button>
              )}
            </div>
          </form>
        </div>
      </div>

      {/* ─── Event List ─── */}
      <div className="lg:col-span-8 flex flex-col gap-4">
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-white">등록된 공연</h2>
            <span className="text-[10px] font-bold bg-[var(--accent-soft)] text-[var(--accent)] px-2 py-1 rounded-md tabular-nums">
              {displayedEvents.length}
            </span>
          </div>
          <button
            onClick={handleDedup}
            disabled={isDedupRunning}
            className="text-[11px] font-semibold text-[var(--muted)] hover:text-white px-3 py-1.5 rounded-lg border border-[var(--line)] hover:border-[var(--accent-border)] transition-all duration-200 active:scale-95 disabled:opacity-50"
          >
            {isDedupRunning ? "정리 중..." : "🧹 중복 정리"}
          </button>
        </div>

        {displayedEvents.length === 0 ? (
          <div className="bg-[var(--panel)] border border-[var(--line)] rounded-2xl p-16 text-center">
            <p className="text-[var(--muted)] text-sm">표시할 공연이 없습니다.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {displayedEvents.map((ev) => (
              <div
                key={ev.id}
                className={`bg-[var(--panel)] border ${editingId === ev.id ? "border-[var(--accent-border)]" : "border-[var(--line)]"
                  } rounded-2xl p-5 transition-all hover-card flex flex-col`}
              >
                <div className="flex-1">
                  <h3 className="font-semibold text-white mb-4 line-clamp-2 leading-snug">{ev.title}</h3>
                  <div className="space-y-2 text-xs text-[var(--muted)]">
                    {ev.date && (
                      <p className="flex gap-3">
                        <span className="text-white/20 font-medium shrink-0 w-8">일시</span>
                        <span className="text-[var(--text-secondary)]">
                          {ev.date}{ev.endDate ? ` ~ ${ev.endDate}` : ""} {ev.time}
                        </span>
                      </p>
                    )}
                    {ev.venueName && (
                      <p className="flex gap-3">
                        <span className="text-white/20 font-medium shrink-0 w-8">장소</span>
                        <span className="text-[var(--text-secondary)]">{ev.venueName}</span>
                      </p>
                    )}
                    {ev.artistNames && (
                      <p className="flex gap-3">
                        <span className="text-white/20 font-medium shrink-0 w-8">출연</span>
                        <span className="text-[var(--text-secondary)] line-clamp-2">{ev.artistNames}</span>
                      </p>
                    )}
                    {ev.price && (
                      <p className="flex gap-3">
                        <span className="text-white/20 font-medium shrink-0 w-8">가격</span>
                        <span className="text-white font-semibold">{ev.price}</span>
                      </p>
                    )}
                    {ev.instagramUrl && (
                      <a
                        href={ev.instagramUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-block mt-2 text-[11px] font-medium text-[var(--muted)] hover:text-[var(--accent)] underline underline-offset-4 decoration-white/10 transition-colors"
                      >
                        인스타그램 ↗
                      </a>
                    )}
                  </div>
                </div>

                <div className="mt-5 flex gap-2 pt-3 border-t border-[var(--line)]">
                  <button
                    onClick={() => handleAnalyzeLineup(ev.id)}
                    disabled={analyzingId === ev.id}
                    title="포스터 이미지를 AI로 분석해 날짜별 라인업과 종료일을 채웁니다 (페스티벌용)"
                    className="flex-1 bg-white/5 hover:bg-[var(--accent-soft)] text-[var(--muted)] hover:text-[var(--accent)] py-2.5 rounded-xl text-[11px] font-semibold transition-all duration-200 active:scale-95 disabled:opacity-50"
                  >
                    {analyzingId === ev.id ? "분석 중..." : "라인업 분석"}
                  </button>
                  <button
                    onClick={() => handleEditClick(ev)}
                    className="flex-1 bg-white/5 hover:bg-[var(--accent-soft)] text-[var(--muted)] hover:text-[var(--accent)] py-2.5 rounded-xl text-[11px] font-semibold transition-all duration-200 active:scale-95"
                  >
                    수정
                  </button>
                  <button
                    onClick={() => handleDelete(ev.id)}
                    className="flex-1 bg-white/5 hover:bg-red-500/10 text-white/30 hover:text-red-400 py-2.5 rounded-xl text-[11px] font-semibold transition-all duration-200 active:scale-95"
                  >
                    삭제
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────
// [Tab 2] SourcesTab — onSnapshot 유지 + 낙관적 토글/삭제
// ──────────────────────────────────────────────────
function SourcesTab() {
  const [sources, setSources] = useState<SourceAccount[]>([]);
  const [accountName, setAccountName] = useState("");
  const [category, setCategory] = useState("공연장");
  const [isActive, setIsActive] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Optimistic UI 상태
  const [pendingDeleteIds, setPendingDeleteIds] = useState<Set<string>>(new Set());
  const [optimisticActive, setOptimisticActive] = useState<Record<string, boolean>>({});

  useEffect(() => {
    return onSnapshot(query(collection(db, "source_accounts")), snap =>
      setSources(snap.docs.map(d => ({ id: d.id, ...d.data() } as SourceAccount)))
    );
  }, []);

  const displayedSources = useMemo(
    () =>
      sources
        .filter((s) => !pendingDeleteIds.has(s.id))
        .map((s) => (s.id in optimisticActive ? { ...s, isActive: optimisticActive[s.id] } : s)),
    [sources, pendingDeleteIds, optimisticActive]
  );

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accountName.trim()) return;
    setIsSubmitting(true);
    try {
      await addDoc(collection(db, "source_accounts"), { accountName: accountName.trim(), category, isActive, createdAt: serverTimestamp() });
      setAccountName(""); setCategory("공연장"); setIsActive(true);
    } catch (err) {
      console.error(err);
      alert("타겟 추가에 실패했습니다.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggle = async (id: string, cur: boolean) => {
    // 낙관적 토글: 즉시 화면에 반영
    setOptimisticActive((prev) => ({ ...prev, [id]: !cur }));
    try {
      await updateDoc(doc(db, "source_accounts", id), { isActive: !cur });
    } catch (err) {
      console.error("토글 실패:", err);
      alert("상태 변경에 실패했습니다.");
    } finally {
      setOptimisticActive((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    }
  };

  const del = async (id: string) => {
    if (!window.confirm("삭제하시겠습니까?")) return;

    // 낙관적 삭제: 즉시 화면에서 숨김
    setPendingDeleteIds((prev) => new Set(prev).add(id));
    try {
      await deleteDoc(doc(db, "source_accounts", id));
    } catch (err) {
      console.error("삭제 실패:", err);
      alert("삭제에 실패했습니다. 항목이 복원됩니다.");
    } finally {
      setPendingDeleteIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8">
      <div className="lg:col-span-4 flex flex-col gap-4 self-start lg:sticky lg:top-8 max-h-[calc(100vh-4rem)] overflow-y-auto custom-scrollbar">
        <div className="bg-[var(--panel)] border border-[var(--line)] rounded-2xl p-6 relative">
          <div className="absolute top-0 inset-x-0 h-px bg-white/10" />
          <h2 className="text-sm font-semibold mb-6 text-white flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-white/40" />
            타겟 추가
          </h2>
          <form onSubmit={handleAdd} className="space-y-3">
            <Input label="인스타그램 아이디" value={accountName} onChange={setAccountName} required placeholder="rollinghall" />
            <div>
              <label className="block text-[11px] font-medium text-[var(--muted)] mb-1.5 pl-0.5">분류</label>
              <select value={category} onChange={e => setCategory(e.target.value)} className="w-full bg-white/5 border border-[var(--line)] focus:border-[var(--accent-border)] rounded-xl px-4 py-3 text-xs text-white outline-none appearance-none transition-colors">
                <option value="공연장" className="bg-black">공연장</option>
                <option value="밴드" className="bg-black">밴드</option>
                <option value="기획사" className="bg-black">기획사</option>
              </select>
            </div>
            <div
              className="flex items-center justify-between p-4 bg-white/[0.03] rounded-xl cursor-pointer hover:bg-white/[0.05] transition"
              onClick={() => setIsActive(!isActive)}
            >
              <span className="text-xs font-medium text-[var(--text-secondary)]">자동 수집 활성화</span>
              <div className={`w-9 h-5 rounded-full p-0.5 transition-colors duration-300 ${isActive ? 'bg-[var(--accent)]' : 'bg-white/10'}`}>
                <div className={`w-4 h-4 rounded-full transition-transform duration-300 ${isActive ? 'translate-x-4 bg-[#0a0a12]' : 'translate-x-0 bg-white/40'}`} />
              </div>
            </div>
            <button disabled={isSubmitting} className="w-full mt-4 bg-gradient-to-br from-[var(--accent)] to-[var(--accent-deep)] text-[#0a0a12] hover:brightness-110 hover:shadow-[0_4px_20px_var(--accent-glow)] py-3 rounded-xl font-semibold text-sm transition-all duration-300 active:scale-[0.98] disabled:opacity-50">
              추가
            </button>
          </form>
        </div>
      </div>

      <div className="lg:col-span-8 flex flex-col gap-4">
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-white">소스 계정</h2>
            <span className="text-[10px] font-bold bg-[var(--accent-soft)] text-[var(--accent)] px-2 py-1 rounded-md">{displayedSources.length}</span>
          </div>
          <button
            onClick={async () => {
              try {
                const activeSources = displayedSources.filter(s => s.isActive);
                if (activeSources.length === 0) {
                  alert("수집할 활성 타겟 계정이 없습니다.");
                  return;
                }

                alert("인스타그램 데이터 수집 및 AI 분석을 시작합니다. 계정당 약 10~30초 소요됩니다.");

                let count = 0;
                for (const account of activeSources) {
                  try {
                    const scrapeRes = await fetch("/api/fetch-insta", {
                      method: "POST",
                      headers: await adminApiHeaders(),
                      body: JSON.stringify({ username: account.accountName })
                    });

                    const scrapeData = await scrapeRes.json();

                    if (!scrapeData.success || !scrapeData.posts || scrapeData.posts.length === 0) {
                      console.warn(`[${account.accountName}] 수집 실패:`, scrapeData.error || scrapeData.warning);
                      continue;
                    }

                    const realPosts = scrapeData.posts;
                    const newPosts = [];
                    for (const p of realPosts) {
                      const q = query(collection(db, "raw_posts"), where("instaLink", "==", p.instaLink));
                      const snapshot = await getDocs(q);
                      if (snapshot.empty) {
                        newPosts.push(p);
                      }
                    }

                    if (newPosts.length === 0) {
                      console.log(`[${account.accountName}] 모두 이미 수집됨. 건너뜁니다.`);
                      continue;
                    }

                    let parsedInfo = { title: "", date: "", endDate: "", time: "", venueName: "", artistNames: "", ticketUrl: "", price: "", ticketOpenAt: "", chosenIndex: 0, dayLineups: [] as DayLineup[] };

                    const aiRes = await fetch("/api/parse-event", {
                      method: "POST", headers: await adminApiHeaders(),
                      body: JSON.stringify({ posts: newPosts, accountName: account.accountName })
                    });
                    const aiData = await aiRes.json();
                    if (aiData.success && aiData.data) {
                      parsedInfo = { ...parsedInfo, ...aiData.data };
                    }

                    const bestIndex = (parsedInfo.chosenIndex !== undefined && parsedInfo.chosenIndex !== -1) ? parsedInfo.chosenIndex : 0;
                    const realPost = newPosts[bestIndex];

                    let targetRawPostId = "";
                    for (let i = 0; i < newPosts.length; i++) {
                      const p = newPosts[i];
                      const rawRef = await addDoc(collection(db, "raw_posts"), {
                        sourceAccountId: account.id, sourceAccountName: account.accountName,
                        instaLink: p.instaLink, caption: p.caption, posterUrl: p.posterUrl, fetchedAt: serverTimestamp()
                      });
                      if (i === bestIndex) targetRawPostId = rawRef.id;
                    }

                    // 정보 부족(제목/날짜 누락)이면 아예 수집하지 않음
                    if (parsedInfo.chosenIndex !== -1 && hasMinimumEventInfo(parsedInfo)) {
                      const range = extractDateRange(parsedInfo.date);
                      const incoming: ConcertRecord = {
                        title: parsedInfo.title,
                        date: range.start || normalizeDateString(parsedInfo.date),
                        endDate: normalizeDateString(parsedInfo.endDate) || range.end,
                        time: parsedInfo.time || "",
                        venueName: canonicalVenueName(parsedInfo.venueName),
                        artistNames: parsedInfo.artistNames || "",
                        sourceUrl: parsedInfo.ticketUrl || "",
                        instagramUrl: realPost.instaLink || "",
                        price: parsedInfo.price || "",
                        posterUrl: realPost.posterUrl || "",
                        ticketOpenAt: parsedInfo.ticketOpenAt || "",
                        dayLineups: (parsedInfo.dayLineups || []).map((d) => ({ date: normalizeDateString(d.date), artists: d.artists })).filter((d) => d.date),
                      };

                      const eventsSnap = await getDocs(collection(db, "events"));
                      const existingEvents = eventsSnap.docs.map(d => ({ id: d.id, ...d.data() } as EventItem));
                      const matched = existingEvents.find(ev => isSameConcert(ev, incoming));

                      if (matched) {
                        // 같은 공연 → 기존 문서에 병합 (라인업 추가/수정 자동 반영, 한국어 우선)
                        const merged = mergeConcerts(matched, incoming);
                        await updateDoc(doc(db, "events", matched.id), { ...merged, updatedAt: serverTimestamp() });
                      } else if (incoming.venueName) {
                        // 완전한 정보 → 자동 발행
                        await addDoc(collection(db, "events"), {
                          title: incoming.title,
                          date: incoming.date,
                          endDate: incoming.endDate || "",
                          time: incoming.time,
                          venueName: incoming.venueName,
                          artistNames: incoming.artistNames,
                          sourceUrl: incoming.sourceUrl,
                          instagramUrl: incoming.instagramUrl,
                          price: incoming.price,
                          posterUrl: incoming.posterUrl,
                          ticketOpenAt: incoming.ticketOpenAt || "",
                          dayLineups: incoming.dayLineups || [],
                          createdAt: serverTimestamp(),
                          autoPublished: true,
                        });
                      } else {
                        // 장소 누락 → 승인 큐
                        await addDoc(collection(db, "candidate_events"), {
                          rawPostId: targetRawPostId,
                          sourceAccountId: account.id,
                          sourceAccountName: account.accountName,
                          instaLink: realPost.instaLink, caption: realPost.caption, posterUrl: realPost.posterUrl,
                          parsedTitle: incoming.title || "", parsedDate: incoming.date || "", parsedEndDate: incoming.endDate || "", parsedTime: incoming.time || "",
                          parsedVenue: "", parsedArtists: incoming.artistNames || "", parsedTicket: incoming.sourceUrl || "", parsedPrice: incoming.price || "",
                          parsedDayLineups: incoming.dayLineups || [],
                          confidence: 0.9, notes: "수동 수집: 장소 누락으로 승인 필요", createdAt: serverTimestamp()
                        });
                      }
                    }

                    await updateDoc(doc(db, "source_accounts", account.id), { lastFetchedAt: serverTimestamp() });
                    count++;
                  } catch (accountError) {
                    console.error(`[${account.accountName}] 에러:`, accountError);
                  }
                }
                alert(`${activeSources.length}개 타겟 중 ${count}개에서 성공. [승인 대기] 탭과 [공연 일정] 탭을 확인하세요.`);
              } catch (e) {
                console.error(e);
                alert("시스템 에러: " + e);
              }
            }}
            className="text-[11px] font-semibold text-[var(--muted)] hover:text-white px-3 py-1.5 rounded-lg border border-[var(--line)] hover:border-[var(--accent-border)] transition-all duration-200 active:scale-95"
          >
            ⚡ 수동 수집 실행
          </button>
        </div>

        {displayedSources.length === 0 ? (
          <div className="bg-[var(--panel)] border border-[var(--line)] rounded-2xl p-16 text-center">
            <p className="text-[var(--muted)] text-sm">등록된 계정이 없습니다.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {displayedSources.map(s => (
              <div key={s.id} className={`flex flex-col justify-between p-5 rounded-2xl border transition-all hover-card ${s.isActive ? "bg-[var(--panel)] border-[var(--line)]" : "bg-[var(--bg)] border-white/[0.03] opacity-50"}`}>
                <div className="flex items-start justify-between mb-6">
                  <span className="px-2 py-1 rounded-md text-[10px] font-bold bg-[var(--accent-soft)] text-[var(--accent)]">
                    {s.category}
                  </span>
                  {s.isActive && <div className="live-dot" />}
                </div>
                <h3 className="font-semibold text-white mb-5">@{s.accountName}</h3>
                <div className="flex gap-2 pt-3 border-t border-[var(--line)]">
                  <button onClick={() => toggle(s.id, s.isActive)} className="flex-1 py-2.5 bg-white/5 hover:bg-[var(--accent-soft)] text-[var(--muted)] hover:text-[var(--accent)] rounded-xl text-[11px] font-semibold transition-all duration-200 active:scale-95">{s.isActive ? "정지" : "재개"}</button>
                  <button onClick={() => del(s.id)} className="flex-1 py-2.5 bg-white/5 hover:bg-red-500/10 text-white/30 hover:text-red-400 rounded-xl text-[11px] font-semibold transition-all duration-200 active:scale-95">삭제</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────
// [Tab 3] CandidatesTab — onSnapshot 유지 + 낙관적 반려/승인
// ──────────────────────────────────────────────────
function CandidatesTab() {
  const [candidates, setCandidates] = useState<CandidateEvent[]>([]);

  const [instaLink, setInstaLink] = useState("");
  const [caption, setCaption] = useState("");
  const [posterUrl, setPosterUrl] = useState("");
  const [isInjecting, setIsInjecting] = useState(false);

  const [approvingItem, setApprovingItem] = useState<CandidateEvent | null>(null);
  const [apTitle, setApTitle] = useState("");
  const [apDate, setApDate] = useState("");
  const [apEndDate, setApEndDate] = useState("");
  const [apTime, setApTime] = useState("");
  const [apVenue, setApVenue] = useState("");
  const [apArtists, setApArtists] = useState("");
  const [apTicket, setApTicket] = useState("");
  const [apPrice, setApPrice] = useState("");
  const [isApproving, setIsApproving] = useState(false);

  // Optimistic UI: 반려/승인 시 즉시 목록에서 제거
  const [pendingRemoveIds, setPendingRemoveIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    return onSnapshot(query(collection(db, "candidate_events")), snap =>
      setCandidates(snap.docs.map(d => ({ id: d.id, ...d.data() } as CandidateEvent)))
    );
  }, []);

  // 자동 승인: 필수 정보(제목+날짜+장소)가 모두 있는 후보는 자동으로 events에 등록
  const [autoApproveRan, setAutoApproveRan] = useState(false);
  useEffect(() => {
    if (autoApproveRan || candidates.length === 0) return;

    const autoApprove = async () => {
      setAutoApproveRan(true);
      try {
        // 기존 events 로드 (중복 체크용)
        const eventsSnap = await getDocs(collection(db, "events"));
        const existingEvents = eventsSnap.docs.map(d => ({ id: d.id, ...d.data() } as EventItem));

        let autoCount = 0;
        let mergedCount = 0;
        for (const can of candidates) {
          // 과거 날짜 후보는 삭제
          if (adminIsPastDate(can.parsedDate)) {
            await deleteDoc(doc(db, "candidate_events", can.id));
            continue;
          }

          // 정보 부족(제목 또는 날짜 누락) 후보는 큐에 쌓지 않고 자동 삭제
          if (!hasMinimumEventInfo({ title: can.parsedTitle, date: can.parsedDate })) {
            await deleteDoc(doc(db, "candidate_events", can.id));
            continue;
          }

          const canRange = extractDateRange(can.parsedDate);
          const incoming: ConcertRecord = {
            title: can.parsedTitle,
            date: canRange.start || normalizeDateString(can.parsedDate),
            endDate: normalizeDateString(can.parsedEndDate) || canRange.end,
            time: can.parsedTime || "",
            venueName: canonicalVenueName(can.parsedVenue),
            artistNames: can.parsedArtists || "",
            sourceUrl: can.parsedTicket || "",
            instagramUrl: can.instaLink || "",
            price: can.parsedPrice || "",
            posterUrl: can.posterUrl || "",
            dayLineups: (can.parsedDayLineups || []).map((d) => ({ date: normalizeDateString(d.date), artists: d.artists })).filter((d) => d.date),
          };

          // 같은 공연이 이미 있으면 → 병합 업데이트 (라인업 추가분 자동 반영) 후 후보 제거
          const matched = existingEvents.find(ev => isSameConcert(ev, incoming));
          if (matched) {
            const merged = mergeConcerts(matched, incoming);
            await updateDoc(doc(db, "events", matched.id), { ...merged, updatedAt: serverTimestamp() });
            Object.assign(matched, merged);
            await deleteDoc(doc(db, "candidate_events", can.id));
            mergedCount++;
            continue;
          }

          // events에 자동 등록
          await addDoc(collection(db, "events"), {
            title: incoming.title,
            date: incoming.date,
            endDate: incoming.endDate || "",
            time: incoming.time,
            venueName: incoming.venueName,
            artistNames: incoming.artistNames,
            sourceUrl: incoming.sourceUrl,
            instagramUrl: incoming.instagramUrl,
            price: incoming.price,
            dayLineups: incoming.dayLineups || [],
            createdAt: serverTimestamp(),
            autoPublished: true,
          });

          // candidate에서 제거
          await deleteDoc(doc(db, "candidate_events", can.id));

          // 중복 방지를 위해 방금 등록한 것도 목록에 추가
          existingEvents.push({
            id: "auto-" + can.id,
            ...incoming,
          } as EventItem);

          autoCount++;
        }

        if (autoCount > 0 || mergedCount > 0) {
          console.log(`[자동 승인] 발행 ${autoCount}건, 기존 공연 병합 ${mergedCount}건.`);
        }
      } catch (err) {
        console.error("[자동 승인 에러]", err);
      }
    };

    autoApprove();
  }, [candidates, autoApproveRan]);

  const handleInject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!instaLink.trim()) return;
    setIsInjecting(true);
    let parsedInfo = { title: "", date: "", time: "", venueName: "", artistNames: "", ticketUrl: "", price: "" };
    try {
      if (caption.trim()) {
        try {
          const res = await fetch("/api/parse-event", {
            method: "POST", headers: await adminApiHeaders(),
            body: JSON.stringify({ caption })
          });
          const data = await res.json();
          if (data.success && data.data) {
            parsedInfo = data.data;
          } else {
            console.warn("AI 파싱 실패:", data.error);
            if (data.error && data.error.includes("OPENAI_API_KEY")) {
              alert("AI 파싱 기능에 OPENAI_API_KEY가 필요합니다.");
            }
          }
        } catch (apiErr) {
          console.error("API 에러", apiErr);
        }
      }

      const rawPostPayload = { instaLink, caption, posterUrl, createdAt: serverTimestamp() };
      const rawDocRef = await addDoc(collection(db, "raw_posts"), rawPostPayload);

      const hasAllFields = !!(
        parsedInfo.title &&
        parsedInfo.date &&
        parsedInfo.time &&
        parsedInfo.venueName &&
        parsedInfo.artistNames &&
        parsedInfo.price &&
        parsedInfo.ticketUrl &&
        instaLink
      );

      if (hasAllFields) {
        await addDoc(collection(db, "events"), {
          title: parsedInfo.title,
          date: parsedInfo.date,
          time: parsedInfo.time,
          venueName: parsedInfo.venueName,
          artistNames: parsedInfo.artistNames,
          sourceUrl: parsedInfo.ticketUrl,
          instagramUrl: instaLink,
          price: parsedInfo.price,
          createdAt: serverTimestamp(),
        });
      } else {
        await addDoc(collection(db, "candidate_events"), {
          rawPostId: rawDocRef.id,
          instaLink, caption, posterUrl,
          parsedTitle: parsedInfo.title || "",
          parsedDate: parsedInfo.date || "",
          parsedTime: parsedInfo.time || "",
          parsedVenue: parsedInfo.venueName || "",
          parsedArtists: parsedInfo.artistNames || "",
          parsedTicket: parsedInfo.ticketUrl || "",
          parsedPrice: parsedInfo.price || "",
          createdAt: serverTimestamp()
        });
      }

      setInstaLink(""); setCaption(""); setPosterUrl("");
    } catch (err) {
      console.error(err);
      alert("수동 입력 처리에 실패했습니다.");
    } finally {
      setIsInjecting(false);
    }
  };

  const handleReject = async (id: string) => {
    if (!window.confirm("이 후보를 반려하시겠습니까?")) return;

    // 낙관적 반려: 즉시 목록에서 숨김
    setPendingRemoveIds((prev) => new Set(prev).add(id));
    try {
      await deleteDoc(doc(db, "candidate_events", id));
    } catch (err) {
      console.error("반려 실패:", err);
      alert("반려에 실패했습니다. 항목이 복원됩니다.");
    } finally {
      setPendingRemoveIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  const openMod = (can: CandidateEvent) => {
    setApprovingItem(can);
    setApTitle(can.parsedTitle || "");
    setApDate(can.parsedDate || "");
    setApEndDate(can.parsedEndDate || "");
    setApTime(can.parsedTime || "");
    setApVenue(can.parsedVenue || "");
    setApArtists(can.parsedArtists || "");
    setApTicket(can.parsedTicket || can.instaLink);
    setApPrice(can.parsedPrice || "");
  };

  const handleApprove = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!approvingItem || !apTitle.trim()) return;
    setIsApproving(true);
    try {
      const apRange = extractDateRange(apDate);
      const incoming: ConcertRecord = {
        title: apTitle,
        date: apRange.start || normalizeDateString(apDate),
        endDate: normalizeDateString(apEndDate) || apRange.end,
        time: apTime,
        venueName: canonicalVenueName(apVenue) || apVenue.trim(),
        artistNames: apArtists,
        sourceUrl: apTicket,
        instagramUrl: approvingItem.instaLink || "",
        price: apPrice,
        posterUrl: approvingItem.posterUrl || "",
        dayLineups: (approvingItem.parsedDayLineups || []).map((d) => ({ date: normalizeDateString(d.date), artists: d.artists })).filter((d) => d.date),
      };

      const eventsSnap = await getDocs(collection(db, "events"));
      const existingEvents = eventsSnap.docs.map(d => ({ id: d.id, ...d.data() } as EventItem));
      const duplicate = existingEvents.find(ev => isSameConcert(ev, incoming));

      if (duplicate) {
        const confirmed = window.confirm(
          `⚠️ 같은 공연 감지: "${duplicate.title}" 이(가) 이미 등록되어 있습니다.\n\n[확인]을 누르면 새 공연을 만들지 않고 기존 공연에 정보를 병합합니다.\n(한국어 제목 우선, 라인업·가격 등 정보 합침)`
        );
        if (!confirmed) {
          setIsApproving(false);
          return;
        }

        // 낙관적 병합: 모달을 닫고 목록에서 즉시 제거
        const approvedId = approvingItem.id;
        setPendingRemoveIds((prev) => new Set(prev).add(approvedId));
        setApprovingItem(null);

        try {
          const merged = mergeConcerts(duplicate, incoming);
          await updateDoc(doc(db, "events", duplicate.id), { ...merged, updatedAt: serverTimestamp() });
          await deleteDoc(doc(db, "candidate_events", approvedId));
        } catch (err) {
          console.error("병합 실패:", err);
          alert("병합에 실패했습니다. 항목이 복원됩니다.");
        } finally {
          setPendingRemoveIds((prev) => {
            const next = new Set(prev);
            next.delete(approvedId);
            return next;
          });
        }
        return;
      }

      // 낙관적 승인: 모달을 닫고 목록에서 즉시 제거
      const approvedId = approvingItem.id;
      setPendingRemoveIds((prev) => new Set(prev).add(approvedId));
      setApprovingItem(null);

      try {
        await addDoc(collection(db, "events"), {
          title: incoming.title,
          date: incoming.date,
          endDate: incoming.endDate || "",
          time: incoming.time,
          venueName: incoming.venueName,
          artistNames: incoming.artistNames,
          sourceUrl: incoming.sourceUrl,
          instagramUrl: incoming.instagramUrl,
          price: incoming.price,
          dayLineups: incoming.dayLineups || [],
          createdAt: serverTimestamp(),
        });
        await deleteDoc(doc(db, "candidate_events", approvedId));
      } catch (err) {
        console.error("승인 발행 실패:", err);
        alert("승인 발행에 실패했습니다. 항목이 복원됩니다.");
      } finally {
        setPendingRemoveIds((prev) => {
          const next = new Set(prev);
          next.delete(approvedId);
          return next;
        });
      }
    } catch (err) {
      console.error(err);
      alert("승인 처리 중 오류가 발생했습니다.");
    } finally {
      setIsApproving(false);
    }
  };

  return (
    <>
      {/* ─── Approve Modal ─── */}
      {approvingItem && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-[var(--bg-elevated)] border border-[var(--line-strong)] w-full max-w-xl rounded-2xl p-6 max-h-[90vh] overflow-y-auto custom-scrollbar shadow-[0_24px_80px_rgba(0,0,0,0.6)]">
            <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)]" />
              승인 발행
            </h2>
            <div className="mb-4 p-3 bg-white/[0.03] rounded-xl max-h-24 overflow-y-auto custom-scrollbar text-[11px] text-[var(--muted)] border border-[var(--line)] leading-relaxed">
              <span className="text-[var(--text-secondary)] block mb-1 font-semibold">원문 참고:</span>
              {approvingItem.caption || "캡션 없음"}
            </div>

            <form onSubmit={handleApprove} className="space-y-3">
              <Input label="공연 제목 (필수)" value={apTitle} onChange={setApTitle} required />
              <div className="grid grid-cols-2 gap-3">
                <Input label="날짜" value={apDate} onChange={setApDate} />
                <Input label="시간" value={apTime} onChange={setApTime} />
              </div>
              <Input label="종료 날짜 (멀티데이만, 선택)" placeholder="YYYY-MM-DD" value={apEndDate} onChange={setApEndDate} />
              <Input label="장소" value={apVenue} onChange={setApVenue} />
              <div className="grid grid-cols-2 gap-3">
                <Input label="아티스트" value={apArtists} onChange={setApArtists} />
                <Input label="가격" value={apPrice} onChange={setApPrice} />
              </div>
              <Input label="예매처 링크" value={apTicket} onChange={setApTicket} />

              <div className="pt-4 flex gap-3">
                <button disabled={isApproving} className="flex-1 bg-gradient-to-br from-[var(--accent)] to-[var(--accent-deep)] text-[#0a0a12] hover:brightness-110 hover:shadow-[0_4px_20px_var(--accent-glow)] font-bold py-3 rounded-xl text-sm transition-all duration-300 active:scale-[0.98] disabled:opacity-50">발행</button>
                <button type="button" onClick={() => setApprovingItem(null)} className="px-6 border border-[var(--line-strong)] text-[var(--muted)] hover:text-white hover:border-[var(--accent-border)] font-medium py-3 rounded-xl text-sm transition-all duration-200 active:scale-95">취소</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8">
        {/* ─── Inject Form ─── */}
        <div className="lg:col-span-4 flex flex-col gap-4 self-start lg:sticky lg:top-8 max-h-[calc(100vh-4rem)] overflow-y-auto custom-scrollbar">
          <div className="bg-[var(--panel)] border border-[var(--line)] rounded-2xl p-6 relative">
            <div className="absolute top-0 inset-x-0 h-px bg-white/10" />
            <h2 className="text-sm font-semibold mb-4 text-white">수동 입력</h2>
            <p className="text-[11px] text-[var(--muted)] mb-5 leading-relaxed">링크를 넣으면 AI가 캡션을 분석합니다.</p>
            <form onSubmit={handleInject} className="space-y-3">
              <Input label="인스타 링크" value={instaLink} onChange={setInstaLink} required />
              <div>
                <label className="block text-[11px] font-medium text-[var(--muted)] mb-1.5 pl-0.5">캡션</label>
                <textarea value={caption} onChange={e => setCaption(e.target.value)} placeholder="AI가 분석할 원문" className="w-full bg-white/5 border border-[var(--line)] focus:border-[var(--accent-border)] rounded-xl px-4 py-3 text-xs text-white h-28 resize-none outline-none custom-scrollbar placeholder:text-white/20 transition-colors" />
              </div>
              <button disabled={isInjecting} className="w-full bg-[var(--accent-soft)] text-[var(--accent)] hover:bg-[var(--accent)] hover:text-[#0a0a12] py-3 rounded-xl font-semibold text-sm transition-all duration-300 active:scale-[0.98] disabled:opacity-50">분석 후 큐에 추가</button>
            </form>
          </div>
        </div>

        {/* ─── Candidate List ─── */}
        <div className="lg:col-span-8 flex flex-col gap-4">
          {(() => {
            const visibleCandidates = candidates
              .filter(can => !pendingRemoveIds.has(can.id))
              .filter(can => !adminIsPastDate(can.parsedDate))
              .sort((a, b) => {
                const getScore = (c: CandidateEvent) => {
                  let score = 0;
                  if (c.parsedTitle) score += 2;
                  if (c.parsedDate) score += 2;
                  if (c.parsedVenue) score += 1;
                  if (c.parsedArtists) score += 1;
                  if (c.parsedPrice) score += 1;
                  if (c.parsedTime) score += 1;
                  return score;
                };
                return getScore(b) - getScore(a);
              });
            return (
              <>
                <div className="flex items-center gap-2 px-1">
                  <h2 className="text-sm font-semibold text-white">승인 대기</h2>
                  <span className="text-[10px] font-bold bg-[var(--accent-soft)] text-[var(--accent)] px-2 py-1 rounded-md">{visibleCandidates.length}</span>
                </div>
                {visibleCandidates.length === 0 ? (
                  <div className="bg-[var(--panel)] border border-[var(--line)] rounded-2xl p-16 text-center">
                    <p className="text-[var(--muted)] text-sm">대기 중인 항목이 없습니다.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {visibleCandidates.map(can => (
                      <div key={can.id} className="bg-[var(--panel)] border border-[var(--line)] rounded-2xl p-5 flex flex-col gap-3 hover-card transition-all">
                        <div className="flex-1">
                          <a href={can.instaLink} target="_blank" rel="noreferrer" className="text-[11px] font-medium text-[var(--muted)] hover:text-[var(--accent)] underline underline-offset-4 decoration-white/10 inline-block mb-2 transition-colors">원본 ↗</a>

                          {can.posterUrl && (
                            <a href={can.posterUrl} target="_blank" rel="noreferrer" className="block mb-3 h-40 w-full rounded-xl overflow-hidden bg-white/[0.03] border border-[var(--line)] relative group shrink-0">
                              <img
                                src={can.posterUrl}
                                alt="포스터"
                                referrerPolicy="no-referrer"
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                                onError={(e) => { e.currentTarget.style.display = 'none'; e.currentTarget.parentElement!.style.display = 'none'; }}
                              />
                            </a>
                          )}

                          <div className="text-[11px] text-white/25 line-clamp-2 leading-relaxed bg-white/[0.03] p-3 rounded-lg mb-3">{can.caption || "내용 없음"}</div>

                          {/* AI 분석 결과 */}
                          <div className="bg-white/[0.03] border border-[var(--line)] rounded-xl p-3 space-y-1.5">
                            <p className="text-[10px] font-bold text-[var(--accent)] uppercase tracking-wider mb-2">AI 분석</p>

                            {can.parsedTitle && <p className="text-xs text-white/80 truncate flex gap-2"><span className="w-8 shrink-0 text-white/20 font-medium">제목</span> <span className="font-semibold text-white truncate">{can.parsedTitle}</span></p>}
                            {(can.parsedDate || can.parsedTime) && <p className="text-xs text-white/70 truncate flex gap-2"><span className="w-8 shrink-0 text-white/20 font-medium">일시</span> <span>{can.parsedDate} {can.parsedTime}</span></p>}
                            {can.parsedVenue && <p className="text-xs text-white/70 truncate flex gap-2"><span className="w-8 shrink-0 text-white/20 font-medium">장소</span> <span>{can.parsedVenue}</span></p>}
                            {can.parsedArtists && <p className="text-xs text-white/70 truncate flex gap-2"><span className="w-8 shrink-0 text-white/20 font-medium">출연</span> <span>{can.parsedArtists}</span></p>}
                            {can.parsedPrice && <p className="text-xs text-white font-semibold truncate flex gap-2"><span className="w-8 shrink-0 text-white/20 font-medium">가격</span> <span>{can.parsedPrice}</span></p>}

                            {(!can.parsedTitle && !can.parsedDate && !can.parsedVenue) && (
                              <p className="text-[11px] text-white/20">AI 분석 결과 없음</p>
                            )}
                          </div>
                        </div>

                        <div className="flex gap-2 pt-3 border-t border-[var(--line)]">
                          <button onClick={() => openMod(can)} className="flex-1 py-2.5 bg-gradient-to-br from-[var(--accent)] to-[var(--accent-deep)] text-[#0a0a12] hover:brightness-110 rounded-xl text-[11px] font-bold transition-all duration-200 active:scale-95">승인</button>
                          <button onClick={() => handleReject(can.id)} className="px-4 py-2.5 bg-white/5 text-white/30 hover:text-red-400 hover:bg-red-500/10 rounded-xl text-[11px] font-semibold transition-all duration-200 active:scale-95">반려</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            );
          })()}
        </div>
      </div>
    </>
  );
}

// ──────────────────────────────────────────────────
// Reusable Input
// ──────────────────────────────────────────────────
interface InputProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  required?: boolean;
}

function Input({ label, value, onChange, placeholder, type = "text", required = false }: InputProps) {
  return (
    <div>
      <label className="block text-[11px] font-medium text-[var(--muted)] mb-1.5 pl-0.5">{label}</label>
      <input
        type={type} value={value} onChange={(e) => onChange(e.target.value)} required={required} placeholder={placeholder}
        className="w-full bg-white/5 border border-[var(--line)] focus:border-[var(--accent-border)] focus:bg-white/[0.07] focus:shadow-[0_0_0_3px_var(--accent-soft)] rounded-xl px-4 py-3 text-xs text-white placeholder-white/15 transition-all duration-200 outline-none"
      />
    </div>
  );
}
