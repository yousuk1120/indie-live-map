// 관리자 알림 — 새 아티스트 추가 요청 / 수집 오류 등 "나한테 연락" 채널.
//
// 두 채널을 지원하며, 환경변수만 넣으면 켜집니다(둘 다 없으면 조용히 no-op → 배포 안전):
//   1) 이메일  : RESEND_API_KEY + ALERT_EMAIL (보내는 주소 ALERT_FROM, 기본 onboarding@resend.dev)
//   2) 웹훅    : ADMIN_WEBHOOK_URL (Slack/Discord Incoming Webhook 둘 다 호환)
//
// 서버(크론/Route Handler)에서만 호출하세요. 실패해도 본 작업을 막지 않도록 예외를 삼킵니다.

type AlertResult = { sent: boolean; via?: "email" | "webhook"; error?: string };

async function sendViaResend(subject: string, body: string): Promise<AlertResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.ALERT_EMAIL;
  if (!apiKey || !to) return { sent: false, error: "email-unconfigured" };

  const from = process.env.ALERT_FROM || "라이브클럽맵 <onboarding@resend.dev>";
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to: [to],
      subject,
      text: body,
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    return { sent: false, via: "email", error: `resend ${res.status} ${detail.slice(0, 200)}` };
  }
  return { sent: true, via: "email" };
}

async function sendViaWebhook(subject: string, body: string): Promise<AlertResult> {
  const url = process.env.ADMIN_WEBHOOK_URL;
  if (!url) return { sent: false, error: "webhook-unconfigured" };

  const content = `*${subject}*\n${body}`;
  // Slack은 { text }, Discord는 { content } 를 읽습니다. 둘 다 넣어 호환.
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: content, content }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    return { sent: false, via: "webhook", error: `webhook ${res.status} ${detail.slice(0, 200)}` };
  }
  return { sent: true, via: "webhook" };
}

// 관리자 알림 발송. 설정된 채널(이메일 우선, 없으면 웹훅)로 보냅니다.
// lines는 본문 줄 목록. 실패는 로그만 남기고 조용히 반환합니다(호출부 흐름 보호).
export async function sendAdminAlert(subject: string, lines: string[]): Promise<AlertResult> {
  const body = lines.filter(Boolean).join("\n");
  try {
    if (process.env.RESEND_API_KEY && process.env.ALERT_EMAIL) {
      const r = await sendViaResend(subject, body);
      if (r.sent) return r;
      console.warn("[notify-admin] 이메일 실패, 웹훅 시도:", r.error);
    }
    if (process.env.ADMIN_WEBHOOK_URL) {
      return await sendViaWebhook(subject, body);
    }
    console.warn(`[notify-admin] 알림 채널 미설정 — 건너뜀: ${subject}`);
    return { sent: false, error: "unconfigured" };
  } catch (error) {
    console.error("[notify-admin] 알림 발송 예외:", error);
    return { sent: false, error: error instanceof Error ? error.message : "unknown" };
  }
}

// API 라우트/서버 작업 오류를 관리자에게 알립니다. (각 라우트 catch에서 호출)
// 알림 실패는 삼켜서 원래 에러 응답 흐름을 막지 않습니다.
export async function alertApiError(where: string, error: unknown, context?: string): Promise<void> {
  const message = error instanceof Error ? error.message : String(error);
  await sendAdminAlert(`🚨 오류: ${where}`, [
    context || "",
    `오류: ${message}`,
  ]).catch(() => {});
}

// 새 아티스트 추가 요청 하나를 즉시 관리자에게 알립니다. (제출 직후 서버 라우트에서 호출)
// docId로 실제 pending 요청을 확인해 스팸/중복 알림을 막습니다.
// 반환: 실제로 알림을 보냈으면 true.
export async function notifyArtistRequestNow(db: any, FieldValue: any, docId: string): Promise<boolean> {
  try {
    if (!docId) return false;
    const ref = db.collection("artist_requests").doc(docId);
    const snap = await ref.get();
    if (!snap.exists) return false;
    const r = snap.data();
    if (r.status !== "pending" || r.adminNotifiedAt) return false; // 이미 알림/처리됨 → 스킵

    const name = r.artistName || "(이름 미입력)";
    const handle = r.accountName ? `@${r.accountName}` : (r.instagramUrl || "");
    const siteUrl = process.env.ALERT_SITE_URL || "";
    const result = await sendAdminAlert(`🎤 새 아티스트 추가 요청`, [
      `${name}  ${handle}`,
      r.instagramUrl && r.accountName ? r.instagramUrl : "",
      "",
      siteUrl ? `검토: ${siteUrl.replace(/\/$/, "")}/admin` : "관리자 페이지(/admin)에서 검토하세요.",
    ]);
    if (result.sent) {
      await ref.update({ adminNotifiedAt: FieldValue.serverTimestamp() }).catch(() => {});
    }
    return result.sent;
  } catch (error) {
    console.error("[notify-admin] 즉시 아티스트 요청 알림 실패:", error);
    return false;
  }
}

// 새 아티스트 추가 요청 중 아직 알리지 않은 것을 모아 관리자에게 다이제스트 발송.
// notifiedField가 없는 pending 요청을 대상으로 하고, 발송 후 그 필드를 채워 중복 알림을 막습니다.
// db: firebase-admin Firestore, FieldValue: firebase-admin FieldValue. (동적 로드 결과를 주입)
export async function notifyPendingArtistRequests(db: any, FieldValue: any): Promise<number> {
  try {
    const snap = await db.collection("artist_requests").where("status", "==", "pending").get();
    const fresh = snap.docs.filter((d: any) => !d.data().adminNotifiedAt);
    if (fresh.length === 0) return 0;

    const siteUrl = process.env.ALERT_SITE_URL || "";
    const lines = [
      `새 아티스트 추가 요청 ${fresh.length}건이 들어왔어요.`,
      "",
      ...fresh.map((d: any, i: number) => {
        const r = d.data();
        const name = r.artistName || "(이름 미입력)";
        const handle = r.accountName ? `@${r.accountName}` : (r.instagramUrl || "");
        return `${i + 1}. ${name}  ${handle}`;
      }),
      "",
      siteUrl ? `검토: ${siteUrl.replace(/\/$/, "")}/admin` : "관리자 페이지(/admin)에서 검토 후 소스 계정으로 등록하세요.",
    ];

    const result = await sendAdminAlert(`🎤 새 아티스트 추가 요청 ${fresh.length}건`, lines);
    // 발송 성공했을 때만 알림표시 — 실패 시 다음 크론에서 재시도되도록 둡니다.
    if (result.sent) {
      await Promise.all(
        fresh.map((d: any) => d.ref.update({ adminNotifiedAt: FieldValue.serverTimestamp() }).catch(() => {}))
      );
    }
    return result.sent ? fresh.length : 0;
  } catch (error) {
    console.error("[notify-admin] 아티스트 요청 다이제스트 실패:", error);
    return 0;
  }
}
