"use client";

// 학생 건의함 — "몬스터 우체국 📮".
// 진입 기본 = 읽기 모드. 상단 탭([전체]/카테고리/[내 쪽지])으로 필터하고,
// 쓰기는 우하단 플로팅 버튼 → 바텀시트로 진행한다.
// 공개글은 크림색 "편지봉투" 카드 목록 → 탭하면 편지지(본문 전체 + 답장 + 공감)로 펼침.
// 남의 비밀글은 목록에서 제거하고 상단에 "N통 전달" 요약만 표시.
//
// 디자인 언어: 마을(#0f172a→#064e3b 그라데이션) + 게임센터(Stars/Jua/칩/글로우)와 통일.
// 다크 밤하늘 위에 밝은 크림 편지봉투가 떠 있는 구성.
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

// ===== 몬스터 우체국 프레젠테이션 상수 — 마인크래프트 픽셀 테마 =====
// 도트 폰트(Galmuri11) + 각진 베벨 + 종이 쪽지 그리드. 로직은 이전 테마와 동일.

const PIXEL = "'Galmuri11','Pretendard Variable',sans-serif";
const BODY_FONT = "'Pretendard Variable','Pretendard',-apple-system,sans-serif";

// 밤하늘 (시안: 남보라 → 짙은 남색 → 어두운 청록 숲).
const POSTOFFICE_BG =
 "linear-gradient(180deg, #2a2150 0%, #1a1a3d 45%, #0d2b26 100%)";
// 종이 쪽지.
const LETTER_BG = "#f7f1e0";
const PAPER_BORDER = "#3d2f1e";
// 픽셀 카드: 두꺼운 각진 테두리 + 하드 오프셋 그림자 (부드러운 blur 없음).
const ENVELOPE_SHADOW =
 "0 5px 0 rgba(0,0,0,0.45), inset 0 2px 0 rgba(255,255,255,0.6)";
// 픽셀 베벨 (버튼/패널 공용) — 좌상단 하이라이트 + 우하단 그림자.
const BEVEL =
 "inset 2px 2px 0 rgba(255,255,255,0.3), inset -2px -2px 0 rgba(0,0,0,0.3)";
const BEVEL_DOWN =
 "inset -2px -2px 0 rgba(255,255,255,0.15), inset 2px 2px 0 rgba(0,0,0,0.35)";
// 잔디 초록 (활성 탭/답장 버튼).
const GRASS = "#5db24a";
const GRASS_DARK = "#2c5e1f";
// 돌/목재 톤.
const STONE = "#3a4048";
const STONE_DARK = "#22262d";
const WOOD = "#6b4a2b";
const WOOD_DARK = "#3a2812";
const EMERALD_GLOW = "0 0 14px rgba(52,211,153,0.55)";

// 카테고리 픽셀 뱃지 — 쪽지 좌상단 + 우상단 아이콘 + 쓰기/수정 시 고르기.
const STAMP_META: Record<
  SuggestionCategory,
  { emoji: string; bg: string; border: string; text: string }
> = {
  praise: { emoji: "📣", bg: "bg-rose-100", border: "border-rose-500", text: "text-rose-800" },
  suggestion: { emoji: "💡", bg: "bg-sky-100", border: "border-sky-500", text: "text-sky-800" },
  complaint: { emoji: "😣", bg: "bg-violet-100", border: "border-violet-500", text: "text-violet-800" },
  etc: { emoji: "💬", bg: "bg-amber-100", border: "border-amber-500", text: "text-amber-800" },
};

// 상태 칩 (종이 위 — 각진 픽셀 프레임).
const STATUS_STAMP: Record<SuggestionStatus, string> = {
  received: "bg-stone-200/90 text-stone-700 border-stone-500/60",
  reviewing: "bg-amber-200 text-amber-900 border-amber-600/60",
  done: "bg-emerald-200 text-emerald-900 border-emerald-700/60",
};

// adminMode 상태 칩 (다크 패널 안, 활성 시).
const ADMIN_STATUS_ACTIVE: Record<SuggestionStatus, string> = {
  received: "bg-stone-200 text-stone-800 border-stone-300",
  reviewing: "bg-amber-400 text-amber-950 border-amber-300",
  done: "bg-emerald-400 text-emerald-950 border-emerald-300",
};

