"use server";

// 학생/TV 가 쓰는 단계별 이미지 설정 조회.
// public read RLS 가 걸려있어 anon 키로도 가능하지만 일관성을 위해 service client 사용.

import { createSupabaseServiceClient } from "@/lib/supabase/server";
import type { GardenTreeStage } from "@/lib/types";

export async function listTreeStagesAction() {
  const sb = createSupabaseServiceClient();
  const { data, error } = await sb
    .from("garden_tree_stages")
    .select("stage, image_url, scale, offset_x, offset_y, updated_at")
    .order("stage", { ascending: true });
  if (error) {
    return { ok: false as const, message: `조회 실패: ${error.message}` };
  }
  return { ok: true as const, stages: (data ?? []) as GardenTreeStage[] };
}
