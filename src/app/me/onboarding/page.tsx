// /tree/me/onboarding — 새 몬스터알 받기.
// 흐름:
//   - 첫 진입(가입 직후) : "🥚 어떤 친구가 들어있을까요?" + 닉네임 입력
//   - 진화 직후 진입     : "🎉 OO몬을 발견했다!" 축하 화면 + 새 알 닉네임 입력
// 종은 학생이 고르지 않음 — 서버가 무작위 배정 (startRandomEggAction).

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { STUDENT_COOKIE_NAME, verifyStudentJwt } from "@/lib/student-jwt";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import type { MonsterSpecies, StudentMonster } from "@/lib/types";
import { NewEggClient } from "./NewEggClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function OnboardingPage() {
  const token = cookies().get(STUDENT_COOKIE_NAME)?.value;
  const payload = await verifyStudentJwt(token);
  if (!payload) redirect("https://www.themonster.kr/login");

  const sb = createSupabaseServiceClient();

  const { data: studentRow } = await sb
    .from("garden_students")
    .select("id")
    .eq("branch_id", payload.branchId)
    .eq("external_student_id", payload.studentLocalId)
    .maybeSingle();

  if (studentRow?.id) {
    // 이미 활성 몬스터 있으면 /me 로 돌려보냄
    const { data: existing } = await sb
      .from("student_monsters")
      .select("id")
      .eq("student_id", studentRow.id)
      .eq("is_evolved", false)
      .maybeSingle();
    if (existing?.id) {
      redirect("/me");
    }
  }

  // 활성 종이 1개도 없으면 안내 화면.
  const { data: anyActive } = await sb
    .from("monster_species")
    .select("id")
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();
  const noActiveSpecies = !anyActive;

  // 가장 최근에 진화한 몬스터 — 축하 메시지용. 최근 10분 이내일 때만 fresh 로 표시.
  let recentlyEvolved: (StudentMonster & { species: MonsterSpecies }) | null =
    null;
  let evolvedCount = 0;
  if (studentRow?.id) {
    const { count } = await sb
      .from("student_monsters")
      .select("id", { count: "exact", head: true })
      .eq("student_id", studentRow.id)
      .eq("is_evolved", true);
    evolvedCount = count ?? 0;

    if (evolvedCount > 0) {
      const { data: lastEvolved } = await sb
        .from("student_monsters")
        .select(
          "id, student_id, species_id, nickname, current_exp, current_stage, is_evolved, selected_at, evolved_at",
        )
        .eq("student_id", studentRow.id)
        .eq("is_evolved", true)
        .order("evolved_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (lastEvolved) {
        const { data: sp } = await sb
          .from("monster_species")
          .select(
            "id, name, emoji, description, display_order, is_active, hide_name, created_at, updated_at",
          )
          .eq("id", (lastEvolved as StudentMonster).species_id)
          .maybeSingle();
        if (sp) {
          recentlyEvolved = {
            ...(lastEvolved as StudentMonster),
            species: sp as MonsterSpecies,
          };
        }
      }
    }
  }

  // 진화한 지 10분 이내면 fresh 축하 — 새로고침해도 잠시 동안 메시지 유지.
  const isFreshEvolution = (() => {
    if (!recentlyEvolved?.evolved_at) return false;
    const t = new Date(recentlyEvolved.evolved_at).getTime();
    return Date.now() - t < 10 * 60 * 1000;
  })();

  return (
    <NewEggClient
      studentName={payload.name}
      noActiveSpecies={noActiveSpecies}
      evolvedCount={evolvedCount}
      celebrateSpecies={isFreshEvolution ? recentlyEvolved!.species : null}
      celebrateMonsterNickname={
        isFreshEvolution ? recentlyEvolved!.nickname : null
      }
    />
  );
}
