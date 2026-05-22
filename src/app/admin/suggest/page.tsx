// /admin/suggest — 관리자용 건의함 관리.
// 현 지점의 건의글 + 제한된 학생 목록 SSR.
// branch 는 쿠키 우선, 없으면 ?branch= 쿼리 fallback (cookie path 이슈 우회).

import Link from "next/link";
import { createSupabaseServerAnonClient } from "@/lib/supabase/server";
import { getAdminBranchId, getAdminBranchName } from "@/lib/branch";
import { getMonsterSiteUrl } from "@/lib/monster-site";
import { isAdminAuthenticated } from "../auth";
import { LoginForm } from "../LoginForm";
import type { GardenSuggestion, GardenStudent, SuggestionBlock } from "@/lib/types";
import { SuggestAdminClient } from "./SuggestAdminClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminSuggestPage({
  searchParams,
}: {
  searchParams: { key?: string; branch?: string };
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

  // 1) 쿠키 우선, 없으면 쿼리 fallback. 이 우회로 cookie path / basePath
  //    이슈로 인한 select-branch 무한 redirect 방지.
  const branchId = getAdminBranchId() ?? searchParams.branch?.trim() ?? null;
  const branchName = getAdminBranchName();
  const monsterUrl = getMonsterSiteUrl();

  if (!branchId) {
    return (
      <main className="min-h-screen bg-gray-50 px-4 py-10">
        <div className="max-w-md mx-auto bg-white rounded-2xl border border-gray-100 shadow-sm p-6 text-center">
          <h1 className="text-lg font-semibold text-gray-900 mb-2">
            지점이 선택되지 않았어요
          </h1>
          <p className="text-sm text-gray-500 mb-5">
            건의함은 지점별로 분리되어 있어요. 먼저 지점을 선택해주세요.
          </p>
          <div className="flex gap-2 justify-center">
            <Link
              href="/admin/select-branch"
              className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium"
            >
              지점 선택하기
            </Link>
            <Link
              href="/admin"
              className="px-4 py-2 rounded-lg border border-gray-200 bg-white text-sm text-gray-600 hover:bg-gray-50"
            >
              관리 홈
            </Link>
          </div>
        </div>
      </main>
    );
  }

  const sb = createSupabaseServerAnonClient();
  const [{ data: suggestionRows }, { data: blockRows }, { data: studentRows }] =
    await Promise.all([
      sb
        .from("garden_suggestions")
        .select(
          "id, branch_id, student_id, student_name_snapshot, is_anonymous, category, title, body, status, reply, replied_at, created_at, updated_at",
        )
        .eq("branch_id", branchId!)
        .order("created_at", { ascending: false })
        .limit(200),
      sb
        .from("garden_suggestion_blocks")
        .select("id, student_id, branch_id, reason, blocked_at, blocked_until, blocked_by")
        .eq("branch_id", branchId!),
      sb
        .from("garden_students")
        .select("id, name, class_name, branch_id, total_points, current_stage, apples_harvested, is_active, created_at")
        .eq("branch_id", branchId!),
    ]);

  const suggestions = (suggestionRows ?? []) as GardenSuggestion[];
  const blocks = (blockRows ?? []) as SuggestionBlock[];
  const students = (studentRows ?? []) as GardenStudent[];

  const studentMap: Record<string, { name: string; class_name: string | null }> = {};
  for (const s of students) {
    studentMap[s.id] = { name: s.name, class_name: s.class_name };
  }

  return (
    <main className="min-h-screen pb-20 bg-gray-50">
      <header className="sticky top-0 z-30 bg-white border-b border-gray-100">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Link
              href={branchId ? `/admin/village-preview?branch=${encodeURIComponent(branchId)}` : "/admin/village-preview"}
              className="shrink-0 text-sm text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-lg px-3 py-1.5 transition"
            >
              ← 몬스터마을
            </Link>
            <h1 className="text-lg font-semibold text-gray-900 truncate">
              건의함 관리
            </h1>
            {branchName && (
              <span className="text-xs text-gray-400 truncate">{branchName}</span>
            )}
          </div>
          <a
            href={monsterUrl}
            className="shrink-0 text-sm text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-lg px-3 py-1.5 transition"
          >
            ← 본사
          </a>
        </div>
      </header>

      <SuggestAdminClient
        initialSuggestions={suggestions}
        initialBlocks={blocks}
        studentMap={studentMap}
      />
    </main>
  );
}
