// /me/suggest — 학생 건의함.
// JWT 검증 후 같은 지점의 모든 건의글을 SSR 로 가져온다. 익명 글은 이름을 마스킹하고
// student_id 도 클라이언트에 보내지 않는다. 본인 글 여부(is_mine)는 서버에서 결정.

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { STUDENT_COOKIE_NAME, verifyStudentJwt } from "@/lib/student-jwt";
import {
  createSupabaseServerAnonClient,
  createSupabaseServiceClient,
} from "@/lib/supabase/server";
import type { GardenSuggestion, SuggestionBlock } from "@/lib/types";
import { SuggestClient, type SuggestionView } from "./SuggestClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function SuggestPage() {
  const token = cookies().get(STUDENT_COOKIE_NAME)?.value;
  const payload = await verifyStudentJwt(token);
  if (!payload) redirect("https://www.themonster.kr/login");

  const sb = createSupabaseServerAnonClient();
  const { data: student } = await sb
    .from("garden_students")
    .select("id")
    .eq("branch_id", payload!.branchId)
    .eq("external_student_id", payload!.studentLocalId)
    .maybeSingle();

  const studentId = (student?.id as string | undefined) ?? null;

  const sbSvc = createSupabaseServiceClient();
  const [{ data: rows }, { data: block }] = await Promise.all([
    sbSvc
      .from("garden_suggestions")
      .select(
        "id, branch_id, student_id, student_name_snapshot, is_anonymous, visibility, category, title, body, status, reply, replied_at, created_at, updated_at",
      )
      .eq("branch_id", payload!.branchId)
      .order("created_at", { ascending: false })
      .limit(200),
    studentId
      ? sbSvc
          .from("garden_suggestion_blocks")
          .select(
            "id, student_id, branch_id, reason, blocked_at, blocked_until, blocked_by",
          )
          .eq("student_id", studentId)
          .maybeSingle()
      : Promise.resolve({ data: null } as { data: null }),
  ]);

  const suggestions: SuggestionView[] = ((rows ?? []) as GardenSuggestion[]).map(
    (s) => {
      const isMine = !!studentId && s.student_id === studentId;
      const visibility = s.visibility ?? "public";
      // 비공개 글 + 남의 글이면 본문/답장/이름을 서버에서 아예 비워서 전달 (privacy).
      // 공개 글은 익명 처리만 하고 본문은 노출 (다른 학생도 읽을 수 있음).
      const hideContent = !isMine && visibility === "private";
      const maskName = !isMine && s.is_anonymous;
      return {
        id: s.id,
        is_mine: isMine,
        is_anonymous: !!s.is_anonymous,
        visibility,
        student_name_snapshot: hideContent || maskName ? "" : s.student_name_snapshot,
        category: s.category,
        title: hideContent ? "" : s.title,
        body: hideContent ? "" : s.body,
        status: s.status,
        reply: hideContent ? null : s.reply,
        replied_at: hideContent ? null : s.replied_at,
        created_at: s.created_at,
        updated_at: s.updated_at,
      };
    },
  );

  let activeBlock: SuggestionBlock | null = null;
  if (block) {
    const b = block as SuggestionBlock;
    const nowIso = new Date().toISOString();
    if (!b.blocked_until || b.blocked_until > nowIso) {
      activeBlock = b;
    }
  }

  return (
    <SuggestClient
      studentName={payload!.name}
      suggestions={suggestions}
      activeBlock={activeBlock}
    />
  );
}
