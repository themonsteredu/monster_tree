// 로비 TV 화면 (가로 풀스크린, 1920x1080 가정)
// 해당 지점 (BRANCH_ID env) 학생만 표시.

import { TVScreen } from "./TVScreen";
import { createSupabaseServerAnonClient } from "@/lib/supabase/server";
import { getBranchId } from "@/lib/branch";
import type { GardenStudent } from "@/lib/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function Page() {
  let initialStudents: GardenStudent[] = [];
  let initialTodayHarvest = 0;
  let envMissing = false;

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    envMissing = true;
  }

  const branchId = getBranchId();

  if (envMissing) {
    return <EnvMissingNotice />;
  }
  if (!branchId) {
    return <BranchMissingNotice />;
  }

  const sb = createSupabaseServerAnonClient();
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  // 1단계: 지점 학생
  const { data: students } = await sb
    .from("garden_students")
    .select("*")
    .eq("branch_id", branchId)
    .eq("is_active", true)
    .order("total_points", { ascending: false });

  initialStudents = (students ?? []) as GardenStudent[];
  const branchStudentIds = initialStudents.map((s) => s.id);

  // 2단계: 지점 학생의 오늘 수확
  if (branchStudentIds.length > 0) {
    const { data: harvests } = await sb
      .from("garden_harvests")
      .select("apples_count")
      .in("student_id", branchStudentIds)
      .gte("harvested_at", todayStart.toISOString());
    initialTodayHarvest = (harvests ?? []).reduce(
      (acc, h) => acc + (h.apples_count ?? 0),
      0,
    );
  }

  return (
    <TVScreen
      initialStudents={initialStudents}
      initialTodayHarvest={initialTodayHarvest}
      branchId={branchId}
    />
  );
}

function EnvMissingNotice() {
  return (
    <main className="min-h-screen flex items-center justify-center p-10">
      <div className="max-w-2xl rounded-3xl bg-white shadow-card p-10 text-center">
        <div className="text-6xl mb-4">🪴</div>
        <h1 className="text-2xl font-bold mb-3">사과정원 준비가 거의 끝났어요!</h1>
        <p className="text-ink-soft leading-relaxed">
          Supabase 환경변수가 아직 설정되지 않았어요.
          <br />
          프로젝트 루트의 <code className="bg-cream-deep px-2 py-0.5 rounded">.env.local</code> 파일을 열어
          <br />
          <code className="bg-cream-deep px-2 py-0.5 rounded mt-2 inline-block">NEXT_PUBLIC_SUPABASE_URL</code> 과
          <code className="bg-cream-deep px-2 py-0.5 rounded ml-2">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> 를 채워주세요.
        </p>
        <p className="text-sm text-ink-soft mt-6">
          README.md 의 "환경변수 설정" 섹션을 참고하시면 한 번에 따라하실 수 있어요.
        </p>
      </div>
    </main>
  );
}

function BranchMissingNotice() {
  return (
    <main className="min-h-screen flex items-center justify-center p-10">
      <div className="max-w-xl rounded-3xl bg-[#fef2f0] border-[2.5px] border-[var(--apple-deep)] p-8 text-center">
        <div className="text-5xl mb-3">⚠️</div>
        <h1 className="text-xl font-extrabold text-[var(--apple-deep)] mb-2">
          BRANCH_ID 환경변수가 설정되지 않았어요
        </h1>
        <p className="text-sm text-[var(--ink)] leading-relaxed">
          Vercel 프로젝트 설정에서 <code className="px-1.5 py-0.5 bg-white rounded">BRANCH_ID</code> 추가 필요.
        </p>
        <ul className="mt-3 text-xs text-[var(--ink-soft)] list-disc inline-block text-left">
          <li>계림점: <code>monster_gyerim</code></li>
          <li>봉선점: <code>monster_bong</code></li>
        </ul>
      </div>
    </main>
  );
}
