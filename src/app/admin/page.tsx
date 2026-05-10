// /admin - 원장 입력 화면 (모바일 최적화)
// 비밀번호가 없으면 로그인 폼 표시, 있으면 해당 지점의 학생 리스트 + 빠른 입력 버튼

import Link from "next/link";
import { createSupabaseServerAnonClient } from "@/lib/supabase/server";
import { getMonsterSiteUrl } from "@/lib/monster-site";
import { getBranchId } from "@/lib/branch";
import type { GardenPointLog, GardenStudent } from "@/lib/types";
import { isAdminAuthenticated } from "./auth";
import { LoginForm } from "./LoginForm";
import { AdminClient } from "./AdminClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export type AdminPendingPoint = {
  id: string;
  student_id: string;
  points: number;
  reason: string | null;
  created_at: string;
};

export default async function AdminPage({
  searchParams,
}: {
  searchParams: { key?: string; class?: string };
}) {
  const authed = isAdminAuthenticated(searchParams.key);

  if (!authed) {
    return <LoginForm initialKey={searchParams.key ?? ""} />;
  }

  // 환경변수 미설정 안내
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return (
      <main className="min-h-screen p-6">
        <div className="max-w-md mx-auto bg-white rounded-2xl shadow-card p-6 text-center">
          <div className="text-4xl mb-2">🪴</div>
          <p className="text-ink-strong leading-relaxed">
            Supabase 환경변수가 비어 있어요. 프로젝트 루트의 <code>.env.local</code> 을 채워주세요.
          </p>
        </div>
      </main>
    );
  }

  const branchId = getBranchId();
  const monsterUrl = getMonsterSiteUrl();

  if (!branchId) {
    return (
      <main className="min-h-screen p-6">
        <div className="max-w-lg mx-auto bg-[#fef2f0] border-[2.5px] border-[var(--apple-deep)] rounded-2xl p-6">
          <div className="text-3xl mb-2">⚠️</div>
          <h1 className="text-lg font-extrabold text-[var(--apple-deep)] mb-2">
            BRANCH_ID 환경변수가 설정되지 않았어요
          </h1>
          <p className="text-sm text-[var(--ink)] leading-relaxed mb-3">
            지점별 학생 고유 식별 을 위해 Vercel 프로젝트 설정에서 <code className="px-1.5 py-0.5 bg-white rounded">BRANCH_ID</code>을 추가해주세요.
          </p>
          <ul className="text-xs text-[var(--ink-soft)] space-y-1 list-disc pl-5">
            <li>계림점: <code>monster_gyerim</code></li>
            <li>봉선점: <code>monster_bong</code></li>
          </ul>
          <a
            href={monsterUrl}
            className="mt-4 inline-block px-3 py-2 rounded-full bg-white border-[1.5px] border-[var(--ink)] text-[var(--ink)] text-sm font-extrabold"
          >
            ← 본사으로
          </a>
        </div>
      </main>
    );
  }

  const sb = createSupabaseServerAnonClient();

  // 1단계: 이 지점 학생 먼저 가져오기
  const { data: students } = await sb
    .from("garden_students")
    .select("*")
    .eq("branch_id", branchId)
    .eq("is_active", true)
    .order("class_name", { ascending: true, nullsFirst: false })
    .order("name", { ascending: true });

  const branchStudentIds = ((students ?? []) as GardenStudent[]).map((s) => s.id);

  // 2단계: 지점 학생의 logs / pending 만
  const [{ data: recentLogs }, { data: recentPending }] =
    branchStudentIds.length > 0
      ? await Promise.all([
          sb
            .from("garden_point_logs")
            .select("*")
            .in("student_id", branchStudentIds)
            .order("logged_at", { ascending: false })
            .limit(30),
          sb
            .from("garden_pending_points")
            .select("*")
            .in("student_id", branchStudentIds)
            .order("created_at", { ascending: false })
            .limit(50),
        ])
      : [{ data: [] }, { data: [] }];

  const studentMap = new Map<string, GardenStudent>();
  for (const s of (students ?? []) as GardenStudent[]) studentMap.set(s.id, s);

  return (
    <main className="min-h-screen pb-32">
      <header className="sticky top-0 z-30 bg-cream/90 backdrop-blur border-b border-pot/10">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <a
              href={monsterUrl}
              className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full bg-white border-[1.5px] border-[var(--ink)] text-[var(--ink)] text-xs font-extrabold shadow-card"
              aria-label="monster-site 지점 관리자 페이지로"
            >
              ← 본사
            </a>
            <h1 className="text-xl font-bold truncate">사과정원 관리</h1>
          </div>
          <nav className="flex gap-3 text-sm flex-wrap">
            <Link href="/admin/students" className="text-ink-soft hover:text-apple">
              학생 관리
            </Link>
            <Link href="/admin/reports" className="text-ink-soft hover:text-apple">
              리포트
            </Link>
            <Link href="/admin/reset" className="text-ink-soft hover:text-apple">
              학기 리셋
            </Link>
            <Link href="/" target="_blank" className="text-ink-soft hover:text-apple">
              TV 화면 ↗
            </Link>
          </nav>
        </div>
      </header>

      <AdminClient
        students={(students ?? []) as GardenStudent[]}
        recentLogs={(recentLogs ?? []) as GardenPointLog[]}
        recentPending={(recentPending ?? []) as AdminPendingPoint[]}
        studentMap={Object.fromEntries(
          Array.from(studentMap.entries()).map(([k, v]) => [k, { name: v.name, class_name: v.class_name }]),
        )}
        initialClass={searchParams.class ?? null}
      />
    </main>
  );
}
