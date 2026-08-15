// /admin/village — 몬스터 마을 관리자 페이지.
// 배경 이미지 1장 + 시즌 + 건물 5개(이미지/위치/오픈여부)를 한 화면에서 관리한다.

import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { isAdminAuthenticated } from "../auth";
import { LoginForm } from "../LoginForm";
import { AdminHeader } from "../AdminHeader";
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


  return (
    <main className="min-h-screen pb-20 bg-gray-50">
      <AdminHeader current="village" title="마을 관리" />
      <VillageAdminClient initialSettings={settings} initialBuildings={buildings} />
    </main>
  );
}
