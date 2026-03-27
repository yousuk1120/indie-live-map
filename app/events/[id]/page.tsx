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

function toText(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(toText).filter(Boolean).join(", ");
  if (typeof value === "object") return Object.values(value as Record<string, unknown>).map(toText).filter(Boolean).join(", ");
  return "";
}

function normalizeDate(date?: string) {
  const value = toText(date);
  if (!value) return "";
  const parts = value.split("-");
  if (parts.length !== 3) return value;
  const [yy, mm, dd] = parts;
  const year = yy.length === 2 ? `20${yy}` : yy;
  return `${year}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
}

function formatSchedule(date?: string, time?: string) {
  const normalized = normalizeDate(date);
  if (!normalized) return "일정 미정";
  const parsed = new Date(`${normalized}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return [toText(date), toText(time)].filter(Boolean).join(" · ") || "일정 미정";
  const week = ["일", "월", "화", "수", "목", "금", "토"][parsed.getDay()];
  return `${parsed.getFullYear()}.${String(parsed.getMonth() + 1).padStart(2, "0")}.${String(parsed.getDate()).padStart(2, "0")} (${week})${time ? ` · ${time}` : ""}`;
}

function formatExternalUrl(value?: string) {
  const raw = toText(value);
  if (!raw) return "";
  if (raw.startsWith("http://") || raw.startsWith("https://")) return raw;
  if (raw.startsWith("@")) return `https://www.instagram.com/${raw.slice(1)}`;
  if (/^(www\.)?[\w.-]+\.[a-z]{2,}(\/.*)?$/i.test(raw) && !raw.includes(" ")) return `https://${raw}`;
  return "";
}

function formatPriceLines(value?: string): string[] {
  const raw = toText(value);
  if (!raw) return [] as string[];

  const flattened = raw
    .replace(/\r?\n/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\s*\/\s*/g, "\n")
    .replace(/\s*\|\s*/g, "\n")
    .replace(/\s*·\s*/g, "\n")
    .replace(/(?<!^)\s*(예매|현매|예판|당일|door)\s*[:：]?\s*/gi, "\n$1 ")
    .replace(/\n+/g, "\n")
    .trim();

  return Array.from(
    new Set(
      flattened
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line: string) => {
          const priceMatch = line.match(/(\d[\d,\s]*\d|\d)\s*원/i);
          let next = line;
          if (priceMatch) {
            const digits = priceMatch[1].replace(/[^\d]/g, "");
            if (digits) next = next.replace(priceMatch[0], `${Number(digits).toLocaleString("ko-KR")}원`);
          }
          return next.replace(/\s{2,}/g, " ").trim();
        })
    )
  );
}

function isValidPoster(url?: string) {
  const value = toText(url);
  return !!value && !value.startsWith("data:") && (value.startsWith("http://") || value.startsWith("https://"));
}

