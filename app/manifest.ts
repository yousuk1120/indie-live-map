import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "라이브클럽맵 (Live Club Map)",
    short_name: "라이브클럽맵",
    description: "인디씬 라이브 공연 일정 — 목록·지도·달력과 나의 티켓북",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#111111",
    theme_color: "#111111",
    categories: ["music", "entertainment", "lifestyle"],
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
