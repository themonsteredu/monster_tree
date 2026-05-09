"use server";

// /tree/me 학생 전용 server actions.
// 학생 JWT 쿠키(monster_student) 로 본인 인증 후, garden_claim_pending RPC 로
// pending 행 소비 + 로그 기록 + 학생 누적/단계 갱신을 한 트랜잭션에 처리한다.

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { STUDENT_COOKIE_NAME, verifyStudentJwt } from "@/lib/student-jwt";
import { createSupabaseServiceClient } from "@/lib/supabase/server";

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

  const { data, error } = await sb.rpc("garden_claim_pending", {
    p_pending_id: args.pendingId,
    p_branch_id: payload.branchId,
    p_external_id: payload.studentLocalId,
  });
  if (error) {
    if (error.message?.includes("student_not_found")) {
      return { ok: false as const, message: "본인 행을 찾지 못했어요." };
    }
    return { ok: false as const, message: `받기 실패: ${error.message}` };
  }

  const result = data as {
    ok: true;
    already_claimed?: boolean;
    new_total?: number;
    new_stage?: number;
    points?: number;
  };

  revalidatePath("/me");
  revalidatePath("/admin");
  revalidatePath("/");

  if (result.already_claimed) {
    return { ok: true as const, alreadyClaimed: true };
  }
  return {
    ok: true as const,
    newTotal: result.new_total ?? 0,
    newStage: result.new_stage ?? 1,
  };
}
