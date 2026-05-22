// /tree/me/game-center — 학생 게임센터 허브 (모바일 세로 최적화).
// - 활성 몬스터알 진행 상태 (student_monsters where is_evolved=false)
// - 오늘 남은 플레이 횟수 (get_today_play_count RPC, KST 기준)
// - 이번 달 지점 랭킹 TOP 3 + 본인 순위 (game_rankings, 'YYYY-MM' KST)
//
// 활성 몬스터가 없으면 알 선택 페이지(/me/onboarding)로 보낸다 — /me 와 동일 정책.
// Phase 1 단계: 실제 게임 라우트는 다음 단계에서 추가, 본 페이지는 허브 UI 만.

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

export const dynamic = "force-dynamic";
export const revalidate = 0;

const GAME_TYPE = "infinite_stairs";

// KST 기준 'YYYY-MM' — 월간 랭킹 키.
function kstMonthKey(d: Date = new Date()): string {
  // 'sv-SE' 로케일 + Asia/Seoul → 'YYYY-MM-DD HH:mm:ss' 형식, 앞 7자만 사용.
  const ymd = d
    .toLocaleString("sv-SE", { timeZone: "Asia/Seoul" })
    .slice(0, 7);
  return ymd;
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
    // 학원에서 계정 발급 직후 garden_students 가 비어있을 가능성. 마을로 돌려보냄.
    redirect("/me/village");
  }

  const studentId = studentRow.id as string;

  // 활성 몬스터 (is_evolved=false). 없으면 /me 와 동일하게 onboarding 으로.
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

  // 오늘 플레이 횟수 (KST 자정 기준)
  const { data: todayCountRaw } = await sb.rpc("get_today_play_count", {
    p_student_id: studentId,
    p_game_type: GAME_TYPE,
  });
  const todayPlayCount =
    typeof todayCountRaw === "number" ? todayCountRaw : 0;

  // 이번 달 지점 랭킹 — TOP 3 + 본인 행. 표시용 이름은 garden_students 에서 조인.
  const monthKey = kstMonthKey();
  const [{ data: topRows }, { data: myRankingRow }] = await Promise.all([
    sb
      .from("game_rankings")
      .select("id, student_id, branch_id, game_type, best_score, month, reward_exp, rank, updated_at")
      .eq("branch_id", payload.branchId)
      .eq("game_type", GAME_TYPE)
      .eq("month", monthKey)
      .order("best_score", { ascending: false })
      .limit(3),
    sb
      .from("game_rankings")
      .select("id, student_id, branch_id, game_type, best_score, month, reward_exp, rank, updated_at")
      .eq("student_id", studentId)
      .eq("game_type", GAME_TYPE)
      .eq("month", monthKey)
      .maybeSingle(),
  ]);

  const topRankings = (topRows ?? []) as GameRanking[];
  const myRanking = (myRankingRow as GameRanking | null) ?? null;

  // 본인 순위 계산 — 본인보다 best_score 높은 행 수 + 1.
  let myRankNumber: number | null = null;
  if (myRanking) {
    const { count } = await sb
      .from("game_rankings")
      .select("id", { count: "exact", head: true })
      .eq("branch_id", payload.branchId)
      .eq("game_type", GAME_TYPE)
      .eq("month", monthKey)
      .gt("best_score", myRanking.best_score);
    myRankNumber = (count ?? 0) + 1;
  }

  // TOP 3 와 본인 이름 매핑 (학생 이름 표시용)
  const idsToName = Array.from(
    new Set(
      [
        ...topRankings.map((r) => r.student_id),
        myRanking?.student_id,
      ].filter((v): v is string => !!v),
    ),
  );
  const nameByStudentId: Record<string, string> = {};
  if (idsToName.length > 0) {
    const { data: nameRows } = await sb
      .from("garden_students")
      .select("id, name")
      .in("id", idsToName);
    for (const r of (nameRows ?? []) as Array<{ id: string; name: string }>) {
      nameByStudentId[r.id] = r.name;
    }
  }

  return (
    <GameCenterClient
      studentName={payload.name}
      todayPlayCount={todayPlayCount}
      dailyLimit={DAILY_PLAY_LIMIT}
      activeMonster={activeMonster}
      monsterSpecies={monsterSpecies}
      monsterStages={monsterStages}
      topRankings={topRankings}
      myRanking={myRanking}
      myRankNumber={myRankNumber}
      myStudentId={studentId}
      nameByStudentId={nameByStudentId}
      monthKey={monthKey}
    />
  );
}
