// /admin/suggest-preview — 관리자가 학생들이 보는 건의함 화면을 그대로 미리보기.
// 학생 SuggestClient 를 재사용하면서 previewMode=true 로 폼 제출만 막고,
// 우측 하단에 관리 페이지로 이동하는 floating 버튼을 띄운다.
// 데이터는 비워서 보여준다 (학생 개인 데이터 없음).

import Link from "next/link";
import { getAdminBranchId, getAdminBranchName } from "@/lib/branch";
import { isAdminAuthenticated } from "../auth";
import { LoginForm } from "../LoginForm";
import { SuggestClient } from "../../me/suggest/SuggestClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminSuggestPreviewPage({
  searchParams,
}: {
  searchParams: { key?: string; branch?: string };
}) {
  if (!isAdminAuthenticated(searchParams.key)) {
    return <LoginForm initialKey={searchParams.key ?? ""} />;
  }

  // 쿠키 우선, 없으면 ?branch= fallback.
  const branchId = getAdminBranchId() ?? searchParams.branch?.trim() ?? null;
  const branchName = getAdminBranchName();

  // 관리 페이지 링크는 항상 ?branch= 를 명시 전달해 쿠키 누락 상황에서도 동작.
  const adminLink = branchId
    ? `/admin/suggest?branch=${encodeURIComponent(branchId)}`
    : "/admin/suggest";

  const displayName = branchName
    ? `${branchName} 관리자`
    : branchId
      ? "관리자 미리보기"
      : "관리자";

  return (
    <>
      {/* 상단 안내 — 학생 화면 헤더와 시각적으로 충돌 안 나게 fixed 가 아닌 인라인 */}
      <div className="bg-amber-100 border-b border-amber-200 px-4 py-2 text-xs text-amber-800 text-center">
        ⓘ 학생이 보는 건의함 화면을 미리보기 중입니다.
        {" "}
        <Link href="/admin" className="underline hover:no-underline">
          관리 홈
        </Link>
      </div>
      <SuggestClient
        studentName={displayName}
        suggestions={[]}
        activeBlock={null}
        previewMode
        adminLink={adminLink}
      />
    </>
  );
}
