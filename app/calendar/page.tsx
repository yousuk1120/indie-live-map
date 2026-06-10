import type { Metadata } from "next";
import { fetchEvents } from "@/lib/fetch-events";
import PageShell from "../components/page-shell";
import AppHeader from "../components/app-header";
import CalendarView from "../components/calendar-view";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "달력 | Seoul Indie Live",
  description: "서울 인디 공연 일정을 달력으로 확인하세요. 페스티벌은 날짜별 라인업까지.",
};

export default async function CalendarPage() {
  const { events, loadError } = await fetchEvents();

  return (
    <PageShell>
      <AppHeader title={<><span className="text-gradient">Calendar</span></>} subtitle="날짜별로 공연을 탐색하세요. 페스티벌은 그날의 라인업이 표시됩니다." />
      <CalendarView initialEvents={events} loadError={loadError} />
    </PageShell>
  );
}
