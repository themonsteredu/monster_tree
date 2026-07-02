// /tree/tv — 로비 TV 전용 공개 라우트 (로그인 검사 없음, 읽기 전용).
// 기존 /tree/ 와 동일한 TV 화면을 그대로 띄우되, 30초 백업 폴링으로 Realtime 끊김 대비.
//
// 지점 선택:
//   1) ?branch=br_xxx 쿼리 (우선)
//   2) BRANCH_ID env (deployment 고정 — 학원별 TV 에서 url 변경 없이 운영)
// 둘 다 없으면 안내 배너.

import { TVScreen } from "../TVScreen";
import { TVAutoRefresh } from "./TVAutoRefresh";
import { TVWakeLock } from "./TVWakeLock";
import { loadTvData } from "@/lib/tv-data";
import { getBranchId } from "@/lib/branch";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function TvPublicPage({
  searchParams,
}: {
  searchParams: { branch?: string };
}) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return <EnvMissingNotice />;
  }

  const queryBranch = searchParams.branch?.trim();
  const branchId = queryBranch && queryBranch.length > 0 ? queryBranch : getBranchId();
  if (!branchId) {
    return <BranchMissingNotice />;
  }

  const data = await loadTvData(branchId);

  return (
    <TVAutoRefresh>
      <TVWakeLock />
      <TVScreen
        initialStudents={data.students}
        initialTodayHarvest={data.todayHarvest}
        branchId={branchId}
        initialTreeStages={data.treeStages}
        yardBackgroundImage={data.yardBackgroundImage}
        decorationItems={data.decorationItems}
        yardLayoutByStudent={data.yardLayoutByStudent}
        weatherByStudent={data.weatherByStudent}
        activeMonsterByStudent={data.activeMonsterByStudent}
        evolvedMonstersByStudent={data.evolvedMonstersByStudent}
        sceneLayoutByStudent={data.sceneLayoutByStudent}
        monsterSpeciesById={data.monsterSpeciesById}
        monsterStagesBySpecies={data.monsterStagesBySpecies}
      />
    </TVAutoRefresh>
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
        </p>
      </div>
    </main>
  );
}
