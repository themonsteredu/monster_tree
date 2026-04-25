"use client";

// 라우트 단위 에러 바운더리.
// Next.js 14 의 기본 "Application error: a client-side exception has occurred"
// 대신, 사람이 읽을 수 있는 한국어 안내와 에러 메시지를 함께 보여줍니다.
// (특히 Vercel 환경변수 미설정으로 인한 Supabase 클라이언트 초기화 실패를
//  바로 알아챌 수 있도록 함)

import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error("[사과정원] 라우트 에러:", error);
  }, [error]);

  const looksLikeSupabaseEnv =
    /supabaseUrl is required|supabaseKey is required|NEXT_PUBLIC_SUPABASE/.test(
      error?.message ?? "",
    );

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="max-w-2xl w-full rounded-3xl bg-white shadow-card p-8 text-center">
        <div className="text-5xl mb-3">🪴</div>
        <h1 className="text-2xl font-bold mb-2">잠시 멈췄어요</h1>
        {looksLikeSupabaseEnv ? (
          <p className="text-ink-soft leading-relaxed">
            Supabase 환경변수(<code>NEXT_PUBLIC_SUPABASE_URL</code> /{" "}
            <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code>)가 클라이언트 번들에 없는 것 같아요.
            <br />
            Vercel <b>Settings → Environment Variables</b> 에 두 값을 등록한 뒤
            <br />
            <b>반드시 Redeploy</b> 를 해야 클라이언트 번들에 inline 됩니다.
          </p>
        ) : (
          <p className="text-ink-soft leading-relaxed">
            예상치 못한 오류가 발생했어요. 잠시 후 다시 시도해주세요.
          </p>
        )}
        <pre className="mt-4 text-left text-xs bg-cream-deep rounded-xl p-3 overflow-auto max-h-48">
          {error?.message}
          {error?.digest ? `\n\ndigest: ${error.digest}` : ""}
        </pre>
        <button
          onClick={reset}
          className="mt-5 px-5 py-2.5 rounded-xl bg-apple text-white font-semibold"
        >
          다시 시도
        </button>
      </div>
    </main>
  );
}
