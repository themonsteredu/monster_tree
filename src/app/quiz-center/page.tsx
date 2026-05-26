// /tree/quiz-center — 학생용 퀴즈센터 (몬스터마을 → 퀴즈 오두막).
//
// 인증:
//  - student JWT (monster_student 쿠키) → 학생 모드 (오늘 1회 / 올클 시 +1 사과포인트)
//  - admin 쿠키 (garden_admin_key) → 🛠 테스트 모드 (무제한, 기록/포인트 X)
//  - 둘 다 없으면 monster-site 로그인으로 리다이렉트

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { STUDENT_COOKIE_NAME, verifyStudentJwt } from "@/lib/student-jwt";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { isAdminAuthenticated } from "../admin/auth";
import { QuizCenterClient } from "./QuizCenterClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type RecentPlay = {
  id: string;
  played_at: string;
  correct_count: number;
  is_perfect: boolean;
  point_earned: number;
};

function todayKstMidnightUtcIso(): string {
  const nowMs = Date.now();
  const kstMs = nowMs + 9 * 3600 * 1000;
  const kstDate = new Date(kstMs);
  const y = kstDate.getUTCFullYear();
  const m = kstDate.getUTCMonth();
  const d = kstDate.getUTCDate();
  const midnightKstUtc = Date.UTC(y, m, d, 0, 0, 0) - 9 * 3600 * 1000;
  return new Date(midnightKstUtc).toISOString();
}

function sevenDaysAgoIso(): string {
  return new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
}

export default async function QuizCenterPage() {
  const token = cookies().get(STUDENT_COOKIE_NAME)?.value;
  const payload = await verifyStudentJwt(token);
  const adminAuthed = isAdminAuthenticated();

  // 학생 JWT 있으면 학생 모드, 없고 admin 쿠키만 있으면 테스트 모드, 둘 다 없으면 로그인.
  if (!payload && !adminAuthed) {
    redirect("https://www.themonster.kr/login");
  }

  const sb = createSupabaseServiceClient();

  // 학생 모드 데이터.
  let studentName: string | null = null;
  let todayPlay: RecentPlay | null = null;
  let recentPlays: RecentPlay[] = [];
  let lifetimePoints = 0;
  let streakDays = 0;

  if (payload) {
    studentName = payload.name;
    const { data: row } = await sb
      .from("garden_students")
      .select("id")
      .eq("branch_id", payload.branchId)
      .eq("external_student_id", payload.studentLocalId)
      .maybeSingle();
    const studentId = row?.id as string | undefined;

    if (studentId) {
      const [todayRes, weekRes, lifetimeRes] = await Promise.all([
        sb
          .from("quiz_plays")
          .select("id, played_at, correct_count, is_perfect, point_earned")
          .eq("student_id", studentId)
          .gte("played_at", todayKstMidnightUtcIso())
          .order("played_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        sb
          .from("quiz_plays")
          .select("id, played_at, correct_count, is_perfect, point_earned")
          .eq("student_id", studentId)
          .gte("played_at", sevenDaysAgoIso())
          .order("played_at", { ascending: false }),
        // 전체 적립 합산용 — perfect 만 1점이므로 count 도 됨.
        sb
          .from("quiz_plays")
          .select("point_earned, played_at, is_perfect")
          .eq("student_id", studentId)
          .order("played_at", { ascending: false })
          .limit(365),
      ]);

      todayPlay = (todayRes.data as RecentPlay | null) ?? null;
      recentPlays = (weekRes.data as RecentPlay[] | null) ?? [];

      const allPlays =
        (lifetimeRes.data as Array<{
          point_earned: number;
          played_at: string;
          is_perfect: boolean;
        }> | null) ?? [];

      lifetimePoints = allPlays.reduce(
        (acc, p) => acc + (p.point_earned ?? 0),
        0,
      );
      streakDays = computeStreak(allPlays);
    }
  }

  return (
    <QuizCenterClient
      studentName={studentName}
      adminMode={!payload && adminAuthed}
      today={todayPlay}
      recentWeek={recentPlays}
      lifetimePoints={lifetimePoints}
      streakDays={streakDays}
    />
  );
}

// 연속 올클 일수 — KST 기준. 오늘 미플레이면 streak 이 끊기지 않지만,
// 오늘 플레이했는데 올클 아니면 끊긴다.
function computeStreak(
  plays: Array<{ played_at: string; is_perfect: boolean }>,
): number {
  if (plays.length === 0) return 0;
  const perfectDays = new Set<string>();
  const playedDays = new Set<string>();
  for (const p of plays) {
    const k = toKstDateKey(p.played_at);
    playedDays.add(k);
    if (p.is_perfect) perfectDays.add(k);
  }
  let streak = 0;
  const now = new Date();
  for (let i = 0; i < 365; i++) {
    const dayKey = toKstDateKey(
      new Date(now.getTime() - i * 24 * 3600 * 1000).toISOString(),
    );
    if (perfectDays.has(dayKey)) {
      streak += 1;
    } else if (i === 0 && !playedDays.has(dayKey)) {
      // 오늘 미플레이 — streak 끊지 않고 어제로 넘어감.
      continue;
    } else {
      break;
    }
  }
  return streak;
}

function toKstDateKey(iso: string): string {
  const t = new Date(iso).getTime();
  const kst = new Date(t + 9 * 3600 * 1000);
  const y = kst.getUTCFullYear();
  const m = String(kst.getUTCMonth() + 1).padStart(2, "0");
  const d = String(kst.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
