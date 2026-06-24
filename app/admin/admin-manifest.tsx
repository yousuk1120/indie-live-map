"use client";

// 어드민 라우트에서 manifest를 런타임에 /admin.webmanifest로 교체합니다.
// (Next 메타데이터의 중첩 레이아웃 오버라이드가 배포 환경에서 prerender에 반영되지
//  않는 이슈를 우회 — '홈 화면에 추가'는 실제 DOM의 manifest를 읽으므로 안정적입니다.)

import { useEffect } from "react";

export default function AdminManifest() {
  useEffect(() => {
    const link = document.querySelector('link[rel="manifest"]') as HTMLLinkElement | null;
    const prev = link?.getAttribute("href") || "/manifest.webmanifest";
    if (link) link.setAttribute("href", "/admin.webmanifest");

    const setMeta = (name: string, content: string) => {
      let m = document.querySelector(`meta[name="${name}"]`) as HTMLMetaElement | null;
      if (!m) {
        m = document.createElement("meta");
        m.setAttribute("name", name);
        document.head.appendChild(m);
      }
      const before = m.getAttribute("content");
      m.setAttribute("content", content);
      return { m, before };
    };

    const title = setMeta("apple-mobile-web-app-title", "관리자");
    const themed = setMeta("theme-color", "#d95a2b");
    const prevTitle = document.title;
    document.title = "라이브클럽맵 관리자";

    // 어드민 라우트를 벗어나면 원래 값으로 복구
    return () => {
      if (link) link.setAttribute("href", prev);
      if (title.before != null) title.m.setAttribute("content", title.before);
      if (themed.before != null) themed.m.setAttribute("content", themed.before);
      document.title = prevTitle;
    };
  }, []);

  return null;
}
