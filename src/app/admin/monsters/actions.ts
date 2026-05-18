"use server";

// /admin/monsters — 몬스터 종 마스터 + 단계별 이미지 관리.

import { revalidatePath } from "next/cache";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { isAdminAuthenticated } from "../auth";
import { MONSTER_STAGE_DEFAULTS } from "@/lib/types";

const BUCKET = "monsters";
const MAX_FILE_BYTES = 1_048_576; // 1MB
const ALLOWED_MIME = ["image/png", "image/webp"];

function ensureAuth() {
  if (!isAdminAuthenticated()) {
    throw new Error("AUTH_REQUIRED: 비밀번호가 필요합니다.");
  }
}

function revalidateAll() {
  revalidatePath("/admin/monsters");
  revalidatePath("/me");
}

function clampInt(n: unknown, lo: number, hi: number): number | null {
  if (typeof n !== "number" || !Number.isFinite(n)) return null;
  const i = Math.floor(n);
  if (i < lo || i > hi) return null;
  return i;
}

function pathFromPublicUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = url.match(/\/storage\/v1\/object\/public\/monsters\/(.+?)(\?.*)?$/);
  return m ? m[1] : null;
}

async function removeStorage(prevUrl: string | null | undefined) {
  const path = pathFromPublicUrl(prevUrl);
  if (!path) return;
  const sb = createSupabaseServiceClient();
  await sb.storage.from(BUCKET).remove([path]);
}

/* ============== 종 생성 / 수정 / 삭제 ============== */

