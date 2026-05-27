"use server";

// /admin/shop — 상점 신청 관리 (원장 전용). 모든 쓰기는 service_role.
// - approveShopRequestAction: 최종 포인트 확정 + 원자적 차감(잔액 부족이면 거부) → '구매완료'
// - advanceShopStatusAction:  구매완료→배송중→전달완료
// - cancelShopRequestAction:  취소. 차감된 신청이면 garden_undo_log 로 포인트 복구.

import { revalidatePath } from "next/cache";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { isAdminAuthenticated } from "../auth";
import type { ShopRequest, ShopRequestStatus } from "@/lib/types";

function ensureAuth() {
  if (!isAdminAuthenticated()) {
    throw new Error("AUTH_REQUIRED: 비밀번호가 필요합니다.");
  }
}

function revalidateAll() {
  revalidatePath("/admin/shop");
  revalidatePath("/shop");
  revalidatePath("/me");
  revalidatePath("/");
}

async function fetchRequest(
  sb: ReturnType<typeof createSupabaseServiceClient>,
  id: string,
): Promise<ShopRequest | null> {
  const { data } = await sb
    .from("shop_requests")
    .select(
      "id, student_id, branch_id, student_name_snapshot, product_url, options, memo, estimated_price_won, point_cost, status, point_log_id, admin_note, requested_at, approved_at, updated_at",
    )
    .eq("id", id)
    .maybeSingle();
  return (data as ShopRequest | null) ?? null;
}

/** 승인 — 최종 포인트(finalPointCost, 미지정 시 신청가) 차감 후 '구매완료'. */
export async function approveShopRequestAction(args: {
  id: string;
  finalPointCost?: number;
  adminNote?: string;
}): Promise<
  | { ok: true; newBalance: number }
  | { ok: false; message: string; insufficientBalance?: number }
> {
  ensureAuth();
  if (!args.id) return { ok: false, message: "id 가 없어요." };

  const sb = createSupabaseServiceClient();
  const req = await fetchRequest(sb, args.id);
  if (!req) return { ok: false, message: "신청을 찾을 수 없어요." };
  if (req.status !== "requested") {
    return { ok: false, message: "이미 처리된 신청이에요." };
  }

  const cost =
    typeof args.finalPointCost === "number" && Number.isFinite(args.finalPointCost)
      ? Math.trunc(args.finalPointCost)
      : req.point_cost;
  if (cost <= 0) return { ok: false, message: "차감 포인트가 올바르지 않아요." };

  const reason = `상점 구매: ${req.product_url.slice(0, 80)}`;
  const { data, error } = await sb.rpc("garden_shop_deduct", {
    p_student_id: req.student_id,
    p_points: cost,
    p_reason: reason,
  });
  if (error) return { ok: false, message: `차감 실패: ${error.message}` };

  const result = data as
    | { ok: true; log_id: string; new_total: number; new_stage: number }
    | { ok: false; insufficient: boolean; balance: number };

  if (!result.ok) {
    return {
      ok: false,
      message: `포인트가 부족해요. (현재 잔액 ${result.balance}P / 필요 ${cost}P)`,
      insufficientBalance: result.balance,
    };
  }

  const { error: upErr } = await sb
    .from("shop_requests")
    .update({
      status: "purchased",
      point_cost: cost,
      point_log_id: result.log_id,
      admin_note: args.adminNote?.trim() || req.admin_note || null,
      approved_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", args.id);
  if (upErr) {
    // 차감은 됐는데 상태 갱신 실패 — 차감 복구해서 정합성 유지.
    await sb.rpc("garden_undo_log", { p_log_id: result.log_id });
    return { ok: false, message: `상태 갱신 실패(차감 복구함): ${upErr.message}` };
  }

  revalidateAll();
  return { ok: true, newBalance: result.new_total };
}

/** 상태 진행 — 구매완료→배송중→전달완료. */
export async function advanceShopStatusAction(args: {
  id: string;
  status: ShopRequestStatus;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  ensureAuth();
  if (!args.id) return { ok: false, message: "id 가 없어요." };

  const allowed: Record<string, ShopRequestStatus> = {
    purchased: "shipping",
    shipping: "delivered",
  };

  const sb = createSupabaseServiceClient();
  const req = await fetchRequest(sb, args.id);
  if (!req) return { ok: false, message: "신청을 찾을 수 없어요." };
  if (allowed[req.status] !== args.status) {
    return { ok: false, message: "허용되지 않는 상태 변경이에요." };
  }

  const { error } = await sb
    .from("shop_requests")
    .update({ status: args.status, updated_at: new Date().toISOString() })
    .eq("id", args.id);
  if (error) return { ok: false, message: `상태 변경 실패: ${error.message}` };

  revalidateAll();
  return { ok: true };
}

/** 취소 — 차감됐던 신청이면 포인트 복구. 전달완료/취소는 불가. */
export async function cancelShopRequestAction(args: {
  id: string;
}): Promise<{ ok: true; refunded: boolean } | { ok: false; message: string }> {
  ensureAuth();
  if (!args.id) return { ok: false, message: "id 가 없어요." };

  const sb = createSupabaseServiceClient();
  const req = await fetchRequest(sb, args.id);
  if (!req) return { ok: false, message: "신청을 찾을 수 없어요." };
  if (req.status === "delivered" || req.status === "canceled") {
    return { ok: false, message: "전달완료/취소된 신청은 취소할 수 없어요." };
  }

  let refunded = false;
  // 차감이 일어난 상태(구매완료/배송중)면 포인트 복구.
  if (req.point_log_id && (req.status === "purchased" || req.status === "shipping")) {
    const { error: undoErr } = await sb.rpc("garden_undo_log", {
      p_log_id: req.point_log_id,
    });
    if (undoErr) return { ok: false, message: `포인트 복구 실패: ${undoErr.message}` };
    refunded = true;
  }

  const { error } = await sb
    .from("shop_requests")
    .update({
      status: "canceled",
      // 복구 완료 후에는 동일 로그를 다시 되돌리지 않도록 연결 해제.
      point_log_id: refunded ? null : req.point_log_id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", args.id);
  if (error) return { ok: false, message: `취소 실패: ${error.message}` };

  revalidateAll();
  return { ok: true, refunded };
}
