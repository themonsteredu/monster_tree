// /admin/game-center-preview — 관리자가 학생 게임센터를 그대로 체험할 수 있는 진입점.
// 학생용 GameCenterClient 를 adminMode 로 재사용.
//
// 정책:
//  - 일일 한도 무시 (무제한 플레이)
//  - 게임 결과를 game_plays / game_rankings / student_monsters 어디에도 저장 안 함
//  - 화면 상단에 "🛠 테스트 모드" 뱃지 노출
//  - 몬스터알 / 랭킹 영역은 placeholder/실데이터 혼용으로 시각적 동일성 유지

import { redirect } from "next/navigation";
import { isAdminAuthenticated } from "../auth";
import { LoginForm } from "../LoginForm";
import { GameCenterClient } from "@/app/me/game-center/GameCenterClient";
import {
  DAILY_PLAY_LIMIT,
  type GameRanking,
  type StudentMonster,
} from "@/lib/types";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { getAdminBranchId } from "@/lib/branch";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const GAME_TYPE = "infinite_stairs";

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

  // 랭킹은 실제 지점 데이터를 표시 (관리자가 학생 시점 그대로 확인 가능).
  const { data: topRows } = await sb
    .from("game_rankings")
    .select(
      "id, student_id, branch_id, game_type, best_score, month, reward_exp, rank, updated_at",
    )
    .eq("branch_id", branchId)
    .eq("game_type", GAME_TYPE)
    .eq("month", monthKey)
    .order("best_score", { ascending: false })
    .limit(3);
  const topRankings = (topRows ?? []) as GameRanking[];

  const nameByStudentId: Record<string, string> = {};
  if (topRankings.length > 0) {
    const ids = Array.from(new Set(topRankings.map((r) => r.student_id)));
    const { data: nameRows } = await sb
      .from("garden_students")
      .select("id, name")
      .in("id", ids);
    for (const r of (nameRows ?? []) as Array<{ id: string; name: string }>) {
      nameByStudentId[r.id] = r.name;
    }
  }

  // 관리자에겐 활성 몬스터가 없으므로 placeholder 합성.
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
      todayPlayCount={0}
      dailyLimit={DAILY_PLAY_LIMIT}
      activeMonster={fakeMonster}
      monsterSpecies={null}
      monsterStages={[]}
      topRankings={topRankings}
      myRanking={null}
      myRankNumber={null}
      myStudentId=""
      nameByStudentId={nameByStudentId}
      monthKey={monthKey}
    />
  );
}
