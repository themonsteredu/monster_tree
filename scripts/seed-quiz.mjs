#!/usr/bin/env node
// 퀴즈센터 초기 시드 — Claude API 로 200문제 생성 → quiz_questions 적재.
//
// 구성:
//   수학 7학년 × 20문제 = 140
//   상식 (all) 30
//   넌센스 (all) 30
//   총 200 (전부 is_approved=false, 검수 대기)
//
// 사용법 (repo 루트에서):
//   npm install            # 한 번
//   node scripts/seed-quiz.mjs
//   # 또는: npm run seed:quiz
//
// 필요한 환경변수 (.env.local 에서 자동 로드):
//   ANTHROPIC_API_KEY        — Anthropic Console 의 API 키
//   NEXT_PUBLIC_SUPABASE_URL — monster_tree 의 Supabase URL
//   SUPABASE_SERVICE_ROLE_KEY — 같은 프로젝트의 service_role 키
//
// 결과: 11개 배치 순차 실행 (Anthropic rate-limit 회피).
//       배치 실패해도 다음 배치 계속 진행, 끝에서 요약.

import { readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const MODEL = "claude-opus-4-7";

const SYSTEM_PROMPT = `당신은 한국 초·중학생을 위한 4지선다 퀴즈 출제 전문가입니다.
출제 원칙:
- 보기 4개는 모두 길이/형식이 비슷해야 합니다 (정답만 압도적으로 길거나 명확하지 않게).
- 오답도 학생이 충분히 헷갈릴 만큼 그럴듯하게 만드세요.
- 해설은 1~3문장, 친근한 존댓말, 풀이의 핵심을 짚어주세요.
- correct_answer 는 1~4 중 하나의 정수입니다 (보기 번호).
- 같은 회차에서 정답이 한 보기 번호에 몰리지 않도록 분산하세요.
- 모든 문제와 보기는 자연스러운 한국어로 작성하세요.
- 같은 회차 안에서 같은 문제나 거의 똑같은 문제를 반복하지 마세요.
- 출력은 반드시 지정된 JSON 스키마를 따릅니다.`;

const QUIZ_SCHEMA = {
  type: "object",
  properties: {
    questions: {
      type: "array",
      items: {
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
      },
    },
  },
  required: ["questions"],
  additionalProperties: false,
};

// 11개 배치 정의.
const BATCHES = [
  {
    key: "math:elementary_3",
    category: "math",
    grade: "elementary_3",
    label: "초3 수학",
    count: 20,
    difficulty: "medium",
    userPrompt:
      "한국 초3 수학 교육과정에 맞는 4지선다 문제를 20개 만들어줘. 난이도: 보통. 단원: 곱셈, 나눗셈, 분수 기초. 각 단원이 골고루 섞이게 해줘. 오답도 그럴듯하게. 해설 포함.",
  },
  {
    key: "math:elementary_4",
    category: "math",
    grade: "elementary_4",
    label: "초4 수학",
    count: 20,
    difficulty: "medium",
    userPrompt:
      "한국 초4 수학 교육과정에 맞는 4지선다 문제를 20개 만들어줘. 난이도: 보통. 단원: 큰 수, 각도, 분수 덧셈·뺄셈. 각 단원이 골고루 섞이게 해줘. 오답도 그럴듯하게. 해설 포함.",
  },
  {
    key: "math:elementary_5",
    category: "math",
    grade: "elementary_5",
    label: "초5 수학",
    count: 20,
    difficulty: "medium",
    userPrompt:
      "한국 초5 수학 교육과정에 맞는 4지선다 문제를 20개 만들어줘. 난이도: 보통. 단원: 약수와 배수, 분수의 곱셈·나눗셈, 소수. 각 단원이 골고루 섞이게 해줘. 오답도 그럴듯하게. 해설 포함.",
  },
  {
    key: "math:elementary_6",
    category: "math",
    grade: "elementary_6",
    label: "초6 수학",
    count: 20,
    difficulty: "medium",
    userPrompt:
      "한국 초6 수학 교육과정에 맞는 4지선다 문제를 20개 만들어줘. 난이도: 보통. 단원: 비와 비율, 원의 넓이, 비례식. 각 단원이 골고루 섞이게 해줘. 오답도 그럴듯하게. 해설 포함.",
  },
  {
    key: "math:middle_1",
    category: "math",
    grade: "middle_1",
    label: "중1 수학",
    count: 20,
    difficulty: "medium",
    userPrompt:
      "한국 중1 수학 교육과정에 맞는 4지선다 문제를 20개 만들어줘. 난이도: 보통. 단원: 정수와 유리수, 일차방정식, 좌표평면. 각 단원이 골고루 섞이게 해줘. 오답도 그럴듯하게. 해설 포함.",
  },
  {
    key: "math:middle_2",
    category: "math",
    grade: "middle_2",
    label: "중2 수학",
    count: 20,
    difficulty: "medium",
    userPrompt:
      "한국 중2 수학 교육과정에 맞는 4지선다 문제를 20개 만들어줘. 난이도: 보통. 단원: 연립방정식, 부등식, 일차함수. 각 단원이 골고루 섞이게 해줘. 오답도 그럴듯하게. 해설 포함.",
  },
  {
    key: "math:middle_3",
    category: "math",
    grade: "middle_3",
    label: "중3 수학",
    count: 20,
    difficulty: "medium",
    userPrompt:
      "한국 중3 수학 교육과정에 맞는 4지선다 문제를 20개 만들어줘. 난이도: 보통. 단원: 이차방정식, 이차함수, 피타고라스 정리. 각 단원이 골고루 섞이게 해줘. 오답도 그럴듯하게. 해설 포함.",
  },
  {
    key: "general:all",
    category: "general",
    grade: "all",
    label: "상식",
    count: 30,
    difficulty: "medium",
    userPrompt:
      "초3~중3 학생이 풀 수 있는 일반상식 4지선다 30문제. 과학/역사/지리/동물/우주/생활상식이 골고루 섞이게 해줘. 해설 포함.",
  },
  {
    key: "nonsense:all",
    category: "nonsense",
    grade: "all",
    label: "넌센스",
    count: 30,
    difficulty: "easy",
    userPrompt:
      "초등~중학생이 좋아할 넌센스 4지선다 30문제. 말장난/수수께끼/재미있는 문제로 다양하게. 보기도 웃기게 만들어줘. 해설은 짧고 위트있게.",
  },
];

/* ============================ env loader ============================ */

async function loadEnvLocal() {
  const path = resolve(ROOT, ".env.local");
  try {
    const text = await readFile(path, "utf8");
    for (const rawLine of text.split("\n")) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq === -1) continue;
      const key = line.slice(0, eq).trim();
      let value = line.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = value;
    }
  } catch (err) {
    if (err.code !== "ENOENT") throw err;
    // .env.local 없으면 process.env 만 사용.
  }
}

