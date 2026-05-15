// 로비 TV 화면 (가로 풀스크린, 1920x1080 가정)
// 지점 선택:
//   1) ?branch=br_xxx URL 쿼리 (monster-site 핸드오프 — 우선)
//   2) BRANCH_ID env (deployment 고정)
// 둘 다 없으면 안내 배너.

import { TVScreen } from "./TVScreen";
import { createSupabaseServerAnonClient } from "@/lib/supabase/server";
import { getBranchId } from "@/lib/branch";
import type { GardenStudent } from "@/lib/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function Page({
  searchParams,
}: {
  searchParams: { branch?: string };
}) {
  let initialStudents: GardenStudent[] = [];
  let initialTodayHarvest = 0;
  let envMissing = false;

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    envMissing = true;
  }

  const queryBranch = searchParams.branch?.trim();
  const branchId = queryBranch && queryBranch.length > 0 ? queryBranch : getBranchId();

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

  // 나무 단계별 이미지 — SSR 으로 미리 가져와 첫 렌더부터 적용 (SVG flash 방지)
  const { data: treeStages } = await sb
    .from("garden_tree_stages")
    .select("stage, image_url, scale, offset_x, offset_y, updated_at")
    .order("stage", { ascending: true });

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
      initialTreeStages={treeStages ?? []}
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
          어떤 지점 TV 인지 모르겠어요
        </h1>
        <p className="text-sm text-[var(--ink)] leading-relaxed">
          URL 에 <code className="px-1.5 py-0.5 bg-white rounded">?branch=br_xxx</code> 를 붙이거나,
          <br />
          Vercel 프로젝트 설정에서 <code className="px-1.5 py-0.5 bg-white rounded">BRANCH_ID</code> env 를 추가해주세요.
          <br />
          본사 (monster-site) "몬스터 트리" 버튼으로 진입하면 자동으로 채워집니다.
        </p>
      </div>
    </main>
  );
}
