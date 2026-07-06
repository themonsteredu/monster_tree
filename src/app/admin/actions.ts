"use server";

// Admin 화면에서 호출하는 Server Actions
// - 포인트 적립/차감 (대기열 등록) — 단일 / 일괄
// - pending 취소 / 적용된 로그 되돌리기
// - 학생 추가/수정/삭제 (지점 스코프)
// - 수확 (RPC 로 atomic 처리)
// - 학기 리셋 (지점 스코프 위험 작업)
// 모든 액션은 isAdminAuthenticated() 로 보호됩니다.

import { revalidatePath } from "next/cache";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { getAdminBranchId, clearAdminBranchCookie } from "@/lib/branch";
import { isAdminAuthenticated, setAdminCookie, clearAdminCookie, isAdminKey } from "./auth";

function ensureAuth() {
  if (!isAdminAuthenticated()) {
    throw new Error("AUTH_REQUIRED: 비밀번호가 필요합니다.");
  }
}

function ensureBranch(): { ok: true; branchId: string } | { ok: false; message: string } {
  const branchId = getAdminBranchId();
  if (!branchId) {
    return {
      ok: false,
      message: "지점이 선택되지 않았어요. /admin/select-branch 에서 지점을 골라주세요.",
    };
  }
  return { ok: true, branchId };
}

/* ============== 로그인 / 로그아웃 ============== */

export async function loginAction(formData: FormData) {
  const key = String(formData.get("key") ?? "");
  if (!isAdminKey(key)) {
    return { ok: false as const, message: "비밀번호가 올바르지 않아요." };
  }
  setAdminCookie(key);
  return { ok: true as const };
}

export async function logoutAction() {
  clearAdminCookie();
  clearAdminBranchCookie();
}

/* ============== 포인트 적립 (단일 / 일괄) ============== */

export async function addPointsAction(args: {
  studentId: string;
  delta: number;
  reason?: string | null;
}) {
  ensureAuth();
  const { studentId, delta, reason } = args;
  if (!studentId || !Number.isFinite(delta)) {
    return { ok: false as const, message: "잘못된 입력이에요." };
  }

  const sb = createSupabaseServiceClient();

  const { data: student, error: e1 } = await sb
    .from("garden_students")
    .select("id")
    .eq("id", studentId)
    .single();
  if (e1 || !student) {
    return { ok: false as const, message: "학생을 찾을 수 없어요." };
  }

  const { error: e2 } = await sb.from("garden_pending_points").insert({
    student_id: studentId,
    points: Math.trunc(delta),
    reason: reason?.trim() ? reason.trim() : null,
  });
  if (e2) {
    return { ok: false as const, message: `적립 등록 실패: ${e2.message}` };
  }

  revalidatePath("/admin");
  return { ok: true as const, pending: true };
}

export async function addPointsBulkAction(args: {
  studentIds: string[];
  delta: number;
  reason?: string | null;
}) {
  ensureAuth();
  const { studentIds, delta, reason } = args;
  if (!Array.isArray(studentIds) || studentIds.length === 0) {
    return { ok: false as const, message: "선택된 학생이 없어요." };
  }
  if (!Number.isFinite(delta)) {
    return { ok: false as const, message: "잘못된 포인트입니다." };
  }

  const sb = createSupabaseServiceClient();
  const { data, error } = await sb.rpc("garden_award_pending_bulk", {
    p_student_ids: studentIds,
    p_points: Math.trunc(delta),
    p_reason: reason ?? null,
  });
  if (error) {
    return { ok: false as const, message: `일괄 적립 실패: ${error.message}` };
  }

  revalidatePath("/admin");
  return { ok: true as const, count: (data as number | null) ?? studentIds.length };
}

/* ============== 되돌리기 / 취소 ============== */

