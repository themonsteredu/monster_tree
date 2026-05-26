"use server";

// /admin/quiz-center — 퀴즈 문제 CRUD + Claude 기반 AI 대량 생성.
// 모든 쓰기는 service_role 로 RLS 우회. 인증은 admin cookie 만 체크.

import { revalidatePath } from "next/cache";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { isAdminAuthenticated } from "../auth";
import type {
  QuizCategory,
  QuizDifficulty,
  QuizGrade,
  QuizMathGrade,
  QuizQuestion,
} from "@/lib/types";
import {
  QUIZ_GRADE_LABEL,
  QUIZ_DIFFICULTY_LABEL,
  QUIZ_CATEGORY_LABEL,
  QUIZ_MATH_GRADES,
} from "@/lib/types";

const CATEGORIES: QuizCategory[] = ["math", "general", "nonsense"];
const DIFFICULTIES: QuizDifficulty[] = ["easy", "medium", "hard"];

function ensureAuth() {
  if (!isAdminAuthenticated()) {
    throw new Error("AUTH_REQUIRED: 비밀번호가 필요합니다.");
  }
}

function revalidateAll() {
  revalidatePath("/admin/quiz-center");
}

type CreateInput = {
  category: QuizCategory;
  grade: QuizGrade;
  question: string;
  option_1: string;
  option_2: string;
  option_3: string;
  option_4: string;
  correct_answer: number;
  explanation?: string;
  difficulty: QuizDifficulty;
};

function validateQuestionInput(input: Partial<CreateInput>): string | null {
  if (!input.category || !CATEGORIES.includes(input.category)) {
    return "카테고리가 올바르지 않아요.";
  }
  if (!input.grade || typeof input.grade !== "string") {
    return "학년이 올바르지 않아요.";
  }
  if (input.category !== "math" && input.grade !== "all") {
    return "상식/넌센스는 학년이 'all' 이어야 해요.";
  }
  const q = (input.question ?? "").trim();
  if (!q || q.length > 1000) return "문제는 1~1000자 이내로 입력해주세요.";
  for (const k of ["option_1", "option_2", "option_3", "option_4"] as const) {
    const v = (input[k] ?? "").trim();
    if (!v || v.length > 300) return `${k} 는 1~300자 이내로 입력해주세요.`;
  }
  if (
    typeof input.correct_answer !== "number" ||
    input.correct_answer < 1 ||
    input.correct_answer > 4
  ) {
    return "정답은 1~4 중에서 선택해주세요.";
  }
  if (!input.difficulty || !DIFFICULTIES.includes(input.difficulty)) {
    return "난이도가 올바르지 않아요.";
  }
  return null;
}

/** + 문제 추가 — 직접 등록은 바로 검수완료 처리. */
export async function createQuestionAction(input: CreateInput) {
  ensureAuth();
  const err = validateQuestionInput(input);
  if (err) return { ok: false as const, message: err };

  const sb = createSupabaseServiceClient();
  const { error } = await sb.from("quiz_questions").insert({
    category: input.category,
    grade: input.grade,
    question: input.question.trim(),
    option_1: input.option_1.trim(),
    option_2: input.option_2.trim(),
    option_3: input.option_3.trim(),
    option_4: input.option_4.trim(),
    correct_answer: input.correct_answer,
    explanation: input.explanation?.trim() || null,
    difficulty: input.difficulty,
    is_approved: true,
    approved_at: new Date().toISOString(),
    is_active: true,
  });
  if (error) return { ok: false as const, message: `DB 저장 실패: ${error.message}` };

  revalidateAll();
  return { ok: true as const };
}

