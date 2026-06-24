// 포스터 이미지 영구화 (서버 전용) — Firebase Storage에 저장.
//
// 인스타그램 CDN 이미지는 서명된 임시 URL이라 며칠 뒤 만료됩니다.
// Firebase Storage(기존 서비스계정 자격증명으로 동작 — 별도 토큰 불필요)에 복사해
// 영구 다운로드 URL로 바꿉니다. 설정/업로드 실패 시 원본 URL을 그대로 반환합니다.

function isPersistedUrl(url: string): boolean {
  return (
    url.includes("firebasestorage.googleapis.com") ||
    url.includes("storage.googleapis.com") ||
    url.includes(".blob.vercel-storage.com")
  );
}

export async function persistPosterImage(url: string): Promise<string> {
  if (!url) return "";
  if (isPersistedUrl(url)) return url; // 이미 영구 저장된 URL

  try {
    const res = await fetch(url);
    if (!res.ok) return url;

    const data = Buffer.from(await res.arrayBuffer());
    if (data.length === 0 || data.length > 8 * 1024 * 1024) return url;

    const { getAdminStorageBucket } = await import("@/lib/firebase/admin");
    const bucket = await getAdminStorageBucket();
    if (!bucket) return url;

    const downloadToken = crypto.randomUUID();
    const objectPath = `posters/${crypto.randomUUID()}.jpg`;
    const file = bucket.file(objectPath);

    await file.save(data, {
      contentType: res.headers.get("content-type") || "image/jpeg",
      resumable: false,
      metadata: {
        // Firebase 다운로드 토큰 — 공개 ACL 없이도 접근 가능한 표준 다운로드 URL 발급
        metadata: { firebaseStorageDownloadTokens: downloadToken },
      },
    });

    return `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(
      objectPath
    )}?alt=media&token=${downloadToken}`;
  } catch (error) {
    console.warn("[poster] Firebase Storage 영구화 실패 (원본 URL 유지):", error);
    return url;
  }
}