export async function cancelPendingAction(args: { pendingId: string }) {
  ensureAuth();
  if (!args.pendingId) {
    return { ok: false as const, message: "잘못된 입력이에요." };
  }
  const sb = createSupabaseServiceClient();
  const { error } = await sb
    .from("garden_pending_points")
    .delete()
    .eq("id", args.pendingId);
  if (error) {
    return { ok: false as const, message: `취소 실패: ${error.message}` };
  }
  revalidatePath("/admin");
  return { ok: true as const };
}

export async function undoLogAction(args: { logId: string }) {
  ensureAuth();
  if (!args.logId) {
    return { ok: false as const, message: "잘못된 입력이에요." };
  }
  const sb = createSupabaseServiceClient();
  const { data, error } = await sb.rpc("garden_undo_log", {
    p_log_id: args.logId,
  });
  if (error) {
    if (error.message?.includes("log_not_found")) {
      return { ok: false as const, message: "이미 사라진 기록이에요." };
    }
    if (error.message?.includes("student_not_found")) {
      return { ok: false as const, message: "학생을 찾을 수 없어요." };
    }
    return { ok: false as const, message: `되돌리기 실패: ${error.message}` };
  }
  const result = data as {
    ok: true;
    reverted_points: number;
    new_total: number;
    new_stage: number;
    student_id: string;
  };
  revalidatePath("/admin");
  revalidatePath("/");
  return {
    ok: true as const,
    revertedPoints: result.reverted_points,
    newTotal: result.new_total,
    newStage: result.new_stage,
    studentId: result.student_id,
  };
}

/* ============== 수확 ============== */

export async function harvestStudentAction(args: { studentId: string }) {
  ensureAuth();
  const { studentId } = args;
  if (!studentId) {
    return { ok: false as const, message: "잘못된 입력이에요." };
  }

  const sb = createSupabaseServiceClient();

  const { data, error } = await sb.rpc("garden_harvest_student", {
    p_student_id: studentId,
  });
  if (error) {
    if (error.message?.includes("student_not_found")) {
      return { ok: false as const, message: "학생을 찾을 수 없어요." };
    }
    if (error.message?.includes("not_yet_harvest_stage")) {
      return {
        ok: false as const,
        message: "8단계(380pt 이상)에 도달한 학생만 수확할 수 있어요.",
      };
    }
    return { ok: false as const, message: `수확 실패: ${error.message}` };
  }

  const result = data as {
    ok: true;
    apples: number;
    new_total: number;
    new_stage: number;
  };

  revalidatePath("/admin");
  revalidatePath("/");
  return {
    ok: true as const,
    apples: result.apples,
    newTotal: result.new_total,
    newStage: result.new_stage,
  };
}

/* ============== 학생 CRUD (지점 스코프) ============== */

export async function createStudentAction(args: {
  name: string;
  className?: string | null;
}) {
  ensureAuth();
  const branchCheck = ensureBranch();
  if (!branchCheck.ok) {
    return { ok: false as const, message: branchCheck.message };
  }
  const name = args.name.trim();
  if (!name) return { ok: false as const, message: "이름을 입력해주세요." };

  const sb = createSupabaseServiceClient();
  const { error } = await sb.from("garden_students").insert({
    name,
    class_name: args.className?.trim() ? args.className.trim() : null,
    branch_id: branchCheck.branchId,
    total_points: 0,
    current_stage: 1,
    is_active: true,
  });
  if (error) return { ok: false as const, message: error.message };

  revalidatePath("/admin/students");
  revalidatePath("/admin");
  revalidatePath("/");
  return { ok: true as const };
}

export async function updateStudentAction(args: {
  id: string;
  name?: string;
  className?: string | null;
  isActive?: boolean;
}) {
  ensureAuth();
  const sb = createSupabaseServiceClient();

  const patch: Record<string, unknown> = {};
  if (typeof args.name === "string" && args.name.trim()) patch.name = args.name.trim();
  if (args.className !== undefined)
    patch.class_name = args.className?.trim() ? args.className.trim() : null;
  if (typeof args.isActive === "boolean") patch.is_active = args.isActive;

  if (Object.keys(patch).length === 0) {
    return { ok: false as const, message: "변경할 내용이 없어요." };
  }

  const { error } = await sb.from("garden_students").update(patch).eq("id", args.id);
  if (error) return { ok: false as const, message: error.message };

  revalidatePath("/admin/students");
  revalidatePath("/admin");
  revalidatePath("/");
  return { ok: true as const };
}

