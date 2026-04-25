"use server";

// Admin 화면에서 호출하는 Server Actions
// - 포인트 적립/차감
// - 학생 추가/수정/삭제
// 모든 액션은 isAdminAuthenticated() 로 보호됩니다.

import { revalidatePath } from "next/cache";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { calculateStage } from "@/lib/garden";
import { isAdminAuthenticated, setAdminCookie, clearAdminCookie, isAdminKey } from "./auth";

function ensureAuth() {
  if (!isAdminAuthenticated()) {
    throw new Error("AUTH_REQUIRED: 비밀번호가 필요합니다.");
  }
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
}

/* ============== 포인트 적립 ============== */

/**
 * 포인트 적립/차감 액션.
 * 1) garden_point_logs 에 기록
 * 2) garden_students 의 total_points / current_stage 갱신
 *
 * 단계 자동 계산은 클라이언트에서 미리 보낸 값을 신뢰하지 않고
 * 서버에서 다시 calculateStage() 로 계산합니다 (위·변조 방지).
 */
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

  // 1) 학생 현재 정보
  const { data: student, error: e1 } = await sb
    .from("garden_students")
    .select("id, total_points")
    .eq("id", studentId)
    .single();
  if (e1 || !student) {
    return { ok: false as const, message: "학생을 찾을 수 없어요." };
  }

  // 2) 새 누적 포인트 / 단계 계산
  const newTotal = Math.max(0, (student.total_points ?? 0) + Math.trunc(delta));
  const newStage = calculateStage(newTotal);

  // 3) 로그 추가
  const { error: e2 } = await sb.from("garden_point_logs").insert({
    student_id: studentId,
    points: Math.trunc(delta),
    reason: reason?.trim() ? reason.trim() : null,
  });
  if (e2) {
    return { ok: false as const, message: `포인트 기록 실패: ${e2.message}` };
  }

  // 4) 학생 캐시 업데이트
  const { error: e3 } = await sb
    .from("garden_students")
    .update({ total_points: newTotal, current_stage: newStage })
    .eq("id", studentId);
  if (e3) {
    return { ok: false as const, message: `학생 정보 갱신 실패: ${e3.message}` };
  }

  revalidatePath("/admin");
  revalidatePath("/");
  return { ok: true as const, newTotal, newStage };
}

/* ============== 학생 CRUD ============== */

export async function createStudentAction(args: {
  name: string;
  className?: string | null;
}) {
  ensureAuth();
  const name = args.name.trim();
  if (!name) return { ok: false as const, message: "이름을 입력해주세요." };

  const sb = createSupabaseServiceClient();
  const { error } = await sb.from("garden_students").insert({
    name,
    class_name: args.className?.trim() ? args.className.trim() : null,
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
