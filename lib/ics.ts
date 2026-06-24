"use client";

// 공연을 기기 캘린더에 추가 — .ics 파일 생성/다운로드 (서버 불필요, iOS/안드로이드/PC 모두 동작)

import { normalizeDate, parseTime24, toText, type EventItem } from "@/lib/events";

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function icsEscape(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

// "2026-06-12" → "20260612"
function dateBasic(dateKey: string): string {
  return dateKey.replace(/-/g, "");
}

// 종료일 다음날 (종일 일정의 DTEND는 exclusive)
function nextDay(dateKey: string): string {
  const d = new Date(`${dateKey}T00:00:00`);
  d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// 구글 캘린더 "일정 추가" 페이지 URL — 누르면 캘린더 앱/웹이 열려 한 번에 추가됩니다.
// (.ics 파일 다운로드 대신 실제 캘린더 연동 경험)
export function getGoogleCalendarUrl(event: EventItem): string {
  const start = normalizeDate(event.date);
  if (!start) return "";

  const end = normalizeDate(event.endDate) || start;
  const time = parseTime24(toText(event.time));
  const title = event.title || "공연";
  const location = event.venueName || "";
  const details = [
    event.artistNames ? `출연: ${event.artistNames}` : "",
    event.price ? `티켓: ${event.price}` : "",
    event.instagramUrl || event.sourceUrl || "",
    "라이브클럽맵에서 저장한 공연",
  ]
    .filter(Boolean)
    .join("\n");

  let dates: string;
  if (time && start === end) {
    const [h, m] = time.split(":").map(Number);
    const endH = Math.min(h + 2, 23);
    dates = `${dateBasic(start)}T${pad(h)}${pad(m)}00/${dateBasic(start)}T${pad(endH)}${pad(m)}00`;
  } else {
    // 종일/멀티데이: 종료일은 exclusive라 다음날
    dates = `${dateBasic(start)}/${dateBasic(nextDay(end))}`;
  }

  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: title,
    dates,
    ctz: "Asia/Seoul",
  });
  if (location) params.set("location", location);
  if (details) params.set("details", details);

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

// 캘린더에 추가 — 구글 캘린더 일정 추가 페이지를 새 탭으로 엽니다.
export function addEventToCalendar(event: EventItem): boolean {
  const url = getGoogleCalendarUrl(event);
  if (!url) {
    alert("날짜 정보가 없어 캘린더에 추가할 수 없습니다.");
    return false;
  }
  window.open(url, "_blank", "noopener,noreferrer");
  return true;
}

export function downloadEventIcs(event: EventItem): boolean {
  const start = normalizeDate(event.date);
  if (!start) {
    alert("날짜 정보가 없어 캘린더에 추가할 수 없습니다.");
    return false;
  }

  const end = normalizeDate(event.endDate) || start;
  const time = parseTime24(toText(event.time));
  const title = event.title || "공연";
  const location = event.venueName || "";
  const description = [
    event.artistNames ? `출연: ${event.artistNames}` : "",
    event.price ? `티켓: ${event.price}` : "",
    event.instagramUrl || event.sourceUrl || "",
    "라이브클럽맵에서 저장한 공연",
  ]
    .filter(Boolean)
    .join("\\n");

  let dtLines: string[];
  if (time && start === end) {
    // 시간이 있는 하루 공연: 시작 시간 + 2시간
    const [h, m] = time.split(":").map(Number);
    const endH = Math.min(h + 2, 23);
    dtLines = [
      `DTSTART;TZID=Asia/Seoul:${dateBasic(start)}T${pad(h)}${pad(m)}00`,
      `DTEND;TZID=Asia/Seoul:${dateBasic(start)}T${pad(endH)}${pad(m)}00`,
    ];
  } else {
    // 종일(또는 멀티데이) 일정
    dtLines = [
      `DTSTART;VALUE=DATE:${dateBasic(start)}`,
      `DTEND;VALUE=DATE:${dateBasic(nextDay(end))}`,
    ];
  }

  const now = new Date();
  const stamp = `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}T${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}Z`;

  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Live Club Map//KR",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${event.id}@liveclubmap`,
    `DTSTAMP:${stamp}`,
    ...dtLines,
    `SUMMARY:${icsEscape(title)}`,
    ...(location ? [`LOCATION:${icsEscape(location)}`] : []),
    ...(description ? [`DESCRIPTION:${icsEscape(description)}`] : []),
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");

  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${title.replace(/[\\/:*?"<>|]/g, "_").slice(0, 50)}.ics`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
  return true;
}
