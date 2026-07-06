"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  SUGGESTION_CATEGORY_LABELS,
  SUGGESTION_REPLY_MAX,
  SUGGESTION_STATUS_LABELS,
  type GardenSuggestion,
  type SuggestionBlock,
  type SuggestionCategory,
  type SuggestionStatus,
  type SuggestionVisibility,
} from "@/lib/types";
import {
  blockStudentAction,
  deleteSuggestionAction,
  replyToSuggestionAction,
  unblockStudentAction,
  updateSuggestionStatusAction,
} from "./actions";

const CATEGORIES: SuggestionCategory[] = ["praise", "suggestion", "complaint", "etc"];
const STATUSES: SuggestionStatus[] = ["received", "reviewing", "done"];

const CATEGORY_COLORS: Record<SuggestionCategory, string> = {
  praise: "bg-rose-100 text-rose-700 border-rose-200",
  suggestion: "bg-sky-100 text-sky-700 border-sky-200",
  complaint: "bg-amber-100 text-amber-800 border-amber-200",
  // 학생측 포스트잇(emerald)과 색 통일.
  etc: "bg-emerald-100 text-emerald-700 border-emerald-200",
};

const VISIBILITY_LABELS: Record<SuggestionVisibility, string> = {
  public: "공개",
  private: "🔒 비밀",
};

const VISIBILITY_COLORS: Record<SuggestionVisibility, string> = {
  public: "bg-sky-50 text-sky-600 border-sky-200",
  private: "bg-rose-50 text-rose-700 border-rose-200",
};

const STATUS_COLORS: Record<SuggestionStatus, string> = {
  received: "bg-gray-100 text-gray-600",
  reviewing: "bg-amber-100 text-amber-700",
  done: "bg-emerald-100 text-emerald-700",
};

const BLOCK_DURATIONS: Array<{ label: string; days: number | null }> = [
  { label: "7일", days: 7 },
  { label: "30일", days: 30 },
  { label: "영구", days: null },
];

function formatDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${yyyy}.${mm}.${dd} ${hh}:${mi}`;
}

type StudentMini = { name: string; class_name: string | null };

type Props = {
  initialSuggestions: GardenSuggestion[];
  initialBlocks: SuggestionBlock[];
  studentMap: Record<string, StudentMini>;
};

export function SuggestAdminClient({
  initialSuggestions,
  initialBlocks,
  studentMap,
}: Props) {
  const router = useRouter();
  const [categoryFilter, setCategoryFilter] = useState<SuggestionCategory | "all">("all");
  const [statusFilter, setStatusFilter] = useState<SuggestionStatus | "all">("all");
  const [visibilityFilter, setVisibilityFilter] = useState<SuggestionVisibility | "all">("all");
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // 답변 작성 중인 상태 (suggestion id → draft text / status)
  const [drafts, setDrafts] = useState<Record<string, { reply: string; status: SuggestionStatus }>>({});

  // 차단 모달
  const [blockTarget, setBlockTarget] = useState<{
    studentId: string;
    studentName: string;
  } | null>(null);
  const [blockReason, setBlockReason] = useState("");
  const [blockDays, setBlockDays] = useState<number | null>(7);

  const filtered = useMemo(() => {
    const kw = search.trim().toLowerCase();
    return initialSuggestions.filter((s) => {
      if (categoryFilter !== "all" && s.category !== categoryFilter) return false;
      if (statusFilter !== "all" && s.status !== statusFilter) return false;
      if (visibilityFilter !== "all" && (s.visibility ?? "public") !== visibilityFilter)
        return false;
      if (kw) {
        const hay = `${s.title} ${s.body} ${s.student_name_snapshot}`.toLowerCase();
        if (!hay.includes(kw)) return false;
      }
      return true;
    });
  }, [initialSuggestions, categoryFilter, statusFilter, visibilityFilter, search]);

  const nowIso = new Date().toISOString();
  const activeBlocks = useMemo(
    () =>
      initialBlocks.filter(
        (b) => !b.blocked_until || b.blocked_until > nowIso,
      ),
    [initialBlocks, nowIso],
  );

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2000);
  };

  const onReply = (s: GardenSuggestion) => {
    setError(null);
    const draft = drafts[s.id] ?? {
      reply: s.reply ?? "",
      status: s.status === "received" ? "done" : s.status,
    };
    if (!draft.reply.trim()) {
      setError("답변을 입력해주세요.");
      return;
    }
    startTransition(async () => {
      const res = await replyToSuggestionAction({
        id: s.id,
        reply: draft.reply,
        status: draft.status,
      });
      if (!res.ok) {
        setError(res.message);
        return;
      }
      showToast("답변 저장 완료");
      setDrafts((prev) => {
        const { [s.id]: _drop, ...rest } = prev;
        return rest;
      });
      router.refresh();
    });
  };

  const onStatusChange = (s: GardenSuggestion, status: SuggestionStatus) => {
    setError(null);
    startTransition(async () => {
      const res = await updateSuggestionStatusAction({ id: s.id, status });
      if (!res.ok) {
        setError(res.message);
        return;
      }
      showToast("상태 변경 완료");
      router.refresh();
    });
  };

  const onDelete = (s: GardenSuggestion) => {
    if (!confirm(`"${s.title}" 글을 삭제할까요?`)) return;
    setError(null);
    startTransition(async () => {
      const res = await deleteSuggestionAction(s.id);
      if (!res.ok) {
        setError(res.message);
        return;
      }
      showToast("삭제 완료");
      router.refresh();
    });
  };

  const openBlockModal = (s: GardenSuggestion) => {
    if (!s.student_id) return;
    const sm = studentMap[s.student_id];
    setBlockTarget({
      studentId: s.student_id,
      studentName: sm?.name ?? s.student_name_snapshot,
    });
    setBlockReason("");
    setBlockDays(7);
  };

  const submitBlock = () => {
    if (!blockTarget) return;
    setError(null);
    startTransition(async () => {
      const res = await blockStudentAction({
        studentId: blockTarget.studentId,
        reason: blockReason || null,
        durationDays: blockDays,
      });
      if (!res.ok) {
        setError(res.message);
        return;
      }
      showToast("학생을 제한했어요");
      setBlockTarget(null);
      router.refresh();
    });
  };

  const onUnblock = (studentId: string) => {
    if (!confirm("이 학생의 제한을 해제할까요?")) return;
    setError(null);
    startTransition(async () => {
      const res = await unblockStudentAction(studentId);
      if (!res.ok) {
        setError(res.message);
        return;
      }
      showToast("제한 해제 완료");
      router.refresh();
    });
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
      {/* 필터 */}
      <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-3">
        <div>
          <div className="text-xs font-medium text-gray-500 mb-2">카테고리</div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setCategoryFilter("all")}
              className={`px-3 py-1 rounded-full text-sm border ${
                categoryFilter === "all"
                  ? "bg-gray-900 text-white border-gray-900"
                  : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
              }`}
            >
              전체
            </button>
            {CATEGORIES.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCategoryFilter(c)}
                className={`px-3 py-1 rounded-full text-sm border ${
                  categoryFilter === c
                    ? `${CATEGORY_COLORS[c]} ring-2 ring-offset-1 ring-current font-semibold`
                    : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
                }`}
              >
                {SUGGESTION_CATEGORY_LABELS[c]}
              </button>
            ))}
          </div>
        </div>
        <div>
          <div className="text-xs font-medium text-gray-500 mb-2">상태</div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setStatusFilter("all")}
              className={`px-3 py-1 rounded-full text-sm border ${
                statusFilter === "all"
                  ? "bg-gray-900 text-white border-gray-900"
                  : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
              }`}
            >
              전체
            </button>
            {STATUSES.map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setStatusFilter(st)}
                className={`px-3 py-1 rounded-full text-sm border ${
                  statusFilter === st
                    ? `${STATUS_COLORS[st]} ring-2 ring-offset-1 ring-current font-semibold`
                    : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
                }`}
              >
                {SUGGESTION_STATUS_LABELS[st]}
              </button>
            ))}
          </div>
        </div>
        <div>
          <div className="text-xs font-medium text-gray-500 mb-2">공개 범위</div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setVisibilityFilter("all")}
              className={`px-3 py-1 rounded-full text-sm border ${
                visibilityFilter === "all"
                  ? "bg-gray-900 text-white border-gray-900"
                  : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
              }`}
            >
              전체
            </button>
            {(["public", "private"] as SuggestionVisibility[]).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setVisibilityFilter(v)}
                className={`px-3 py-1 rounded-full text-sm border ${
                  visibilityFilter === v
                    ? `${VISIBILITY_COLORS[v]} ring-2 ring-offset-1 ring-current font-semibold`
                    : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
                }`}
              >
                {VISIBILITY_LABELS[v]}
              </button>
            ))}
          </div>
        </div>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="제목/본문/이름으로 검색"
          className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-amber-200"
        />
      </section>

      {/* 제한된 학생 목록 */}
      {activeBlocks.length > 0 && (
        <section className="bg-rose-50 rounded-2xl border border-rose-100 p-4">
          <h2 className="text-sm font-semibold text-rose-800 mb-3">
            제한된 학생 ({activeBlocks.length})
          </h2>
          <ul className="space-y-2">
            {activeBlocks.map((b) => {
              const sm = studentMap[b.student_id];
              return (
                <li
                  key={b.id}
                  className="flex flex-wrap items-center gap-3 bg-white rounded-lg border border-rose-100 px-3 py-2"
                >
                  <span className="font-medium text-gray-900">
                    {sm?.name ?? "(알 수 없음)"}
                  </span>
                  {sm?.class_name && (
                    <span className="text-xs text-gray-500">{sm.class_name}</span>
                  )}
                  <span className="text-xs text-gray-500">
                    {b.blocked_until
                      ? `해제: ${formatDate(b.blocked_until)}`
                      : "영구 제한"}
                  </span>
                  {b.reason && (
                    <span className="text-xs text-rose-700 break-all">
                      사유: {b.reason}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => onUnblock(b.student_id)}
                    disabled={pending}
                    className="ml-auto text-xs px-2 py-1 rounded-md border border-rose-200 text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                  >
                    해제
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {error && (
        <div className="text-sm text-rose-600 bg-rose-50 border border-rose-100 rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      {/* 건의 카드 리스트 */}
      <section className="space-y-3">
        <div className="text-sm text-gray-500 px-1">
          총 {filtered.length}건
        </div>
        {filtered.length === 0 ? (
          <div className="rounded-2xl bg-white border border-dashed border-gray-200 p-8 text-center text-sm text-gray-500">
            조건에 맞는 건의가 없어요.
          </div>
        ) : (
          filtered.map((s) => {
            const draft = drafts[s.id] ?? {
              reply: s.reply ?? "",
              status: s.status === "received" ? "done" : s.status,
            };
            const sm = s.student_id ? studentMap[s.student_id] : undefined;
            return (
              <article
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
                  <span
                    className={`px-2 py-0.5 rounded-full text-xs border ${VISIBILITY_COLORS[s.visibility ?? "public"]}`}
                  >
                    {VISIBILITY_LABELS[s.visibility ?? "public"]}
                  </span>
                  <span className="text-sm text-gray-700">
                    {s.is_anonymous ? (
                      <>
                        <span className="px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-500 mr-1">
                          익명
                        </span>
                        <span className="text-xs text-gray-400">
                          (관리자만 확인: {s.student_name_snapshot}
                          {sm?.class_name ? ` · ${sm.class_name}` : ""})
                        </span>
                      </>
                    ) : (
                      <>
                        <span className="font-medium">
                          {sm?.name ?? s.student_name_snapshot}
                        </span>
                        {sm?.class_name && (
                          <span className="text-xs text-gray-500 ml-1">
                            {sm.class_name}
                          </span>
                        )}
                      </>
                    )}
                  </span>
                  <span className="ml-auto text-xs text-gray-400">
                    {formatDate(s.created_at)}
                  </span>
                </div>
                <h3 className="font-semibold text-gray-900 break-words mb-1">
                  {s.title}
                </h3>
                <p className="text-sm text-gray-700 whitespace-pre-wrap break-words mb-3">
                  {s.body}
                </p>

                {/* 답변 영역 */}
                <div className="rounded-xl bg-gray-50 border border-gray-100 p-3 space-y-2">
                  <textarea
                    value={draft.reply}
                    maxLength={SUGGESTION_REPLY_MAX}
                    onChange={(e) =>
                      setDrafts((prev) => ({
                        ...prev,
                        [s.id]: { ...draft, reply: e.target.value },
                      }))
                    }
                    placeholder="학생에게 보일 답변을 적어주세요"
                    rows={3}
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-200 resize-none"
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="text-xs text-gray-500">저장 시 상태</label>
                    <select
                      value={draft.status}
                      onChange={(e) =>
                        setDrafts((prev) => ({
                          ...prev,
                          [s.id]: {
                            ...draft,
                            status: e.target.value as SuggestionStatus,
                          },
                        }))
                      }
                      className="text-sm rounded-md border border-gray-200 bg-white px-2 py-1"
                    >
                      {STATUSES.map((st) => (
                        <option key={st} value={st}>
                          {SUGGESTION_STATUS_LABELS[st]}
                        </option>
                      ))}
                    </select>
                    <span className="ml-auto text-xs text-gray-400">
                      {draft.reply.length}/{SUGGESTION_REPLY_MAX}
                      {s.reply && s.replied_at && (
                        <span className="ml-2">
                          (마지막 답변: {formatDate(s.replied_at)})
                        </span>
                      )}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => onReply(s)}
                      disabled={pending}
                      className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium disabled:bg-gray-300"
                    >
                      답변 저장
                    </button>
                    {STATUSES.filter((st) => st !== s.status).map((st) => (
                      <button
                        key={st}
                        type="button"
                        onClick={() => onStatusChange(s, st)}
                        disabled={pending}
                        className="px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                      >
                        {SUGGESTION_STATUS_LABELS[st]}으로 변경
                      </button>
                    ))}
                    {s.student_id && (
                      <button
                        type="button"
                        onClick={() => openBlockModal(s)}
                        disabled={pending}
                        className="px-3 py-1.5 rounded-lg border border-rose-200 bg-white text-sm text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                      >
                        이 학생 제한
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => onDelete(s)}
                      disabled={pending}
                      className="ml-auto px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-sm text-gray-500 hover:text-rose-700 hover:border-rose-200 disabled:opacity-50"
                    >
                      삭제
                    </button>
                  </div>
                </div>
              </article>
            );
          })
        )}
      </section>

      {/* 차단 모달 */}
      {blockTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-5">
            <h3 className="text-lg font-semibold text-gray-900 mb-1">
              {blockTarget.studentName} 학생 제한
            </h3>
            <p className="text-xs text-gray-500 mb-4">
              제한 기간 동안 이 학생은 건의함에 글을 쓸 수 없어요.
            </p>
            <div className="mb-3">
              <div className="text-xs font-medium text-gray-600 mb-1">기간</div>
              <div className="flex gap-2">
                {BLOCK_DURATIONS.map((d) => (
                  <button
                    key={d.label}
                    type="button"
                    onClick={() => setBlockDays(d.days)}
                    className={`flex-1 px-3 py-2 rounded-lg border text-sm ${
                      blockDays === d.days
                        ? "bg-rose-500 text-white border-rose-500"
                        : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50"
                    }`}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="mb-4">
              <label className="block text-xs font-medium text-gray-600 mb-1">
                사유 (선택)
              </label>
              <input
                type="text"
                value={blockReason}
                onChange={(e) => setBlockReason(e.target.value)}
                maxLength={100}
                placeholder="예: 반복적인 욕설"
                className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-rose-200"
              />
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setBlockTarget(null)}
                className="flex-1 px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm text-gray-700 hover:bg-gray-50"
              >
                취소
              </button>
              <button
                type="button"
                onClick={submitBlock}
                disabled={pending}
                className="flex-1 px-3 py-2 rounded-lg bg-rose-500 hover:bg-rose-600 text-white text-sm font-medium disabled:bg-gray-300"
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
    </div>
  );
}
