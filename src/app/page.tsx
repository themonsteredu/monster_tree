// 로비 TV 화면 (가로 풀스크린, 1920x1080 가정)
// 지점 선택:
//   1) ?branch=br_xxx URL 쿼리 (monster-site 핸드오프 — 우선)
//   2) BRANCH_ID env (deployment 고정)
// 둘 다 없으면 안내 배너.
//
// 동일한 TV 화면을 /tree/tv 공개 라우트에서도 사용한다. SSR 데이터 로딩은
// src/lib/tv-data.ts 의 loadTvData() 로 일원화.

import { TVScreen } from "./TVScreen";
import { TVWakeLock } from "./tv/TVWakeLock";
import { loadTvData } from "@/lib/tv-data";
import { getBranchId } from "@/lib/branch";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function Page({
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
    <>
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
    </>
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
