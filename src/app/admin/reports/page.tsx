// /admin/reports - 주간 / 월간 리포트
// 이번 달 첫 날부터 지금까지의 logs / harvests 를 한 번에 가져와서
// 클라이언트에서 주/월 탭으로 집계 전환.

import Link from "next/link";
import { createSupabaseServerAnonClient } from "@/lib/supabase/server";
import { getMonsterSiteUrl } from "@/lib/monster-site";
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

  const sb = createSupabaseServerAnonClient();

  // 이번 달 첫 날 (KST 기준 근사 — server 타임존과 무관하게 local Date)
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const monthStartIso = monthStart.toISOString();

  const [{ data: students }, { data: monthLogs }, { data: monthHarvests }] = await Promise.all([
    sb
      .from("garden_students")
      .select("*")
      .eq("is_active", true)
      .order("class_name", { ascending: true, nullsFirst: false })
      .order("name", { ascending: true }),
    sb
      .from("garden_point_logs")
      .select("student_id, points, reason, logged_at")
      .gte("logged_at", monthStartIso)
      .order("logged_at", { ascending: false })
      .limit(5000),
    sb
      .from("garden_harvests")
      .select("student_id, apples_count, harvested_at")
      .gte("harvested_at", monthStartIso)
      .order("harvested_at", { ascending: false })
      .limit(2000),
  ]);

  const monsterUrl = getMonsterSiteUrl();

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
