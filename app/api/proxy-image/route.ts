import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get("url");

  if (!url) {
    return new NextResponse("Missing url parameter", { status: 400 });
  }

  // 비공개 Vercel Blob 포스터: 토큰으로 서버에서 읽어 스트리밍 (브라우저는 직접 접근 불가)
  if (url.includes("blob.vercel-storage.com") && process.env.BLOB_READ_WRITE_TOKEN) {
    try {
      const { get } = await import("@vercel/blob");
      const pathname = new URL(url).pathname.replace(/^\//, "");
      const result = await get(pathname, {
        access: "private",
        token: process.env.BLOB_READ_WRITE_TOKEN,
      });
      if (result && result.statusCode === 200 && result.stream) {
        return new NextResponse(result.stream, {
          headers: {
            "Content-Type": result.blob.contentType || "image/jpeg",
            "Cache-Control": "public, max-age=31536000, immutable",
          },
        });
      }
    } catch (error) {
      console.error("Private blob 서빙 실패:", error);
      // 아래 일반 fetch로 폴백 시도
    }
  }

  try {
    const response = await fetch(url, {
      headers: {
        // 인스타그램 등 타겟 서버가 봇을 차단하거나 referer를 검사하는 것을 우회
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
      },
    });

    if (!response.ok) {
      return new NextResponse("Failed to fetch image", { status: response.status });
    }

    const contentType = response.headers.get("content-type") || "image/jpeg";
    const arrayBuffer = await response.arrayBuffer();

    return new NextResponse(arrayBuffer, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=31536000, immutable", // 1년 캐시
      },
    });
  } catch (error) {
    console.error("Proxy image error:", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