/** 문제 상세 수정 — 모든 필드 patch 가능 (undefined 는 건너뜀). */
export async function updateQuestionAction(args: {
  id: string;
  patch: Partial<CreateInput> & { is_active?: boolean; is_approved?: boolean };
}) {
  ensureAuth();
  if (!args.id) return { ok: false as const, message: "id 가 없어요." };

  const patch: Record<string, unknown> = {};
  const p = args.patch;
  if (p.category !== undefined) {
    if (!CATEGORIES.includes(p.category)) {
      return { ok: false as const, message: "카테고리가 올바르지 않아요." };
    }
    patch.category = p.category;
  }
  if (p.grade !== undefined) patch.grade = p.grade;
  if (p.question !== undefined) {
    const q = p.question.trim();
    if (!q || q.length > 1000) {
      return { ok: false as const, message: "문제는 1~1000자 이내로 입력해주세요." };
    }
    patch.question = q;
  }
  for (const k of ["option_1", "option_2", "option_3", "option_4"] as const) {
    const v = p[k];
    if (v !== undefined) {
      const t = v.trim();
      if (!t || t.length > 300) {
        return { ok: false as const, message: `${k} 는 1~300자 이내로 입력해주세요.` };
      }
      patch[k] = t;
    }
  }
  if (p.correct_answer !== undefined) {
    if (p.correct_answer < 1 || p.correct_answer > 4) {
      return { ok: false as const, message: "정답은 1~4 중에서 선택해주세요." };
    }
    patch.correct_answer = p.correct_answer;
  }
  if (p.explanation !== undefined) {
    patch.explanation = p.explanation.trim() || null;
  }
  if (p.difficulty !== undefined) {
    if (!DIFFICULTIES.includes(p.difficulty)) {
      return { ok: false as const, message: "난이도가 올바르지 않아요." };
    }
    patch.difficulty = p.difficulty;
  }
  if (p.is_active !== undefined) patch.is_active = p.is_active;
  if (p.is_approved !== undefined) {
    patch.is_approved = p.is_approved;
    if (p.is_approved) patch.approved_at = new Date().toISOString();
  }

  if (Object.keys(patch).length === 0) {
    return { ok: false as const, message: "변경할 항목이 없어요." };
  }

  const sb = createSupabaseServiceClient();
  const { error } = await sb.from("quiz_questions").update(patch).eq("id", args.id);
  if (error) return { ok: false as const, message: `DB 저장 실패: ${error.message}` };

  revalidateAll();
  return { ok: true as const };
}

export async function deleteQuestionAction(args: { id: string }) {
  ensureAuth();
  if (!args.id) return { ok: false as const, message: "id 가 없어요." };
  const sb = createSupabaseServiceClient();
  const { error } = await sb.from("quiz_questions").delete().eq("id", args.id);
  if (error) return { ok: false as const, message: `삭제 실패: ${error.message}` };
  revalidateAll();
  return { ok: true as const };
}

/* ===== 엑셀/시트 일괄 업로드 (CSV/TSV) ===== */

// 셀 값/머리글을 비교용으로 정규화 (소문자 + 공백 제거).
function normToken(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, "");
}

const CATEGORY_BY_TOKEN: Record<string, QuizCategory> = {
  math: "math",
  general: "general",
  nonsense: "nonsense",
  [normToken(QUIZ_CATEGORY_LABEL.math)]: "math", // 수학
  [normToken(QUIZ_CATEGORY_LABEL.general)]: "general", // 상식
  [normToken(QUIZ_CATEGORY_LABEL.nonsense)]: "nonsense", // 넌센스
};

const DIFFICULTY_BY_TOKEN: Record<string, QuizDifficulty> = {
  easy: "easy",
  medium: "medium",
  hard: "hard",
  [normToken(QUIZ_DIFFICULTY_LABEL.easy)]: "easy", // 쉬움
  [normToken(QUIZ_DIFFICULTY_LABEL.medium)]: "medium", // 보통
  [normToken(QUIZ_DIFFICULTY_LABEL.hard)]: "hard", // 어려움
};

const GRADE_BY_TOKEN: Record<string, QuizGrade> = (() => {
  const m: Record<string, QuizGrade> = { all: "all", 전체: "all", 공통: "all" };
  for (const g of QUIZ_MATH_GRADES) {
    m[g] = g;
    m[normToken(QUIZ_GRADE_LABEL[g])] = g; // 초3, 중1 ...
  }
  return m;
})();

