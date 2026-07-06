"use client";

// 학생 건의함 — "건의 우체통 📮".
// 진입 기본 = 읽기 모드. 상단 탭([전체]/카테고리/[내 쪽지])으로 필터하고,
// 쓰기는 우하단 플로팅 버튼 → 바텀시트로 진행한다.
// 공개글은 접힌 미리보기 카드 그리드 → 탭하면 상세(본문 전체 + 답장 + 공감)로 펼침.
// 남의 비밀글은 그리드에서 제거하고 상단에 "N통 전달" 요약만 표시.
//
// student 모드: 같은 지점 친구들과 공유. 본인 글은 수정/삭제 가능. 공감 스티커 사용.
// previewMode: 관리자가 학생 화면을 그냥 미리보기 (제출/수정/삭제/공감 차단).
// adminMode: 관리자가 학생 화면 그대로 보면서 각 쪽지에 인라인 관리 (답장/상태/삭제/차단).

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  SUGGESTION_BODY_MAX,
  SUGGESTION_CATEGORY_LABELS,
  SUGGESTION_REACTION_META,
  SUGGESTION_REPLY_MAX,
  SUGGESTION_STATUS_LABELS,
  SUGGESTION_TITLE_MAX,
  type SuggestionBlock,
  type SuggestionCategory,
  type SuggestionReactionKind,
  type SuggestionStatus,
  type SuggestionVisibility,
} from "@/lib/types";
import {
  deleteSuggestionAction,
  editSuggestionAction,
  markMyRepliesSeenAction,
  submitSuggestionAction,
  toggleReactionAction,
} from "./actions";
import {
  blockStudentAction,
  deleteSuggestionAction as adminDeleteSuggestionAction,
  replyToSuggestionAction,
  unblockStudentAction,
  updateSuggestionStatusAction,
} from "../../admin/suggest/actions";

export type SuggestionView = {
  id: string;
  is_mine: boolean;
  is_anonymous: boolean;
  // 'public' (다른 학생도 본문 볼 수 있음) / 'private' (관리자만).
  visibility: SuggestionVisibility;
  // 학생 모드: 익명 + 남의 글이면 빈 문자열로 마스킹.
  // admin 모드: 항상 실제 작성자 이름.
  student_name_snapshot: string;
  category: SuggestionCategory;
  title: string;
  body: string;
  status: SuggestionStatus;
  reply: string | null;
  replied_at: string | null;
  created_at: string;
  updated_at: string;
  // 공감 스티커 카운트 + 내 반응. 안 내려주면(예: suggest-preview) 공감 UI 숨김.
  reaction_counts?: { heart: number; thumbs: number } | null;
  my_reaction?: SuggestionReactionKind | null;
  // 내 글 전용 — false 면 아직 확인 안 한 새 답장.
  reply_seen?: boolean;
  // adminMode 전용 — 학생 차단 액션에 필요.
  admin_student_id?: string | null;
};

export type AdminStudentInfo = { name: string; className: string | null };
export type AdminBlockInfo = { reason: string | null; blockedUntil: string | null };

const CATEGORIES: SuggestionCategory[] = ["praise", "suggestion", "complaint", "etc"];
const STATUSES: SuggestionStatus[] = ["received", "reviewing", "done"];
const REACTION_KINDS: SuggestionReactionKind[] = ["heart", "thumbs"];

const POSTIT_COLORS: Record<
  SuggestionCategory,
  { bg: string; ring: string; text: string }
> = {
  praise: { bg: "bg-rose-200", ring: "ring-rose-300/60", text: "text-rose-900" },
  suggestion: { bg: "bg-sky-200", ring: "ring-sky-300/60", text: "text-sky-900" },
  complaint: { bg: "bg-amber-200", ring: "ring-amber-300/60", text: "text-amber-900" },
  etc: { bg: "bg-emerald-200", ring: "ring-emerald-300/60", text: "text-emerald-900" },
};

const STATUS_COLORS: Record<SuggestionStatus, string> = {
  received: "bg-white/80 text-gray-700",
  reviewing: "bg-amber-100 text-amber-800",
  done: "bg-emerald-100 text-emerald-800",
};

// 미리보기 카드에만 살짝 기울기.
const TILTS = ["-rotate-1", "rotate-1", "rotate-0", "rotate-1", "-rotate-1", "rotate-0"];
function tiltFor(i: number): string {
  return TILTS[i % TILTS.length];
}

const HANDWRITING = "'Gaegu','Nanum Pen Script','Comic Sans MS',cursive";

