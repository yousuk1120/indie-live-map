const admin = require("firebase-admin");
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env.local") });

// Initialize Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
    }),
  });
}

const db = admin.firestore();

async function fillPosters() {
  console.log("시작: 빈 포스터 채우기...");

  const snapshot = await db.collection("events").get();
  const events = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));

  const targetEvents = events.filter(ev => !ev.posterUrl && ev.instagramUrl);

  if (targetEvents.length === 0) {
    console.log("빈 포스터 중 인스타그램 링크가 있는 이벤트가 없습니다. (모두 채워져 있음)");
    process.exit(0);
  }

  console.log(`총 ${targetEvents.length}개의 이벤트의 포스터를 추출합니다.`);

  let successCount = 0;
  for (let i = 0; i < targetEvents.length; i++) {
    const ev = targetEvents[i];
    console.log(`[${i+1}/${targetEvents.length}] ${ev.title} (${ev.instagramUrl}) 분석 중...`);
    
    try {
      const apifyRes = await fetch(`https://api.apify.com/v2/acts/apify~instagram-scraper/run-sync-get-dataset-items?token=${process.env.APIFY_API_TOKEN}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          directUrls: [ev.instagramUrl],
          resultsType: "details",
        }),
      });

      if (!apifyRes.ok) {
        console.error("  -> Apify 실패:", apifyRes.statusText);
        continue;
      }

      const data = await apifyRes.json();
      if (data && data.length > 0) {
        const posterUrl = data[0].displayUrl || data[0].videoUrl;
        if (posterUrl) {
          await db.collection("events").doc(ev.id).update({ posterUrl });
          console.log("  -> 성공! 업데이트 완료.");
          successCount++;
        } else {
          console.error("  -> 실패: 게시물에서 이미지를 찾을 수 없습니다.");
        }
      } else {
         console.error("  -> 실패: 데이터를 찾을 수 없습니다.");
      }
    } catch (e) {
      console.error("  -> 에러:", e.message);
    }
  }

  console.log(`\n완료: 총 ${successCount}개의 이벤트를 성공적으로 채웠습니다.`);
  process.exit(0);
}

fillPosters();
