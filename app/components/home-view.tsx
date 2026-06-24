"use client";

// 홈 화면 — 헤더 + 포스터 갤러리.

import { type EventItem } from "@/lib/events";
import AppHeader from "./app-header";
import GalleryView from "./gallery-view";

export default function HomeView({
  initialEvents,
  loadError,
}: {
  initialEvents: EventItem[];
  loadError: string;
}) {
  return (
    <>
      <AppHeader
        title="다가오는 공연"
        subtitle="라이브클럽과 페스티벌 일정을 한곳에서. 오늘 밤 갈 공연을 찾아보세요."
      />
      <GalleryView initialEvents={initialEvents} loadError={loadError} />
    </>
  );
}
