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
import type {
  WeatherType,
  DecorationItem,
  StudentYardItem,
  SceneLayout,
  StudentMonster,
  MonsterStageImage,
  MonsterSpecies,
} from '@/lib/types';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function MyTreePage() {
  const token = cookies().get(STUDENT_COOKIE_NAME)?.value;
  const payload = await verifyStudentJwt(token);
  if (!payload) redirect('https://www.themonster.kr/login');

  const sb = createSupabaseServerAnonClient();
  const { data: row } = await sb
    .from('garden_students')
    .select('id, total_points, current_stage, apples_harvested, grade, avatar, background, mood_text, scene_layout')
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

  // ============ 몬스터 — 활성 몬스터 fetch + 자동 부화 체크 ============
  let activeMonster: StudentMonster | null = null;
  let monsterSpecies: MonsterSpecies | null = null;
  let monsterStages: MonsterStageImage[] = [];

  if (row) {
    const sbService = createSupabaseServiceClient();
    const { data: monsterRow } = await sbService
      .from('student_monsters')
      .select('id, student_id, species_id, nickname, current_exp, current_stage, is_evolved, selected_at, evolved_at')
      .eq('student_id', row.id)
      .eq('is_evolved', false)
      .maybeSingle();

    if (!monsterRow) {
      // 활성 몬스터 없음 → 알 선택 페이지로 (단, 종이 1개라도 활성 + 1단계 이미지 있을 때만 강제)
      const { data: anyEgg } = await sbService
        .from('monster_stage_images')
        .select('species_id, monster_species!inner(is_active)')
        .eq('stage', 1)
        .not('image_url', 'is', null)
        .eq('monster_species.is_active', true)
        .limit(1)
        .maybeSingle();
      if (anyEgg) {
        redirect('/me/onboarding');
      }
    } else {
      activeMonster = monsterRow as StudentMonster;

      // 몬스터의 종 + 단계 이미지 5개
      const [{ data: speciesRow }, { data: stagesRows }] = await Promise.all([
        sbService
          .from('monster_species')
          .select('id, name, description, display_order, is_active, hide_name, created_at, updated_at')
          .eq('id', activeMonster.species_id)
          .maybeSingle(),
        sbService
          .from('monster_stage_images')
          .select('id, species_id, stage, image_url, stage_name, required_exp, updated_at')
          .eq('species_id', activeMonster.species_id)
          .order('stage', { ascending: true }),
      ]);
      monsterSpecies = (speciesRow as MonsterSpecies | null) ?? null;
      monsterStages = (stagesRows ?? []) as MonsterStageImage[];

      // 자동 부화: current_exp 와 image_url 둘 다 충족하는 최고 단계로.
      const targetStage = (() => {
        let best = activeMonster.current_stage;
        for (const s of monsterStages) {
          if (s.stage > best && s.required_exp <= activeMonster.current_exp && s.image_url) {
            best = s.stage;
          }
        }
        return best;
      })();

      if (targetStage > activeMonster.current_stage) {
        const reachedFinal = targetStage >= 5;
        const patch: Record<string, unknown> = {
          current_stage: targetStage,
        };
        if (reachedFinal) {
          patch.is_evolved = true;
          patch.evolved_at = new Date().toISOString();
        }
        await sbService.from('student_monsters').update(patch).eq('id', activeMonster.id);
        // 로컬 상태 갱신
        activeMonster = { ...activeMonster, current_stage: targetStage, ...(reachedFinal ? { is_evolved: true, evolved_at: new Date().toISOString() } : {}) };
        // 5단계 도달 → 활성 몬스터 사라짐 → 알 선택 페이지로
        if (reachedFinal) {
          redirect('/me/onboarding');
        }
      }
    }
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
      initialSceneLayout={(row?.scene_layout as SceneLayout | null) ?? null}
      initialMonster={activeMonster}
      initialMonsterSpecies={monsterSpecies}
      initialMonsterStages={monsterStages}
    />
  );
}
