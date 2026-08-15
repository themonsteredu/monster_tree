// /admin/tree — 사과나무 단계별 이미지 관리자 페이지.

import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { isAdminAuthenticated } from "../auth";
import { LoginForm } from "../LoginForm";
import { AdminHeader } from "../AdminHeader";
import { TreeStagesClient } from "./TreeStagesClient";
import type { GardenTreeStage } from "@/lib/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function TreeStagesAdminPage({
  searchParams,
}: {
  searchParams: { key?: string };
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
  const { data } = await sb
    .from("garden_tree_stages")
    .select("stage, image_url, scale, offset_x, offset_y, updated_at")
    .order("stage", { ascending: true });

  return (
    <main className="min-h-screen pb-20 bg-gray-50">
      <AdminHeader current="tree" title="나무 이미지 관리" />
      <TreeStagesClient initialStages={(data ?? []) as GardenTreeStage[]} />
    </main>
  );
}
