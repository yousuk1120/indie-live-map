// 서버 전용 인스타 핸들 파싱 + 프로필 실존·활성 검증 (Apify).
// 'use client' 아님 — Route Handler에서 사용. (클라이언트판 parseInstagramHandle은
//  lib/artist-requests.ts에 별도로 있음 — 그쪽은 'use client'라 서버로 못 가져옴.)

const RESERVED_SEGMENTS = new Set(["p", "reel", "reels", "tv", "explore", "s", "accounts", "direct"]);

// 인스타 링크 또는 @아이디 → 핸들. 추출 불가(게시물 링크 등)면 빈 문자열.
export function parseInstagramHandle(input: string): string {
  let s = (input || "").trim().replace(/^@/, "");
  if (!s) return "";
  const m = s.match(/instagram\.com\/(.+)/i);
  if (m) s = m[1];
  s = s.split(/[?#]/)[0];
  const seg = s.split("/").filter(Boolean);
  if (!seg.length) return "";
  let handle = seg[0];
  if (handle.toLowerCase() === "stories" && seg[1]) handle = seg[1];
  else if (RESERVED_SEGMENTS.has(handle.toLowerCase())) return "";
  return handle.toLowerCase().replace(/[^a-z0-9._]/g, "");
}

export type ProfileCheck = {
  ok: boolean; // 실존 + 공개 + 최근 글 있음
  handle: string;
  fullName?: string;
  biography?: string;
  isPrivate?: boolean;
  followers?: number;
  recentPosts?: number;
  reason?: string; // ok=false 사유
};

// 프로필을 긁어 "수집 대상으로 삼을 만한 살아있는 계정인지" 판정.
// 링크로 계정을 특정했으니 신원(= 그 밴드인지)은 사용자가 보증한 것으로 보고,
// 여기선 실존/공개/활성만 검증합니다. 비공개·없음·글없음이면 ok=false로 플래그.
export async function verifyInstagramProfile(handle: string): Promise<ProfileCheck> {
  const token = process.env.APIFY_API_TOKEN;
  if (!handle) return { ok: false, handle, reason: "핸들 없음" };
  if (!token) return { ok: false, handle, reason: "APIFY 토큰 미설정" };

  const res = await fetch(
    `https://api.apify.com/v2/acts/apify~instagram-profile-scraper/run-sync-get-dataset-items?token=${token}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ usernames: [handle], resultsLimit: 6 }),
    }
  );
  if (!res.ok) return { ok: false, handle, reason: `Apify ${res.status}` };

  const data = await res.json();
  const p = Array.isArray(data) ? data[0] : null;
  const recent: number = p?.latestPosts?.length ?? 0;
  if (!p || (!p.username && !p.fullName && recent === 0)) {
    return { ok: false, handle, reason: "계정을 찾지 못함(없거나 비공개/차단)" };
  }

  const out: ProfileCheck = {
    ok: false,
    handle: p.username || handle,
    fullName: p.fullName,
    biography: p.biography,
    isPrivate: p.private,
    followers: p.followersCount,
    recentPosts: recent,
  };
  if (p.private) return { ...out, reason: "비공개 계정" };
  if (recent === 0) return { ...out, reason: "최근 게시물이 없음(비활성/수집 불가)" };
  return { ...out, ok: true };
}
