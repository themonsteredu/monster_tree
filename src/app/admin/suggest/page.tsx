// /admin/suggest — 관리자용 건의함 관리.
// 현 지점의 건의글 + 제한된 학생 목록 SSR.

import Link from "next/link";
import { redirect } from "next/navigation";
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

  const branchId = getAdminBranchId();
  const branchName = getAdminBranchName();
  const monsterUrl = getMonsterSiteUrl();
  if (!branchId) {
    redirect("/admin/select-branch");
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
              href="/admin"
              className="shrink-0 text-sm text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-lg px-3 py-1.5 transition"
            >
              ← 관리
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
