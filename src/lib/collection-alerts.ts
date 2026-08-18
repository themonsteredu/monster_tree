// 도감 마일스톤 알림 — 학생이 도감(진화 완료 몬스터)을 기준 개수(7종)만큼
// 모으면 관리자 알림함(garden_admin_alerts)에 한 건 쌓는다.
//
// 호출 위치: is_evolved 를 true 로 바꾸는 두 곳 —
//   · 게임센터 플레이 기록 액션 (src/app/me/game-center/actions.ts)
//   · /me 페이지의 자동 부화 캐치업 (src/app/me/page.tsx)
// 실패해도 본 기능(게임 기록·진화)을 막지 않도록 전부 try/catch 로 감싼다.

import type { SupabaseClient } from "@supabase/supabase-js";
import { COLLECTION_ALERT_THRESHOLDS } from "@/lib/types";

/**
 * 방금 진화가 완료된 학생의 도감 종 수를 세어, 기준(7종·20종)에 도달했으면
 * 관리자 알림을 기록한다. 같은 학생·같은 기준은 unique 인덱스 덕에 1회만 기록된다.
 */
export async function maybeRecordCollectionMilestone(
  sb: SupabaseClient,
  params: { studentId: string; branchId: string },
): Promise<void> {
  try {
    const { data: evolvedRows } = await sb
      .from("student_monsters")
      .select("species_id")
      .eq("student_id", params.studentId)
      .eq("is_evolved", true);

    const speciesSet = new Set<string>();
    (evolvedRows ?? []).forEach((r: { species_id: string | null }) => {
      if (r.species_id) speciesSet.add(r.species_id);
    });
    const reached = COLLECTION_ALERT_THRESHOLDS.filter((t) => speciesSet.size >= t);
    if (reached.length === 0) return;

    // 표시용 학생 이름 (실패해도 알림 자체는 기록)
    let studentName: string | null = null;
    try {
      const { data: stu } = await sb
        .from("garden_students")
        .select("name")
        .eq("id", params.studentId)
        .maybeSingle();
      studentName = (stu as { name?: string } | null)?.name ?? null;
    } catch {
      /* 이름 조회 실패는 무시 */
    }

    // unique (student_id, type, threshold) — 이미 있으면 조용히 무시
    await sb.from("garden_admin_alerts").upsert(
      reached.map((threshold) => ({
        branch_id: params.branchId,
        student_id: params.studentId,
        type: "collection_milestone",
        threshold,
        payload: { student_name: studentName, species_count: speciesSet.size },
      })),
      { onConflict: "student_id,type,threshold", ignoreDuplicates: true },
    );
  } catch {
    /* 알림 기록 실패는 조용히 무시 — 게임 기록/진화를 막지 않는다 */
  }
}
