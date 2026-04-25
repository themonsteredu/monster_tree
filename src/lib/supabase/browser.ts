"use client";

import { createBrowserClient } from "@supabase/ssr";

/**
 * 브라우저(클라이언트 컴포넌트)에서 사용하는 Supabase 클라이언트.
 * - TV 화면의 Realtime 구독, admin 화면의 학생 목록 조회 등에 사용합니다.
 * - anon 키만 노출되므로 RLS 가 반드시 활성화되어 있어야 합니다.
 */
export function createSupabaseBrowserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    // 양희쌤이 .env.local 을 채우지 않은 경우, 콘솔에 한국어로 친절히 안내
    // (UI 에서도 별도로 안내하지만, 개발자 도구에 정확한 원인을 남김)
    // eslint-disable-next-line no-console
    console.error(
      "[사과정원] Supabase 환경변수가 비어 있어요. .env.local 의 NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY 를 채워주세요.",
    );
  }

  return createBrowserClient(url ?? "", key ?? "");
}
