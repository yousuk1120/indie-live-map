"use client";

import type { EventItem } from "@/lib/events";
import { EventListRow } from "../../components/event-cards";

export default function VenueEventList({ events }: { events: EventItem[] }) {
  if (!events.length) {
    return (
      <div className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-14 text-center text-sm text-[var(--muted)]">
        예정된 공연이 없습니다.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {events.map((event, idx) => (
        <EventListRow key={event.id} event={event} index={idx} />
      ))}
    </div>
  );
}