export async function createSpeciesAction(formData: FormData) {
  ensureAuth();

  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const hideName = formData.get("hideName") === "true";
  const file = formData.get("file"); // 1단계(알) 이미지 — 필수

  if (!name || name.length > 40) {
    return { ok: false as const, message: "이름은 1~40자 이내로 입력해주세요." };
  }
  if (description.length > 200) {
    return { ok: false as const, message: "설명은 200자 이내로 입력해주세요." };
  }
  if (!(file instanceof File)) {
    return { ok: false as const, message: "1단계(알) 이미지를 업로드해주세요." };
  }
  if (file.size > MAX_FILE_BYTES) {
    return { ok: false as const, message: "이미지가 너무 커요 (1MB 이하)." };
  }
  if (!ALLOWED_MIME.includes(file.type)) {
    return { ok: false as const, message: "PNG / WebP 만 업로드할 수 있어요." };
  }

  const sb = createSupabaseServiceClient();

  // 1) species 행 생성
  const { data: maxOrder } = await sb
    .from("monster_species")
    .select("display_order")
    .order("display_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const newOrder = (maxOrder?.display_order ?? -1) + 1;

  const { data: species, error: insErr } = await sb
    .from("monster_species")
    .insert({
      name,
      description,
      display_order: newOrder,
      is_active: true,
      hide_name: hideName,
    })
    .select("id")
    .single();
  if (insErr || !species) {
    return { ok: false as const, message: `생성 실패: ${insErr?.message ?? "unknown"}` };
  }

  // 2) 1단계 이미지 업로드
  const ext = file.type === "image/webp" ? "webp" : "png";
  const path = `species-${species.id}-stage-1-${Date.now()}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  const { error: upErr } = await sb.storage
    .from(BUCKET)
    .upload(path, buffer, { contentType: file.type, cacheControl: "3600", upsert: false });
  if (upErr) {
    await sb.from("monster_species").delete().eq("id", species.id);
    return { ok: false as const, message: `업로드 실패: ${upErr.message}` };
  }
  const { data: pub } = sb.storage.from(BUCKET).getPublicUrl(path);
  const imageUrl = `${pub.publicUrl}?t=${Date.now()}`;

  // 3) 단계 1~5 행 5개 생성 (1단계만 image_url 있음)
  const stageRows = MONSTER_STAGE_DEFAULTS.map((d) => ({
    species_id: species.id,
    stage: d.stage,
    stage_name: d.name,
    required_exp: d.requiredExp,
    image_url: d.stage === 1 ? imageUrl : null,
  }));
  const { error: stageErr } = await sb.from("monster_stage_images").insert(stageRows);
  if (stageErr) {
    await sb.storage.from(BUCKET).remove([path]);
    await sb.from("monster_species").delete().eq("id", species.id);
    return { ok: false as const, message: `단계 생성 실패: ${stageErr.message}` };
  }

  revalidateAll();
  return { ok: true as const, id: species.id };
}

export async function updateSpeciesAction(args: {
  id: string;
  name?: string;
  description?: string;
  hideName?: boolean;
  isActive?: boolean;
  displayOrder?: number;
}) {
  ensureAuth();
  if (!args.id) return { ok: false as const, message: "id 가 없어요." };

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof args.name === "string") {
    const n = args.name.trim();
    if (!n || n.length > 40) return { ok: false as const, message: "이름이 올바르지 않아요." };
    patch.name = n;
  }
  if (typeof args.description === "string") {
    const d = args.description.trim().slice(0, 200);
    patch.description = d;
  }
  if (typeof args.hideName === "boolean") patch.hide_name = args.hideName;
  if (typeof args.isActive === "boolean") patch.is_active = args.isActive;
  if (typeof args.displayOrder === "number") {
    const o = clampInt(args.displayOrder, 0, 9999);
    if (o === null) return { ok: false as const, message: "표시 순서가 올바르지 않아요." };
    patch.display_order = o;
  }

  const sb = createSupabaseServiceClient();
  const { error } = await sb.from("monster_species").update(patch).eq("id", args.id);
  if (error) return { ok: false as const, message: `DB 저장 실패: ${error.message}` };

  revalidateAll();
  return { ok: true as const };
}

export async function deleteSpeciesAction(args: { id: string }) {
  ensureAuth();
  if (!args.id) return { ok: false as const, message: "id 가 없어요." };

  const sb = createSupabaseServiceClient();

  // 학생 보유 확인 — 있으면 삭제 거부 (FK on delete restrict 와 동일 시멘틱 + 친절한 메시지)
  const { count } = await sb
    .from("student_monsters")
    .select("id", { count: "exact", head: true })
    .eq("species_id", args.id);
  if ((count ?? 0) > 0) {
    return {
      ok: false as const,
      message: `이미 학생이 키우는 종이라 삭제할 수 없어요. 대신 "비활성화" 를 사용해주세요. (보유 학생 ${count}명)`,
    };
  }

  // 단계 이미지들 storage 정리
  const { data: stages } = await sb
    .from("monster_stage_images")
    .select("image_url")
    .eq("species_id", args.id);
  for (const s of stages ?? []) {
    await removeStorage(s.image_url);
  }

  // CASCADE 로 stage 행도 같이 삭제됨
  const { error } = await sb.from("monster_species").delete().eq("id", args.id);
  if (error) return { ok: false as const, message: `삭제 실패: ${error.message}` };

  revalidateAll();
  return { ok: true as const };
}

/* ============== 단계 이미지 업로드 / 삭제 / EXP 수정 ============== */

export async function uploadStageImageAction(formData: FormData) {
  ensureAuth();

  const speciesId = String(formData.get("speciesId") ?? "").trim();
  const stageRaw = Number(formData.get("stage") ?? NaN);
  const stage = clampInt(stageRaw, 1, 5);
  if (!speciesId || stage === null) {
    return { ok: false as const, message: "잘못된 요청이에요." };
  }

  const file = formData.get("file");
  if (!(file instanceof File)) return { ok: false as const, message: "파일이 없어요." };
  if (file.size > MAX_FILE_BYTES) {
    return { ok: false as const, message: "이미지가 너무 커요 (1MB 이하)." };
  }
  if (!ALLOWED_MIME.includes(file.type)) {
    return { ok: false as const, message: "PNG / WebP 만 업로드할 수 있어요." };
  }

  const sb = createSupabaseServiceClient();
  const { data: cur } = await sb
    .from("monster_stage_images")
    .select("id, image_url")
    .eq("species_id", speciesId)
    .eq("stage", stage)
    .maybeSingle();
  if (!cur) return { ok: false as const, message: "단계 행을 찾을 수 없어요." };

  const ext = file.type === "image/webp" ? "webp" : "png";
  const path = `species-${speciesId}-stage-${stage}-${Date.now()}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  const { error: upErr } = await sb.storage
    .from(BUCKET)
    .upload(path, buffer, { contentType: file.type, cacheControl: "3600", upsert: false });
  if (upErr) return { ok: false as const, message: `업로드 실패: ${upErr.message}` };

  const { data: pub } = sb.storage.from(BUCKET).getPublicUrl(path);
  const imageUrl = `${pub.publicUrl}?t=${Date.now()}`;

  const { error: dbErr } = await sb
    .from("monster_stage_images")
    .update({ image_url: imageUrl, updated_at: new Date().toISOString() })
    .eq("id", cur.id);
  if (dbErr) {
    await sb.storage.from(BUCKET).remove([path]);
    return { ok: false as const, message: `DB 저장 실패: ${dbErr.message}` };
  }
  await removeStorage(cur.image_url);

  revalidateAll();
  return { ok: true as const, url: imageUrl };
}

export async function deleteStageImageAction(args: { speciesId: string; stage: number }) {
  ensureAuth();
  const stage = clampInt(args.stage, 1, 5);
  if (!args.speciesId || stage === null) {
    return { ok: false as const, message: "잘못된 요청이에요." };
  }
  if (stage === 1) {
    return { ok: false as const, message: "1단계(알) 이미지는 삭제할 수 없어요. 변경만 가능." };
  }

  const sb = createSupabaseServiceClient();
  const { data: cur } = await sb
    .from("monster_stage_images")
    .select("id, image_url")
    .eq("species_id", args.speciesId)
    .eq("stage", stage)
    .maybeSingle();
  if (!cur) return { ok: false as const, message: "단계 행을 찾을 수 없어요." };

  await removeStorage(cur.image_url);

  const { error } = await sb
    .from("monster_stage_images")
    .update({ image_url: null, updated_at: new Date().toISOString() })
    .eq("id", cur.id);
  if (error) return { ok: false as const, message: `DB 저장 실패: ${error.message}` };

  revalidateAll();
  return { ok: true as const };
}

export async function updateStageMetaAction(args: {
  speciesId: string;
  stage: number;
  stageName?: string;
  requiredExp?: number;
}) {
  ensureAuth();
  const stage = clampInt(args.stage, 1, 5);
  if (!args.speciesId || stage === null) {
    return { ok: false as const, message: "잘못된 요청이에요." };
  }

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof args.stageName === "string") {
    const n = args.stageName.trim();
    if (!n || n.length > 30) {
      return { ok: false as const, message: "단계 이름은 1~30자 이내로 입력해주세요." };
    }
    patch.stage_name = n;
  }
  if (typeof args.requiredExp === "number") {
    const v = clampInt(args.requiredExp, 0, 100000);
    if (v === null) {
      return { ok: false as const, message: "필요 EXP 가 올바르지 않아요." };
    }
    patch.required_exp = v;
  }

  const sb = createSupabaseServiceClient();
  const { error } = await sb
    .from("monster_stage_images")
    .update(patch)
    .eq("species_id", args.speciesId)
    .eq("stage", stage);
  if (error) return { ok: false as const, message: `DB 저장 실패: ${error.message}` };

  revalidateAll();
  return { ok: true as const };
}
