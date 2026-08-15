// /admin/garden - 사과정원 관리 (구 /admin)
// 비밀번호가 없으면 로그인 폼 표시, 있으면 해당 지점의 학생 리스트 + 빠른 입력 버튼

import { redirect } from "next/navigation";
import { createSupabaseServerAnonClient } from "@/lib/supabase/server";
import { getAdminBranchId } from "@/lib/branch";
import type { GardenPointLog, GardenStudent } from "@/lib/types";
import { isAdminAuthenticated } from "../auth";
import { LoginForm } from "../LoginForm";
import { AdminHeader } from "../AdminHeader";
import { AdminClient } from "../AdminClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export type AdminPendingPoint = {
  id: string;
  student_id: string;
  points: number;
  reason: string | null;
  created_at: string;
};

export default async function GardenAdminPage({
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

  // monster-site 의 "몬스터마을 → 사과정원" 버튼이 ?branch=br_xxx&name=계림점 으로 핸드오프하면
  // 쿠키 셋팅을 Route Handler 에 위임 — Server Component 에서는 cookies().set() 금지.
  // handoff 후 /admin 으로 돌아오면 거기서 다시 /admin/garden 으로 redirect 되므로 자연스럽게 흐른다.
  if (searchParams.branch && searchParams.branch.trim()) {
    const qs = new URLSearchParams({ branch: searchParams.branch.trim() });
    if (searchParams.name?.trim()) qs.set("name", searchParams.name.trim());
    redirect(`/admin/handoff?${qs.toString()}`);
  }

  const branchId = getAdminBranchId();

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
      <AdminHeader current="garden" title="사과정원 관리" />

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
