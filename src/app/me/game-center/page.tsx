// /tree/me/game-center — 학생 게임센터 허브 (모바일 세로 최적화).
// 두 게임(무한의계단 / 스카이슈터)을 모두 표시. 각 게임별로:
//  - 오늘 남은 플레이 횟수 (KST 자정 기준, 게임별 독립)
//  - 이번 달 지점 랭킹 TOP 3 + 본인 순위 (game_rankings, 'YYYY-MM' KST)
// 활성 몬스터알 진행 상태는 두 게임이 공통으로 영향.

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { STUDENT_COOKIE_NAME, verifyStudentJwt } from "@/lib/student-jwt";
import {
  createSupabaseServerAnonClient,
  createSupabaseServiceClient,
} from "@/lib/supabase/server";
import {
  DAILY_PLAY_LIMIT,
  type GameRanking,
  type MonsterSpecies,
  type MonsterStageImage,
  type StudentMonster,
} from "@/lib/types";
import { GameCenterClient } from "./GameCenterClient";
import { GAME_TYPES, type GameStats } from "./games";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function kstMonthKey(d: Date = new Date()): string {
  return d.toLocaleString("sv-SE", { timeZone: "Asia/Seoul" }).slice(0, 7);
}

export default async function GameCenterPage() {
  const token = cookies().get(STUDENT_COOKIE_NAME)?.value;
  const payload = await verifyStudentJwt(token);
  if (!payload) redirect("https://www.themonster.kr/login");

  const sbAnon = createSupabaseServerAnonClient();
  const sb = createSupabaseServiceClient();

  // 본인 garden_students 행
  const { data: studentRow } = await sbAnon
    .from("garden_students")
    .select("id")
    .eq("branch_id", payload.branchId)
    .eq("external_student_id", payload.studentLocalId)
    .maybeSingle();

  if (!studentRow?.id) {
    redirect("/me/village");
  }
  const studentId = studentRow.id as string;

  // 활성 몬스터 (is_evolved=false). 없으면 onboarding 으로.
  const { data: activeRaw } = await sb
    .from("student_monsters")
    .select(
      "id, student_id, species_id, nickname, current_exp, current_stage, is_evolved, selected_at, evolved_at",
    )
    .eq("student_id", studentId)
    .eq("is_evolved", false)
    .maybeSingle();

  if (!activeRaw) {
    redirect("/me/onboarding");
  }
  const activeMonster = activeRaw as StudentMonster;

  // 종 + 단계 이미지 (활성 몬스터의 species 만)
  const [{ data: speciesRow }, { data: stageRows }] = await Promise.all([
    sb
      .from("monster_species")
      .select(
        "id, name, description, display_order, is_active, hide_name, created_at, updated_at",
      )
      .eq("id", activeMonster.species_id)
      .maybeSingle(),
    sb
      .from("monster_stage_images")
      .select(
        "id, species_id, stage, image_url, stage_name, required_exp, updated_at",
      )
      .eq("species_id", activeMonster.species_id)
      .order("stage", { ascending: true }),
  ]);

  const monsterSpecies = (speciesRow as MonsterSpecies | null) ?? null;
  const monsterStages = (stageRows ?? []) as MonsterStageImage[];

  // 게임별 데이터 — 오늘 플레이 횟수 + TOP 3 랭킹 + 본인 랭킹.
  const monthKey = kstMonthKey();
  const gameStats: Record<string, GameStats> = {};
  const allStudentIds = new Set<string>();

  await Promise.all(
    GAME_TYPES.map(async (gt) => {
      const [
        { data: todayCountRaw },
        { data: topRows },
        { data: myRankingRow },
      ] = await Promise.all([
        sb.rpc("get_today_play_count", {
          p_student_id: studentId,
          p_game_type: gt.type,
        }),
        sb
          .from("game_rankings")
          .select(
            "id, student_id, branch_id, game_type, best_score, month, reward_exp, rank, updated_at",
          )
          .eq("branch_id", payload.branchId)
          .eq("game_type", gt.type)
          .eq("month", monthKey)
          .order("best_score", { ascending: false })
          .limit(3),
        sb
          .from("game_rankings")
          .select(
            "id, student_id, branch_id, game_type, best_score, month, reward_exp, rank, updated_at",
          )
          .eq("student_id", studentId)
          .eq("game_type", gt.type)
          .eq("month", monthKey)
          .maybeSingle(),
      ]);

      const topRankings = (topRows ?? []) as GameRanking[];
      const myRanking = (myRankingRow as GameRanking | null) ?? null;

      let myRankNumber: number | null = null;
      if (myRanking) {
        const { count } = await sb
          .from("game_rankings")
          .select("id", { count: "exact", head: true })
          .eq("branch_id", payload.branchId)
          .eq("game_type", gt.type)
          .eq("month", monthKey)
          .gt("best_score", myRanking.best_score);
        myRankNumber = (count ?? 0) + 1;
      }

      for (const r of topRankings) allStudentIds.add(r.student_id);
      if (myRanking) allStudentIds.add(myRanking.student_id);

      gameStats[gt.type] = {
        todayPlayCount:
          typeof todayCountRaw === "number" ? todayCountRaw : 0,
        topRankings,
        myRanking,
        myRankNumber,
      };
    }),
  );

  // 랭킹에 표시할 학생 이름 일괄 조회.
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

  return (
    <GameCenterClient
      studentName={payload.name}
      dailyLimit={DAILY_PLAY_LIMIT}
      activeMonster={activeMonster}
      monsterSpecies={monsterSpecies}
      monsterStages={monsterStages}
      gameStats={gameStats}
      myStudentId={studentId}
      nameByStudentId={nameByStudentId}
      monthKey={monthKey}
    />
  );
}
