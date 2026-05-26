"use client";

// 퀴즈 관리 UI:
// - 상단 통계 + [+ 문제 추가] / [🤖 AI 문제 생성] CTA
// - 카테고리 탭(전체/수학/상식/넌센스) + 필터(학년/검수/난이도/활성)
// - 문제 리스트 테이블 → 행 클릭 시 상세/수정 모달
// - AI 생성 모달: 카테고리/학년(수학만)/난이도/개수

import { useEffect, useMemo, useState, useTransition } from "react";
import type {
  QuizCategory,
  QuizDifficulty,
  QuizGrade,
  QuizMathGrade,
  QuizQuestion,
} from "@/lib/types";
import {
  QUIZ_CATEGORY_ICON,
  QUIZ_CATEGORY_LABEL,
  QUIZ_DIFFICULTY_LABEL,
  QUIZ_GRADE_LABEL,
  QUIZ_MATH_GRADES,
} from "@/lib/types";
import {
  bulkImportQuestionsAction,
  createQuestionAction,
  deleteQuestionAction,
  generateAIQuestionsAction,
  updateQuestionAction,
} from "./actions";

type CategoryTab = "all" | QuizCategory;
type ApprovalFilter = "all" | "approved" | "pending";
type ActiveFilter = "all" | "active" | "inactive";
type DifficultyFilter = "all" | QuizDifficulty;
type GradeFilter = "all" | QuizGrade;

const CATEGORY_TABS: { value: CategoryTab; label: string }[] = [
  { value: "all", label: "전체" },
  { value: "math", label: `${QUIZ_CATEGORY_ICON.math} 수학` },
  { value: "general", label: `${QUIZ_CATEGORY_ICON.general} 상식` },
  { value: "nonsense", label: `${QUIZ_CATEGORY_ICON.nonsense} 넌센스` },
];

const DIFFICULTY_OPTIONS: { value: QuizDifficulty; label: string }[] = [
  { value: "easy", label: "쉬움" },
  { value: "medium", label: "보통" },
  { value: "hard", label: "어려움" },
];

