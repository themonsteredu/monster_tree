"use server";

// /tree/me 학생 전용 server actions.
// 학생 JWT 쿠키(monster_student) 로 본인 인증 후, garden_claim_pending RPC 로
// pending 행 소비 + 로그 기록 + 학생 누적/단계 갱신을 한 트랜잭션에 처리한다.

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { STUDENT_COOKIE_NAME, verifyStudentJwt } from "@/lib/student-jwt";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import type { AvatarConfig, AvatarAccessories, BackgroundConfig, WeatherType, SceneLayout, SceneItemLayout } from "@/lib/types";
import { MOOD_TEXT_MAX, WEATHER_TYPES } from "@/lib/types";

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
    // 각 슬롯이 비어있거나 우리 Supabase URL 인지만 점검.
    const allowed = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

    const cleanUrl = (v: unknown): string | undefined => {
      if (typeof v !== "string" || v.length === 0) return undefined;
      if (v.length > 500) return undefined;
      if (!allowed || !v.startsWith(allowed)) return undefined;
      return v;
    };

    const validPos = (
      v: unknown,
    ): import("@/lib/types").AvatarGalleryItemPosition | undefined => {
      if (!v || typeof v !== "object") return undefined;
      const p = v as Record<string, unknown>;
      const inRange = (n: unknown, lo: number, hi: number) =>
        typeof n === "number" && Number.isFinite(n) && n >= lo && n <= hi;
      if (!inRange(p.x, -50, 150) || !inRange(p.y, -50, 150)) return undefined;
      if (!inRange(p.scaleX, 5, 250) || !inRange(p.scaleY, 5, 250)) return undefined;
      const result: import("@/lib/types").AvatarGalleryItemPosition = {
        x: p.x as number,
        y: p.y as number,
        scaleX: p.scaleX as number,
        scaleY: p.scaleY as number,
      };
      if (typeof p.zIndex === "number" && Number.isFinite(p.zIndex) && p.zIndex >= 0 && p.zIndex <= 20) {
        result.zIndex = Math.round(p.zIndex);
      }
      return result;
    };

    // slot 은 string 또는 { url, position? } 두 형태 모두 허용.
    // position 이 있으면 객체로, 없으면 string 으로 정규화한다.
    const slot = (v: unknown): import("@/lib/types").AvatarGallerySlot | undefined => {
      if (typeof v === "string") return cleanUrl(v);
      if (v && typeof v === "object") {
        const o = v as Record<string, unknown>;
        const url = cleanUrl(o.url);
        if (!url) return undefined;
        const position = validPos(o.position);
        return position ? { url, position } : url;
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
    // 최소 1개 슬롯은 있어야 함
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
    .select("id, category, label, image_url, position, sort_order, active, created_at")
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

// 아바타 초기화 — avatar 컬럼을 NULL 로. AvatarFigure 가 안 렌더된다.
export async function resetAvatarAction() {
  const token = cookies().get(STUDENT_COOKIE_NAME)?.value;
  const payload = await verifyStudentJwt(token);
  if (!payload) {
    return { ok: false as const, message: "로그인이 만료됐어요. 다시 로그인해주세요." };
  }

  const sb = createSupabaseServiceClient();
  const { error } = await sb
    .from("garden_students")
    .update({ avatar: null })
    .eq("branch_id", payload.branchId)
    .eq("external_student_id", payload.studentLocalId);
  if (error) {
    return { ok: false as const, message: `리셋 실패: ${error.message}` };
  }

  revalidatePath("/me");
  revalidatePath("/");
  revalidatePath("/admin");
  return { ok: true as const };
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

// 학생 본인의 "한마디" (mood_text) 갱신. 빈 문자열은 전광판 숨김.
export async function updateMoodAction(args: { text: string }) {
  const token = cookies().get(STUDENT_COOKIE_NAME)?.value;
  const payload = await verifyStudentJwt(token);
  if (!payload) {
    return { ok: false as const, message: "로그인이 만료됐어요. 다시 로그인해주세요." };
  }

  if (typeof args.text !== "string") {
    return { ok: false as const, message: "잘못된 입력이에요." };
  }
  // 줄바꿈/탭 제거, 양끝 공백 trim, 길이 컷
  const cleaned = args.text.replace(/[\r\n\t]+/g, " ").trim().slice(0, MOOD_TEXT_MAX);

  const sb = createSupabaseServiceClient();
  const { error } = await sb
    .from("garden_students")
    .update({
      mood_text: cleaned,
      mood_updated_at: cleaned.length > 0 ? new Date().toISOString() : null,
    })
    .eq("branch_id", payload.branchId)
    .eq("external_student_id", payload.studentLocalId);
  if (error) {
    return { ok: false as const, message: `저장 실패: ${error.message}` };
  }

  revalidatePath("/me");
  revalidatePath("/");
  revalidatePath("/admin");
  return { ok: true as const, moodText: cleaned };
}

// 학생 본인의 마당 날씨/분위기 효과 설정.
export async function setWeatherAction(args: { weather: WeatherType }) {
  const token = cookies().get(STUDENT_COOKIE_NAME)?.value;
  const payload = await verifyStudentJwt(token);
  if (!payload) {
    return { ok: false as const, message: "로그인이 만료됐어요. 다시 로그인해주세요." };
  }
  if (!WEATHER_TYPES.includes(args.weather)) {
    return { ok: false as const, message: "지원하지 않는 날씨예요." };
  }

  const sb = createSupabaseServiceClient();
  // 학생 id 확인 (FK 매칭).
  const { data: row, error: selErr } = await sb
    .from("garden_students")
    .select("id")
    .eq("branch_id", payload.branchId)
    .eq("external_student_id", payload.studentLocalId)
    .maybeSingle();
  if (selErr) return { ok: false as const, message: `조회 실패: ${selErr.message}` };
  if (!row?.id) return { ok: false as const, message: "본인 행을 찾지 못했어요." };

  const { error } = await sb
    .from("student_weather_setting")
    .upsert(
      { student_id: row.id, weather_type: args.weather, updated_at: new Date().toISOString() },
      { onConflict: "student_id" },
    );
  if (error) return { ok: false as const, message: `저장 실패: ${error.message}` };

  revalidatePath("/me");
  return { ok: true as const, weather: args.weather };
}

/* ============== 마이룸 마당 꾸미기 — 배치 일괄 교체 ============== */

type YardItemInput = {
  decorationItemId: string;
  instanceId: string; // 클라이언트가 발급한 uuid (같은 아이템 여러 개 구분)
  positionX: number;  // %
  positionY: number;  // %
  widthPercent: number; // %
  rotation: number;   // deg
  zIndex: number;
};

function validateYardItem(it: YardItemInput): boolean {
  return (
    typeof it.decorationItemId === "string" && it.decorationItemId.length > 0 &&
    typeof it.instanceId === "string" && it.instanceId.length > 0 && it.instanceId.length <= 64 &&
    Number.isFinite(it.positionX) && it.positionX >= -10 && it.positionX <= 110 &&
    Number.isFinite(it.positionY) && it.positionY >= -10 && it.positionY <= 110 &&
    Number.isFinite(it.widthPercent) && it.widthPercent > 0 && it.widthPercent <= 100 &&
    Number.isFinite(it.rotation) && it.rotation >= -360 && it.rotation <= 360 &&
    Number.isInteger(it.zIndex) && it.zIndex >= 0 && it.zIndex <= 9999
  );
}

function validateSceneItemLayout(v: unknown): v is SceneItemLayout {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  if (typeof o.x !== "number" || !Number.isFinite(o.x) || o.x < -10 || o.x > 110) return false;
  if (typeof o.y !== "number" || !Number.isFinite(o.y) || o.y < -10 || o.y > 110) return false;
  if (typeof o.width !== "number" || !Number.isFinite(o.width) || o.width < 3 || o.width > 200) return false;
  // flipX / rotation 은 선택적 — 있으면 타입/범위 검증.
  if (o.flipX !== undefined && typeof o.flipX !== "boolean") return false;
  if (o.rotation !== undefined) {
    if (typeof o.rotation !== "number" || !Number.isFinite(o.rotation) || o.rotation < -30 || o.rotation > 30) {
      return false;
    }
  }
  return true;
}

// 학생 본인의 마당 배치 + 씬 액터(나무·아바타) 레이아웃을 한 번에 교체.
// 꾸미기 모드 "저장" 누를 때 호출. sceneLayout 가 undefined 면 garden_students.scene_layout 은 안 건드림.
export async function replaceYardLayoutAction(args: {
  items: YardItemInput[];
  sceneLayout?: SceneLayout | null;
}) {
  const token = cookies().get(STUDENT_COOKIE_NAME)?.value;
  const payload = await verifyStudentJwt(token);
  if (!payload) {
    return { ok: false as const, message: "로그인이 만료됐어요. 다시 로그인해주세요." };
  }
  if (!Array.isArray(args.items)) {
    return { ok: false as const, message: "잘못된 요청이에요." };
  }
  if (args.items.length > 200) {
    return { ok: false as const, message: "한 화면에 둘 수 있는 소품 수를 초과했어요. (200개 이하)" };
  }
  for (const it of args.items) {
    if (!validateYardItem(it)) {
      return { ok: false as const, message: "소품 배치 값이 올바르지 않아요." };
    }
  }
  // instance_id 중복 차단 (DB unique 제약과 충돌 방지)
  const seen = new Set<string>();
  for (const it of args.items) {
    if (seen.has(it.instanceId)) {
      return { ok: false as const, message: "중복된 instance_id 가 있어요." };
    }
    seen.add(it.instanceId);
  }

  const sb = createSupabaseServiceClient();
  const { data: row, error: selErr } = await sb
    .from("garden_students")
    .select("id")
    .eq("branch_id", payload.branchId)
    .eq("external_student_id", payload.studentLocalId)
    .maybeSingle();
  if (selErr) return { ok: false as const, message: `조회 실패: ${selErr.message}` };
  if (!row?.id) return { ok: false as const, message: "본인 행을 찾지 못했어요." };

  // 참조 무결성 — 등록된 (그리고 활성) 소품 id 만 허용.
  const ids = Array.from(new Set(args.items.map((i) => i.decorationItemId)));
  if (ids.length > 0) {
    const { data: validItems } = await sb
      .from("decoration_items")
      .select("id")
      .in("id", ids)
      .eq("is_active", true);
    const validIdSet = new Set((validItems ?? []).map((r) => r.id as string));
    for (const id of ids) {
      if (!validIdSet.has(id)) {
        return { ok: false as const, message: "사용할 수 없는 소품이 포함됐어요." };
      }
    }
  }

  // 삭제 후 insert.
  // (트랜잭션은 supabase-js 에서 노출 안 됨 — race 가능성 낮은 학생 본인 데이터라 수용.)
  const { error: delErr } = await sb
    .from("student_yard_layout")
    .delete()
    .eq("student_id", row.id);
  if (delErr) return { ok: false as const, message: `삭제 실패: ${delErr.message}` };

  if (args.items.length > 0) {
    const rows = args.items.map((it) => ({
      student_id: row.id,
      decoration_item_id: it.decorationItemId,
      instance_id: it.instanceId,
      position_x: it.positionX,
      position_y: it.positionY,
      width_percent: it.widthPercent,
      rotation: it.rotation,
      z_index: it.zIndex,
    }));
    const { error: insErr } = await sb.from("student_yard_layout").insert(rows);
    if (insErr) return { ok: false as const, message: `저장 실패: ${insErr.message}` };
  }

  // 씬 액터(나무·아바타) 레이아웃도 함께 저장 — sceneLayout 가 명시된 경우만.
  if (args.sceneLayout !== undefined) {
    const sl = args.sceneLayout;
    let toStore: SceneLayout | null = null;
    if (sl !== null && typeof sl === "object") {
      toStore = {};
      if (sl.tree !== undefined) {
        if (!validateSceneItemLayout(sl.tree)) {
          return { ok: false as const, message: "나무 위치 값이 올바르지 않아요." };
        }
        toStore.tree = sl.tree;
      }
      if (sl.avatar !== undefined) {
        if (!validateSceneItemLayout(sl.avatar)) {
          return { ok: false as const, message: "아바타 위치 값이 올바르지 않아요." };
        }
        toStore.avatar = sl.avatar;
      }
      if (Object.keys(toStore).length === 0) toStore = null;
    }
    const { error: sceneErr } = await sb
      .from("garden_students")
      .update({ scene_layout: toStore })
      .eq("id", row.id);
    if (sceneErr) return { ok: false as const, message: `씬 저장 실패: ${sceneErr.message}` };
  }

  revalidatePath("/me");
  return { ok: true as const, count: args.items.length };
}
