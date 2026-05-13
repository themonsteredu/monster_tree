"use server";

// /tree/me 학생 전용 server actions.
// 학생 JWT 쿠키(monster_student) 로 본인 인증 후, garden_claim_pending RPC 로
// pending 행 소비 + 로그 기록 + 학생 누적/단계 갱신을 한 트랜잭션에 처리한다.

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { STUDENT_COOKIE_NAME, verifyStudentJwt } from "@/lib/student-jwt";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import type {
  AvatarConfig,
  AvatarAccessories,
  AvatarGallerySlotValue,
  AvatarItemPosition,
  BackgroundConfig,
} from "@/lib/types";

export async function claimPointAction(args: { pendingId: string }) {
  const token = cookies().get(STUDENT_COOKIE_NAME)?.value;
  const payload = await verifyStudentJwt(token);
  if (!payload) {
    return { ok: false as const, message: "로그인이 만료됐어요. 다시 로그인해주세요." };
  }
  if (!args.pendingId) {
    return { ok: false as const, message: "잘못된 요청이에요." };
  }

  const sb = createSupabaseServiceClient();

  const { data, error } = await sb.rpc("garden_claim_pending", {
    p_pending_id: args.pendingId,
    p_branch_id: payload.branchId,
    p_external_id: payload.studentLocalId,
  });
  if (error) {
    if (error.message?.includes("student_not_found")) {
      return { ok: false as const, message: "본인 행을 찾지 못했어요." };
    }
    return { ok: false as const, message: `받기 실패: ${error.message}` };
  }

  const result = data as {
    ok: true;
    already_claimed?: boolean;
    new_total?: number;
    new_stage?: number;
    points?: number;
  };

  revalidatePath("/me");
  revalidatePath("/admin");
  revalidatePath("/");

  if (result.already_claimed) {
    return { ok: true as const, alreadyClaimed: true };
  }
  return {
    ok: true as const,
    newTotal: result.new_total ?? 0,
    newStage: result.new_stage ?? 1,
  };
}

