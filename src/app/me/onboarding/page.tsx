// /tree/me/onboarding — 학생 알 선택 화면.
// 첫 로그인 / 진화 완료 후 새 알 필요할 때 표시.
// 활성화 + 1단계 이미지가 있는 종만 보여준다.

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { STUDENT_COOKIE_NAME, verifyStudentJwt } from "@/lib/student-jwt";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import type { MonsterSpecies, MonsterStageImage } from "@/lib/types";
import { SelectEggClient } from "./SelectEggClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function OnboardingPage() {
  const token = cookies().get(STUDENT_COOKIE_NAME)?.value;
  const payload = await verifyStudentJwt(token);
  if (!payload) redirect("https://www.themonster.kr/login");

  const sb = createSupabaseServiceClient();

  // 본인 student 행
  const { data: studentRow } = await sb
    .from("garden_students")
    .select("id")
    .eq("branch_id", payload!.branchId)
    .eq("external_student_id", payload!.studentLocalId)
    .maybeSingle();

  // 이미 활성 몬스터 있으면 /me 로 돌려보냄
  if (studentRow?.id) {
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

  // 진화 완료한 몬스터 카운트 — 축하 메시지 표시 여부 결정
  let evolvedCount = 0;
  if (studentRow?.id) {
    const { count } = await sb
      .from("student_monsters")
      .select("id", { count: "exact", head: true })
      .eq("student_id", studentRow.id)
      .eq("is_evolved", true);
    evolvedCount = count ?? 0;
  }

  // 활성 종 + 1단계 이미지
  const [{ data: species }, { data: stages }] = await Promise.all([
    sb
      .from("monster_species")
      .select("id, name, description, display_order, is_active, hide_name, created_at, updated_at")
      .eq("is_active", true)
      .order("display_order", { ascending: true }),
    sb
      .from("monster_stage_images")
      .select("id, species_id, stage, image_url, stage_name, required_exp, updated_at")
      .eq("stage", 1),
  ]);

  return (
    <SelectEggClient
      studentName={payload!.name}
      species={(species ?? []) as MonsterSpecies[]}
      stage1Map={Object.fromEntries(
        ((stages ?? []) as MonsterStageImage[])
          .filter((s) => !!s.image_url)
          .map((s) => [s.species_id, s as MonsterStageImage]),
      )}
      evolvedCount={evolvedCount}
    />
  );
}
