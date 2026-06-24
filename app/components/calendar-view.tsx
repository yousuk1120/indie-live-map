"use client";

// 달력 탭: 월간 달력 + 선택 날짜 공연 목록

import { useEffect, useMemo, useState } from "react";
import {
  type EventItem,
  prepareUpcomingEvents,
  isFestivalEvent,
  getEventDates,
  sortEventsForDay,
} from "@/lib/events";
import { useTicketbook } from "@/lib/ticketbook";
import { ScheduleRow } from "./event-cards";

type CalendarCell = {
  key: string;
  day: number;
  events: EventItem[];
};

export default function CalendarView({
  initialEvents,
  loadError,
}: {
  initialEvents: EventItem[];
  loadError: string;
}) {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState("");
  const { isSaved } = useTicketbook();

  const sortedEvents = useMemo(() => prepareUpcomingEvents(initialEvents), [initialEvents]);

  const calendarCells = useMemo(() => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const totalDays = new Date(year, month + 1, 0).getDate();
    const cells: Array<CalendarCell | null> = [];

    for (let i = 0; i < firstDay; i += 1) cells.push(null);

    for (let day = 1; day <= totalDays; day += 1) {
      const key = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      // 멀티데이 공연(페스티벌)은 진행되는 모든 날짜에 표시 + 페스티벌 우선 정렬
      const dayEvents = sortEventsForDay(
        sortedEvents.filter((event) => getEventDates(event).includes(key))
      );
      cells.push({ key, day, events: dayEvents });
    }

    return cells;
  }, [currentMonth, sortedEvents]);

  useEffect(() => {
    const validKeys = calendarCells.filter(Boolean).map((cell) => cell!.key);
    if (selectedDate && validKeys.includes(selectedDate)) return;

    const firstWithEvents = calendarCells.find((cell) => cell && cell.events.length)?.key || "";
    setSelectedDate(firstWithEvents);
  }, [calendarCells, selectedDate]);

  const selectedDateEvents = useMemo(() => {
    if (!selectedDate) return [] as EventItem[];
    // 페스티벌 최상단 고정 정렬 후, 별표(저장)한 공연을 맨 위로 끌어올림 (안정 정렬)
    const sorted = sortEventsForDay(
      sortedEvents.filter((event) => getEventDates(event).includes(selectedDate))
    );
    return [...sorted].sort((a, b) => (isSaved(b.id) ? 1 : 0) - (isSaved(a.id) ? 1 : 0));
  }, [selectedDate, sortedEvents, isSaved]);

  if (loadError) {
    return (
      <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-6 text-sm text-red-400">
        {loadError}
      </div>
    );
  }

  return (
    <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px] animate-slide-up">
      <div className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-4 md:p-6">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1))}
              className="icon-btn"
              aria-label="이전 달"
            >
              ‹
            </button>
            <h2 className="min-w-[140px] text-center text-lg font-bold tabular-nums tracking-tight text-[var(--text)]">
              {currentMonth.getFullYear()}년 {currentMonth.getMonth() + 1}월
            </h2>
            <button
              type="button"
              onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1))}
              className="icon-btn"
              aria-label="다음 달"
            >
              ›
            </button>
          </div>
          <div className="flex gap-3 text-[11px] font-semibold">
            <span className="flex items-center gap-1.5 text-[var(--accent-2)]"><span className="h-2 w-2 rounded-full bg-[var(--accent-2)]" />페스티벌</span>
            <span className="flex items-center gap-1.5 text-[var(--text-secondary)]"><span className="h-2 w-2 rounded-full bg-[var(--muted)]" />일반 공연</span>
          </div>
        </div>

        <div className="mb-1 grid grid-cols-7 gap-1">
          {["일", "월", "화", "수", "목", "금", "토"].map((day, i) => (
            <div key={`${day}-${i}`} className={`py-2 text-center text-xs font-semibold ${i === 0 ? "text-red-500/80" : i === 6 ? "text-sky-600/80" : "text-[var(--muted)]"}`}>{day}</div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1">
          {calendarCells.map((cell, index) => {
            const dayOfWeek = index % 7;
            return cell ? (
              <button
                key={cell.key}
                type="button"
                onClick={() => setSelectedDate(cell.key)}
                className={`relative h-[56px] rounded-xl px-1 py-1.5 text-center transition-all duration-200 active:scale-95 md:h-[64px] ${
                  cell.key === selectedDate
                    ? "bg-[var(--accent)] shadow-[0_4px_24px_var(--accent-glow)]"
                    : cell.events.length > 0
                    ? "border border-[var(--accent-border)] bg-[var(--accent-soft)] hover:border-[var(--accent)] hover:bg-[var(--panel-2)]"
                    : "opacity-60 hover:opacity-100 hover:bg-[var(--panel-2)]"
                }`}
              >
                <span className={`text-sm font-semibold ${
                  cell.key === selectedDate ? "text-white" :
                  dayOfWeek === 0 ? "text-red-500" :
                  dayOfWeek === 6 ? "text-sky-600" : "text-[var(--text)]"
                }`}>{cell.day}</span>
                {cell.events.length > 0 && (
                  <div className="mt-1 flex justify-center gap-[3px]">
                    {Array.from({ length: Math.min(cell.events.length, 3) }).map((_, i) => (
                      <span
                        key={i}
                        className={`h-1.5 w-1.5 rounded-full ${
                          cell.key === selectedDate
                            ? "bg-[#111]/60"
                            : isFestivalEvent(cell.events[i])
                            ? "bg-[var(--accent-2)]"
                            : "bg-[var(--muted)]"
                        }`}
                        style={{ width: 6, height: 6 }}
                      />
                    ))}
                  </div>
                )}
              </button>
            ) : (
              <div key={`blank-${index}`} className="h-[56px] md:h-[64px]" />
            );
          })}
        </div>
      </div>

      <aside className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-4 md:p-5">
        <div className="mb-4 border-b border-[var(--line)] pb-3">
          <h2 className="text-sm font-semibold text-[var(--text)]">선택한 날짜</h2>
          <p className="mt-1 text-xs text-[var(--muted)]">{selectedDate || "이 달에 일정이 없습니다."}</p>
        </div>

        <div className="space-y-2">
          {selectedDateEvents.length ? (
            selectedDateEvents.map((event) => (
              <ScheduleRow key={event.id} event={event} forDate={selectedDate} />
            ))
          ) : (
            <div className="rounded-2xl border border-[var(--line)] bg-[var(--panel-2)] px-4 py-6 text-center text-sm text-[var(--muted)]">
              선택한 날짜에 공연이 없습니다.
            </div>
          )}
        </div>
      </aside>
    </section>
  );
}