// 아바타 config 의 형태/문자열 길이만 점검. 알 수 없는 키 값은 클라이언트에서 fallback 으로 처리.
function validateAvatar(raw: unknown): AvatarConfig | null {
  if (!raw || typeof raw !== "object") return null;
  const a = raw as Record<string, unknown>;
  const kind = a.kind;
  const isShortStr = (v: unknown) => typeof v === "string" && v.length > 0 && v.length <= 40;

  let accessories: AvatarAccessories | undefined;
  if (a.accessories && typeof a.accessories === "object") {
    const ac = a.accessories as Record<string, unknown>;
    const next: AvatarAccessories = {};
    if (isShortStr(ac.glasses)) next.glasses = ac.glasses as string;
    if (isShortStr(ac.hat)) next.hat = ac.hat as string;
    if (Object.keys(next).length > 0) accessories = next;
  }

  if (kind === "human") {
    if (a.body !== "boy" && a.body !== "girl") return null;
    for (const k of ["skin", "hair", "eyes", "mouth"]) {
      if (!isShortStr(a[k])) return null;
    }
    // costume 은 신규 필드. 없으면 레거시 top/bottom/shoes 가 있던 행으로 보고 기본 코스튐 적용.
    const costume = isShortStr(a.costume) ? (a.costume as string) : "casual_olive";
    return {
      kind: "human",
      body: a.body as "boy" | "girl",
      skin: a.skin as string,
      hair: a.hair as string,
      eyes: a.eyes as string,
      mouth: a.mouth as string,
      costume,
      ...(accessories && { accessories }),
    };
  }
  if (kind === "animal" || kind === "fantasy") {
    if (!isShortStr(a.variant)) return null;
    const costume = isShortStr(a.costume) ? (a.costume as string) : undefined;
    return {
      kind,
      variant: a.variant as string,
      ...(costume ? { costume } : {}),
      ...(accessories && { accessories }),
    };
  }
  if (kind === "image") {
    // url 은 우리 Supabase Storage 의 public URL 만 허용 (도메인 화이트리스트).
    if (typeof a.url !== "string" || a.url.length === 0 || a.url.length > 500) return null;
    const allowed = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
    if (!allowed || !a.url.startsWith(allowed)) return null;
    return { kind: "image", url: a.url };
  }
  if (kind === "gallery") {
    // 각 슬롯은 (a) 단순 URL 문자열 — 레거시, 또는 (b) { url, position? } 객체.
    // 두 형태 모두 우리 Supabase Storage URL 만 허용.
    const allowed = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
    const validUrl = (v: unknown): string | null => {
      if (typeof v !== "string" || v.length === 0 || v.length > 500) return null;
      if (!allowed || !v.startsWith(allowed)) return null;
      return v;
    };
    const validPos = (v: unknown): AvatarItemPosition | null => {
      if (!v || typeof v !== "object") return null;
      const r = v as Record<string, unknown>;
      const num = (val: unknown, lo: number, hi: number, fb: number) => {
        const n = typeof val === "number" ? val : Number(val);
        if (!Number.isFinite(n)) return fb;
        return Math.min(hi, Math.max(lo, n));
      };
      return {
        x: num(r.x, 0, 100, 50),
        y: num(r.y, 0, 100, 50),
        scale: num(r.scale, 10, 200, 100),
      };
    };
    const slot = (v: unknown): AvatarGallerySlotValue | undefined => {
      if (typeof v === "string") {
        const url = validUrl(v);
        return url ?? undefined;
      }
      if (v && typeof v === "object") {
        const r = v as Record<string, unknown>;
        const url = validUrl(r.url);
        if (!url) return undefined;
        const pos = validPos(r.position);
        return pos ? { url, position: pos } : { url };
      }
      return undefined;
    };
    const base = slot(a.base);
    const outfit = slot(a.outfit);
    const bottom = slot(a.bottom);
    const shoes = slot(a.shoes);
    const hair = slot(a.hair);
    const face = slot(a.face);
    const hat = slot(a.hat);
    const accessory = slot(a.accessory);
    if (!base && !outfit && !bottom && !shoes && !hair && !face && !hat && !accessory) return null;
    return {
      kind: "gallery",
      ...(base && { base }),
      ...(outfit && { outfit }),
      ...(bottom && { bottom }),
      ...(shoes && { shoes }),
      ...(hair && { hair }),
      ...(face && { face }),
      ...(hat && { hat }),
      ...(accessory && { accessory }),
    };
  }
  return null;
}

// 갤러리 조회 — 학생/관리자 양쪽이 사용. active=true 만 sort_order 순으로.
export async function listGalleryItemsAction() {
  const sb = createSupabaseServiceClient();
  const { data, error } = await sb
    .from("garden_avatar_gallery")
    .select("id, category, label, image_url, sort_order, active, created_at, position")
    .eq("active", true)
    .order("category", { ascending: true })
    .order("sort_order", { ascending: true });
  if (error) {
    return { ok: false as const, message: `갤러리 조회 실패: ${error.message}` };
  }
  return { ok: true as const, items: data ?? [] };
}

export async function updateAvatarAction(args: { avatar: unknown }) {
  const token = cookies().get(STUDENT_COOKIE_NAME)?.value;
  const payload = await verifyStudentJwt(token);
  if (!payload) {
    return { ok: false as const, message: "로그인이 만료됐어요. 다시 로그인해주세요." };
  }

  const avatar = validateAvatar(args.avatar);
  if (!avatar) {
    return { ok: false as const, message: "아바타 데이터가 올바르지 않아요." };
  }

  const sb = createSupabaseServiceClient();
  const { error } = await sb
    .from("garden_students")
    .update({ avatar })
    .eq("branch_id", payload.branchId)
    .eq("external_student_id", payload.studentLocalId);
  if (error) {
    return { ok: false as const, message: `저장 실패: ${error.message}` };
  }

  revalidatePath("/me");
  revalidatePath("/");
  revalidatePath("/admin");
  return { ok: true as const, avatar };
}

