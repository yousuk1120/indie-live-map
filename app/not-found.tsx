import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-[var(--bg)] px-6 text-center">
      <p className="text-[11px] font-extrabold uppercase tracking-[0.26em] text-[var(--accent)]">Live Club Map</p>
      <h1 className="mt-3 text-2xl font-extrabold tracking-tight text-white">페이지를 찾을 수 없습니다</h1>
      <p className="mt-3 max-w-sm text-sm leading-relaxed text-[var(--muted)]">
        주소가 잘못되었거나 삭제된 페이지입니다.
      </p>
      <Link href="/" className="primary-btn mt-8">
        공연 보러 가기
      </Link>
    </main>
  );
}
