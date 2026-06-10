import type { Metadata } from "next";
import PageShell from "../components/page-shell";
import AppHeader from "../components/app-header";
import TicketbookView from "../components/ticketbook-view";

export const metadata: Metadata = {
  title: "나의 티켓북 | 라이브클럽맵",
  description: "저장한 공연과 지난 관람 기록 — 별점, 한줄평, 셋리스트까지 나만의 공연 아카이브.",
};

export default function TicketbookPage() {
  return (
    <PageShell>
      <AppHeader
        title="나의 티켓북"
        subtitle="저장한 공연은 끝나면 자동으로 관람 기록이 됩니다."
      />
      <TicketbookView />
    </PageShell>
  );
}