// 종이 쪽지 접힌 모서리 (우상단) — 카드/편지 공용 오버레이.
function FoldedCorner({ size = 18 }: { size?: number }) {
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute right-0 top-0"
      style={{
        width: 0,
        height: 0,
        borderStyle: "solid",
        borderWidth: `0 ${size}px ${size}px 0`,
        borderColor: "transparent #ddcda4 transparent transparent",
        filter: "drop-shadow(-2px 2px 0 rgba(0,0,0,0.15))",
      }}
    />
  );
}

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
      className="relative min-h-screen pb-32 text-white"
      style={{ background: POSTOFFICE_BG, fontFamily: PIXEL }}
    >
      <Stars />

      {/* ===== 상단: 뱃지 / 돌아가기 / 헤더 / 인트로 ===== */}
      <div className="relative z-10 mx-auto w-full max-w-4xl px-4 pt-5">
        {/* 관리자 모드 뱃지 — 게임센터 amber 패턴 */}
        {adminMode && (
          <div
            className="mb-4 flex items-center gap-1.5 border border-amber-400/40 bg-amber-500/15 px-3 py-2 text-xs font-bold text-amber-100 backdrop-blur-sm"
            style={{ boxShadow: "0 0 14px rgba(245,158,11,0.25)" }}
          >
            <span aria-hidden>🛠</span>
            <span>관리자 모드 — 쪽지를 탭해서 답장/상태/삭제/차단</span>
          </div>
        )}
        {previewMode && (
          <div
            className="mb-4 flex items-center gap-1.5 border border-amber-400/40 bg-amber-500/15 px-3 py-2 text-xs font-bold text-amber-100 backdrop-blur-sm"
            style={{ boxShadow: "0 0 14px rgba(245,158,11,0.25)" }}
          >
            <span aria-hidden>🛠</span>
            <span>테스트 모드 — 기록 저장 안 됨</span>
          </div>
        )}

        {/* 돌아가기 / 이름 — 픽셀 버튼 행 */}
        <div className="mb-4 flex items-center justify-between gap-2">
          <Link
            href={adminMode ? "/admin" : "/me/village"}
            className="inline-flex min-h-[40px] items-center gap-1.5 px-3.5 py-1.5 text-sm font-bold text-white/85 transition hover:brightness-110 active:translate-y-0.5"
            style={{
              background: STONE,
              border: `3px solid ${STONE_DARK}`,
              boxShadow: `${BEVEL}, 0 3px 0 rgba(0,0,0,0.4)`,
            }}
          >
            <span aria-hidden>←</span>
            <span>{adminMode ? "관리" : "마을"}로</span>
          </Link>
          <span
            className="flex min-h-[40px] shrink-0 items-center gap-1.5 px-3.5 py-1.5 text-sm font-bold"
            style={{
              background: WOOD,
              border: `3px solid ${WOOD_DARK}`,
              boxShadow: `${BEVEL}, 0 3px 0 rgba(0,0,0,0.4)`,
            }}
          >
            <span className="text-yellow-300" aria-hidden>
              👑
            </span>
            <span className="max-w-[7rem] truncate text-amber-50">{studentName}</span>
          </span>
        </div>

        {/* 헤더 — 벽돌 플랫폼 위 나무 간판 */}
        <header className="relative mb-5">
          <div className="relative mx-auto w-fit">
            <div
              className="relative flex items-center gap-3 px-6 py-3.5"
              style={{
                background:
 "linear-gradient(180deg, #7a5533 0%, #6b4a2b 50%, #57391d 100%)",
                border: `4px solid ${WOOD_DARK}`,
                boxShadow: `${BEVEL}, 0 6px 0 rgba(0,0,0,0.45)`,
              }}
            >
              <span
                className="shrink-0 text-3xl"
                style={{ filter: "drop-shadow(2px 2px 0 rgba(0,0,0,0.5))" }}
                aria-hidden
              >
                📮
              </span>
              <h1 className="whitespace-nowrap text-2xl font-extrabold tracking-tight sm:text-3xl">
                <span
                  style={{ color: "#7ee04e", textShadow: "2px 2px 0 #1c3a10" }}
                >
                  몬스터
                </span>{" "}
                <span style={{ color: "#f7f1e0", textShadow: "2px 2px 0 #3a2812" }}>
                  우체국
                </span>
              </h1>
            </div>
            {/* 간판 아래 잔디+흙 플랫폼 스트립 */}
            <div
              aria-hidden
              className="mx-auto h-3 w-[92%]"
              style={{
                background:
 "repeating-linear-gradient(90deg, #5db24a 0 14px, #4d9c3c 14px 28px)",
                borderLeft: `3px solid ${WOOD_DARK}`,
                borderRight: `3px solid ${WOOD_DARK}`,
                borderBottom: `3px solid ${WOOD_DARK}`,
              }}
            />
          </div>
        </header>

        {/* 인트로 */}
        {!adminMode && (
          <div className="mb-2 text-center">
            <div
              className="text-sm text-white/90 sm:text-base"
              style={{ textShadow: "0 0 10px rgba(52,211,153,0.3)" }}
            >
              {studentName}님, 학원에 하고 싶은 말을 우체통에 넣어보세요 📮
            </div>
            <div className="mt-0.5 text-xs text-white/60 sm:text-sm">
              공개 쪽지는 친구들도 함께 읽어요. 마음을 담아 적어주세요 💌
            </div>
          </div>
        )}
      </div>

      {/* ===== 탭 (sticky, 돌담 바) ===== */}
      <div
        className="sticky top-0 z-30 backdrop-blur"
        style={{
          background: "rgba(20,22,40,0.88)",
          borderBottom: `3px solid ${STONE_DARK}`,
        }}
      >
        <div className="mx-auto w-full max-w-4xl overflow-x-auto px-4 py-2.5">
          <div className="flex min-w-max gap-2">
            {TAB_ITEMS.map((t) => {
              const active = tab === t.key;
              const isMineTab = t.key === "mine";
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setTab(t.key)}
                  className={`relative min-h-[40px] px-4 py-2 text-sm font-bold transition hover:brightness-110 active:translate-y-0.5 ${
                    active ? "text-white" : "text-white/70 hover:text-white"
                  }`}
                  style={
                    active
                      ? {
                          background: GRASS,
                          border: `3px solid ${GRASS_DARK}`,
                          boxShadow: `${BEVEL}, 0 3px 0 rgba(0,0,0,0.4)`,
                          textShadow: "1px 1px 0 rgba(0,0,0,0.45)",
                        }
                      : {
                          background: STONE,
                          border: `3px solid ${STONE_DARK}`,
                          boxShadow: `${BEVEL_DOWN}, 0 3px 0 rgba(0,0,0,0.4)`,
                        }
                  }
                >
                  {isMineTab ? "💌 내 쪽지" : t.label}
                  {isMineTab && unreadCount > 0 && (
                    <span
                      className="absolute -right-1 -top-1 h-3 w-3 animate-pulse bg-rose-500"
                      style={{ border: "2px solid #141628" }}
                      aria-hidden
                    />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ===== 본문 ===== */}
      <div className="relative z-10 mx-auto w-full max-w-4xl px-4 py-5">
        {/* 차단 안내 */}
        {activeBlock && (
          <div className="mb-5 border-[3px] border-rose-800 bg-rose-500/20 p-4 text-rose-100 backdrop-blur-sm">
            <div className="mb-1 font-bold">⚠ 건의함 사용이 제한되었어요</div>
            {activeBlock.reason && (
              <div className="mb-1 text-sm">사유: {activeBlock.reason}</div>
            )}
            <div className="text-xs text-rose-200/80">
              {activeBlock.blocked_until
                ? `해제 예정: ${formatDate(activeBlock.blocked_until)}`
                : "영구 제한"}
            </div>
          </div>
        )}

        {/* 비밀 쪽지 요약 — 돌 칩 (남의 비밀글은 목록에서 제외) */}
        {!adminMode && hiddenSecretCount > 0 && tab !== "mine" && (
          <div
            className="mx-auto mb-4 w-fit px-4 py-2 text-center text-sm text-white/80"
            style={{
              background: STONE,
              border: `3px solid ${STONE_DARK}`,
              boxShadow: BEVEL,
            }}
          >
            🔒 비밀 쪽지 {hiddenSecretCount}통이 선생님께 전달됐어요
          </div>
        )}

        {/* 편지봉투 목록 */}
        {visibleSuggestions.length === 0 ? (
          <div className="py-16 text-center text-base text-white/55">
            {tab === "mine"
              ? "아직 보낸 쪽지가 없어요. 첫 쪽지를 보내보세요! ✉️"
              : adminMode
                ? "아직 도착한 쪽지가 없어요."
                : "아직 도착한 쪽지가 없어요. 첫 번째로 보내보세요!"}
          </div>
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            {visibleSuggestions.map((s) => {
              const isSecret = s.visibility === "private";
              const newReply = s.is_mine && hasNewReply(s);
              const r = getReaction(s);
              const reactionTotal = r.counts.heart + r.counts.thumbs;
              return (
                <li key={s.id} className="relative">
                  <button
                    type="button"
                    onClick={() => setSelectedId(s.id)}
                    className="relative flex min-h-[150px] w-full flex-col p-3 pt-3 text-left text-amber-950 transition hover:-translate-y-0.5 active:translate-y-0"
                    style={{
                      background: LETTER_BG,
                      border: `3px solid ${s.is_mine ? GRASS_DARK : PAPER_BORDER}`,
                      boxShadow: ENVELOPE_SHADOW,
                    }}
                  >
                    <FoldedCorner />

                    {/* 새 답장 도착 강조 */}
                    {newReply && (
                      <span
                        className="absolute -top-2.5 left-2 z-10 animate-pulse bg-rose-500 px-2 py-0.5 text-[11px] font-bold text-white"
                        style={{ border: "2px solid #7f1d1d" }}
                      >
                        💌 답장 도착
                      </span>
                    )}

                    {/* 1행: 카테고리 픽셀 뱃지 + 아이콘 */}
                    <span className="mb-1.5 flex items-center justify-between gap-1 pr-4">
                      <CategoryStamp category={s.category} />
                      <span className="text-base leading-none" aria-hidden>
                        {STAMP_META[s.category].emoji}
                      </span>
                    </span>

                    {isSecret && !adminMode ? (
                      // 내 비밀글 — 접힌 편지 연출
                      <span className="flex flex-1 flex-col items-center justify-center gap-1 py-1">
                        <span className="text-2xl leading-none" aria-hidden>
                          ✉️
                        </span>
                        <span className="line-clamp-1 px-1 text-center text-sm font-extrabold leading-snug">
                          {s.title || "비밀 쪽지"}
                        </span>
                        <span className="text-[11px] text-amber-900/60">
                          선생님만 볼 수 있어요
                        </span>
                      </span>
                    ) : (
                      <>
                        <span className="line-clamp-1 block break-words text-sm font-extrabold leading-snug sm:text-base">
                          {s.title}
                        </span>
                        <span
                          className="mt-1 line-clamp-2 block break-words text-[13px] leading-snug text-amber-900/75"
                          style={{ fontFamily: BODY_FONT }}
                        >
                          {firstLine(s.body)}
                        </span>
                        <span className="flex-1" />
                      </>
                    )}

                    {/* 상태/비밀 칩 */}
                    <span className="mt-2 flex flex-wrap items-center gap-1">
                      <span
                        className={`border-2 px-1.5 py-px text-[10px] font-bold ${STATUS_STAMP[s.status]}`}
                      >
                        {SUGGESTION_STATUS_LABELS[s.status]}
                      </span>
                      {isSecret && (
                        <span
                          className="bg-rose-600 px-1.5 py-px text-[10px] font-bold text-white"
                          style={{ border: "2px solid #7f1d1d" }}
                        >
                          🔒 비밀
                        </span>
                      )}
                    </span>

                    {/* 작성자 + 날짜 */}
                    <span
                      className="mt-1.5 flex items-end justify-between gap-1 border-t-2 border-dashed border-amber-900/20 pt-1.5 text-[11px] text-amber-900/70"
                    >
                      <span className="truncate">✍ {authorLabelFor(s) || "익명"}</span>
                      <span className="shrink-0" style={{ fontFamily: BODY_FONT }}>
                        {formatDate(s.created_at).slice(0, 10)}
                      </span>
                    </span>

                    {/* 답장 버튼 + 공감 수 (시안 하단 행) */}
                    {(s.reply || reactionTotal > 0) && (
                      <span className="mt-1.5 flex items-center justify-between gap-1.5 text-[11px] font-bold">
                        {s.reply ? (
                          <span
                            className="px-2 py-1 text-white"
                            style={{
                              background: GRASS,
                              border: `2px solid ${GRASS_DARK}`,
                              boxShadow: BEVEL,
                              textShadow: "1px 1px 0 rgba(0,0,0,0.4)",
                            }}
                          >
                            💚 선생님 답장
                          </span>
                        ) : (
                          <span />
                        )}
                        <span className="flex items-center gap-1.5">
                          {r.counts.heart > 0 && (
                            <span className="text-rose-600">❤️ {r.counts.heart}</span>
                          )}
                          {r.counts.thumbs > 0 && (
                            <span className="text-sky-700">👍 {r.counts.thumbs}</span>
                          )}
                        </span>
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* ===== 쪽지 쓰기 플로팅 버튼 ===== */}
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
            className="inline-flex min-h-[52px] items-center gap-2 px-6 py-3.5 text-base font-extrabold text-white transition hover:brightness-110 active:translate-y-0.5"
            style={{
              background: GRASS,
              border: `3px solid ${GRASS_DARK}`,
              boxShadow: `${BEVEL}, 0 4px 0 rgba(0,0,0,0.45), ${EMERALD_GLOW}`,
              textShadow: "1px 1px 0 rgba(0,0,0,0.45)",
              fontFamily: PIXEL,
            }}
          >
            ✉️ 쪽지 쓰기
          </button>
        </div>
      )}

      {/* ===== 하단 나무 현판 ===== */}
      <div className="relative z-10 mx-auto mt-8 w-full max-w-4xl px-4 pb-2">
        <div
          className="mx-auto flex w-fit items-center gap-2.5 px-5 py-3 text-center text-xs text-amber-100 sm:text-sm"
          style={{
            background:
 "linear-gradient(180deg, #7a5533 0%, #6b4a2b 50%, #57391d 100%)",
            border: `3px solid ${WOOD_DARK}`,
            boxShadow: `${BEVEL}, 0 4px 0 rgba(0,0,0,0.4)`,
          }}
        >
          <span aria-hidden>✉️</span>
          <span style={{ textShadow: "1px 1px 0 rgba(0,0,0,0.5)" }}>
            여러분의 소중한 의견이 더 좋은 몬스터마을을 만듭니다!
          </span>
        </div>
      </div>

      {/* 리스트형 관리 페이지로 가는 floating 링크 — preview / admin 양쪽에서 노출 */}
      {(previewMode || adminMode) && adminLink && (
        <div className={`fixed bottom-6 z-40 ${adminMode ? "right-5" : "left-5"}`}>
          <Link
            href={adminLink}
            className="inline-flex min-h-[44px] items-center gap-2 px-4 py-3 text-sm font-bold text-white transition hover:brightness-110 active:translate-y-0.5"
            style={{
              background: STONE,
              border: `3px solid ${STONE_DARK}`,
              boxShadow: `${BEVEL}, 0 4px 0 rgba(0,0,0,0.45)`,
            }}
          >
            <span>리스트 관리</span>
            <span aria-hidden>→</span>
          </Link>
        </div>
      )}

      {/* ===== 상세 모달 (편지봉투 → 편지지 펼침) ===== */}
      {selected &&
        (() => {
          const s = selected;
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
              className="fixed inset-0 z-40 flex items-center justify-center overflow-y-auto bg-black/75 px-4 py-6 backdrop-blur-sm"
              onClick={closeDetail}
            >
              <div
                className="relative my-auto w-full max-w-md p-5 text-amber-950"
                style={{
                  background: LETTER_BG,
                  border: `4px solid ${PAPER_BORDER}`,
                  boxShadow: "0 8px 0 rgba(0,0,0,0.5), inset 0 2px 0 rgba(255,255,255,0.6)",
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <FoldedCorner size={26} />

                {/* 닫기 — 픽셀 버튼 */}
                <button
                  type="button"
                  onClick={closeDetail}
                  aria-label="닫기"
                  className="absolute -right-2.5 -top-3.5 z-10 flex h-9 w-9 items-center justify-center text-sm font-bold text-white transition hover:brightness-110 active:translate-y-0.5"
                  style={{
                    background: "#b03030",
                    border: "3px solid #5e1414",
                    boxShadow: `${BEVEL}, 0 3px 0 rgba(0,0,0,0.4)`,
                  }}
                >
                  ✕
                </button>

                {!editing && (
                  <>
                    <div className="mb-2 flex items-start justify-between gap-2 pt-1">
                      <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                        <span
                          className={`border px-2 py-0.5 text-xs font-bold ${STATUS_STAMP[s.status]}`}
                        >
                          {SUGGESTION_STATUS_LABELS[s.status]}
                        </span>
                        <span className="border border-amber-900/15 bg-white/70 px-2 py-0.5 text-xs font-bold text-amber-900">
                          ✍ {authorLabelFor(s) || "익명"}
                        </span>
                        {isSecret && (
                          <span className="bg-rose-600 px-2 py-0.5 text-xs font-bold text-white">
                            🔒 비밀
                          </span>
                        )}
                        {wasEdited && (
                          <span className="bg-amber-900/10 px-2 py-0.5 text-xs text-amber-900/70">
                            수정됨
                          </span>
                        )}
                        {adminMode && studentBlocked && (
                          <span className="bg-rose-600 px-2 py-0.5 text-xs font-bold text-white">
                            차단됨
                          </span>
                        )}
                      </div>
                      <CategoryStamp category={s.category} />
                    </div>

                    <div className="break-words text-xl font-extrabold leading-snug">
                      {s.title || "비밀 쪽지"}
                    </div>
                    {/* 본문 */}
                    <div
                      className="mt-2 whitespace-pre-wrap break-words border-2 border-dashed border-amber-900/20 bg-white/40 p-3"
                      style={{
                        fontFamily: BODY_FONT,
                        fontSize: "0.95rem",
                        lineHeight: "1.6rem",
                      }}
                    >
                      {s.body}
                    </div>
                    <div className="mt-2 text-xs text-amber-900/60">
                      {formatDate(s.created_at)}
                    </div>

                    {/* 선생님 답장 — 초록 테두리 카드 */}
                    {s.reply && (
                      <div
                        className={`mt-3 border-2 bg-emerald-50 p-3 ${
                          hasNewReply(s)
                            ? "border-rose-400 ring-2 ring-rose-300/60"
                            : "border-emerald-600/50"
                        }`}
                      >
                        <div className="mb-1 text-xs font-bold text-emerald-900">
                          {hasNewReply(s) ? "💌 답장 도착! " : "🍎 선생님의 답장 "}
                          {s.replied_at && (
                            <span className="font-normal text-emerald-900/60">
                              · {formatDate(s.replied_at)}
                            </span>
                          )}
                        </div>
                        <div
                          className="whitespace-pre-wrap break-words text-sm leading-relaxed text-emerald-950"
                          style={{ fontFamily: BODY_FONT }}
                        >
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
                              className={`inline-flex min-h-[44px] items-center gap-1.5 border-2 px-3.5 py-1.5 text-sm font-bold transition ${
                                active
                                  ? "scale-110 border-emerald-500 bg-white text-emerald-800 shadow-[0_0_14px_rgba(16,185,129,0.4)]"
                                  : "border-amber-900/15 bg-white/60 text-amber-900 hover:bg-white/90"
                              } ${!isStudent ? "cursor-default opacity-90" : "active:scale-95"}`}
                            >
                              <span aria-hidden>{meta.emoji}</span>
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
                          className="min-h-[44px] flex-1 border border-amber-900/20 bg-white/80 py-2 text-sm font-bold text-amber-900 shadow-sm transition hover:bg-white disabled:opacity-50"
                        >
                          ✏️ 수정
                        </button>
                        <button
                          type="button"
                          onClick={() => requestDelete(s, false)}
                          disabled={!!activeBlock || pending || previewMode}
                          className="min-h-[44px] flex-1 border border-rose-700/30 bg-rose-200/90 py-2 text-sm font-bold text-rose-900 shadow-sm transition hover:bg-rose-300 disabled:opacity-50"
                        >
                          🗑️ 삭제
                        </button>
                      </div>
                    )}

                    {/* 관리자 모드: 인라인 관리 컨트롤 — 다크 유리 패널 */}
                    {adminMode && (
                      <div
                        className="mt-4 space-y-2 border border-white/10 bg-slate-900/90 p-3 text-white"
                        style={{ boxShadow: "0 8px 24px rgba(0,0,0,0.35)" }}
                      >
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-xs font-bold text-white/70">상태</span>
                          {STATUSES.map((st) => {
                            const active = s.status === st;
                            return (
                              <button
                                key={st}
                                type="button"
                                disabled={pending}
                                onClick={() => onChangeStatus(s.id, st)}
                                className={`border px-3 py-1.5 text-xs font-bold transition ${
                                  active
                                    ? ADMIN_STATUS_ACTIVE[st]
                                    : "border-white/15 bg-white/[0.06] text-white/60 hover:bg-white/10"
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
                          className="w-full resize-none border border-white/15 bg-white/10 px-2.5 py-2 text-sm text-white placeholder:text-white/40 focus:border-emerald-400 focus:outline-none"
                          style={{ lineHeight: "1.5rem" }}
                        />

                        <div className="flex flex-wrap gap-1.5">
                          <button
                            type="button"
                            disabled={pending}
                            onClick={() => onReply(s.id, s.reply)}
                            className="min-h-[40px] min-w-[80px] flex-1 bg-emerald-500 py-2 text-sm font-bold text-emerald-950 transition hover:bg-emerald-400 disabled:opacity-50"
                          >
                            💬 답장
                          </button>
                          <button
                            type="button"
                            disabled={pending}
                            onClick={() => requestDelete(s, true)}
                            className="min-h-[40px] min-w-[60px] flex-1 border border-rose-400/40 bg-rose-500/20 py-2 text-sm font-bold text-rose-200 transition hover:bg-rose-500/30 disabled:opacity-50"
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
                                className="min-h-[40px] min-w-[80px] flex-1 border border-emerald-400/40 bg-emerald-500/20 py-2 text-sm font-bold text-emerald-200 transition hover:bg-emerald-500/30 disabled:opacity-50"
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
                                className="min-h-[40px] min-w-[60px] flex-1 border border-white/20 bg-black/50 py-2 text-sm font-bold text-white transition hover:bg-black/70 disabled:opacity-50"
                              >
                                🚫 차단
                              </button>
                            )
                          ) : null}
                        </div>

                        {studentBlocked && (
                          <div className="bg-rose-500/15 px-2 py-1 text-xs text-rose-200">
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

                {/* 학생 모드 인라인 수정 — 크림 편지지 톤 */}
                {editing && !adminMode && (
                  <div className="space-y-2.5 pt-2">
                    <div className="mb-1 text-sm font-bold text-amber-900/80">
                      ✏️ 쪽지 수정 중
                    </div>
                    <div className="grid grid-cols-4 gap-2">
                      {CATEGORIES.map((c) => {
                        const active = editCategory === c;
                        const st = STAMP_META[c];
                        return (
                          <button
                            key={c}
                            type="button"
                            disabled={pending}
                            onClick={() => setEditCategory(c)}
                            className={`flex min-h-[56px] flex-col items-center justify-center gap-0.5 border-2 border-dashed transition ${st.border} ${st.bg} ${st.text} ${
                              active
                                ? "scale-105 ring-2 ring-emerald-500"
                                : "opacity-60 hover:opacity-90"
                            } disabled:cursor-not-allowed`}
                            style={
                              active
                                ? { boxShadow: "0 0 12px rgba(16,185,129,0.45)" }
                                : undefined
                            }
                          >
                            <span className="text-lg leading-none" aria-hidden>
                              {st.emoji}
                            </span>
                            <span className="text-xs font-bold">
                              {SUGGESTION_CATEGORY_LABELS[c]}
                            </span>
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
                      className="w-full border-b-2 border-amber-900/40 bg-white/70 px-3 py-2 text-amber-950 focus:border-amber-900 focus:bg-white focus:outline-none"
                      style={{ fontSize: "1rem" }}
                      placeholder="제목"
                    />
                    <textarea
                      value={editBody}
                      maxLength={SUGGESTION_BODY_MAX}
                      disabled={pending}
                      onChange={(e) => setEditBody(e.target.value)}
                      rows={5}
                      className="w-full resize-none border-2 border-dashed border-amber-900/30 bg-white/70 px-3 py-2 text-amber-950 focus:bg-white focus:outline-none"
                      style={{
                        fontFamily: BODY_FONT,
                        fontSize: "1rem",
                        lineHeight: "1.7rem",
                      }}
                      placeholder="내용"
                    />
                    <div className="flex gap-1.5">
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => setEditPublic(true)}
                        className={`min-h-[40px] flex-1 border-2 px-2 py-1.5 text-xs transition ${
                          editPublic
                            ? "border-emerald-600 bg-emerald-100 font-bold text-emerald-900"
                            : "border-amber-900/20 bg-white/60 text-amber-900/60"
                        }`}
                      >
                        👀 친구들도
                      </button>
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => setEditPublic(false)}
                        className={`min-h-[40px] flex-1 border-2 px-2 py-1.5 text-xs transition ${
                          !editPublic
                            ? "border-rose-600 bg-rose-100 font-bold text-rose-900"
                            : "border-amber-900/20 bg-white/60 text-amber-900/60"
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
                        className=""
                      />
                      <span className={!editPublic ? "opacity-50" : ""}>익명</span>
                    </label>
                    {editError && (
                      <div className="bg-rose-100 px-2 py-1 text-xs text-rose-700">
                        {editError}
                      </div>
                    )}
                    <div className="flex gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => submitEdit(s.id)}
                        disabled={pending}
                        className="min-h-[44px] flex-1 bg-emerald-600 py-2 text-sm font-bold text-white transition hover:bg-emerald-500 disabled:opacity-50"
                      >
                        💾 저장
                      </button>
                      <button
                        type="button"
                        onClick={cancelEdit}
                        disabled={pending}
                        className="min-h-[44px] flex-1 border border-amber-900/20 bg-white/70 py-2 text-sm font-bold text-amber-900 transition hover:bg-white disabled:opacity-50"
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

      {/* ===== 쪽지 쓰기 바텀시트 — 다크 유리 + 크림 편지지 입력 ===== */}
      {writeOpen && (
        <div
          className="fixed inset-0 z-40 flex items-end justify-center bg-black/70 backdrop-blur-sm"
          onClick={() => setWriteOpen(false)}
        >
          <div
            className="max-h-[88dvh] w-full max-w-md overflow-y-auto bg-slate-900/95 p-5 pb-8 text-white backdrop-blur"
            style={{
              borderTop: `4px solid ${WOOD_DARK}`,
              borderLeft: `4px solid ${WOOD_DARK}`,
              borderRight: `4px solid ${WOOD_DARK}`,
              boxShadow: `${BEVEL}, 0 -16px 48px rgba(0,0,0,0.6)`,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* 그립바 */}
            <div className="mx-auto mb-3 h-1.5 w-12 bg-white/20" />
            <div className="mb-4 flex items-center justify-between">
              <div
                className="text-lg font-extrabold"
                style={{ textShadow: "0 0 12px rgba(52,211,153,0.35)" }}
              >
                ✉️ 쪽지 쓰기
              </div>
              <button
                type="button"
                onClick={() => setWriteOpen(false)}
                aria-label="닫기"
                className="flex h-9 w-9 items-center justify-center border border-white/15 bg-white/10 text-sm font-bold text-white transition hover:bg-white/20"
              >
                ✕
              </button>
            </div>

            {/* 카테고리 = 우표 고르기 */}
            <div className="mb-4">
              <div className="mb-2 text-sm font-bold text-white/85">
                어떤 이야기인가요? 우표를 골라요
              </div>
              <div className="grid grid-cols-4 gap-2">
                {CATEGORIES.map((c) => {
                  const active = category === c;
                  const st = STAMP_META[c];
                  return (
                    <button
                      key={c}
                      type="button"
                      disabled={pending || !!activeBlock}
                      onClick={() => setCategory(c)}
                      className={`flex min-h-[64px] flex-col items-center justify-center gap-1 border-2 border-dashed transition ${st.border} ${st.bg} ${st.text} ${
                        active
                          ? "scale-105 ring-2 ring-emerald-400"
                          : "opacity-55 hover:opacity-85"
                      } disabled:cursor-not-allowed disabled:opacity-40`}
                      style={
                        active
                          ? { boxShadow: "0 0 16px rgba(52,211,153,0.55)" }
                          : undefined
                      }
                    >
                      <span className="text-xl leading-none" aria-hidden>
                        {st.emoji}
                      </span>
                      <span className="text-xs font-bold">
                        {SUGGESTION_CATEGORY_LABELS[c]}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="mb-3">
              <label className="mb-1 block text-sm font-bold text-white/85">
                제목
              </label>
              <input
                type="text"
                value={title}
                maxLength={SUGGESTION_TITLE_MAX}
                disabled={pending || !!activeBlock}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="짧게 한 줄로!"
                className="w-full px-3 py-2.5 text-amber-950 placeholder:text-amber-900/40 focus:outline-none disabled:opacity-60"
                style={{
                  fontSize: "1.05rem",
                  background: LETTER_BG,
                  border: `3px solid ${PAPER_BORDER}`,
                }}
              />
              <div className="mt-0.5 text-right text-xs text-white/50">
                {title.length}/{SUGGESTION_TITLE_MAX}
              </div>
            </div>

            <div className="mb-3">
              <label className="mb-1 block text-sm font-bold text-white/85">
                내용
              </label>
              <textarea
                value={body}
                maxLength={SUGGESTION_BODY_MAX}
                disabled={pending || !!activeBlock}
                onChange={(e) => setBody(e.target.value)}
                placeholder="자세한 이야기를 적어주세요"
                rows={6}
                className="w-full resize-none px-3 py-2 text-amber-950 placeholder:text-amber-900/40 focus:outline-none disabled:opacity-60"
                style={{
                  fontFamily: BODY_FONT,
                  fontSize: "1rem",
                  lineHeight: "1.7rem",
                  background: LETTER_BG,
                  border: `3px solid ${PAPER_BORDER}`,
                }}
              />
              <div className="mt-0.5 text-right text-xs text-white/50">
                {body.length}/{SUGGESTION_BODY_MAX}
              </div>
            </div>

            {/* 공개 / 비공개 토글 */}
            <div className="mb-3 border border-white/10 bg-white/[0.04] p-3">
              <div className="mb-2 text-sm font-bold text-white/85">
                누가 볼 수 있어요?
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={pending || !!activeBlock}
                  onClick={() => setIsPublic(true)}
                  className={`min-h-[44px] flex-1 border-2 px-3 py-2 text-sm transition disabled:opacity-50 ${
                    isPublic
                      ? "border-emerald-400 bg-emerald-500/25 font-bold text-emerald-100"
                      : "border-white/15 bg-white/[0.06] text-white/55"
                  }`}
                  style={isPublic ? { boxShadow: EMERALD_GLOW } : undefined}
                >
                  👀 친구들도 보기
                </button>
                <button
                  type="button"
                  disabled={pending || !!activeBlock}
                  onClick={() => setIsPublic(false)}
                  className={`min-h-[44px] flex-1 border-2 px-3 py-2 text-sm transition disabled:opacity-50 ${
                    !isPublic
                      ? "border-rose-400 bg-rose-500/25 font-bold text-rose-100"
                      : "border-white/15 bg-white/[0.06] text-white/55"
                  }`}
                  style={
                    !isPublic
                      ? { boxShadow: "0 0 14px rgba(244,63,94,0.45)" }
                      : undefined
                  }
                >
                  🔒 선생님만 (비밀)
                </button>
              </div>
              <div className="mt-1.5 text-xs text-white/55">
                {isPublic
                  ? "친구들이 우체통에서 같이 읽을 수 있어요."
                  : "다른 친구들에게는 보이지 않아요. 선생님만 펼쳐서 봐요."}
              </div>
            </div>

            <label className="mb-4 flex select-none items-center gap-2 text-sm text-white/85">
              <input
                type="checkbox"
                checked={isAnonymous}
                disabled={pending || !!activeBlock || !isPublic}
                onChange={(e) => setIsAnonymous(e.target.checked)}
                className="rounded border-white/30 disabled:opacity-50"
              />
              <span className={!isPublic ? "opacity-50" : ""}>
                익명으로 보내기 (이름이 가려져요)
              </span>
            </label>

            {error && (
              <div className="mb-3 border border-rose-400/40 bg-rose-500/15 px-3 py-2 text-sm text-rose-200">
                {error}
              </div>
            )}

            <button
              type="button"
              onClick={onSubmit}
              disabled={pending || !!activeBlock}
              className="min-h-[48px] w-full py-3 text-base font-extrabold text-white transition hover:brightness-110 active:translate-y-0.5 disabled:cursor-not-allowed disabled:brightness-50"
              style={{
                letterSpacing: "0.05em",
                background: GRASS,
                border: `3px solid ${GRASS_DARK}`,
                boxShadow: `${BEVEL}, 0 4px 0 rgba(0,0,0,0.45)`,
                textShadow: "1px 1px 0 rgba(0,0,0,0.45)",
              }}
            >
              {pending ? "보내는 중..." : "📮 우체통에 넣기"}
            </button>
          </div>
        </div>
      )}

      {/* ===== 삭제 확인 모달 — 다크 유리 ===== */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm">
          <div className="w-full max-w-sm border border-white/15 bg-slate-900/95 p-5 text-white shadow-2xl">
            <div className="mb-2 text-center text-3xl" aria-hidden>
              🗑️
            </div>
            <h3 className="mb-1 text-center text-base font-bold">
              쪽지를 정말 삭제할까요?
            </h3>
            <p className="mb-1 line-clamp-2 break-words text-center text-sm text-white/60">
              &ldquo;{confirmDelete.title}&rdquo;
            </p>
            <p className="mb-4 text-center text-xs text-white/40">
              삭제하면 되돌릴 수 없어요.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setConfirmDelete(null)}
                disabled={pending}
                className="min-h-[44px] flex-1 border border-white/15 bg-white/[0.06] py-2.5 text-sm font-bold text-white/80 transition hover:bg-white/10 disabled:opacity-50"
              >
                남겨두기
              </button>
              <button
                type="button"
                onClick={doDelete}
                disabled={pending}
                className="min-h-[44px] flex-1 bg-rose-500 py-2.5 text-sm font-bold text-white transition hover:bg-rose-400 disabled:opacity-50"
              >
                삭제하기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== 차단 모달 (adminMode) — 다크 유리 ===== */}
      {blockTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm">
          <div className="w-full max-w-sm border border-white/15 bg-slate-900/95 p-5 text-white shadow-2xl">
            <h3 className="mb-1 text-base font-bold">
              🚫 {blockTarget.name} 건의함 제한
            </h3>
            <p className="mb-4 text-xs text-white/55">
              제한 기간 동안 이 학생은 새 글을 쓸 수 없어요. (기존 글은 유지)
            </p>
            <label className="mb-1 block text-xs font-bold text-white/75">
              사유 (선택)
            </label>
            <input
              type="text"
              value={blockReason}
              onChange={(e) => setBlockReason(e.target.value)}
              placeholder="예: 반복적인 부적절한 표현"
              className="mb-3 w-full border border-white/15 bg-white/10 px-3 py-2 text-sm text-white placeholder:text-white/35 focus:border-amber-400 focus:outline-none"
            />
            <div className="mb-2 text-xs font-bold text-white/75">기간</div>
            <div className="mb-5 grid grid-cols-4 gap-2">
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
                  className={`min-h-[40px] border py-2 text-sm font-bold transition ${
                    blockDuration === v
                      ? "border-amber-300 bg-amber-400 text-amber-950"
                      : "border-white/15 bg-white/[0.06] text-white/70 hover:bg-white/10"
                  }`}
                  style={
                    blockDuration === v
                      ? { boxShadow: "0 0 12px rgba(245,158,11,0.4)" }
                      : undefined
                  }
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
                className="min-h-[44px] flex-1 border border-white/15 bg-white/[0.06] py-2 text-sm font-bold text-white/80 transition hover:bg-white/10 disabled:opacity-50"
              >
                취소
              </button>
              <button
                type="button"
                onClick={submitBlock}
                disabled={pending}
                className="min-h-[44px] flex-1 bg-rose-500 py-2 text-sm font-bold text-white transition hover:bg-rose-400 disabled:opacity-50"
              >
                제한하기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== 토스트 — 다크 유리 (보상 토스트는 에메랄드 글로우 강조) ===== */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className={`fixed bottom-6 left-1/2 z-50 -translate-x-1/2 border bg-slate-900/90 px-4 py-2.5 text-sm font-bold text-white backdrop-blur-sm ${
            toast.includes("🍎") ? "border-emerald-400/60" : "border-white/20"
          }`}
          style={
            toast.includes("🍎")
              ? { boxShadow: "0 0 20px rgba(52,211,153,0.5)", fontFamily: PIXEL }
              : { boxShadow: "0 8px 24px rgba(0,0,0,0.4)", fontFamily: PIXEL }
          }
        >
          {toast}
        </div>
      )}
    </main>
  );
}

// ===== 프레젠테이션 보조 컴포넌트 =====

// 카테고리 픽셀 뱃지 — 각진 프레임 칩 (시안의 카드 좌상단 뱃지).
function CategoryStamp({ category }: { category: SuggestionCategory }) {
  const st = STAMP_META[category];
  return (
    <span
      className={`inline-flex shrink-0 items-center border-2 px-1.5 py-px text-[11px] font-bold leading-tight ${st.border} ${st.bg} ${st.text}`}
      style={{ boxShadow: "1px 1px 0 rgba(0,0,0,0.25)", fontFamily: PIXEL }}
    >
      {SUGGESTION_CATEGORY_LABELS[category]}
    </span>
  );
}

// 밤하늘 별 — GameCenterClient 의 Stars 와 동일한 패턴.
function Stars() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-0 opacity-70"
      style={{
        backgroundImage:
 "radial-gradient(1.5px 1.5px at 20% 30%, rgba(255,255,255,0.7) 50%, transparent 51%)," +
 "radial-gradient(1px 1px at 70% 60%, rgba(255,255,255,0.55) 50%, transparent 51%)," +
 "radial-gradient(1.2px 1.2px at 40% 80%, rgba(255,255,255,0.5) 50%, transparent 51%)," +
 "radial-gradient(1px 1px at 85% 20%, rgba(255,255,255,0.55) 50%, transparent 51%)," +
 "radial-gradient(1.4px 1.4px at 12% 70%, rgba(255,255,255,0.45) 50%, transparent 51%)," +
 "radial-gradient(1px 1px at 55% 15%, rgba(255,255,255,0.5) 50%, transparent 51%)," +
 "radial-gradient(1.8px 1.8px at 90% 75%, rgba(255,255,255,0.4) 50%, transparent 51%)," +
 "radial-gradient(1px 1px at 5% 50%, rgba(255,255,255,0.5) 50%, transparent 51%)",
        backgroundSize: "320px 320px",
      }}
    />
  );
}
