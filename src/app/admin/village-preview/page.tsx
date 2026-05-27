// /admin/village-preview — 학생 로그인 없이 관리자가 /me/village 미리보기.
// VillageClient 를 그대로 사용하되, 학생 데이터 대신 '관리자 미리보기' 라벨/포인트 0 으로 렌더.
// 건의함처럼 is_ready=false 건물 클릭 시 토스트가 뜨는지 등 동작 확인용.

import Link from "next/link";
import { createSupabaseServerAnonClient } from "@/lib/supabase/server";
import { getAdminBranchId, getAdminBranchName } from "@/lib/branch";
import type { VillageBuilding, VillageSettings } from "@/lib/types";
import { isAdminAuthenticated } from "../auth";
import { LoginForm } from "../LoginForm";
import { VillageClient } from "../../me/village/VillageClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminVillagePreviewPage({
  searchParams,
}: {
  searchParams: { key?: string; branch?: string };
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

  // village_settings / village_buildings 는 글로벌이라 사실 branchId 없이도 보여줄 수 있다.
  // 단 미리보기에서 admin 라우트로 이동 시 cookie 가 없을 때를 대비해 ?branch= 로 위임.
  const branchId = getAdminBranchId() ?? searchParams.branch?.trim() ?? null;
  const branchName = getAdminBranchName();

  const sb = createSupabaseServerAnonClient();
  const [{ data: settingsRow }, { data: buildingRows }] = await Promise.all([
    sb
      .from("village_settings")
      .select("id, background_image, season, is_active, updated_at")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
    sb
      .from("village_buildings")
      .select(
        "id, building_key, name, image_url, link, position_top, position_left, position_right, size, rotation, description, display_order, is_ready, is_visible, updated_at",
      )
      .eq("is_visible", true)
      .order("display_order", { ascending: true }),
  ]);

  const settings = (settingsRow as VillageSettings | null) ?? null;
  const buildings = (buildingRows ?? []) as VillageBuilding[];

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="sticky top-0 z-40 bg-amber-50 border-b border-amber-200">
        <div className="max-w-5xl mx-auto px-4 py-2 flex items-center justify-between gap-3 text-sm">
          <div className="flex items-center gap-2 min-w-0">
            <span className="px-2 py-0.5 rounded-full bg-amber-200 text-amber-900 text-xs font-semibold shrink-0">
              관리자 미리보기
            </span>
            <span className="text-amber-800 truncate">
              건물을 클릭하면 학생 화면 대신 관리자 페이지로 이동해요
              {branchName ? ` · ${branchName}` : ""}
            </span>
          </div>
          <Link
            href="/admin"
            className="shrink-0 text-amber-800 hover:text-amber-900 hover:bg-amber-100 rounded-lg px-2 py-1 transition"
          >
            ← 관리
          </Link>
        </div>
      </div>

      <VillageClient
        settings={settings}
        buildings={buildings}
        studentName="관리자"
        totalPoints={0}
        previewMode
        previewLinkOverrides={{
          // 우체통: 학생 건의함 미리보기 → 우상단 '관리 페이지' 버튼으로 /admin/suggest 점프.
          mailbox: branchId
            ? `/admin/suggest-preview?branch=${encodeURIComponent(branchId)}`
            : "/admin/suggest-preview",
          // 퀴즈센터: 학생 퀴즈 미리보기 (스텁) → '관리 페이지' 버튼으로 /admin/quiz-center 점프.
          quiz: branchId
            ? `/admin/quiz-center-preview?branch=${encodeURIComponent(branchId)}`
            : "/admin/quiz-center-preview",
          // 게임센터: 학생 게임 미리보기 (스텁) → '관리 페이지' 버튼으로 /admin/game-center 점프.
          game: branchId
            ? `/admin/game-center-preview?branch=${encodeURIComponent(branchId)}`
            : "/admin/game-center-preview",
          // 상점: 학생 상점 미리보기(테스트 모드) → '관리 페이지' 버튼으로 /admin/shop 점프.
          shop: branchId
            ? `/admin/shop-preview?branch=${encodeURIComponent(branchId)}`
            : "/admin/shop-preview",
        }}
      />
    </div>
  );
}