export function QuizCenterAdminClient({
  initialQuestions,
}: {
  initialQuestions: QuizQuestion[];
}) {
  const [questions, setQuestions] = useState<QuizQuestion[]>(initialQuestions);
  const [tab, setTab] = useState<CategoryTab>("all");
  const [gradeFilter, setGradeFilter] = useState<GradeFilter>("all");
  const [approvalFilter, setApprovalFilter] = useState<ApprovalFilter>("all");
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>("all");
  const [difficultyFilter, setDifficultyFilter] = useState<DifficultyFilter>("all");

  const [editing, setEditing] = useState<QuizQuestion | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showAI, setShowAI] = useState(false);
  const [showBulk, setShowBulk] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // 토스트 자동 사라짐.
  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 3500);
    return () => window.clearTimeout(t);
  }, [toast]);

  const stats = useMemo(() => {
    const total = questions.length;
    const approved = questions.filter((q) => q.is_approved).length;
    const pending = total - approved;
    const inactive = questions.filter((q) => !q.is_active).length;
    const byCat: Record<QuizCategory, number> = { math: 0, general: 0, nonsense: 0 };
    for (const q of questions) byCat[q.category]++;
    return { total, approved, pending, inactive, byCat };
  }, [questions]);

  const filtered = useMemo(() => {
    return questions.filter((q) => {
      if (tab !== "all" && q.category !== tab) return false;
      if (gradeFilter !== "all" && q.grade !== gradeFilter) return false;
      if (approvalFilter === "approved" && !q.is_approved) return false;
      if (approvalFilter === "pending" && q.is_approved) return false;
      if (activeFilter === "active" && !q.is_active) return false;
      if (activeFilter === "inactive" && q.is_active) return false;
      if (difficultyFilter !== "all" && q.difficulty !== difficultyFilter) return false;
      return true;
    });
  }, [questions, tab, gradeFilter, approvalFilter, activeFilter, difficultyFilter]);

  const handleUpdate = (next: QuizQuestion) => {
    setQuestions((prev) => prev.map((q) => (q.id === next.id ? next : q)));
  };

  const handleRemove = (id: string) => {
    setQuestions((prev) => prev.filter((q) => q.id !== id));
  };

  const handleCreated = (newQuestions: QuizQuestion[]) => {
    setQuestions((prev) => [...newQuestions, ...prev]);
  };

  return (
    <div className="max-w-5xl mx-auto px-4 pt-4 space-y-4">
      {/* 통계 */}
      <section className="bg-white rounded-xl border border-gray-100 p-4">
        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2 text-sm">
          <div>
            <span className="text-gray-500">총</span>{" "}
            <span className="font-semibold text-gray-900">{stats.total}개</span>
          </div>
          <div>
            <span className="text-gray-500">검수완료</span>{" "}
            <span className="font-semibold text-emerald-600">{stats.approved}</span>
          </div>
          <div>
            <span className="text-gray-500">미검수</span>{" "}
            <span className="font-semibold text-amber-600">{stats.pending}</span>
          </div>
          <div>
            <span className="text-gray-500">비활성</span>{" "}
            <span className="font-semibold text-gray-400">{stats.inactive}</span>
          </div>
          <div className="ml-auto flex items-center gap-3 text-xs text-gray-500">
            <span>{QUIZ_CATEGORY_ICON.math} 수학 {stats.byCat.math}</span>
            <span>{QUIZ_CATEGORY_ICON.general} 상식 {stats.byCat.general}</span>
            <span>{QUIZ_CATEGORY_ICON.nonsense} 넌센스 {stats.byCat.nonsense}</span>
          </div>
        </div>
      </section>

      {/* CTA */}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          className="text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg px-4 py-2 transition"
        >
          + 문제 추가
        </button>
        <button
          type="button"
          onClick={() => setShowBulk(true)}
          className="text-sm font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg px-4 py-2 transition"
        >
          📋 엑셀/시트 업로드
        </button>
        <button
          type="button"
          onClick={() => setShowAI(true)}
          className="text-sm font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg px-4 py-2 transition"
        >
          🤖 AI 문제 생성
        </button>
      </div>

      {/* 탭 */}
      <div className="flex gap-1 border-b border-gray-200">
        {CATEGORY_TABS.map((t) => (
          <button
            key={t.value}
            type="button"
            onClick={() => setTab(t.value)}
            className={`text-sm px-4 py-2 -mb-px border-b-2 transition ${
              tab === t.value
                ? "border-emerald-600 text-emerald-700 font-semibold"
                : "border-transparent text-gray-500 hover:text-gray-900"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* 필터 */}
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <FilterSelect
          label="학년"
          value={gradeFilter}
          onChange={(v) => setGradeFilter(v as GradeFilter)}
          options={[
            { value: "all", label: "전체" },
            ...QUIZ_MATH_GRADES.map((g) => ({ value: g, label: QUIZ_GRADE_LABEL[g] })),
            { value: "all", label: "공통(all)" }, // 'all' 키 = 상식/넌센스
          ].filter(
            (o, i, arr) =>
              arr.findIndex((x) => x.value === o.value && x.label === o.label) === i,
          )}
        />
        <FilterSelect
          label="검수"
          value={approvalFilter}
          onChange={(v) => setApprovalFilter(v as ApprovalFilter)}
          options={[
            { value: "all", label: "전체" },
            { value: "approved", label: "검수완료" },
            { value: "pending", label: "미검수" },
          ]}
        />
        <FilterSelect
          label="활성"
          value={activeFilter}
          onChange={(v) => setActiveFilter(v as ActiveFilter)}
          options={[
            { value: "all", label: "전체" },
            { value: "active", label: "활성" },
            { value: "inactive", label: "비활성" },
          ]}
        />
        <FilterSelect
          label="난이도"
          value={difficultyFilter}
          onChange={(v) => setDifficultyFilter(v as DifficultyFilter)}
          options={[
            { value: "all", label: "전체" },
            ...DIFFICULTY_OPTIONS.map((d) => ({ value: d.value, label: d.label })),
          ]}
        />
        <div className="ml-auto text-xs text-gray-400">{filtered.length}개 표시</div>
      </div>

      {/* 테이블 */}
      <section className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-10 text-center text-sm text-gray-400">
            조건에 맞는 문제가 없어요.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500">
              <tr>
                <th className="text-left px-3 py-2 w-20">카테고리</th>
                <th className="text-left px-2 py-2 w-16">학년</th>
                <th className="text-left px-2 py-2">문제</th>
                <th className="text-left px-2 py-2 w-16">난이도</th>
                <th className="text-left px-2 py-2 w-24">상태</th>
                <th className="px-2 py-2 w-12"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((q) => (
                <tr
                  key={q.id}
                  onClick={() => setEditing(q)}
                  className="cursor-pointer hover:bg-gray-50 transition"
                >
                  <td className="px-3 py-2 whitespace-nowrap">
                    <span className="mr-1">{QUIZ_CATEGORY_ICON[q.category]}</span>
                    {QUIZ_CATEGORY_LABEL[q.category]}
                  </td>
                  <td className="px-2 py-2 text-gray-500 whitespace-nowrap">
                    {QUIZ_GRADE_LABEL[q.grade] ?? q.grade}
                  </td>
                  <td className="px-2 py-2 text-gray-900 truncate max-w-md">
                    {q.question.length > 70 ? `${q.question.slice(0, 70)}…` : q.question}
                  </td>
                  <td className="px-2 py-2 text-gray-500">
                    {QUIZ_DIFFICULTY_LABEL[q.difficulty]}
                  </td>
                  <td className="px-2 py-2">
                    <StatusBadges q={q} />
                  </td>
                  <td className="px-2 py-2 text-right text-gray-400">→</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* 상세/수정 모달 */}
      {editing && (
        <EditQuestionModal
          question={editing}
          onClose={() => setEditing(null)}
          onUpdate={(next) => {
            handleUpdate(next);
            setToast("저장했어요.");
          }}
          onRemove={(id) => {
            handleRemove(id);
            setEditing(null);
            setToast("삭제했어요.");
          }}
          onError={(m) => setToast(m)}
        />
      )}

      {/* 직접 추가 모달 */}
      {showCreate && (
        <CreateQuestionModal
          onClose={() => setShowCreate(false)}
          onCreated={(q) => {
            handleCreated([q]);
            setShowCreate(false);
            setToast("문제를 추가했어요.");
          }}
          onError={(m) => setToast(m)}
        />
      )}

      {/* AI 생성 모달 */}
      {showAI && (
        <AIGenerateModal
          onClose={() => setShowAI(false)}
          onGenerated={(count, skipped) => {
            setShowAI(false);
            setToast(
              `${count}개 생성 — 미검수 큐로 들어갔어요${
                skipped > 0 ? ` (${skipped}개 형식 오류로 제외)` : ""
              }. 새로고침하면 목록에 보여요.`,
            );
          }}
          onError={(m) => setToast(m)}
        />
      )}

      {/* 엑셀/시트 업로드 모달 */}
      {showBulk && (
        <BulkUploadModal
          onClose={() => setShowBulk(false)}
          onImported={(rows, approved) => {
            handleCreated(rows);
            setShowBulk(false);
            setToast(
              `${rows.length}개 문제를 추가했어요${
                approved ? " (바로 검수완료)" : " — 미검수 큐로 들어갔어요"
              }.`,
            );
          }}
          onError={(m) => setToast(m)}
        />
      )}

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-gray-900 text-white text-sm rounded-lg px-4 py-2 shadow-lg max-w-md text-center">
          {toast}
        </div>
      )}
    </div>
  );
}

/* ===== 보조 컴포넌트 ===== */

function StatusBadges({ q }: { q: QuizQuestion }) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      {q.is_approved ? (
        <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
          검수완료
        </span>
      ) : (
        <span className="text-xs px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
          미검수
        </span>
      )}
      {!q.is_active && (
        <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 border border-gray-200">
          비활성
        </span>
      )}
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="inline-flex items-center gap-1 bg-white border border-gray-200 rounded-lg px-2 py-1">
      <span className="text-xs text-gray-500">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="text-sm bg-transparent border-0 focus:outline-none cursor-pointer"
      >
        {options.map((o, i) => (
          <option key={`${o.value}-${o.label}-${i}`} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

/* ===== 상세/수정 모달 ===== */

function EditQuestionModal({
  question,
  onClose,
  onUpdate,
  onRemove,
  onError,
}: {
  question: QuizQuestion;
  onClose: () => void;
  onUpdate: (next: QuizQuestion) => void;
  onRemove: (id: string) => void;
  onError: (msg: string) => void;
}) {
  const [form, setForm] = useState(question);
  const [pending, startTransition] = useTransition();

  const dirty =
    form.question !== question.question ||
    form.option_1 !== question.option_1 ||
    form.option_2 !== question.option_2 ||
    form.option_3 !== question.option_3 ||
    form.option_4 !== question.option_4 ||
    form.correct_answer !== question.correct_answer ||
    (form.explanation ?? "") !== (question.explanation ?? "") ||
    form.difficulty !== question.difficulty ||
    form.category !== question.category ||
    form.grade !== question.grade;

  const submitSave = () => {
    startTransition(async () => {
      const res = await updateQuestionAction({
        id: question.id,
        patch: {
          category: form.category,
          grade: form.grade,
          question: form.question,
          option_1: form.option_1,
          option_2: form.option_2,
          option_3: form.option_3,
          option_4: form.option_4,
          correct_answer: form.correct_answer,
          explanation: form.explanation ?? "",
          difficulty: form.difficulty,
        },
      });
      if (!res.ok) {
        onError(res.message);
        return;
      }
      onUpdate(form);
    });
  };

  const submitApprove = () => {
    startTransition(async () => {
      const res = await updateQuestionAction({
        id: question.id,
        patch: { is_approved: true },
      });
      if (!res.ok) {
        onError(res.message);
        return;
      }
      const next = { ...form, is_approved: true, approved_at: new Date().toISOString() };
      setForm(next);
      onUpdate(next);
    });
  };

  const submitToggleActive = () => {
    const nextActive = !form.is_active;
    startTransition(async () => {
      const res = await updateQuestionAction({
        id: question.id,
        patch: { is_active: nextActive },
      });
      if (!res.ok) {
        onError(res.message);
        return;
      }
      const next = { ...form, is_active: nextActive };
      setForm(next);
      onUpdate(next);
    });
  };

  const submitDelete = () => {
    if (!window.confirm("이 문제를 삭제할까요? 되돌릴 수 없어요.")) return;
    startTransition(async () => {
      const res = await deleteQuestionAction({ id: question.id });
      if (!res.ok) {
        onError(res.message);
        return;
      }
      onRemove(question.id);
    });
  };

  return (
    <Modal title="문제 상세" onClose={onClose}>
      <div className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <CategorySelect
            value={form.category}
            onChange={(c) =>
              setForm({
                ...form,
                category: c,
                grade: c === "math" ? (form.grade === "all" ? "middle_1" : form.grade) : "all",
              })
            }
          />
          <GradeSelect
            value={form.grade}
            category={form.category}
            onChange={(g) => setForm({ ...form, grade: g })}
          />
          <DifficultySelect
            value={form.difficulty}
            onChange={(d) => setForm({ ...form, difficulty: d })}
          />
          <StatusBadges q={form} />
        </div>

        <LabeledTextarea
          label="문제"
          value={form.question}
          onChange={(v) => setForm({ ...form, question: v })}
          rows={3}
        />
        {([1, 2, 3, 4] as const).map((n) => {
          const key = `option_${n}` as const;
          return (
            <div key={n} className="flex items-start gap-2">
              <label className="mt-2 flex items-center gap-1 text-sm text-gray-700 shrink-0 w-12">
                <input
                  type="radio"
                  name="correct"
                  checked={form.correct_answer === n}
                  onChange={() => setForm({ ...form, correct_answer: n })}
                />
                {n}.
              </label>
              <input
                type="text"
                value={form[key]}
                onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm"
              />
            </div>
          );
        })}
        <LabeledTextarea
          label="해설 (선택)"
          value={form.explanation ?? ""}
          onChange={(v) => setForm({ ...form, explanation: v })}
          rows={3}
        />
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        {!form.is_approved && (
          <button
            type="button"
            onClick={submitApprove}
            disabled={pending}
            className="text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg px-3 py-2 disabled:opacity-50"
          >
            ✓ 검수 완료
          </button>
        )}
        <button
          type="button"
          onClick={submitToggleActive}
          disabled={pending}
          className="text-sm text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg px-3 py-2 disabled:opacity-50"
        >
          {form.is_active ? "비활성화" : "활성화"}
        </button>
        <button
          type="button"
          onClick={submitDelete}
          disabled={pending}
          className="text-sm text-red-600 hover:bg-red-50 rounded-lg px-3 py-2 disabled:opacity-50"
        >
          삭제
        </button>
        <div className="ml-auto flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="text-sm text-gray-600 hover:bg-gray-100 rounded-lg px-3 py-2"
          >
            닫기
          </button>
          <button
            type="button"
            onClick={submitSave}
            disabled={!dirty || pending}
            className="text-sm font-semibold text-white bg-gray-900 hover:bg-gray-800 rounded-lg px-3 py-2 disabled:opacity-50"
          >
            저장
          </button>
        </div>
      </div>
    </Modal>
  );
}

/* ===== 직접 추가 모달 ===== */

function CreateQuestionModal({
  onClose,
  onCreated,
  onError,
}: {
  onClose: () => void;
  onCreated: (q: QuizQuestion) => void;
  onError: (msg: string) => void;
}) {
  const [category, setCategory] = useState<QuizCategory>("math");
  const [grade, setGrade] = useState<QuizGrade>("middle_1");
  const [difficulty, setDifficulty] = useState<QuizDifficulty>("medium");
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState<[string, string, string, string]>(["", "", "", ""]);
  const [correctAnswer, setCorrectAnswer] = useState<number>(1);
  const [explanation, setExplanation] = useState("");
  const [pending, startTransition] = useTransition();

  const submit = () => {
    startTransition(async () => {
      const res = await createQuestionAction({
        category,
        grade,
        question,
        option_1: options[0],
        option_2: options[1],
        option_3: options[2],
        option_4: options[3],
        correct_answer: correctAnswer,
        explanation,
        difficulty,
      });
      if (!res.ok) {
        onError(res.message);
        return;
      }
      // 낙관적 ID — 실제 행 새로고침은 revalidatePath 가 처리. UI 즉시 반영용으로 임시 객체 사용.
      onCreated({
        id: `tmp-${Date.now()}`,
        category,
        grade,
        question: question.trim(),
        option_1: options[0].trim(),
        option_2: options[1].trim(),
        option_3: options[2].trim(),
        option_4: options[3].trim(),
        correct_answer: correctAnswer,
        explanation: explanation.trim() || null,
        difficulty,
        is_approved: true,
        is_active: true,
        created_at: new Date().toISOString(),
        approved_at: new Date().toISOString(),
      });
    });
  };

  return (
    <Modal title="+ 문제 추가" onClose={onClose}>
      <div className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <CategorySelect
            value={category}
            onChange={(c) => {
              setCategory(c);
              setGrade(c === "math" ? "middle_1" : "all");
            }}
          />
          <GradeSelect value={grade} category={category} onChange={setGrade} />
          <DifficultySelect value={difficulty} onChange={setDifficulty} />
        </div>
        <LabeledTextarea
          label="문제"
          value={question}
          onChange={setQuestion}
          rows={3}
        />
        {([0, 1, 2, 3] as const).map((i) => (
          <div key={i} className="flex items-start gap-2">
            <label className="mt-2 flex items-center gap-1 text-sm text-gray-700 shrink-0 w-12">
              <input
                type="radio"
                name="correct_new"
                checked={correctAnswer === i + 1}
                onChange={() => setCorrectAnswer(i + 1)}
              />
              {i + 1}.
            </label>
            <input
              type="text"
              value={options[i]}
              onChange={(e) => {
                const next = [...options] as [string, string, string, string];
                next[i] = e.target.value;
                setOptions(next);
              }}
              className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm"
              placeholder={`보기 ${i + 1}`}
            />
          </div>
        ))}
        <LabeledTextarea
          label="해설 (선택)"
          value={explanation}
          onChange={setExplanation}
          rows={2}
        />
      </div>

      <div className="mt-5 flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="text-sm text-gray-600 hover:bg-gray-100 rounded-lg px-3 py-2"
        >
          취소
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={pending}
          className="text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg px-3 py-2 disabled:opacity-50"
        >
          {pending ? "저장 중..." : "추가 (즉시 검수완료)"}
        </button>
      </div>
    </Modal>
  );
}

/* ===== AI 생성 모달 ===== */

function AIGenerateModal({
  onClose,
  onGenerated,
  onError,
}: {
  onClose: () => void;
  onGenerated: (count: number, skipped: number) => void;
  onError: (msg: string) => void;
}) {
  const [category, setCategory] = useState<QuizCategory>("math");
  const [grade, setGrade] = useState<QuizMathGrade>("middle_1");
  const [difficulty, setDifficulty] = useState<QuizDifficulty>("medium");
  const [count, setCount] = useState<10 | 20 | 50>(10);
  const [pending, startTransition] = useTransition();

  const submit = () => {
    startTransition(async () => {
      const res = await generateAIQuestionsAction({
        category,
        grade: category === "math" ? grade : "all",
        difficulty,
        count,
      });
      if (!res.ok) {
        onError(res.message);
        return;
      }
      onGenerated(res.generated, res.skipped);
    });
  };

  return (
    <Modal title="🤖 AI 문제 생성" onClose={onClose}>
      <p className="text-xs text-gray-500 mb-4 leading-relaxed">
        Claude (claude-opus-4-7) 가 4지선다 문제를 생성해 <b>미검수</b> 상태로 저장해요.
        <br />
        50개는 1~2분 정도 걸릴 수 있어요. 생성 후 목록에서 검토하고 검수완료 처리해주세요.
      </p>

      <div className="space-y-3">
        <RadioGroup
          label="카테고리"
          value={category}
          onChange={(v) => setCategory(v as QuizCategory)}
          options={[
            { value: "math", label: "🧮 수학" },
            { value: "general", label: "🌏 상식" },
            { value: "nonsense", label: "🎭 넌센스" },
          ]}
        />
        {category === "math" && (
          <div>
            <div className="text-xs text-gray-500 mb-1">학년</div>
            <select
              value={grade}
              onChange={(e) => setGrade(e.target.value as QuizMathGrade)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white"
            >
              {QUIZ_MATH_GRADES.map((g) => (
                <option key={g} value={g}>
                  {QUIZ_GRADE_LABEL[g]}
                </option>
              ))}
            </select>
          </div>
        )}
        <RadioGroup
          label="난이도"
          value={difficulty}
          onChange={(v) => setDifficulty(v as QuizDifficulty)}
          options={[
            { value: "easy", label: "쉬움" },
            { value: "medium", label: "보통" },
            { value: "hard", label: "어려움" },
          ]}
        />
        <RadioGroup
          label="생성 개수"
          value={String(count)}
          onChange={(v) => setCount(Number(v) as 10 | 20 | 50)}
          options={[
            { value: "10", label: "10개" },
            { value: "20", label: "20개" },
            { value: "50", label: "50개" },
          ]}
        />
      </div>

      <div className="mt-5 flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="text-sm text-gray-600 hover:bg-gray-100 rounded-lg px-3 py-2"
          disabled={pending}
        >
          취소
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={pending}
          className="text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg px-3 py-2 disabled:opacity-50"
        >
          {pending ? "생성 중... (수십초~수분)" : "🚀 생성 시작"}
        </button>
      </div>
    </Modal>
  );
}

/* ===== 엑셀/시트 업로드 모달 ===== */

const TEMPLATE_HEADER = [
  "category", "grade", "question", "option_1", "option_2",
  "option_3", "option_4", "correct_answer", "explanation", "difficulty",
];

const TEMPLATE_ROWS: string[][] = [
  ["math", "middle_1", "-3 + 5 의 값은?", "-8", "-2", "2", "8", "3", "5에서 3을 빼면 2가 돼요.", "easy"],
  ["math", "elementary_3", "7 × 8 의 값은?", "54", "56", "48", "64", "2", "7단을 외우면 7×8=56 이에요.", "easy"],
  ["general", "all", "대한민국의 수도는?", "서울", "부산", "대구", "인천", "1", "대한민국의 수도는 서울이에요.", "easy"],
  ["general", "all", "1기압에서 물이 끓는 온도는 섭씨 몇 도?", "0도", "50도", "100도", "200도", "3", "1기압에서 물은 100도에서 끓어요.", "easy"],
  ["nonsense", "all", "세상에서 가장 뜨거운 과일은?", "사과", "귤", "천도복숭아", "바나나", "3", "천(1000)도 복숭아라서요.", "easy"],
];

// textarea '예시 채우기'용 — 탭 구분(시트 붙여넣기와 동일 포맷).
const BULK_TEMPLATE = [TEMPLATE_HEADER, ...TEMPLATE_ROWS]
  .map((r) => r.join("\t"))
  .join("\n");

function csvCell(v: string): string {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

// 양식 다운로드 — UTF-8 BOM + CRLF 로 엑셀 한글/줄바꿈 호환.
function downloadCsvTemplate() {
  const csv =
    "﻿" +
    [TEMPLATE_HEADER, ...TEMPLATE_ROWS]
      .map((r) => r.map(csvCell).join(","))
      .join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "quiz-template.csv";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function BulkUploadModal({
  onClose,
  onImported,
  onError,
}: {
  onClose: () => void;
  onImported: (rows: QuizQuestion[], approved: boolean) => void;
  onError: (msg: string) => void;
}) {
  const [text, setText] = useState("");
  const [approve, setApprove] = useState(true);
  const [errors, setErrors] = useState<string[]>([]);
  const [pending, startTransition] = useTransition();

  const loadFile = (file: File | undefined) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setText(String(reader.result ?? ""));
    reader.onerror = () => onError("파일을 읽지 못했어요.");
    reader.readAsText(file);
  };

  const submit = () => {
    setErrors([]);
    startTransition(async () => {
      const res = await bulkImportQuestionsAction({ text, approve });
      if (!res.ok) {
        if (res.errors?.length) setErrors(res.errors);
        onError(res.message);
        return;
      }
      onImported(res.inserted, approve);
    });
  };

  return (
    <Modal title="📋 엑셀/시트 업로드" onClose={onClose}>
      <div className="space-y-3">
        <div className="text-xs text-gray-600 leading-relaxed bg-gray-50 border border-gray-100 rounded-lg p-3">
          <p className="font-semibold text-gray-800 mb-1">사용법</p>
          <p>
            구글시트·엑셀에서 <b>머리글 포함 셀들을 복사</b>해 아래 칸에 붙여넣거나, CSV 파일을 올려주세요.
          </p>
          <p className="mt-1">
            첫 줄은 머리글 — 필요 컬럼: <code>category</code>, <code>grade</code>,{" "}
            <code>question</code>, <code>option_1</code>~<code>option_4</code>,{" "}
            <code>correct_answer</code> / 선택: <code>explanation</code>, <code>difficulty</code>.
            (한글 머리글 <code>분류/학년/문제/보기1~4/정답/해설/난이도</code> 도 가능)
          </p>
          <ul className="mt-1 list-disc list-inside space-y-0.5">
            <li>
              <b>category</b>: math/general/nonsense (또는 수학/상식/넌센스)
            </li>
            <li>
              <b>grade</b>: 수학은 초3~중3(또는 elementary_3~middle_3), 상식·넌센스는 비워두면 자동 공통(all)
            </li>
            <li>
              <b>correct_answer</b>: 정답 보기 번호 1~4
            </li>
            <li>
              <b>difficulty</b>: easy/medium/hard (비우면 보통)
            </li>
          </ul>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={downloadCsvTemplate}
            className="text-sm font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg px-3 py-1.5 transition"
          >
            📥 양식 다운로드(CSV)
          </button>
          <label className="text-sm text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg px-3 py-1.5 cursor-pointer transition">
            📁 CSV 파일 선택
            <input
              type="file"
              accept=".csv,.tsv,.txt"
              className="hidden"
              onChange={(e) => loadFile(e.target.files?.[0])}
            />
          </label>
          <button
            type="button"
            onClick={() => setText(BULK_TEMPLATE)}
            className="text-sm text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg px-3 py-1.5 transition"
          >
            예시 채우기(붙여넣기 칸)
          </button>
        </div>
        <p className="text-xs text-gray-500 -mt-1">
          ① 양식 다운로드 → 엑셀/시트에서 작성 → ② CSV로 저장 후 「CSV 파일 선택」 (또는 시트 셀 복사해 아래에 붙여넣기)
        </p>

        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={9}
          placeholder={"여기에 표를 붙여넣으세요 (첫 줄 = 머리글).\n탭 또는 쉼표로 구분된 형식을 지원해요."}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs font-mono resize-y"
        />

        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={approve}
            onChange={(e) => setApprove(e.target.checked)}
          />
          바로 검수완료 처리 (체크 해제 시 미검수 큐로 — 학생에게 안 보임)
        </label>

        {errors.length > 0 && (
          <div className="border border-red-200 bg-red-50 rounded-lg p-3 max-h-48 overflow-y-auto">
            <p className="text-sm font-semibold text-red-700 mb-1">
              오류 {errors.length}개 — 저장 안 됨
            </p>
            <ul className="text-xs text-red-600 space-y-0.5">
              {errors.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="mt-5 flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          disabled={pending}
          className="text-sm text-gray-600 hover:bg-gray-100 rounded-lg px-3 py-2"
        >
          취소
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={pending || text.trim() === ""}
          className="text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg px-3 py-2 disabled:opacity-50"
        >
          {pending ? "업로드 중..." : "업로드"}
        </button>
      </div>
    </Modal>
  );
}

/* ===== 공통 UI ===== */

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center overflow-y-auto py-10 px-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-gray-900">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg w-8 h-8 transition"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function LabeledTextarea({
  label,
  value,
  onChange,
  rows = 3,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  rows?: number;
}) {
  return (
    <label className="block">
      <span className="text-xs text-gray-500 mb-1 block">{label}</span>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-y"
      />
    </label>
  );
}

function CategorySelect({
  value,
  onChange,
}: {
  value: QuizCategory;
  onChange: (v: QuizCategory) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as QuizCategory)}
      className="text-sm border border-gray-200 rounded-lg px-2 py-1 bg-white"
    >
      <option value="math">🧮 수학</option>
      <option value="general">🌏 상식</option>
      <option value="nonsense">🎭 넌센스</option>
    </select>
  );
}

function GradeSelect({
  value,
  category,
  onChange,
}: {
  value: QuizGrade;
  category: QuizCategory;
  onChange: (v: QuizGrade) => void;
}) {
  if (category !== "math") {
    return (
      <span className="text-sm text-gray-400 border border-gray-200 rounded-lg px-2 py-1 bg-gray-50">
        학년: 공통(all)
      </span>
    );
  }
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as QuizGrade)}
      className="text-sm border border-gray-200 rounded-lg px-2 py-1 bg-white"
    >
      {QUIZ_MATH_GRADES.map((g) => (
        <option key={g} value={g}>
          {QUIZ_GRADE_LABEL[g]}
        </option>
      ))}
    </select>
  );
}

function DifficultySelect({
  value,
  onChange,
}: {
  value: QuizDifficulty;
  onChange: (v: QuizDifficulty) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as QuizDifficulty)}
      className="text-sm border border-gray-200 rounded-lg px-2 py-1 bg-white"
    >
      {DIFFICULTY_OPTIONS.map((d) => (
        <option key={d.value} value={d.value}>
          {d.label}
        </option>
      ))}
    </select>
  );
}

function RadioGroup({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div>
      <div className="text-xs text-gray-500 mb-1">{label}</div>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className={`text-sm px-3 py-1.5 rounded-lg border transition ${
              value === o.value
                ? "bg-emerald-600 text-white border-emerald-600"
                : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
