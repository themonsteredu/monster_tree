// 로비 TV 화면 (가로 풀스크린, 1920x1080 가정)
// - 학생을 누적 포인트 높은 순으로 정렬해 12명씩 그리드 표시
// - 12명을 넘으면 15초마다 자동 페이지 전환
// - Supabase Realtime 으로 garden_students / garden_point_logs 변경 감지
//   → 방금 업데이트된 학생은 3초간 강조, 단계 상승 시 5초 배너

import { TVScreen } from "./TVScreen";
import { createSupabaseServerAnonClient } from "@/lib/supabase/server";
import type { GardenStudent } from "@/lib/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function Page() {
  // 첫 페인트는 SSR 로 빠르게 (이후 클라이언트에서 Realtime 구독)
  let initialStudents: GardenStudent[] = [];
  let initialTodayHarvest = 0;
  let envMissing = false;

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    envMissing = true;
  } else {
    const sb = createSupabaseServerAnonClient();
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [{ data: students }, { data: harvests }] = await Promise.all([
      sb
        .from("garden_students")
        .select("*")
        .eq("is_active", true)
        .order("total_points", { ascending: false }),
      sb
        .from("garden_harvests")
        .select("apples_count")
        .gte("harvested_at", todayStart.toISOString()),
    ]);
    initialStudents = (students ?? []) as GardenStudent[];
    initialTodayHarvest = (harvests ?? []).reduce(
      (acc, h) => acc + (h.apples_count ?? 0),
      0,
    );
  }

  if (envMissing) {
    return <EnvMissingNotice />;
  }

  return (
    <TVScreen
      initialStudents={initialStudents}
      initialTodayHarvest={initialTodayHarvest}
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
          README.md 의 “환경변수 설정” 섹션을 참고하시면 한 번에 따라하실 수 있어요.
        </p>
      </div>
    </main>
  );
}
