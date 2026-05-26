"use server";

// 게임센터 server actions — 게임 결과 기록 + EXP 적립 + 단계 진화 + 월간 베스트 갱신.
// 두 게임(infinite_stairs / sky_shooter)이 같은 로직을 공유하므로 recordGamePlay 헬퍼로 추출.
// 보안: 클라이언트가 임의 점수 보내도 서버에서 일일 한도 + 점수 상한 검증.

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { STUDENT_COOKIE_NAME, verifyStudentJwt } from "@/lib/student-jwt";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { DAILY_PLAY_LIMIT } from "@/lib/types";

export type GameType = "infinite_stairs" | "sky_shooter";

// 각 게임의 정상 플레이로 도달 가능한 최대 점수 — 그 이상은 거부.
const MAX_REASONABLE_SCORE: Record<GameType, number> = {
  infinite_stairs: 2000,
  sky_shooter: 20000,
};

const EXP_RATE = 0.1; // 점수 * 10% = EXP
const MIN_EXP = 1;
const MAX_EXP = 200;

export type PlayResult =
  | {
      ok: false;
      reason: "auth" | "limit" | "invalid" | "no_student" | "no_monster";
      message: string;
    }
  | {
      ok: true;
      gameType: GameType;
      score: number;
      expEarned: number;
      newExp: number;
      stageUp: boolean;
      fromStage: number;
      toStage: number;
      finalEvolution: boolean;
      isNewBest: boolean;
      remainingToday: number;
    };

// 후방호환 — 기존 호출자가 import 하는 이름을 유지.
export type InfiniteStairsResult = PlayResult;

async function recordGamePlay(
  gameType: GameType,
  score: number,
): Promise<PlayResult> {
  const token = cookies().get(STUDENT_COOKIE_NAME)?.value;
  const payload = await verifyStudentJwt(token);
  if (!payload) {
    return { ok: false, reason: "auth", message: "로그인이 만료됐어요." };
  }

  if (
    !Number.isInteger(score) ||
    score < 0 ||
    score > MAX_REASONABLE_SCORE[gameType]
  ) {
    return { ok: false, reason: "invalid", message: "잘못된 점수입니다." };
  }

  const sb = createSupabaseServiceClient();

  // 본인 학생 행
  const { data: student } = await sb
    .from("garden_students")
    .select("id")
    .eq("branch_id", payload.branchId)
    .eq("external_student_id", payload.studentLocalId)
    .maybeSingle();

  if (!student?.id) {
    return {
      ok: false,
      reason: "no_student",
      message: "학생 정보를 찾을 수 없어요.",
    };
  }
  const studentId = student.id as string;

  // 일일 한도 체크 — 게임별 독립
  const { data: todayCountRaw } = await sb.rpc("get_today_play_count", {
    p_student_id: studentId,
    p_game_type: gameType,
  });
  const todayCount = typeof todayCountRaw === "number" ? todayCountRaw : 0;
  if (todayCount >= DAILY_PLAY_LIMIT) {
    return {
      ok: false,
      reason: "limit",
      message: "오늘은 더 이상 플레이할 수 없어요.",
    };
  }

  const expEarned = Math.max(
    MIN_EXP,
    Math.min(MAX_EXP, Math.floor(score * EXP_RATE)),
  );

  // 플레이 기록
  const { error: insertErr } = await sb.from("game_plays").insert({
    student_id: studentId,
    branch_id: payload.branchId,
    game_type: gameType,
    score,
    exp_earned: expEarned,
  });
  if (insertErr) {
    return {
      ok: false,
      reason: "invalid",
      message: `기록 저장 실패: ${insertErr.message}`,
    };
  }

  // 활성 몬스터 EXP 누적 + 단계 진화 체크
  const { data: activeMonsterRaw } = await sb
    .from("student_monsters")
    .select("id, species_id, current_exp, current_stage")
    .eq("student_id", studentId)
    .eq("is_evolved", false)
    .maybeSingle();

  if (!activeMonsterRaw) {
    return {
      ok: false,
      reason: "no_monster",
      message: "활성 몬스터알이 없어요. 알 선택 화면으로 이동해주세요.",
    };
  }
  const activeMonster = activeMonsterRaw as {
    id: string;
    species_id: string;
    current_exp: number;
    current_stage: number;
  };

  const newExp = activeMonster.current_exp + expEarned;

  const { data: stagesRaw } = await sb
    .from("monster_stage_images")
    .select("stage, required_exp, image_url")
    .eq("species_id", activeMonster.species_id)
    .order("stage", { ascending: true });
  const stages = (stagesRaw ?? []) as Array<{
    stage: number;
    required_exp: number;
    image_url: string | null;
  }>;

  // image_url 은 선택적 — 없으면 fallback 이모지 사용.
  let targetStage = activeMonster.current_stage;
  for (const s of stages) {
    if (s.stage > targetStage && s.required_exp <= newExp) {
      targetStage = s.stage;
    }
  }

  const stageUp = targetStage > activeMonster.current_stage;
  const finalEvolution = stageUp && targetStage >= 5;

  const monsterPatch: Record<string, unknown> = { current_exp: newExp };
  if (stageUp) {
    monsterPatch.current_stage = targetStage;
    if (finalEvolution) {
      monsterPatch.is_evolved = true;
      monsterPatch.evolved_at = new Date().toISOString();
    }
  }
  await sb
    .from("student_monsters")
    .update(monsterPatch)
    .eq("id", activeMonster.id);

  // 월간 베스트 갱신 — 게임별 별도 키 (student × game × month UNIQUE).
  const monthKey = new Date()
    .toLocaleString("sv-SE", { timeZone: "Asia/Seoul" })
    .slice(0, 7);

  const { data: existingRanking } = await sb
    .from("game_rankings")
    .select("id, best_score")
    .eq("student_id", studentId)
    .eq("game_type", gameType)
    .eq("month", monthKey)
    .maybeSingle();

  let isNewBest = false;
  if (existingRanking) {
    if (score > (existingRanking.best_score as number)) {
      await sb
        .from("game_rankings")
        .update({
          best_score: score,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existingRanking.id);
      isNewBest = true;
    }
  } else {
    await sb.from("game_rankings").insert({
      student_id: studentId,
      branch_id: payload.branchId,
      game_type: gameType,
      best_score: score,
      month: monthKey,
    });
    isNewBest = score > 0;
  }

  revalidatePath("/me/game-center");
  revalidatePath("/me");

  return {
    ok: true,
    gameType,
    score,
    expEarned,
    newExp,
    stageUp,
    fromStage: activeMonster.current_stage,
    toStage: targetStage,
    finalEvolution,
    isNewBest,
    remainingToday: Math.max(DAILY_PLAY_LIMIT - (todayCount + 1), 0),
  };
}

export async function recordInfiniteStairsPlayAction(args: {
  score: number;
}): Promise<PlayResult> {
  return recordGamePlay("infinite_stairs", args.score);
}

export async function recordSkyShooterPlayAction(args: {
  score: number;
}): Promise<PlayResult> {
  return recordGamePlay("sky_shooter", args.score);
}
