import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Seoul Indie Live",
    short_name: "IndieLive",
    description: "서울 인디씬 라이브 공연 일정 — 목록·지도·달력과 나의 티켓북",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#08080d",
    theme_color: "#08080d",
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