export async function deleteStudentAction(args: { id: string }) {
  ensureAuth();
  const sb = createSupabaseServiceClient();
  const { error } = await sb.from("garden_students").delete().eq("id", args.id);
  if (error) return { ok: false as const, message: error.message };

  revalidatePath("/admin/students");
  revalidatePath("/admin");
  revalidatePath("/");
  return { ok: true as const };
}

/* ============== 학기 리셋 (지점 스코프) ============== */

export async function resetSemesterAction(args: { confirmText: string }) {
  ensureAuth();
  if (args.confirmText !== "학기 리셋") {
    return { ok: false as const, message: "확인 문구가 일치하지 않아요." };
  }
  const branchCheck = ensureBranch();
  if (!branchCheck.ok) {
    return { ok: false as const, message: branchCheck.message };
  }
  const sb = createSupabaseServiceClient();
  const { data, error } = await sb.rpc("garden_reset_semester", {
    p_branch_id: branchCheck.branchId,
  });
  if (error) {
    if (error.message?.includes("branch_id_required")) {
      return { ok: false as const, message: "지점 ID 누락 (서버 설정 오류)" };
    }
    return { ok: false as const, message: `리셋 실패: ${error.message}` };
  }
  const result = data as {
    ok: true;
    student_count: number;
    pending_deleted: number;
  };
  revalidatePath("/admin");
  revalidatePath("/admin/reset");
  revalidatePath("/admin/students");
  revalidatePath("/");
  return {
    ok: true as const,
    studentCount: result.student_count,
    pendingDeleted: result.pending_deleted,
  };
}

/* ============== 아바타 갤러리 관리 (관리자 업로드) ============== */

const GALLERY_CATEGORIES = [
  "base",
  "outfit",
  "bottom",
  "shoes",
  "hair",
  "face",
  "hat",
  "accessory",
] as const;
type GalleryCategory = (typeof GALLERY_CATEGORIES)[number];

function isGalleryCategory(v: unknown): v is GalleryCategory {
  return typeof v === "string" && (GALLERY_CATEGORIES as readonly string[]).includes(v);
}

// 카테고리별 갤러리 아이템 기본 위치/크기. types.ts 의 DEFAULT_GALLERY_POSITION_BY_CATEGORY
// 와 일치 — 서버에서 import 하기보다 동일 값을 복제(서버 코드 경로 분리).
const GALLERY_DEFAULT_POSITION: Record<GalleryCategory, { x: number; y: number; scaleX: number; scaleY: number }> = {
  base:      { x: 50, y: 50, scaleX: 100, scaleY: 100 },
  outfit:    { x: 50, y: 52, scaleX: 45,  scaleY: 45 },
  bottom:    { x: 50, y: 70, scaleX: 40,  scaleY: 40 },
  shoes:     { x: 50, y: 88, scaleX: 35,  scaleY: 35 },
  hair:      { x: 50, y: 20, scaleX: 50,  scaleY: 50 },
  face:      { x: 50, y: 33, scaleX: 35,  scaleY: 35 },
  hat:       { x: 50, y: 15, scaleX: 45,  scaleY: 45 },
  accessory: { x: 50, y: 33, scaleX: 35,  scaleY: 35 },
};

function isValidPosition(p: unknown): p is { x: number; y: number; scaleX: number; scaleY: number } {
  if (!p || typeof p !== "object") return false;
  const o = p as Record<string, unknown>;
  const num = (v: unknown, lo: number, hi: number) =>
    typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi;
  return num(o.x, 0, 100) && num(o.y, 0, 100) && num(o.scaleX, 10, 200) && num(o.scaleY, 10, 200);
}

