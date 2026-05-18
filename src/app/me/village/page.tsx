// /me/village — 학생 로그인 후 첫 진입 화면 (몬스터 마을).
// village_settings + village_buildings 를 SSR 로 가져와 합성한 뒤 클라이언트에 전달.

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { STUDENT_COOKIE_NAME, verifyStudentJwt } from "@/lib/student-jwt";
import { createSupabaseServerAnonClient } from "@/lib/supabase/server";
import type { VillageBuilding, VillageSettings } from "@/lib/types";
import { VillageClient } from "./VillageClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function VillagePage() {
  const token = cookies().get(STUDENT_COOKIE_NAME)?.value;
  const payload = await verifyStudentJwt(token);
  if (!payload) redirect("https://www.themonster.kr/login");

  const sb = createSupabaseServerAnonClient();

  const [{ data: settingsRow }, { data: buildingRows }, { data: studentRow }] =
    await Promise.all([
      sb
        .from("village_settings")
        .select("id, background_image, season, is_active, updated_at")
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle(),
      sb
        .from("village_buildings")
        .select(
          "id, building_key, name, image_url, link, position_top, position_left, position_right, size, rotation, display_order, is_ready, is_visible, updated_at",
        )
        .eq("is_visible", true)
        .order("display_order", { ascending: true }),
      sb
        .from("garden_students")
        .select("total_points, avatar")
        .eq("branch_id", payload!.branchId)
        .eq("external_student_id", payload!.studentLocalId)
        .maybeSingle(),
    ]);

  const settings = (settingsRow as VillageSettings | null) ?? null;
  const buildings = (buildingRows ?? []) as VillageBuilding[];
  const totalPoints = (studentRow?.total_points as number | undefined) ?? 0;

  return (
    <VillageClient
      settings={settings}
      buildings={buildings}
      studentName={payload!.name}
      totalPoints={totalPoints}
    />
  );
}
