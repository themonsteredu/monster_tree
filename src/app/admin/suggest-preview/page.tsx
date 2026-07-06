// /admin/suggest-preview — 관리자가 학생 칠판 화면 그대로 보며 인라인으로 관리.
// 같은 지점의 모든 건의글 + 차단 정보 + 학생 정보를 로드해 SuggestClient 에 adminMode 로 전달.
// 학생 폼은 숨겨지고, 각 포스트잇 아래에 답장/상태/삭제/차단 컨트롤이 노출됨.

import Link from "next/link";
import { createSupabaseServerAnonClient } from "@/lib/supabase/server";
import { getAdminBranchId, getAdminBranchName } from "@/lib/branch";
import type { GardenSuggestion, GardenStudent, SuggestionBlock } from "@/lib/types";
import { isAdminAuthenticated } from "../auth";
import { LoginForm } from "../LoginForm";
import {
  SuggestClient,
  type SuggestionView,
  type AdminStudentInfo,
  type AdminBlockInfo,
} from "../../me/suggest/SuggestClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminSuggestPreviewPage({
  searchParams,
}: {
  searchParams: { key?: string; branch?: string };
}) {
  if (!isAdminAuthenticated(searchParams.key)) {
    return <LoginForm initialKey={searchParams.key ?? ""} />;
  }

  const branchId = getAdminBranchId() ?? searchParams.branch?.trim() ?? null;
  const branchName = getAdminBranchName();

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
          "id, branch_id, student_id, student_name_snapshot, is_anonymous, visibility, category, title, body, status, reply, replied_at, created_at, updated_at",
        )
        .eq("branch_id", branchId)
        .order("created_at", { ascending: false })
        .limit(200),
      sb
        .from("garden_suggestion_blocks")
        .select(
          "id, student_id, branch_id, reason, blocked_at, blocked_until, blocked_by",
        )
        .eq("branch_id", branchId),
      sb
        .from("garden_students")
        .select("id, name, class_name, branch_id")
        .eq("branch_id", branchId),
    ]);

  const suggestions = (suggestionRows ?? []) as GardenSuggestion[];

  // 공감 카운트 일괄 조회 (학생 화면과 동일 표시 — adminMode 는 읽기전용 카운트)
  const suggestionIds = suggestions.map((s) => s.id);
  const reactionCounts = new Map<string, { heart: number; thumbs: number }>();
  if (suggestionIds.length > 0) {
    const { data: reactionRows } = await sb
      .from("garden_suggestion_reactions")
      .select("suggestion_id, kind")
      .in("suggestion_id", suggestionIds);
    for (const r of (reactionRows ?? []) as Array<{ suggestion_id: string; kind: string }>) {
      const counts = reactionCounts.get(r.suggestion_id) ?? { heart: 0, thumbs: 0 };
      if (r.kind === "heart") counts.heart += 1;
      else if (r.kind === "thumbs") counts.thumbs += 1;
      reactionCounts.set(r.suggestion_id, counts);
    }
  }
  const blocks = (blockRows ?? []) as SuggestionBlock[];
  const students = (studentRows ?? []) as Pick<
    GardenStudent,
    "id" | "name" | "class_name" | "branch_id"
  >[];

  // 학생 id → 정보 매핑 (차단 시 이름 노출 + 익명 글이라도 admin 에서 실제 작성자 확인)
  const studentInfo: Record<string, AdminStudentInfo> = {};
  for (const s of students) {
    studentInfo[s.id] = { name: s.name, className: s.class_name ?? null };
  }

  // 학생 id → 활성 차단 정보
  const nowIso = new Date().toISOString();
  const blockInfo: Record<string, AdminBlockInfo> = {};
  for (const b of blocks) {
    if (b.blocked_until && b.blocked_until <= nowIso) continue;
    blockInfo[b.student_id] = {
      reason: b.reason ?? null,
      blockedUntil: b.blocked_until ?? null,
    };
  }

  // SuggestionView 매핑 — adminMode 에서는 student_id 와 실제 이름을 그대로 노출 (관리 목적).
  const views: SuggestionView[] = suggestions.map((s) => ({
    id: s.id,
    is_mine: false,
    is_anonymous: !!s.is_anonymous,
    visibility: s.visibility ?? "public",
    student_name_snapshot: s.student_name_snapshot,
    category: s.category,
    title: s.title,
    body: s.body,
    status: s.status,
    reply: s.reply,
    replied_at: s.replied_at,
    created_at: s.created_at,
    updated_at: s.updated_at,
    admin_student_id: s.student_id ?? null,
    reaction_counts: reactionCounts.get(s.id) ?? { heart: 0, thumbs: 0 },
    my_reaction: null,
  }));

  const displayName = branchName ? `${branchName} 관리자` : "관리자";
  const adminListLink = `/admin/suggest?branch=${encodeURIComponent(branchId)}`;

  return (
    <>
      <div className="bg-amber-100 border-b border-amber-200 px-4 py-2 text-xs text-amber-800 text-center">
        ⓘ 학생이 보는 건의함 화면입니다. 쪽지마다 관리 버튼이 있어요.{" "}
        <Link href="/admin" className="underline hover:no-underline">
          관리 홈
        </Link>
      </div>
      <SuggestClient
        studentName={displayName}
        suggestions={views}
        activeBlock={null}
        adminMode
        adminLink={adminListLink}
        adminStudentInfo={studentInfo}
        adminBlockInfo={blockInfo}
      />
    </>
  );
}
