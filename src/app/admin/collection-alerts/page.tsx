// /admin/collection-alerts — 관리자 알림함.
// 학생이 도감 7종을 모으면 여기에 알림이 쌓인다 (garden_admin_alerts).
// branch 는 쿠키 우선, 없으면 ?branch= 쿼리 fallback (건의함과 동일 패턴).

import Link from "next/link";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { getAdminBranchId } from "@/lib/branch";
import { isAdminAuthenticated } from "../auth";
import { LoginForm } from "../LoginForm";
import { AdminHeader } from "../AdminHeader";
import { AlertsClient, type AdminAlertRow } from "./AlertsClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminCollectionAlertsPage({
  searchParams,
}: {
  searchParams: { key?: string; branch?: string };
}) {
  if (!isAdminAuthenticated(searchParams.key)) {
    return <LoginForm initialKey={searchParams.key ?? ""} />;
  }

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    return (
      <main className="p-6 text-center text-gray-400 bg-gray-50 min-h-screen">
        Supabase 환경변수가 설정되지 않았어요.
      </main>
    );
  }

  const branchId = getAdminBranchId() ?? searchParams.branch?.trim() ?? null;

  if (!branchId) {
    return (
      <main className="min-h-screen bg-gray-50 px-4 py-10">
        <div className="max-w-md mx-auto bg-white rounded-2xl border border-gray-100 shadow-sm p-6 text-center">
          <h1 className="text-lg font-semibold text-gray-900 mb-2">
            지점이 선택되지 않았어요
          </h1>
          <p className="text-sm text-gray-500 mb-5">
            알림함은 지점별로 분리되어 있어요. 먼저 지점을 선택해주세요.
          </p>
          <Link
            href="/admin/select-branch"
            className="inline-block rounded-xl bg-orange-500 px-4 py-2 text-sm font-semibold text-white"
          >
            지점 선택하기
          </Link>
        </div>
      </main>
    );
  }

  // garden_admin_alerts 는 정책 없는 RLS(서버 전용) — service client 로 읽는다.
  const sb = createSupabaseServiceClient();
  const { data: alertsRaw } = await sb
    .from("garden_admin_alerts")
    .select("id, branch_id, type, threshold, payload, status, created_at, read_at")
    .eq("branch_id", branchId)
    .order("created_at", { ascending: false })
    .limit(200);
  const alerts = (alertsRaw ?? []) as AdminAlertRow[];

  return (
    <main className="min-h-screen bg-gray-50">
      <AdminHeader current="collection-alerts" title="도감 알림" />
      <AlertsClient alerts={alerts} branchId={branchId} />
    </main>
  );
}
