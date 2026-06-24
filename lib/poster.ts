// 포스터 이미지 영구화 (서버 전용).
//
// 인스타그램 CDN 이미지는 서명된 임시 URL이라 며칠 뒤 만료됩니다.
// Vercel Blob에 복사해 영구 URL로 바꿉니다.
// BLOB_READ_WRITE_TOKEN 이 없으면 원본 URL을 그대로 반환합니다(영구화 불가 → 만료 위험).

// Blob 사용 가능 여부:
//  - 정적 토큰(BLOB_READ_WRITE_TOKEN) 또는
//  - 연결된 스토어(BLOB_STORE_ID) + Vercel OIDC(런타임 자동 주입)
// @vercel/blob v2는 BLOB_STORE_ID만 있어도 OIDC로 인증합니다(배포 환경 한정).
export function hasBlobStorage(): boolean {
  return !!(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID);
}

export async function persistPosterImage(url: string): Promise<string> {
  if (!url) return "";
  // 이미 Blob에 영구 저장된 URL이면 재처리하지 않음
  if (url.includes(".public.blob.vercel-storage.com")) return url;
  if (!hasBlobStorage()) return url;

  try {
    const res = await fetch(url);
    if (!res.ok) return url;

    const data = Buffer.from(await res.arrayBuffer());
    if (data.length === 0 || data.length > 8 * 1024 * 1024) return url;

    const { put } = await import("@vercel/blob");
    const stored = await put(`posters/${crypto.randomUUID()}.jpg`, data, {
      access: "public",
      contentType: res.headers.get("content-type") || "image/jpeg",
    });
    return stored.url;
  } catch (error) {
    console.warn("[poster] 영구화 실패 (원본 URL 유지):", error);
    return url;
  }
}
