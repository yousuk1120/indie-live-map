import { NextResponse } from "next/server";
import { collection, getDocs, updateDoc, doc } from "firebase/firestore";
import { db } from "@/lib/firebase/firestore";

export async function GET() {
  try {
    const snapshot = await getDocs(collection(db, "events"));
    const events = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));

    const targetEvents = events.filter((ev: any) => !ev.posterUrl?.trim() && ev.instagramUrl?.trim());

    if (targetEvents.length === 0) {
      return NextResponse.json({ success: true, message: "빈 포스터가 없습니다." });
    }

    let successCount = 0;
    
    // Vercel Serverless 제한(10초)이 있으나 로컬 호출용이므로 동기 처리
    for (let i = 0; i < targetEvents.length; i++) {
      const ev = targetEvents[i] as any;
      
      try {
        const apifyRes = await fetch(`https://api.apify.com/v2/acts/apify~instagram-scraper/run-sync-get-dataset-items?token=${process.env.APIFY_API_TOKEN}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            directUrls: [ev.instagramUrl],
            resultsType: "details",
          }),
        });

        if (apifyRes.ok) {
          const data = await apifyRes.json();
          if (data && data.length > 0) {
            const posterUrl = data[0].displayUrl || data[0].videoUrl;
            if (posterUrl) {
              // admin 모드가 아니면 클라이언트 SDK로 업데이트 (개발 환경이므로 허용 가능)
              await updateDoc(doc(db, "events", ev.id), { posterUrl });
              successCount++;
            }
          }
        }
      } catch (err) {
        console.error(`[${ev.id}] 추출 실패`, err);
      }
    }

    return NextResponse.json({ success: true, message: `총 ${successCount}개 포스터를 채웠습니다.` });
  } catch (error: any) {
    console.error("일괄 업데이트 에러", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
