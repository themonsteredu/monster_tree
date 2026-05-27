"use server";

// /shop 학생 서버 액션.
// - submitShopRequestAction: 쇼핑몰 링크 + 옵션 + 예상가격(원)으로 신청 (잔액으로 막지 않음).
// - cancelMyShopRequestAction: 본인 신청을 '신청됨' 상태에서만 취소 (차감 전이라 환불 불필요).
// 차감/승인/배송 등 관리자 동작은 src/app/admin/shop/actions.ts 참고.

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { STUDENT_COOKIE_NAME, verifyStudentJwt } from "@/lib/student-jwt";
import { isAdminAuthenticated } from "../admin/auth";
import { wonToPoints } from "@/lib/types";

type StudentCtx = { studentId: string; branchId: string; name: string };

async function getStudentCtx(): Promise<StudentCtx | null> {
  const token = cookies().get(STUDENT_COOKIE_NAME)?.value;
  const payload = await verifyStudentJwt(token);
  if (!payload) return null;
  const sb = createSupabaseServiceClient();
  const { data: row } = await sb
    .from("garden_students")
    .select("id")
    .eq("branch_id", payload.branchId)
    .eq("external_student_id", payload.studentLocalId)
    .maybeSingle();
  if (!row?.id) return null;
  return { studentId: row.id as string, branchId: payload.branchId, name: payload.name };
}

const URL_MAX = 1000;
const TEXT_MAX = 300;
const MEMO_MAX = 500;

export async function submitShopRequestAction(args: {
  productUrl: string;
  options?: string;
  memo?: string;
  estimatedPriceWon: number;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  // 관리자 테스트 모드에서는 저장하지 않음 (미리보기는 클라이언트 로컬 처리).
  if (isAdminAuthenticated()) {
    return { ok: false, message: "테스트 모드에서는 실제 신청이 저장되지 않아요." };
  }

  const ctx = await getStudentCtx();
  if (!ctx) return { ok: false, message: "로그인이 필요해요." };

  const url = (args.productUrl ?? "").trim();
  if (!url) return { ok: false, message: "사고 싶은 물건의 링크를 넣어주세요." };
  if (url.length > URL_MAX) return { ok: false, message: "링크가 너무 길어요." };
  if (!/^https?:\/\//i.test(url)) {
    return { ok: false, message: "링크는 http:// 또는 https:// 로 시작해야 해요." };
  }

  const won = Math.trunc(Number(args.estimatedPriceWon));
  if (!Number.isFinite(won) || won <= 0) {
    return { ok: false, message: "예상 가격(원)을 정확히 입력해주세요." };
  }
  if (won > 100_000_000) return { ok: false, message: "금액이 너무 커요." };

  const options = (args.options ?? "").trim().slice(0, TEXT_MAX) || null;
  const memo = (args.memo ?? "").trim().slice(0, MEMO_MAX) || null;
  const pointCost = wonToPoints(won);

  const sb = createSupabaseServiceClient();
  const { error } = await sb.from("shop_requests").insert({
    student_id: ctx.studentId,
    branch_id: ctx.branchId,
    student_name_snapshot: ctx.name,
    product_url: url,
    options,
    memo,
    estimated_price_won: won,
    point_cost: pointCost,
    status: "requested",
  });
  if (error) return { ok: false, message: `신청 저장 실패: ${error.message}` };

  revalidatePath("/shop");
  return { ok: true };
}

export async function cancelMyShopRequestAction(args: {
  id: string;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const ctx = await getStudentCtx();
  if (!ctx) return { ok: false, message: "로그인이 필요해요." };
  if (!args.id) return { ok: false, message: "잘못된 요청이에요." };

  const sb = createSupabaseServiceClient();
  // 본인 + '신청됨' 상태만 취소 가능 (차감 전이라 환불 불필요).
  const { data, error } = await sb
    .from("shop_requests")
    .update({ status: "canceled", updated_at: new Date().toISOString() })
    .eq("id", args.id)
    .eq("student_id", ctx.studentId)
    .eq("status", "requested")
    .select("id");
  if (error) return { ok: false, message: `취소 실패: ${error.message}` };
  if (!data || data.length === 0) {
    return { ok: false, message: "이미 원장님이 처리 중이라 직접 취소할 수 없어요." };
  }

  revalidatePath("/shop");
  return { ok: true };
}
