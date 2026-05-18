// /admin/decorations — 마당 소품 마스터 관리 페이지.
// 카테고리 탭 + 카드 그리드 + 새 소품 추가 폼.

import Link from "next/link";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { isAdminAuthenticated } from "../auth";
import { LoginForm } from "../LoginForm";
import { DecorationsAdminClient } from "./DecorationsAdminClient";
import type { DecorationItem } from "@/lib/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function DecorationsAdminPage({
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
    .from("decoration_items")
    .select(
      "id, name, image_url, category, price, default_width_percent, is_active, created_at, updated_at",
    )
    .order("category", { ascending: true })
    .order("created_at", { ascending: false });

  return (
    <main className="min-h-screen pb-24 bg-gray-50">
      <header className="sticky top-0 z-30 bg-white border-b border-gray-100">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-2">
          <Link
            href="/admin"
            className="shrink-0 text-sm text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-lg px-3 py-1.5 transition"
          >
            ← 관리
          </Link>
          <h1 className="text-lg font-semibold text-gray-900 truncate">마당 소품 관리</h1>
        </div>
      </header>
      <DecorationsAdminClient initialItems={(data ?? []) as DecorationItem[]} />
    </main>
  );
}
