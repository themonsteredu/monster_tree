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
 */

export function createSupabaseServerAnonClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function createSupabaseServiceClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  // service_role 이 없으면 anon 으로 폴백 (개발 초기에는 RLS 가 막혀 쓰기가 실패함)
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    "";
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
