// /admin/quiz-center-preview — 학생이 보는 퀴즈센터 화면을 관리자가 그대로 테스트.
// 실제 학생용 컴포넌트(QuizCenterClient)를 adminMode 로 재사용한다.
// - adminMode=true: 하루 1회 제한·기록·포인트 저장 없이 무제한으로 풀어볼 수 있음.
// - 상단에 '학생 미리보기' 바 + '관리 페이지 →' 점프 링크.
//   (출제 풀은 실제 검수완료 문제를 그대로 사용하므로, 업로드한 문제가 학생에게
//    어떻게 3문제씩 나가는지 그대로 확인된다.)

import Link from "next/link";
import { isAdminAuthenticated } from "../auth";
import { LoginForm } from "../LoginForm";
import { getAdminBranchId } from "@/lib/branch";
import { QuizCenterClient } from "../../quiz-center/QuizCenterClient";

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
              학생이 보게 될 퀴즈센터 화면이에요 (하루 1회·3문제)
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

      {/* 실제 학생 퀴즈 화면을 테스트 모드로 렌더 — 기록/포인트 저장 안 됨, 무제한 재도전. */}
      <QuizCenterClient
        studentName={null}
        adminMode
        today={null}
        recentWeek={[]}
        lifetimePoints={0}
        streakDays={0}
      />
    </div>
  );
}
