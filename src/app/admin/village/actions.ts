"use server";

// /admin/village — 몬스터 마을 관리자 Server Actions.
// 배경 이미지 1장 + 건물별 이미지/위치/오픈여부를 관리한다.

import { revalidatePath } from "next/cache";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { isAdminAuthenticated } from "../auth";

const BUCKET = "village";
const MAX_FILE_BYTES = 2_097_152; // 2MB
const ALLOWED_MIME = ["image/png", "image/jpeg", "image/webp"];

function ensureAuth() {
  if (!isAdminAuthenticated()) {
    throw new Error("AUTH_REQUIRED: 비밀번호가 필요합니다.");
  }
}

function revalidateAll() {
  revalidatePath("/admin/village");
  revalidatePath("/me/village");
  revalidatePath("/me");
}

function extFromMime(mime: string): "png" | "jpg" | "webp" {
  if (mime === "image/jpeg") return "jpg";
  if (mime === "image/webp") return "webp";
  return "png";
}

function pathFromPublicUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = url.match(/\/storage\/v1\/object\/public\/village\/(.+?)(\?.*)?$/);
  return m ? m[1] : null;
}

async function uploadToBucket(file: File, baseName: string) {
  const sb = createSupabaseServiceClient();
  const ext = extFromMime(file.type);
  const path = `${baseName}-${Date.now()}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  const { error } = await sb.storage
    .from(BUCKET)
    .upload(path, buffer, { contentType: file.type, cacheControl: "3600", upsert: false });
  if (error) return { ok: false as const, message: `업로드 실패: ${error.message}` };
  const { data } = sb.storage.from(BUCKET).getPublicUrl(path);
  return { ok: true as const, url: `${data.publicUrl}?t=${Date.now()}`, path };
}

async function removeOldFile(prevUrl: string | null | undefined) {
  const path = pathFromPublicUrl(prevUrl);
  if (!path) return;
  const sb = createSupabaseServiceClient();
  await sb.storage.from(BUCKET).remove([path]);
}

/* ============== village_settings ============== */

export async function uploadVillageBackgroundAction(formData: FormData) {
  ensureAuth();
  const file = formData.get("file");
  if (!(file instanceof File)) return { ok: false as const, message: "파일이 없어요." };
  if (file.size > MAX_FILE_BYTES) return { ok: false as const, message: "이미지가 너무 커요 (2MB 이하)." };
  if (!ALLOWED_MIME.includes(file.type)) {
    return { ok: false as const, message: "PNG / JPG / WebP 만 업로드할 수 있어요." };
  }

  const sb = createSupabaseServiceClient();
  const { data: cur } = await sb
    .from("village_settings")
    .select("id, background_image")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  const up = await uploadToBucket(file, "background");
  if (!up.ok) return up;

  if (cur?.id) {
    const { error } = await sb
      .from("village_settings")
      .update({ background_image: up.url, updated_at: new Date().toISOString() })
      .eq("id", cur.id);
    if (error) return { ok: false as const, message: `DB 저장 실패: ${error.message}` };
    await removeOldFile(cur.background_image);
  } else {
    const { error } = await sb.from("village_settings").insert({ background_image: up.url });
    if (error) return { ok: false as const, message: `DB 저장 실패: ${error.message}` };
  }

  revalidateAll();
  return { ok: true as const, url: up.url };
}

export async function deleteVillageBackgroundAction() {
  ensureAuth();
  const sb = createSupabaseServiceClient();
  const { data: cur } = await sb
    .from("village_settings")
    .select("id, background_image")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!cur?.id) return { ok: true as const };

  await removeOldFile(cur.background_image);
  const { error } = await sb
    .from("village_settings")
    .update({ background_image: null, updated_at: new Date().toISOString() })
    .eq("id", cur.id);
  if (error) return { ok: false as const, message: `DB 저장 실패: ${error.message}` };

  revalidateAll();
  return { ok: true as const };
}

export async function updateVillageSeasonAction(args: { season: string }) {
  ensureAuth();
  const season = (args.season ?? "").trim();
  if (!season || season.length > 40) {
    return { ok: false as const, message: "시즌 이름은 1~40자 이내로 입력해주세요." };
  }
  const sb = createSupabaseServiceClient();
  const { data: cur } = await sb
    .from("village_settings")
    .select("id")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (cur?.id) {
    const { error } = await sb
      .from("village_settings")
      .update({ season, updated_at: new Date().toISOString() })
      .eq("id", cur.id);
    if (error) return { ok: false as const, message: `DB 저장 실패: ${error.message}` };
  } else {
    const { error } = await sb.from("village_settings").insert({ season });
    if (error) return { ok: false as const, message: `DB 저장 실패: ${error.message}` };
  }
  revalidateAll();
  return { ok: true as const, season };
}

/* ============== village_buildings ============== */

export async function uploadBuildingImageAction(formData: FormData) {
  ensureAuth();
  const buildingKey = String(formData.get("buildingKey") ?? "").trim();
  if (!buildingKey) return { ok: false as const, message: "건물 식별자가 없어요." };

  const file = formData.get("file");
  if (!(file instanceof File)) return { ok: false as const, message: "파일이 없어요." };
  if (file.size > MAX_FILE_BYTES) return { ok: false as const, message: "이미지가 너무 커요 (2MB 이하)." };
  if (!ALLOWED_MIME.includes(file.type)) {
    return { ok: false as const, message: "PNG / JPG / WebP 만 업로드할 수 있어요." };
  }

  const sb = createSupabaseServiceClient();
  const { data: cur, error: selErr } = await sb
    .from("village_buildings")
    .select("id, image_url")
    .eq("building_key", buildingKey)
    .maybeSingle();
  if (selErr) return { ok: false as const, message: `조회 실패: ${selErr.message}` };
  if (!cur) return { ok: false as const, message: "해당 건물이 없어요." };

  const up = await uploadToBucket(file, `building-${buildingKey}`);
  if (!up.ok) return up;

  const { error } = await sb
    .from("village_buildings")
    .update({ image_url: up.url, updated_at: new Date().toISOString() })
    .eq("id", cur.id);
  if (error) return { ok: false as const, message: `DB 저장 실패: ${error.message}` };

  await removeOldFile(cur.image_url);
  revalidateAll();
  return { ok: true as const, url: up.url };
}

export async function deleteBuildingImageAction(args: { buildingKey: string }) {
  ensureAuth();
  const key = (args.buildingKey ?? "").trim();
  if (!key) return { ok: false as const, message: "건물 식별자가 없어요." };
  const sb = createSupabaseServiceClient();
  const { data: cur } = await sb
    .from("village_buildings")
    .select("id, image_url")
    .eq("building_key", key)
    .maybeSingle();
  if (!cur) return { ok: false as const, message: "해당 건물이 없어요." };
  await removeOldFile(cur.image_url);
  const { error } = await sb
    .from("village_buildings")
    .update({ image_url: null, updated_at: new Date().toISOString() })
    .eq("id", cur.id);
  if (error) return { ok: false as const, message: `DB 저장 실패: ${error.message}` };
  revalidateAll();
  return { ok: true as const };
}

function sanitizePercent(input: unknown): string | null {
  if (input === null || input === undefined) return null;
  const raw = String(input).trim();
  if (!raw) return null;
  // 숫자만 들어온 경우 % 자동 부착.
  const stripped = raw.endsWith("%") ? raw.slice(0, -1) : raw;
  const n = Number(stripped);
  if (!Number.isFinite(n)) return null;
  if (n < -100 || n > 200) return null;
  return `${n}%`;
}

export async function updateBuildingAction(args: {
  buildingKey: string;
  positionTop?: string | null;
  positionLeft?: string | null;
  positionRight?: string | null;
  size?: string | null;
  isReady?: boolean;
  isVisible?: boolean;
}) {
  ensureAuth();
  const key = (args.buildingKey ?? "").trim();
  if (!key) return { ok: false as const, message: "건물 식별자가 없어요." };

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (args.positionTop !== undefined) {
    const v = sanitizePercent(args.positionTop);
    if (args.positionTop !== null && v === null) {
      return { ok: false as const, message: "top 값이 올바르지 않아요." };
    }
    patch.position_top = v ?? "50%";
  }
  if (args.positionLeft !== undefined) {
    const v = args.positionLeft === null || args.positionLeft === "" ? null : sanitizePercent(args.positionLeft);
    if (args.positionLeft && v === null) {
      return { ok: false as const, message: "left 값이 올바르지 않아요." };
    }
    patch.position_left = v;
  }
  if (args.positionRight !== undefined) {
    const v = args.positionRight === null || args.positionRight === "" ? null : sanitizePercent(args.positionRight);
    if (args.positionRight && v === null) {
      return { ok: false as const, message: "right 값이 올바르지 않아요." };
    }
    patch.position_right = v;
  }
  if (args.size !== undefined) {
    const v = sanitizePercent(args.size);
    if (args.size !== null && v === null) {
      return { ok: false as const, message: "size 값이 올바르지 않아요." };
    }
    patch.size = v ?? "25%";
  }
  if (typeof args.isReady === "boolean") patch.is_ready = args.isReady;
  if (typeof args.isVisible === "boolean") patch.is_visible = args.isVisible;

  const sb = createSupabaseServiceClient();
  const { error } = await sb
    .from("village_buildings")
    .update(patch)
    .eq("building_key", key);
  if (error) return { ok: false as const, message: `DB 저장 실패: ${error.message}` };

  revalidateAll();
  return { ok: true as const };
}
