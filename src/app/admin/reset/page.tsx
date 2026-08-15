// /admin/reset - 학기 리셋 위험 페이지
// 인증 체크 후 ResetClient 렌더링.

import { isAdminAuthenticated } from "../auth";
import { LoginForm } from "../LoginForm";
import { AdminHeader } from "../AdminHeader";
import { ResetClient } from "./ResetClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function ResetPage({
  searchParams,
}: {
  searchParams: { key?: string };
}) {
  if (!isAdminAuthenticated(searchParams.key)) {
    return <LoginForm initialKey={searchParams.key ?? ""} />;
  }
  return (
    <main className="min-h-screen bg-gray-50">
      <AdminHeader current="reset" title="학기 리셋" />
      <div className="max-w-md mx-auto px-4 py-6">
        <h1 className="text-xl font-semibold text-gray-900">학기 리셋</h1>
        <p className="mt-2 text-sm text-gray-500 leading-relaxed">
          새 학기 시작 시 모든 활성 학생의 누적 포인트, 단계, 수확 사과 수를 초기화합니다. 미수령
          포인트는 함께 삭제되며, 포인트 로그와 수확 이력은 보존됩니다 (감사 흔적).
        </p>
        <ResetClient />
      </div>
    </main>
  );
}
