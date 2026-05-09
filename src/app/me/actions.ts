"use server";

// /tree/me 학생 전용 server actions.
// 학생 JWT 쿠키(monster_student) 로 본인 인증 후, garden_pending_points 의
// 본인 행을 garden_point_logs 로 옮기고 garden_students 를 갱신한다.

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { STUDENT_COOKIE_NAME, verifyStudentJwt } from "@/lib/student-jwt";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { calculateStage } from "@/lib/garden";

export async function claimPointAction(args: { pendingId: string }) {
  const token = cookies().get(STUDENT_COOKIE_NAME)?.value;
  const payload = await verifyStudentJwt(token);
  if (!payload) {
    return { ok: false as const, message: "로그인이 만료됐어요. 다시 로그인해주세요." };
  }
  if (!args.pendingId) {
    return { ok: false as const, message: "잘못된 요청이에요." };
  }

  const sb = createSupabaseServiceClient();

  // 1) JWT 로 본인 garden_students 행 찾기
  const { data: student, error: se } = await sb
    .from("garden_students")
    .select("id, total_points")
    .eq("branch_id", payload.branchId)
    .eq("external_student_id", payload.studentLocalId)
    .maybeSingle();
  if (se || !student) {
    return { ok: false as const, message: "본인 행을 찾지 못했어요." };
  }

  // 2) pending 행 조회 + 본인 소유 여부 확인 (다른 학생의 pending 을 받지 못하도록)
  const { data: pending, error: pe } = await sb
    .from("garden_pending_points")
    .select("id, student_id, points, reason")
    .eq("id", args.pendingId)
    .maybeSingle();
  if (pe || !pending) {
    return { ok: false as const, message: "이미 받았거나 사라진 포인트예요." };
  }
  if (pending.student_id !== student.id) {
    return { ok: false as const, message: "본인 포인트가 아니에요." };
  }

  // 3) 새 누적 / 단계 계산
  const newTotal = Math.max(0, (student.total_points ?? 0) + pending.points);
  const newStage = calculateStage(newTotal);

  // 4) 로그 기록
  const { error: le } = await sb.from("garden_point_logs").insert({
    student_id: student.id,
    points: pending.points,
    reason: pending.reason,
  });
  if (le) {
    return { ok: false as const, message: `로그 기록 실패: ${le.message}` };
  }

  // 5) 학생 캐시 업데이트
  const { error: ue } = await sb
    .from("garden_students")
    .update({ total_points: newTotal, current_stage: newStage })
    .eq("id", student.id);
  if (ue) {
    return { ok: false as const, message: `학생 정보 갱신 실패: ${ue.message}` };
  }

  // 6) pending 삭제 (Realtime 으로 다른 탭의 학생 페이지에도 반영)
  await sb.from("garden_pending_points").delete().eq("id", args.pendingId);

  revalidatePath("/me");
  revalidatePath("/admin");
  revalidatePath("/");
  return { ok: true as const, newTotal, newStage };
}
