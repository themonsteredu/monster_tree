"use server";

// Admin 화면에서 호출하는 Server Actions
// - 포인트 적립/차감 (대기열 등록) — 단일 / 일괄
// - pending 취소 / 적용된 로그 되돌리기
// - 학생 추가/수정/삭제 (지점 스코프)
// - 수확 (RPC 로 atomic 처리)
// - 학기 리셋 (지점 스코프 위험 작업)
// 모든 액션은 isAdminAuthenticated() 로 보호됩니다.

import { revalidatePath } from "next/cache";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { getAdminBranchId, clearAdminBranchCookie } from "@/lib/branch";
import { isAdminAuthenticated, setAdminCookie, clearAdminCookie, isAdminKey } from "./auth";

function ensureAuth() {
  if (!isAdminAuthenticated()) {
    throw new Error("AUTH_REQUIRED: 비밀번호가 필요합니다.");
  }
}

function ensureBranch(): { ok: true; branchId: string } | { ok: false; message: string } {
  const branchId = getAdminBranchId();
  if (!branchId) {
    return {
      ok: false,
      message: "지점이 선택되지 않았어요. /admin/select-branch 에서 지점을 골라주세요.",
    };
  }
  return { ok: true, branchId };
}

/* ============== 로그인 / 로그아웃 ============== */

export async function loginAction(formData: FormData) {
  const key = String(formData.get("key") ?? "");
  if (!isAdminKey(key)) {
    return { ok: false as const, message: "비밀번호가 올바르지 않아요." };
  }
  setAdminCookie(key);
  return { ok: true as const };
}

export async function logoutAction() {
  clearAdminCookie();
  clearAdminBranchCookie();
}

/* ============== 포인트 적립 (단일 / 일괄) ============== */

export async function addPointsAction(args: {
  studentId: string;
  delta: number;
  reason?: string | null;
}) {
  ensureAuth();
  const { studentId, delta, reason } = args;
  if (!studentId || !Number.isFinite(delta)) {
    return { ok: false as const, message: "잘못된 입력이에요." };
  }

  const sb = createSupabaseServiceClient();

  const { data: student, error: e1 } = await sb
    .from("garden_students")
    .select("id")
    .eq("id", studentId)
    .single();
  if (e1 || !student) {
    return { ok: false as const, message: "학생을 찾을 수 없어요." };
  }

  const { error: e2 } = await sb.from("garden_pending_points").insert({
    student_id: studentId,
    points: Math.trunc(delta),
    reason: reason?.trim() ? reason.trim() : null,
  });
  if (e2) {
    return { ok: false as const, message: `적립 등록 실패: ${e2.message}` };
  }

  revalidatePath("/admin");
  return { ok: true as const, pending: true };
}

export async function addPointsBulkAction(args: {
  studentIds: string[];
  delta: number;
  reason?: string | null;
}) {
  ensureAuth();
  const { studentIds, delta, reason } = args;
  if (!Array.isArray(studentIds) || studentIds.length === 0) {
    return { ok: false as const, message: "선택된 학생이 없어요." };
  }
  if (!Number.isFinite(delta)) {
    return { ok: false as const, message: "잘못된 포인트입니다." };
  }

  const sb = createSupabaseServiceClient();
  const { data, error } = await sb.rpc("garden_award_pending_bulk", {
    p_student_ids: studentIds,
    p_points: Math.trunc(delta),
    p_reason: reason ?? null,
  });
  if (error) {
    return { ok: false as const, message: `일괄 적립 실패: ${error.message}` };
  }

  revalidatePath("/admin");
  return { ok: true as const, count: (data as number | null) ?? studentIds.length };
}

/* ============== 되돌리기 / 취소 ============== */

export async function cancelPendingAction(args: { pendingId: string }) {
  ensureAuth();
  if (!args.pendingId) {
    return { ok: false as const, message: "잘못된 입력이에요." };
  }
  const sb = createSupabaseServiceClient();
  const { error } = await sb
    .from("garden_pending_points")
    .delete()
    .eq("id", args.pendingId);
  if (error) {
    return { ok: false as const, message: `취소 실패: ${error.message}` };
  }
  revalidatePath("/admin");
  return { ok: true as const };
}

export async function undoLogAction(args: { logId: string }) {
  ensureAuth();
  if (!args.logId) {
    return { ok: false as const, message: "잘못된 입력이에요." };
  }
  const sb = createSupabaseServiceClient();
  const { data, error } = await sb.rpc("garden_undo_log", {
    p_log_id: args.logId,
  });
  if (error) {
    if (error.message?.includes("log_not_found")) {
      return { ok: false as const, message: "이미 사라진 기록이에요." };
    }
    if (error.message?.includes("student_not_found")) {
      return { ok: false as const, message: "학생을 찾을 수 없어요." };
    }
    return { ok: false as const, message: `되돌리기 실패: ${error.message}` };
  }
  const result = data as {
    ok: true;
    reverted_points: number;
    new_total: number;
    new_stage: number;
    student_id: string;
  };
  revalidatePath("/admin");
  revalidatePath("/");
  return {
    ok: true as const,
    revertedPoints: result.reverted_points,
    newTotal: result.new_total,
    newStage: result.new_stage,
    studentId: result.student_id,
  };
}

