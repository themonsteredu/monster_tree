// /tree/me — 로그인된 학생 본인의 나무/포인트/사과 수 표시.
// monster-site 의 계정 발급 시 garden_students 에 (branch_id, external_student_id) upsert 되었으므로
// JWT 의 두 값을 키로 개인 행을 조회한다.
//
// 서버에서 최초 1회 패치 후, 클라이언트에서 Realtime 구독으로
// 포인트/단계/사과 수 변화를 새로고침 없이 반영한다 (MeTreeClient).
//
// Phase 2: 이번 달 적립 로그 + 모든 수확 기록도 함께 SSR 으로 주입한다.
// 클라이언트는 이 데이터로 "이번 주/이번 달 통계" 와 "최근 활동 타임라인",
// "수확 히스토리" 를 그린다.

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { STUDENT_COOKIE_NAME, verifyStudentJwt } from '@/lib/student-jwt';
import { createSupabaseServerAnonClient } from '@/lib/supabase/server';
import { MeTreeClient } from './MeTreeClient';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function MyTreePage() {
  const token = cookies().get(STUDENT_COOKIE_NAME)?.value;
  const payload = await verifyStudentJwt(token);
  if (!payload) redirect('https://www.themonster.kr/login');

  const sb = createSupabaseServerAnonClient();
  const { data: row } = await sb
    .from('garden_students')
    .select('id, total_points, current_stage, apples_harvested, grade')
    .eq('branch_id', payload!.branchId)
    .eq('external_student_id', payload!.studentLocalId)
    .maybeSingle();

  let pointLogs: Array<{ id: string; points: number; reason: string | null; logged_at: string }> = [];
  let harvests: Array<{ id: string; apples_count: number; harvested_at: string }> = [];

  if (row) {
    // 이번 달 1일 00:00 부터의 로그를 가져와 클라이언트에서 주간/월간 통계 계산.
    // 학생당 월별 로그가 일반적으로 100건을 넘기 어려우므로 한 번에 다 가져온다.
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const [logsResult, harvestsResult] = await Promise.all([
      sb
        .from('garden_point_logs')
        .select('id, points, reason, logged_at')
        .eq('student_id', row.id)
        .gte('logged_at', monthStart.toISOString())
        .order('logged_at', { ascending: false })
        .limit(200),
      sb
        .from('garden_harvests')
        .select('id, apples_count, harvested_at')
        .eq('student_id', row.id)
        .order('harvested_at', { ascending: false })
        .limit(50),
    ]);
    pointLogs = logsResult.data ?? [];
    harvests = harvestsResult.data ?? [];
  }

  return (
    <MeTreeClient
      initialRow={row ?? null}
      studentName={payload!.name}
      initialPointLogs={pointLogs}
      initialHarvests={harvests}
    />
  );
}
