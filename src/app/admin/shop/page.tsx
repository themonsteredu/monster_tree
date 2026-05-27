// /admin/shop — 상점 신청 관리 (원장 전용).
// 지점의 모든 신청을 SSR 로 가져와 학생 잔액과 함께 표시. 승인/상태변경/취소는 ShopAdminClient.

import Link from "next/link";
import { isAdminAuthenticated } from "../auth";
import { LoginForm } from "../LoginForm";
import { getAdminBranchId, getAdminBranchName } from "@/lib/branch";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import type { ShopRequest } from "@/lib/types";
import { ShopAdminClient, type ShopRequestRow } from "./ShopAdminClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ShopAdminPage({
  searchParams,
}: {
  searchParams: { key?: string; branch?: string };
}) {
  if (!isAdminAuthenticated(searchParams.key)) {
    return <LoginForm initialKey={searchParams.key ?? ""} />;
  }

  const branchId = getAdminBranchId() ?? searchParams.branch?.trim() ?? null;
  const branchName = getAdminBranchName();

  const sb = createSupabaseServiceClient();
  let query = sb
    .from("shop_requests")
    .select(
      "id, student_id, branch_id, student_name_snapshot, product_url, options, memo, estimated_price_won, point_cost, status, point_log_id, admin_note, requested_at, approved_at, updated_at, garden_students(total_points)",
    )
    .order("requested_at", { ascending: false })
    .limit(300);
  if (branchId) query = query.eq("branch_id", branchId);

  const { data } = await query;

  const rows: ShopRequestRow[] = ((data ?? []) as Array<
    ShopRequest & { garden_students: { total_points: number } | null }
  >).map((r) => ({
    ...r,
    student_balance: r.garden_students?.total_points ?? 0,
  }));

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="sticky top-0 z-40 bg-white border-b border-gray-100">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <h1 className="text-lg font-bold text-gray-900">
            🏪 상점 신청 관리
            {branchName && (
              <span className="text-sm text-gray-400 font-medium ml-2">
                · {branchName}
              </span>
            )}
          </h1>
          <Link
            href="/admin/garden"
            className="shrink-0 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg px-3 py-1.5 transition"
          >
            ← 사과정원
          </Link>
        </div>
      </div>

      <ShopAdminClient initialRows={rows} />
    </main>
  );
}
