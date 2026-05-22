// TV 화면 SSR 데이터 로딩 헬퍼.
// /tree/ 와 /tree/tv 두 곳에서 동일한 데이터를 가져오므로 한 곳에서 관리.
// 환경변수/지점 누락 같은 안내 분기는 호출 쪽에서 처리한다.

import { createSupabaseServerAnonClient, createSupabaseServiceClient } from "@/lib/supabase/server";
import type {
  GardenStudent,
  DecorationItem,
  StudentYardItem,
  WeatherType,
  StudentMonster,
  MonsterSpecies,
  MonsterStageImage,
  SceneLayout,
  GardenTreeStage,
} from "@/lib/types";

export type TvData = {
  students: GardenStudent[];
  todayHarvest: number;
  treeStages: GardenTreeStage[];
  yardBackgroundImage: string | null;
  decorationItems: DecorationItem[];
  yardLayoutByStudent: Record<string, StudentYardItem[]>;
  weatherByStudent: Record<string, WeatherType>;
  activeMonsterByStudent: Record<string, StudentMonster>;
  evolvedMonstersByStudent: Record<string, StudentMonster[]>;
  sceneLayoutByStudent: Record<string, SceneLayout | null>;
  monsterSpeciesById: Record<string, MonsterSpecies>;
  monsterStagesBySpecies: Record<string, MonsterStageImage[]>;
};

export async function loadTvData(branchId: string): Promise<TvData> {
  const sb = createSupabaseServerAnonClient();
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  // 1단계: 지점 학생
  const { data: studentsRows } = await sb
    .from("garden_students")
    .select("*")
    .eq("branch_id", branchId)
    .eq("is_active", true)
    .order("total_points", { ascending: false });

  const students = (studentsRows ?? []) as GardenStudent[];
  const branchStudentIds = students.map((s) => s.id);

  // 나무 단계별 이미지 — SSR 으로 미리 가져와 첫 렌더부터 적용 (SVG flash 방지)
  const { data: treeStagesRows } = await sb
    .from("garden_tree_stages")
    .select("stage, image_url, scale, offset_x, offset_y, updated_at")
    .order("stage", { ascending: true });

  // 2단계: 지점 학생의 오늘 수확
  let todayHarvest = 0;
  if (branchStudentIds.length > 0) {
    const { data: harvests } = await sb
      .from("garden_harvests")
      .select("apples_count")
      .in("student_id", branchStudentIds)
      .gte("harvested_at", todayStart.toISOString());
    todayHarvest = (harvests ?? []).reduce(
      (acc, h) => acc + (h.apples_count ?? 0),
      0,
    );
  }

  // ============ 마이룸 풀 렌더용 batch fetch ============
  let yardBackgroundImage: string | null = null;
  let decorationItems: DecorationItem[] = [];
  const yardLayoutByStudent: Record<string, StudentYardItem[]> = {};
  const weatherByStudent: Record<string, WeatherType> = {};
  const activeMonsterByStudent: Record<string, StudentMonster> = {};
  const evolvedMonstersByStudent: Record<string, StudentMonster[]> = {};
  const sceneLayoutByStudent: Record<string, SceneLayout | null> = {};
  const monsterSpeciesById: Record<string, MonsterSpecies> = {};
  const monsterStagesBySpecies: Record<string, MonsterStageImage[]> = {};

  if (branchStudentIds.length > 0) {
    const sbService = createSupabaseServiceClient();
    const [yardBgRes, decoItemsRes, yardLayoutRes, weatherRes, monstersRes, sceneLayoutRes] =
      await Promise.all([
        sb
          .from("yard_settings")
          .select("background_image")
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle(),
        sb
          .from("decoration_items")
          .select("id, name, image_url, category, price, default_width_percent, is_active, created_at, updated_at")
          .eq("is_active", true),
        sbService
          .from("student_yard_layout")
          .select("id, student_id, decoration_item_id, instance_id, position_x, position_y, width_percent, rotation, z_index, placed_at")
          .in("student_id", branchStudentIds),
        sbService
          .from("student_weather_setting")
          .select("student_id, weather_type")
          .in("student_id", branchStudentIds),
        sbService
          .from("student_monsters")
          .select("id, student_id, species_id, nickname, current_exp, current_stage, is_evolved, selected_at, evolved_at")
          .in("student_id", branchStudentIds),
        sb
          .from("garden_students")
          .select("id, scene_layout")
          .in("id", branchStudentIds),
      ]);

    yardBackgroundImage = (yardBgRes.data?.background_image as string | null) ?? null;
    decorationItems = (decoItemsRes.data ?? []) as DecorationItem[];

    for (const r of (yardLayoutRes.data ?? []) as StudentYardItem[]) {
      const arr = yardLayoutByStudent[r.student_id] ?? [];
      arr.push(r);
      yardLayoutByStudent[r.student_id] = arr;
    }
    for (const sid in yardLayoutByStudent) {
      yardLayoutByStudent[sid].sort((a, b) => a.z_index - b.z_index);
    }

    for (const r of (weatherRes.data ?? []) as { student_id: string; weather_type: string }[]) {
      weatherByStudent[r.student_id] = r.weather_type as WeatherType;
    }

    const allMonsters = (monstersRes.data ?? []) as StudentMonster[];
    for (const m of allMonsters) {
      if (m.is_evolved) {
        const arr = evolvedMonstersByStudent[m.student_id] ?? [];
        arr.push(m);
        evolvedMonstersByStudent[m.student_id] = arr;
      } else {
        activeMonsterByStudent[m.student_id] = m;
      }
    }

    for (const r of (sceneLayoutRes.data ?? []) as Array<{ id: string; scene_layout: SceneLayout | null }>) {
      sceneLayoutByStudent[r.id] = r.scene_layout ?? null;
    }

    const speciesIds = Array.from(new Set(allMonsters.map((m) => m.species_id)));
    if (speciesIds.length > 0) {
      const [spRes, stRes] = await Promise.all([
        sb
          .from("monster_species")
          .select("id, name, description, display_order, is_active, hide_name, created_at, updated_at")
          .in("id", speciesIds),
        sb
          .from("monster_stage_images")
          .select("id, species_id, stage, image_url, stage_name, required_exp, updated_at")
          .in("species_id", speciesIds),
      ]);
      for (const sp of (spRes.data ?? []) as MonsterSpecies[]) {
        monsterSpeciesById[sp.id] = sp;
      }
      for (const st of (stRes.data ?? []) as MonsterStageImage[]) {
        const arr = monsterStagesBySpecies[st.species_id] ?? [];
        arr.push(st);
        monsterStagesBySpecies[st.species_id] = arr;
      }
      for (const sid in monsterStagesBySpecies) {
        monsterStagesBySpecies[sid].sort((a, b) => a.stage - b.stage);
      }
    }
  }

  return {
    students,
    todayHarvest,
    treeStages: (treeStagesRows ?? []) as GardenTreeStage[],
    yardBackgroundImage,
    decorationItems,
    yardLayoutByStudent,
    weatherByStudent,
    activeMonsterByStudent,
    evolvedMonstersByStudent,
    sceneLayoutByStudent,
    monsterSpeciesById,
    monsterStagesBySpecies,
  };
}
