// 서버 컴포넌트 전용 공연 데이터 fetch 헬퍼.
// 홈/달력/지도 페이지가 동일한 ISR 데이터를 공유합니다.

import { collection, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase/firestore";
import { normalizeEvent, type EventItem } from "@/lib/events";

export type EventsPayload = {
  events: EventItem[];
  loadError: string;
};

export async function fetchEvents(): Promise<EventsPayload> {
  try {
    const snapshot = await getDocs(collection(db, "events"));
    const events = snapshot.docs.map((doc) =>
      normalizeEvent(doc.id, doc.data() as Record<string, unknown>)
    );
    return { events, loadError: "" };
  } catch (error) {
    console.error("공연 데이터 서버 로딩 실패:", error);
    return { events: [], loadError: "공연 데이터를 불러오지 못했습니다. 잠시 후 다시 시도해주세요." };
  }
}
