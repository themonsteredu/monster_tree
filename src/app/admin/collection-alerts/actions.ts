"use server";

// 관리자 알림함 Server Actions — 읽음 처리.

import { revalidatePath } from "next/cache";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { isAdminAuthenticated } from "../auth";

function ensureAuth() {
  if (!isAdminAuthenticated()) {
    throw new Error("AUTH_REQUIRED: 비밀번호가 필요합니다.");
  }
}

export async function markAlertReadAction(input: {
  id: string;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  ensureAuth();
  const sb = createSupabaseServiceClient();
  const { error } = await sb
    .from("garden_admin_alerts")
    .update({ status: "read", read_at: new Date().toISOString() })
    .eq("id", input.id);
  if (error) return { ok: false, message: `읽음 처리 실패: ${error.message}` };
  revalidatePath("/admin/collection-alerts");
  return { ok: true };
}

export async function markAllAlertsReadAction(input: {
  branchId: string;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  ensureAuth();
  const sb = createSupabaseServiceClient();
  const { error } = await sb
    .from("garden_admin_alerts")
    .update({ status: "read", read_at: new Date().toISOString() })
    .eq("branch_id", input.branchId)
    .eq("status", "unread");
  if (error) return { ok: false, message: `읽음 처리 실패: ${error.message}` };
  revalidatePath("/admin/collection-alerts");
  return { ok: true };
}