function getRequiredEnv(name) {
  const v = (process.env[name] ?? "").trim();
  if (!v) {
    console.error(
      `❌ 환경변수 ${name} 가 비어있어요. .env.local 또는 셸에 설정해주세요.`,
    );
    process.exit(1);
  }
  return v;
}

/* ============================ anthropic ============================ */

async function callAnthropic(apiKey, batch) {
  const maxTokens = Math.min(32000, 2000 + batch.count * 350);
  const body = {
    model: MODEL,
    max_tokens: maxTokens,
    thinking: { type: "adaptive" },
    output_config: {
      effort: "medium",
      format: { type: "json_schema", schema: QUIZ_SCHEMA },
    },
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: batch.userPrompt }],
  };

  // 간단 재시도 (5xx / 429 / 네트워크).
  for (let attempt = 1; attempt <= 3; attempt++) {
    let res;
    try {
      res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
      });
    } catch (e) {
      if (attempt === 3) throw e;
      await sleep(1000 * 2 ** (attempt - 1));
      continue;
    }
    const text = await res.text();
    if (!res.ok) {
      if ((res.status === 429 || res.status >= 500) && attempt < 3) {
        await sleep(2000 * 2 ** (attempt - 1));
        continue;
      }
      throw new Error(
        `Anthropic HTTP ${res.status}: ${text.replace(/sk-ant-[A-Za-z0-9_-]+/g, "[REDACTED]").slice(0, 400)}`,
      );
    }
    return JSON.parse(text);
  }
  throw new Error("retries exhausted");
}