function formatDate(iso: string): string {
  const d = new Date(iso);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${yyyy}.${mm}.${dd} ${hh}:${mi}`;
}

function firstLine(body: string): string {
  const line = body.split("\n").find((l) => l.trim().length > 0) ?? "";
  return line.trim();
}

type TabKey = "all" | SuggestionCategory | "mine";

type ReactionLocal = {
  counts: { heart: number; thumbs: number };
  mine: SuggestionReactionKind | null;
};

type Props = {
  studentName: string;
  suggestions: SuggestionView[];
  activeBlock: SuggestionBlock | null;
  previewMode?: boolean;
  adminMode?: boolean;
  // 관리 리스트 페이지로 가는 floating 링크. preview/admin 양쪽에서 사용.
  adminLink?: string;
  // adminMode 전용 — student_id → 학생 정보 / 활성 차단 정보.
  adminStudentInfo?: Record<string, AdminStudentInfo>;
  adminBlockInfo?: Record<string, AdminBlockInfo>;
};

export function SuggestClient({
  studentName,
  suggestions,
  activeBlock,
  previewMode = false,
  adminMode = false,
  adminLink,
  adminStudentInfo,
  adminBlockInfo,
}: Props) {
  const router = useRouter();
  const isStudent = !previewMode && !adminMode;

  // ===== 읽기 모드 상태 =====
  const [tab, setTab] = useState<TabKey>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // ===== 쓰기 (바텀시트) =====
  const [writeOpen, setWriteOpen] = useState(false);
  const [category, setCategory] = useState<SuggestionCategory>("suggestion");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [isPublic, setIsPublic] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [toast, setToast] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // ===== 본인 글 수정 (상세 모달 내부) =====
  const [editing, setEditing] = useState(false);
  const [editCategory, setEditCategory] = useState<SuggestionCategory>("suggestion");
  const [editTitle, setEditTitle] = useState("");
  const [editBody, setEditBody] = useState("");
  const [editAnon, setEditAnon] = useState(false);
  const [editPublic, setEditPublic] = useState(true);
  const [editError, setEditError] = useState<string | null>(null);

  // ===== 삭제 확인 모달 (native confirm 대체) =====
  const [confirmDelete, setConfirmDelete] = useState<{
    id: string;
    admin: boolean;
    title: string;
  } | null>(null);

  // ===== 공감 스티커 — 낙관적 로컬 오버레이 =====
  const [localReactions, setLocalReactions] = useState<Record<string, ReactionLocal>>(
    {},
  );

  // ===== adminMode 전용 =====
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [blockTarget, setBlockTarget] = useState<{
    studentId: string;
    name: string;
  } | null>(null);
  const [blockReason, setBlockReason] = useState("");
  const [blockDuration, setBlockDuration] = useState<"1" | "7" | "30" | "perm">("7");

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2600);
  };

  // ===== 새 답장 하이라이트 =====
  // 진입 시점(및 이후 새로 도착한) 미확인 답장 id 를 세션 동안 기억해서,
  // markMyRepliesSeenAction 이후에도 "💌 답장 도착" 강조가 바로 사라지지 않게 한다.
  const newReplyIdsRef = useRef<Set<string>>(new Set());
  for (const s of suggestions) {
    if (s.is_mine && s.reply && s.reply_seen === false) {
      newReplyIdsRef.current.add(s.id);
    }
  }
  const hasNewReply = (s: SuggestionView) =>
    !!s.reply && (s.reply_seen === false || newReplyIdsRef.current.has(s.id));

  const unreadCount = suggestions.filter(
    (s) => s.is_mine && s.reply && s.reply_seen === false,
  ).length;

  // [내 쪽지] 탭 진입 시 답장 읽음 처리 (학생 모드 한정, 세션당 1회).
  const seenFiredRef = useRef(false);
  useEffect(() => {
    if (tab !== "mine" || !isStudent || seenFiredRef.current) return;
    if (unreadCount === 0) return;
    seenFiredRef.current = true;
    markMyRepliesSeenAction().then(() => router.refresh());
  }, [tab, isStudent, unreadCount, router]);

  // ===== 목록 필터링 =====
  // 학생/미리보기: 남의 비밀글은 그리드에서 제거 (상단 요약 한 줄로 대체).
  const hiddenSecretCount = useMemo(
    () =>
      adminMode
        ? 0
        : suggestions.filter((s) => !s.is_mine && s.visibility === "private").length,
    [suggestions, adminMode],
  );

  const visibleSuggestions = useMemo(() => {
    const base = adminMode
      ? suggestions
      : suggestions.filter((s) => s.is_mine || s.visibility !== "private");
    if (tab === "all") return base;
    if (tab === "mine") return base.filter((s) => s.is_mine);
    return base.filter((s) => s.category === tab);
  }, [suggestions, adminMode, tab]);

  const selected = selectedId
    ? suggestions.find((s) => s.id === selectedId) ?? null
    : null;

  const closeDetail = () => {
    setSelectedId(null);
    setEditing(false);
    setEditError(null);
  };

  // ===== 공감 스티커 =====
  const getReaction = (s: SuggestionView): ReactionLocal =>
    localReactions[s.id] ?? {
      counts: {
        heart: s.reaction_counts?.heart ?? 0,
        thumbs: s.reaction_counts?.thumbs ?? 0,
      },
      mine: s.my_reaction ?? null,
    };

  const onToggleReaction = (s: SuggestionView, kind: SuggestionReactionKind) => {
    if (!isStudent) return;
    const cur = getReaction(s);
    const counts = { ...cur.counts };
    let mine: SuggestionReactionKind | null;
    if (cur.mine === kind) {
      counts[kind] = Math.max(0, counts[kind] - 1);
      mine = null;
    } else {
      if (cur.mine) counts[cur.mine] = Math.max(0, counts[cur.mine] - 1);
      counts[kind] += 1;
      mine = kind;
    }
    setLocalReactions((prev) => ({ ...prev, [s.id]: { counts, mine } }));
    startTransition(async () => {
      const res = await toggleReactionAction({ suggestionId: s.id, kind });
      if (!res.ok) {
        setLocalReactions((prev) => ({ ...prev, [s.id]: cur }));
        showToast(res.message);
      }
    });
  };

  // ===== 학생 액션들 =====
  const resetForm = () => {
    setCategory("suggestion");
    setTitle("");
    setBody("");
    setIsAnonymous(false);
    setIsPublic(true);
    setError(null);
  };

  const onSubmit = () => {
    if (previewMode || adminMode) {
      showToast(
        adminMode
          ? "관리자 모드에서는 학생 글을 작성할 수 없어요."
          : "미리보기 모드에서는 제출되지 않아요.",
      );
      return;
    }
    setError(null);
    if (!title.trim()) {
      setError("제목을 입력해주세요.");
      return;
    }
    if (!body.trim()) {
      setError("내용을 입력해주세요.");
      return;
    }
    startTransition(async () => {
      const res = await submitSuggestionAction({
        category,
        title: title.trim(),
        body: body.trim(),
        isAnonymous,
        visibility: isPublic ? "public" : "private",
      });
      if (!res.ok) {
        setError(res.message);
        return;
      }
      resetForm();
      setWriteOpen(false);
      showToast(
        res.rewarded
          ? `쪽지를 우체통에 넣었어요! 🍎 +${res.rewardPoints}P 획득!`
          : "쪽지를 우체통에 넣었어요! 📮 (오늘 작성 보상은 이미 받았어요)",
      );
      router.refresh();
    });
  };

  const startEdit = (s: SuggestionView) => {
    setEditing(true);
    setEditCategory(s.category);
    setEditTitle(s.title);
    setEditBody(s.body);
    setEditAnon(s.is_anonymous);
    setEditPublic(s.visibility !== "private");
    setEditError(null);
  };

  const cancelEdit = () => {
    setEditing(false);
    setEditError(null);
  };

  const submitEdit = (id: string) => {
    setEditError(null);
    if (!editTitle.trim()) {
      setEditError("제목을 입력해주세요.");
      return;
    }
    if (!editBody.trim()) {
      setEditError("내용을 입력해주세요.");
      return;
    }
    startTransition(async () => {
      const res = await editSuggestionAction({
        id,
        category: editCategory,
        title: editTitle.trim(),
        body: editBody.trim(),
        isAnonymous: editAnon,
        visibility: editPublic ? "public" : "private",
      });
      if (!res.ok) {
        setEditError(res.message);
        return;
      }
      setEditing(false);
      showToast("쪽지를 수정했어요 ✏️");
      router.refresh();
    });
  };

  const requestDelete = (s: SuggestionView, admin: boolean) => {
    setConfirmDelete({ id: s.id, admin, title: s.title || "비밀 쪽지" });
  };

  const doDelete = () => {
    if (!confirmDelete) return;
    const { id, admin } = confirmDelete;
    startTransition(async () => {
      const res = admin
        ? await adminDeleteSuggestionAction(id)
        : await deleteSuggestionAction({ id });
      if (!res.ok) {
        showToast(res.message);
        setConfirmDelete(null);
        return;
      }
      setConfirmDelete(null);
      if (selectedId === id) closeDetail();
      showToast("쪽지를 우체통에서 꺼냈어요 🗑️");
      router.refresh();
    });
  };

  // ===== 관리자 액션들 =====
  const setReplyDraft = (id: string, text: string) =>
    setReplyDrafts((m) => ({ ...m, [id]: text }));

  const onReply = (id: string, currentReply: string | null) => {
    const draft = (replyDrafts[id] ?? currentReply ?? "").trim();
    if (!draft) {
      showToast("답장 내용을 입력해주세요.");
      return;
    }
    startTransition(async () => {
      const res = await replyToSuggestionAction({ id, reply: draft, status: "done" });
      if (!res.ok) {
        showToast(res.message);
        return;
      }
      showToast("답장을 저장했어요 💬");
      setReplyDrafts((m) => {
        const next = { ...m };
        delete next[id];
        return next;
      });
      router.refresh();
    });
  };

  const onChangeStatus = (id: string, next: SuggestionStatus) => {
    startTransition(async () => {
      const res = await updateSuggestionStatusAction({ id, status: next });
      if (!res.ok) {
        showToast(res.message);
        return;
      }
      router.refresh();
    });
  };

  const openBlockModal = (studentId: string, name: string) => {
    setBlockTarget({ studentId, name });
    setBlockReason("");
    setBlockDuration("7");
  };

  const submitBlock = () => {
    if (!blockTarget) return;
    const days = blockDuration === "perm" ? null : parseInt(blockDuration, 10);
    startTransition(async () => {
      const res = await blockStudentAction({
        studentId: blockTarget.studentId,
        reason: blockReason.trim() || null,
        durationDays: days,
      });
      if (!res.ok) {
        showToast(res.message);
        return;
      }
      showToast(`${blockTarget.name} 학생 건의함을 제한했어요`);
      setBlockTarget(null);
      router.refresh();
    });
  };

  const onUnblock = (studentId: string, name: string) => {
    startTransition(async () => {
      const res = await unblockStudentAction(studentId);
      if (!res.ok) {
        showToast(res.message);
        return;
      }
      showToast(`${name} 학생 제한을 해제했어요`);
      router.refresh();
    });
  };

  // ===== 표시 헬퍼 =====
  const authorLabelFor = (s: SuggestionView): string =>
    adminMode
      ? s.is_anonymous
        ? `${s.student_name_snapshot} (익명 제출)`
        : s.student_name_snapshot
      : s.is_anonymous
        ? s.is_mine
          ? "익명 (나)"
          : "익명"
        : s.is_mine
          ? `${s.student_name_snapshot} (나)`
          : s.student_name_snapshot;

  const TAB_ITEMS: Array<{ key: TabKey; label: string }> = [
    { key: "all", label: "전체" },
    ...CATEGORIES.map((c) => ({
      key: c as TabKey,
      label: SUGGESTION_CATEGORY_LABELS[c],
    })),
    ...(adminMode ? [] : [{ key: "mine" as TabKey, label: "내 쪽지" }]),
  ];

  return (
    <main
      className="min-h-screen pb-28 relative text-white"
      style={{
        background:
          "linear-gradient(180deg, #0f172a 0%, #0c2f33 55%, #064e3b 100%)",
      }}
    >
      {/* ===== 헤더 (다크 반투명) ===== */}
      <header className="sticky top-0 z-30 bg-slate-900/85 backdrop-blur border-b border-white/10">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link
            href={adminMode ? "/admin" : "/me/village"}
            className="shrink-0 text-sm text-white/80 hover:text-white hover:bg-white/10 rounded-lg px-3 py-1.5 transition"
          >
            ← {adminMode ? "관리" : "마을"}
          </Link>
          <h1
            className="text-lg font-bold text-white"
            style={{ textShadow: "0 0 12px rgba(52,211,153,0.35)" }}
          >
            건의 우체통 📮
          </h1>
          {previewMode && (
            <span className="ml-auto px-2 py-0.5 rounded-full bg-amber-400/20 text-amber-200 text-xs font-medium border border-amber-300/30">
              미리보기
            </span>
          )}
          {adminMode && (
            <span className="ml-auto px-2 py-0.5 rounded-full bg-rose-400/20 text-rose-200 text-xs font-medium border border-rose-300/30">
              관리자 모드
            </span>
          )}
        </div>

        {/* ===== 탭 ===== */}
        <div className="max-w-6xl mx-auto px-3 sm:px-4 pb-2 overflow-x-auto">
          <div className="flex gap-1.5 min-w-max">
            {TAB_ITEMS.map((t) => {
              const active = tab === t.key;
              const isMineTab = t.key === "mine";
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setTab(t.key)}
                  className={`relative px-3.5 py-1.5 rounded-full text-sm font-bold transition border ${
                    active
                      ? "bg-emerald-400/90 text-emerald-950 border-emerald-300 shadow-[0_0_12px_rgba(52,211,153,0.4)]"
                      : "bg-white/5 text-white/70 border-white/15 hover:bg-white/10 hover:text-white"
                  }`}
                  style={{ fontFamily: HANDWRITING, letterSpacing: "0.03em" }}
                >
                  {isMineTab ? "💌 내 쪽지" : t.label}
                  {isMineTab && unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-xs font-bold flex items-center justify-center shadow">
                      {unreadCount}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-3 sm:px-6 py-5">
        {/* ===== 인트로 ===== */}
        {!adminMode && (
          <div className="text-center mb-4">
            <div
              className="text-white/90 text-base sm:text-lg"
              style={{
                fontFamily: HANDWRITING,
                textShadow: "0 0 10px rgba(52,211,153,0.3)",
              }}
            >
              {studentName}님, 학원에 하고 싶은 말을 우체통에 넣어보세요 📮
            </div>
            <div
              className="text-white/60 text-sm mt-0.5"
              style={{ fontFamily: HANDWRITING }}
            >
              공개 쪽지는 친구들도 함께 읽어요. 마음을 담아 적어주세요 💌
            </div>
          </div>
        )}

        {adminMode && (
          <div className="mx-auto max-w-xl text-center mb-4 px-4 py-2.5 rounded-xl border border-rose-300/30 bg-rose-950/40">
            <div className="text-rose-100 text-sm" style={{ fontFamily: HANDWRITING }}>
              🔧 쪽지를 탭해서 펼치면 답장/상태/삭제/차단을 처리할 수 있어요.
            </div>
          </div>
        )}

        {/* ===== 차단 안내 ===== */}
        {activeBlock && (
          <div className="mx-auto max-w-lg mb-5 rounded-xl p-4 shadow-lg bg-rose-200 text-rose-900">
            <div className="font-bold mb-1">⚠ 건의함 사용이 제한되었어요</div>
            {activeBlock.reason && (
              <div className="text-sm mb-1">사유: {activeBlock.reason}</div>
            )}
            <div className="text-xs text-rose-700">
              {activeBlock.blocked_until
                ? `해제 예정: ${formatDate(activeBlock.blocked_until)}`
                : "영구 제한"}
            </div>
          </div>
        )}

        {/* ===== 비밀 쪽지 요약 (남의 비밀글은 그리드에서 제외) ===== */}
        {!adminMode && hiddenSecretCount > 0 && tab !== "mine" && (
          <div
            className="mx-auto max-w-xl text-center mb-4 px-4 py-2 rounded-full border border-white/15 bg-white/5 text-white/75 text-sm"
            style={{ fontFamily: HANDWRITING }}
          >
            🔒 비밀 쪽지 {hiddenSecretCount}통이 선생님께 전달됐어요
          </div>
        )}

        {/* ===== 카드 그리드 ===== */}
        {visibleSuggestions.length === 0 ? (
          <div
            className="text-center text-white/55 text-base py-16"
            style={{ fontFamily: HANDWRITING }}
          >
            {tab === "mine"
              ? "아직 보낸 쪽지가 없어요. 첫 쪽지를 보내보세요! ✉️"
              : adminMode
                ? "아직 도착한 쪽지가 없어요."
                : "아직 붙은 쪽지가 없어요. 첫 번째로 보내보세요!"}
          </div>
        ) : (
          <ul className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
            {visibleSuggestions.map((s, i) => {
              const col = POSTIT_COLORS[s.category];
              const isSecret = s.visibility === "private";
              const newReply = s.is_mine && hasNewReply(s);
              const r = getReaction(s);
              const reactionTotal = r.counts.heart + r.counts.thumbs;
              return (
                <li key={s.id} className="relative" style={{ fontFamily: HANDWRITING }}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(s.id)}
                    className={`relative w-full h-full min-h-[164px] text-left rounded-sm p-3 pt-4 shadow-lg flex flex-col transition hover:-translate-y-0.5 hover:shadow-xl ${tiltFor(i)} ${col.bg} ${col.text} ${
                      s.is_mine ? "ring-2 ring-amber-500/50" : ""
                    }`}
                    style={{ boxShadow: "0 4px 10px rgba(0,0,0,0.35)" }}
                  >
                    {/* 압정 */}
                    <span
                      className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-red-500 shadow z-10"
                      style={{
                        boxShadow:
                          "inset -1px -1px 2px rgba(0,0,0,0.4), 0 1px 2px rgba(0,0,0,0.3)",
                      }}
                    />

                    {/* 새 답장 도착 강조 */}
                    {newReply && (
                      <span className="absolute -top-2 -right-1.5 px-2 py-0.5 rounded-full bg-rose-500 text-white text-xs font-bold shadow-md animate-pulse z-10">
                        💌 답장 도착
                      </span>
                    )}

                    <span className="flex flex-wrap items-center gap-1 mb-1.5">
                      <span className="px-1.5 py-0.5 rounded-full text-xs bg-white/70 font-bold">
                        {SUGGESTION_CATEGORY_LABELS[s.category]}
                      </span>
                      <span
                        className={`px-1.5 py-0.5 rounded-full text-xs font-bold ${STATUS_COLORS[s.status]}`}
                      >
                        {SUGGESTION_STATUS_LABELS[s.status]}
                      </span>
                      {isSecret && (
                        <span className="px-1.5 py-0.5 rounded-full text-xs bg-rose-700 text-white font-bold">
                          🔒 비밀
                        </span>
                      )}
                    </span>

                    {isSecret && !adminMode ? (
                      // 내 비밀글 — 접힌 편지 연출
                      <span className="flex-1 flex flex-col items-center justify-center gap-1 py-1">
                        <span className="text-3xl leading-none">✉️</span>
                        <span className="text-sm font-extrabold text-center leading-snug line-clamp-1 px-1">
                          {s.title || "비밀 쪽지"}
                        </span>
                        <span className="text-xs opacity-70">선생님만 볼 수 있어요</span>
                      </span>
                    ) : (
                      <>
                        <span className="block font-extrabold text-base leading-snug break-words line-clamp-2">
                          {s.title}
                        </span>
                        <span className="block text-sm leading-snug mt-0.5 opacity-85 break-words line-clamp-2">
                          {firstLine(s.body)}
                        </span>
                        <span className="flex-1" />
                      </>
                    )}

                    <span className="mt-2 flex items-end justify-between gap-1 text-xs opacity-75">
                      <span className="truncate">
                        ✍ {authorLabelFor(s) || "익명"}
                      </span>
                      <span className="shrink-0">
                        {formatDate(s.created_at).slice(0, 10)}
                      </span>
                    </span>
                    {(s.reply || reactionTotal > 0) && (
                      <span className="mt-1 flex items-center gap-2 text-xs font-bold">
                        {s.reply && <span>💬 답장</span>}
                        {r.counts.heart > 0 && <span>❤️ {r.counts.heart}</span>}
                        {r.counts.thumbs > 0 && <span>👍 {r.counts.thumbs}</span>}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* ===== 플로팅 버튼 ===== */}
      {!adminMode && (
        <div className="fixed bottom-6 right-5 z-40">
          <button
            type="button"
            onClick={() => {
              if (activeBlock) {
                showToast("건의함 사용이 제한되어 있어 쪽지를 쓸 수 없어요.");
                return;
              }
              setWriteOpen(true);
            }}
            className="inline-flex items-center gap-2 px-5 py-3.5 rounded-full bg-emerald-500 hover:bg-emerald-400 text-emerald-950 shadow-[0_8px_24px_rgba(16,185,129,0.45)] transition text-base font-extrabold active:scale-95"
            style={{ fontFamily: HANDWRITING, letterSpacing: "0.03em" }}
          >
            ✉️ 쪽지 쓰기
          </button>
        </div>
      )}

      {/* 리스트형 관리 페이지로 가는 floating 링크 — preview / admin 양쪽에서 노출 */}
      {(previewMode || adminMode) && adminLink && (
        <div className={`fixed bottom-6 z-40 ${adminMode ? "right-5" : "left-5"}`}>
          <Link
            href={adminLink}
            className="inline-flex items-center gap-2 px-4 py-3 rounded-full bg-gray-900 text-white shadow-2xl hover:bg-gray-800 transition text-sm font-semibold border border-white/20"
          >
            <span>리스트 관리</span>
            <span aria-hidden>→</span>
          </Link>
        </div>
      )}

      {/* ===== 상세 모달 (접힌 카드 → 펼침) ===== */}
      {selected &&
        (() => {
          const s = selected;
          const col = POSTIT_COLORS[s.category];
          const isSecret = s.visibility === "private";
          const wasEdited =
            new Date(s.updated_at).getTime() - new Date(s.created_at).getTime() >
            2000;
          const studentBlocked =
            adminMode && s.admin_student_id
              ? adminBlockInfo?.[s.admin_student_id] ?? null
              : null;
          const r = getReaction(s);
          const showReactions =
            !isSecret && (isStudent || s.reaction_counts != null);
          return (
            <div
              className="fixed inset-0 z-40 bg-black/70 flex items-center justify-center px-3 py-6 overflow-y-auto"
              onClick={closeDetail}
            >
              <div
                className={`relative w-full max-w-lg my-auto rounded-md p-5 pt-6 shadow-2xl ${col.bg} ${col.text}`}
                style={{
                  fontFamily: HANDWRITING,
                  boxShadow: "0 20px 50px rgba(0,0,0,0.5)",
                }}
                onClick={(e) => e.stopPropagation()}
              >
                {/* 압정 + 닫기 */}
                <div
                  className="absolute -top-2 left-1/2 -translate-x-1/2 w-4 h-4 rounded-full bg-red-500 shadow-md"
                  style={{
                    boxShadow:
                      "inset -1px -1px 2px rgba(0,0,0,0.4), 0 1px 2px rgba(0,0,0,0.3)",
                  }}
                />
                <button
                  type="button"
                  onClick={closeDetail}
                  aria-label="닫기"
                  className="absolute top-2.5 right-2.5 w-8 h-8 rounded-full bg-black/10 hover:bg-black/20 text-current text-sm font-bold flex items-center justify-center transition"
                >
                  ✕
                </button>

                {!editing && (
                  <>
                    <div className="flex flex-wrap items-center gap-1.5 mb-2 pr-8">
                      <span className="px-2 py-0.5 rounded-full text-xs bg-white/70 font-bold">
                        {SUGGESTION_CATEGORY_LABELS[s.category]}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-full text-xs font-bold ${STATUS_COLORS[s.status]}`}
                      >
                        {SUGGESTION_STATUS_LABELS[s.status]}
                      </span>
                      <span className="px-2 py-0.5 rounded-full text-xs bg-white/60">
                        ✍ {authorLabelFor(s) || "익명"}
                      </span>
                      {isSecret && (
                        <span className="px-2 py-0.5 rounded-full text-xs bg-rose-700 text-white font-bold">
                          🔒 비밀
                        </span>
                      )}
                      {wasEdited && (
                        <span className="px-2 py-0.5 rounded-full text-xs bg-white/50 opacity-80">
                          수정됨
                        </span>
                      )}
                      {adminMode && studentBlocked && (
                        <span className="px-2 py-0.5 rounded-full text-xs bg-rose-700 text-white font-bold">
                          차단됨
                        </span>
                      )}
                    </div>

                    <div className="font-extrabold text-xl leading-snug break-words">
                      {s.title || "비밀 쪽지"}
                    </div>
                    <div className="text-base leading-relaxed mt-1.5 whitespace-pre-wrap break-words">
                      {s.body}
                    </div>
                    <div className="text-xs opacity-70 mt-2">
                      {formatDate(s.created_at)}
                    </div>

                    {/* 선생님 답장 */}
                    {s.reply && (
                      <div
                        className={`mt-3 rounded-md bg-white/85 p-3 border ${
                          hasNewReply(s)
                            ? "border-rose-400 ring-2 ring-rose-300/60"
                            : "border-amber-900/20"
                        }`}
                      >
                        <div className="text-xs font-bold text-amber-900 mb-1">
                          {hasNewReply(s) ? "💌 답장 도착! " : "선생님 답장 "}
                          {s.replied_at && (
                            <span className="font-normal opacity-70">
                              · {formatDate(s.replied_at)}
                            </span>
                          )}
                        </div>
                        <div className="text-sm text-amber-950 whitespace-pre-wrap break-words leading-relaxed">
                          {s.reply}
                        </div>
                      </div>
                    )}

                    {/* 공감 스티커 */}
                    {showReactions && (
                      <div className="mt-3 flex items-center gap-2">
                        {REACTION_KINDS.map((kind) => {
                          const meta = SUGGESTION_REACTION_META[kind];
                          const active = r.mine === kind;
                          const count = r.counts[kind];
                          return (
                            <button
                              key={kind}
                              type="button"
                              disabled={!isStudent}
                              onClick={() => onToggleReaction(s, kind)}
                              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-bold border-2 transition ${
                                active
                                  ? "bg-white text-amber-900 border-amber-700 shadow"
                                  : "bg-white/50 border-amber-900/15 hover:bg-white/80"
                              } ${!isStudent ? "cursor-default opacity-90" : "active:scale-95"}`}
                            >
                              <span>{meta.emoji}</span>
                              <span>{meta.label}</span>
                              <span className="min-w-[1ch]">{count}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {/* 학생 모드: 본인 쪽지 수정/삭제 */}
                    {!adminMode && s.is_mine && (
                      <div className="mt-4 flex gap-2">
                        <button
                          type="button"
                          onClick={() => startEdit(s)}
                          disabled={!!activeBlock || pending || previewMode}
                          className="flex-1 py-2 rounded-md bg-white/80 hover:bg-white text-amber-900 text-sm font-bold border border-amber-900/20 shadow-sm disabled:opacity-50"
                        >
                          ✏️ 수정
                        </button>
                        <button
                          type="button"
                          onClick={() => requestDelete(s, false)}
                          disabled={!!activeBlock || pending || previewMode}
                          className="flex-1 py-2 rounded-md bg-rose-200/90 hover:bg-rose-300 text-rose-900 text-sm font-bold border border-rose-700/30 shadow-sm disabled:opacity-50"
                        >
                          🗑️ 삭제
                        </button>
                      </div>
                    )}

                    {/* 관리자 모드: 인라인 관리 컨트롤 */}
                    {adminMode && (
                      <div className="mt-4 pt-3 border-t border-amber-900/20 space-y-2">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-xs font-bold opacity-80">상태</span>
                          {STATUSES.map((st) => {
                            const active = s.status === st;
                            return (
                              <button
                                key={st}
                                type="button"
                                disabled={pending}
                                onClick={() => onChangeStatus(s.id, st)}
                                className={`px-2.5 py-1 rounded-full text-xs font-bold border ${
                                  active
                                    ? `${STATUS_COLORS[st]} border-amber-900/40`
                                    : "bg-white/40 text-amber-900/70 border-amber-900/20 hover:bg-white/70"
                                }`}
                              >
                                {SUGGESTION_STATUS_LABELS[st]}
                              </button>
                            );
                          })}
                        </div>

                        <textarea
                          value={replyDrafts[s.id] ?? s.reply ?? ""}
                          maxLength={SUGGESTION_REPLY_MAX}
                          onChange={(e) => setReplyDraft(s.id, e.target.value)}
                          placeholder="학생에게 보낼 답장…"
                          rows={2}
                          disabled={pending}
                          className="w-full text-sm px-2.5 py-2 rounded-md bg-white/80 text-amber-950 focus:outline-none focus:bg-white resize-none"
                          style={{ lineHeight: "1.5rem" }}
                        />

                        <div className="flex flex-wrap gap-1.5">
                          <button
                            type="button"
                            disabled={pending}
                            onClick={() => onReply(s.id, s.reply)}
                            className="flex-1 min-w-[80px] py-2 rounded-md bg-amber-700 hover:bg-amber-800 text-white text-sm font-bold disabled:opacity-50"
                          >
                            💬 답장
                          </button>
                          <button
                            type="button"
                            disabled={pending}
                            onClick={() => requestDelete(s, true)}
                            className="flex-1 min-w-[60px] py-2 rounded-md bg-rose-200 hover:bg-rose-300 text-rose-900 text-sm font-bold border border-rose-700/30 disabled:opacity-50"
                          >
                            🗑️ 삭제
                          </button>
                          {s.admin_student_id ? (
                            studentBlocked ? (
                              <button
                                type="button"
                                disabled={pending}
                                onClick={() =>
                                  onUnblock(
                                    s.admin_student_id!,
                                    adminStudentInfo?.[s.admin_student_id!]?.name ??
                                      s.student_name_snapshot,
                                  )
                                }
                                className="flex-1 min-w-[80px] py-2 rounded-md bg-emerald-200 hover:bg-emerald-300 text-emerald-900 text-sm font-bold border border-emerald-700/30 disabled:opacity-50"
                              >
                                🔓 해제
                              </button>
                            ) : (
                              <button
                                type="button"
                                disabled={pending}
                                onClick={() =>
                                  openBlockModal(
                                    s.admin_student_id!,
                                    adminStudentInfo?.[s.admin_student_id!]?.name ??
                                      s.student_name_snapshot,
                                  )
                                }
                                className="flex-1 min-w-[60px] py-2 rounded-md bg-gray-800 hover:bg-gray-900 text-white text-sm font-bold disabled:opacity-50"
                              >
                                🚫 차단
                              </button>
                            )
                          ) : null}
                        </div>

                        {studentBlocked && (
                          <div className="text-xs text-rose-700 bg-rose-50 rounded px-2 py-1">
                            {studentBlocked.reason && `사유: ${studentBlocked.reason} · `}
                            {studentBlocked.blockedUntil
                              ? `해제 예정: ${formatDate(studentBlocked.blockedUntil)}`
                              : "영구 제한"}
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}

                {/* 학생 모드 인라인 수정 */}
                {editing && !adminMode && (
                  <div className="space-y-2">
                    <div className="text-sm font-bold opacity-80 mb-1">
                      ✏️ 쪽지 수정 중
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {CATEGORIES.map((c) => {
                        const active = editCategory === c;
                        return (
                          <button
                            key={c}
                            type="button"
                            disabled={pending}
                            onClick={() => setEditCategory(c)}
                            className={`px-2.5 py-1 rounded-md text-xs border ${
                              active
                                ? "bg-white text-amber-900 border-amber-900 font-bold"
                                : "bg-white/50 text-amber-900/70 border-amber-900/20"
                            }`}
                          >
                            {SUGGESTION_CATEGORY_LABELS[c]}
                          </button>
                        );
                      })}
                    </div>
                    <input
                      type="text"
                      value={editTitle}
                      maxLength={SUGGESTION_TITLE_MAX}
                      disabled={pending}
                      onChange={(e) => setEditTitle(e.target.value)}
                      className="w-full px-2.5 py-2 rounded-md bg-white/80 text-amber-950 border-b-2 border-amber-900/40 focus:outline-none focus:bg-white"
                      style={{ fontSize: "1rem" }}
                      placeholder="제목"
                    />
                    <textarea
                      value={editBody}
                      maxLength={SUGGESTION_BODY_MAX}
                      disabled={pending}
                      onChange={(e) => setEditBody(e.target.value)}
                      rows={5}
                      className="w-full px-2.5 py-2 rounded-md bg-white/80 text-amber-950 focus:outline-none focus:bg-white resize-none"
                      style={{ fontSize: "1rem", lineHeight: "1.7rem" }}
                      placeholder="내용"
                    />
                    <div className="flex gap-1.5">
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => setEditPublic(true)}
                        className={`flex-1 px-2 py-1.5 rounded text-xs border ${
                          editPublic
                            ? "bg-amber-200 text-amber-900 border-amber-700 font-bold"
                            : "bg-white/60 text-amber-900/60 border-amber-900/20"
                        }`}
                      >
                        👀 친구들도
                      </button>
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => setEditPublic(false)}
                        className={`flex-1 px-2 py-1.5 rounded text-xs border ${
                          !editPublic
                            ? "bg-rose-200 text-rose-900 border-rose-700 font-bold"
                            : "bg-white/60 text-amber-900/60 border-amber-900/20"
                        }`}
                      >
                        🔒 비밀
                      </button>
                    </div>
                    <label className="flex items-center gap-2 text-xs">
                      <input
                        type="checkbox"
                        checked={editAnon}
                        disabled={pending || !editPublic}
                        onChange={(e) => setEditAnon(e.target.checked)}
                        className="rounded"
                      />
                      <span className={!editPublic ? "opacity-50" : ""}>익명</span>
                    </label>
                    {editError && (
                      <div className="text-xs text-rose-700 bg-rose-50 rounded px-2 py-1">
                        {editError}
                      </div>
                    )}
                    <div className="flex gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => submitEdit(s.id)}
                        disabled={pending}
                        className="flex-1 py-2 rounded-md bg-amber-700 hover:bg-amber-800 text-white text-sm font-bold disabled:opacity-50"
                      >
                        💾 저장
                      </button>
                      <button
                        type="button"
                        onClick={cancelEdit}
                        disabled={pending}
                        className="flex-1 py-2 rounded-md bg-white/70 hover:bg-white text-amber-900 text-sm font-bold border border-amber-900/20 disabled:opacity-50"
                      >
                        취소
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })()}

      {/* ===== 쪽지 쓰기 바텀시트 ===== */}
      {writeOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/70 flex items-end justify-center"
          onClick={() => setWriteOpen(false)}
        >
          <div
            className="w-full max-w-xl max-h-[88dvh] overflow-y-auto rounded-t-2xl p-5 pb-8"
            style={{
              background: "linear-gradient(180deg, #fff7a8 0%, #ffe97a 100%)",
              boxShadow: "0 -12px 40px rgba(0,0,0,0.5)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* 그립바 */}
            <div className="mx-auto w-12 h-1.5 rounded-full bg-amber-900/25 mb-3" />
            <div className="flex items-center justify-between mb-3">
              <div
                className="text-lg font-extrabold text-amber-900"
                style={{ fontFamily: HANDWRITING }}
              >
                ✉️ 쪽지 쓰기
              </div>
              <button
                type="button"
                onClick={() => setWriteOpen(false)}
                aria-label="닫기"
                className="w-8 h-8 rounded-full bg-amber-900/10 hover:bg-amber-900/20 text-amber-900 text-sm font-bold flex items-center justify-center transition"
              >
                ✕
              </button>
            </div>

            <div className="mb-4">
              <div
                className="text-sm font-bold text-amber-900 mb-2"
                style={{ fontFamily: HANDWRITING }}
              >
                어떤 이야기인가요?
              </div>
              <div className="flex flex-wrap gap-2">
                {CATEGORIES.map((c) => {
                  const active = category === c;
                  const col = POSTIT_COLORS[c];
                  return (
                    <button
                      key={c}
                      type="button"
                      disabled={pending || !!activeBlock}
                      onClick={() => setCategory(c)}
                      className={`px-3 py-1.5 rounded-md text-sm border-2 transition shadow-sm ${
                        active
                          ? `${col.bg} ${col.text} border-amber-900/30 font-bold ring-2 ${col.ring}`
                          : "bg-white/70 text-gray-600 border-amber-900/10 hover:bg-white"
                      } disabled:opacity-50 disabled:cursor-not-allowed`}
                    >
                      {SUGGESTION_CATEGORY_LABELS[c]}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="mb-3">
              <label
                className="block text-sm font-bold text-amber-900 mb-1"
                style={{ fontFamily: HANDWRITING }}
              >
                제목
              </label>
              <input
                type="text"
                value={title}
                maxLength={SUGGESTION_TITLE_MAX}
                disabled={pending || !!activeBlock}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="짧게 한 줄로!"
                className="w-full px-3 py-2 rounded-md bg-white/70 border-b-2 border-amber-900/40 focus:outline-none focus:bg-white focus:border-amber-900 disabled:bg-white/40 text-amber-950 placeholder:text-amber-900/40"
                style={{ fontFamily: HANDWRITING, fontSize: "1.05rem" }}
              />
              <div className="text-right text-xs text-amber-900/60 mt-0.5">
                {title.length}/{SUGGESTION_TITLE_MAX}
              </div>
            </div>

            <div className="mb-3">
              <label
                className="block text-sm font-bold text-amber-900 mb-1"
                style={{ fontFamily: HANDWRITING }}
              >
                내용
              </label>
              <textarea
                value={body}
                maxLength={SUGGESTION_BODY_MAX}
                disabled={pending || !!activeBlock}
                onChange={(e) => setBody(e.target.value)}
                placeholder="자세한 이야기를 적어주세요"
                rows={6}
                className="w-full px-3 py-2 rounded-md bg-white/60 focus:outline-none focus:bg-white disabled:bg-white/40 resize-none text-amber-950 placeholder:text-amber-900/40"
                style={{
                  fontFamily: HANDWRITING,
                  fontSize: "1.05rem",
                  lineHeight: "1.9rem",
                  backgroundImage:
                    "repeating-linear-gradient(transparent 0 calc(1.9rem - 1px), rgba(120,80,30,0.25) calc(1.9rem - 1px) 1.9rem)",
                  backgroundAttachment: "local",
                }}
              />
              <div className="text-right text-xs text-amber-900/60 mt-0.5">
                {body.length}/{SUGGESTION_BODY_MAX}
              </div>
            </div>

            {/* 공개 / 비공개 토글 */}
            <div className="mb-3 rounded-md bg-white/60 p-2.5 border border-amber-900/15">
              <div
                className="text-sm font-bold text-amber-900 mb-2"
                style={{ fontFamily: HANDWRITING }}
              >
                누가 볼 수 있어요?
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={pending || !!activeBlock}
                  onClick={() => setIsPublic(true)}
                  className={`flex-1 px-3 py-2 rounded-md text-sm border-2 transition ${
                    isPublic
                      ? "bg-amber-200 text-amber-900 border-amber-700 font-bold"
                      : "bg-white/70 text-amber-900/60 border-amber-900/15"
                  } disabled:opacity-50`}
                  style={{ fontFamily: HANDWRITING }}
                >
                  👀 친구들도 보기
                </button>
                <button
                  type="button"
                  disabled={pending || !!activeBlock}
                  onClick={() => setIsPublic(false)}
                  className={`flex-1 px-3 py-2 rounded-md text-sm border-2 transition ${
                    !isPublic
                      ? "bg-rose-200 text-rose-900 border-rose-700 font-bold"
                      : "bg-white/70 text-amber-900/60 border-amber-900/15"
                  } disabled:opacity-50`}
                  style={{ fontFamily: HANDWRITING }}
                >
                  🔒 선생님만 (비밀)
                </button>
              </div>
              <div
                className="text-xs text-amber-900/70 mt-1.5"
                style={{ fontFamily: HANDWRITING }}
              >
                {isPublic
                  ? "친구들이 우체통에서 같이 읽을 수 있어요."
                  : "다른 친구들에게는 보이지 않아요. 선생님만 펼쳐서 봐요."}
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm text-amber-900 mb-4 select-none">
              <input
                type="checkbox"
                checked={isAnonymous}
                disabled={pending || !!activeBlock || !isPublic}
                onChange={(e) => setIsAnonymous(e.target.checked)}
                className="rounded border-amber-700/40 disabled:opacity-50"
              />
              <span
                style={{ fontFamily: HANDWRITING }}
                className={!isPublic ? "opacity-50" : ""}
              >
                익명으로 보내기 (이름이 가려져요)
              </span>
            </label>

            {error && (
              <div className="mb-3 text-sm text-rose-700 bg-rose-100 border border-rose-200 rounded-md px-3 py-2">
                {error}
              </div>
            )}

            <button
              type="button"
              onClick={onSubmit}
              disabled={pending || !!activeBlock}
              className="w-full py-3 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white font-bold transition disabled:bg-gray-400 disabled:cursor-not-allowed shadow-md"
              style={{
                fontFamily: HANDWRITING,
                fontSize: "1.1rem",
                letterSpacing: "0.05em",
              }}
            >
              {pending ? "보내는 중..." : "📮 우체통에 넣기"}
            </button>
          </div>
        </div>
      )}

      {/* ===== 삭제 확인 모달 ===== */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center px-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-5 text-gray-900">
            <div className="text-3xl text-center mb-2">🗑️</div>
            <h3 className="text-base font-bold text-center mb-1">
              쪽지를 정말 삭제할까요?
            </h3>
            <p className="text-sm text-gray-500 text-center mb-1 break-words line-clamp-2">
              &ldquo;{confirmDelete.title}&rdquo;
            </p>
            <p className="text-xs text-gray-400 text-center mb-4">
              삭제하면 되돌릴 수 없어요.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setConfirmDelete(null)}
                disabled={pending}
                className="flex-1 py-2.5 rounded-lg border border-gray-200 bg-white text-gray-700 text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
              >
                남겨두기
              </button>
              <button
                type="button"
                onClick={doDelete}
                disabled={pending}
                className="flex-1 py-2.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-sm font-bold disabled:opacity-50"
              >
                삭제하기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== 차단 모달 (adminMode) ===== */}
      {blockTarget && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center px-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-5 text-gray-900">
            <h3 className="text-base font-bold text-gray-900 mb-1">
              🚫 {blockTarget.name} 건의함 제한
            </h3>
            <p className="text-xs text-gray-500 mb-4">
              제한 기간 동안 이 학생은 새 글을 쓸 수 없어요. (기존 글은 유지)
            </p>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              사유 (선택)
            </label>
            <input
              type="text"
              value={blockReason}
              onChange={(e) => setBlockReason(e.target.value)}
              placeholder="예: 반복적인 부적절한 표현"
              className="w-full px-3 py-2 mb-3 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-amber-200"
            />
            <div className="text-xs font-medium text-gray-700 mb-2">기간</div>
            <div className="grid grid-cols-4 gap-2 mb-5">
              {(
                [
                  ["1", "1일"],
                  ["7", "7일"],
                  ["30", "30일"],
                  ["perm", "영구"],
                ] as const
              ).map(([v, label]) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setBlockDuration(v)}
                  className={`py-2 rounded-lg text-sm font-medium border transition ${
                    blockDuration === v
                      ? "bg-amber-500 text-white border-amber-600"
                      : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setBlockTarget(null)}
                disabled={pending}
                className="flex-1 py-2 rounded-lg border border-gray-200 bg-white text-gray-700 text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
              >
                취소
              </button>
              <button
                type="button"
                onClick={submitBlock}
                disabled={pending}
                className="flex-1 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-sm font-bold disabled:opacity-50"
              >
                제한하기
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-full bg-gray-900 text-white text-sm shadow-lg border border-white/20">
          {toast}
        </div>
      )}
    </main>
  );
}
