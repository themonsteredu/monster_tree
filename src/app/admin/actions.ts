"use server";

// Admin 화면에서 호출하는 Server Actions
// - 포인트 적립/차감 (대기열 등록)
// - 학생 추가/수정/삭제
// - 수확 (RPC 로 atomic 처리)
// 모든 액션은 isAdminAuthenticated() 로 보호됩니다.

import { revalidatePath } from "next/cache";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
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

/* ============== 포인트 적립 (대기열 등록) ============== */

/**
 * 포인트 적립/차감 액션 — 즉시 적용하지 않고 garden_pending_points 에 등록만 한다.
 *
 * 학생이 /tree/me 에서 "받기" 버튼을 누르면 그제서야:
 *   1) garden_point_logs 에 로그가 추가되고
 *   2) garden_students.total_points / current_stage 가 갱신된다 (claimPointAction)
 *
 * 이 흐름의 의도: 학생이 화분이 자라는 순간을 직접 체험하게 하기 위함.
 * 결과적으로 TV 화면도 학생이 받기 누른 시점에 갱신된다.
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

  // 학생 존재 확인
  const { data: student, error: e1 } = await sb
    .from("garden_students")
    .select("id")
    .eq("id", studentId)
    .single();
  if (e1 || !student) {
    return { ok: false as const, message: "학생을 찾을 수 없어요." };
  }

  // pending 등록 (즉시 적용하지 않음)
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

/* ============== 수확 ============== */

// 8단계(380pt 이상) 학생을 atomic 하게 수확 처리합니다.
// 실제 트랜잭션은 garden_harvest_student RPC 가 단일 단위로 수행.
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
