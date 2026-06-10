"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/firestore";
import {
  type EventItem,
  normalizeEvent,
  normalizeDate,
  formatSchedule,
  formatPriceLines,
  getInstagramLink,
  toText,
} from "@/lib/events";

function extractExternalUrl(value?: string) {
  const raw = toText(value);
  if (!raw) return "";

  const http = raw.match(/https?:\/\/[^\s)]+/i);
  if (http) return http[0].replace(/[),.;]+$/, "");

  const instaPath = raw.match(/(?:www\.)?instagram\.com\/[A-Za-z0-9_./?=&%-]+/i);
  if (instaPath) {
    const cleaned = instaPath[0].replace(/^https?:\/\//i, "").replace(/[),.;]+$/, "");
    return `https://${cleaned}`;
  }

  const handle = raw.match(/@[A-Za-z0-9._]{2,30}/);
  if (handle) return `https://www.instagram.com/${handle[0].slice(1)}`;

  const looseUrl = raw.match(/(?:www\.)?[A-Za-z0-9.-]+\.[A-Za-z]{2,}(?:\/[^\s)]*)?/);
  if (looseUrl && !raw.includes(" ")) return `https://${looseUrl[0].replace(/^https?:\/\//i, "")}`;

  return "";
}

function extractInfoLink(event: EventItem) {
  const source = extractExternalUrl(event.sourceUrl);
  if (source && !/instagram\.com/i.test(source)) return source;
  return "";
}

function formatDayLabel(dateKey: string) {
  const normalized = normalizeDate(dateKey);
  const parsed = new Date(`${normalized}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return dateKey;
  const week = ["일", "월", "화", "수", "목", "금", "토"][parsed.getDay()];
  return `${String(parsed.getMonth() + 1).padStart(2, "0")}.${String(parsed.getDate()).padStart(2, "0")} (${week})`;
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

  const instagramUrl = useMemo(() => (eventData ? getInstagramLink(eventData) : ""), [eventData]);
  const infoUrl = useMemo(() => (eventData ? extractInfoLink(eventData) : ""), [eventData]);
  const priceLines = useMemo(() => formatPriceLines(eventData?.price), [eventData?.price]);

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[var(--bg)]">
        <div className="flex flex-col items-center gap-4">
          <div className="auth-spinner" />
          <p className="text-sm text-[var(--muted)]">공연 정보를 불러오는 중입니다.</p>
        </div>
      </main>
    );
  }

  if (error || !eventData) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-[var(--bg)] px-6 text-center">
        <h1 className="text-3xl font-semibold tracking-[-0.03em] text-white">페이지를 찾을 수 없습니다.</h1>
        <p className="mt-3 text-sm text-[var(--muted)]">{error || "잘못된 주소이거나 삭제된 공연입니다."}</p>
        <button type="button" onClick={() => router.push("/")} className="primary-btn mt-8">
          홈으로 가기
        </button>
      </main>
    );
  }

  const dayLineups = eventData.dayLineups || [];

  return (
    <main className="relative min-h-screen overflow-x-clip bg-[var(--bg)] px-4 pb-16 pt-8 text-[var(--text)] md:px-8 md:pt-10">
      <div aria-hidden className="bg-aurora" />

      <div className="relative mx-auto max-w-4xl">
        <button type="button" onClick={() => router.back()} className="secondary-btn mb-6">
          ← 뒤로 가기
        </button>

        <section className="panel animate-fade-in p-6 md:p-8">
          <p className="text-sm font-medium text-[var(--muted)]">{formatSchedule(eventData)}</p>

          <h1 className="mt-3 text-4xl font-semibold tracking-[-0.04em] text-white md:text-5xl">
            {eventData.title || "제목 없는 공연"}
          </h1>

          <div className="mt-8 grid gap-4 md:grid-cols-2">
            <InfoCard label="Venue" value={eventData.venueName || "미정"} />
            <InfoCard label="Artists" value={eventData.artistNames || "미정"} />
            <InfoCard label="Schedule" value={`${formatSchedule(eventData)}${eventData.time ? ` · ${eventData.time}` : ""}`} />
            <InfoCard label="Ticket" value={priceLines.join("\n") || "정보 없음"} preserveLineBreak />
          </div>

          {/* 날짜별 라인업 (멀티데이 페스티벌) */}
          {dayLineups.length > 0 && (
            <div className="mt-8">
              <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--accent)]">
                Day by Day Lineup
              </p>
              <div className="space-y-2">
                {dayLineups.map((day) => (
                  <div
                    key={day.date}
                    className="flex flex-col gap-1 rounded-2xl border border-[var(--line)] bg-[var(--panel-2)] p-4 sm:flex-row sm:items-baseline sm:gap-4"
                  >
                    <span className="shrink-0 text-sm font-bold tabular-nums text-[var(--accent)]">
                      {formatDayLabel(day.date)}
                    </span>
                    <span className="text-sm leading-relaxed text-[var(--text-secondary)]">{day.artists}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="mt-8 flex flex-wrap gap-2">
            <a href={instagramUrl} target="_blank" rel="noreferrer" className="primary-btn">
              Instagram ↗
            </a>

            {infoUrl ? (
              <a href={infoUrl} target="_blank" rel="noreferrer" className="secondary-btn">
                예매 / 안내 링크 ↗
              </a>
            ) : null}
          </div>
        </section>
      </div>
    </main>
  );
}

function InfoCard({
  label,
  value,
  preserveLineBreak = false,
}: {
  label: string;
  value: string;
  preserveLineBreak?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-[var(--line)] bg-[var(--panel-2)] p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--muted)]">{label}</p>
      <p className={`mt-3 text-base font-medium text-white ${preserveLineBreak ? "whitespace-pre-line" : ""}`}>
        {value}
      </p>
    </div>
  );
}