function normalizeEvent(id: string, raw: Record<string, unknown>): EventItem {
  return {
    id,
    title: toText(raw.title),
    date: toText(raw.date),
    time: toText(raw.time),
    venueName: toText(raw.venueName),
    artistNames: toText(raw.artistNames),
    sourceUrl: toText(raw.sourceUrl),
    price: toText(raw.price),
    posterUrl: toText(raw.posterUrl),
  };
}

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
          setError("공연 정보를 찾을 수 없습니다.");
          return;
        }
        setEventData(normalizeEvent(snap.id, snap.data() as Record<string, unknown>));
      } catch (err) {
        console.error("공연 상세 로딩 실패:", err);
        setError("공연 정보를 불러오지 못했습니다.");
      } finally {
        setLoading(false);
      }
    };

    fetchEvent();
  }, [eventId]);

  const externalUrl = useMemo(() => formatExternalUrl(eventData?.sourceUrl), [eventData?.sourceUrl]);
  const priceLines = useMemo(() => formatPriceLines(eventData?.price), [eventData?.price]);

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center px-6 text-sm font-medium text-slate-400">
        공연 정보를 불러오는 중입니다.
      </main>
    );
  }

  if (error || !eventData) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
        <h1 className="text-3xl font-black tracking-[-0.04em] text-white">페이지를 찾을 수 없습니다.</h1>
        <p className="mt-3 text-sm leading-6 text-slate-400">{error || "잘못된 주소이거나 삭제된 공연입니다."}</p>
        <button
          type="button"
          onClick={() => router.push("/")}
          className="mt-8 rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
        >
          홈으로 돌아가기
        </button>
      </main>
    );
  }

  return (
    <main className="min-h-screen px-4 pb-16 pt-6 md:px-8 md:pt-8">
      <div className="mx-auto max-w-[1320px] space-y-5">
        <button
          type="button"
          onClick={() => router.back()}
          className="inline-flex h-11 items-center rounded-full border border-white/10 bg-white/5 px-5 text-sm font-semibold text-white transition hover:bg-white/10"
        >
          ← 뒤로 가기
        </button>

        <section className="site-shell overflow-hidden rounded-[32px] border border-white/10">
          <div className="grid min-h-[calc(100vh-140px)] gap-0 lg:grid-cols-[0.9fr_1.1fr]">
            <div className="border-b border-white/10 bg-black/25 p-5 lg:border-b-0 lg:border-r lg:p-6">
              {isValidPoster(eventData.posterUrl) ? (
                <img
                  src={eventData.posterUrl}
                  alt={eventData.title || "공연 포스터"}
                  className="h-full max-h-[82vh] w-full rounded-[24px] object-cover"
                  loading="lazy"
                  decoding="async"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="flex h-full min-h-[460px] items-end rounded-[24px] bg-[radial-gradient(circle_at_top_left,rgba(61,197,255,0.22),transparent_30%),linear-gradient(180deg,#10182d,#0a1020)] p-6">
                  <span className="rounded-full border border-white/10 bg-white/8 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-slate-200">
                    Live Detail
                  </span>
                </div>
              )}
            </div>

            <div className="flex flex-col justify-between p-6 md:p-8 lg:p-10">
              <div>
                <div className="flex flex-wrap gap-2">
                  <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-slate-200">
                    {formatSchedule(eventData.date, eventData.time)}
                  </span>
                  {eventData.venueName ? (
                    <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-slate-200">
                      {eventData.venueName}
                    </span>
                  ) : null}
                </div>

                <h1 className="mt-5 max-w-4xl text-4xl font-black leading-[0.96] tracking-[-0.06em] text-white md:text-6xl">
                  {eventData.title || "제목 없는 공연"}
                </h1>

                {eventData.artistNames ? (
                  <p className="mt-6 max-w-3xl text-base leading-8 text-slate-300 md:text-lg">{eventData.artistNames}</p>
                ) : null}
              </div>

              <div className="mt-10 space-y-4">
                <InfoBlock label="일시" value={formatSchedule(eventData.date, eventData.time)} />
                <InfoBlock label="장소" value={eventData.venueName || "미정"} />
                <InfoBlock label="출연" value={eventData.artistNames || "미정"} />

                {priceLines.length ? (
                  <div className="rounded-[24px] border border-cyan-300/15 bg-cyan-300/[0.07] p-5">
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-200">Ticket</p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {priceLines.map((line) => (
                        <span key={line} className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1.5 text-sm font-semibold text-cyan-100">
                          {line}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}

                {eventData.sourceUrl ? (
                  <div className="rounded-[24px] border border-white/10 bg-black/16 p-5">
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Link</p>
                    {externalUrl ? (
                      <a
                        href={externalUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-4 inline-flex h-11 items-center rounded-full bg-white px-5 text-sm font-semibold text-slate-950 transition hover:bg-slate-200"
                      >
                        예매 / 원문 열기 ↗
                      </a>
                    ) : (
                      <p className="mt-4 whitespace-pre-line text-sm leading-7 text-slate-200">{eventData.sourceUrl}</p>
                    )}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

function InfoBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[24px] border border-white/10 bg-black/16 p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">{label}</p>
      <p className="mt-3 text-base font-semibold text-white md:text-lg">{value}</p>
    </div>
  );
}
