// /tree/me — 로그인된 학생 본인의 나무/포인트/사과 수 표시.
// monster-site 의 계정 발급 시 garden_students 에 (branch_id, external_student_id) upsert 되었으므로
// JWT 의 두 값을 키로 개인 행을 조회한다.
//
// 서버에서 최초 1회 패치 후, 클라이언트에서 Realtime 구독으로
// 포인트/단계/사과 수 변화를 새로고침 없이 반영한다 (MeTreeClient).
//
// Phase 2: 이번 달 적립 로그 + 모든 수확 기록도 함께 SSR 으로 주입한다.
// Claim flow: garden_pending_points (받기 대기열) 도 함께 주입.

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { STUDENT_COOKIE_NAME, verifyStudentJwt } from '@/lib/student-jwt';
import { createSupabaseServerAnonClient, createSupabaseServiceClient } from '@/lib/supabase/server';
import { MeTreeClient } from './MeTreeClient';
import type { WeatherType, DecorationItem, StudentYardItem } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function MyTreePage() {
  const token = cookies().get(STUDENT_COOKIE_NAME)?.value;
  const payload = await verifyStudentJwt(token);
  if (!payload) redirect('https://www.themonster.kr/login');

  const sb = createSupabaseServerAnonClient();
  const { data: row } = await sb
    .from('garden_students')
    .select('id, total_points, current_stage, apples_harvested, grade, avatar, background, mood_text')
    .eq('branch_id', payload!.branchId)
    .eq('external_student_id', payload!.studentLocalId)
    .maybeSingle();

  // 나무 단계별 이미지 — SSR 으로 미리 가져와 client 첫 렌더부터 적용 (SVG flash 방지)
  const { data: treeStages } = await sb
    .from('garden_tree_stages')
    .select('stage, image_url, scale, offset_x, offset_y, updated_at')
    .order('stage', { ascending: true });

  let pointLogs: Array<{ id: string; points: number; reason: string | null; logged_at: string }> = [];
  let harvests: Array<{ id: string; apples_count: number; harvested_at: string }> = [];
  let pendingPoints: Array<{ id: string; points: number; reason: string | null; created_at: string }> = [];
  let weather: WeatherType = 'none';
  let decorationItems: DecorationItem[] = [];
  let yardLayout: StudentYardItem[] = [];
  let yardBackgroundImage: string | null = null;

  {
    // 마당 글로벌 배경 — 모든 학생 공통. anon read 가능.
    const { data: yardSettings } = await sb
      .from('yard_settings')
      .select('background_image')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    yardBackgroundImage = (yardSettings?.background_image as string | null) ?? null;
  }

  if (row) {
    const sbService = createSupabaseServiceClient();
    const [weatherResult, itemsResult, layoutResult] = await Promise.all([
      sbService
        .from('student_weather_setting')
        .select('weather_type')
        .eq('student_id', row.id)
        .maybeSingle(),
      // 학생이 배치할 수 있는 모든 활성 소품 — 카테고리/생성순.
      sbService
        .from('decoration_items')
        .select('id, name, image_url, category, price, default_width_percent, is_active, created_at, updated_at')
        .eq('is_active', true)
        .order('category', { ascending: true })
        .order('created_at', { ascending: false }),
      // 학생이 이미 배치해둔 소품 (z_index 순).
      sbService
        .from('student_yard_layout')
        .select('id, student_id, decoration_item_id, instance_id, position_x, position_y, width_percent, rotation, z_index, placed_at')
        .eq('student_id', row.id)
        .order('z_index', { ascending: true }),
    ]);
    if (weatherResult.data?.weather_type) {
      weather = weatherResult.data.weather_type as WeatherType;
    }
    decorationItems = (itemsResult.data ?? []) as DecorationItem[];
    yardLayout = (layoutResult.data ?? []) as StudentYardItem[];
  }

  if (row) {
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const [logsResult, harvestsResult, pendingResult] = await Promise.all([
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
      sb
        .from('garden_pending_points')
        .select('id, points, reason, created_at')
        .eq('student_id', row.id)
        .order('created_at', { ascending: true })
        .limit(50),
    ]);
    pointLogs = logsResult.data ?? [];
    harvests = harvestsResult.data ?? [];
    pendingPoints = pendingResult.data ?? [];
  }

  return (
    <MeTreeClient
      initialRow={row ?? null}
      studentName={payload!.name}
      initialPointLogs={pointLogs}
      initialHarvests={harvests}
      initialPending={pendingPoints}
      initialTreeStages={treeStages ?? []}
      initialWeather={weather}
      initialDecorationItems={decorationItems}
      initialYardLayout={yardLayout}
      yardBackgroundImage={yardBackgroundImage}
    />
  );
}
