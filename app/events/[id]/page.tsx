"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/firestore";

type EventItem = {
  id: string;
  title?: string;
  date?: string;
  time?: string;
  venueName?: string;
  artistNames?: string;
  sourceUrl?: string;
};

export default function EventDetailPage() {
  const router = useRouter();
  const params = useParams(); // Next.js 14/15 환경 모두에서 안전한 클라이언트 파라미터 접근법
  const eventId = params.id as string;

  const [eventData, setEventData] = useState<EventItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!eventId) return;

    const fetchEventDetail = async () => {
      try {
        const docRef = doc(db, "events", eventId);
        const docSnap = await getDoc(docRef);
        
        if (docSnap.exists()) {
          setEventData({ id: docSnap.id, ...(docSnap.data() as Omit<EventItem, "id">) });
        } else {
          setError(true); // 데이터가 없는 경우
        }
      } catch (err) {
        console.error("이벤트 문서 불러오기 에러:", err);
        setError(true);
      } finally {
        setLoading(false);
      }
    };

    fetchEventDetail();
  }, [eventId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <p className="text-zinc-500 font-medium">공연 상세 정보를 불러오는 중입니다...</p>
      </div>
    );
  }

  if (error || !eventData) {
    return (
      <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-6 text-center">
        <h1 className="text-2xl font-bold mb-4 text-white">해당 공연 정보를 찾을 수 없습니다.</h1>
        <p className="text-zinc-500 mb-8">URL이 잘못되었거나, 관리자에 의해 삭제된 공연일 수 있습니다.</p>
        <button 
          onClick={() => router.back()}
          className="bg-zinc-800 hover:bg-zinc-700 text-white px-6 py-2.5 rounded-lg transition font-medium"
        >
          돌아가기
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white p-6">
      <div className="max-w-3xl mx-auto pt-8">
        {/* 뒤로 가기 버튼 */}
        <button 
          onClick={() => router.back()}
          className="text-zinc-400 hover:text-white flex items-center gap-2 mb-8 transition group w-fit font-medium"
        >
          <svg className="w-5 h-5 group-hover:-translate-x-1.5 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          뒤로 가기
        </button>

        {/* 상세 뷰 컨테이너 */}
        <article className="bg-[#111111] border border-zinc-800 rounded-3xl p-8 md:p-12 shadow-2xl relative overflow-hidden">
          {/* 가벼운 데코레이션 요소 */}
          <div className="absolute top-0 right-0 w-32 h-32 bg-zinc-800/10 rounded-full blur-3xl -translate-y-10 translate-x-10"></div>
          
          <h1 className="text-3xl md:text-5xl font-extrabold text-white mb-10 leading-snug tracking-tight">
            {eventData.title}
          </h1>

          <div className="space-y-7 text-lg relative z-10">
            {/* 날짜와 시간 */}
            {(eventData.date || eventData.time) && (
              <div className="flex flex-col sm:flex-row gap-2 border-b border-zinc-800/60 pb-5">
                <span className="text-zinc-500 font-medium min-w-[120px]">일시</span>
                <span className="text-zinc-100 font-semibold">{eventData.date} {eventData.time}</span>
              </div>
            )}
            
            {/* 장소 */}
            {eventData.venueName && (
              <div className="flex flex-col sm:flex-row gap-2 border-b border-zinc-800/60 pb-5">
                <span className="text-zinc-500 font-medium min-w-[120px]">장소</span>
                <span className="text-zinc-100 font-semibold">{eventData.venueName}</span>
              </div>
            )}
            
            {/* 아티스트 */}
            {eventData.artistNames && (
              <div className="flex flex-col sm:flex-row gap-2 border-b border-zinc-800/60 pb-5">
                <span className="text-zinc-500 font-medium min-w-[120px]">출연자</span>
                <span className="text-zinc-100 font-semibold max-w-xl leading-relaxed">{eventData.artistNames}</span>
              </div>
            )}
            
            {/* 원본 링크 */}
            {eventData.sourceUrl && (
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 pt-4">
                <span className="text-zinc-500 font-medium min-w-[120px]">예매 및 안내</span>
                <a 
                  href={eventData.sourceUrl} 
                  target="_blank" 
                  rel="noreferrer" 
                  className="inline-flex items-center gap-2 text-blue-400 hover:text-blue-300 transition font-bold underline underline-offset-4 decoration-blue-500/30 hover:decoration-blue-400"
                >
                  원본 관련 링크 열기
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </a>
              </div>
            )}
          </div>
        </article>
      </div>
    </div>
  );
}
