import type { Metadata } from "next";
import { fetchEvents } from "@/lib/fetch-events";
import PageShell from "./components/page-shell";
import AppHeader from "./components/app-header";
import ListView from "./components/list-view";

// ISR: 5분마다 서버에서 공연 데이터를 다시 가져와 정적 페이지를 재생성합니다.
export const revalidate = 300;

export const metadata: Metadata = {
  title: "라이브클럽맵 | 인디 공연 일정",
  description: "인디씬 라이브 공연 일정을 한눈에 — 라이브클럽맵 (Live Club Map)",
};

export default async function HomePage() {
  const { events, loadError } = await fetchEvents();

  return (
    <PageShell>
      <AppHeader
        title="다가오는 공연"
        subtitle="라이브클럽과 페스티벌 일정을 한곳에서. 오늘 밤 갈 공연을 찾아보세요."
      />
      <ListView initialEvents={events} loadError={loadError} />
    </PageShell>
  );
}