// 학생 본인 사진을 avatars 버킷에 업로드 후 avatar = { kind: "image", url } 로 저장.
// 학생당 1장(덮어쓰기). 1MB 제한, png/jpg/webp 만 허용.
export async function uploadAvatarImageAction(formData: FormData) {
  const token = cookies().get(STUDENT_COOKIE_NAME)?.value;
  const payload = await verifyStudentJwt(token);
  if (!payload) {
    return { ok: false as const, message: "로그인이 만료됐어요. 다시 로그인해주세요." };
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return { ok: false as const, message: "파일이 없어요." };
  }
  if (file.size > 1_048_576) {
    return { ok: false as const, message: "이미지가 너무 커요 (1MB 이하)." };
  }
  const allowedTypes = ["image/png", "image/jpeg", "image/webp"];
  if (!allowedTypes.includes(file.type)) {
    return { ok: false as const, message: "PNG/JPG/WebP 만 업로드할 수 있어요." };
  }

  const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const path = `${payload.branchId}/${payload.studentLocalId}.${ext}`;

  const sb = createSupabaseServiceClient();
  const buffer = Buffer.from(await file.arrayBuffer());

  // 같은 학생이 다른 확장자로 업로드한 적 있으면 잔존 파일 정리 (조용히 실패 무시)
  const otherExts = ["png", "jpg", "webp"].filter((e) => e !== ext);
  await sb.storage.from("avatars").remove(otherExts.map((e) => `${payload.branchId}/${payload.studentLocalId}.${e}`));

  const { error: uploadErr } = await sb.storage
    .from("avatars")
    .upload(path, buffer, { contentType: file.type, upsert: true, cacheControl: "3600" });
  if (uploadErr) {
    return { ok: false as const, message: `업로드 실패: ${uploadErr.message}` };
  }

  const { data: pub } = sb.storage.from("avatars").getPublicUrl(path);
  // 캐시 무효화를 위해 timestamp 쿼리 추가
  const url = `${pub.publicUrl}?t=${Date.now()}`;

  const avatar: AvatarConfig = { kind: "image", url };
  const { error: dbErr } = await sb
    .from("garden_students")
    .update({ avatar })
    .eq("branch_id", payload.branchId)
    .eq("external_student_id", payload.studentLocalId);
  if (dbErr) {
    return { ok: false as const, message: `저장 실패: ${dbErr.message}` };
  }

  revalidatePath("/me");
  revalidatePath("/");
  revalidatePath("/admin");
  return { ok: true as const, avatar };
}

function validateBackground(raw: unknown): BackgroundConfig | null {
  if (!raw || typeof raw !== "object") return null;
  const b = raw as Record<string, unknown>;
  const isShortStr = (v: unknown) => typeof v === "string" && v.length > 0 && v.length <= 40;
  if (b.kind === "solid") {
    if (!isShortStr(b.color)) return null;
    return { kind: "solid", color: b.color as string };
  }
  if (b.kind === "pattern") {
    if (!isShortStr(b.pattern) || !isShortStr(b.color)) return null;
    return { kind: "pattern", pattern: b.pattern as string, color: b.color as string };
  }
  if (b.kind === "scene") {
    if (!isShortStr(b.scene)) return null;
    return { kind: "scene", scene: b.scene as string };
  }
  return null;
}

export async function updateBackgroundAction(args: { background: unknown }) {
  const token = cookies().get(STUDENT_COOKIE_NAME)?.value;
  const payload = await verifyStudentJwt(token);
  if (!payload) {
    return { ok: false as const, message: "로그인이 만료됐어요. 다시 로그인해주세요." };
  }

  const background = validateBackground(args.background);
  if (!background) {
    return { ok: false as const, message: "배경 데이터가 올바르지 않아요." };
  }

  const sb = createSupabaseServiceClient();
  const { error } = await sb
    .from("garden_students")
    .update({ background })
    .eq("branch_id", payload.branchId)
    .eq("external_student_id", payload.studentLocalId);
  if (error) {
    return { ok: false as const, message: `저장 실패: ${error.message}` };
  }

  revalidatePath("/me");
  revalidatePath("/");
  revalidatePath("/admin");
  return { ok: true as const, background };
}
