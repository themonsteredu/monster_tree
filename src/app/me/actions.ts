"use server";

// /tree/me 학생 전용 server actions.
// 학생 JWT 쿠키(monster_student) 로 본인 인증 후, garden_claim_pending RPC 로
// pending 행 소비 + 로그 기록 + 학생 누적/단계 갱신을 한 트랜잭션에 처리한다.

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { STUDENT_COOKIE_NAME, verifyStudentJwt } from "@/lib/student-jwt";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import type { AvatarConfig, BackgroundConfig } from "@/lib/types";

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

// 아바타 config 의 형태/문자열 길이만 점검. 알 수 없는 키 값은 클라이언트에서 fallback 으로 처리.
function validateAvatar(raw: unknown): AvatarConfig | null {
  if (!raw || typeof raw !== "object") return null;
  const a = raw as Record<string, unknown>;
  const kind = a.kind;
  const isShortStr = (v: unknown) => typeof v === "string" && v.length > 0 && v.length <= 40;
  if (kind === "human") {
    if (a.body !== "boy" && a.body !== "girl") return null;
    for (const k of ["skin", "hair", "face", "top", "bottom", "shoes"]) {
      if (!isShortStr(a[k])) return null;
    }
    return {
      kind: "human",
      body: a.body as "boy" | "girl",
      skin: a.skin as string,
      hair: a.hair as string,
      face: a.face as string,
      top: a.top as string,
      bottom: a.bottom as string,
      shoes: a.shoes as string,
    };
  }
  if (kind === "animal" || kind === "fantasy") {
    if (!isShortStr(a.variant)) return null;
    return { kind, variant: a.variant as string };
  }
  return null;
}

export async function updateAvatarAction(args: { avatar: unknown }) {
  const token = cookies().get(STUDENT_COOKIE_NAME)?.value;
  const payload = await verifyStudentJwt(token);
  if (!payload) {
    return { ok: false as const, message: "로그인이 만료됐어요. 다시 로그인해주세요." };
  }

  const avatar = validateAvatar(args.avatar);
  if (!avatar) {
    return { ok: false as const, message: "아바타 데이터가 올바르지 않아요." };
  }

  const sb = createSupabaseServiceClient();
  const { error } = await sb
    .from("garden_students")
    .update({ avatar })
    .eq("branch_id", payload.branchId)
    .eq("external_student_id", payload.studentLocalId);
  if (error) {
    return { ok: false as const, message: `저장 실패: ${error.message}` };
  }

  revalidatePath("/me");
  revalidatePath("/");
  revalidatePath("/admin");
  return { ok: true as const, avatar };
}

function validateBackground(raw: unknown): BackgroundConfig | null {
  if (!raw || typeof raw !== "object") return null;
  const b = raw as Record<string, unknown>;
  const isShortStr = (v: unknown) => typeof v === "string" && v.length > 0 && v.length <= 40;
  if (b.kind === "solid") {
    if (!isShortStr(b.color)) return null;
    return { kind: "solid", color: b.color as string };
  }
  if (b.kind === "pattern") {
    if (!isShortStr(b.pattern) || !isShortStr(b.color)) return null;
    return { kind: "pattern", pattern: b.pattern as string, color: b.color as string };
  }
  if (b.kind === "scene") {
    if (!isShortStr(b.scene)) return null;
    return { kind: "scene", scene: b.scene as string };
  }
  return null;
}

export async function updateBackgroundAction(args: { background: unknown }) {
  const token = cookies().get(STUDENT_COOKIE_NAME)?.value;
  const payload = await verifyStudentJwt(token);
  if (!payload) {
    return { ok: false as const, message: "로그인이 만료됐어요. 다시 로그인해주세요." };
  }

  const background = validateBackground(args.background);
  if (!background) {
    return { ok: false as const, message: "배경 데이터가 올바르지 않아요." };
  }

  const sb = createSupabaseServiceClient();
  const { error } = await sb
    .from("garden_students")
    .update({ background })
    .eq("branch_id", payload.branchId)
    .eq("external_student_id", payload.studentLocalId);
  if (error) {
    return { ok: false as const, message: `저장 실패: ${error.message}` };
  }

  revalidatePath("/me");
  revalidatePath("/");
  revalidatePath("/admin");
  return { ok: true as const, background };
}