type ImportField =
  | "category"
  | "grade"
  | "question"
  | "option_1"
  | "option_2"
  | "option_3"
  | "option_4"
  | "correct_answer"
  | "explanation"
  | "difficulty";

const HEADER_ALIASES: Record<string, ImportField> = {
  category: "category", 분류: "category", 카테고리: "category",
  grade: "grade", 학년: "grade",
  question: "question", 문제: "question",
  option_1: "option_1", option1: "option_1", 보기1: "option_1", 보기_1: "option_1",
  option_2: "option_2", option2: "option_2", 보기2: "option_2", 보기_2: "option_2",
  option_3: "option_3", option3: "option_3", 보기3: "option_3", 보기_3: "option_3",
  option_4: "option_4", option4: "option_4", 보기4: "option_4", 보기_4: "option_4",
  correct_answer: "correct_answer", correct: "correct_answer", answer: "correct_answer",
  정답: "correct_answer", 답: "correct_answer",
  explanation: "explanation", 해설: "explanation",
  difficulty: "difficulty", 난이도: "difficulty",
};

// CSV/TSV 파서 — 따옴표(이스케이프 "" 포함)와 셀 내부 줄바꿈을 처리.
// 구분자는 첫 줄에 탭이 있으면 TSV(시트 복사·붙여넣기), 없으면 CSV.
function parseTable(text: string): string[][] {
  const t = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const firstLine = t.split("\n", 1)[0] ?? "";
  const delim = firstLine.includes("\t") ? "\t" : ",";

  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (inQuotes) {
      if (c === '"') {
        if (t[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === delim) {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += c;
    }
  }
  row.push(field);
  rows.push(row);

  return rows.filter((r) => !(r.length === 1 && r[0].trim() === ""));
}

type BulkImportResult =
  | { ok: true; inserted: QuizQuestion[] }
  | { ok: false; message: string; errors?: string[] };

/**
 * 엑셀/구글시트/노션에서 복사한 표 또는 CSV 텍스트를 문제로 일괄 등록.
 * - 첫 줄 = 머리글 (영문 컬럼명 또는 한글: 분류/학년/문제/보기1~4/정답/해설/난이도).
 * - 한 줄이라도 형식 오류가 있으면 **아무것도 저장하지 않고** 줄별 오류를 돌려줌(all-or-nothing).
 * - approve!==false 이면 바로 검수완료(학생 즉시 노출), false 면 미검수 큐로.
 */
export async function bulkImportQuestionsAction(args: {
  text: string;
  approve?: boolean;
}): Promise<BulkImportResult> {
  ensureAuth();

  const text = (args.text ?? "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  if (!text) return { ok: false, message: "붙여넣은 내용이 없어요." };

  const table = parseTable(text);
  if (table.length < 2) {
    return { ok: false, message: "머리글 1줄 + 문제 1줄 이상이 필요해요." };
  }

  const colIndex: Partial<Record<ImportField, number>> = {};
  table[0].forEach((h, i) => {
    const f = HEADER_ALIASES[normToken(h)];
    if (f && colIndex[f] === undefined) colIndex[f] = i;
  });

  const required: ImportField[] = [
    "category", "question", "option_1", "option_2", "option_3", "option_4", "correct_answer",
  ];
  const missing = required.filter((f) => colIndex[f] === undefined);
  if (missing.length) {
    return {
      ok: false,
      message:
        `머리글에 필수 칸이 없어요: ${missing.join(", ")}. ` +
        "(필요 컬럼: category, grade, question, option_1~4, correct_answer / 선택: explanation, difficulty)",
    };
  }

  const approve = args.approve !== false;
  const errors: string[] = [];
  const toInsert: Record<string, unknown>[] = [];

  table.slice(1).forEach((cells, idx) => {
    const lineNo = idx + 2; // 머리글이 1번째 줄.
    if (cells.every((c) => c.trim() === "")) return; // 빈 줄 스킵.

    const cell = (f: ImportField) => {
      const i = colIndex[f];
      return i === undefined ? "" : (cells[i] ?? "").trim();
    };

    const category = CATEGORY_BY_TOKEN[normToken(cell("category"))];
    if (!category) {
      errors.push(
        `${lineNo}번째 줄: 카테고리("${cell("category")}")는 math/general/nonsense 또는 수학/상식/넌센스 여야 해요.`,
      );
      return;
    }

    let grade: QuizGrade;
    if (category === "math") {
      const g = GRADE_BY_TOKEN[normToken(cell("grade"))];
      if (!g || g === "all") {
        errors.push(`${lineNo}번째 줄: 수학은 학년이 필요해요 (초3~중3 또는 elementary_3~middle_3).`);
        return;
      }
      grade = g;
    } else {
      grade = "all";
    }

    const caDigits = cell("correct_answer").replace(/[^0-9]/g, "");
    const correct = caDigits ? parseInt(caDigits, 10) : NaN;
    if (Number.isNaN(correct)) {
      errors.push(`${lineNo}번째 줄: 정답은 1~4 숫자로 적어주세요.`);
      return;
    }

    let difficulty: QuizDifficulty = "medium";
    const dToken = normToken(cell("difficulty"));
    if (dToken) {
      const d = DIFFICULTY_BY_TOKEN[dToken];
      if (!d) {
        errors.push(`${lineNo}번째 줄: 난이도는 easy/medium/hard 또는 쉬움/보통/어려움 이어야 해요.`);
        return;
      }
      difficulty = d;
    }

    const input = {
      category,
      grade,
      question: cell("question"),
      option_1: cell("option_1"),
      option_2: cell("option_2"),
      option_3: cell("option_3"),
      option_4: cell("option_4"),
      correct_answer: correct,
      explanation: cell("explanation"),
      difficulty,
    };
    const vErr = validateQuestionInput(input);
    if (vErr) {
      errors.push(`${lineNo}번째 줄: ${vErr}`);
      return;
    }

    toInsert.push({
      category,
      grade,
      question: input.question.trim(),
      option_1: input.option_1.trim(),
      option_2: input.option_2.trim(),
      option_3: input.option_3.trim(),
      option_4: input.option_4.trim(),
      correct_answer: correct,
      explanation: input.explanation.trim() || null,
      difficulty,
      is_approved: approve,
      approved_at: approve ? new Date().toISOString() : null,
      is_active: true,
    });
  });

  if (errors.length) {
    return {
      ok: false,
      message: `${errors.length}개 줄에 오류가 있어 아무것도 저장하지 않았어요. 고친 뒤 다시 업로드해주세요.`,
      errors: errors.slice(0, 50),
    };
  }
  if (toInsert.length === 0) {
    return { ok: false, message: "추가할 문제가 없어요." };
  }

  const sb = createSupabaseServiceClient();
  const { data, error } = await sb.from("quiz_questions").insert(toInsert).select();
  if (error) return { ok: false, message: `DB 저장 실패: ${error.message}` };

  revalidateAll();
  return { ok: true, inserted: (data ?? []) as QuizQuestion[] };
}

/* ====================== AI 대량 생성 (Claude) ====================== */

// Anthropic 응답 타입 (필요한 부분만).
type AnthropicTextBlock = { type: "text"; text: string };
type AnthropicThinkingBlock = { type: "thinking"; thinking?: string };
type AnthropicContentBlock = AnthropicTextBlock | AnthropicThinkingBlock | { type: string };
type AnthropicResponse = {
  content?: AnthropicContentBlock[];
  stop_reason?: string;
  usage?: { input_tokens?: number; output_tokens?: number };
  error?: { type?: string; message?: string };
};

const SYSTEM_PROMPT = `당신은 한국 초·중학생을 위한 4지선다 퀴즈 출제 전문가입니다.
출제 원칙:
- 보기 4개는 모두 길이/형식이 비슷해야 합니다 (정답만 압도적으로 길거나 명확하지 않게).
- 오답도 학생이 충분히 헷갈릴 만큼 그럴듯하게 만드세요.
- 해설은 1~3문장, 친근한 존댓말, 풀이의 핵심을 짚어주세요.
- correct_answer 는 1~4 중 하나의 정수입니다 (보기 번호).
- 같은 회차에서 정답이 한 보기 번호에 몰리지 않도록 분산하세요.
- 모든 문제와 보기는 자연스러운 한국어로 작성하세요.
- 출력은 반드시 지정된 JSON 스키마를 따릅니다.`;

const QUESTION_ITEM_SCHEMA = {
  type: "object",
  properties: {
    question: { type: "string" },
    option_1: { type: "string" },
    option_2: { type: "string" },
    option_3: { type: "string" },
    option_4: { type: "string" },
    correct_answer: { type: "integer", enum: [1, 2, 3, 4] },
    explanation: { type: "string" },
  },
  required: [
    "question",
    "option_1",
    "option_2",
    "option_3",
    "option_4",
    "correct_answer",
    "explanation",
  ],
  additionalProperties: false,
} as const;

const QUIZ_OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    questions: {
      type: "array",
      items: QUESTION_ITEM_SCHEMA,
    },
  },
  required: ["questions"],
  additionalProperties: false,
} as const;

function buildUserPrompt(args: {
  category: QuizCategory;
  grade: QuizGrade;
  difficulty: QuizDifficulty;
  count: number;
}): string {
  const { category, grade, difficulty, count } = args;
  const diffLabel = QUIZ_DIFFICULTY_LABEL[difficulty];

  if (category === "math") {
    const gradeLabel = QUIZ_GRADE_LABEL[grade];
    return `한국 ${gradeLabel} 수학 교육과정에 맞는 4지선다 문제를 ${count}개 만들어줘. 난이도: ${diffLabel}. 오답도 그럴듯하게. 해설 포함. JSON 으로 출력.`;
  }
  if (category === "general") {
    return `초3~중3이 풀 수 있는 일반상식 4지선다를 ${count}개. 과학/역사/지리/동물/우주 등 다양하게. 난이도: ${diffLabel}. JSON 으로.`;
  }
  return `초등~중학생 넌센스 4지선다 ${count}개. 말장난/수수께끼. 보기도 웃기게. 난이도: ${diffLabel}. JSON 으로.`;
}

type GeneratedQuestion = {
  question: string;
  option_1: string;
  option_2: string;
  option_3: string;
  option_4: string;
  correct_answer: number;
  explanation: string;
};

function isGeneratedQuestion(v: unknown): v is GeneratedQuestion {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.question === "string" &&
    typeof o.option_1 === "string" &&
    typeof o.option_2 === "string" &&
    typeof o.option_3 === "string" &&
    typeof o.option_4 === "string" &&
    typeof o.correct_answer === "number" &&
    o.correct_answer >= 1 &&
    o.correct_answer <= 4 &&
    typeof o.explanation === "string"
  );
}

