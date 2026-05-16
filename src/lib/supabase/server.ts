import { createClient, SupabaseClient } from "@supabase/supabase-js";

/**
 * 서버 컴포넌트 / Server Action 에서 사용하는 Supabase 클라이언트.
 *
 * 두 가지 모드:
 *  - createSupabaseServerAnonClient(): anon 키 사용 (읽기 전용)
 *  - createSupabaseServiceClient(): service_role 키 사용 (RLS 우회, 쓰기 가능)
 *
 * service_role 키는 절대 NEXT_PUBLIC_ 접두사를 붙이지 마세요.
 * 브라우저로 노출되면 누구나 데이터를 수정할 수 있게 됩니다.
 *
 * Next.js 13+ 가 fetch 응답을 자동 캐시(Data Cache)하는데, supabase-js 가
 * 내부적으로 fetch 를 써서 빈번 변동 데이터(garden_students, tree_stages 등)
 * 가 stale 응답을 반환하는 문제가 있다. cache: 'no-store' fetch 주입으로 우회.
 */

const noStoreFetch: typeof fetch = (input, init) =>
  fetch(input, { ...(init ?? {}), cache: "no-store" });

export function createSupabaseServerAnonClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: noStoreFetch },
  });
}

export function createSupabaseServiceClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    "";
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: noStoreFetch },
  });
}
