"use server";

// 학생용 건의함 Server Actions.
// - submitSuggestionAction: 새 글 작성 (+ 하루 1회 포인트 보상)
// - editSuggestionAction: 본인 글 수정
// - deleteSuggestionAction: 본인 글 삭제
// - toggleReactionAction: 공개 글 공감 스티커 (학생당 글당 1개, 재탭 취소/교체)
// - markMyRepliesSeenAction: 내 쪽지 답장 확인 처리 (reply_seen=true)
// 모든 쓰기는 service_role 클라이언트로 RLS 우회. 소유권은 JWT 의 student 와
// 대상 row 의 student_id 가 일치하는지 서버에서 직접 검증한다.

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { STUDENT_COOKIE_NAME, verifyStudentJwt } from "@/lib/student-jwt";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import {
  SUGGESTION_BODY_MAX,
  SUGGESTION_REWARD_POINTS,
  SUGGESTION_TITLE_MAX,
  type SuggestionCategory,
  type SuggestionReactionKind,
  type SuggestionVisibility,
} from "@/lib/types";

const ALLOWED_CATEGORIES: SuggestionCategory[] = [
  "praise",
  "suggestion",
  "complaint",
  "etc",
];

const ALLOWED_VISIBILITY: SuggestionVisibility[] = ["public", "private"];

function normalizeVisibility(v: unknown): SuggestionVisibility {
  return ALLOWED_VISIBILITY.includes(v as SuggestionVisibility)
    ? (v as SuggestionVisibility)
    : "public";
}

export type SubmitResult =
  | { ok: true }
  | { ok: false; message: string };

// 새 글 작성 결과 — 보상 지급 여부 포함.
// rewarded=true 면 오늘 첫 작성 보상(garden_pending_points) 이 적립된 것.
export type SubmitSuggestionResult =
  | { ok: true; rewarded: boolean; rewardPoints: number }
  | { ok: false; message: string };

export type ToggleReactionResult =
  | { ok: true; myReaction: SuggestionReactionKind | null }
  | { ok: false; message: string };

