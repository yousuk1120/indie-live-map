"use client";

// 첫 앱 진입 시에만 1회 보이는 LP 회전 스플래시 + 카피.
// 탭 세션당 한 번만 표시하고(sessionStorage), 라우트 클릭 전환 때는 나오지 않습니다.

import { useEffect, useState } from "react";

const SHOWN_KEY = "lcm:splash-shown";

export default function InitialSplash() {
  const [mounted, setMounted] = useState(false);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    let shown = false;
    try {
      shown = sessionStorage.getItem(SHOWN_KEY) === "1";
    } catch {
      shown = false;
    }
    if (shown) return;

    setMounted(true);
    try {
      sessionStorage.setItem(SHOWN_KEY, "1");
    } catch {
      // ignore
    }

    // LP가 한 바퀴 정도 돈 뒤 부드럽게 사라짐
    const fade = setTimeout(() => setLeaving(true), 1200);
    const remove = setTimeout(() => setMounted(false), 1600);
    return () => {
      clearTimeout(fade);
      clearTimeout(remove);
    };
  }, []);

  if (!mounted) return null;

  return (
    <div
      className={`fixed inset-0 z-[100] flex flex-col items-center justify-center gap-7 bg-[var(--bg)] px-6 transition-opacity duration-500 ${
        leaving ? "pointer-events-none opacity-0" : "opacity-100"
      }`}
    >
      <span
        className="vinyl-disc"
        style={{ width: 132, height: 132, animationDuration: "1.8s" }}
        aria-hidden
      />
      <div className="text-center">
        <p className="label-mono mb-2 text-[var(--accent)]">Live Club Map</p>
        <p className="text-lg font-extrabold tracking-[-0.02em] text-[var(--text)] md:text-xl">
          공연과 페스티벌 일정을 한 곳에서
        </p>
      </div>
    </div>
  );
}
