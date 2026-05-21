"use client";

// 학생 건의함 — 칠판에 포스트잇을 붙이는 비주얼.
// student 모드: 같은 지점 친구들과 공유. 본인 글은 수정/삭제 가능.
// previewMode: 관리자가 학생 화면을 그냥 미리보기 (제출/수정/삭제 차단).
// adminMode: 관리자가 학생 화면 그대로 보면서 각 쪽지에 인라인 관리 (답장/상태/삭제/차단).

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  SUGGESTION_BODY_MAX,
  SUGGESTION_CATEGORY_LABELS,
  SUGGESTION_REPLY_MAX,
  SUGGESTION_STATUS_LABELS,
  SUGGESTION_TITLE_MAX,
  type SuggestionBlock,
  type SuggestionCategory,
  type SuggestionStatus,
} from "@/lib/types";
import {
  deleteSuggestionAction,
  editSuggestionAction,
  submitSuggestionAction,
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
  // adminMode 전용 — 학생 차단 액션에 필요.
  admin_student_id?: string | null;
};

export type AdminStudentInfo = { name: string; className: string | null };
export type AdminBlockInfo = { reason: string | null; blockedUntil: string | null };

const CATEGORIES: SuggestionCategory[] = ["praise", "suggestion", "complaint", "etc"];
const STATUSES: SuggestionStatus[] = ["received", "reviewing", "done"];

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

