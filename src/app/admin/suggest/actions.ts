"use server";

// 관리자용 건의함 Server Actions.
// - 답변 / 상태 변경 / 삭제 / 학생 차단 / 차단 해제

import { revalidatePath } from "next/cache";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { getAdminBranchId } from "@/lib/branch";
import { isAdminAuthenticated } from "../auth";
import {
  SUGGESTION_REPLY_MAX,
  type SuggestionStatus,
} from "@/lib/types";

const ALLOWED_STATUS: SuggestionStatus[] = ["received", "reviewing", "done"];

function ensureAuth() {
  if (!isAdminAuthenticated()) {
    throw new Error("AUTH_REQUIRED: 비밀번호가 필요합니다.");
  }
}

function ensureBranch(): { ok: true; branchId: string } | { ok: false; message: string } {
  const branchId = getAdminBranchId();
  if (!branchId) return { ok: false, message: "지점이 선택되지 않았어요." };
  return { ok: true, branchId };
}

export async function replyToSuggestionAction(input: {
  id: string;
  reply: string;
  status?: string | null;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  ensureAuth();
  const reply = (input.reply ?? "").trim();
  if (!reply) return { ok: false, message: "답변을 입력해주세요." };
  if (reply.length > SUGGESTION_REPLY_MAX) {
    return { ok: false, message: `답변은 ${SUGGESTION_REPLY_MAX}자 이내로 입력해주세요.` };
  }
  const status = (input.status ?? "done") as SuggestionStatus;
  if (!ALLOWED_STATUS.includes(status)) {
    return { ok: false, message: "잘못된 상태값이에요." };
  }

  const sb = createSupabaseServiceClient();
  const { error } = await sb
    .from("garden_suggestions")
    .update({
      reply,
      replied_at: new Date().toISOString(),
      status,
    })
    .eq("id", input.id);
  if (error) return { ok: false, message: `답변 저장 실패: ${error.message}` };

  revalidatePath("/admin/suggest");
  revalidatePath("/me/suggest");
  return { ok: true };
}

export async function updateSuggestionStatusAction(input: {
  id: string;
  status: string;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  ensureAuth();
  const status = input.status as SuggestionStatus;
  if (!ALLOWED_STATUS.includes(status)) {
    return { ok: false, message: "잘못된 상태값이에요." };
  }

  const sb = createSupabaseServiceClient();
  const { error } = await sb
    .from("garden_suggestions")
    .update({ status })
    .eq("id", input.id);
  if (error) return { ok: false, message: `상태 변경 실패: ${error.message}` };

  revalidatePath("/admin/suggest");
  revalidatePath("/me/suggest");
  return { ok: true };
}

export async function deleteSuggestionAction(
  id: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  ensureAuth();
  if (!id) return { ok: false, message: "잘못된 요청이에요." };

  const sb = createSupabaseServiceClient();
  const { error } = await sb.from("garden_suggestions").delete().eq("id", id);
  if (error) return { ok: false, message: `삭제 실패: ${error.message}` };

  revalidatePath("/admin/suggest");
  revalidatePath("/me/suggest");
  return { ok: true };
}

export async function blockStudentAction(input: {
  studentId: string;
  reason: string | null;
  durationDays: number | null; // null = 영구
}): Promise<{ ok: true } | { ok: false; message: string }> {
  ensureAuth();
  const branch = ensureBranch();
  if (!branch.ok) return branch;

  if (!input.studentId) return { ok: false, message: "학생을 찾을 수 없어요." };

  const blocked_until =
    input.durationDays == null
      ? null
      : new Date(Date.now() + input.durationDays * 24 * 60 * 60 * 1000).toISOString();

  const sb = createSupabaseServiceClient();
  const { error } = await sb
    .from("garden_suggestion_blocks")
    .upsert(
      {
        student_id: input.studentId,
        branch_id: branch.branchId,
        reason: input.reason?.trim() ? input.reason.trim() : null,
        blocked_until,
        blocked_at: new Date().toISOString(),
      },
      { onConflict: "student_id" },
    );
  if (error) return { ok: false, message: `제한 등록 실패: ${error.message}` };

  revalidatePath("/admin/suggest");
  revalidatePath("/me/suggest");
  return { ok: true };
}

export async function unblockStudentAction(
  studentId: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  ensureAuth();
  if (!studentId) return { ok: false, message: "잘못된 요청이에요." };

  const sb = createSupabaseServiceClient();
  const { error } = await sb
    .from("garden_suggestion_blocks")
    .delete()
    .eq("student_id", studentId);
  if (error) return { ok: false, message: `제한 해제 실패: ${error.message}` };

  revalidatePath("/admin/suggest");
  revalidatePath("/me/suggest");
  return { ok: true };
}