/* ============== 수확 ============== */

export async function harvestStudentAction(args: { studentId: string }) {
  ensureAuth();
  const { studentId } = args;
  if (!studentId) {
    return { ok: false as const, message: "잘못된 입력이에요." };
  }

  const sb = createSupabaseServiceClient();

  const { data, error } = await sb.rpc("garden_harvest_student", {
    p_student_id: studentId,
  });
  if (error) {
    if (error.message?.includes("student_not_found")) {
      return { ok: false as const, message: "학생을 찾을 수 없어요." };
    }
    if (error.message?.includes("not_yet_harvest_stage")) {
      return {
        ok: false as const,
        message: "8단계(380pt 이상)에 도달한 학생만 수확할 수 있어요.",
      };
    }
    return { ok: false as const, message: `수확 실패: ${error.message}` };
  }

  const result = data as {
    ok: true;
    apples: number;
    new_total: number;
    new_stage: number;
  };

  revalidatePath("/admin");
  revalidatePath("/");
  return {
    ok: true as const,
    apples: result.apples,
    newTotal: result.new_total,
    newStage: result.new_stage,
  };
}

/* ============== 학생 CRUD (지점 스코프) ============== */

export async function createStudentAction(args: {
  name: string;
  className?: string | null;
}) {
  ensureAuth();
  const branchCheck = ensureBranch();
  if (!branchCheck.ok) {
    return { ok: false as const, message: branchCheck.message };
  }
  const name = args.name.trim();
  if (!name) return { ok: false as const, message: "이름을 입력해주세요." };

  const sb = createSupabaseServiceClient();
  const { error } = await sb.from("garden_students").insert({
    name,
    class_name: args.className?.trim() ? args.className.trim() : null,
    branch_id: branchCheck.branchId,
    total_points: 0,
    current_stage: 1,
    is_active: true,
  });
  if (error) return { ok: false as const, message: error.message };

  revalidatePath("/admin/students");
  revalidatePath("/admin");
  revalidatePath("/");
  return { ok: true as const };
}

export async function updateStudentAction(args: {
  id: string;
  name?: string;
  className?: string | null;
  isActive?: boolean;
}) {
  ensureAuth();
  const sb = createSupabaseServiceClient();

  const patch: Record<string, unknown> = {};
  if (typeof args.name === "string" && args.name.trim()) patch.name = args.name.trim();
  if (args.className !== undefined)
    patch.class_name = args.className?.trim() ? args.className.trim() : null;
  if (typeof args.isActive === "boolean") patch.is_active = args.isActive;

  if (Object.keys(patch).length === 0) {
    return { ok: false as const, message: "변경할 내용이 없어요." };
  }

  const { error } = await sb.from("garden_students").update(patch).eq("id", args.id);
  if (error) return { ok: false as const, message: error.message };

  revalidatePath("/admin/students");
  revalidatePath("/admin");
  revalidatePath("/");
  return { ok: true as const };
}

export async function deleteStudentAction(args: { id: string }) {
  ensureAuth();
  const sb = createSupabaseServiceClient();
  const { error } = await sb.from("garden_students").delete().eq("id", args.id);
  if (error) return { ok: false as const, message: error.message };

  revalidatePath("/admin/students");
  revalidatePath("/admin");
  revalidatePath("/");
  return { ok: true as const };
}

/* ============== 학기 리셋 (지점 스코프) ============== */

export async function resetSemesterAction(args: { confirmText: string }) {
  ensureAuth();
  if (args.confirmText !== "학기 리셋") {
    return { ok: false as const, message: "확인 문구가 일치하지 않아요." };
  }
  const branchCheck = ensureBranch();
  if (!branchCheck.ok) {
    return { ok: false as const, message: branchCheck.message };
  }
  const sb = createSupabaseServiceClient();
  const { data, error } = await sb.rpc("garden_reset_semester", {
    p_branch_id: branchCheck.branchId,
  });
  if (error) {
    if (error.message?.includes("branch_id_required")) {
      return { ok: false as const, message: "지점 ID 누락 (서버 설정 오류)" };
    }
    return { ok: false as const, message: `리셋 실패: ${error.message}` };
  }
  const result = data as {
    ok: true;
    student_count: number;
    pending_deleted: number;
  };
  revalidatePath("/admin");
  revalidatePath("/admin/reset");
  revalidatePath("/admin/students");
  revalidatePath("/");
  return {
    ok: true as const,
    studentCount: result.student_count,
    pendingDeleted: result.pending_deleted,
  };
}
