"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
} from "firebase/auth";
import { auth } from "@/lib/firebase/auth";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) router.push("/admin");
    });
    return () => unsubscribe();
  }, [router]);

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMessage("");

    try {
      await signInWithEmailAndPassword(auth, email, password);
      router.push("/admin");
    } catch (error: any) {
      setErrorMessage(error?.message || "로그인에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setLoading(true);
    setErrorMessage("");

    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
      router.push("/admin");
    } catch (error: any) {
      setErrorMessage(error?.message || "Google 로그인에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-[var(--bg)] px-4 py-8 text-[var(--text)] md:px-8 md:py-10">
      <div className="mx-auto max-w-xl">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-white">관리자 로그인</h1>
          <Link href="/" className="secondary-btn">
            ← Concert Schedule
          </Link>
        </div>

        <section className="panel p-6 md:p-8">
          <form onSubmit={handleEmailLogin} className="space-y-4">
            <div>
              <label className="mb-2 block text-sm font-medium text-[var(--muted)]">이메일 주소</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="email@example.com"
                className="h-14 w-full rounded-2xl border border-[var(--line)] bg-[var(--panel-2)] px-4 text-white outline-none transition focus:border-[var(--accent)]"
                required
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-[var(--muted)]">비밀번호</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="비밀번호"
                className="h-14 w-full rounded-2xl border border-[var(--line)] bg-[var(--panel-2)] px-4 text-white outline-none transition focus:border-[var(--accent)]"
                required
              />
            </div>

            {errorMessage ? (
              <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
                {errorMessage}
              </div>
            ) : null}

            <button type="submit" disabled={loading} className="primary-btn w-full justify-center !h-14">
              {loading ? "로그인 중..." : "이메일로 로그인"}
            </button>
          </form>

          <div className="my-6 border-t border-[var(--line)]" />

          <button
            type="button"
            onClick={handleGoogleLogin}
            disabled={loading}
            className="secondary-btn w-full justify-center !h-14"
          >
            Google 로그인
          </button>
        </section>
      </div>
    </main>
  );
}