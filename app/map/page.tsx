import type { Metadata } from "next";
import { fetchEvents } from "@/lib/fetch-events";
import PageShell from "../components/page-shell";
import AppHeader from "../components/app-header";
import MapView from "../components/map-view";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "공연장 지도 | 라이브클럽맵",
  description: "라이브클럽 위치를 지도에서 확인하고 공연장별 일정을 둘러보세요 — 라이브클럽맵",
};

export default async function MapPage() {
  const { events, loadError } = await fetchEvents();

  return (
    <PageShell>
      <AppHeader title="공연장 지도" subtitle="마커를 누르면 장소 이름과 그 공연장의 일정이 보입니다." />
      <MapView initialEvents={events} loadError={loadError} />
    </PageShell>
  );
}
