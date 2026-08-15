// /admin/reports - 주간 / 월간 리포트
// admin 쿠키에 저장된 지점의 logs / harvests 만 대상.

import { redirect } from "next/navigation";
import { createSupabaseServerAnonClient } from "@/lib/supabase/server";
import { getAdminBranchId } from "@/lib/branch";
import type { GardenStudent } from "@/lib/types";
import { isAdminAuthenticated } from "../auth";
import { LoginForm } from "../LoginForm";
import { AdminHeader } from "../AdminHeader";
import { ReportsClient } from "./ReportsClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export type ReportLog = {
  student_id: string;
  points: number;
  reason: string | null;
  logged_at: string;
};

export type ReportHarvest = {
  student_id: string;
  apples_count: number;
  harvested_at: string;
};

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: { key?: string };
}) {
  if (!isAdminAuthenticated(searchParams.key)) {
    return <LoginForm initialKey={searchParams.key ?? ""} />;
  }

  const branchId = getAdminBranchId();

  if (!branchId) {
    redirect("/admin/select-branch");
  }

  const sb = createSupabaseServerAnonClient();

  // 이번 달 첫 날
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const monthStartIso = monthStart.toISOString();

  // 1단계: 지점 학생 먼저
  const { data: students } = await sb
    .from("garden_students")
    .select("*")
    .eq("branch_id", branchId)
    .eq("is_active", true)
    .order("class_name", { ascending: true, nullsFirst: false })
    .order("name", { ascending: true });

  const branchStudentIds = ((students ?? []) as GardenStudent[]).map((s) => s.id);

  // 2단계: 지점 학생의 logs / harvests
  const [{ data: monthLogs }, { data: monthHarvests }] =
    branchStudentIds.length > 0
      ? await Promise.all([
          sb
            .from("garden_point_logs")
            .select("student_id, points, reason, logged_at")
            .in("student_id", branchStudentIds)
            .gte("logged_at", monthStartIso)
            .order("logged_at", { ascending: false })
            .limit(5000),
          sb
            .from("garden_harvests")
            .select("student_id, apples_count, harvested_at")
            .in("student_id", branchStudentIds)
            .gte("harvested_at", monthStartIso)
            .order("harvested_at", { ascending: false })
            .limit(2000),
        ])
      : [{ data: [] }, { data: [] }];

  return (
    <main className="min-h-screen pb-20 bg-gray-50">
      <AdminHeader current="reports" title="리포트" />

      <ReportsClient
        students={(students ?? []) as GardenStudent[]}
        monthLogs={(monthLogs ?? []) as ReportLog[]}
        monthHarvests={(monthHarvests ?? []) as ReportHarvest[]}
        monthStartIso={monthStartIso}
      />
    </main>
  );
}
