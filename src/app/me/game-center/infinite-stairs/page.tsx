// /tree/me/game-center/infinite-stairs — 무한의계단 게임 라우트.
// SSR 가드: 학생 인증 + 일일 한도 + 활성 몬스터 존재 확인.

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { STUDENT_COOKIE_NAME, verifyStudentJwt } from "@/lib/student-jwt";
import {
  createSupabaseServerAnonClient,
  createSupabaseServiceClient,
} from "@/lib/supabase/server";
import {
  DAILY_PLAY_LIMIT,
  type AvatarConfig,
  type StudentMonster,
} from "@/lib/types";
import { InfiniteStairsGame } from "./InfiniteStairsGame";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const GAME_TYPE = "infinite_stairs";

export default async function InfiniteStairsPage() {
  const token = cookies().get(STUDENT_COOKIE_NAME)?.value;
  const payload = await verifyStudentJwt(token);
  if (!payload) redirect("https://www.themonster.kr/login");

  const sb = createSupabaseServiceClient();
  const sbAnon = createSupabaseServerAnonClient();

  const { data: studentRow } = await sbAnon
    .from("garden_students")
    .select("id, avatar")
    .eq("branch_id", payload.branchId)
    .eq("external_student_id", payload.studentLocalId)
    .maybeSingle();

  if (!studentRow?.id) redirect("/me/village");
  const studentId = studentRow.id as string;
  const avatarConfig = (studentRow.avatar as AvatarConfig | null) ?? null;

  // 활성 몬스터 없으면 알 선택 페이지로
  const { data: activeRaw } = await sb
    .from("student_monsters")
    .select(
      "id, student_id, species_id, nickname, current_exp, current_stage, is_evolved, selected_at, evolved_at",
    )
    .eq("student_id", studentId)
    .eq("is_evolved", false)
    .maybeSingle();
  if (!activeRaw) redirect("/me/onboarding");
  const activeMonster = activeRaw as StudentMonster;

  // 일일 한도 체크 — 다 썼으면 허브로
  const { data: todayCountRaw } = await sb.rpc("get_today_play_count", {
    p_student_id: studentId,
    p_game_type: GAME_TYPE,
  });
  const todayCount =
    typeof todayCountRaw === "number" ? todayCountRaw : 0;
  if (todayCount >= DAILY_PLAY_LIMIT) redirect("/me/game-center");

  return (
    <InfiniteStairsGame
      remainingBefore={Math.max(DAILY_PLAY_LIMIT - todayCount, 0)}
      avatarConfig={avatarConfig}
      monsterNickname={activeMonster.nickname}
    />
  );
}
