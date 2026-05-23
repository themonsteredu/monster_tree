// /admin/collection-preview — 관리자가 학생이 보는 도감 화면 미리보기.
// 실제 학생 데이터 없이 활성 종 목록만 표시 (전부 "미수집" 상태로 노출).
// 학생별 도감을 보고 싶으면 ?student=<garden_students.id> 쿼리로 그 학생 진화 기록 적용.

import { redirect } from "next/navigation";
import { isAdminAuthenticated } from "../auth";
import { LoginForm } from "../LoginForm";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import type { MonsterSpecies, StudentMonster } from "@/lib/types";
import {
  CollectionClient,
  type CollectionEntry,
} from "@/app/me/collection/CollectionClient";
import { getAdminBranchId } from "@/lib/branch";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminCollectionPreviewPage({
  searchParams,
}: {
  searchParams: { key?: string; branch?: string; student?: string };
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

  // 활성 종 (도감 슬롯)
  const { data: speciesRows } = await sb
    .from("monster_species")
    .select(
      "id, name, emoji, description, display_order, is_active, hide_name, created_at, updated_at",
    )
    .eq("is_active", true)
    .order("display_order", { ascending: true });
  const allSpecies = (speciesRows ?? []) as MonsterSpecies[];

  // 특정 학생 도감 미리보기 — ?student=<id> 로 지정. 없으면 빈 도감.
  const studentId = searchParams.student?.trim() ?? null;
  let evolved: StudentMonster[] = [];
  let studentName = "관리자";

  if (studentId) {
    const { data: studentRow } = await sb
      .from("garden_students")
      .select("id, name")
      .eq("id", studentId)
      .eq("branch_id", branchId)
      .maybeSingle();
    if (studentRow) {
      studentName = (studentRow.name as string) ?? "학생";
      const { data: evolvedRows } = await sb
        .from("student_monsters")
        .select(
          "id, student_id, species_id, nickname, current_exp, current_stage, is_evolved, selected_at, evolved_at",
        )
        .eq("student_id", studentId)
        .eq("is_evolved", true)
        .order("evolved_at", { ascending: true });
      evolved = (evolvedRows ?? []) as StudentMonster[];
    }
  }

  // 종별 첫 진화만 집계 (도감은 중복 안 함)
  const firstBySpecies = new Map<
    string,
    { rank: number; evolvedAt: string }
  >();
  evolved.forEach((m, i) => {
    if (!firstBySpecies.has(m.species_id)) {
      firstBySpecies.set(m.species_id, {
        rank: i + 1,
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
      adminMode
      homeHref={`/admin/garden?branch=${encodeURIComponent(branchId)}`}
      studentName={studentName}
      entries={entries}
      collectedCount={collectedCount}
      totalCount={allSpecies.length}
    />
  );
}
