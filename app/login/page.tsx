"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { signInWithEmailAndPassword, signInWithPopup } from "firebase/auth";
import { auth, googleProvider } from "@/lib/firebase/auth";

function getAuthMessage(error: any) {
  const code = error?.code as string | undefined;

  switch (code) {
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":
      return "이메일 또는 비밀번호가 올바르지 않습니다.";
    case "auth/too-many-requests":
      return "로그인 시도가 너무 많습니다. 잠시 후 다시 시도하거나 비밀번호를 재설정하세요.";
    case "auth/popup-blocked":
      return "브라우저가 Google 로그인 팝업을 막았습니다. 팝업 허용 후 다시 시도하세요.";
    case "auth/popup-closed-by-user":
      return "Google 로그인 창이 닫혔습니다. 다시 시도하세요.";
    case "auth/unauthorized-domain":
      return "현재 배포 도메인이 Firebase Authentication의 허용 도메인에 등록되어 있지 않습니다.";
    case "auth/operation-not-allowed":
      return "Firebase Console에서 Google 로그인 또는 이메일 로그인이 아직 활성화되지 않았습니다.";
    default:
      return error?.message || "로그인에 실패했습니다.";
  }
}

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const helpMessage = useMemo(() => {
    if (!error) return "";
    if (error.includes("허용 도메인")) {
      return "Firebase Console → Authentication → Settings → Authorized domains에 현재 Vercel 주소를 추가하세요.";
    }
    if (error.includes("활성화")) {
      return "Firebase Console → Authentication → Sign-in method에서 Google과 Email/Password를 켜야 합니다.";
    }
    return "스크린샷의 auth/too-many-requests는 같은 기기에서 로그인 실패가 반복될 때 잠시 차단되는 상태입니다.";
  }, [error]);

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      router.push("/admin");
    } catch (err: any) {
      setError(getAuthMessage(err));
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setError("");
    setIsLoading(true);
    try {
      await signInWithPopup(auth, googleProvider);
      router.push("/admin");
    } catch (err: any) {
      setError(getAuthMessage(err));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10">
      <div className="absolute left-[-80px] top-[-60px] h-72 w-72 rounded-full bg-blue-500/20 blur-3xl" />
      <div className="absolute bottom-[-90px] right-[-70px] h-80 w-80 rounded-full bg-cyan-400/15 blur-3xl" />

      <div className="relative grid w-full max-w-5xl gap-6 lg:grid-cols-[1.05fr_0.95fr]">
        <section className="hidden rounded-[2rem] border border-white/10 bg-[linear-gradient(180deg,rgba(17,24,39,0.92),rgba(8,11,18,0.96))] p-8 text-white shadow-[0_30px_80px_rgba(2,6,23,0.45)] lg:block">
          <span className="inline-flex rounded-full border border-blue-400/25 bg-blue-400/10 px-3 py-1 text-xs font-semibold tracking-[0.16em] text-blue-200">
            ADMIN ACCESS
          </span>
          <h1 className="mt-5 text-4xl font-semibold leading-tight">
            라이브클럽 · 인디공연장 일정
            <br />
            관리자 로그인
          </h1>
          <p className="mt-5 max-w-md text-sm leading-7 text-slate-300">
            공연 데이터 등록, 소스 계정 관리, AI 후보 검수를 진행하는 관리자 화면입니다.
          </p>

          <div className="mt-10 grid gap-4">
            <LoginFeature title="Google 로그인 문제 원인" description="대부분은 Google Provider 미활성화 또는 Authorized domains 미등록입니다." />
            <LoginFeature title="이메일 로그인 차단" description="auth/too-many-requests는 같은 기기에서 실패가 반복될 때 생기는 임시 제한입니다." />
            <LoginFeature title="배포 후 꼭 확인" description="Vercel 도메인과 커스텀 도메인을 Firebase 인증 허용 도메인에 모두 추가하세요." />
          </div>
        </section>

        <section className="rounded-[2rem] border border-white/10 bg-[linear-gradient(180deg,rgba(11,15,24,0.94),rgba(8,10,15,0.98))] p-6 shadow-[0_30px_80px_rgba(2,6,23,0.52)] md:p-8">
          <div className="text-center">
            <span className="inline-flex rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold tracking-[0.14em] text-slate-300">
              INDIE LIVE MAP ADMIN
            </span>
            <h2 className="mt-4 text-3xl font-semibold text-white">로그인</h2>
            <p className="mt-2 text-sm text-slate-400">관리자 페이지에 접근하려면 로그인하세요.</p>
          </div>

          <form className="mt-8 space-y-5" onSubmit={handleEmailLogin}>
            <Field label="이메일 주소" type="email" value={email} onChange={setEmail} placeholder="email@example.com" />
            <Field label="비밀번호" type="password" value={password} onChange={setPassword} placeholder="••••••••" />

            {error ? (
              <div className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm leading-6 text-red-200">
                <p>{error}</p>
                {helpMessage ? <p className="mt-2 text-xs text-red-100/80">{helpMessage}</p> : null}
              </div>
            ) : null}

            <button
              type="submit"
              disabled={isLoading}
              className="flex w-full items-center justify-center rounded-2xl bg-white px-4 py-3.5 text-sm font-semibold text-slate-950 transition hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-60"
            >
              이메일로 로그인
            </button>
          </form>

          <div className="my-6 flex items-center gap-3 text-xs text-slate-500">
            <div className="h-px flex-1 bg-white/8" />
            또는
            <div className="h-px flex-1 bg-white/8" />
          </div>

          <button
            onClick={handleGoogleLogin}
            disabled={isLoading}
            className="flex w-full items-center justify-center gap-3 rounded-2xl border border-white/10 bg-black/20 px-4 py-3.5 text-sm font-semibold text-white transition hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
            </svg>
            Google 로그인
          </button>
        </section>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  type: string;
}) {
  return (
    <div>
      <label className="mb-2 block text-sm font-medium text-slate-300">{label}</label>
      <input
        type={type}
        required
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-white outline-none transition focus:border-blue-400/40 focus:bg-black/35"
      />
    </div>
  );
}

function LoginFeature({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-[1.4rem] border border-white/8 bg-white/5 p-4">
      <p className="text-sm font-semibold text-white">{title}</p>
      <p className="mt-2 text-sm leading-6 text-slate-400">{description}</p>
    </div>
  );
}
