// /admin/yard — 마이룸 마당 글로벌 배경 관리자 페이지.
// 단일 행 (yard_settings) 의 background_image 만 수정. 학생들에게 즉시 반영.

import Link from "next/link";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { isAdminAuthenticated } from "../auth";
import { LoginForm } from "../LoginForm";
import { YardAdminClient } from "./YardAdminClient";
import type { YardSettings } from "@/lib/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function YardAdminPage({
  searchParams,
}: {
  searchParams: { key?: string };
}) {
  if (!isAdminAuthenticated(searchParams.key)) {
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
      <header className="sticky top-0 z-30 bg-white border-b border-gray-100">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-2">
          <Link
            href="/admin"
            className="shrink-0 text-sm text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-lg px-3 py-1.5 transition"
          >
            ← 관리
          </Link>
          <h1 className="text-lg font-semibold text-gray-900 truncate">마당 배경</h1>
        </div>
      </header>
      <YardAdminClient initial={(data as YardSettings | null) ?? null} />
    </main>
  );
}