const TILTS = ["-rotate-2", "rotate-1", "-rotate-1", "rotate-2", "rotate-0"];
function tiltFor(i: number): string {
  return TILTS[i % TILTS.length];
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

  // 학생용 폼 상태
  const [category, setCategory] = useState<SuggestionCategory>("suggestion");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // 학생용 인라인 수정
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editCategory, setEditCategory] = useState<SuggestionCategory>("suggestion");
  const [editTitle, setEditTitle] = useState("");
  const [editBody, setEditBody] = useState("");
  const [editAnon, setEditAnon] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // adminMode 답장 입력 (id → draft)
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  // adminMode 차단 모달
  const [blockTarget, setBlockTarget] = useState<{
    studentId: string;
    name: string;
  } | null>(null);
  const [blockReason, setBlockReason] = useState("");
  const [blockDuration, setBlockDuration] = useState<"1" | "7" | "30" | "perm">(
    "7",
  );

  const disabled = !!activeBlock || pending || previewMode || adminMode;
  const disabledEdit = !!activeBlock || pending || previewMode || adminMode;

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2400);
  };

  // ===== 학생 액션들 =====
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
      });
      if (!res.ok) {
        setError(res.message);
        return;
      }
      setTitle("");
      setBody("");
      showToast("쪽지를 칠판에 붙였어요! 🎉");
      router.refresh();
    });
  };

  const startEdit = (s: SuggestionView) => {
    setEditingId(s.id);
    setEditCategory(s.category);
    setEditTitle(s.title);
    setEditBody(s.body);
    setEditAnon(s.is_anonymous);
    setEditError(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
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
      });
      if (!res.ok) {
        setEditError(res.message);
        return;
      }
      setEditingId(null);
      showToast("쪽지를 수정했어요 ✏️");
      router.refresh();
    });
  };

  const onDelete = (id: string) => {
    if (!confirm("이 쪽지를 정말 떼어낼까요? 되돌릴 수 없어요.")) return;
    startTransition(async () => {
      const res = await deleteSuggestionAction({ id });
      if (!res.ok) {
        showToast(res.message);
        return;
      }
      if (editingId === id) setEditingId(null);
      showToast("쪽지를 떼어냈어요 🗑️");
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

  const onAdminDelete = (id: string) => {
    if (!confirm("이 쪽지를 정말 삭제할까요?")) return;
    startTransition(async () => {
      const res = await adminDeleteSuggestionAction(id);
      if (!res.ok) {
        showToast(res.message);
        return;
      }
      showToast("쪽지를 삭제했어요 🗑️");
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
    const days =
      blockDuration === "perm" ? null : parseInt(blockDuration, 10);
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
    if (!confirm(`${name} 학생의 건의함 제한을 해제할까요?`)) return;
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

  // 학생 폼은 학생 모드에서만 노출 (preview/admin 에서는 숨김).
  const showStudentForm = !previewMode && !adminMode;
  // 안내문구도 학생 모드에서만.
  const showStudentNotice = !adminMode;

  return (
    <main
      className="min-h-screen pb-24 relative"
      style={{
        background:
          "radial-gradient(circle at 20% 0%, #f5deb3 0%, #d8a574 35%, #a06a3a 100%)",
      }}
    >
      <header className="sticky top-0 z-30 bg-white/70 backdrop-blur border-b border-amber-200/50">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link
            href={adminMode ? "/admin" : "/me/village"}
            className="shrink-0 text-sm text-amber-900 hover:text-amber-700 hover:bg-amber-100/70 rounded-lg px-3 py-1.5 transition"
          >
            ← {adminMode ? "관리" : "마을"}
          </Link>
          <h1 className="text-lg font-semibold text-amber-900">건의 우체통 📮</h1>
          {previewMode && (
            <span className="ml-auto px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-xs font-medium">
              미리보기
            </span>
          )}
          {adminMode && (
            <span className="ml-auto px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 text-xs font-medium">
              관리자 모드
            </span>
          )}
        </div>
      </header>

      {/* 리스트형 관리 페이지로 가는 floating 버튼 — preview / admin 양쪽에서 노출 */}
      {(previewMode || adminMode) && adminLink && (
        <div className="fixed bottom-6 right-6 z-40">
          <Link
            href={adminLink}
            className="inline-flex items-center gap-2 px-4 py-3 rounded-full bg-gray-900 text-white shadow-2xl hover:bg-gray-800 transition text-sm font-semibold"
          >
            <span>리스트 관리</span>
            <span aria-hidden>→</span>
          </Link>
        </div>
      )}

      <div className="max-w-3xl mx-auto px-3 sm:px-6 py-6">
        <div
          className="rounded-2xl p-3 sm:p-4 shadow-2xl"
          style={{
            background:
              "linear-gradient(135deg, #8b5a2b 0%, #5b3416 40%, #8b5a2b 100%)",
          }}
        >
          <div
            className="rounded-xl p-5 sm:p-8 relative overflow-hidden"
            style={{
              background:
                "radial-gradient(ellipse at center, #2f5240 0%, #233f31 70%, #1c3225 100%)",
              boxShadow: "inset 0 0 60px rgba(0,0,0,0.45)",
            }}
          >
            <div
              className="pointer-events-none absolute inset-0 opacity-[0.08]"
              style={{
                backgroundImage:
                  "repeating-linear-gradient(45deg, rgba(255,255,255,0.6) 0 1px, transparent 1px 3px)",
              }}
            />

            <div className="relative text-center mb-3">
              <div
                className="text-white text-2xl sm:text-3xl font-extrabold tracking-wide"
                style={{
                  fontFamily:
                    "'Gaegu','Nanum Pen Script','Comic Sans MS',cursive",
                  textShadow:
                    "0 0 2px rgba(255,255,255,0.4), 1px 1px 0 rgba(0,0,0,0.2)",
                  letterSpacing: "0.05em",
                }}
              >
                ✦ 오늘의 건의함 ✦
              </div>
              <div
                className="text-white/80 text-sm mt-1"
                style={{ fontFamily: "'Gaegu','Nanum Pen Script',cursive" }}
              >
                {studentName}님, 학원에 하고 싶은 말이 있나요?
              </div>
            </div>

            {showStudentNotice && (
              <div
                className="relative mx-auto max-w-xl text-center mb-6 px-4 py-2 rounded-lg border border-white/25 bg-white/5"
                style={{ fontFamily: "'Gaegu','Nanum Pen Script',cursive" }}
              >
                <div className="text-white/90 text-base sm:text-lg leading-snug">
                  🐣 친구들도 다 같이 보는 공간이에요!
                </div>
                <div className="text-white/75 text-sm sm:text-base leading-snug mt-0.5">
                  욕설이나 장난치는 곳이 아니에요. 마음을 담아 적어주세요 💌
                </div>
              </div>
            )}

            {adminMode && (
              <div className="relative mx-auto max-w-xl text-center mb-6 px-4 py-3 rounded-lg border border-rose-300/40 bg-rose-900/30">
                <div
                  className="text-rose-100 text-sm sm:text-base"
                  style={{ fontFamily: "'Gaegu',cursive" }}
                >
                  🔧 각 쪽지 아래의 컨트롤로 답장/상태/삭제/차단을 처리하세요.
                </div>
              </div>
            )}

            {activeBlock && (
              <div
                className={`relative mx-auto max-w-lg mb-6 rounded-lg p-4 shadow-lg bg-rose-200 ${tiltFor(2)}`}
              >
                <div className="absolute -top-2 left-1/2 -translate-x-1/2 w-16 h-4 bg-yellow-100/80 rotate-2 shadow-sm" />
                <div className="text-rose-900 font-bold mb-1">
                  ⚠ 건의함 사용이 제한되었어요
                </div>
                {activeBlock.reason && (
                  <div className="text-rose-800 text-sm mb-1">
                    사유: {activeBlock.reason}
                  </div>
                )}
                <div className="text-rose-700 text-xs">
                  {activeBlock.blocked_until
                    ? `해제 예정: ${formatDate(activeBlock.blocked_until)}`
                    : "영구 제한"}
                </div>
              </div>
            )}

            {showStudentForm && (
              <div className="relative mx-auto max-w-xl">
                <div
                  className={`relative p-5 sm:p-6 rounded-sm shadow-2xl ${tiltFor(0)}`}
                  style={{
                    background:
                      "linear-gradient(180deg, #fff7a8 0%, #ffe97a 100%)",
                    boxShadow:
                      "0 10px 25px rgba(0,0,0,0.35), 0 2px 4px rgba(0,0,0,0.2)",
                  }}
                >
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 w-24 h-5 bg-amber-100/90 -rotate-1 shadow-md" />

                  <div className="mb-4">
                    <div
                      className="text-xs font-bold text-amber-900 mb-2"
                      style={{ fontFamily: "'Gaegu',cursive" }}
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
                            disabled={disabled}
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
                      className="block text-xs font-bold text-amber-900 mb-1"
                      style={{ fontFamily: "'Gaegu',cursive" }}
                    >
                      제목
                    </label>
                    <input
                      type="text"
                      value={title}
                      maxLength={SUGGESTION_TITLE_MAX}
                      disabled={disabled}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="짧게 한 줄로!"
                      className="w-full px-3 py-2 rounded-md bg-white/70 border-b-2 border-amber-900/40 focus:outline-none focus:bg-white focus:border-amber-900 disabled:bg-white/40 text-amber-950 placeholder:text-amber-900/40"
                      style={{ fontFamily: "'Gaegu',cursive", fontSize: "1.05rem" }}
                    />
                    <div className="text-right text-[11px] text-amber-900/60 mt-0.5">
                      {title.length}/{SUGGESTION_TITLE_MAX}
                    </div>
                  </div>

                  <div className="mb-3">
                    <label
                      className="block text-xs font-bold text-amber-900 mb-1"
                      style={{ fontFamily: "'Gaegu',cursive" }}
                    >
                      내용
                    </label>
                    <textarea
                      value={body}
                      maxLength={SUGGESTION_BODY_MAX}
                      disabled={disabled}
                      onChange={(e) => setBody(e.target.value)}
                      placeholder="자세한 이야기를 적어주세요"
                      rows={6}
                      className="w-full px-3 py-2 rounded-md bg-white/60 focus:outline-none focus:bg-white disabled:bg-white/40 resize-none text-amber-950 placeholder:text-amber-900/40"
                      style={{
                        fontFamily: "'Gaegu',cursive",
                        fontSize: "1.05rem",
                        lineHeight: "1.9rem",
                        backgroundImage:
                          "repeating-linear-gradient(transparent 0 calc(1.9rem - 1px), rgba(120,80,30,0.25) calc(1.9rem - 1px) 1.9rem)",
                        backgroundAttachment: "local",
                      }}
                    />
                    <div className="text-right text-[11px] text-amber-900/60 mt-0.5">
                      {body.length}/{SUGGESTION_BODY_MAX}
                    </div>
                  </div>

                  <label className="flex items-center gap-2 text-sm text-amber-900 mb-4 select-none">
                    <input
                      type="checkbox"
                      checked={isAnonymous}
                      disabled={disabled}
                      onChange={(e) => setIsAnonymous(e.target.checked)}
                      className="rounded border-amber-700/40 disabled:opacity-50"
                    />
                    <span style={{ fontFamily: "'Gaegu',cursive" }}>
                      익명으로 붙이기 (이름이 가려져요)
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
                    disabled={disabled}
                    className="w-full py-3 rounded-md bg-amber-700 hover:bg-amber-800 text-white font-bold transition disabled:bg-gray-400 disabled:cursor-not-allowed shadow-md"
                    style={{
                      fontFamily: "'Gaegu',cursive",
                      fontSize: "1.1rem",
                      letterSpacing: "0.05em",
                    }}
                  >
                    {pending ? "붙이는 중..." : "📌 칠판에 붙이기"}
                  </button>
                </div>
              </div>
            )}

            {/* 쪽지 목록 */}
            <div className="relative mt-10">
              <div
                className="text-white/90 text-base sm:text-lg font-bold text-center mb-4"
                style={{
                  fontFamily: "'Gaegu','Nanum Pen Script',cursive",
                  textShadow: "0 0 2px rgba(255,255,255,0.3)",
                }}
              >
                — {adminMode ? "지점의 모든 쪽지" : "우리 학원 친구들의 쪽지"}{" "}
                {suggestions.length > 0 && `(${suggestions.length})`} —
              </div>

              {suggestions.length === 0 ? (
                <div
                  className="text-center text-white/60 text-sm py-6"
                  style={{ fontFamily: "'Gaegu',cursive" }}
                >
                  {adminMode
                    ? "아직 붙은 쪽지가 없어요."
                    : "아직 붙인 쪽지가 없어요. 첫 번째로 붙여보세요!"}
                </div>
              ) : (
                <ul className="grid grid-cols-1 sm:grid-cols-2 gap-5 sm:gap-6">
                  {suggestions.map((s, i) => {
                    const col = POSTIT_COLORS[s.category];
                    const wasEdited =
                      new Date(s.updated_at).getTime() -
                        new Date(s.created_at).getTime() >
                      2000;
                    const isEditing = editingId === s.id;
                    const studentBlocked =
                      adminMode && s.admin_student_id
                        ? adminBlockInfo?.[s.admin_student_id] ?? null
                        : null;
                    const authorLabel = adminMode
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

                    return (
                      <li
                        key={s.id}
                        className={`relative ${isEditing ? "rotate-0" : tiltFor(i + 1)} ${col.bg} ${col.text} rounded-sm p-4 shadow-xl ${
                          s.is_mine ? "ring-2 ring-amber-700/40" : ""
                        }`}
                        style={{
                          boxShadow:
                            "0 8px 20px rgba(0,0,0,0.35), 0 2px 4px rgba(0,0,0,0.2)",
                          fontFamily: "'Gaegu','Nanum Pen Script',cursive",
                        }}
                      >
                        <div
                          className="absolute -top-2 left-1/2 -translate-x-1/2 w-3.5 h-3.5 rounded-full bg-red-500 shadow-md"
                          style={{
                            boxShadow:
                              "inset -1px -1px 2px rgba(0,0,0,0.4), 0 1px 2px rgba(0,0,0,0.3)",
                          }}
                        />

                        {!isEditing && (
                          <>
                            <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
                              <span className="px-2 py-0.5 rounded-full text-[11px] bg-white/70 font-bold">
                                {SUGGESTION_CATEGORY_LABELS[s.category]}
                              </span>
                              <span
                                className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${STATUS_COLORS[s.status]}`}
                              >
                                {SUGGESTION_STATUS_LABELS[s.status]}
                              </span>
                              <span className="px-2 py-0.5 rounded-full text-[11px] bg-white/60">
                                ✍ {authorLabel}
                              </span>
                              {wasEdited && (
                                <span className="px-2 py-0.5 rounded-full text-[11px] bg-white/50 opacity-80">
                                  수정됨
                                </span>
                              )}
                              {adminMode && studentBlocked && (
                                <span className="px-2 py-0.5 rounded-full text-[11px] bg-rose-700 text-white font-bold">
                                  차단됨
                                </span>
                              )}
                            </div>
                            <div className="font-extrabold text-lg leading-snug break-words">
                              {s.title}
                            </div>
                            <div className="text-[15px] leading-snug mt-1 whitespace-pre-wrap break-words">
                              {s.body}
                            </div>
                            <div className="text-[11px] opacity-70 mt-2">
                              {formatDate(s.created_at)}
                            </div>

                            {s.reply && (
                              <div className="mt-3 rounded-md bg-white/80 p-2.5 border border-amber-900/20">
                                <div className="text-[11px] font-bold text-amber-900 mb-0.5">
                                  선생님 답장{" "}
                                  {s.replied_at && (
                                    <span className="font-normal opacity-70">
                                      · {formatDate(s.replied_at)}
                                    </span>
                                  )}
                                </div>
                                <div className="text-[14px] text-amber-950 whitespace-pre-wrap break-words leading-snug">
                                  {s.reply}
                                </div>
                              </div>
                            )}

                            {/* 학생 모드: 본인 쪽지 수정/삭제 */}
                            {!adminMode && s.is_mine && (
                              <div className="mt-3 flex gap-2">
                                <button
                                  type="button"
                                  onClick={() => startEdit(s)}
                                  disabled={!!activeBlock || pending || previewMode}
                                  className="flex-1 py-1.5 rounded-md bg-white/80 hover:bg-white text-amber-900 text-sm font-bold border border-amber-900/20 shadow-sm disabled:opacity-50"
                                  style={{ fontFamily: "'Gaegu',cursive" }}
                                >
                                  ✏️ 수정
                                </button>
                                <button
                                  type="button"
                                  onClick={() => onDelete(s.id)}
                                  disabled={!!activeBlock || pending || previewMode}
                                  className="flex-1 py-1.5 rounded-md bg-rose-200/90 hover:bg-rose-300 text-rose-900 text-sm font-bold border border-rose-700/30 shadow-sm disabled:opacity-50"
                                  style={{ fontFamily: "'Gaegu',cursive" }}
                                >
                                  🗑️ 삭제
                                </button>
                              </div>
                            )}

                            {/* 관리자 모드: 인라인 관리 컨트롤 */}
                            {adminMode && (
                              <div className="mt-3 pt-3 border-t border-amber-900/20 space-y-2">
                                {/* 상태 변경 */}
                                <div className="flex items-center gap-1.5">
                                  <span
                                    className="text-[11px] font-bold opacity-80"
                                    style={{ fontFamily: "'Gaegu',cursive" }}
                                  >
                                    상태
                                  </span>
                                  {STATUSES.map((st) => {
                                    const active = s.status === st;
                                    return (
                                      <button
                                        key={st}
                                        type="button"
                                        disabled={pending}
                                        onClick={() => onChangeStatus(s.id, st)}
                                        className={`px-2 py-0.5 rounded-full text-[11px] font-bold border ${
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

                                {/* 답장 */}
                                <div>
                                  <textarea
                                    value={replyDrafts[s.id] ?? s.reply ?? ""}
                                    maxLength={SUGGESTION_REPLY_MAX}
                                    onChange={(e) =>
                                      setReplyDraft(s.id, e.target.value)
                                    }
                                    placeholder="학생에게 보낼 답장…"
                                    rows={2}
                                    disabled={pending}
                                    className="w-full text-[14px] px-2 py-1.5 rounded-md bg-white/80 text-amber-950 focus:outline-none focus:bg-white resize-none"
                                    style={{
                                      fontFamily: "'Gaegu',cursive",
                                      lineHeight: "1.5rem",
                                    }}
                                  />
                                </div>

                                <div className="flex flex-wrap gap-1.5">
                                  <button
                                    type="button"
                                    disabled={pending}
                                    onClick={() => onReply(s.id, s.reply)}
                                    className="flex-1 min-w-[80px] py-1.5 rounded-md bg-amber-700 hover:bg-amber-800 text-white text-sm font-bold disabled:opacity-50"
                                    style={{ fontFamily: "'Gaegu',cursive" }}
                                  >
                                    💬 답장
                                  </button>
                                  <button
                                    type="button"
                                    disabled={pending}
                                    onClick={() => onAdminDelete(s.id)}
                                    className="flex-1 min-w-[60px] py-1.5 rounded-md bg-rose-200 hover:bg-rose-300 text-rose-900 text-sm font-bold border border-rose-700/30 disabled:opacity-50"
                                    style={{ fontFamily: "'Gaegu',cursive" }}
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
                                            adminStudentInfo?.[s.admin_student_id!]
                                              ?.name ?? s.student_name_snapshot,
                                          )
                                        }
                                        className="flex-1 min-w-[80px] py-1.5 rounded-md bg-emerald-200 hover:bg-emerald-300 text-emerald-900 text-sm font-bold border border-emerald-700/30 disabled:opacity-50"
                                        style={{ fontFamily: "'Gaegu',cursive" }}
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
                                            adminStudentInfo?.[s.admin_student_id!]
                                              ?.name ?? s.student_name_snapshot,
                                          )
                                        }
                                        className="flex-1 min-w-[60px] py-1.5 rounded-md bg-gray-800 hover:bg-gray-900 text-white text-sm font-bold disabled:opacity-50"
                                        style={{ fontFamily: "'Gaegu',cursive" }}
                                      >
                                        🚫 차단
                                      </button>
                                    )
                                  ) : null}
                                </div>

                                {studentBlocked && (
                                  <div className="text-[11px] text-rose-700 bg-rose-50 rounded px-2 py-1">
                                    {studentBlocked.reason &&
                                      `사유: ${studentBlocked.reason} · `}
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
                        {isEditing && !adminMode && (
                          <div className="space-y-2">
                            <div className="text-xs font-bold opacity-80 mb-1">
                              ✏️ 쪽지 수정 중
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              {CATEGORIES.map((c) => {
                                const active = editCategory === c;
                                return (
                                  <button
                                    key={c}
                                    type="button"
                                    disabled={disabledEdit}
                                    onClick={() => setEditCategory(c)}
                                    className={`px-2 py-1 rounded-md text-xs border ${
                                      active
                                        ? "bg-white text-amber-900 border-amber-900 font-bold"
                                        : "bg-white/50 text-amber-900/70 border-amber-900/20"
                                    }`}
                                    style={{ fontFamily: "'Gaegu',cursive" }}
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
                              disabled={disabledEdit}
                              onChange={(e) => setEditTitle(e.target.value)}
                              className="w-full px-2 py-1.5 rounded-md bg-white/80 text-amber-950 border-b-2 border-amber-900/40 focus:outline-none focus:bg-white"
                              style={{
                                fontFamily: "'Gaegu',cursive",
                                fontSize: "1rem",
                              }}
                              placeholder="제목"
                            />
                            <textarea
                              value={editBody}
                              maxLength={SUGGESTION_BODY_MAX}
                              disabled={disabledEdit}
                              onChange={(e) => setEditBody(e.target.value)}
                              rows={5}
                              className="w-full px-2 py-1.5 rounded-md bg-white/80 text-amber-950 focus:outline-none focus:bg-white resize-none"
                              style={{
                                fontFamily: "'Gaegu',cursive",
                                fontSize: "1rem",
                                lineHeight: "1.7rem",
                              }}
                              placeholder="내용"
                            />
                            <label className="flex items-center gap-2 text-xs">
                              <input
                                type="checkbox"
                                checked={editAnon}
                                disabled={disabledEdit}
                                onChange={(e) => setEditAnon(e.target.checked)}
                                className="rounded"
                              />
                              <span style={{ fontFamily: "'Gaegu',cursive" }}>
                                익명
                              </span>
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
                                disabled={disabledEdit}
                                className="flex-1 py-1.5 rounded-md bg-amber-700 hover:bg-amber-800 text-white text-sm font-bold disabled:opacity-50"
                                style={{ fontFamily: "'Gaegu',cursive" }}
                              >
                                💾 저장
                              </button>
                              <button
                                type="button"
                                onClick={cancelEdit}
                                disabled={pending}
                                className="flex-1 py-1.5 rounded-md bg-white/70 hover:bg-white text-amber-900 text-sm font-bold border border-amber-900/20 disabled:opacity-50"
                                style={{ fontFamily: "'Gaegu',cursive" }}
                              >
                                취소
                              </button>
                            </div>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>

          <div
            className="mt-2 h-3 rounded-b-md shadow-inner"
            style={{
              background:
                "linear-gradient(180deg, #6b3d18 0%, #4a2810 100%)",
            }}
          />
        </div>
      </div>

      {/* 차단 모달 */}
      {blockTarget && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center px-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-5">
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
              {([
                ["1", "1일"],
                ["7", "7일"],
                ["30", "30일"],
                ["perm", "영구"],
              ] as const).map(([v, label]) => (
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
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-full bg-gray-900 text-white text-sm shadow-lg">
          {toast}
        </div>
      )}
    </main>
  );
}
