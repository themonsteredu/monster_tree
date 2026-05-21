"use client";

// 학생 건의함 — 칠판에 포스트잇을 붙이는 비주얼.
// 폼은 큰 노란 포스트잇, 과거 건의는 카테고리별 색상 포스트잇으로 칠판에 핀처럼 붙는다.
// previewMode/adminLink prop: 관리자 미리보기에서 학생 화면을 그대로 보여줄 때 사용.

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

// 카테고리별 포스트잇 색 (배경/테두리/텍스트). 손글씨 느낌 위해 부드러운 톤.
const POSTIT_COLORS: Record<SuggestionCategory, { bg: string; ring: string; text: string }> = {
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

// 카드마다 살짝 다른 기울기 — 인덱스를 받아 결정. 손으로 붙인 느낌.
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
  mySuggestions: GardenSuggestion[];
  activeBlock: SuggestionBlock | null;
  // 관리자 미리보기 모드 (제출 비활성화 + 안내 배너).
  previewMode?: boolean;
  // 미리보기에서 관리 화면으로 점프하는 floating 링크.
  adminLink?: string;
};

export function SuggestClient({
  studentName,
  mySuggestions,
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

  const disabled = !!activeBlock || pending || previewMode;

  const onSubmit = () => {
    if (previewMode) {
      setToast("미리보기 모드에서는 제출되지 않아요.");
      setTimeout(() => setToast(null), 2200);
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
      setToast("건의가 접수되었어요! 🎉");
      setTimeout(() => setToast(null), 2500);
      router.refresh();
    });
  };

  return (
    <main
      className="min-h-screen pb-24 relative"
      style={{
        // 교실 바닥 느낌의 따뜻한 나무 그라데이션
        background:
          "radial-gradient(circle at 20% 0%, #f5deb3 0%, #d8a574 35%, #a06a3a 100%)",
      }}
    >
      {/* 헤더 — 학생 화면. 미리보기에서는 마을로 돌아가는 링크 그대로 노출 */}
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

      {/* 관리자 미리보기에서만 노출되는 점프 버튼 */}
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
        {/* 칠판 — 나무 프레임 + 진녹색 분필판 */}
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
            {/* 분필 자국 노이즈 (살짝) */}
            <div
              className="pointer-events-none absolute inset-0 opacity-[0.08]"
              style={{
                backgroundImage:
                  "repeating-linear-gradient(45deg, rgba(255,255,255,0.6) 0 1px, transparent 1px 3px)",
              }}
            />

            {/* 분필 타이틀 */}
            <div className="relative text-center mb-6">
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
                style={{
                  fontFamily: "'Gaegu','Nanum Pen Script',cursive",
                }}
              >
                {studentName}님, 학원에 하고 싶은 말이 있나요?
              </div>
            </div>

            {/* 제한 안내 (있을 때만) */}
            {activeBlock && (
              <div
                className={`relative mx-auto max-w-lg mb-6 rounded-lg p-4 shadow-lg bg-rose-200 ${tiltFor(2)}`}
              >
                {/* 테이프 */}
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

            {/* 입력 포스트잇 — 노란색 큰 포스트잇 */}
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
                {/* 마스킹 테이프 */}
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 w-24 h-5 bg-amber-100/90 -rotate-1 shadow-md" />

                {/* 카테고리 */}
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

                {/* 제목 */}
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

                {/* 본문 — 노트선 깔린 textarea */}
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

                {/* 익명 */}
                <label className="flex items-center gap-2 text-sm text-amber-900 mb-4 select-none">
                  <input
                    type="checkbox"
                    checked={isAnonymous}
                    disabled={disabled}
                    onChange={(e) => setIsAnonymous(e.target.checked)}
                    className="rounded border-amber-700/40 disabled:opacity-50"
                  />
                  <span style={{ fontFamily: "'Gaegu',cursive" }}>
                    익명으로 제출하기
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

            {/* 과거 건의 포스트잇들 — 칠판에 핀처럼 */}
            <div className="relative mt-10">
              <div
                className="text-white/90 text-base sm:text-lg font-bold text-center mb-4"
                style={{
                  fontFamily: "'Gaegu','Nanum Pen Script',cursive",
                  textShadow: "0 0 2px rgba(255,255,255,0.3)",
                }}
              >
                — 내가 붙인 쪽지{" "}
                {mySuggestions.length > 0 && `(${mySuggestions.length})`} —
              </div>

              {mySuggestions.length === 0 ? (
                <div
                  className="text-center text-white/60 text-sm py-6"
                  style={{ fontFamily: "'Gaegu',cursive" }}
                >
                  아직 붙인 쪽지가 없어요.
                </div>
              ) : (
                <ul className="grid grid-cols-1 sm:grid-cols-2 gap-5 sm:gap-6">
                  {mySuggestions.map((s, i) => {
                    const col = POSTIT_COLORS[s.category];
                    return (
                      <li
                        key={s.id}
                        className={`relative ${tiltFor(i + 1)} ${col.bg} ${col.text} rounded-sm p-4 shadow-xl`}
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

                        <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
                          <span className="px-2 py-0.5 rounded-full text-[11px] bg-white/70 font-bold">
                            {SUGGESTION_CATEGORY_LABELS[s.category]}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${STATUS_COLORS[s.status]}`}
                          >
                            {SUGGESTION_STATUS_LABELS[s.status]}
                          </span>
                          {s.is_anonymous && (
                            <span className="px-2 py-0.5 rounded-full text-[11px] bg-white/70">
                              익명
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
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>

          {/* 분필 트레이 */}
          <div
            className="mt-2 h-3 rounded-b-md shadow-inner"
            style={{
              background:
                "linear-gradient(180deg, #6b3d18 0%, #4a2810 100%)",
            }}
          />
        </div>
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
