// 라우트 전환(클릭) 시 잠깐 보이는 폴백 — 가벼운 스켈레톤만.
// (첫 앱 진입의 LP 회전 스플래시는 InitialSplash 컴포넌트가 1회만 담당)
export default function Loading() {
  return (
    <main className="relative min-h-screen bg-[var(--bg)]">
      <div className="mx-auto max-w-5xl px-4 pb-32 pt-8 md:px-6 md:pt-14">
        <div className="skeleton mb-8 h-24 md:h-32" />
        <div className="skeleton mb-6 h-12" />
        <div className="space-y-3">
          <div className="skeleton h-32" />
          <div className="skeleton h-32" />
          <div className="skeleton h-32" />
        </div>
      </div>
    </main>
  );
}
