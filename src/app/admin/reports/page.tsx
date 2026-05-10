// /admin/reports - 주간 / 월간 리포트
// 해당 지점 (BRANCH_ID env) 의 logs / harvests 만 대상.

import Link from "next/link";
import { createSupabaseServerAnonClient } from "@/lib/supabase/server";
import { getMonsterSiteUrl } from "@/lib/monster-site";
import { getBranchId } from "@/lib/branch";
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

  const branchId = getBranchId();
  const monsterUrl = getMonsterSiteUrl();

  if (!branchId) {
    return (
      <main className="p-6">
        <div className="max-w-lg mx-auto bg-[#fef2f0] border-[2.5px] border-[var(--apple-deep)] rounded-2xl p-6">
          <div className="text-3xl mb-2">⚠️</div>
          <h1 className="text-lg font-extrabold text-[var(--apple-deep)] mb-2">
            BRANCH_ID 환경변수가 설정되지 않았어요
          </h1>
          <p className="text-sm text-[var(--ink)]">
            Vercel 프로젝트 설정에서 <code className="px-1.5 py-0.5 bg-white rounded">BRANCH_ID</code> 추가 필요.
          </p>
        </div>
      </main>
    );
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
    <main className="min-h-screen pb-20">
      <header className="sticky top-0 z-30 bg-[var(--bg-warm-start)]/90 backdrop-blur border-b border-[var(--ink)]/10">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Link
              href="/admin"
              className="text-sm font-bold text-[var(--ink-soft)] underline shrink-0"
            >
              ← 관리
            </Link>
            <h1 className="text-xl font-bold text-[var(--ink)] truncate">리포트</h1>
          </div>
          <a
            href={monsterUrl}
            className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full bg-white border-[1.5px] border-[var(--ink)] text-[var(--ink)] text-xs font-extrabold shadow-card"
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
