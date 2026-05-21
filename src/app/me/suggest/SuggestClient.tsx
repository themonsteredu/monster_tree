"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  SUGGESTION_BODY_MAX,
  SUGGESTION_CATEGORY_LABELS,
  SUGGESTION_STATUS_LABELS,
  SUGGESTION_TITLE_MAX,
  type GardenSuggestion,
  type SuggestionBlock,
  type SuggestionCategory,
  type SuggestionStatus,
} from "@/lib/types";
import { submitSuggestionAction } from "./actions";

const CATEGORIES: SuggestionCategory[] = ["praise", "suggestion", "complaint", "etc"];

const CATEGORY_COLORS: Record<SuggestionCategory, string> = {
  praise: "bg-rose-100 text-rose-700 border-rose-200",
  suggestion: "bg-sky-100 text-sky-700 border-sky-200",
  complaint: "bg-amber-100 text-amber-800 border-amber-200",
  etc: "bg-gray-100 text-gray-700 border-gray-200",
};

const STATUS_COLORS: Record<SuggestionStatus, string> = {
  received: "bg-gray-100 text-gray-600",
  reviewing: "bg-amber-100 text-amber-700",
  done: "bg-emerald-100 text-emerald-700",
};

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
  mySuggestions: GardenSuggestion[];
  activeBlock: SuggestionBlock | null;
};

export function SuggestClient({ studentName, mySuggestions, activeBlock }: Props) {
  const router = useRouter();
  const [category, setCategory] = useState<SuggestionCategory>("suggestion");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const disabled = !!activeBlock || pending;

  const onSubmit = () => {
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
      setToast("건의가 접수되었어요! 🎉");
      setTimeout(() => setToast(null), 2500);
      router.refresh();
    });
  };

  return (
    <main className="min-h-screen bg-gradient-to-b from-amber-50 via-orange-50 to-rose-50 pb-24">
      <header className="sticky top-0 z-30 bg-white/80 backdrop-blur border-b border-gray-100">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link
            href="/me/village"
            className="shrink-0 text-sm text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-lg px-3 py-1.5 transition"
          >
            ← 마을
          </Link>
          <h1 className="text-lg font-semibold text-gray-900">건의 우체통 📮</h1>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        {activeBlock && (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
            <div className="font-semibold mb-1">건의함 사용이 제한되었어요</div>
            {activeBlock.reason && (
              <div className="mb-1">
                <span className="text-rose-600">사유:</span> {activeBlock.reason}
              </div>
            )}
            <div className="text-rose-600">
              {activeBlock.blocked_until
                ? `해제 예정: ${formatDate(activeBlock.blocked_until)}`
                : "영구 제한"}
            </div>
          </div>
        )}

        {/* 입력 폼 */}
        <section className="rounded-2xl bg-white/90 border border-gray-100 shadow-sm p-5">
          <div className="text-sm text-gray-500 mb-3">
            {studentName}님, 학원에 하고 싶은 말이 있나요?
          </div>

          {/* 카테고리 */}
          <div className="mb-4">
            <div className="text-xs font-medium text-gray-600 mb-2">카테고리</div>
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.map((c) => {
                const active = category === c;
                return (
                  <button
                    key={c}
                    type="button"
                    disabled={disabled}
                    onClick={() => setCategory(c)}
                    className={`px-3 py-1.5 rounded-full text-sm border transition ${
                      active
                        ? `${CATEGORY_COLORS[c]} font-semibold ring-2 ring-offset-1 ring-current`
                        : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                  >
                    {SUGGESTION_CATEGORY_LABELS[c]}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 제목 */}
          <div className="mb-3">
            <label className="block text-xs font-medium text-gray-600 mb-1">제목</label>
            <input
              type="text"
              value={title}
              maxLength={SUGGESTION_TITLE_MAX}
              disabled={disabled}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="짧게 한 줄로 적어주세요"
              className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-amber-200 disabled:bg-gray-50"
            />
            <div className="text-right text-xs text-gray-400 mt-1">
              {title.length}/{SUGGESTION_TITLE_MAX}
            </div>
          </div>

          {/* 본문 */}
          <div className="mb-3">
            <label className="block text-xs font-medium text-gray-600 mb-1">내용</label>
            <textarea
              value={body}
              maxLength={SUGGESTION_BODY_MAX}
              disabled={disabled}
              onChange={(e) => setBody(e.target.value)}
              placeholder="자세한 내용을 적어주세요"
              rows={6}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-amber-200 disabled:bg-gray-50 resize-none"
            />
            <div className="text-right text-xs text-gray-400 mt-1">
              {body.length}/{SUGGESTION_BODY_MAX}
            </div>
          </div>

          {/* 익명 토글 */}
          <label className="flex items-center gap-2 text-sm text-gray-700 mb-4 select-none">
            <input
              type="checkbox"
              checked={isAnonymous}
              disabled={disabled}
              onChange={(e) => setIsAnonymous(e.target.checked)}
              className="rounded border-gray-300 disabled:opacity-50"
            />
            <span>익명으로 제출하기</span>
            <span className="text-xs text-gray-400">
              (관리자에게 이름이 표시되지 않아요)
            </span>
          </label>

          {error && (
            <div className="mb-3 text-sm text-rose-600 bg-rose-50 border border-rose-100 rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          <button
            type="button"
            onClick={onSubmit}
            disabled={disabled}
            className="w-full py-3 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-semibold transition disabled:bg-gray-300 disabled:cursor-not-allowed"
          >
            {pending ? "제출 중..." : "건의 제출하기"}
          </button>
        </section>

        {/* 내 건의 목록 */}
        <section>
          <h2 className="text-sm font-semibold text-gray-700 mb-3 px-1">
            내가 쓴 건의 {mySuggestions.length > 0 && `(${mySuggestions.length})`}
          </h2>
          {mySuggestions.length === 0 ? (
            <div className="rounded-2xl bg-white/70 border border-dashed border-gray-200 p-6 text-center text-sm text-gray-500">
              아직 작성한 건의가 없어요.
            </div>
          ) : (
            <ul className="space-y-3">
              {mySuggestions.map((s) => (
                <li
                  key={s.id}
                  className="rounded-2xl bg-white border border-gray-100 shadow-sm p-4"
                >
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs border ${CATEGORY_COLORS[s.category]}`}
                    >
                      {SUGGESTION_CATEGORY_LABELS[s.category]}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs ${STATUS_COLORS[s.status]}`}
                    >
                      {SUGGESTION_STATUS_LABELS[s.status]}
                    </span>
                    {s.is_anonymous && (
                      <span className="px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-500">
                        익명
                      </span>
                    )}
                    <span className="ml-auto text-xs text-gray-400">
                      {formatDate(s.created_at)}
                    </span>
                  </div>
                  <div className="font-semibold text-gray-900 mb-1 break-words">
                    {s.title}
                  </div>
                  <div className="text-sm text-gray-700 whitespace-pre-wrap break-words">
                    {s.body}
                  </div>
                  {s.reply && (
                    <div className="mt-3 rounded-lg bg-amber-50 border border-amber-100 p-3">
                      <div className="text-xs font-semibold text-amber-700 mb-1">
                        선생님 답변{" "}
                        {s.replied_at && (
                          <span className="font-normal text-amber-500">
                            · {formatDate(s.replied_at)}
                          </span>
                        )}
                      </div>
                      <div className="text-sm text-amber-900 whitespace-pre-wrap break-words">
                        {s.reply}
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* 토스트 */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-full bg-gray-900 text-white text-sm shadow-lg">
          {toast}
        </div>
      )}
    </main>
  );
}
