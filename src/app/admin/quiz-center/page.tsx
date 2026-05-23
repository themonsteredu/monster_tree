// /admin/quiz-center — 퀴즈 문제 관리.
// 카테고리(수학/상식/넌센스) × 학년 × 난이도 × 검수상태 필터링,
// 직접 등록 / AI 대량 생성 / 검수 / 비활성화 / 삭제까지.

import Link from "next/link";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { isAdminAuthenticated } from "../auth";
import { LoginForm } from "../LoginForm";
import { QuizCenterAdminClient } from "./QuizCenterAdminClient";
import type { QuizQuestion } from "@/lib/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;
// AI 대량 생성(50개 등)이 길어질 수 있어 5분까지 허용 (Vercel Pro plan 필요).
export const maxDuration = 300;

export default async function QuizCenterAdminPage({
  searchParams,
}: {
  searchParams: { key?: string };
}) {
  if (!isAdminAuthenticated(searchParams.key)) {
    return <LoginForm initialKey={searchParams.key ?? ""} />;
  }
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    return (
      <main className="p-6 text-center text-gray-400 bg-gray-50 min-h-screen">
        Supabase 환경변수가 설정되지 않았어요.
      </main>
    );
  }

  // service_role 로 모든 문제 (검수 완료 + 미검수 + 비활성 포함) 조회.
  const sb = createSupabaseServiceClient();
  const { data: questions } = await sb
    .from("quiz_questions")
    .select(
      "id, category, grade, question, option_1, option_2, option_3, option_4, correct_answer, explanation, difficulty, is_approved, is_active, created_at, approved_at",
    )
    .order("created_at", { ascending: false })
    .limit(2000);

  return (
    <main className="min-h-screen pb-24 bg-gray-50">
      <header className="sticky top-0 z-30 bg-white border-b border-gray-100">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-2">
          <Link
            href="/admin"
            className="shrink-0 text-sm text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-lg px-3 py-1.5 transition"
          >
            ← 관리
          </Link>
          <h1 className="text-lg font-semibold text-gray-900 truncate">
            📝 퀴즈 관리
          </h1>
        </div>
      </header>

      <QuizCenterAdminClient
        initialQuestions={(questions ?? []) as QuizQuestion[]}
      />
    </main>
  );
}
