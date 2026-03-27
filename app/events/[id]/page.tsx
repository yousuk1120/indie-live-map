"use client";

import { useEffect, useMemo, useState } from "react";
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
  price?: string;
  posterUrl?: string;
};

function formatExternalUrl(value?: string) {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) return trimmed;
  if (trimmed.startsWith("@")) return `https://instagram.com/${trimmed.slice(1)}`;
  if (/^(www\.)?[\w.-]+\.[a-z]{2,}(\/.*)?$/i.test(trimmed) && !trimmed.includes(" ")) {
    return `https://${trimmed}`;
  }
  return null;
}

function formatPriceLines(value?: string) {
  if (!value) return [] as string[];
  let normalized = value
    .replace(/\s*\/\s*/g, ", ")
    .replace(/\s*\|\s*/g, ", ")
    .replace(/\s*·\s*/g, ", ");

  normalized = normalized
    .replace(/\s*,\s*(?=(예매|현매|예판|당일|door))/gi, "\n")
    .replace(/(?<!^)(?=(예매|현매|예판|당일|door))/gi, "\n");

  const parts = normalized
    .split(/\n|,(?=\s*(예매|현매|예판|당일|door|무료|일반|학생))/i)
    .map((part) => part.trim())
    .filter(Boolean);

  return parts.length > 0 ? parts : [value.trim()];
}

export default function EventDetailPage() {
  const router = useRouter();
  const params = useParams();
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
          setError(true);
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

  const externalUrl = useMemo(() => formatExternalUrl(eventData?.sourceUrl), [eventData?.sourceUrl]);
  const priceLines = useMemo(() => formatPriceLines(eventData?.price), [eventData?.price]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center px-6 text-center text-slate-300">
        공연 상세 정보를 불러오는 중입니다.
      </div>
    );
  }

  if (error || !eventData) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
        <h1 className="text-2xl font-semibold text-white">공연 정보를 찾을 수 없어요.</h1>
        <p className="mt-3 max-w-md text-sm leading-6 text-slate-400">
          URL이 잘못되었거나, 삭제된 공연일 수 있습니다.
        </p>
        <button
          onClick={() => router.push("/")}
          className="mt-8 rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
        >
          홈으로 돌아가기
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen px-4 py-8 md:px-6 md:py-12">
      <div className="mx-auto max-w-5xl">
        <button
          onClick={() => router.back()}
          className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-slate-200 transition hover:bg-white/10"
        >
          ← 뒤로 가기
        </button>

        <div className="overflow-hidden rounded-[2rem] border border-white/10 bg-[linear-gradient(180deg,rgba(17,24,39,0.94),rgba(8,11,18,0.96))] shadow-[0_30px_80px_rgba(2,6,23,0.5)]">
          <div className="grid gap-0 lg:grid-cols-[1.05fr_0.95fr]">
            <div className="border-b border-white/8 bg-black/20 p-5 lg:border-b-0 lg:border-r lg:p-8">
              {eventData.posterUrl ? (
                <img
                  src={eventData.posterUrl}
                  alt={eventData.title || "공연 포스터"}
                  className="h-full max-h-[720px] w-full rounded-[1.5rem] object-cover"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="flex min-h-[420px] items-center justify-center rounded-[1.5rem] border border-dashed border-white/10 bg-white/5 text-slate-400">
                  등록된 포스터가 없습니다.
                </div>
              )}
            </div>

            <div className="p-6 md:p-8 lg:p-10">
              <span className="inline-flex rounded-full border border-blue-400/25 bg-blue-400/10 px-3 py-1 text-xs font-semibold tracking-[0.16em] text-blue-200">
                라이브클럽 · 인디공연장 일정
              </span>
              <h1 className="mt-5 text-3xl font-semibold leading-tight text-white md:text-4xl">
                {eventData.title || "제목 없는 공연"}
              </h1>

              <div className="mt-8 space-y-4 rounded-[1.5rem] border border-white/8 bg-white/5 p-5">
                <DetailRow label="일시" value={[eventData.date, eventData.time].filter(Boolean).join(" ") || "미정"} />
                <DetailRow label="장소" value={eventData.venueName || "미정"} />
                <DetailRow label="출연" value={eventData.artistNames || "추가 예정"} />
              </div>

              {priceLines.length > 0 && (
                <div className="mt-6 rounded-[1.5rem] border border-blue-400/20 bg-blue-400/10 p-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-200">티켓 정보</p>
                  <div className="mt-4 space-y-2">
                    {priceLines.map((line) => (
                      <p key={line} className="text-base font-semibold text-white">
                        {line}
                      </p>
                    ))}
                  </div>
                </div>
              )}

              {eventData.sourceUrl && (
                <div className="mt-6 rounded-[1.5rem] border border-white/8 bg-white/5 p-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">예매 / 안내</p>
                  {externalUrl ? (
                    <a
                      href={externalUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-4 inline-flex items-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-slate-200"
                    >
                      예매 / 원문 열기 ↗
                    </a>
                  ) : (
                    <p className="mt-4 whitespace-pre-line text-sm leading-6 text-slate-200">{eventData.sourceUrl}</p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 border-b border-white/8 pb-4 last:border-b-0 last:pb-0 sm:flex-row sm:gap-4">
      <span className="min-w-[72px] text-sm text-slate-400">{label}</span>
      <span className="text-base font-medium text-white">{value}</span>
    </div>
  );
}
