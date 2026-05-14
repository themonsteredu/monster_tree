// /admin/reports - 주간 / 월간 리포트
// admin 쿠키에 저장된 지점의 logs / harvests 만 대상.

import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerAnonClient } from "@/lib/supabase/server";
import { getMonsterSiteUrl } from "@/lib/monster-site";
import { getAdminBranchId } from "@/lib/branch";
import type { GardenStudent } from "@/lib/types";
import { isAdminAuthenticated } from "../auth";
import { LoginForm } from "../LoginForm";
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
  const monsterUrl = getMonsterSiteUrl();

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
      <header className="sticky top-0 z-30 bg-white border-b border-gray-100">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Link
              href="/admin"
              className="shrink-0 text-sm text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-lg px-3 py-1.5 transition"
            >
              ← 관리
            </Link>
            <h1 className="text-lg font-semibold text-gray-900 truncate">리포트</h1>
          </div>
          <a
            href={monsterUrl}
            className="shrink-0 text-sm text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-lg px-3 py-1.5 transition"
            aria-label="monster-site 지점 관리자 페이지로"
          >
            ← 본사
          </a>
        </div>
      </header>

      <ReportsClient
        students={(students ?? []) as GardenStudent[]}
        monthLogs={(monthLogs ?? []) as ReportLog[]}
        monthHarvests={(monthHarvests ?? []) as ReportHarvest[]}
        monthStartIso={monthStartIso}
      />
    </main>
  );
}
