"use server";

// /quiz-center 학생/관리자 서버 액션.
// - startQuizSessionAction: 학생 학년 + 최근 풀이 제외 + 카테고리별 mix 로 3문제 추출
// - submitQuizAnswersAction: 점수 계산 → 올클 시 garden_pending_points 에 +1pt 적립
//   (관리자 테스트 모드는 quiz_plays / pending 둘 다 저장 안 함)

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { STUDENT_COOKIE_NAME, verifyStudentJwt } from "@/lib/student-jwt";
import { isAdminAuthenticated } from "../admin/auth";
import type { QuizCategory, QuizDifficulty, QuizMathGrade } from "@/lib/types";

// 학생이 풀이 화면에서 받는 문제 페이로드 (정답+해설 포함 — 즉시 피드백 UX).
// 같은 회차 문제는 곧바로 quiz_plays 에 기록되어 다음 회차에서 제외되므로
// 클라이언트가 정답을 보더라도 어뷰징 가능성은 낮음 (포인트도 1점/일).
export type PlayableQuestion = {
  id: string;
  category: QuizCategory;
  difficulty: QuizDifficulty;
  question: string;
  options: [string, string, string, string];
  correct_answer: number; // 1~4
  explanation: string | null;
};

// monster-site 의 garden_students.grade ('중1' 등) → quiz_questions.grade 키 매핑.
// 매핑되지 않는 값은 '중1' 로 fallback (수학 풀에서 빈 결과 시 페이지가 graceful 처리).
function mapStudentGradeToMath(raw: string | null | undefined): QuizMathGrade {
  const v = (raw ?? "").trim();
  const table: Record<string, QuizMathGrade> = {
    초3: "elementary_3",
    초4: "elementary_4",
    초5: "elementary_5",
    초6: "elementary_6",
    중1: "middle_1",
    중2: "middle_2",
    중3: "middle_3",
  };
  return table[v] ?? "middle_1";
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

type SupabaseClientLike = ReturnType<typeof createSupabaseServiceClient>;

// 최근 30일(또는 최근 20회) 풀이의 question_ids 를 모두 수집해 제외 집합 반환.
async function getRecentExcludeIds(
  sb: SupabaseClientLike,
  studentId: string,
): Promise<Set<string>> {
  const { data } = await sb
    .from("quiz_plays")
    .select("question_ids")
    .eq("student_id", studentId)
    .order("played_at", { ascending: false })
    .limit(20);
  const set = new Set<string>();
  for (const row of data ?? []) {
    const ids = (row.question_ids as string[]) ?? [];
    for (const id of ids) set.add(id);
  }
  return set;
}

type QuestionRow = {
  id: string;
  category: QuizCategory;
  difficulty: QuizDifficulty;
  question: string;
  option_1: string;
  option_2: string;
  option_3: string;
  option_4: string;
  correct_answer: number;
  explanation: string | null;
};

function toPlayable(row: QuestionRow): PlayableQuestion {
  return {
    id: row.id,
    category: row.category,
    difficulty: row.difficulty,
    question: row.question,
    options: [row.option_1, row.option_2, row.option_3, row.option_4],
    correct_answer: row.correct_answer,
    explanation: row.explanation,
  };
}

// 카테고리 풀에서 검수+활성 문제만 가져오기 (최대 60개 샘플).
async function fetchPool(
  sb: SupabaseClientLike,
  category: QuizCategory,
  grade: string,
): Promise<QuestionRow[]> {
  const { data } = await sb
    .from("quiz_questions")
    .select(
      "id, category, difficulty, question, option_1, option_2, option_3, option_4, correct_answer, explanation",
    )
    .eq("category", category)
    .eq("grade", grade)
    .eq("is_approved", true)
    .eq("is_active", true)
    .limit(60);
  return (data ?? []) as QuestionRow[];
}

// 3개 슬롯에 (수학:학년, 상식:all, 넌센스:all) 한 개씩 우선 배치 → 비면 다른 풀에서 채움.
async function pickThreeQuestions(
  sb: SupabaseClientLike,
  mathGrade: QuizMathGrade,
  excludeIds: Set<string>,
): Promise<PlayableQuestion[]> {
  const slots: Array<{ category: QuizCategory; grade: string }> = [
    { category: "math", grade: mathGrade },
    { category: "general", grade: "all" },
    { category: "nonsense", grade: "all" },
  ];

  // 각 슬롯 풀을 병렬로 가져옴.
  const pools = await Promise.all(
    slots.map((s) => fetchPool(sb, s.category, s.grade)),
  );

  const filteredPools = pools.map((p) => p.filter((q) => !excludeIds.has(q.id)));
  const allCandidates = filteredPools.flat();

  const picked: QuestionRow[] = [];
  const pickedIds = new Set<string>();

  // 1단계: 각 슬롯에서 1개씩 (가능한 슬롯만).
  for (const pool of filteredPools) {
    if (pool.length === 0) continue;
    const shuffled = shuffle(pool);
    for (const q of shuffled) {
      if (!pickedIds.has(q.id)) {
        picked.push(q);
        pickedIds.add(q.id);
        break;
      }
    }
  }

  // 2단계: 부족하면 전체 후보에서 채움.
  if (picked.length < 3) {
    for (const q of shuffle(allCandidates)) {
      if (picked.length >= 3) break;
      if (!pickedIds.has(q.id)) {
        picked.push(q);
        pickedIds.add(q.id);
      }
    }
  }

  // 3단계: 그래도 부족하면 (최근 풀이 제외 풀이 너무 작음) — 제외 무시하고 보충.
  if (picked.length < 3) {
    const allUnfiltered = pools.flat();
    for (const q of shuffle(allUnfiltered)) {
      if (picked.length >= 3) break;
      if (!pickedIds.has(q.id)) {
        picked.push(q);
        pickedIds.add(q.id);
      }
    }
  }

  return shuffle(picked).slice(0, 3).map(toPlayable);
}

// KST 자정의 UTC ISO 문자열 — 오늘 풀이 여부 판정에 사용.
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

type AuthContext =
  | { mode: "student"; studentId: string; branchId: string }
  | { mode: "admin" }
  | { mode: "none" };

async function getAuthContext(): Promise<AuthContext> {
  const token = cookies().get(STUDENT_COOKIE_NAME)?.value;
  const payload = await verifyStudentJwt(token);
  if (payload) {
    const sb = createSupabaseServiceClient();
    const { data: row } = await sb
      .from("garden_students")
      .select("id")
      .eq("branch_id", payload.branchId)
      .eq("external_student_id", payload.studentLocalId)
      .maybeSingle();
    if (row?.id) {
      return { mode: "student", studentId: row.id as string, branchId: payload.branchId };
    }
  }
  if (isAdminAuthenticated()) return { mode: "admin" };
  return { mode: "none" };
}

/* ====================== 액션 ====================== */

export async function startQuizSessionAction(): Promise<
  | { ok: true; questions: PlayableQuestion[]; adminMode: boolean }
  | { ok: false; message: string }
> {
  const auth = await getAuthContext();
  if (auth.mode === "none") {
    return { ok: false, message: "로그인이 필요해요." };
  }

  const sb = createSupabaseServiceClient();

  // 학생: 오늘 이미 풀었으면 거부 (관리자는 무제한).
  if (auth.mode === "student") {
    const { count } = await sb
      .from("quiz_plays")
      .select("id", { count: "exact", head: true })
      .eq("student_id", auth.studentId)
      .gte("played_at", todayKstMidnightUtcIso());
    if ((count ?? 0) > 0) {
      return { ok: false, message: "오늘은 이미 도전했어요. 내일 다시 만나요!" };
    }
  }

  // 학생 학년 매핑 → 수학 풀 결정. 관리자는 임의 학년('middle_1') 사용.
  let mathGrade: QuizMathGrade = "middle_1";
  let excludeIds = new Set<string>();
  if (auth.mode === "student") {
    const { data: row } = await sb
      .from("garden_students")
      .select("grade")
      .eq("id", auth.studentId)
      .maybeSingle();
    mathGrade = mapStudentGradeToMath((row?.grade as string | null) ?? null);
    excludeIds = await getRecentExcludeIds(sb, auth.studentId);
  }

  const questions = await pickThreeQuestions(sb, mathGrade, excludeIds);
  if (questions.length < 3) {
    return {
      ok: false,
      message:
        "출제할 수 있는 문제가 부족해요. 원장님께 문제 추가를 요청해주세요.",
    };
  }
  return { ok: true, questions, adminMode: auth.mode === "admin" };
}

export async function submitQuizAnswersAction(args: {
  questionIds: string[];
  answers: number[];
}): Promise<
  | {
      ok: true;
      correctCount: number;
      isPerfect: boolean;
      pointEarned: number;
      perItem: Array<{ id: string; correct: boolean; correctAnswer: number }>;
      adminMode: boolean;
    }
  | { ok: false; message: string }
> {
  if (
    !Array.isArray(args.questionIds) ||
    !Array.isArray(args.answers) ||
    args.questionIds.length !== 3 ||
    args.answers.length !== 3
  ) {
    return { ok: false, message: "잘못된 제출 형식이에요." };
  }
  // 0 은 '시간 초과 / 미응답' 의미 — 1~4 와 0 만 허용.
  for (const a of args.answers) {
    if (typeof a !== "number" || a < 0 || a > 4) {
      return { ok: false, message: "답은 1~4 또는 0(미응답) 만 허용해요." };
    }
  }

  const auth = await getAuthContext();
  if (auth.mode === "none") {
    return { ok: false, message: "로그인이 필요해요." };
  }

  const sb = createSupabaseServiceClient();
  const { data: rows, error } = await sb
    .from("quiz_questions")
    .select("id, correct_answer")
    .in("id", args.questionIds);
  if (error) return { ok: false, message: `채점 실패: ${error.message}` };

  const byId = new Map<string, number>();
  for (const r of rows ?? []) byId.set(r.id as string, r.correct_answer as number);

  const perItem = args.questionIds.map((qid, i) => {
    const correctAns = byId.get(qid) ?? -1;
    const chosen = args.answers[i];
    return {
      id: qid,
      correctAnswer: correctAns,
      correct: chosen === correctAns,
    };
  });
  const correctCount = perItem.filter((p) => p.correct).length;
  const isPerfect = correctCount === 3;
  const pointEarned = isPerfect ? 1 : 0;

  // 관리자 테스트 모드: 기록/포인트 저장 안 함, 채점 결과만 반환.
  if (auth.mode === "admin") {
    return {
      ok: true,
      correctCount,
      isPerfect,
      pointEarned,
      perItem,
      adminMode: true,
    };
  }

  // 학생: quiz_plays 기록 + 올클이면 garden_pending_points 에 +1pt 적립.
  const { error: insertErr } = await sb.from("quiz_plays").insert({
    student_id: auth.studentId,
    branch_id: auth.branchId,
    question_ids: args.questionIds,
    answers: args.answers,
    correct_count: correctCount,
    is_perfect: isPerfect,
    point_earned: pointEarned,
  });
  if (insertErr) {
    return { ok: false, message: `기록 저장 실패: ${insertErr.message}` };
  }

  if (isPerfect) {
    const { error: pendErr } = await sb.from("garden_pending_points").insert({
      student_id: auth.studentId,
      points: 1,
      reason: "퀴즈센터 올클",
    });
    // 적립 실패는 치명적이지 않으니 (기록은 이미 됐음) 경고로만.
    if (pendErr) {
      console.warn(`[quiz-center] pending_points insert failed: ${pendErr.message}`);
    }
  }

  // 학생 메인 페이지/사과정원 캐시 무효화.
  revalidatePath("/quiz-center");
  revalidatePath("/me");

  return {
    ok: true,
    correctCount,
    isPerfect,
    pointEarned,
    perItem,
    adminMode: false,
  };
}
