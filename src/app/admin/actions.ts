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

const GALLERY_CATEGORIES = ["base", "outfit", "bottom", "shoes", "hat", "accessory"] as const;
type GalleryCategory = (typeof GALLERY_CATEGORIES)[number];

function isGalleryCategory(v: unknown): v is GalleryCategory {
  return typeof v === "string" && (GALLERY_CATEGORIES as readonly string[]).includes(v);
}

// {x, y, scale} 위치 메타데이터의 형식만 검증해 정상화 — 범위 클램프.
function normalizeItemPosition(raw: unknown): { x: number; y: number; scale: number } | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const num = (v: unknown, lo: number, hi: number, fb: number) => {
    const n = typeof v === "number" ? v : Number(v);
    if (!Number.isFinite(n)) return fb;
    return Math.min(hi, Math.max(lo, n));
  };
  return {
    x: num(r.x, 0, 100, 50),
    y: num(r.y, 0, 100, 50),
    scale: num(r.scale, 10, 200, 100),
  };
}

// 진단용: 인증 통과 후 즉시 응답하는 가장 단순한 server action.
// 갤러리 업로드 hang 의 원인이 server action 인프라인지(여기도 hang),
// 업로드 로직 자체(이건 OK, 업로드는 hang)인지 가르기 위함.
export async function pingAction() {
  ensureAuth();
  return { ok: true as const, ts: Date.now() };
}

