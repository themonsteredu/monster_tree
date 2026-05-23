// /tree/me/collection — 학생 몬스터 도감.
// 모든 활성 종을 그리드로 보여주고, 학생이 진화시킨 종은 컬러 + 이름 + 획득일,
// 미수집 종은 실루엣 + ??? + 자물쇠.

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { STUDENT_COOKIE_NAME, verifyStudentJwt } from "@/lib/student-jwt";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import type { MonsterSpecies, StudentMonster } from "@/lib/types";
import { CollectionClient, type CollectionEntry } from "./CollectionClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function CollectionPage() {
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
  if (!studentRow?.id) redirect("/me");
  const studentId = studentRow.id as string;

  // 활성 종 전체 (도감 슬롯 목록)
  const { data: speciesRows } = await sb
    .from("monster_species")
    .select(
      "id, name, emoji, description, display_order, is_active, hide_name, created_at, updated_at",
    )
    .eq("is_active", true)
    .order("display_order", { ascending: true });
  const allSpecies = (speciesRows ?? []) as MonsterSpecies[];

  // 학생이 진화 완료한 몬스터 — 시간순.
  const { data: evolvedRows } = await sb
    .from("student_monsters")
    .select(
      "id, student_id, species_id, nickname, current_exp, current_stage, is_evolved, selected_at, evolved_at",
    )
    .eq("student_id", studentId)
    .eq("is_evolved", true)
    .order("evolved_at", { ascending: true });
  const evolved = (evolvedRows ?? []) as StudentMonster[];

  // 종별로 첫 진화 (가장 이른 evolved_at) 만 집계 + 그 시점의 전체 진화 순번.
  const firstBySpecies = new Map<string, { rank: number; evolvedAt: string }>();
  evolved.forEach((m, i) => {
    if (!firstBySpecies.has(m.species_id)) {
      firstBySpecies.set(m.species_id, {
        rank: i + 1, // i+1 번째로 키워서 완성
        evolvedAt: m.evolved_at ?? m.selected_at,
      });
    }
  });

  const entries: CollectionEntry[] = allSpecies.map((sp) => {
    const f = firstBySpecies.get(sp.id);
    return {
      species: sp,
      collected: !!f,
      rank: f?.rank ?? null,
      evolvedAt: f?.evolvedAt ?? null,
    };
  });

  const collectedCount = entries.filter((e) => e.collected).length;

  return (
    <CollectionClient
      studentName={payload.name}
      entries={entries}
      collectedCount={collectedCount}
      totalCount={allSpecies.length}
    />
  );
}
