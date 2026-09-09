// /admin/yard — TV 정원의 공통 배경. 학생 개인 숲속 마당과 분리.
// 기존 yard_settings 및 업로드 이미지는 TV 화면에서 계속 사용한다.

import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { isAdminAuthenticated } from "../auth";
import { LoginForm } from "../LoginForm";
import { AdminHeader } from "../AdminHeader";
import { YardAdminClient } from "./YardAdminClient";
import type { YardSettings } from "@/lib/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function YardAdminPage(
  props: {
    searchParams: Promise<{ key?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  if (!(await isAdminAuthenticated(searchParams.key))) {
    return <LoginForm initialKey={searchParams.key ?? ""} />;
  }
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    return (
      <main className="p-6 text-center text-gray-400 bg-gray-50 min-h-screen">
        Supabase 환경변수가 설정되지 않았어요.
      </main>
    );
  }

  const sb = createSupabaseServiceClient();
  const { data } = await sb
    .from("yard_settings")
    .select("id, background_image, is_active, updated_at")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  return (
    <main className="min-h-screen pb-20 bg-gray-50">
      <AdminHeader current="yard" title="TV 마당 배경" />
      <YardAdminClient initial={(data as YardSettings | null) ?? null} />
    </main>
  );
}
