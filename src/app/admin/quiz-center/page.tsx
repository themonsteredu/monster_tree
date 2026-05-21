// /admin/quiz-center — 퀴즈센터 (준비 중)
// 몬스터마을 허브의 하위 메뉴. 향후 학생용 퀴즈 관리 페이지가 될 자리.

import Link from "next/link";
import { isAdminAuthenticated } from "../auth";
import { LoginForm } from "../LoginForm";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function QuizCenterPage({
  searchParams,
}: {
  searchParams: { key?: string };
}) {
  const authed = isAdminAuthenticated(searchParams.key);
  if (!authed) return <LoginForm initialKey={searchParams.key ?? ""} />;

  return (
    <main className="min-h-screen p-6 bg-gray-50">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-bold text-gray-900">🧩 퀴즈센터</h1>
          <Link
            href="/admin/garden"
            className="text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg px-3 py-1.5 transition"
          >
            ← 사과정원
          </Link>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
          <div className="text-5xl mb-4">🧩</div>
          <p className="text-gray-500 text-sm leading-relaxed">
            퀴즈센터는 준비 중입니다.
            <br />곧 단원별 퀴즈를 출제·관리할 수 있게 돼요.
          </p>
        </div>
      </div>
    </main>
  );
}
