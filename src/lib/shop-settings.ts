// 상점 오픈 기간 설정 조회 (서버 전용).
// 판정 로직(shopOpenState)은 클라이언트와 공유하는 types.ts 에 있고,
// 여기는 service-role 로 shop_settings 행을 읽는 부분만 담당한다.

import { createSupabaseServiceClient } from "@/lib/supabase/server";
import {
  shopOpenState,
  type ShopOpenState,
  type ShopSettings,
} from "@/lib/types";

export async function loadShopSettings(
  branchId: string | null,
): Promise<ShopSettings | null> {
  if (!branchId) return null;
  const sb = createSupabaseServiceClient();
  const { data } = await sb
    .from("shop_settings")
    .select("branch_id, mode, open_from, open_until, updated_at")
    .eq("branch_id", branchId)
    .maybeSingle();
  return (data as ShopSettings | null) ?? null;
}

// 지점의 현재 열림 상태 — 설정 행이 없으면 항상 열림(하위 호환).
export async function loadShopOpenState(
  branchId: string | null,
): Promise<ShopOpenState> {
  return shopOpenState(await loadShopSettings(branchId));
}
