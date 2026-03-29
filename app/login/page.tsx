"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  GoogleAuthProvider,
  signInWithEmailAndPassword,
  signInWithPopup,
} from "firebase/auth";
import { auth } from "@/lib/firebase/auth";

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage("");
    setLoading(true);

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
    setErrorMessage("");
    setLoading(true);

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
    <main className="min-h-screen bg-[var(--bg)] text-[var(--text)]">
      <div className="mx-auto flex min-h-screen max-w-5xl items-center justify-center px-4 py-10">
        <div className="w-full max-w-xl rounded-[32px] border border-[var(--line)] bg-[var(--panel)] p-6 md:p-10">
          <div className="mb-8 flex items-center justify-between">
            <h1 className="text-3xl font-semibold tracking-[-0.04em] text-white">Admin Login</h1>
            <Link href="/" className="secondary-btn">
              ← Concert Schedule
            </Link>
          </div>

          <form onSubmit={handleEmailLogin} className="space-y-4">
            <div>
              <label className="mb-2 block text-sm text-[var(--muted)]">이메일 주소</label>
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
              <label className="mb-2 block text-sm text-[var(--muted)]">비밀번호</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="h-14 w-full rounded-2xl border border-[var(--line)] bg-[var(--panel-2)] px-4 text-white outline-none transition focus:border-[var(--accent)]"
                required
              />
            </div>

            {errorMessage ? (
              <p className="text-sm text-rose-300">{errorMessage}</p>
            ) : null}

            <button
              type="submit"
              disabled={loading}
              className="primary-btn w-full justify-center !h-14"
            >
              이메일로 로그인
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
        </div>
      </div>
    </main>
  );
}