"use server";

// 사과나무 단계별 이미지 + 미세조정 관리자 액션.
// 단계 행은 마이그레이션에서 8개가 미리 생성되어 있으므로 update 만 한다.

import { revalidatePath } from "next/cache";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { isAdminAuthenticated } from "../auth";

function ensureAuth() {
  if (!isAdminAuthenticated()) {
    throw new Error("AUTH_REQUIRED: 비밀번호가 필요합니다.");
  }
}

function clampStage(v: unknown): number | null {
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  const i = Math.floor(v);
  if (i < 1 || i > 8) return null;
  return i;
}

function clampNumber(v: unknown, lo: number, hi: number): number | null {
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  if (v < lo || v > hi) return null;
  return v;
}

function revalidateAll() {
  revalidatePath("/admin/tree");
  revalidatePath("/me");
  revalidatePath("/");
  revalidatePath("/admin");
}

const BUCKET = "tree-stages";

export async function uploadTreeStageImageAction(formData: FormData) {
  ensureAuth();

  const stageRaw = formData.get("stage");
  const stage = clampStage(typeof stageRaw === "string" ? parseInt(stageRaw, 10) : NaN);
  if (stage === null) {
    return { ok: false as const, message: "잘못된 단계 값." };
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return { ok: false as const, message: "파일이 없어요." };
  }
  if (file.size > 1_048_576) {
    return { ok: false as const, message: "이미지가 너무 커요 (1MB 이하)." };
  }
  const allowedTypes = ["image/png", "image/webp"];
  if (!allowedTypes.includes(file.type)) {
    return {
      ok: false as const,
      message: "투명 배경 PNG 또는 WebP 만 업로드할 수 있어요.",
    };
  }

  const ext = file.type === "image/png" ? "png" : "webp";
  const path = `stage-${stage}.${ext}`;
  const otherExts = ["png", "webp"].filter((e) => e !== ext);

  const sb = createSupabaseServiceClient();
  const buffer = Buffer.from(await file.arrayBuffer());

  // 다른 확장자로 남아있는 잔존 파일 정리 (조용히)
  await sb.storage.from(BUCKET).remove(otherExts.map((e) => `stage-${stage}.${e}`));

  const { error: uploadErr } = await sb.storage
    .from(BUCKET)
    .upload(path, buffer, { contentType: file.type, upsert: true, cacheControl: "3600" });
  if (uploadErr) {
    return { ok: false as const, message: `업로드 실패: ${uploadErr.message}` };
  }

  const { data: pub } = sb.storage.from(BUCKET).getPublicUrl(path);
  const url = `${pub.publicUrl}?t=${Date.now()}`;

  const { error: dbErr } = await sb
    .from("garden_tree_stages")
    .update({ image_url: url, updated_at: new Date().toISOString() })
    .eq("stage", stage);
  if (dbErr) {
    return { ok: false as const, message: `DB 저장 실패: ${dbErr.message}` };
  }

  revalidateAll();
  return { ok: true as const, stage, imageUrl: url };
}

export async function deleteTreeStageImageAction(args: { stage: number }) {
  ensureAuth();
  const stage = clampStage(args.stage);
  if (stage === null) {
    return { ok: false as const, message: "잘못된 단계 값." };
  }

  const sb = createSupabaseServiceClient();

  // 두 확장자 모두 정리
  await sb.storage.from(BUCKET).remove([`stage-${stage}.png`, `stage-${stage}.webp`]);

  const { error: dbErr } = await sb
    .from("garden_tree_stages")
    .update({ image_url: null, updated_at: new Date().toISOString() })
    .eq("stage", stage);
  if (dbErr) {
    return { ok: false as const, message: `DB 저장 실패: ${dbErr.message}` };
  }

  revalidateAll();
  return { ok: true as const, stage };
}

export async function updateTreeStageTransformAction(args: {
  stage: number;
  scale: number;
  offsetX: number;
  offsetY: number;
}) {
  ensureAuth();
  const stage = clampStage(args.stage);
  if (stage === null) {
    return { ok: false as const, message: "잘못된 단계 값." };
  }
  const scale = clampNumber(args.scale, 0.5, 1.5);
  const offsetX = clampNumber(args.offsetX, -50, 50);
  const offsetY = clampNumber(args.offsetY, -50, 50);
  if (scale === null || offsetX === null || offsetY === null) {
    return { ok: false as const, message: "값 범위가 올바르지 않아요." };
  }

  const sb = createSupabaseServiceClient();
  const { error } = await sb
    .from("garden_tree_stages")
    .update({
      scale,
      offset_x: offsetX,
      offset_y: offsetY,
      updated_at: new Date().toISOString(),
    })
    .eq("stage", stage);
  if (error) {
    return { ok: false as const, message: `저장 실패: ${error.message}` };
  }

  revalidateAll();
  return { ok: true as const, stage, scale, offsetX, offsetY };
}
