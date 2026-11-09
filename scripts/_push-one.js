// 특정 토큰(안드로이드)에만 실제 푸시 발송 — 끝단 검증용.
const { loadEnv, initAdmin } = require("./_lib");
(async () => {
  const admin = initAdmin(loadEnv());
  const db = admin.firestore();
  // Android(JwHugemP) 구독만 선택
  const subs = await db.collection("pushSubscriptions").where("uid","==","JwHugemP7RO3F4biCKzgwjIRRTr2").get();
  const tokens = [];
  subs.forEach(d=>{ const s=d.data(); if (String(s.platform||"").includes("Android")) tokens.push(s.token||d.id); });
  console.log("대상 Android 토큰:", tokens.length);
  if (!tokens.length) return;
  const messaging = admin.messaging();
  const res = await messaging.sendEach(tokens.map(token=>({
    token,
    notification:{ title:"🎤 초록불꽃소년단 새 공연(테스트)", body:"알림 수신 확인용 — 이 알림이 보이면 파이프라인 정상입니다" },
    data:{ url:"/", title:"테스트", body:"수신확인", tag:"lcm-diag" },
    webpush:{ fcmOptions:{ link:"/" }, notification:{ icon:"/icons/icon-192.png", badge:"/icons/icon-192.png" } },
  })));
  console.log(`성공 ${res.successCount} / 실패 ${res.failureCount}`);
  res.responses.forEach((r,i)=> console.log(r.success?`  ✓ ${tokens[i].slice(0,16)}… id=${r.messageId}`:`  ✗ ${r.error?.code}: ${r.error?.message}`));
})().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1)});
