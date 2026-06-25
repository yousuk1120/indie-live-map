// 스크립트 공용 헬퍼: env 로더 / Firebase Admin / Apify 스크랩 / Blob 영구화.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

function loadEnv() {
  const raw = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8");
  const env = {};
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    let v = m[2];
    if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
    env[m[1]] = v;
  }
  return env;
}

function initAdmin(env) {
  const admin = require("firebase-admin");
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
        clientEmail: env.FIREBASE_CLIENT_EMAIL,
        privateKey: (env.FIREBASE_PRIVATE_KEY || "").replace(/\\n/g, "\n"),
      }),
    });
  }
  return admin;
}

function isPersistedUrl(url) {
  return (
    url.includes("firebasestorage.googleapis.com") ||
    url.includes("storage.googleapis.com") ||
    url.includes(".blob.vercel-storage.com")
  );
}

// 인스타 단일 게시물 상세 (Apify instagram-scraper, details)
// 반환: { image, notFound, error }. notFound=게시물 삭제/비공개로 영구 복구 불가.
async function scrapePostDetail(env, instagramUrl) {
  if (!instagramUrl || !env.APIFY_API_TOKEN) return { image: "", notFound: false, error: "" };
  const res = await fetch(
    `https://api.apify.com/v2/acts/apify~instagram-scraper/run-sync-get-dataset-items?token=${env.APIFY_API_TOKEN}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ directUrls: [instagramUrl], resultsType: "details" }),
    }
  );
  if (!res.ok) throw new Error(`Apify ${res.status} ${res.statusText}`);
  const data = await res.json();
  const first = Array.isArray(data) && data.length ? data[0] : null;
  if (!first) return { image: "", notFound: false, error: "빈 응답" };
  if (first.error) return { image: "", notFound: first.error === "not_found", error: first.error };
  return { image: first.displayUrl || first.videoUrl || "", notFound: false, error: "" };
}

// 이미지 URL만 필요할 때의 간편 래퍼.
async function scrapePostImage(env, instagramUrl) {
  return (await scrapePostDetail(env, instagramUrl)).image;
}

// 인스타 프로필 최근 게시물 목록 (caption + displayUrl + url)
async function scrapeProfilePosts(env, username, limit = 12) {
  if (!username || !env.APIFY_API_TOKEN) return [];
  const res = await fetch(
    `https://api.apify.com/v2/acts/apify~instagram-profile-scraper/run-sync-get-dataset-items?token=${env.APIFY_API_TOKEN}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ usernames: [username], resultsLimit: limit }),
    }
  );
  if (!res.ok) throw new Error(`Apify ${res.status} ${res.statusText}`);
  const data = await res.json();
  const profile = Array.isArray(data) ? data[0] : null;
  const posts = profile?.latestPosts ?? [];
  return posts.map((p) => ({
    instaLink: p.url ?? `https://www.instagram.com/p/${p.shortCode}/`,
    caption: p.caption ?? "",
    displayUrl: p.displayUrl ?? p.thumbnailUrl ?? "",
  }));
}

// 이미지 URL을 내려받아 base64 data URL로 변환 (OpenAI 비전에 직접 전달용).
// 인스타 CDN URL은 OpenAI 서버가 직접 다운로드하지 못하므로 우리가 받아서 인라인으로 넘깁니다.
// 비공개(private) Vercel Blob 포스터는 BLOB 토큰으로 인증해야 받을 수 있습니다.
async function fetchImageAsDataUrl(url, blobToken) {
  const headers = {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
  };
  if (blobToken && url.includes("blob.vercel-storage.com")) {
    headers["Authorization"] = `Bearer ${blobToken}`;
  }
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`이미지 다운로드 실패 ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const contentType = res.headers.get("content-type") || "image/jpeg";
  return `data:${contentType};base64,${buf.toString("base64")}`;
}

// 이미지 URL → Vercel Blob 영구화 (access: public). poster.ts와 동일 정책.
// 실패하면 빈 문자열 반환(원본 URL은 만료되므로 영구 URL이 아니면 의미 없음).
async function persistToBlob(env, url) {
  if (!url) return "";
  if (isPersistedUrl(url)) return url;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`이미지 다운로드 실패 ${res.status}`);
  const data = Buffer.from(await res.arrayBuffer());
  if (data.length === 0) throw new Error("이미지 0바이트");
  if (data.length > 8 * 1024 * 1024) throw new Error("이미지 8MB 초과");
  const contentType = res.headers.get("content-type") || "image/jpeg";
  if (!env.BLOB_READ_WRITE_TOKEN) throw new Error("BLOB_READ_WRITE_TOKEN 미설정");
  const { put } = require("@vercel/blob");
  // 스토어가 private 설정이므로 access: "private" (poster.ts와 동일). 표시는 /api/proxy-image가 토큰으로 서빙.
  const stored = await put(`posters/${crypto.randomUUID()}.jpg`, data, {
    access: "private",
    contentType,
    token: env.BLOB_READ_WRITE_TOKEN,
  });
  return stored.url;
}

module.exports = {
  loadEnv,
  initAdmin,
  isPersistedUrl,
  scrapePostDetail,
  scrapePostImage,
  scrapeProfilePosts,
  fetchImageAsDataUrl,
  persistToBlob,
};
