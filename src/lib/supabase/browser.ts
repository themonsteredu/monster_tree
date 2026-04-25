"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * 브라우저(클라이언트 컴포넌트)에서 사용하는 Supabase 클라이언트.
 * - TV 화면의 Realtime 구독, admin 화면의 학생 목록 조회 등에 사용합니다.
 * - anon 키만 노출되므로 RLS 가 반드시 활성화되어 있어야 합니다.
 *
 * 환경변수가 비어 있으면 throw 하지 않고 null 을 반환합니다.
 * (Vercel 에서 NEXT_PUBLIC_* 변수가 빌드 시점에 inline 되지 않은 경우,
 *  예전에는 useEffect 안에서 throw 가 발생해 "Application error: a client-side
 *  exception has occurred" 화면이 떴습니다.)
 */
export function createSupabaseBrowserClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    if (typeof window !== "undefined") {
      // eslint-disable-next-line no-console
      console.error(
        "[사과정원] NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY 가 클라이언트 번들에 없어요. " +
          "Vercel Settings → Environment Variables 에 두 값을 등록한 뒤 반드시 재배포(Redeploy)해야 클라이언트 번들에 inline 됩니다.",
      );
    }
    return null;
  }

  return createBrowserClient(url, key);
}

/** 클라이언트 측에서 환경변수가 잡혀 있는지 빠르게 체크. */
export function hasBrowserSupabaseEnv(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}
