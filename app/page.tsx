import { collection, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase/firestore";
import { normalizeEvent, type EventItem } from "@/lib/events";
import HomeClient from "./home-client";

// ISR: 5분마다 서버에서 공연 데이터를 다시 가져와 정적 페이지를 재생성합니다.
// 뷰어 트래픽이 Firestore 읽기를 직접 발생시키지 않습니다.
export const revalidate = 300;

async function fetchEvents(): Promise<{ events: EventItem[]; loadError: string }> {
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

export default async function Home() {
  const { events, loadError } = await fetchEvents();
  return <HomeClient initialEvents={events} loadError={loadError} />;
}
