// /admin/monsters — 몬스터 종 관리 메인 페이지.
// 종 카드 그리드 (1단계 알 미리보기 + 단계별 업로드 상태 체크리스트 + 활성토글 + "관리" 버튼)
// + "새 종 추가" 폼.

import Link from "next/link";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { isAdminAuthenticated } from "../auth";
import { LoginForm } from "../LoginForm";
import { MonstersAdminClient } from "./MonstersAdminClient";
import type { MonsterSpecies, MonsterStageImage } from "@/lib/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function MonstersAdminPage({
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
  const [{ data: species }, { data: stages }] = await Promise.all([
    sb
      .from("monster_species")
      .select("id, name, description, display_order, is_active, hide_name, created_at, updated_at")
      .order("display_order", { ascending: true }),
    sb
      .from("monster_stage_images")
      .select("id, species_id, stage, image_url, stage_name, required_exp, updated_at")
      .order("species_id", { ascending: true })
      .order("stage", { ascending: true }),
  ]);

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
          <h1 className="text-lg font-semibold text-gray-900 truncate">몬스터 종 관리</h1>
        </div>
      </header>
      <MonstersAdminClient
        initialSpecies={(species ?? []) as MonsterSpecies[]}
        initialStages={(stages ?? []) as MonsterStageImage[]}
      />
    </main>
  );
}
