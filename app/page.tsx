import type { Metadata } from "next";
import { fetchEvents } from "@/lib/fetch-events";
import PageShell from "./components/page-shell";
import HomeView from "./components/home-view";

// 임시 캐시 무효화: 즉시 최신 데이터를 불러옵니다.
export const revalidate = 0;

export const metadata: Metadata = {
  title: "라이브클럽맵 | 인디 공연 일정",
  description: "인디씬 라이브 공연 일정을 한눈에 — 라이브클럽맵 (Live Club Map)",
};

export default async function HomePage() {
  const { events, loadError } = await fetchEvents();

  return (
    <PageShell>
      <HomeView initialEvents={events} loadError={loadError} />
    </PageShell>
  );
}
