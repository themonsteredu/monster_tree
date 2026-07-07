"use server";

// /admin/shop — 상점 신청 관리 (원장 전용). 모든 쓰기는 service_role.
// - approveShopRequestAction: 최종 포인트 확정 + 원자적 차감(잔액 부족이면 거부) → '구매완료'
// - advanceShopStatusAction:  구매완료→배송중→전달완료
// - cancelShopRequestAction:  취소. 차감된 신청이면 garden_undo_log 로 포인트 복구.

import { revalidatePath } from "next/cache";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { isAdminAuthenticated } from "../auth";
import { getAdminBranchId } from "@/lib/branch";
import { loadShopSettings } from "@/lib/shop-settings";
import { sendAnnouncementPushes } from "@/lib/push";
import {
  kstShortDateTime,
  shopOpenState,
  type ShopOpenMode,
  type ShopOpenState,
  type ShopRequest,
  type ShopRequestStatus,
} from "@/lib/types";

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

/* ============== 오픈 기간 설정 + 오픈 공지 ============== */

// datetime-local 값("2026-07-10T18:00", KST 입력)을 timestamptz ISO 로 변환.
function kstLocalToIso(v: string | null | undefined): string | null {
  const s = (v ?? "").trim();
  if (!s) return null;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s)) return null;
  return new Date(`${s}:00+09:00`).toISOString();
}

/** 지점의 상점 오픈 설정 저장 (upsert). */
export async function saveShopSettingsAction(args: {
  mode: ShopOpenMode;
  openFrom?: string | null;  // datetime-local (KST)
  openUntil?: string | null;
}): Promise<{ ok: true; openInfo: ShopOpenState } | { ok: false; message: string }> {
  ensureAuth();
  const branchId = getAdminBranchId();
  if (!branchId) {
    return { ok: false, message: "지점이 선택되지 않았어요. /admin/select-branch 에서 골라주세요." };
  }
  if (!["always", "window", "closed"].includes(args.mode)) {
    return { ok: false, message: "잘못된 모드예요." };
  }

  const openFrom = args.mode === "window" ? kstLocalToIso(args.openFrom) : null;
  const openUntil = args.mode === "window" ? kstLocalToIso(args.openUntil) : null;
  if (args.mode === "window") {
    if (!openFrom && !openUntil) {
      return { ok: false, message: "기간 모드는 시작 또는 종료 시각을 하나 이상 입력해주세요." };
    }
    if (openFrom && openUntil && openFrom >= openUntil) {
      return { ok: false, message: "종료 시각이 시작 시각보다 빨라요." };
    }
  }

  const sb = createSupabaseServiceClient();
  const { error } = await sb.from("shop_settings").upsert(
    {
      branch_id: branchId,
      mode: args.mode,
      open_from: openFrom,
      open_until: openUntil,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "branch_id" },
  );
  if (error) return { ok: false, message: `저장 실패: ${error.message}` };

  revalidateAll();
  return {
    ok: true,
    openInfo: shopOpenState({ mode: args.mode, open_from: openFrom, open_until: openUntil }),
  };
}

/** 오픈 공지 푸시 — 지점의 알림 켠 학생 전원에게 발송. */
export async function sendShopOpenPushAction(args: {
  body?: string;
}): Promise<{ ok: boolean; message: string }> {
  ensureAuth();
  const branchId = getAdminBranchId();
  if (!branchId) {
    return { ok: false, message: "지점이 선택되지 않았어요. /admin/select-branch 에서 골라주세요." };
  }

  // 문구: 직접 입력이 있으면 그대로, 없으면 현재 설정 기간으로 자동 조합.
  let body = (args.body ?? "").trim().slice(0, 200);
  if (!body) {
    const settings = await loadShopSettings(branchId);
    const until = settings?.mode === "window" ? settings.open_until : null;
    body = until
      ? `상점이 열렸어요! ${kstShortDateTime(until)}까지 사고 싶은 물건을 신청할 수 있어요 🍎`
      : "상점이 열렸어요! 모은 포인트로 사고 싶은 물건을 신청해보세요 🍎";
  }

  const result = await sendAnnouncementPushes({
    branchId,
    title: "🏪 몬스터마을 상점",
    body,
    url: "/tree/shop",
  });
  return { ok: result.ok, message: result.message };
}
