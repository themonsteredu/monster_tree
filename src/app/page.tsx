// 로비 TV 화면 (가로 풀스크린, 1920x1080 가정)
// 지점 선택:
//   1) ?branch=br_xxx URL 쿼리 (monster-site 핸드오프 — 우선)
//   2) BRANCH_ID env (deployment 고정)
// 둘 다 없으면 안내 배너.

import { TVScreen } from "./TVScreen";
import { createSupabaseServerAnonClient, createSupabaseServiceClient } from "@/lib/supabase/server";
import { getBranchId } from "@/lib/branch";
import type {
  GardenStudent,
  DecorationItem,
  StudentYardItem,
  WeatherType,
  StudentMonster,
  MonsterSpecies,
  MonsterStageImage,
  SceneLayout,
} from "@/lib/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function Page({
  searchParams,
}: {
  searchParams: { branch?: string };
}) {
  let initialStudents: GardenStudent[] = [];
  let initialTodayHarvest = 0;
  let envMissing = false;

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    envMissing = true;
  }

  const queryBranch = searchParams.branch?.trim();
  const branchId = queryBranch && queryBranch.length > 0 ? queryBranch : getBranchId();

  if (envMissing) {
    return <EnvMissingNotice />;
  }
  if (!branchId) {
    return <BranchMissingNotice />;
  }

  const sb = createSupabaseServerAnonClient();
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  // 1단계: 지점 학생
  const { data: students } = await sb
    .from("garden_students")
    .select("*")
    .eq("branch_id", branchId)
    .eq("is_active", true)
    .order("total_points", { ascending: false });

  initialStudents = (students ?? []) as GardenStudent[];
  const branchStudentIds = initialStudents.map((s) => s.id);

  // 나무 단계별 이미지 — SSR 으로 미리 가져와 첫 렌더부터 적용 (SVG flash 방지)
  const { data: treeStages } = await sb
    .from("garden_tree_stages")
    .select("stage, image_url, scale, offset_x, offset_y, updated_at")
    .order("stage", { ascending: true });

  // 2단계: 지점 학생의 오늘 수확
  if (branchStudentIds.length > 0) {
    const { data: harvests } = await sb
      .from("garden_harvests")
      .select("apples_count")
      .in("student_id", branchStudentIds)
      .gte("harvested_at", todayStart.toISOString());
    initialTodayHarvest = (harvests ?? []).reduce(
      (acc, h) => acc + (h.apples_count ?? 0),
      0,
    );
  }

  // ============ TV 마이룸 풀 렌더용 — 학생별 yard 데이터 batch fetch ============
  // 활성/비활성 학생 분리: 활성 학생들에만 yard 디테일 가져옴 (스포트라이트 노출 대상).
  let yardBackgroundImage: string | null = null;
  let decorationItems: DecorationItem[] = [];
  const yardLayoutByStudent: Record<string, StudentYardItem[]> = {};
  const weatherByStudent: Record<string, WeatherType> = {};
  const activeMonsterByStudent: Record<string, StudentMonster> = {};
  const evolvedMonstersByStudent: Record<string, StudentMonster[]> = {};
  const sceneLayoutByStudent: Record<string, SceneLayout | null> = {};
  let monsterSpeciesById: Record<string, MonsterSpecies> = {};
  let monsterStagesBySpecies: Record<string, MonsterStageImage[]> = {};

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

    // 등장한 species 들의 메타 + 단계 이미지
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

  return (
    <TVScreen
      initialStudents={initialStudents}
      initialTodayHarvest={initialTodayHarvest}
      branchId={branchId}
      initialTreeStages={treeStages ?? []}
      yardBackgroundImage={yardBackgroundImage}
      decorationItems={decorationItems}
      yardLayoutByStudent={yardLayoutByStudent}
      weatherByStudent={weatherByStudent}
      activeMonsterByStudent={activeMonsterByStudent}
      evolvedMonstersByStudent={evolvedMonstersByStudent}
      sceneLayoutByStudent={sceneLayoutByStudent}
      monsterSpeciesById={monsterSpeciesById}
      monsterStagesBySpecies={monsterStagesBySpecies}
    />
  );
}

function EnvMissingNotice() {
  return (
    <main className="min-h-screen flex items-center justify-center p-10">
      <div className="max-w-2xl rounded-3xl bg-white shadow-card p-10 text-center">
        <div className="text-6xl mb-4">🪴</div>
        <h1 className="text-2xl font-bold mb-3">사과정원 준비가 거의 끝났어요!</h1>
        <p className="text-ink-soft leading-relaxed">
          Supabase 환경변수가 아직 설정되지 않았어요.
          <br />
          프로젝트 루트의 <code className="bg-cream-deep px-2 py-0.5 rounded">.env.local</code> 파일을 열어
          <br />
          <code className="bg-cream-deep px-2 py-0.5 rounded mt-2 inline-block">NEXT_PUBLIC_SUPABASE_URL</code> 과
          <code className="bg-cream-deep px-2 py-0.5 rounded ml-2">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> 를 채워주세요.
        </p>
        <p className="text-sm text-ink-soft mt-6">
          README.md 의 "환경변수 설정" 섹션을 참고하시면 한 번에 따라하실 수 있어요.
        </p>
      </div>
    </main>
  );
}

function BranchMissingNotice() {
  return (
    <main className="min-h-screen flex items-center justify-center p-10">
      <div className="max-w-xl rounded-3xl bg-[#fef2f0] border-[2.5px] border-[var(--apple-deep)] p-8 text-center">
        <div className="text-5xl mb-3">⚠️</div>
        <h1 className="text-xl font-extrabold text-[var(--apple-deep)] mb-2">
          어떤 지점 TV 인지 모르겠어요
        </h1>
        <p className="text-sm text-[var(--ink)] leading-relaxed">
          URL 에 <code className="px-1.5 py-0.5 bg-white rounded">?branch=br_xxx</code> 를 붙이거나,
          <br />
          Vercel 프로젝트 설정에서 <code className="px-1.5 py-0.5 bg-white rounded">BRANCH_ID</code> env 를 추가해주세요.
          <br />
          본사 (monster-site) "몬스터 트리" 버튼으로 진입하면 자동으로 채워집니다.
        </p>
      </div>
    </main>
  );
}