// 관리자: 카테고리에 이미지 업로드. avatars 버킷의 gallery/<category>/<uuid>.<ext> 경로.
export async function uploadGalleryItemAction(formData: FormData) {
  ensureAuth();
  const file = formData.get("file");
  const category = formData.get("category");
  const label = formData.get("label");
  const priceRaw = formData.get("price");
  const price =
    typeof priceRaw === "string" && /^\d{1,6}$/.test(priceRaw.trim())
      ? Math.min(100_000, Number(priceRaw.trim()))
      : 0;
  if (!(file instanceof File)) {
    return { ok: false as const, message: "파일이 없어요." };
  }
  if (!isGalleryCategory(category)) {
    return { ok: false as const, message: "잘못된 카테고리." };
  }
  if (file.size > 2_097_152) {
    return { ok: false as const, message: "이미지가 너무 커요 (2MB 이하)." };
  }
  // JPG 는 투명도를 지원하지 않아 정원 배경 위에서 회색·흰색 사각형으로 보이므로 차단.
  const allowedTypes = ["image/png", "image/webp"];
  if (!allowedTypes.includes(file.type)) {
    return {
      ok: false as const,
      message: "투명 배경 PNG 또는 WebP 만 업로드할 수 있어요. (JPG 는 투명도 미지원)",
    };
  }
  const ext = file.type === "image/png" ? "png" : "webp";
  const id = crypto.randomUUID();
  const path = `gallery/${category}/${id}.${ext}`;

  const sb = createSupabaseServiceClient();
  const buffer = Buffer.from(await file.arrayBuffer());
  const { error: uploadErr } = await sb.storage
    .from("avatars")
    .upload(path, buffer, { contentType: file.type, upsert: false, cacheControl: "31536000" });
  if (uploadErr) {
    return { ok: false as const, message: `업로드 실패: ${uploadErr.message}` };
  }
  const { data: pub } = sb.storage.from("avatars").getPublicUrl(path);
  const url = pub.publicUrl;

  const { data: maxRow } = await sb
    .from("garden_avatar_gallery")
    .select("sort_order")
    .eq("category", category)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const sort_order = (maxRow?.sort_order ?? 0) + 1;

  const { error: dbErr } = await sb.from("garden_avatar_gallery").insert({
    category,
    label: typeof label === "string" && label.length > 0 ? label.slice(0, 60) : null,
    image_url: url,
    position: GALLERY_DEFAULT_POSITION[category],
    sort_order,
    active: true,
    price,
  });
  if (dbErr) {
    await sb.storage.from("avatars").remove([path]);
    return { ok: false as const, message: `DB 저장 실패: ${dbErr.message}` };
  }
  revalidatePath("/admin/gallery");
  return { ok: true as const };
}

// 관리자: 활성/비활성 토글.
export async function setGalleryItemActiveAction(args: { id: string; active: boolean }) {
  ensureAuth();
  if (typeof args.id !== "string" || args.id.length === 0) {
    return { ok: false as const, message: "잘못된 ID." };
  }
  const sb = createSupabaseServiceClient();
  const { error } = await sb
    .from("garden_avatar_gallery")
    .update({ active: args.active })
    .eq("id", args.id);
  if (error) {
    return { ok: false as const, message: `변경 실패: ${error.message}` };
  }
  revalidatePath("/admin/gallery");
  return { ok: true as const };
}

// 관리자: 갤러리 항목 삭제. Storage 파일도 함께 제거.
export async function deleteGalleryItemAction(args: { id: string }) {
  ensureAuth();
  if (typeof args.id !== "string" || args.id.length === 0) {
    return { ok: false as const, message: "잘못된 ID." };
  }
  const sb = createSupabaseServiceClient();
  const { data: row, error: selErr } = await sb
    .from("garden_avatar_gallery")
    .select("image_url")
    .eq("id", args.id)
    .maybeSingle();
  if (selErr || !row) {
    return { ok: false as const, message: "항목을 찾지 못했어요." };
  }
  const marker = "/storage/v1/object/public/avatars/";
  const idx = row.image_url.indexOf(marker);
  if (idx >= 0) {
    const path = row.image_url.substring(idx + marker.length).split("?")[0];
    await sb.storage.from("avatars").remove([path]);
  }
  const { error: delErr } = await sb.from("garden_avatar_gallery").delete().eq("id", args.id);
  if (delErr) {
    return { ok: false as const, message: `삭제 실패: ${delErr.message}` };
  }
  revalidatePath("/admin/gallery");
  return { ok: true as const };
}