export async function generateAIQuestionsAction(args: {
  category: QuizCategory;
  grade: QuizGrade;
  difficulty: QuizDifficulty;
  count: 10 | 20 | 50;
}) {
  ensureAuth();

  if (!CATEGORIES.includes(args.category)) {
    return { ok: false as const, message: "카테고리가 올바르지 않아요." };
  }
  if (![10, 20, 50].includes(args.count)) {
    return { ok: false as const, message: "생성 개수는 10/20/50 중에서 선택해주세요." };
  }
  if (args.category === "math") {
    const mathGrades: ReadonlyArray<QuizMathGrade> = [
      "elementary_3",
      "elementary_4",
      "elementary_5",
      "elementary_6",
      "middle_1",
      "middle_2",
      "middle_3",
    ];
    if (!mathGrades.includes(args.grade as QuizMathGrade)) {
      return { ok: false as const, message: "수학은 학년을 선택해주세요." };
    }
  } else if (args.grade !== "all") {
    return { ok: false as const, message: "상식/넌센스는 학년이 'all' 이어야 해요." };
  }

  const apiKey = (process.env.ANTHROPIC_API_KEY ?? "").trim();
  if (!apiKey) {
    return {
      ok: false as const,
      message:
        "ANTHROPIC_API_KEY 환경변수가 없어요. Vercel 환경변수에 추가한 뒤 다시 시도해주세요.",
    };
  }

  const userPrompt = buildUserPrompt(args);

  // Anthropic Messages API 호출.
  // - claude-opus-4-7 + adaptive thinking + medium effort.
  // - output_config.format 으로 JSON 스키마 강제.
  // - max_tokens 는 생성 개수에 비례 — 문제당 ~250토큰 + 여유.
  let response: Response;
  try {
    response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-opus-4-7",
        max_tokens: Math.min(32000, 1000 + args.count * 400),
        thinking: { type: "adaptive" },
        output_config: {
          effort: "medium",
          format: {
            type: "json_schema",
            schema: QUIZ_OUTPUT_SCHEMA,
          },
        },
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });
  } catch (e) {
    return {
      ok: false as const,
      message: `Anthropic API 호출 실패: ${(e as Error).message}`,
    };
  }

  const raw = await response.text();
  if (!response.ok) {
    const cleaned = raw
      .replace(/sk-ant-[A-Za-z0-9_-]+/g, "[REDACTED]")
      .slice(0, 500);
    return {
      ok: false as const,
      message: `Anthropic API 오류 (HTTP ${response.status}): ${cleaned}`,
    };
  }

  let parsed: AnthropicResponse;
  try {
    parsed = JSON.parse(raw) as AnthropicResponse;
  } catch (e) {
    return {
      ok: false as const,
      message: `응답 JSON 파싱 실패: ${(e as Error).message}`,
    };
  }
  if (parsed.error) {
    return {
      ok: false as const,
      message: `Anthropic 오류: ${parsed.error.message ?? parsed.error.type ?? "unknown"}`,
    };
  }

  const textBlock = (parsed.content ?? []).find(
    (b): b is AnthropicTextBlock => b.type === "text",
  );
  if (!textBlock) {
    return { ok: false as const, message: "응답에서 text 블록을 찾을 수 없어요." };
  }

  let payload: { questions?: unknown };
  try {
    payload = JSON.parse(textBlock.text);
  } catch (e) {
    return {
      ok: false as const,
      message: `생성된 JSON 파싱 실패: ${(e as Error).message}`,
    };
  }

  const rawList = Array.isArray(payload.questions) ? payload.questions : [];
  const validQuestions = rawList.filter(isGeneratedQuestion);
  if (validQuestions.length === 0) {
    return { ok: false as const, message: "유효한 문제가 생성되지 않았어요." };
  }

  // is_approved=false 로 저장 → 관리자 검수 큐에 들어감.
  const rows = validQuestions.map((q) => ({
    category: args.category,
    grade: args.grade,
    question: q.question.slice(0, 1000),
    option_1: q.option_1.slice(0, 300),
    option_2: q.option_2.slice(0, 300),
    option_3: q.option_3.slice(0, 300),
    option_4: q.option_4.slice(0, 300),
    correct_answer: q.correct_answer,
    explanation: q.explanation.slice(0, 2000) || null,
    difficulty: args.difficulty,
    is_approved: false,
    is_active: true,
  }));

  const sb = createSupabaseServiceClient();
  const { error } = await sb.from("quiz_questions").insert(rows);
  if (error) {
    return { ok: false as const, message: `DB 저장 실패: ${error.message}` };
  }

  revalidateAll();
  const skipped = rawList.length - validQuestions.length;
  return {
    ok: true as const,
    generated: validQuestions.length,
    skipped,
    usage: parsed.usage ?? null,
  };
}
