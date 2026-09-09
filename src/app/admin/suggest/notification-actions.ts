"use server";

import { cookies } from "next/headers";
import { isAdminAuthenticated } from "../auth";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { setAdminBranchCookie } from "@/lib/branch";
import {
  AdminPushError, adminNotificationState, enableAdminNotifications,
  disableAdminNotifications, testAdminNotification,
} from "@/lib/admin-suggestion-push";

type Failure = { ok: false; message: string; code?: string };
const denied: Failure = { ok: false, message: "관리자 로그인이 필요해요.", code: "AUTH_REQUIRED" };
function failure(error: unknown): Failure {
  return error instanceof AdminPushError ? { ok: false, message: error.message, code: error.code }
    : { ok: false, message: "알림 설정을 확인하지 못했어요. 잠시 후 다시 시도해주세요." };
}

export async function getAdminNotificationStateAction(input: { endpoint?: string } = {}): Promise<
  { ok: true; publicKey: string; subscribed: boolean } | Failure
> {
  if (!(await isAdminAuthenticated())) return denied;
  try { return { ok: true, ...await adminNotificationState(input?.endpoint) }; }
  catch (error) { return failure(error); }
}

export async function enableAdminSuggestionNotificationsAction(input: { endpoint: string; keys: { p256dh: string; auth: string } }): Promise<
  { ok: true; message: string } | Failure
> {
  if (!(await isAdminAuthenticated())) return denied;
  try { await enableAdminNotifications(input); return { ok: true, message: "이 기기에서 모든 지점의 새 건의 알림을 받아요." }; }
  catch (error) { return failure(error); }
}

export async function disableAdminSuggestionNotificationsAction(input: { endpoint: string }): Promise<{ ok: true; message: string } | Failure> {
  if (!(await isAdminAuthenticated())) return denied;
  try { await disableAdminNotifications(input?.endpoint); return { ok: true, message: "이 기기의 건의 알림을 껐어요." }; }
  catch (error) { return failure(error); }
}

export async function sendAdminSuggestionTestAction(input: { endpoint: string }): Promise<{ ok: true; message: string } | Failure> {
  if (!(await isAdminAuthenticated())) return denied;
  try { await testAdminNotification(input?.endpoint); return { ok: true, message: "테스트 알림을 보냈어요. 이 기기에 도착했는지 확인해주세요." }; }
  catch (error) { return failure(error); }
}

/** The administrator may have changed branches since receiving this notification. */
export async function openSuggestionNotificationAction(id: string): Promise<{ ok: true; url: string } | Failure> {
  if (!(await isAdminAuthenticated())) return denied;
  if (typeof id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    return { ok: false, message: "올바르지 않은 건의 알림이에요." };
  }
  const sb = createSupabaseServiceClient();
  const { data, error } = await sb.from("garden_suggestions").select("id, branch_id").eq("id", id).maybeSingle();
  if (error || !data) return { ok: false, message: "삭제되었거나 확인할 수 없는 건의예요." };
  await setAdminBranchCookie(data.branch_id);
  (await cookies()).delete("garden_admin_branch_name");
  return { ok: true, url: `/tree/admin/suggest?branch=${encodeURIComponent(data.branch_id)}&highlight=${encodeURIComponent(id)}#suggestion-${id}` };
}
