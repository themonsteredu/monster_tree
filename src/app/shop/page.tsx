// /tree/shop — 학생용 상점 (몬스터마을 → 상점).
// 모은 사과포인트로 사고 싶은 물건을 신청하면 원장님이 승인 시 차감하고 대신 결제.
//
// 인증:
//  - student JWT → 학생 모드 (잔액 + 내 신청 내역)
//  - admin 쿠키 → 🛠 테스트 모드 (신청 저장 안 됨)
//  - 둘 다 없으면 monster-site 로그인으로 리다이렉트

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { STUDENT_COOKIE_NAME, verifyStudentJwt } from "@/lib/student-jwt";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { isAdminAuthenticated } from "../admin/auth";
import { getAdminBranchId } from "@/lib/branch";
import { loadShopOpenState } from "@/lib/shop-settings";
import type { ShopRequest } from "@/lib/types";
import { ShopClient } from "./ShopClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ShopPage() {
  const token = cookies().get(STUDENT_COOKIE_NAME)?.value;
  const payload = await verifyStudentJwt(token);
  const adminAuthed = isAdminAuthenticated();

  if (!payload && !adminAuthed) {
    redirect("https://www.themonster.kr/login");
  }

  let studentName: string | null = null;
  let balance = 0;
  let requests: ShopRequest[] = [];

  if (payload) {
    studentName = payload.name;
    const sb = createSupabaseServiceClient();
    const { data: row } = await sb
      .from("garden_students")
      .select("id, total_points")
      .eq("branch_id", payload.branchId)
      .eq("external_student_id", payload.studentLocalId)
      .maybeSingle();
    const studentId = row?.id as string | undefined;
    balance = (row?.total_points as number | undefined) ?? 0;

    if (studentId) {
      const { data } = await sb
        .from("shop_requests")
        .select(
          "id, student_id, branch_id, student_name_snapshot, product_url, options, memo, estimated_price_won, point_cost, status, point_log_id, admin_note, requested_at, approved_at, updated_at",
        )
        .eq("student_id", studentId)
        .order("requested_at", { ascending: false })
        .limit(100);
      requests = (data as ShopRequest[] | null) ?? [];
    }
  }

  // 오픈 기간 판정 — 학생은 본인 지점, 관리자 테스트 모드는 선택된 관리 지점 기준.
  const openInfo = await loadShopOpenState(
    payload?.branchId ?? getAdminBranchId() ?? null,
  );

  return (
    <ShopClient
      studentName={studentName}
      adminMode={!payload && adminAuthed}
      balance={balance}
      initialRequests={requests}
      openInfo={openInfo}
    />
  );
}
