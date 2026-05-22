// /admin/game-center-preview — 관리자가 학생 게임센터를 그대로 체험할 수 있는 진입점.
// 학생용 GameCenterClient 를 adminMode 로 재사용. 두 게임(무한의계단/스카이슈터) 모두 표시.

import { redirect } from "next/navigation";
import { isAdminAuthenticated } from "../auth";
import { LoginForm } from "../LoginForm";
import {
  GameCenterClient,
  type GameStats,
  GAME_TYPES,
} from "@/app/me/game-center/GameCenterClient";
import {
  DAILY_PLAY_LIMIT,
  type GameRanking,
  type StudentMonster,
} from "@/lib/types";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { getAdminBranchId } from "@/lib/branch";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function kstMonthKey(): string {
  return new Date()
    .toLocaleString("sv-SE", { timeZone: "Asia/Seoul" })
    .slice(0, 7);
}

export default async function AdminGameCenterPreviewPage({
  searchParams,
}: {
  searchParams: { key?: string; branch?: string };
}) {
  if (!isAdminAuthenticated(searchParams.key)) {
    return <LoginForm initialKey={searchParams.key ?? ""} />;
  }

  const branchId =
    getAdminBranchId() ?? searchParams.branch?.trim() ?? null;
  if (!branchId) {
    redirect("/admin/select-branch");
  }

  const sb = createSupabaseServiceClient();
  const monthKey = kstMonthKey();

  // 게임별 랭킹 TOP 3 일괄 로드 — 관리자가 학생 시점 그대로 확인 가능.
  const gameStats: Record<string, GameStats> = {};
  const allStudentIds = new Set<string>();

  await Promise.all(
    GAME_TYPES.map(async (gt) => {
      const { data: topRows } = await sb
        .from("game_rankings")
        .select(
          "id, student_id, branch_id, game_type, best_score, month, reward_exp, rank, updated_at",
        )
        .eq("branch_id", branchId)
        .eq("game_type", gt.type)
        .eq("month", monthKey)
        .order("best_score", { ascending: false })
        .limit(3);
      const topRankings = (topRows ?? []) as GameRanking[];
      for (const r of topRankings) allStudentIds.add(r.student_id);
      gameStats[gt.type] = {
        todayPlayCount: 0,
        topRankings,
        myRanking: null,
        myRankNumber: null,
      };
    }),
  );

  const nameByStudentId: Record<string, string> = {};
  if (allStudentIds.size > 0) {
    const { data: nameRows } = await sb
      .from("garden_students")
      .select("id, name")
      .in("id", Array.from(allStudentIds));
    for (const r of (nameRows ?? []) as Array<{ id: string; name: string }>) {
      nameByStudentId[r.id] = r.name;
    }
  }

  // 관리자에겐 활성 몬스터가 없음 → placeholder 합성 (스테이지 1 알 fallback).
  const fakeMonster: StudentMonster = {
    id: "__admin_preview__",
    student_id: "__admin__",
    species_id: "__admin__",
    nickname: "테스트",
    current_exp: 0,
    current_stage: 1,
    is_evolved: false,
    selected_at: new Date().toISOString(),
    evolved_at: null,
  };

  return (
    <GameCenterClient
      adminMode
      villageHref={`/admin/village-preview?branch=${encodeURIComponent(branchId)}`}
      studentName="관리자"
      dailyLimit={DAILY_PLAY_LIMIT}
      activeMonster={fakeMonster}
      monsterSpecies={null}
      monsterStages={[]}
      gameStats={gameStats}
      myStudentId=""
      nameByStudentId={nameByStudentId}
      monthKey={monthKey}
    />
  );
}
