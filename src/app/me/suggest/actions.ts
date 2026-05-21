"use server";

// 학생용 건의함 Server Actions.
// - submitSuggestionAction: 새 글 작성
// - editSuggestionAction: 본인 글 수정
// - deleteSuggestionAction: 본인 글 삭제
// 모든 쓰기는 service_role 클라이언트로 RLS 우회. 소유권은 JWT 의 student 와
// 대상 row 의 student_id 가 일치하는지 서버에서 직접 검증한다.

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

// JWT → student row 조회 헬퍼.
async function resolveCurrentStudent() {
  const token = cookies().get(STUDENT_COOKIE_NAME)?.value;
  const payload = await verifyStudentJwt(token);
  if (!payload) return null;
  const sb = createSupabaseServiceClient();
  const { data: student } = await sb
    .from("garden_students")
    .select("id, name")
    .eq("branch_id", payload.branchId)
    .eq("external_student_id", payload.studentLocalId)
    .maybeSingle();
  if (!student) return null;
  return {
    sb,
    payload,
    student: student as { id: string; name: string },
  };
}

function validateFields(input: {
  category: string;
  title: string;
  body: string;
}):
  | { ok: true; category: SuggestionCategory; title: string; body: string }
  | { ok: false; message: string } {
  const category = input.category as SuggestionCategory;
  if (!ALLOWED_CATEGORIES.includes(category)) {
    return { ok: false, message: "카테고리를 선택해주세요." };
  }
  const title = (input.title ?? "").trim();
  const body = (input.body ?? "").trim();
  if (!title) return { ok: false, message: "제목을 입력해주세요." };
  if (title.length > SUGGESTION_TITLE_MAX) {
    return {
      ok: false,
      message: `제목은 ${SUGGESTION_TITLE_MAX}자 이내로 입력해주세요.`,
    };
  }
  if (!body) return { ok: false, message: "내용을 입력해주세요." };
  if (body.length > SUGGESTION_BODY_MAX) {
    return {
      ok: false,
      message: `내용은 ${SUGGESTION_BODY_MAX}자 이내로 입력해주세요.`,
    };
  }
  return { ok: true, category, title, body };
}

async function isBlocked(
  sb: ReturnType<typeof createSupabaseServiceClient>,
  studentId: string,
): Promise<{ blocked: boolean; message?: string }> {
  const nowIso = new Date().toISOString();
  const { data: block } = await sb
    .from("garden_suggestion_blocks")
    .select("blocked_until, reason")
    .eq("student_id", studentId)
    .maybeSingle();
  if (!block) return { blocked: false };
  const until = block.blocked_until as string | null;
  if (until && until <= nowIso) return { blocked: false };
  const reason = (block.reason as string | null)?.trim();
  const untilLabel = until
    ? `해제 예정: ${new Date(until).toLocaleString("ko-KR")}`
    : "영구 제한";
  return {
    blocked: true,
    message: `건의함 사용이 제한되었어요.${reason ? ` (사유: ${reason})` : ""} ${untilLabel}`,
  };
}

export async function submitSuggestionAction(input: {
  category: string;
  title: string;
  body: string;
  isAnonymous: boolean;
}): Promise<SubmitResult> {
  const me = await resolveCurrentStudent();
  if (!me) return { ok: false, message: "로그인이 필요해요." };

  const valid = validateFields(input);
  if (!valid.ok) return valid;

  const block = await isBlocked(me.sb, me.student.id);
  if (block.blocked) return { ok: false, message: block.message! };

  const { error: insertErr } = await me.sb.from("garden_suggestions").insert({
    branch_id: me.payload.branchId,
    student_id: me.student.id,
    student_name_snapshot: me.payload.name,
    is_anonymous: !!input.isAnonymous,
    category: valid.category,
    title: valid.title,
    body: valid.body,
  });
  if (insertErr) {
    return { ok: false, message: `제출 실패: ${insertErr.message}` };
  }

  revalidatePath("/me/suggest");
  revalidatePath("/admin/suggest");
  return { ok: true };
}

export async function editSuggestionAction(input: {
  id: string;
  category: string;
  title: string;
  body: string;
  isAnonymous: boolean;
}): Promise<SubmitResult> {
  const me = await resolveCurrentStudent();
  if (!me) return { ok: false, message: "로그인이 필요해요." };

  const id = (input.id ?? "").trim();
  if (!id) return { ok: false, message: "잘못된 요청이에요." };

  const valid = validateFields(input);
  if (!valid.ok) return valid;

  const block = await isBlocked(me.sb, me.student.id);
  if (block.blocked) return { ok: false, message: block.message! };

  const { data: target } = await me.sb
    .from("garden_suggestions")
    .select("id, student_id, branch_id")
    .eq("id", id)
    .maybeSingle();
  if (!target) return { ok: false, message: "쪽지를 찾을 수 없어요." };
  if (
    target.student_id !== me.student.id ||
    target.branch_id !== me.payload.branchId
  ) {
    return { ok: false, message: "본인이 쓴 쪽지만 수정할 수 있어요." };
  }

  const { error: updErr } = await me.sb
    .from("garden_suggestions")
    .update({
      category: valid.category,
      title: valid.title,
      body: valid.body,
      is_anonymous: !!input.isAnonymous,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (updErr) {
    return { ok: false, message: `수정 실패: ${updErr.message}` };
  }

  revalidatePath("/me/suggest");
  revalidatePath("/admin/suggest");
  return { ok: true };
}

export async function deleteSuggestionAction(input: {
  id: string;
}): Promise<SubmitResult> {
  const me = await resolveCurrentStudent();
  if (!me) return { ok: false, message: "로그인이 필요해요." };

  const id = (input.id ?? "").trim();
  if (!id) return { ok: false, message: "잘못된 요청이에요." };

  const { data: target } = await me.sb
    .from("garden_suggestions")
    .select("id, student_id, branch_id")
    .eq("id", id)
    .maybeSingle();
  if (!target) return { ok: false, message: "쪽지를 찾을 수 없어요." };
  if (
    target.student_id !== me.student.id ||
    target.branch_id !== me.payload.branchId
  ) {
    return { ok: false, message: "본인이 쓴 쪽지만 삭제할 수 있어요." };
  }

  const { error: delErr } = await me.sb
    .from("garden_suggestions")
    .delete()
    .eq("id", id);
  if (delErr) {
    return { ok: false, message: `삭제 실패: ${delErr.message}` };
  }

  revalidatePath("/me/suggest");
  revalidatePath("/admin/suggest");
  return { ok: true };
}
