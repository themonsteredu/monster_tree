// /admin/village — 몬스터 마을 관리자 페이지.
// 배경 이미지 1장 + 시즌 + 건물 5개(이미지/위치/오픈여부)를 한 화면에서 관리한다.

import Link from "next/link";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { getAdminBranchId } from "@/lib/branch";
import { isAdminAuthenticated } from "../auth";
import { LoginForm } from "../LoginForm";
import { VillageAdminClient } from "./VillageAdminClient";
import type { VillageBuilding, VillageSettings } from "@/lib/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function VillageAdminPage({
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

  const sb = createSupabaseServiceClient();

  const [{ data: settingsRow }, { data: buildingsRows }] = await Promise.all([
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
      .order("display_order", { ascending: true }),
  ]);

  const settings: VillageSettings | null = (settingsRow as VillageSettings | null) ?? null;
  const buildings: VillageBuilding[] = (buildingsRows ?? []) as VillageBuilding[];

  const branchId = getAdminBranchId() ?? searchParams.branch?.trim() ?? null;
  const villageHref = branchId
    ? `/admin/village-preview?branch=${encodeURIComponent(branchId)}`
    : "/admin/village-preview";

  return (
    <main className="min-h-screen pb-20 bg-gray-50">
      <header className="sticky top-0 z-30 bg-white border-b border-gray-100">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-2">
          <Link
            href={villageHref}
            className="shrink-0 text-sm text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-lg px-3 py-1.5 transition"
          >
            ← 몬스터마을
          </Link>
          <h1 className="text-lg font-semibold text-gray-900 truncate">마을 관리</h1>
        </div>
      </header>
      <VillageAdminClient initialSettings={settings} initialBuildings={buildings} />
    </main>
  );
}
