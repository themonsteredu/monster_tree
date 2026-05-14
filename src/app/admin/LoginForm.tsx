"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { loginAction } from "./actions";

export function LoginForm({ initialKey }: { initialKey: string }) {
  const [key, setKey] = useState(initialKey);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <main className="min-h-screen flex items-center justify-center p-6 bg-gray-50">
      <div className="w-full max-w-sm bg-white rounded-2xl border border-gray-100 shadow-sm p-8">
        <div className="text-center mb-6">
          <h1 className="text-xl font-semibold text-gray-900">사과정원 관리자</h1>
          <p className="text-sm text-gray-500 mt-1.5">비밀번호를 입력해주세요</p>
        </div>

        <form
          action={(fd) => {
            setError(null);
            startTransition(async () => {
              const res = await loginAction(fd);
              if (!res.ok) {
                setError(res.message);
                return;
              }
              router.replace("/admin");
              router.refresh();
            });
          }}
          className="space-y-3"
        >
          <input
            type="password"
            name="key"
            autoFocus
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="비밀번호"
            className="w-full px-3 py-2.5 rounded-lg border border-gray-200 bg-white text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-300 focus:border-transparent transition"
          />
          {error && <p className="text-sm text-red-500">{error}</p>}
          <button
            type="submit"
            disabled={pending}
            className="w-full py-2.5 rounded-lg bg-gray-900 text-white font-medium hover:bg-gray-800 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {pending ? "확인 중…" : "들어가기"}
          </button>
        </form>
      </div>
    </main>
  );
}
