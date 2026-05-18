"use server";

// /admin/decorations — 마당 소품 마스터 CRUD + 이미지 업로드.
// 학생 보유/배치 데이터(student_decorations / student_yard_layout) 는 Phase 3 에서 학생 측 액션으로 다룬다.

import { revalidatePath } from "next/cache";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { isAdminAuthenticated } from "../auth";
import type { DecorationCategory } from "@/lib/types";

const BUCKET = "decorations";
const MAX_FILE_BYTES = 1_048_576; // 1MB
const ALLOWED_MIME = ["image/png", "image/webp"];
const VALID_CATEGORIES: DecorationCategory[] = [
  "insect",
  "flower",
  "furniture",
  "plant",
  "misc",
];

function ensureAuth() {
  if (!isAdminAuthenticated()) {
    throw new Error("AUTH_REQUIRED: 비밀번호가 필요합니다.");
  }
}

function revalidateAll() {
  revalidatePath("/admin/decorations");
}

function clampNumber(n: unknown, lo: number, hi: number): number | null {
  if (typeof n !== "number" || !Number.isFinite(n)) return null;
  if (n < lo || n > hi) return null;
  return n;
}

function pathFromPublicUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = url.match(/\/storage\/v1\/object\/public\/decorations\/(.+?)(\?.*)?$/);
  return m ? m[1] : null;
}

async function removeStorage(prevUrl: string | null | undefined) {
  const path = pathFromPublicUrl(prevUrl);
  if (!path) return;
  const sb = createSupabaseServiceClient();
  await sb.storage.from(BUCKET).remove([path]);
}

function validCategory(value: unknown): value is DecorationCategory {
  return typeof value === "string" && (VALID_CATEGORIES as string[]).includes(value);
}

export async function createDecorationItemAction(formData: FormData) {
  ensureAuth();

  const name = String(formData.get("name") ?? "").trim();
  const categoryRaw = String(formData.get("category") ?? "");
  const priceRaw = Number(formData.get("price") ?? 0);
  const widthRaw = Number(formData.get("defaultWidthPercent") ?? 8);
  const file = formData.get("file");

  if (!name || name.length > 40) {
    return { ok: false as const, message: "이름은 1~40자 이내로 입력해주세요." };
  }
  if (!validCategory(categoryRaw)) {
    return { ok: false as const, message: "카테고리가 올바르지 않아요." };
  }
  const price = clampNumber(priceRaw, 0, 1_000_000);
  if (price === null) {
    return { ok: false as const, message: "가격은 0 이상 100만 이하여야 해요." };
  }
  const defaultWidth = clampNumber(widthRaw, 1, 80);
  if (defaultWidth === null) {
    return { ok: false as const, message: "기본 크기(%)는 1~80 이내여야 해요." };
  }
  if (!(file instanceof File)) {
    return { ok: false as const, message: "이미지 파일이 없어요." };
  }
  if (file.size > MAX_FILE_BYTES) {
    return { ok: false as const, message: "이미지가 너무 커요 (1MB 이하)." };
  }
  if (!ALLOWED_MIME.includes(file.type)) {
    return { ok: false as const, message: "투명 배경 PNG 또는 WebP 만 업로드할 수 있어요." };
  }

  const ext = file.type === "image/webp" ? "webp" : "png";
  const path = `deco-${categoryRaw}-${Date.now()}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const sb = createSupabaseServiceClient();
  const { error: upErr } = await sb.storage
    .from(BUCKET)
    .upload(path, buffer, { contentType: file.type, cacheControl: "3600", upsert: false });
  if (upErr) {
    return { ok: false as const, message: `업로드 실패: ${upErr.message}` };
  }
  const { data: pub } = sb.storage.from(BUCKET).getPublicUrl(path);
  const imageUrl = `${pub.publicUrl}?t=${Date.now()}`;

  const { error: insErr } = await sb.from("decoration_items").insert({
    name,
    category: categoryRaw,
    image_url: imageUrl,
    price,
    default_width_percent: defaultWidth,
    is_active: true,
  });
  if (insErr) {
    // 롤백: 업로드된 파일 제거
    await sb.storage.from(BUCKET).remove([path]);
    return { ok: false as const, message: `DB 저장 실패: ${insErr.message}` };
  }

  revalidateAll();
  return { ok: true as const };
}

export async function updateDecorationItemAction(args: {
  id: string;
  name?: string;
  category?: string;
  price?: number;
  defaultWidthPercent?: number;
  isActive?: boolean;
}) {
  ensureAuth();
  if (!args.id) return { ok: false as const, message: "id 가 없어요." };

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (typeof args.name === "string") {
    const n = args.name.trim();
    if (!n || n.length > 40) {
      return { ok: false as const, message: "이름은 1~40자 이내로 입력해주세요." };
    }
    patch.name = n;
  }
  if (typeof args.category === "string") {
    if (!validCategory(args.category)) {
      return { ok: false as const, message: "카테고리가 올바르지 않아요." };
    }
    patch.category = args.category;
  }
  if (typeof args.price === "number") {
    const p = clampNumber(args.price, 0, 1_000_000);
    if (p === null) return { ok: false as const, message: "가격은 0 이상 100만 이하여야 해요." };
    patch.price = p;
  }
  if (typeof args.defaultWidthPercent === "number") {
    const w = clampNumber(args.defaultWidthPercent, 1, 80);
    if (w === null) return { ok: false as const, message: "기본 크기(%)는 1~80 이내여야 해요." };
    patch.default_width_percent = w;
  }
  if (typeof args.isActive === "boolean") {
    patch.is_active = args.isActive;
  }

  const sb = createSupabaseServiceClient();
  const { error } = await sb.from("decoration_items").update(patch).eq("id", args.id);
  if (error) return { ok: false as const, message: `DB 저장 실패: ${error.message}` };

  revalidateAll();
  return { ok: true as const };
}

export async function deleteDecorationItemAction(args: { id: string }) {
  ensureAuth();
  if (!args.id) return { ok: false as const, message: "id 가 없어요." };

  const sb = createSupabaseServiceClient();
  const { data: row } = await sb
    .from("decoration_items")
    .select("id, image_url")
    .eq("id", args.id)
    .maybeSingle();
  if (!row) return { ok: false as const, message: "이미 삭제된 항목이에요." };

  const { error } = await sb.from("decoration_items").delete().eq("id", args.id);
  if (error) return { ok: false as const, message: `DB 삭제 실패: ${error.message}` };

  await removeStorage(row.image_url);
  revalidateAll();
  return { ok: true as const };
}
