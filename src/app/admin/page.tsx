// /admin - 원장 입력 화면 (모바일 최적화)
// 비밀번호가 없으면 로그인 폼 표시, 있으면 해당 지점의 학생 리스트 + 빠른 입력 버튼

import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerAnonClient } from "@/lib/supabase/server";
import { getMonsterSiteUrl } from "@/lib/monster-site";
import { getAdminBranchId, getAdminBranchName } from "@/lib/branch";
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
  searchParams: { key?: string; class?: string; branch?: string; name?: string };
}) {
  const authed = isAdminAuthenticated(searchParams.key);

  if (!authed) {
    return <LoginForm initialKey={searchParams.key ?? ""} />;
  }

  // 환경변수 미설정 안내
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return (
      <main className="min-h-screen p-6 bg-gray-50">
        <div className="max-w-md mx-auto bg-white rounded-xl shadow-sm border border-gray-100 p-6 text-center">
          <p className="text-gray-900 leading-relaxed">
            Supabase 환경변수가 비어 있어요. 프로젝트 루트의 <code className="bg-gray-100 px-1.5 py-0.5 rounded text-sm">.env.local</code> 을 채워주세요.
          </p>
        </div>
      </main>
    );
  }

  // monster-site 의 "몬스터 트리" 버튼이 ?branch=br_xxx&name=계림점 으로 핸드오프하면
  // 쿠키 셋팅을 Route Handler 에 위임 — Server Component 에서는 cookies().set() 금지.
  if (searchParams.branch && searchParams.branch.trim()) {
    const qs = new URLSearchParams({ branch: searchParams.branch.trim() });
    if (searchParams.name?.trim()) qs.set("name", searchParams.name.trim());
    redirect(`/admin/handoff?${qs.toString()}`);
  }

  const branchId = getAdminBranchId();
  const branchName = getAdminBranchName();
  const monsterUrl = getMonsterSiteUrl();

  if (!branchId) {
    redirect("/admin/select-branch");
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
    <main className="min-h-screen pb-32 bg-gray-50">
      <header className="sticky top-0 z-30 bg-white border-b border-gray-100">
        <div className="max-w-5xl mx-auto px-4 pt-3 pb-2 flex items-center gap-3">
          <a
            href={monsterUrl}
            className="shrink-0 text-sm text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-lg px-3 py-1.5 transition"
            aria-label="monster-site 지점 관리자 페이지로"
          >
            ← 본사
          </a>
          <div className="min-w-0 flex items-baseline gap-2">
            <h1 className="text-lg font-semibold text-gray-900 truncate leading-tight">사과정원 관리</h1>
            {branchName && (
              <span className="text-xs text-gray-400 truncate">{branchName}</span>
            )}
          </div>
        </div>
        <div className="max-w-5xl mx-auto px-4 pb-2 flex items-center justify-between gap-2">
          <nav className="flex flex-wrap items-center gap-1">
            <Link
              href="/admin/students"
              className="text-sm font-medium text-gray-500 hover:text-gray-900 hover:bg-gray-50 rounded-lg px-3 py-1.5 transition"
            >
              학생관리
            </Link>
            <Link
              href="/admin/reports"
              className="text-sm font-medium text-gray-500 hover:text-gray-900 hover:bg-gray-50 rounded-lg px-3 py-1.5 transition"
            >
              리포트
            </Link>
            <Link
              href="/admin/gallery"
              className="text-sm font-medium text-gray-500 hover:text-gray-900 hover:bg-gray-50 rounded-lg px-3 py-1.5 transition"
            >
              아바타갤러리
            </Link>
            <Link
              href="/admin/tree"
              className="text-sm font-medium text-gray-500 hover:text-gray-900 hover:bg-gray-50 rounded-lg px-3 py-1.5 transition"
            >
              나무이미지
            </Link>
            <Link
              href="/admin/village"
              className="text-sm font-medium text-gray-500 hover:text-gray-900 hover:bg-gray-50 rounded-lg px-3 py-1.5 transition"
            >
              마을관리
            </Link>
            <Link
              href="/admin/decorations"
              className="text-sm font-medium text-gray-500 hover:text-gray-900 hover:bg-gray-50 rounded-lg px-3 py-1.5 transition"
            >
              마당소품
            </Link>
            <Link
              href="/admin/yard"
              className="text-sm font-medium text-gray-500 hover:text-gray-900 hover:bg-gray-50 rounded-lg px-3 py-1.5 transition"
            >
              마당배경
            </Link>
            <Link
              href="/admin/monsters"
              className="text-sm font-medium text-gray-500 hover:text-gray-900 hover:bg-gray-50 rounded-lg px-3 py-1.5 transition"
            >
              몬스터종
            </Link>
            <Link
              href="/admin/suggest"
              className="text-sm font-medium text-gray-500 hover:text-gray-900 hover:bg-gray-50 rounded-lg px-3 py-1.5 transition"
            >
              건의함
            </Link>
            <Link
              href="/admin/reset"
              className="text-sm font-medium text-gray-500 hover:text-gray-900 hover:bg-gray-50 rounded-lg px-3 py-1.5 transition"
            >
              학기리셋
            </Link>
            <Link
              href="/admin/village-preview"
              target="_blank"
              className="text-sm font-medium text-gray-500 hover:text-gray-900 hover:bg-gray-50 rounded-lg px-3 py-1.5 transition"
            >
              마을보기 ↗
            </Link>
            <Link
              href={`/?branch=${encodeURIComponent(branchId!)}`}
              target="_blank"
              className="text-sm font-medium text-gray-500 hover:text-gray-900 hover:bg-gray-50 rounded-lg px-3 py-1.5 transition"
            >
              TV화면 ↗
            </Link>
          </nav>
          <Link
            href="/admin/select-branch"
            className="text-xs text-gray-400 hover:text-gray-700 rounded-lg px-2 py-1 transition shrink-0"
            title={`지점: ${branchName ?? branchId}`}
          >
            지점 변경
          </Link>
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