// KST 기준 'YYYY-MM-DD'. 작성 보상 dedupe 용 source_key 에 사용.
function kstDateKey(): string {
  const kst = new Date(Date.now() + 9 * 3600 * 1000);
  const y = kst.getUTCFullYear();
  const m = String(kst.getUTCMonth() + 1).padStart(2, "0");
  const d = String(kst.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// JWT → student row 조회 헬퍼.
async function resolveCurrentStudent() {
  const token = cookies().get(STUDENT_COOKIE_NAME)?.value;
  const payload = await verifyStudentJwt(token);
  if (!payload) return null;
  const sb = createSupabaseServiceClient();
  const { data: student } = await sb
    .from("garden_students")
    .select("id, name")
    .eq("branch_id", payload.branchId)
    .eq("external_student_id", payload.studentLocalId)
    .maybeSingle();
  if (!student) return null;
  return {
    sb,
    payload,
    student: student as { id: string; name: string },
  };
}

function validateFields(input: {
  category: string;
  title: string;
  body: string;
}):
  | { ok: true; category: SuggestionCategory; title: string; body: string }
  | { ok: false; message: string } {
  const category = input.category as SuggestionCategory;
  if (!ALLOWED_CATEGORIES.includes(category)) {
    return { ok: false, message: "카테고리를 선택해주세요." };
  }
  const title = (input.title ?? "").trim();
  const body = (input.body ?? "").trim();
  if (!title) return { ok: false, message: "제목을 입력해주세요." };
  if (title.length > SUGGESTION_TITLE_MAX) {
    return {
      ok: false,
      message: `제목은 ${SUGGESTION_TITLE_MAX}자 이내로 입력해주세요.`,
    };
  }
  if (!body) return { ok: false, message: "내용을 입력해주세요." };
  if (body.length > SUGGESTION_BODY_MAX) {
    return {
      ok: false,
      message: `내용은 ${SUGGESTION_BODY_MAX}자 이내로 입력해주세요.`,
    };
  }
  return { ok: true, category, title, body };
}

async function isBlocked(
  sb: ReturnType<typeof createSupabaseServiceClient>,
  studentId: string,
): Promise<{ blocked: boolean; message?: string }> {
  const nowIso = new Date().toISOString();
  const { data: block } = await sb
    .from("garden_suggestion_blocks")
    .select("blocked_until, reason")
    .eq("student_id", studentId)
    .maybeSingle();
  if (!block) return { blocked: false };
  const until = block.blocked_until as string | null;
  if (until && until <= nowIso) return { blocked: false };
  const reason = (block.reason as string | null)?.trim();
  const untilLabel = until
    ? `해제 예정: ${new Date(until).toLocaleString("ko-KR")}`
    : "영구 제한";
  return {
    blocked: true,
    message: `건의함 사용이 제한되었어요.${reason ? ` (사유: ${reason})` : ""} ${untilLabel}`,
  };
}

export async function submitSuggestionAction(input: {
  category: string;
  title: string;
  body: string;
  isAnonymous: boolean;
  visibility?: string;
}): Promise<SubmitSuggestionResult> {
  const me = await resolveCurrentStudent();
  if (!me) return { ok: false, message: "로그인이 필요해요." };

  const valid = validateFields(input);
  if (!valid.ok) return valid;

  const block = await isBlocked(me.sb, me.student.id);
  if (block.blocked) return { ok: false, message: block.message! };

  const { error: insertErr } = await me.sb.from("garden_suggestions").insert({
    branch_id: me.payload.branchId,
    student_id: me.student.id,
    student_name_snapshot: me.payload.name,
    is_anonymous: !!input.isAnonymous,
    visibility: normalizeVisibility(input.visibility),
    category: valid.category,
    title: valid.title,
    body: valid.body,
  });
  if (insertErr) {
    return { ok: false, message: `제출 실패: ${insertErr.message}` };
  }

  // 작성 보상 — 하루 1회 (KST). garden_award_external 이 source_key 로 dedupe.
  // 보상 적립이 실패해도 작성 자체는 성공으로 처리한다.
  let rewarded = false;
  try {
    const { data: award } = await me.sb.rpc("garden_award_external", {
      p_source_key: `suggest-reward:${me.student.id}:${kstDateKey()}`,
      p_student_id: me.student.id,
      p_points: SUGGESTION_REWARD_POINTS,
      p_reason: "건의함 쪽지 작성",
    });
    const status = (award as { status?: string } | null)?.status;
    rewarded = status === "awarded";
  } catch {
    // 보상 실패 무시 — 작성은 이미 완료.
  }

  revalidatePath("/me/suggest");
  revalidatePath("/admin/suggest");
  return { ok: true, rewarded, rewardPoints: SUGGESTION_REWARD_POINTS };
}

export async function editSuggestionAction(input: {
  id: string;
  category: string;
  title: string;
  body: string;
  isAnonymous: boolean;
  visibility?: string;
}): Promise<SubmitResult> {
  const me = await resolveCurrentStudent();
  if (!me) return { ok: false, message: "로그인이 필요해요." };

  const id = (input.id ?? "").trim();
  if (!id) return { ok: false, message: "잘못된 요청이에요." };

  const valid = validateFields(input);
  if (!valid.ok) return valid;

  const block = await isBlocked(me.sb, me.student.id);
  if (block.blocked) return { ok: false, message: block.message! };

  const { data: target } = await me.sb
    .from("garden_suggestions")
    .select("id, student_id, branch_id")
    .eq("id", id)
    .maybeSingle();
  if (!target) return { ok: false, message: "쪽지를 찾을 수 없어요." };
  if (
    target.student_id !== me.student.id ||
    target.branch_id !== me.payload.branchId
  ) {
    return { ok: false, message: "본인이 쓴 쪽지만 수정할 수 있어요." };
  }

  const { error: updErr } = await me.sb
    .from("garden_suggestions")
    .update({
      category: valid.category,
      title: valid.title,
      body: valid.body,
      is_anonymous: !!input.isAnonymous,
      visibility: normalizeVisibility(input.visibility),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (updErr) {
    return { ok: false, message: `수정 실패: ${updErr.message}` };
  }

  revalidatePath("/me/suggest");
  revalidatePath("/admin/suggest");
  return { ok: true };
}

export async function deleteSuggestionAction(input: {
  id: string;
}): Promise<SubmitResult> {
  const me = await resolveCurrentStudent();
  if (!me) return { ok: false, message: "로그인이 필요해요." };

  const id = (input.id ?? "").trim();
  if (!id) return { ok: false, message: "잘못된 요청이에요." };

  const { data: target } = await me.sb
    .from("garden_suggestions")
    .select("id, student_id, branch_id")
    .eq("id", id)
    .maybeSingle();
  if (!target) return { ok: false, message: "쪽지를 찾을 수 없어요." };
  if (
    target.student_id !== me.student.id ||
    target.branch_id !== me.payload.branchId
  ) {
    return { ok: false, message: "본인이 쓴 쪽지만 삭제할 수 있어요." };
  }

  const { error: delErr } = await me.sb
    .from("garden_suggestions")
    .delete()
    .eq("id", id);
  if (delErr) {
    return { ok: false, message: `삭제 실패: ${delErr.message}` };
  }

  revalidatePath("/me/suggest");
  revalidatePath("/admin/suggest");
  return { ok: true };
}

const ALLOWED_REACTIONS: SuggestionReactionKind[] = ["heart", "thumbs"];

// 공감 스티커 토글 — 학생당 글당 1개.
// 같은 종류 재탭 → 취소(delete), 다른 종류 탭 → 교체(upsert). 본인 글에도 허용.
export async function toggleReactionAction(input: {
  suggestionId: string;
  kind: string;
}): Promise<ToggleReactionResult> {
  const kind = input.kind as SuggestionReactionKind;
  if (!ALLOWED_REACTIONS.includes(kind)) {
    return { ok: false, message: "잘못된 요청이에요." };
  }
  const suggestionId = (input.suggestionId ?? "").trim();
  if (!suggestionId) return { ok: false, message: "잘못된 요청이에요." };

  const me = await resolveCurrentStudent();
  if (!me) return { ok: false, message: "로그인이 필요해요." };

  const { data: target } = await me.sb
    .from("garden_suggestions")
    .select("id, branch_id, student_id, visibility")
    .eq("id", suggestionId)
    .maybeSingle();
  if (!target || target.branch_id !== me.payload.branchId) {
    return { ok: false, message: "쪽지를 찾을 수 없어요." };
  }
  // 남의 비밀 쪽지에는 공감 불가 (본문도 볼 수 없는 글).
  if (target.visibility === "private" && target.student_id !== me.student.id) {
    return { ok: false, message: "비밀 쪽지에는 공감할 수 없어요." };
  }

  const { data: existing } = await me.sb
    .from("garden_suggestion_reactions")
    .select("kind")
    .eq("suggestion_id", suggestionId)
    .eq("student_id", me.student.id)
    .maybeSingle();

  if (existing && existing.kind === kind) {
    // 같은 종류 재탭 → 취소
    const { error } = await me.sb
      .from("garden_suggestion_reactions")
      .delete()
      .eq("suggestion_id", suggestionId)
      .eq("student_id", me.student.id);
    if (error) return { ok: false, message: `공감 취소 실패: ${error.message}` };
    revalidatePath("/me/suggest");
    return { ok: true, myReaction: null };
  }

  const { error } = await me.sb.from("garden_suggestion_reactions").upsert(
    {
      suggestion_id: suggestionId,
      student_id: me.student.id,
      kind,
    },
    { onConflict: "suggestion_id,student_id" },
  );
  if (error) return { ok: false, message: `공감 실패: ${error.message}` };

  revalidatePath("/me/suggest");
  return { ok: true, myReaction: kind };
}

// 내 쪽지 탭 진입 시 — 아직 확인 안 한 답장을 모두 읽음 처리.
// 마을 우체통의 🔴 새 답장 뱃지가 꺼진다.
export async function markMyRepliesSeenAction(): Promise<{ ok: boolean }> {
  const me = await resolveCurrentStudent();
  if (!me) return { ok: false };

  const { error } = await me.sb
    .from("garden_suggestions")
    .update({ reply_seen: true })
    .eq("student_id", me.student.id)
    .not("reply", "is", null)
    .eq("reply_seen", false);
  if (error) return { ok: false };

  revalidatePath("/me/suggest");
  revalidatePath("/me/village");
  return { ok: true };
}
