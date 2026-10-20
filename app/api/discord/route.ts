import { after } from "next/server";
import { verifyKey, InteractionType, InteractionResponseType } from "discord-interactions";
import { parseInstagramHandle, verifyInstagramProfile } from "@/lib/instagram-verify";
import { alertApiError } from "@/lib/notify-admin";

// 디스코드 슬래시 명령 `/추가 <인스타>` 인터랙션 엔드포인트.
//  - 서명(Ed25519) 검증 후 처리 (DISCORD_PUBLIC_KEY 필요).
//  - 3초 제한 때문에 즉시 "처리 중"(deferred)로 응답하고, after()로 실제 작업 후 메시지를 수정.
//  - 허용된 디스코드 사용자(DISCORD_ADMIN_IDS)만 사용 가능.
export const dynamic = "force-dynamic";
export const maxDuration = 60; // Apify 검증이 10~30초 걸릴 수 있어 넉넉히.

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

// 지연 응답 이후 원본 메시지를 수정(= 결과 회신). 토큰이 인증을 대신하므로 별도 헤더 불필요.
async function editOriginal(appId: string, token: string, content: string) {
  await fetch(`https://discord.com/api/v10/webhooks/${appId}/${token}/messages/@original`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
  }).catch(() => {});
}

export async function POST(req: Request) {
  const sig = req.headers.get("x-signature-ed25519") || "";
  const ts = req.headers.get("x-signature-timestamp") || "";
  const raw = await req.text();

  // 비밀값 아님(Ed25519 공개키) — env 없으면 기본값 사용해 Vercel 대시보드 설정 없이도 동작.
  const publicKey = process.env.DISCORD_PUBLIC_KEY || "b940b0dadef17b25d387147f1d4199c841c47cedcae203d4d8fc43d3701b3ef2";
  const valid = !!publicKey && !!sig && !!ts && (await verifyKey(raw, sig, ts, publicKey));
  if (!valid) return json({ error: "invalid request signature" }, 401);

  let body: any;
  try {
    body = JSON.parse(raw);
  } catch {
    return json({ error: "bad body" }, 400);
  }

  // Discord가 엔드포인트 URL 검증 시 보내는 핑 → 퐁
  if (body.type === InteractionType.PING) {
    return json({ type: InteractionResponseType.PONG });
  }

  if (body.type === InteractionType.APPLICATION_COMMAND && body.data?.name === "추가") {
    // 관리자 허용목록 (설정돼 있으면 그 안의 사용자만)
    const userId = body.member?.user?.id || body.user?.id || "";
    // 비밀값 아님(디스코드 userId) — env 없으면 기본 관리자(정유석) ID 사용.
    const admins = (process.env.DISCORD_ADMIN_IDS || "392939580493529089").split(",").map((s) => s.trim()).filter(Boolean);
    if (admins.length && !admins.includes(userId)) {
      return json({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: { flags: 64, content: "이 명령을 쓸 권한이 없어요." },
      });
    }

    const opt = (body.data.options || []).find((o: any) => o.name === "인스타");
    const input = String(opt?.value || "").trim();
    const appId = body.application_id as string;
    const token = body.token as string;

    // 실제 작업은 응답 후 백그라운드에서 — 3초 안에 deferred로 먼저 응답(ephemeral).
    after(async () => {
      try {
        const handle = parseInstagramHandle(input);
        if (!handle) {
          await editOriginal(appId, token, `⚠️ 인스타 링크/아이디를 못 읽었어요: \`${input}\``);
          return;
        }
        const chk = await verifyInstagramProfile(handle);
        if (!chk.ok) {
          await editOriginal(appId, token, `⚠️ @${handle} 검증 실패 — ${chk.reason}. 확인이 필요해요(앱에 수동 등록하거나 Claude에게).`);
          return;
        }

        const { getAdminDb } = await import("@/lib/firebase/admin");
        const { FieldValue } = await import("firebase-admin/firestore");
        const db = await getAdminDb();
        if (!db?.collection) {
          await editOriginal(appId, token, "⚠️ 서버 DB 초기화 실패 — 잠시 후 다시 시도해주세요.");
          return;
        }

        const snap = await db.collection("source_accounts").get();
        const dup = snap.docs.some((d: any) => (d.data().accountName || "").trim().toLowerCase() === handle);
        if (!dup) {
          await db.collection("source_accounts").add({
            accountName: handle,
            category: "밴드",
            isActive: true,
            createdAt: FieldValue.serverTimestamp(),
            addedVia: "discord",
          });
        }

        const name = chk.fullName ? ` (${chk.fullName})` : "";
        await editOriginal(
          appId,
          token,
          dup
            ? `✅ @${handle}${name} 는 이미 수집 중이에요.`
            : `✅ @${handle}${name} 추가 완료! 팔로워 ${chk.followers ?? "?"} · 다음 크론이 예정 공연을 모아요.`
        );
      } catch (error) {
        await alertApiError("discord-add", error);
        await editOriginal(appId, token, "⚠️ 처리 중 오류가 났어요. 관리자 로그를 확인해주세요.");
      }
    });

    return json({
      type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE,
      data: { flags: 64 }, // 본인에게만 보이는 ephemeral 응답
    });
  }

  return json({
    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: { flags: 64, content: "알 수 없는 명령이에요." },
  });
}
