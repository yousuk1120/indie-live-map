// 로딩 화면 — 실제 LP가 재생되듯 33⅓rpm(1.8초/회전)으로 도는 레코드 + 카피.
export default function Loading() {
  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center gap-7 bg-[var(--bg)] px-6">
      <div aria-hidden className="bg-aurora" />
      <span
        className="vinyl-disc relative z-10"
        style={{ width: 132, height: 132, animationDuration: "1.8s" }}
        aria-hidden
      />
      <div className="relative z-10 text-center animate-fade-in">
        <p className="label-mono mb-2 text-[var(--accent)]">Live Club Map</p>
        <p className="text-lg font-extrabold tracking-[-0.02em] text-[var(--text)] md:text-xl">
          공연과 페스티벌 일정을 한 곳에서
        </p>
      </div>
    </main>
  );
}
