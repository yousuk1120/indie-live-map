"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/firestore";

type EventItem = {
  id: string;
  title: string;
  date: string;
  time: string;
  venueName: string;
  artistNames: string;
  sourceUrl: string;
  price: string;
  posterUrl: string;
};

const safeText = (value: unknown): string => {
  if (value == null) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(safeText).filter(Boolean).join(", ");
  if (typeof value === "object") return Object.values(value as Record<string, unknown>).map(safeText).filter(Boolean).join(", ");
  return "";
};

const normalizeEvent = (id: string, raw: Record<string, unknown>): EventItem => ({
  id,
  title: safeText(raw.title),
  date: safeText(raw.date),
  time: safeText(raw.time),
  venueName: safeText(raw.venueName),
  artistNames: safeText(raw.artistNames),
  sourceUrl: safeText(raw.sourceUrl),
  price: safeText(raw.price),
  posterUrl: safeText(raw.posterUrl),
});

const getExternalLink = (value?: string) => {
  const trimmed = safeText(value);
  if (!trimmed) return "";
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) return trimmed;
  if (trimmed.startsWith("@")) return `https://www.instagram.com/${trimmed.slice(1)}`;
  if (/^(www\.)?[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}(\/.*)?$/.test(trimmed)) return `https://${trimmed}`;
  return "";
};

const getPriceLines = (value?: string) => {
  const text = safeText(value);
  if (!text) return [] as string[];
  return [...new Set(
    text
      .replace(/\r\n|\r|\n/g, ", ")
      .replace(/\s*\/\s*/g, ", ")
      .replace(/\s*·\s*/g, ", ")
      .replace(/,\s*(예매|현매)\s*/g, "\n$1 ")
      .replace(/(예매|현매)\s*(\d)/g, "$1 $2")
      .split("\n")
      .flatMap((line) => line.split(","))
      .map((line) => line.trim().replace(/\s{2,}/g, " "))
      .filter(Boolean)
  )];
};

const hasPoster = (url?: string) => {
  const value = safeText(url);
  return !!value && !value.startsWith("data:") && (value.startsWith("http://") || value.startsWith("https://"));
};

export default function EventDetailPage() {
  const router = useRouter();
  const params = useParams();
  const eventId = params.id as string;

  const [eventData, setEventData] = useState<EventItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!eventId) return;

    const fetchEvent = async () => {
      try {
        const snap = await getDoc(doc(db, "events", eventId));
        if (!snap.exists()) {
          setError("해당 공연 정보를 찾을 수 없습니다.");
          return;
        }

        setEventData(normalizeEvent(snap.id, snap.data() as Record<string, unknown>));
      } catch (err) {
        console.error("이벤트 상세 로딩 에러:", err);
        setError("공연 상세 정보를 불러오지 못했습니다.");
      } finally {
        setLoading(false);
      }
    };

    fetchEvent();
  }, [eventId]);

  const externalLink = useMemo(() => getExternalLink(eventData?.sourceUrl), [eventData?.sourceUrl]);
  const priceLines = useMemo(() => getPriceLines(eventData?.price), [eventData?.price]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[linear-gradient(180deg,#06111f_0%,#08101d_35%,#050914_100%)] text-white">
        <p className="text-sm font-medium text-slate-400">공연 상세 정보를 불러오는 중입니다...</p>
      </div>
    );
  }

  if (error || !eventData) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[linear-gradient(180deg,#06111f_0%,#08101d_35%,#050914_100%)] px-6 text-center text-white">
        <h1 className="text-3xl font-black tracking-tight">페이지를 찾을 수 없습니다.</h1>
        <p className="mt-3 text-slate-400">{error || "잘못된 주소이거나 삭제된 공연입니다."}</p>
        <button
          type="button"
          onClick={() => router.push("/")}
          className="mt-8 rounded-2xl bg-white px-6 py-3 text-sm font-semibold text-slate-900 transition hover:bg-slate-100"
        >
          홈으로 돌아가기
        </button>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#06111f_0%,#08101d_35%,#050914_100%)] px-4 py-8 text-white md:px-8 md:py-10">
      <div className="mx-auto max-w-6xl">
        <button
          type="button"
          onClick={() => router.back()}
          className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-slate-300 transition hover:bg-white/10 hover:text-white"
        >
          ← 뒤로 가기
        </button>

        <section className="grid gap-5 lg:grid-cols-[0.88fr_1.12fr]">
          <article className="overflow-hidden rounded-[2rem] border border-white/10 bg-[linear-gradient(160deg,rgba(15,23,42,.96),rgba(11,18,32,.92))] shadow-[0_24px_80px_rgba(0,0,0,.28)]">
            <div className="border-b border-white/10 bg-black/20 p-5">
              {hasPoster(eventData.posterUrl) ? (
                <img
                  src={eventData.posterUrl}
                  alt={eventData.title || "공연 포스터"}
                  className="mx-auto max-h-[620px] w-full rounded-[1.5rem] object-contain"
                  loading="lazy"
                  decoding="async"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="flex min-h-[320px] items-end rounded-[1.5rem] bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,.25),transparent_35%),linear-gradient(180deg,#111827,#020617)] p-6">
                  <span className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs font-semibold text-sky-100">
                    Live Schedule Detail
                  </span>
                </div>
              )}
            </div>
          </article>

          <article className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-6 shadow-[0_24px_80px_rgba(0,0,0,.18)] md:p-8">
            <div className="flex flex-wrap gap-2">
              {eventData.date && <span className="rounded-full bg-sky-400/10 px-3 py-1 text-xs font-semibold text-sky-200">{eventData.date}</span>}
              {eventData.time && <span className="rounded-full bg-white/6 px-3 py-1 text-xs font-semibold text-slate-300">{eventData.time}</span>}
              {eventData.venueName && <span className="rounded-full bg-white/6 px-3 py-1 text-xs font-semibold text-slate-300">{eventData.venueName}</span>}
            </div>

            <h1 className="mt-5 text-3xl font-black leading-snug tracking-[-0.03em] text-white md:text-5xl">
              {eventData.title || "제목 없는 공연"}
            </h1>

            {eventData.artistNames && <p className="mt-5 text-base leading-8 text-slate-300">{eventData.artistNames}</p>}

            <div className="mt-8 space-y-5">
              <DetailRow label="일시">{[eventData.date, eventData.time].filter(Boolean).join(" ") || "미정"}</DetailRow>
              <DetailRow label="장소">{eventData.venueName || "미정"}</DetailRow>
              <DetailRow label="출연">{eventData.artistNames || "추후 공개"}</DetailRow>
              {priceLines.length > 0 && (
                <DetailRow label="티켓">
                  <div className="space-y-1">
                    {priceLines.map((line) => (
                      <p key={line} className="font-bold text-sky-300">
                        {line}
                      </p>
                    ))}
                  </div>
                </DetailRow>
              )}
              {eventData.sourceUrl && (
                <DetailRow label="예매 및 안내">
                  {externalLink ? (
                    <a
                      href={externalLink}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-2 rounded-full border border-sky-400/20 bg-sky-400/10 px-4 py-2 text-sm font-semibold text-sky-200 transition hover:bg-sky-400/15"
                    >
                      외부 안내 링크 열기 ↗
                    </a>
                  ) : (
                    <p className="whitespace-pre-line leading-7 text-slate-200">{eventData.sourceUrl}</p>
                  )}
                </DetailRow>
              )}
            </div>
          </article>
        </section>
      </div>
    </main>
  );
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-[1.5rem] border border-white/10 bg-black/20 p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <div className="mt-3 text-base font-medium text-white">{children}</div>
    </div>
  );
}