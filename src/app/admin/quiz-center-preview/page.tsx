// /admin/quiz-center-preview — 학생이 보는 퀴즈센터 화면 미리보기 (스텁)
// 실제 학생용 퀴즈 화면은 아직 구현 전. 본 페이지는 몬스터마을 hub 의 학생 뷰 진입점 자리잡이 +
// 우측 상단의 '관리 페이지' 버튼으로 admin 페이지로 점프할 수 있게 한다.

import Link from "next/link";
import { isAdminAuthenticated } from "../auth";
import { LoginForm } from "../LoginForm";
import { getAdminBranchId } from "@/lib/branch";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminQuizCenterPreviewPage({
  searchParams,
}: {
  searchParams: { key?: string; branch?: string };
}) {
  if (!isAdminAuthenticated(searchParams.key)) {
    return <LoginForm initialKey={searchParams.key ?? ""} />;
  }

  const branchId = getAdminBranchId() ?? searchParams.branch?.trim() ?? null;
  const adminLink = branchId
    ? `/admin/quiz-center?branch=${encodeURIComponent(branchId)}`
    : "/admin/quiz-center";

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="sticky top-0 z-40 bg-amber-50 border-b border-amber-200">
        <div className="max-w-5xl mx-auto px-4 py-2 flex items-center justify-between gap-3 text-sm">
          <div className="flex items-center gap-2 min-w-0">
            <span className="px-2 py-0.5 rounded-full bg-amber-200 text-amber-900 text-xs font-semibold shrink-0">
              학생 미리보기
            </span>
            <span className="text-amber-800 truncate">
              학생이 보게 될 퀴즈센터 화면이에요
            </span>
          </div>
          <Link
            href={adminLink}
            className="shrink-0 text-amber-800 hover:text-amber-900 hover:bg-amber-100 rounded-lg px-2 py-1 transition font-semibold"
          >
            관리 페이지 →
          </Link>
        </div>
      </div>

      <main className="max-w-2xl mx-auto px-4 py-10">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-12 text-center">
          <div className="text-5xl mb-4">🧩</div>
          <h1 className="text-lg font-bold text-gray-900 mb-2">퀴즈센터</h1>
          <p className="text-gray-500 text-sm leading-relaxed">
            학생용 퀴즈 화면은 준비 중이에요.
            <br />
            우측 상단{" "}
            <span className="font-semibold text-gray-700">관리 페이지 →</span>{" "}
            에서 콘텐츠를 추가하면 이곳에 노출돼요.
          </p>
        </div>
      </main>
    </div>
  );
}
