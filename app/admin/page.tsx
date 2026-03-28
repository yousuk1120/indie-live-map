"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, query, serverTimestamp, where, getDocs } from "firebase/firestore";
import { auth } from "@/lib/firebase/auth";
import { db } from "@/lib/firebase/firestore";

type EventItem = {
  id: string;
  title?: string;
  date?: string;
  time?: string;
  venueName?: string;
  artistNames?: string;
  sourceUrl?: string;
  instagramUrl?: string;
  price?: string;
};
type SourceAccount = { id: string; accountName: string; category: "공연장" | "밴드" | "기획사"; isActive: boolean; };
type CandidateEvent = {
  id: string;
  rawPostId?: string;
  instaLink: string;
  caption: string;
  posterUrl: string;
  // AI 추출용 필드
  parsedTitle?: string;
  parsedDate?: string;
  parsedTime?: string;
  parsedVenue?: string;
  parsedArtists?: string;
  parsedTicket?: string;
  parsedPrice?: string;
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

  if (loadingAuth) {
    return <div className="min-h-screen bg-[#0a0a0a] text-white flex items-center justify-center">Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-zinc-200 selection:bg-white/20 font-sans">
      <div className="max-w-[1400px] mx-auto p-4 md:p-8">

        {/* Header */}
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-10 pb-6 border-b border-white/5">
          <div>
            <h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-white mb-2">Workspace</h1>
            <p className="text-zinc-500 text-sm">인디 라이브 인벤토리 및 자동화 파이프라인 관리</p>
          </div>
          <button
            onClick={handleLogout}
            className="bg-white/5 hover:bg-white/10 text-zinc-300 px-5 py-2.5 rounded-2xl text-sm font-medium transition duration-200 w-fit"
          >
            로그아웃
          </button>
        </header>

        {/* Modern Pill Tabs */}
        <div className="flex flex-wrap gap-2 mb-10 p-1.5 bg-[#121212] rounded-3xl w-fit border border-white/5">
          <TabButton active={activeTab === "events"} onClick={() => setActiveTab("events")} label="본공연 일정 (events)" icon="🎸" />
          <TabButton active={activeTab === "sources"} onClick={() => setActiveTab("sources")} label="수집 타겟 풀 (source_accounts)" icon="📡" />
          <TabButton active={activeTab === "candidates"} onClick={() => setActiveTab("candidates")} label="후보 AI 검수 큐" icon="🤖" />
        </div>

        {/* Tab Content */}
        <main className="animate-in fade-in duration-500">
          {activeTab === "events" && <EventsTab />}
          {activeTab === "sources" && <SourcesTab />}
          {activeTab === "candidates" && <CandidatesTab />}
        </main>
      </div>
    </div>
  );
}

