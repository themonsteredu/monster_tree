"use server";

// 학생용 건의함 Server Actions.
// - submitSuggestionAction: JWT 검증 → 차단 여부 확인 → garden_suggestions INSERT
// 모든 쓰기는 service_role 클라이언트로 RLS 우회.

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { STUDENT_COOKIE_NAME, verifyStudentJwt } from "@/lib/student-jwt";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import {
  SUGGESTION_BODY_MAX,
  SUGGESTION_TITLE_MAX,
  type SuggestionCategory,
} from "@/lib/types";

const ALLOWED_CATEGORIES: SuggestionCategory[] = [
  "praise",
  "suggestion",
  "complaint",
  "etc",
];

export type SubmitResult =
  | { ok: true }
  | { ok: false; message: string };

export async function submitSuggestionAction(input: {
  category: string;
  title: string;
  body: string;
  isAnonymous: boolean;
}): Promise<SubmitResult> {
  const token = cookies().get(STUDENT_COOKIE_NAME)?.value;
  const payload = await verifyStudentJwt(token);
  if (!payload) return { ok: false, message: "로그인이 필요해요." };

  const category = input.category as SuggestionCategory;
  if (!ALLOWED_CATEGORIES.includes(category)) {
    return { ok: false, message: "카테고리를 선택해주세요." };
  }

  const title = (input.title ?? "").trim();
  const body = (input.body ?? "").trim();
  if (!title) return { ok: false, message: "제목을 입력해주세요." };
  if (title.length > SUGGESTION_TITLE_MAX) {
    return { ok: false, message: `제목은 ${SUGGESTION_TITLE_MAX}자 이내로 입력해주세요.` };
  }
  if (!body) return { ok: false, message: "내용을 입력해주세요." };
  if (body.length > SUGGESTION_BODY_MAX) {
    return { ok: false, message: `내용은 ${SUGGESTION_BODY_MAX}자 이내로 입력해주세요.` };
  }

  const sb = createSupabaseServiceClient();

  const { data: student, error: studentErr } = await sb
    .from("garden_students")
    .select("id, name")
    .eq("branch_id", payload.branchId)
    .eq("external_student_id", payload.studentLocalId)
    .maybeSingle();
  if (studentErr || !student) {
    return { ok: false, message: "학생 정보를 찾을 수 없어요." };
  }

  // 차단 여부 확인 (영구 또는 미만료)
  const nowIso = new Date().toISOString();
  const { data: block } = await sb
    .from("garden_suggestion_blocks")
    .select("blocked_until, reason")
    .eq("student_id", student.id)
    .maybeSingle();
  if (block) {
    const until = block.blocked_until as string | null;
    if (!until || until > nowIso) {
      const reason = (block.reason as string | null)?.trim();
      const untilLabel = until
        ? `해제 예정: ${new Date(until).toLocaleString("ko-KR")}`
        : "영구 제한";
      return {
        ok: false,
        message: `건의함 사용이 제한되었어요.${reason ? ` (사유: ${reason})` : ""} ${untilLabel}`,
      };
    }
  }

  const { error: insertErr } = await sb.from("garden_suggestions").insert({
    branch_id: payload.branchId,
    student_id: student.id,
    student_name_snapshot: payload.name,
    is_anonymous: !!input.isAnonymous,
    category,
    title,
    body,
  });
  if (insertErr) {
    return { ok: false, message: `제출 실패: ${insertErr.message}` };
  }

  revalidatePath("/me/suggest");
  return { ok: true };
}