// 관리자: 카테고리에 이미지 업로드. avatars 버킷의 gallery/<category>/<uuid>.<ext> 경로.
// 진단을 위해 각 단계에 console.log 를 깐다 — Vercel → Logs 탭에서 확인.
export async function uploadGalleryItemAction(formData: FormData) {
  console.log("[upload] ① 진입");
  ensureAuth();
  console.log("[upload] ② 인증 통과");

  const file = formData.get("file");
  const category = formData.get("category");
  const label = formData.get("label");
  console.log("[upload] ③ formData 파싱", {
    fileIsFile: file instanceof File,
    fileName: file instanceof File ? file.name : null,
    fileType: file instanceof File ? file.type : null,
    fileSizeKB: file instanceof File ? Math.round(file.size / 1024) : null,
    category,
    label,
  });
  if (!(file instanceof File)) {
    console.warn("[upload] ✗ 파일 없음");
    return { ok: false as const, message: "파일이 없어요." };
  }
  if (!isGalleryCategory(category)) {
    console.warn("[upload] ✗ 카테고리 잘못됨", category);
    return { ok: false as const, message: "잘못된 카테고리." };
  }
  if (file.size > 5_242_880) {
    console.warn("[upload] ✗ 사이즈 초과", file.size);
    return { ok: false as const, message: "이미지가 너무 커요 (5MB 이하)." };
  }
  // JPG 는 투명도를 지원하지 않아 정원 배경 위에서 회색·흰색 사각형으로 보이므로 차단.
  const allowedTypes = ["image/png", "image/webp"];
  if (!allowedTypes.includes(file.type)) {
    console.warn("[upload] ✗ 타입 거부", file.type);
    return {
      ok: false as const,
      message: "투명 배경 PNG 또는 WebP 만 업로드할 수 있어요. (JPG 는 투명도 미지원)",
    };
  }
  const ext = file.type === "image/png" ? "png" : "webp";
  const id = crypto.randomUUID();
  const path = `gallery/${category}/${id}.${ext}`;
  console.log("[upload] ④ 경로 준비", { path });

  const sb = createSupabaseServiceClient();
  let buffer: Buffer;
  try {
    buffer = Buffer.from(await file.arrayBuffer());
  } catch (e) {
    console.error("[upload] ✗ arrayBuffer 실패", e);
    return { ok: false as const, message: `파일 읽기 실패: ${(e as Error).message}` };
  }
  console.log("[upload] ⑤ 버퍼 준비 완료", { bufferKB: Math.round(buffer.length / 1024) });

  const storageResult = await sb.storage
    .from("avatars")
    .upload(path, buffer, { contentType: file.type, upsert: false, cacheControl: "31536000" });
  console.log("[upload] ⑥ 스토리지 결과", {
    data: storageResult.data,
    error: storageResult.error,
  });
  if (storageResult.error) {
    return { ok: false as const, message: `업로드 실패: ${storageResult.error.message}` };
  }

  const { data: pub } = sb.storage.from("avatars").getPublicUrl(path);
  const url = pub.publicUrl;
  console.log("[upload] ⑦ public URL", { url });

  const sortResult = await sb
    .from("garden_avatar_gallery")
    .select("sort_order")
    .eq("category", category)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  console.log("[upload] ⑧ sort_order 조회", {
    data: sortResult.data,
    error: sortResult.error,
  });
  const sort_order = (sortResult.data?.sort_order ?? 0) + 1;

  const insertResult = await sb.from("garden_avatar_gallery").insert({
    category,
    label: typeof label === "string" && label.length > 0 ? label.slice(0, 60) : null,
    image_url: url,
    sort_order,
    active: true,
  });
  console.log("[upload] ⑨ DB insert 결과", {
    data: insertResult.data,
    error: insertResult.error,
    status: insertResult.status,
  });
  if (insertResult.error) {
    await sb.storage.from("avatars").remove([path]);
    return { ok: false as const, message: `DB 저장 실패: ${insertResult.error.message}` };
  }

  revalidatePath("/admin/gallery");
  console.log("[upload] ✓ 완료");
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

// 관리자: 갤러리 항목 위치/크기 메타데이터 갱신.
// position === null 이면 카테고리 기본값으로 fallback.
export async function setGalleryItemPositionAction(args: {
  id: string;
  position: { x: number; y: number; scale: number } | null;
}) {
  ensureAuth();
  if (typeof args.id !== "string" || args.id.length === 0) {
    return { ok: false as const, message: "잘못된 ID." };
  }
  const position = args.position === null ? null : normalizeItemPosition(args.position);
  if (args.position !== null && position === null) {
    return { ok: false as const, message: "잘못된 위치 데이터." };
  }
  const sb = createSupabaseServiceClient();
  const { error } = await sb
    .from("garden_avatar_gallery")
    .update({ position })
    .eq("id", args.id);
  if (error) {
    return { ok: false as const, message: `위치 저장 실패: ${error.message}` };
  }
  revalidatePath("/admin/gallery");
  revalidatePath("/me");
  revalidatePath("/");
  return { ok: true as const };
}

// 관리자: 한 갤러리 항목의 현재 position 을, 그 항목을 슬롯에 끼운 모든 학생
// 아바타에 일괄 전파한다. 학생 picker 가 선택 시점에 position 을 스냅샷하므로
// 관리자가 위치를 바꿔도 기본적으로는 기존 학생에 반영되지 않음 — 이 액션이
// 명시적 동의를 받아 일괄 갱신해주는 역할.
//
// 매칭 기준: 학생 avatar.kind === 'gallery' 이고, 어떤 슬롯의 값이
//   - 단순 URL 문자열로 image_url 과 일치, 또는
//   - { url, position? } 객체에서 url 이 image_url 과 일치
// 인 학생을 골라, 해당 슬롯을 { url, position: <새 위치> } 로 갱신.
//
// 학생 수가 많지 않은 학원 환경 가정 — 한 줄씩 SELECT/UPDATE.
export async function propagateGalleryItemPositionAction(args: { id: string }) {
  ensureAuth();
  if (typeof args.id !== "string" || args.id.length === 0) {
    return { ok: false as const, message: "잘못된 ID." };
  }
  const sb = createSupabaseServiceClient();
  const { data: item, error: itemErr } = await sb
    .from("garden_avatar_gallery")
    .select("image_url, position")
    .eq("id", args.id)
    .maybeSingle();
  if (itemErr || !item) {
    return { ok: false as const, message: "항목을 찾지 못했어요." };
  }
  const targetUrl = item.image_url as string;
  const newPosition = item.position as { x: number; y: number; scale: number } | null;

  const { data: rows, error: selErr } = await sb
    .from("garden_students")
    .select("id, avatar")
    .not("avatar", "is", null);
  if (selErr) return { ok: false as const, message: `학생 조회 실패: ${selErr.message}` };

  const SLOT_KEYS = ["base", "outfit", "bottom", "shoes", "hair", "face", "hat", "accessory"];
  let updated = 0;
  for (const row of rows ?? []) {
    const avatar = row.avatar as Record<string, unknown> | null;
    if (!avatar || avatar.kind !== "gallery") continue;
    let mutated = false;
    const next: Record<string, unknown> = { ...avatar };
    for (const slot of SLOT_KEYS) {
      const v = avatar[slot];
      let url: string | null = null;
      if (typeof v === "string") url = v;
      else if (v && typeof v === "object" && typeof (v as { url?: unknown }).url === "string") {
        url = (v as { url: string }).url;
      }
      if (url !== targetUrl) continue;
      next[slot] = newPosition ? { url, position: newPosition } : { url };
      mutated = true;
    }
    if (!mutated) continue;
    const { error: updErr } = await sb
      .from("garden_students")
      .update({ avatar: next })
      .eq("id", row.id);
    if (!updErr) updated++;
  }
  revalidatePath("/me");
  revalidatePath("/");
  revalidatePath("/admin");
  return { ok: true as const, updated };
}

// 관리자: position 이 null 인 항목들에 카테고리별 기본 위치를 한 번에 채워준다.
// 일괄 재처리 흐름의 보조 단계 — 신규 항목/마이그레이션 직후 일괄 초기화에 사용.
export async function seedDefaultPositionsAction() {
  ensureAuth();
  const DEFAULT_ITEM_POSITION: Record<string, { x: number; y: number; scale: number }> = {
    base:      { x: 50, y: 50, scale: 100 },
    hat:       { x: 50, y: 15, scale: 45 },
    hair:      { x: 50, y: 20, scale: 50 },
    face:      { x: 50, y: 33, scale: 35 },
    accessory: { x: 50, y: 33, scale: 35 },
    outfit:    { x: 50, y: 52, scale: 50 },
    bottom:    { x: 50, y: 70, scale: 45 },
    shoes:     { x: 50, y: 88, scale: 35 },
  };
  const sb = createSupabaseServiceClient();
  const { data: rows, error: selErr } = await sb
    .from("garden_avatar_gallery")
    .select("id, category")
    .is("position", null);
  if (selErr) return { ok: false as const, message: `조회 실패: ${selErr.message}` };
  let updated = 0;
  for (const r of rows ?? []) {
    const def = DEFAULT_ITEM_POSITION[r.category as string];
    if (!def) continue;
    const { error } = await sb
      .from("garden_avatar_gallery")
      .update({ position: def })
      .eq("id", r.id);
    if (!error) updated++;
  }
  revalidatePath("/admin/gallery");
  revalidatePath("/me");
  revalidatePath("/");
  return { ok: true as const, updated };
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

// 관리자: 전체 목록 (활성/비활성 모두) 조회.
export async function listAllGalleryItemsAction() {
  ensureAuth();
  const sb = createSupabaseServiceClient();
  const { data, error } = await sb
    .from("garden_avatar_gallery")
    .select("id, category, label, image_url, sort_order, active, created_at, position")
    .order("category", { ascending: true })
    .order("sort_order", { ascending: true });
  if (error) {
    return { ok: false as const, message: `조회 실패: ${error.message}` };
  }
  return { ok: true as const, items: data ?? [] };
}
