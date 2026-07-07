// /admin/shop-preview — 학생이 보는 상점 화면을 관리자가 그대로 테스트.
// 학생 컴포넌트 ShopClient 를 adminMode 로 재사용 (신청 저장 없음, 잔액·내역은 빈 placeholder).
// 상단에 '학생 미리보기' 바 + '관리 페이지 →' 점프 링크.

import Link from "next/link";
import { isAdminAuthenticated } from "../auth";
import { LoginForm } from "../LoginForm";
import { getAdminBranchId } from "@/lib/branch";
import { loadShopOpenState } from "@/lib/shop-settings";
import { ShopClient } from "../../shop/ShopClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminShopPreviewPage({
  searchParams,
}: {
  searchParams: { key?: string; branch?: string };
}) {
  if (!isAdminAuthenticated(searchParams.key)) {
    return <LoginForm initialKey={searchParams.key ?? ""} />;
  }

  const branchId = getAdminBranchId() ?? searchParams.branch?.trim() ?? null;
  const openInfo = await loadShopOpenState(branchId);
  const adminLink = branchId
    ? `/admin/shop?branch=${encodeURIComponent(branchId)}`
    : "/admin/shop";

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="sticky top-0 z-40 bg-amber-50 border-b border-amber-200">
        <div className="max-w-5xl mx-auto px-4 py-2 flex items-center justify-between gap-3 text-sm">
          <div className="flex items-center gap-2 min-w-0">
            <span className="px-2 py-0.5 rounded-full bg-amber-200 text-amber-900 text-xs font-semibold shrink-0">
              학생 미리보기
            </span>
            <span className="text-amber-800 truncate">
              학생이 보게 될 상점 화면이에요 (신청은 저장 안 됨)
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

      <ShopClient
        studentName={null}
        adminMode
        balance={0}
        initialRequests={[]}
        openInfo={openInfo}
      />
    </div>
  );
}