function TabButton({ active, onClick, label, icon }: { active: boolean, onClick: () => void, label: string, icon: string }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2.5 px-6 py-3 rounded-2xl text-sm font-medium transition-all duration-300 ${active
        ? "bg-white/10 text-white shadow-sm ring-1 ring-white/10"
        : "text-zinc-500 hover:text-zinc-300 hover:bg-white/5"
        }`}
    >
      <span className="opacity-80 text-base">{icon}</span>
      {label}
    </button>
  );
}

// ----------------------------------------------------------------------
// [Tab 1] EventsTab (기존 공연 일정 관리 유지)
// ----------------------------------------------------------------------
function EventsTab() {
  const [events, setEvents] = useState<EventItem[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [venueName, setVenueName] = useState("");
  const [artistNames, setArtistNames] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [instagramUrl, setInstagramUrl] = useState("");
  const [price, setPrice] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const q = query(collection(db, "events"));
    return onSnapshot(q, (snapshot) => {
      setEvents(snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as EventItem)));
    });
  }, []);

  const handleEditClick = (item: EventItem) => {
    setEditingId(item.id);
    setTitle(item.title || "");
    setDate(item.date || "");
    setTime(item.time || "");
    setVenueName(item.venueName || "");
    setArtistNames(item.artistNames || "");
    setSourceUrl(item.sourceUrl || "");
    setInstagramUrl(item.instagramUrl || "");
    setPrice(item.price || "");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setTitle("");
    setDate("");
    setTime("");
    setVenueName("");
    setArtistNames("");
    setSourceUrl("");
    setInstagramUrl("");
    setPrice("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    setIsSubmitting(true);
    try {
      if (editingId) {
        await updateDoc(doc(db, "events", editingId), {
          title,
          date,
          time,
          venueName,
          artistNames,
          sourceUrl,
          instagramUrl,
          price,
        });
      } else {
        await addDoc(collection(db, "events"), {
          title,
          date,
          time,
          venueName,
          artistNames,
          sourceUrl,
          instagramUrl,
          price,
          createdAt: serverTimestamp(),
        });
      }

      handleCancelEdit();
    } catch (error) {
      console.error(error);
    } finally {
      setIsSubmitting(false);
    }
  };
  const handleDelete = async (id: string) => {
    if (!window.confirm("공연을 완전 삭제하시겠습니까?")) return;
    if (editingId === id) handleCancelEdit();
    await deleteDoc(doc(db, "events", id));
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-10">
      <div className="lg:col-span-4 flex flex-col gap-6 self-start lg:sticky lg:top-8 max-h-[calc(100vh-4rem)] overflow-y-auto px-1 pb-4 custom-scrollbar">
        <div className="bg-[#121212] border border-white/5 rounded-[2rem] p-7 md:p-8 shadow-2xl relative overflow-hidden group">
          {editingId && <div className="absolute top-0 inset-x-0 h-[2px] bg-gradient-to-r from-transparent via-amber-500/40 to-transparent"></div>}
          <h2 className="text-lg font-semibold mb-8 text-white flex items-center gap-3">
            {editingId ? <><span className="w-2 h-2 rounded-full bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.6)]"></span>수정하기</> : <><span className="w-2 h-2 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.6)]"></span>새 공연 수동 등록</>}
          </h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input label="공연 제목" value={title} onChange={setTitle} required />
            <div className="grid grid-cols-2 gap-4">
              <Input label="날짜" placeholder="YY-MM-DD" value={date} onChange={setDate} />
              <Input label="시간" placeholder="19:00" value={time} onChange={setTime} />
            </div>
            <Input label="장소명" value={venueName} onChange={setVenueName} />
            <div className="grid grid-cols-2 gap-4">
              <Input label="참여 아티스트" value={artistNames} onChange={setArtistNames} />
              <Input label="티켓 가격" value={price} onChange={setPrice} />
            </div>
            <Input label="예매 / 안내 링크" type="text" value={sourceUrl} onChange={setSourceUrl} />
            <Input label="인스타그램 링크" type="text" value={instagramUrl} onChange={setInstagramUrl} />

            <div className="flex gap-4 pt-2">
              <button disabled={isSubmitting} className={`flex-1 py-4 rounded-2xl font-semibold transition-all duration-300 ${editingId ? "bg-amber-500 text-black hover:bg-amber-400" : "bg-white text-black hover:bg-zinc-200"} disabled:opacity-50`}>
                {editingId ? "변경사항 발행" : "추가하기"}
              </button>
              {editingId && (
                <button type="button" onClick={handleCancelEdit} disabled={isSubmitting} className="px-6 bg-white/5 border border-white/5 text-zinc-400 hover:text-white rounded-2xl font-medium transition-all">취소</button>
              )}
            </div>
          </form>
        </div>
      </div >

      <div className="lg:col-span-8 flex flex-col gap-5">

        <div className="lg:col-span-8 flex flex-col gap-5">
          <div className="flex items-center justify-between px-2">
            <h2 className="text-lg font-semibold text-white">등록된 항목 (events)</h2>
            <span className="text-xs font-semibold bg-white/10 text-zinc-300 px-3 py-1.5 rounded-full">{events.length}</span>
          </div>
          {events.length === 0 ? (
            <div className="bg-[#121212] border border-white/5 rounded-[2rem] p-16 text-center flex flex-col items-center justify-center">
              <p className="text-zinc-500 font-medium">아직 승인되거나 수동 등록된 공연이 없습니다.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {events.map(ev => (
                <div key={ev.id} className={`bg-[#121212] border ${editingId === ev.id ? 'border-amber-500/30' : 'border-white/5'} rounded-3xl p-6 transition-all group flex flex-col`}>
                  <div className="flex-1">
                    <h3 className="font-semibold text-lg text-white mb-5 line-clamp-2 leading-snug">{ev.title}</h3>
                    <div className="space-y-3 text-sm text-zinc-400">
                      {ev.date && <p className="flex gap-4"><span className="text-zinc-600 font-medium shrink-0">일시</span> <span className="text-zinc-200">{ev.date} {ev.time}</span></p>}
                      {ev.venueName && <p className="flex gap-4"><span className="text-zinc-600 font-medium shrink-0">장소</span> <span className="text-zinc-200">{ev.venueName}</span></p>}
                      {ev.artistNames && <p className="flex gap-4"><span className="text-zinc-600 font-medium shrink-0">출연</span> <span className="text-zinc-200 line-clamp-1">{ev.artistNames}</span></p>}
                      {ev.price && <p className="flex gap-4"><span className="text-zinc-600 font-medium shrink-0">가격</span> <span className="text-pink-300 font-bold">{ev.price}</span></p>}
                      {ev.sourceUrl && (
                        <a href={ev.sourceUrl} target="_blank" rel="noreferrer" className="inline-block mt-4 text-xs font-medium text-blue-400 hover:text-blue-300 underline underline-offset-4 decoration-blue-500/30">원본 링크로 이동</a>
                      )}
                    </div>
                  </div>
                  <div className="mt-8 flex gap-2">
                    <button onClick={() => handleEditClick(ev)} className="flex-1 bg-white/5 hover:bg-white/10 text-zinc-300 hover:text-white py-3 rounded-2xl text-xs font-semibold transition">수정</button>
                    <button onClick={() => handleDelete(ev.id)} className="flex-1 bg-red-500/5 hover:bg-red-500/10 text-red-400 hover:text-red-300 py-3 rounded-2xl text-xs font-semibold transition">삭제</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div >
      );
}

      // ----------------------------------------------------------------------
      // [Tab 2] SourcesTab (수집용 타겟 관리 - source_accounts)
      // ----------------------------------------------------------------------
      function SourcesTab() {
  const [sources, setSources] = useState<SourceAccount[]>([]);
      const [accountName, setAccountName] = useState(""); const [category, setCategory] = useState("공연장");
      const [isActive, setIsActive] = useState(true); const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    return onSnapshot(query(collection(db, "source_accounts")), snap => setSources(snap.docs.map(d => ({id: d.id, ...d.data() } as SourceAccount))));
  }, []);

  const handleAdd = async (e: React.FormEvent) => {
        e.preventDefault(); if (!accountName.trim()) return;
      setIsSubmitting(true);
      try {
        await addDoc(collection(db, "source_accounts"), { accountName: accountName.trim(), category, isActive, createdAt: serverTimestamp() });
      setAccountName(""); setCategory("공연장"); setIsActive(true);
    } catch (err) { } finally {setIsSubmitting(false); }
  };
  const toggle = async (id: string, cur: boolean) => updateDoc(doc(db, "source_accounts", id), {isActive: !cur });
  const del = async (id: string) => { if (window.confirm("삭제하시겠습니까?")) deleteDoc(doc(db, "source_accounts", id)); };

      return (
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-10">
        <div className="lg:col-span-4 flex flex-col gap-6 self-start lg:sticky lg:top-8 max-h-[calc(100vh-4rem)] overflow-y-auto px-1 pb-4 custom-scrollbar">
          <div className="bg-[#121212] border border-white/5 rounded-[2rem] p-7 md:p-8 shadow-2xl relative">
            <div className="absolute top-0 inset-x-0 h-[2px] bg-gradient-to-r from-transparent via-purple-500/40 to-transparent"></div>
            <h2 className="text-lg font-semibold mb-8 text-white flex items-center gap-3">
              <span className="w-2 h-2 rounded-full bg-purple-500 shadow-[0_0_8px_rgba(168,85,247,0.6)]"></span>타겟망 추가
            </h2>
            <form onSubmit={handleAdd} className="space-y-4">
              <Input label="인스타그램 아이디" value={accountName} onChange={setAccountName} required placeholder="rollinghall" />
              <div>
                <label className="block text-xs font-medium text-zinc-500 mb-2 pl-1">분류 속성</label>
                <select value={category} onChange={e => setCategory(e.target.value)} className="w-full bg-white/5 border border-transparent focus:border-white/10 rounded-2xl px-5 py-4 text-sm text-white outline-none appearance-none">
                  <option value="공연장" className="bg-[#121212]">공연장</option>
                  <option value="밴드" className="bg-[#121212]">밴드</option>
                  <option value="기획사" className="bg-[#121212]">기획사</option>
                </select>
              </div>
              <div className="flex items-center justify-between p-5 bg-white/5 rounded-2xl mt-4 cursor-pointer hover:bg-white/10 transition-colors" onClick={() => setIsActive(!isActive)}>
                <span className="text-sm font-medium text-zinc-300">자동 수집 활성화</span>
                <div className={`w-11 h-6 rounded-full p-1 transition-colors ${isActive ? 'bg-purple-500' : 'bg-zinc-700'}`}>
                  <div className={`w-4 h-4 rounded-full bg-white transition-transform ${isActive ? 'translate-x-5' : 'translate-x-0'}`}></div>
                </div>
              </div>
              <button disabled={isSubmitting} className="w-full mt-6 bg-white text-black hover:bg-zinc-200 py-4 rounded-2xl font-semibold transition">
                추가하기
              </button>
            </form>
          </div>
        </div>

        <div className="lg:col-span-8 flex flex-col gap-5">
          <div className="flex items-center justify-between px-2">
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-semibold text-white">추적할 소스 계정 목록 (source_accounts)</h2>
              <span className="text-xs font-semibold bg-white/10 text-zinc-300 px-3 py-1.5 rounded-full">{sources.length}</span>
            </div>
            <button
              onClick={async () => {
                try {
                  // 1. 활성 타겟 계정만 선별
                  const activeSources = sources.filter(s => s.isActive);
                  if (activeSources.length === 0) {
                    alert("수집할 활성 타겟 계정이 없습니다. 토글을 켜주세요.");
                    return;
                  }

                  alert("인스타그램 실 데이터 수집 및 AI 분석을 시작합니다. 계정당 약 10~30초 소요될 수 있습니다. (창을 닫지 마세요)");

                  let count = 0;
                  for (const account of activeSources) {
                    try {
                      // [STEP 1] Apify 크롤링 서버에 실제 인스타 최신 글 요청
                      const scrapeRes = await fetch("/api/fetch-insta", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ username: account.accountName })
                      });

                      const scrapeData = await scrapeRes.json();

                      if (!scrapeData.success || !scrapeData.posts || scrapeData.posts.length === 0) {
                        console.warn(`[${account.accountName}] 수집 실패 또는 새 게시물 없음:`, scrapeData.error || scrapeData.warning);
                        continue;
                      }

                      const realPosts = scrapeData.posts;

                      // [중복 검사] 이미 raw_posts에 존재하는 instaLink인지 확인
                      const newPosts = [];
                      for (const p of realPosts) {
                        const q = query(collection(db, "raw_posts"), where("instaLink", "==", p.instaLink));
                        const snapshot = await getDocs(q);
                        if (snapshot.empty) {
                          newPosts.push(p);
                        }
                      }

                      if (newPosts.length === 0) {
                        console.log(`[${account.accountName}] 최근 게시물 모두 이미 수집 및 분석되었습니다. (중복 방지) 건너뜁니다.`);
                        continue;
                      }

                      // [STEP 2] OpenAI 파서 버스에 태워 새로운 게시물 중에서 가장 진짜 공연포스터 같은 것 1개를 솎아냅니다.
                      let parsedInfo = { title: "", date: "", time: "", venueName: "", artistNames: "", ticketUrl: "", price: "", chosenIndex: 0 };

                      const aiRes = await fetch("/api/parse-event", {
                        method: "POST", headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ posts: newPosts, accountName: account.accountName })
                      });
                      const aiData = await aiRes.json();
                      if (aiData.success && aiData.data) {
                        parsedInfo = aiData.data;
                        if (parsedInfo.chosenIndex === -1) {
                          console.warn(`[${account.accountName}] AI가 새로운 글 중에 공연 글이 없다고 판단했습니다. 무시되지만 임시로 0번(새로운 최신글)을 표시합니다.`);
                        }
                      }

                      // AI가 고른 베스트 게시물 (만약 AI가 못 골랐으면 그냥 최신글(0)번으로 fallback)
                      const bestIndex = (parsedInfo.chosenIndex !== undefined && parsedInfo.chosenIndex !== -1) ? parsedInfo.chosenIndex : 0;
                      const realPost = newPosts[bestIndex];

                      // [STEP 3] DB 적재 (raw_posts 보관)
                      // 새로 발견된 게시물들은 추후 중복검사를 위해 모두 raw_posts에 넣습니다.
                      let targetRawPostId = "";
                      for (let i = 0; i < newPosts.length; i++) {
                        const p = newPosts[i];
                        const rawRef = await addDoc(collection(db, "raw_posts"), {
                          sourceAccountId: account.id, sourceAccountName: account.accountName,
                          instaLink: p.instaLink, caption: p.caption, posterUrl: p.posterUrl, fetchedAt: serverTimestamp()
                        });
                        if (i === bestIndex) targetRawPostId = rawRef.id;
                      }

                      // [STEP 4] 후보(candidate_events)로 대기열 상신 (AI가 걸러낸 값이 있으면 사용)
                      if (parsedInfo.chosenIndex !== -1) {
                        await addDoc(collection(db, "candidate_events"), {
                          rawPostId: targetRawPostId,
                          sourceAccountId: account.id,
                          sourceAccountName: account.accountName,
                          instaLink: realPost.instaLink, caption: realPost.caption, posterUrl: realPost.posterUrl,
                          parsedTitle: parsedInfo.title || "", parsedDate: parsedInfo.date || "", parsedTime: parsedInfo.time || "",
                          parsedVenue: parsedInfo.venueName || "", parsedArtists: parsedInfo.artistNames || "", parsedTicket: parsedInfo.ticketUrl || "", parsedPrice: parsedInfo.price || "",
                          confidence: 0.9, notes: "Apify Real Crawl + GPT AI", createdAt: serverTimestamp()
                        });
                      } else {
                        console.log(`[${account.accountName}] 공연 포스터 아님으로 판별되어 큐 상신을 생략합니다.`);
                      }

                      // [STEP 5] 마지막 수집시간 업데이트
                      await updateDoc(doc(db, "source_accounts", account.id), { lastFetchedAt: serverTimestamp() });
                      count++;
                    } catch (accountError) {
                      console.error(`[${account.accountName}] 개별 수집 에러:`, accountError);
                    }
                  }
                  alert(`${activeSources.length}개의 타겟 중 ${count}개의 계정에서 성공적으로 새 포스터 정보를 추출했습니다!\n[후보 AI 검수 큐] 탭을 확인해주세요.`);
                } catch (e) {
                  console.error(e);
                  alert("시스템 에러 발동: " + e);
                }
              }}
              className="bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 px-4 py-2 rounded-xl text-xs font-bold transition-all border border-emerald-500/20 shadow-[0_0_10px_rgba(16,185,129,0.1)]"
            >
              🔥 실데이터 자동 수집 + AI파싱 실행
            </button>
          </div>

          {sources.length === 0 ? (
            <div className="bg-[#121212] border border-white/5 rounded-[2rem] p-16 text-center flex flex-col items-center justify-center">
              <p className="text-zinc-500 font-medium">등록된 추적 계정이 없습니다.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {sources.map(s => (
                <div key={s.id} className={`flex flex-col justify-between p-6 rounded-3xl border transition-all ${s.isActive ? "bg-[#121212] border-white/5 hover:border-white/10" : "bg-black border-transparent opacity-60 grayscale"}`}>
                  <div className="flex items-start justify-between mb-8">
                    <div className={`px-3 py-1.5 rounded-lg text-xs font-bold tracking-wide ${s.category === '공연장' ? 'bg-blue-500/10 text-blue-400' : s.category === '밴드' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-purple-500/10 text-purple-400'}`}>
                      {s.category}
                    </div>
                  </div>
                  <h3 className="font-semibold text-white text-lg mb-6">@{s.accountName}</h3>

                  <div className="flex gap-2">
                    <button onClick={() => toggle(s.id, s.isActive)} className="flex-1 py-3 bg-white/5 hover:bg-white/10 text-zinc-300 rounded-2xl text-xs font-semibold transition">{s.isActive ? "정지" : "재개"}</button>
                    <button onClick={() => del(s.id)} className="flex-1 py-3 bg-red-500/5 hover:bg-red-500/10 text-red-400 rounded-2xl text-xs font-semibold transition">삭제</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      );
}

      // ----------------------------------------------------------------------
      // [Tab 3] CandidatesTab (원문 적재 및 AI 심사 큐)
      // ----------------------------------------------------------------------
      function CandidatesTab() {
  const [candidates, setCandidates] = useState<CandidateEvent[]>([]);

      // Mock Inject Forms
      const [instaLink, setInstaLink] = useState(""); const [caption, setCaption] = useState(""); const [posterUrl, setPosterUrl] = useState("");
      const [isInjecting, setIsInjecting] = useState(false);

      // Approval Modal fields
      const [approvingItem, setApprovingItem] = useState<CandidateEvent | null>(null);
      const [apTitle, setApTitle] = useState(""); const [apDate, setApDate] = useState(""); const [apTime, setApTime] = useState("");
      const [apVenue, setApVenue] = useState(""); const [apArtists, setApArtists] = useState(""); const [apTicket, setApTicket] = useState(""); const [apPrice, setApPrice] = useState("");
      const [isApproving, setIsApproving] = useState(false);

  useEffect(() => {
    return onSnapshot(query(collection(db, "candidate_events")), snap => setCandidates(snap.docs.map(d => ({id: d.id, ...d.data() } as CandidateEvent))));
  }, []);

  const handleInject = async (e: React.FormEvent) => {
        e.preventDefault(); if (!instaLink.trim()) return; setIsInjecting(true);
      let parsedInfo = {title: "", date: "", time: "", venueName: "", artistNames: "", ticketUrl: "", price: "" };
      try {
      // 1. [AI 파싱 기능] 캡션 정보가 있다면 내부 API를 타서 내용을 분석해 빼옵니다.
      if (caption.trim()) {
        try {
          const res = await fetch("/api/parse-event", {
        method: "POST", headers: {"Content-Type": "application/json" },
      body: JSON.stringify({caption})
          });
      const data = await res.json();
      if (data.success && data.data) {
        parsedInfo = data.data; // AI가 추출한 정보를 객체에 합침
          } else {
        console.warn("AI 파싱 실패/오류:", data.error);
      if (data.error && data.error.includes("OPENAI_API_KEY")) {
        alert("AI 파싱 기능 사용을 위해 환경변수(.env.local)에 OPENAI_API_KEY를 설정해야 합니다. \n일단 텍스트 원본만 빈칸 없이 적재됩니다.");
            }
          }
        } catch (apiErr) {
        console.error("API 연동 에러", apiErr);
        }
      }

      // 2. raw_posts 에 원본 데이터 저장
      const rawPostPayload = {instaLink, caption, posterUrl, createdAt: serverTimestamp() };
      const rawDocRef = await addDoc(collection(db, "raw_posts"), rawPostPayload);

      // 3. candidate_events 에 AI가 분석한 데이터(parsed Info)를 포함시켜 심사 후보로 등록
      await addDoc(collection(db, "candidate_events"), {
        rawPostId: rawDocRef.id,
      instaLink, caption, posterUrl,
      parsedTitle: parsedInfo.title || "",
      parsedDate: parsedInfo.date || "",
      parsedTime: parsedInfo.time || "",
      parsedVenue: parsedInfo.venueName || "",
      parsedArtists: parsedInfo.artistNames || "",
      parsedTicket: parsedInfo.ticketUrl || "", // 예매처 정보
      parsedPrice: parsedInfo.price || "", // 가격 정보
      createdAt: serverTimestamp()
      });

      setInstaLink(""); setCaption(""); setPosterUrl("");
    }
      catch (err) { } finally {setIsInjecting(false); }
  };

  const handleReject = async (id: string) => {
    if (window.confirm("이 후보를 반려하여 대기열에서 삭제하시겠습니까? (원문은 보존됩니다)")) {
        await deleteDoc(doc(db, "candidate_events", id));
    }
  };

  // 모달 오픈 시, 기존의 빈칸 대신 AI가 발라낸 데이터(parsed~)를 최우선으로 선탑재!
  const openMod = (can: CandidateEvent) => {
        setApprovingItem(can);
      setApTitle(can.parsedTitle || "");
      setApDate(can.parsedDate || "");
      setApTime(can.parsedTime || "");
      setApVenue(can.parsedVenue || "");
      setApArtists(can.parsedArtists || "");
    setApTicket(can.parsedTicket || can.instaLink); // 우선권 예매처 > 기본 인스타
      setApPrice(can.parsedPrice || "");
  };

  const handleApprove = async (e: React.FormEvent) => {
        e.preventDefault(); if (!approvingItem || !apTitle.trim()) return; setIsApproving(true);
      try {
        // 추가
        await addDoc(collection(db, "events"), {
          title: apTitle,
          date: apDate,
          time: apTime,
          venueName: apVenue,
          artistNames: apArtists,
          sourceUrl: apTicket,
          instagramUrl: approvingItem.instaLink || "",
          price: apPrice,
          createdAt: serverTimestamp(),
        });
      // 치우기
      await deleteDoc(doc(db, "candidate_events", approvingItem.id));
      setApprovingItem(null);
    } catch (err) { } finally {setIsApproving(false); }
  };

      return (
      <>
        {/* 승인 결재창 모달 (AI 데이터가 선탑재 됨) */}
        {approvingItem && (
          <div className="fixed inset-0 z-50 bg-[#0a0a0a]/90 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-300">
            <div className="bg-[#121212] border border-white/10 w-full max-w-2xl rounded-[2rem] p-8 shadow-2xl relative max-h-[90vh] overflow-y-auto custom-scrollbar">
              <h2 className="text-2xl font-bold text-white mb-6 flex items-center gap-2">
                <span className="text-amber-500">✅</span> AI 분석 보고서 최종 승인 발행
              </h2>
              <div className="mb-6 p-5 bg-black/40 rounded-2xl max-h-32 overflow-y-auto custom-scrollbar text-xs text-zinc-500 border border-white/5 font-mono leading-relaxed">
                <span className="text-zinc-300 block mb-2 font-bold font-sans">원문 캡션 참고:</span>
                {approvingItem.caption || "수집된 캡션 기록이 없습니다."}
              </div>

              <form onSubmit={handleApprove} className="space-y-4">
                <Input label="공연 제목 (필수)" value={apTitle} onChange={setApTitle} required />
                <div className="grid grid-cols-2 gap-4">
                  <Input label="날짜" value={apDate} onChange={setApDate} />
                  <Input label="시간" value={apTime} onChange={setApTime} />
                </div>
                <Input label="장소" value={apVenue} onChange={setApVenue} />
                <div className="grid grid-cols-2 gap-4">
                  <Input label="아티스트" value={apArtists} onChange={setApArtists} />
                  <Input label="티켓 가격" value={apPrice} onChange={setApPrice} />
                </div>
                <Input label="예매처 링크 (또는 안내사항)" value={apTicket} onChange={setApTicket} />

                <div className="pt-8 flex gap-3">
                  <button disabled={isApproving} className="flex-1 bg-white text-black hover:bg-zinc-200 font-bold py-4 rounded-2xl transition shadow-md">정식 리스트로 즉시 발행</button>
                  <button type="button" onClick={() => setApprovingItem(null)} className="px-8 bg-white/5 border border-white/5 text-zinc-400 hover:text-white font-medium py-4 rounded-2xl transition">확인 취소</button>
                </div>
              </form>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-10">
          <div className="lg:col-span-4 flex flex-col gap-6 self-start lg:sticky lg:top-8 max-h-[calc(100vh-4rem)] overflow-y-auto px-1 pb-4 custom-scrollbar">
            <div className="bg-[#121212] border border-white/5 rounded-[2rem] p-7 md:p-8 shadow-2xl relative">
              <h2 className="text-lg font-semibold mb-6 text-white flex items-center gap-2">자동 파싱 시뮬레이터</h2>
              <p className="text-xs text-zinc-500 mb-6 font-medium leading-relaxed">크롤러 대신 수동으로 링크를 제출하면, 시스템 내부의 인공지능(AI)이 캡션을 분석하여 핵심 정보를 요약 보고하도록 세팅되었습니다.</p>
              <form onSubmit={handleInject} className="space-y-4">
                <Input label="인스타 게시물 원본 링크" value={instaLink} onChange={setInstaLink} required />
                <div>
                  <label className="block text-xs font-medium text-zinc-500 mb-2 pl-1">분석할 원문 캡션 복사붙여넣기</label>
                  <textarea value={caption} onChange={e => setCaption(e.target.value)} placeholder="이 텍스트를 AI가 분석하여 우측 항목으로 자동 추출합니다." className="w-full bg-white/5 border border-transparent focus:border-white/10 rounded-2xl px-5 py-4 text-sm text-white h-32 resize-none outline-none custom-scrollbar" />
                </div>
                <button disabled={isInjecting} className="w-full mt-4 bg-white/10 text-white hover:bg-white/20 py-4 rounded-2xl font-bold transition shadow-sm">AI 분석 후 큐에 밀어넣기</button>
              </form>
            </div>
          </div>

          <div className="lg:col-span-8 flex flex-col gap-5">
            <div className="flex items-center justify-between px-2">
              <h2 className="text-lg font-semibold text-white">AI 자동 파싱 큐 대기열 (candidate_events)</h2>
              <span className="text-xs font-bold bg-amber-500/20 text-amber-500 px-3 py-1.5 rounded-full">{candidates.length}</span>
            </div>
            {candidates.length === 0 ? (
              <div className="bg-[#121212] border border-white/5 rounded-[2rem] p-16 text-center flex flex-col items-center justify-center">
                <p className="text-zinc-500 font-medium">현재 AI 심사 대기 중인 항목이 없습니다.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {candidates.map(can => (
                  <div key={can.id} className="bg-[#121212] border border-amber-500/20 rounded-3xl p-6 flex flex-col gap-4 group hover:border-amber-500/50 transition-colors">
                    <div className="flex-1">
                      <a href={can.instaLink} target="_blank" rel="noreferrer" className="text-xs font-medium text-blue-400 hover:text-blue-300 underline underline-offset-4 decoration-blue-500/30 inline-block mb-3">게시물 원본 열기 ↗</a>

                      {/* 포스터 프레임 추가 */}
                      {can.posterUrl && (
                        <a href={can.posterUrl} target="_blank" rel="noreferrer" className="block mb-4 h-48 w-full rounded-2xl overflow-hidden bg-black/40 border border-white/5 relative group shrink-0">
                          <img
                            src={can.posterUrl}
                            alt="포스터 이미지"
                            referrerPolicy="no-referrer"
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                            onError={(e) => { e.currentTarget.style.display = 'none'; e.currentTarget.parentElement!.style.display = 'none'; }}
                          />
                          <div className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity">
                            <span className="text-xs font-bold text-white bg-black/60 px-3 py-1.5 rounded-full backdrop-blur-sm">이미지 원본 보기</span>
                          </div>
                        </a>
                      )}

                      <div className="text-xs text-zinc-500 line-clamp-3 leading-relaxed bg-black/40 p-4 rounded-xl mb-4 italic custom-scrollbar">"{can.caption || "내용 없음"}"</div>

                      {/* AI Review Report Output Card */}
                      <div className="bg-gradient-to-br from-amber-500/5 to-amber-500/10 border border-amber-500/20 rounded-2xl p-4 space-y-2 relative overflow-hidden">
                        <div className="absolute top-0 right-0 px-3 py-1.5 bg-amber-500 text-black text-[10px] font-black rounded-bl-xl tracking-wide">AI REPORT</div>
                        <p className="font-bold text-amber-400 mb-2 mt-1 flex items-center gap-1.5"><span className="text-sm">🤖</span> 데이터 분석 결과</p>

                        {can.parsedTitle && <p className="text-sm text-zinc-100 truncate flex gap-2"><span className="w-12 shrink-0 text-zinc-500 font-medium text-xs pt-0.5">제목</span> <span className="font-bold text-amber-100 truncate">{can.parsedTitle}</span></p>}
                        {(can.parsedDate || can.parsedTime) && <p className="text-sm text-zinc-100 truncate flex gap-2"><span className="w-12 shrink-0 text-zinc-500 font-medium text-xs pt-0.5">일시</span> <span>{can.parsedDate} {can.parsedTime}</span></p>}
                        {can.parsedVenue && <p className="text-sm text-zinc-100 truncate flex gap-2"><span className="w-12 shrink-0 text-zinc-500 font-medium text-xs pt-0.5">장소</span> <span>{can.parsedVenue}</span></p>}
                        {can.parsedArtists && <p className="text-sm text-zinc-100 truncate flex gap-2"><span className="w-12 shrink-0 text-zinc-500 font-medium text-xs pt-0.5">출연</span> <span className="text-emerald-300/80">{can.parsedArtists}</span></p>}
                        {can.parsedTicket && <p className="text-sm text-zinc-100 truncate flex gap-2"><span className="w-12 shrink-0 text-zinc-500 font-medium text-xs pt-0.5">예매</span> <span className="text-blue-300/80 underline decoration-blue-500/30 truncate">{can.parsedTicket}</span></p>}
                        {can.parsedPrice && <p className="text-sm text-zinc-100 truncate flex gap-2"><span className="w-12 shrink-0 text-zinc-500 font-medium text-xs pt-0.5">가격</span> <span className="text-pink-300/80 font-bold">{can.parsedPrice}</span></p>}

                        {(!can.parsedTitle && !can.parsedDate && !can.parsedVenue && !can.parsedArtists) && (
                          <p className="text-xs text-zinc-500 mt-2">AI가 내용을 분석하지 못했거나 연결되지 않았습니다.</p>
                        )}
                      </div>
                    </div>

                    <div className="flex gap-2 mt-2 pt-4 border-t border-white/5">
                      <button onClick={() => openMod(can)} className="flex-1 py-3.5 bg-amber-500 text-black hover:bg-amber-400 rounded-2xl text-xs font-bold transition shadow-[0_0_15px_rgba(245,158,11,0.2)]">AI 요약본 기반으로 승인결재</button>
                      <button onClick={() => handleReject(can.id)} className="px-5 py-3.5 bg-white/5 text-zinc-400 hover:text-white hover:bg-white/10 rounded-2xl text-xs font-semibold transition">반려</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </>
      );
}

      // ----------------------------------------------------------------------
      // Reusable Input Component
      // ----------------------------------------------------------------------
      function Input({label, value, onChange, placeholder, type = "text", required = false}: any) {
  return (
      <div>
        <label className="block text-xs font-medium text-zinc-500 mb-2 pl-1">{label}</label>
        <input
          type={type} value={value} onChange={e => onChange(e.target.value)} required={required} placeholder={placeholder}
          className="w-full bg-white/5 border border-transparent focus:border-white/10 focus:bg-white/10 rounded-2xl px-5 py-4 text-sm text-white placeholder-zinc-600 transition-all outline-none"
        />
      </div>
      );
}