// 관리자: 갤러리 항목 가격/스타일기준 수정 (0045 획득 루프 + AI 생성기).
export async function updateGalleryItemMetaAction(args: {
  id: string;
  price?: number;
  is_style_ref?: boolean;
}) {
  ensureAuth();
  if (typeof args.id !== "string" || args.id.length === 0) {
    return { ok: false as const, message: "잘못된 ID." };
  }
  const patch: Record<string, unknown> = {};
  if (args.price !== undefined) {
    if (!Number.isInteger(args.price) || args.price < 0 || args.price > 100_000) {
      return { ok: false as const, message: "가격은 0~100,000 P 사이의 정수여야 해요." };
    }
    patch.price = args.price;
  }
  if (args.is_style_ref !== undefined) {
    patch.is_style_ref = !!args.is_style_ref;
  }
  if (Object.keys(patch).length === 0) {
    return { ok: false as const, message: "바꿀 내용이 없어요." };
  }
  const sb = createSupabaseServiceClient();
  const { error } = await sb.from("garden_avatar_gallery").update(patch).eq("id", args.id);
  if (error) {
    return { ok: false as const, message: `저장 실패: ${error.message}` };
  }
  revalidatePath("/admin/gallery");
  return { ok: true as const };
}

// ============================================================
// AI 아바타 아이템 생성 (OPENAI_API_KEY 필요)
//
// 흐름: 관리자가 이름+카테고리 입력 → ⭐스타일 기준 이미지(있으면 최대 3장)를
// 참조해 같은 그림체로 1장 생성 (background=transparent) → b64 로 반환 →
// 클라이언트가 미리보기 후 기존 업로드 파이프라인(크롭·등록)으로 저장.
// 키가 없으면 needKey=true 로 안내만 반환 (기능 자체는 조용히 비활성).
// ============================================================
export async function generateAvatarItemAction(args: {
  prompt: string;
  category: string;
}): Promise<
  | { ok: true; imageB64: string; usedStyleRefs: number }
  | { ok: false; needKey?: boolean; message: string }