function extractQuestions(anthropicResp) {
  const blocks = anthropicResp.content ?? [];
  const textBlock = blocks.find((b) => b.type === "text");
  if (!textBlock) throw new Error("응답에서 text 블록을 찾을 수 없어요.");
  const parsed = JSON.parse(textBlock.text);
  const arr = Array.isArray(parsed.questions) ? parsed.questions : [];
  return arr.filter(
    (q) =>
      q &&
      typeof q.question === "string" &&
      typeof q.option_1 === "string" &&
      typeof q.option_2 === "string" &&
      typeof q.option_3 === "string" &&
      typeof q.option_4 === "string" &&
      typeof q.correct_answer === "number" &&
      q.correct_answer >= 1 &&
      q.correct_answer <= 4 &&
      typeof q.explanation === "string",
  );
}

/* ============================ supabase ============================ */

async function insertQuestions(supabaseUrl, serviceKey, rows) {
  if (rows.length === 0) return { ok: true, inserted: 0 };
  const url = `${supabaseUrl.replace(/\/+$/, "")}/rest/v1/quiz_questions`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "content-type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify(rows),
  });
  if (!res.ok) {
    const body = await res.text();
    return { ok: false, error: `Supabase HTTP ${res.status}: ${body.slice(0, 400)}` };
  }
  return { ok: true, inserted: rows.length };
}

/* ============================ main ============================ */

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  console.log("🌱 퀴즈센터 시드 시작 — 총 200문제 (11개 배치)\n");

  await loadEnvLocal();
  const apiKey = getRequiredEnv("ANTHROPIC_API_KEY");
  const supabaseUrl = getRequiredEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceKey = getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY");

  const startedAt = Date.now();
  let totalInserted = 0;
  let totalSkipped = 0;
  const failed = [];

  for (let i = 0; i < BATCHES.length; i++) {
    const batch = BATCHES[i];
    const tag = `[${i + 1}/${BATCHES.length}] ${batch.label}`;
    process.stdout.write(`${tag} ${batch.count}문제 생성 중... `);

    const batchStart = Date.now();
    try {
      const resp = await callAnthropic(apiKey, batch);
      const questions = extractQuestions(resp);
      const valid = questions.slice(0, batch.count); // 초과분은 잘라냄
      const skipped = batch.count - valid.length;

      const rows = valid.map((q) => ({
        category: batch.category,
        grade: batch.grade,
        question: q.question.slice(0, 1000),
        option_1: q.option_1.slice(0, 300),
        option_2: q.option_2.slice(0, 300),
        option_3: q.option_3.slice(0, 300),
        option_4: q.option_4.slice(0, 300),
        correct_answer: q.correct_answer,
        explanation: (q.explanation ?? "").slice(0, 2000) || null,
        difficulty: batch.difficulty,
        is_approved: false,
        is_active: true,
      }));

      const ins = await insertQuestions(supabaseUrl, serviceKey, rows);
      if (!ins.ok) {
        console.log(`❌ DB 저장 실패`);
        console.error(`   ${ins.error}`);
        failed.push({ batch: batch.label, reason: ins.error });
        continue;
      }

      totalInserted += ins.inserted;
      totalSkipped += skipped;
      const elapsed = ((Date.now() - batchStart) / 1000).toFixed(1);
      const usage = resp.usage ?? {};
      console.log(
        `✅ ${ins.inserted}개 (${elapsed}s` +
          (skipped > 0 ? `, ${skipped}개 형식 오류 제외` : "") +
          (usage.input_tokens
            ? `, in=${usage.input_tokens} out=${usage.output_tokens}`
            : "") +
          `)`,
      );
    } catch (err) {
      console.log(`❌`);
      console.error(`   ${err.message}`);
      failed.push({ batch: batch.label, reason: err.message });
    }
  }

  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log(`\n────────────────────────────────────────`);
  if (failed.length === 0) {
    console.log(
      `🎉 ${totalInserted}문제 생성 완료! 관리자 페이지에서 검수해주세요.`,
    );
    if (totalSkipped > 0) {
      console.log(`   (모델 형식 오류로 ${totalSkipped}개는 제외됨)`);
    }
    console.log(`   소요: ${elapsed}s · /admin/quiz-center 에서 검수 진행`);
    process.exit(0);
  } else {
    console.log(
      `⚠️  ${totalInserted}/${200} 문제 적재. ${failed.length}개 배치 실패:`,
    );
    for (const f of failed) {
      console.log(`   - ${f.batch}: ${f.reason}`);
    }
    console.log(`   소요: ${elapsed}s · 실패 배치만 다시 돌리려면 스크립트 수정 필요`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("\n💥 예상치 못한 오류:", err);
  process.exit(1);
});
