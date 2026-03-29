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
  instagramUrl?: string;
  price?: string;
};

function toText(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(toText).filter(Boolean).join(", ");
  if (typeof value === "object") return Object.values(value as Record<string, unknown>).map(toText).filter(Boolean).join(", ");
  return "";
}

function normalizeDate(value?: string) {
  const raw = toText(value);
  if (!raw) return "";
  const match = raw.match(/(\d{2,4})[./-](\d{1,2})[./-](\d{1,2})/);
  if (!match) return "";
  const [, y, m, d] = match;
  const year = y.length === 2 ? `20${y}` : y;
  return `${year}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

function formatSchedule(date?: string, time?: string) {
  const normalized = normalizeDate(date);
  if (!normalized) return "일정 미정";

  const parsed = new Date(`${normalized}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return [toText(date), toText(time)].filter(Boolean).join(" · ") || "일정 미정";
  }

  const week = ["일", "월", "화", "수", "목", "금", "토"][parsed.getDay()];
  return `${parsed.getFullYear()}.${String(parsed.getMonth() + 1).padStart(2, "0")}.${String(parsed.getDate()).padStart(2, "0")} (${week})${time ? ` · ${time}` : ""}`;
}

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

function extractInstagramUrl(event: EventItem) {
  const candidates = [toText(event.instagramUrl), toText(event.sourceUrl)].filter(Boolean);

  for (const raw of candidates) {
    const instaPath = raw.match(/(?:https?:\/\/)?(?:www\.)?instagram\.com\/[A-Za-z0-9_./?=&%-]+/i);
    if (instaPath) {
      const cleaned = instaPath[0].replace(/^https?:\/\//i, "").replace(/[),.;]+$/, "");
      return `https://${cleaned}`;
    }

    const handle = raw.match(/@[A-Za-z0-9._]{2,30}/);
    if (handle) return `https://www.instagram.com/${handle[0].slice(1)}`;
  }

  return "";
}

function buildInstagramFallback(event: EventItem) {
  const query = encodeURIComponent(
    [event.title, event.venueName, event.artistNames].filter(Boolean).join(" ")
  );
  return `https://www.instagram.com/explore/search/keyword/?q=${query || "concert"}`;
}

function getInstagramLink(event: EventItem) {
  return extractInstagramUrl(event) || buildInstagramFallback(event);
}

function extractInfoLink(event: EventItem) {
  const source = extractExternalUrl(event.sourceUrl);
  const instagram = extractInstagramUrl(event);
  if (source && source !== instagram) return source;
  return "";
}

function formatMoneyToken(token: string) {
  const digits = token.replace(/[^\d]/g, "");
  if (!digits) return token.trim();
  return `${Number(digits).toLocaleString("ko-KR")}원`;
}

function normalizeMoneyInText(text: string) {
  return text.replace(/\d[\d,\s]*원/g, (token) => formatMoneyToken(token));
}

function formatPriceLines(value?: string) {
  const raw = toText(value);
  if (!raw) return [] as string[];

  const normalized = raw
    .replace(/\r?\n/g, "\n")
    .replace(/\s*\/\s*/g, "\n")
    .replace(/\s*\|\s*/g, "\n")
    .replace(/\s*·\s*/g, "\n")
    .replace(/\s{2,}/g, " ")
    .trim();

  const parts = normalized.split("\n").map((part) => normalizeMoneyInText(part.trim())).filter(Boolean);

  return Array.from(
    new Set(
      parts.map((part) => {
        if (/free entry|무료/i.test(part)) return part;
        const labelMatch = part.match(/(예매|현매|예판|당일|door)/i);
        const label = labelMatch ? labelMatch[1].replace(/^door$/i, "현매") : "";
        const amounts = Array.from(part.matchAll(/\d[\d,]*원/g)).map((m) => m[0]);
        const amount = amounts.length ? amounts[amounts.length - 1] : "";
        if (label && amount) return `${label} ${amount}`;
        return part;
      })
    )
  );
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
    instagramUrl: toText((raw as Record<string, unknown>).instagramUrl),
    price: toText(raw.price),
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

  const instagramUrl = useMemo(() => (eventData ? getInstagramLink(eventData) : ""), [eventData]);
  const infoUrl = useMemo(() => (eventData ? extractInfoLink(eventData) : ""), [eventData]);
  const priceLines = useMemo(() => formatPriceLines(eventData?.price), [eventData?.price]);

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[var(--bg)] text-sm text-[var(--muted)]">
        공연 정보를 불러오는 중입니다.
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

  return (
    <main className="min-h-screen bg-[var(--bg)] px-4 pb-16 pt-8 text-[var(--text)] md:px-8 md:pt-10">
      <div className="mx-auto max-w-4xl">
        <button type="button" onClick={() => router.back()} className="secondary-btn mb-6">
          ← 뒤로 가기
        </button>

        <section className="panel p-6 md:p-8">
          <p className="text-sm font-medium text-[var(--muted)]">{formatSchedule(eventData.date, eventData.time)}</p>

          <h1 className="mt-3 text-4xl font-semibold tracking-[-0.04em] text-white md:text-5xl">
            {eventData.title || "제목 없는 공연"}
          </h1>

          <div className="mt-8 grid gap-4 md:grid-cols-2">
            <InfoCard label="Venue" value={eventData.venueName || "미정"} />
            <InfoCard label="Artists" value={eventData.artistNames || "미정"} />
            <InfoCard label="Time" value={formatSchedule(eventData.date, eventData.time)} />
            <InfoCard label="Ticket" value={priceLines.join("\n") || "정보 없음"} preserveLineBreak />
          </div>

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