> {
  ensureAuth();
  const apiKey = (process.env.OPENAI_API_KEY ?? "").trim();
  if (!apiKey) {
    return {
      ok: false as const,
      needKey: true,
      message:
        "OPENAI_API_KEY 환경변수가 없어요. Vercel → Settings → Environment Variables 에 추가하면 AI 생성이 켜집니다.",
    };
  }
  const prompt = (args.prompt ?? "").trim().slice(0, 200);
  if (prompt.length < 2) {
    return { ok: false as const, message: "만들 아이템을 2자 이상 입력해주세요." };
  }
  if (!isGalleryCategory(args.category)) {
    return { ok: false as const, message: "잘못된 카테고리." };
  }
  const categoryLabelMap: Record<string, string> = {
    base: "full body character (베이스 캐릭터, 전신)",
    outfit: "top clothing item only, no body (상의)",
    bottom: "bottom clothing item only, no body (하의)",
    shoes: "pair of shoes only (신발)",
    hair: "hairstyle only, no face (헤어)",
    face: "facial expression only — eyes, nose, mouth (얼굴 표정)",
    hat: "hat / headwear only (모자)",
    accessory: "small accessory item only (액세서리)",
  };
  const fullPrompt =
    `${prompt} — cute avatar part for a kids' game: ${categoryLabelMap[args.category]}. ` +
    `Single item centered, fully transparent background, no text, no watermark. ` +
    `Match the exact art style, line weight and coloring of the reference images (same character universe).`;

  // ⭐ 스타일 기준 이미지 (전역, 최대 3장). 없으면 같은 카테고리 최신 2장.
  const sb = createSupabaseServiceClient();
  const { data: refRows } = await sb
    .from("garden_avatar_gallery")
    .select("image_url, is_style_ref, category, created_at")
    .eq("active", true)
    .order("created_at", { ascending: false })
    .limit(60);
  const rows = refRows ?? [];
  let refs = rows.filter((r) => r.is_style_ref).slice(0, 3);
  if (refs.length === 0) {
    refs = rows.filter((r) => r.category === args.category).slice(0, 2);
  }

  try {
    let res: Response;
    if (refs.length > 0) {
      // 참조 이미지와 함께 편집(edits) 엔드포인트 — 그림체 유지의 핵심.
      const fd = new FormData();
      fd.append("model", "gpt-image-1");
      fd.append("prompt", fullPrompt);
      fd.append("size", "1024x1024");
      fd.append("background", "transparent");
      fd.append("n", "1");
      for (let i = 0; i < refs.length; i++) {
        const imgRes = await fetch(refs[i].image_url, { cache: "no-store" });
        if (!imgRes.ok) continue;
        const blob = await imgRes.blob();
        fd.append("image[]", new File([blob], `ref${i}.png`, { type: blob.type || "image/png" }));
      }
      res = await fetch("https://api.openai.com/v1/images/edits", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}` },
        body: fd,
      });
    } else {
      res = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-image-1",
          prompt: fullPrompt,
          size: "1024x1024",
          background: "transparent",
          n: 1,
        }),
      });
    }
    if (!res.ok) {
      const errBody = await res.text();
      let msg = `생성 실패 (${res.status})`;
      try {
        const j = JSON.parse(errBody) as { error?: { message?: string } };
        if (j.error?.message) msg = `생성 실패: ${j.error.message.slice(0, 200)}`;
      } catch {
        // 원문 유지
      }
      return { ok: false as const, message: msg };
    }
    const json = (await res.json()) as { data?: Array<{ b64_json?: string }> };
    const b64 = json.data?.[0]?.b64_json;
    if (!b64) {
      return { ok: false as const, message: "생성 응답에 이미지가 없어요. 다시 시도해주세요." };
    }
    return { ok: true as const, imageB64: b64, usedStyleRefs: refs.length };
  } catch (e) {
    return { ok: false as const, message: `생성 요청 실패: ${(e as Error).message}` };
  }
}

// 관리자: 전체 목록 (활성/비활성 모두) 조회.
export async function listAllGalleryItemsAction() {
  ensureAuth();
  const sb = createSupabaseServiceClient();
  const { data, error } = await sb
    .from("garden_avatar_gallery")
    .select("id, category, label, image_url, position, sort_order, active, created_at, price, is_style_ref")
    .order("category", { ascending: true })
    .order("sort_order", { ascending: true });
  if (error) {
    return { ok: false as const, message: `조회 실패: ${error.message}` };
  }
  return { ok: true as const, items: data ?? [] };
}

// 관리자: 갤러리 항목 위치/크기 (position) 업데이트.
export async function updateGalleryItemPositionAction(args: {
  id: string;
  position: unknown;
}) {
  ensureAuth();
  if (typeof args.id !== "string" || args.id.length === 0) {
    return { ok: false as const, message: "잘못된 ID." };
  }
  if (!isValidPosition(args.position)) {
    return { ok: false as const, message: "잘못된 위치 값." };
  }
  const sb = createSupabaseServiceClient();
  const { error } = await sb
    .from("garden_avatar_gallery")
    .update({ position: args.position })
    .eq("id", args.id);
  if (error) {
    return { ok: false as const, message: `저장 실패: ${error.message}` };
  }
  revalidatePath("/admin/gallery");
  revalidatePath("/me");
  revalidatePath("/");
  return { ok: true as const, position: args.position };
}
