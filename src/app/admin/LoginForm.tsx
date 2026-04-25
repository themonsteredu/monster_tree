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
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-sm bg-white rounded-3xl shadow-card p-8">
        <div className="text-center mb-6">
          <div className="text-5xl mb-2">🍎</div>
          <h1 className="text-2xl font-bold">사과정원 관리자</h1>
          <p className="text-sm text-ink-soft mt-2">원장님 비밀번호를 입력해주세요</p>
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
          className="space-y-4"
        >
          <input
            type="password"
            name="key"
            autoFocus
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="비밀번호"
            className="w-full px-4 py-3 rounded-xl border border-ink-soft/20 focus:outline-none focus:ring-2 focus:ring-apple text-lg"
          />
          {error && <p className="text-sm text-apple">{error}</p>}
          <button
            type="submit"
            disabled={pending}
            className="w-full py-3 rounded-xl bg-apple text-white font-semibold text-lg shadow-card-pop disabled:opacity-50"
          >
            {pending ? "확인 중…" : "들어가기"}
          </button>
        </form>
      </div>
    </main>
  );
}
