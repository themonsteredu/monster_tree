"use server";

// /admin/yard — 마당 글로벌 배경 업로드/삭제.

import { revalidatePath } from "next/cache";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { isAdminAuthenticated } from "../auth";

const BUCKET = "yard";
const MAX_FILE_BYTES = 4_194_304; // 4MB
const ALLOWED_MIME = ["image/png", "image/jpeg", "image/webp"];

function ensureAuth() {
  if (!isAdminAuthenticated()) {
    throw new Error("AUTH_REQUIRED: 비밀번호가 필요합니다.");
  }
}

function revalidateAll() {
  revalidatePath("/admin/yard");
  revalidatePath("/me");
}

function pathFromPublicUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = url.match(/\/storage\/v1\/object\/public\/yard\/(.+?)(\?.*)?$/);
  return m ? m[1] : null;
}

async function removeOldFile(prevUrl: string | null | undefined) {
  const path = pathFromPublicUrl(prevUrl);
  if (!path) return;
  const sb = createSupabaseServiceClient();
  await sb.storage.from(BUCKET).remove([path]);
}

export async function uploadYardBackgroundAction(formData: FormData) {
  ensureAuth();
  const file = formData.get("file");
  if (!(file instanceof File)) return { ok: false as const, message: "파일이 없어요." };
  if (file.size > MAX_FILE_BYTES) {
    return { ok: false as const, message: "이미지가 너무 커요 (4MB 이하)." };
  }
  if (!ALLOWED_MIME.includes(file.type)) {
    return { ok: false as const, message: "PNG / JPG / WebP 만 업로드할 수 있어요." };
  }

  const sb = createSupabaseServiceClient();
  const { data: cur } = await sb
    .from("yard_settings")
    .select("id, background_image")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  const ext =
    file.type === "image/jpeg" ? "jpg" : file.type === "image/webp" ? "webp" : "png";
  const path = `yard-bg-${Date.now()}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error: upErr } = await sb.storage
    .from(BUCKET)
    .upload(path, buffer, { contentType: file.type, cacheControl: "3600", upsert: false });
  if (upErr) return { ok: false as const, message: `업로드 실패: ${upErr.message}` };

  const { data: pub } = sb.storage.from(BUCKET).getPublicUrl(path);
  const imageUrl = `${pub.publicUrl}?t=${Date.now()}`;

  if (cur?.id) {
    const { error } = await sb
      .from("yard_settings")
      .update({ background_image: imageUrl, updated_at: new Date().toISOString() })
      .eq("id", cur.id);
    if (error) {
      await sb.storage.from(BUCKET).remove([path]);
      return { ok: false as const, message: `DB 저장 실패: ${error.message}` };
    }
    await removeOldFile(cur.background_image);
  } else {
    const { error } = await sb.from("yard_settings").insert({ background_image: imageUrl });
    if (error) {
      await sb.storage.from(BUCKET).remove([path]);
      return { ok: false as const, message: `DB 저장 실패: ${error.message}` };
    }
  }

  revalidateAll();
  return { ok: true as const, url: imageUrl };
}

export async function deleteYardBackgroundAction() {
  ensureAuth();
  const sb = createSupabaseServiceClient();
  const { data: cur } = await sb
    .from("yard_settings")
    .select("id, background_image")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!cur?.id) return { ok: true as const };

  await removeOldFile(cur.background_image);
  const { error } = await sb
    .from("yard_settings")
    .update({ background_image: null, updated_at: new Date().toISOString() })
    .eq("id", cur.id);
  if (error) return { ok: false as const, message: `DB 저장 실패: ${error.message}` };

  revalidateAll();
  return { ok: true as const };
}
