"use client";

// 학생 건의함 — 칠판에 포스트잇을 붙이는 비주얼. 같은 지점 학생들이 서로 글을 공유.
// 본인 글에는 수정/삭제 가능. 익명 글은 다른 학생에게 이름 마스킹.
// previewMode/adminLink prop: 관리자 미리보기에서 학생 화면을 보여줄 때 사용.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  SUGGESTION_BODY_MAX,
  SUGGESTION_CATEGORY_LABELS,
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

// 서버에서 가공해서 내려준 view 모델. student_id 는 비공개로 빼고 is_mine 으로만 표현.
export type SuggestionView = {
  id: string;
  is_mine: boolean;
  is_anonymous: boolean;
  // 익명 + 남의 글이면 빈 문자열로 마스킹.
  student_name_snapshot: string;
  category: SuggestionCategory;
  title: string;
  body: string;
  status: SuggestionStatus;
  reply: string | null;
  replied_at: string | null;
  created_at: string;
  updated_at: string;
};

const CATEGORIES: SuggestionCategory[] = ["praise", "suggestion", "complaint", "etc"];

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
  adminLink?: string;
};

export function SuggestClient({
  studentName,
  suggestions,
  activeBlock,
  previewMode = false,
  adminLink,
}: Props) {
  const router = useRouter();
  const [category, setCategory] = useState<SuggestionCategory>("suggestion");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // 인라인 수정 상태 — id 기준 단일 편집.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editCategory, setEditCategory] = useState<SuggestionCategory>("suggestion");
  const [editTitle, setEditTitle] = useState("");
  const [editBody, setEditBody] = useState("");
  const [editAnon, setEditAnon] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const disabled = !!activeBlock || pending || previewMode;
  const disabledEdit = !!activeBlock || pending || previewMode;

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2400);
  };

  const onSubmit = () => {
    if (previewMode) {
      showToast("미리보기 모드에서는 제출되지 않아요.");
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
    if (previewMode) {
      showToast("미리보기 모드에서는 수정되지 않아요.");
      return;
    }
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
    if (previewMode) {
      showToast("미리보기 모드에서는 삭제되지 않아요.");
      return;
    }
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
            href="/me/village"
            className="shrink-0 text-sm text-amber-900 hover:text-amber-700 hover:bg-amber-100/70 rounded-lg px-3 py-1.5 transition"
          >
            ← 마을
          </Link>
          <h1 className="text-lg font-semibold text-amber-900">건의 우체통 📮</h1>
          {previewMode && (
            <span className="ml-auto px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-xs font-medium">
              미리보기
            </span>
          )}
        </div>
      </header>

      {previewMode && adminLink && (
        <div className="fixed bottom-6 right-6 z-40">
          <Link
            href={adminLink}
            className="inline-flex items-center gap-2 px-4 py-3 rounded-full bg-gray-900 text-white shadow-2xl hover:bg-gray-800 transition text-sm font-semibold"
          >
            <span>관리 페이지로</span>
            <span aria-hidden>→</span>
          </Link>
        </div>
      )}

      <div className="max-w-3xl mx-auto px-3 sm:px-6 py-6">
        {/* 칠판 */}
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

            {/* 분필 타이틀 */}
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

            {/* 칠판 안내문 — 욕설/장난 금지 */}
            <div
              className="relative mx-auto max-w-xl text-center mb-6 px-4 py-2 rounded-lg border border-white/25 bg-white/5"
              style={{
                fontFamily: "'Gaegu','Nanum Pen Script',cursive",
              }}
            >
              <div className="text-white/90 text-base sm:text-lg leading-snug">
                🐣 친구들도 다 같이 보는 공간이에요!
              </div>
              <div className="text-white/75 text-sm sm:text-base leading-snug mt-0.5">
                욕설이나 장난치는 곳이 아니에요. 마음을 담아 적어주세요 💌
              </div>
            </div>

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

            {/* 입력 포스트잇 */}
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
                  {previewMode
                    ? "미리보기 모드"
                    : pending
                      ? "붙이는 중..."
                      : "📌 칠판에 붙이기"}
                </button>
              </div>
            </div>

            {/* 칠판에 붙은 모든 쪽지 (본인 + 다른 친구들) */}
            <div className="relative mt-10">
              <div
                className="text-white/90 text-base sm:text-lg font-bold text-center mb-4"
                style={{
                  fontFamily: "'Gaegu','Nanum Pen Script',cursive",
                  textShadow: "0 0 2px rgba(255,255,255,0.3)",
                }}
              >
                — 우리 학원 친구들의 쪽지{" "}
                {suggestions.length > 0 && `(${suggestions.length})`} —
              </div>

              {suggestions.length === 0 ? (
                <div
                  className="text-center text-white/60 text-sm py-6"
                  style={{ fontFamily: "'Gaegu',cursive" }}
                >
                  아직 붙인 쪽지가 없어요. 첫 번째로 붙여보세요!
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
                    const authorLabel = s.is_anonymous
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
                        {/* 압정 */}
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

                            {/* 본인 쪽지에만 수정/삭제 버튼 노출 */}
                            {s.is_mine && (
                              <div className="mt-3 flex gap-2">
                                <button
                                  type="button"
                                  onClick={() => startEdit(s)}
                                  disabled={disabledEdit}
                                  className="flex-1 py-1.5 rounded-md bg-white/80 hover:bg-white text-amber-900 text-sm font-bold border border-amber-900/20 shadow-sm disabled:opacity-50"
                                  style={{ fontFamily: "'Gaegu',cursive" }}
                                >
                                  ✏️ 수정
                                </button>
                                <button
                                  type="button"
                                  onClick={() => onDelete(s.id)}
                                  disabled={disabledEdit}
                                  className="flex-1 py-1.5 rounded-md bg-rose-200/90 hover:bg-rose-300 text-rose-900 text-sm font-bold border border-rose-700/30 shadow-sm disabled:opacity-50"
                                  style={{ fontFamily: "'Gaegu',cursive" }}
                                >
                                  🗑️ 삭제
                                </button>
                              </div>
                            )}
                          </>
                        )}

                        {/* 수정 폼 */}
                        {isEditing && (
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

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-full bg-gray-900 text-white text-sm shadow-lg">
          {toast}
        </div>
      )}
    </main>
  );
}
