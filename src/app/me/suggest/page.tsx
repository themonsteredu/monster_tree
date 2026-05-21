// /me/suggest — 학생 건의함.
// JWT 검증 후 학생 행 + 내 건의글 + 차단 상태를 SSR 로 가져와 클라이언트에 전달.

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { STUDENT_COOKIE_NAME, verifyStudentJwt } from "@/lib/student-jwt";
import {
  createSupabaseServerAnonClient,
  createSupabaseServiceClient,
} from "@/lib/supabase/server";
import type { GardenSuggestion, SuggestionBlock } from "@/lib/types";
import { SuggestClient } from "./SuggestClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function SuggestPage() {
  const token = cookies().get(STUDENT_COOKIE_NAME)?.value;
  const payload = await verifyStudentJwt(token);
  if (!payload) redirect("https://www.themonster.kr/login");

  // student_id 확인 (anon 권한으로 충분)
  const sb = createSupabaseServerAnonClient();
  const { data: student } = await sb
    .from("garden_students")
    .select("id")
    .eq("branch_id", payload!.branchId)
    .eq("external_student_id", payload!.studentLocalId)
    .maybeSingle();

  const studentId = (student?.id as string | undefined) ?? null;

  let mySuggestions: GardenSuggestion[] = [];
  let activeBlock: SuggestionBlock | null = null;

  if (studentId) {
    // 내 글 + 차단 정보 병렬 조회. 차단 테이블은 service_role 로만 안전하게 읽어도 되지만
    // RLS read 가 모두 허용이라 anon 으로도 가능.
    const sbSvc = createSupabaseServiceClient();
    const [{ data: rows }, { data: block }] = await Promise.all([
      sbSvc
        .from("garden_suggestions")
        .select(
          "id, branch_id, student_id, student_name_snapshot, is_anonymous, category, title, body, status, reply, replied_at, created_at, updated_at",
        )
        .eq("student_id", studentId)
        .order("created_at", { ascending: false })
        .limit(30),
      sbSvc
        .from("garden_suggestion_blocks")
        .select("id, student_id, branch_id, reason, blocked_at, blocked_until, blocked_by")
        .eq("student_id", studentId)
        .maybeSingle(),
    ]);

    mySuggestions = (rows ?? []) as GardenSuggestion[];

    if (block) {
      const b = block as SuggestionBlock;
      const nowIso = new Date().toISOString();
      if (!b.blocked_until || b.blocked_until > nowIso) {
        activeBlock = b;
      }
    }
  }

  return (
    <SuggestClient
      studentName={payload!.name}
      mySuggestions={mySuggestions}
      activeBlock={activeBlock}
    />
  );
}
