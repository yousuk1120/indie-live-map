import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "라이브클럽맵 (Live Club Map)",
    short_name: "라이브클럽맵",
    description: "인디씬 라이브 공연 일정 — 목록·지도·달력과 나의 티켓북",
    start_url: "/",
    scope: "/",
    lang: "ko",
    dir: "ltr",
    display: "standalone",
    orientation: "portrait",
    background_color: "#faf9f7",
    theme_color: "#faf9f7",
    categories: ["music", "entertainment", "lifestyle"],
    // 앱 아이콘 길게 누르면 나오는 바로가기
    shortcuts: [
      { name: "달력", short_name: "달력", url: "/calendar" },
      { name: "지도", short_name: "지도", url: "/map" },
      { name: "내 티켓북", short_name: "티켓북", url: "/ticketbook" },
    ],
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
