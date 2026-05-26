"use client";

// /quiz-center 학생 UI — 모바일 세로 최적화.
// 상태 머신: 'main' (메인 화면) → 'playing' (3문제) → 'result' (결과)
// 관리자 테스트 모드: adminMode prop=true 면 무제한 재도전 가능, 기록/포인트 저장 안 함.

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import confetti from "canvas-confetti";
import {
  startQuizSessionAction,
  submitQuizAnswersAction,
  type PlayableQuestion,
} from "./actions";

type Phase = "main" | "playing" | "result";

type SubmitResult = {
  correctCount: number;
  isPerfect: boolean;
  pointEarned: number;
  perItem: Array<{ id: string; correct: boolean; correctAnswer: number }>;
};

type TodayPlay = {
  id: string;
  played_at: string;
  correct_count: number;
  is_perfect: boolean;
  point_earned: number;
};

const QUESTION_TIME_SEC = 15;
const FEEDBACK_DURATION_MS = 2000;

const CATEGORY_BADGE: Record<
  PlayableQuestion["category"],
  { icon: string; label: string; bg: string; text: string }
> = {
  math: { icon: "🔢", label: "수학", bg: "bg-blue-100", text: "text-blue-700" },
  general: { icon: "💡", label: "상식", bg: "bg-yellow-100", text: "text-yellow-800" },
  nonsense: { icon: "😂", label: "넌센스", bg: "bg-pink-100", text: "text-pink-700" },
};

export function QuizCenterClient({
  studentName,
  adminMode,
  today,
  recentWeek,
  lifetimePoints,
  streakDays,
}: {
  studentName: string | null;
  adminMode: boolean;
  today: TodayPlay | null;
  recentWeek: TodayPlay[];
  lifetimePoints: number;
  streakDays: number;
}) {
  const [phase, setPhase] = useState<Phase>("main");
  const [questions, setQuestions] = useState<PlayableQuestion[]>([]);
  const [answers, setAnswers] = useState<number[]>([]);
  const [result, setResult] = useState<SubmitResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, startStartTransition] = useTransition();

  // 도전 시작.
  const handleStart = useCallback(() => {
    setError(null);
    startStartTransition(async () => {
      const res = await startQuizSessionAction();
      if (!res.ok) {
        setError(res.message);
        return;
      }
      setQuestions(res.questions);
      setAnswers([]);
      setResult(null);
      setPhase("playing");
    });
  }, []);

  // 플레이 종료 → 결과 화면.
  const handlePlayComplete = useCallback(
    (finalAnswers: number[]) => {
      setAnswers(finalAnswers);
      (async () => {
        const res = await submitQuizAnswersAction({
          questionIds: questions.map((q) => q.id),
          answers: finalAnswers,
        });
        if (!res.ok) {
          setError(res.message);
          setPhase("main");
          return;
        }
        setResult({
          correctCount: res.correctCount,
          isPerfect: res.isPerfect,
          pointEarned: res.pointEarned,
          perItem: res.perItem,
        });
        setPhase("result");
      })();
    },
    [questions],
  );

  const handleBackToMain = useCallback(() => {
    setPhase("main");
    setQuestions([]);
    setAnswers([]);
    setResult(null);
  }, []);

  return (
    <main
      className="min-h-screen w-full"
      style={{
        background: "linear-gradient(180deg, #ede9fe 0%, #f5f3ff 60%, #faf5ff 100%)",
        fontFamily: "'Jua', 'Pretendard Variable', 'Pretendard', system-ui, sans-serif",
      }}
    >
      <div className="max-w-md mx-auto px-4 pt-6 pb-12">
        {adminMode && (
          <div className="mb-3 flex items-center gap-2 bg-amber-100 border border-amber-200 text-amber-800 rounded-xl px-3 py-2 text-sm">
            <span>🛠</span>
            <span className="font-bold">테스트 모드</span>
            <span className="text-xs ml-auto text-amber-700">
              기록·포인트 저장 안 됨
            </span>
          </div>
        )}

        {phase === "main" && (
          <MainScreen
            studentName={studentName}
            adminMode={adminMode}
            today={today}
            recentWeek={recentWeek}
            lifetimePoints={lifetimePoints}
            streakDays={streakDays}
            starting={starting}
            error={error}
            onStart={handleStart}
          />
        )}

        {phase === "playing" && questions.length === 3 && (
          <PlayScreen
            questions={questions}
            onComplete={handlePlayComplete}
          />
        )}

        {phase === "result" && result && (
          <ResultScreen
            adminMode={adminMode}
            questions={questions}
            answers={answers}
            result={result}
            onClose={handleBackToMain}
          />
        )}
      </div>
    </main>
  );
}

/* ===== 메인 화면 ===== */

function MainScreen({
  studentName,
  adminMode,
  today,
  recentWeek,
  lifetimePoints,
  streakDays,
  starting,
  error,
  onStart,
}: {
  studentName: string | null;
  adminMode: boolean;
  today: TodayPlay | null;
  recentWeek: TodayPlay[];
  lifetimePoints: number;
  streakDays: number;
  starting: boolean;
  error: string | null;
  onStart: () => void;
}) {
  // 관리자는 today 무시. 학생은 today 가 있으면 결과 표시 + 버튼 비활성.
  const canChallenge = adminMode || !today;

  return (
    <div className="space-y-4">
      {/* 타이틀 */}
      <header className="text-center pt-2">
        <h1 className="text-3xl font-bold text-purple-900">📝 퀴즈센터</h1>
        {studentName && !adminMode && (
          <p className="text-sm text-purple-700/80 mt-1">{studentName} 학생, 환영해요!</p>
        )}
      </header>

      {/* 오늘 상태 카드 */}
      <section className="bg-white rounded-3xl shadow-md p-6 text-center">
        {!today && (
          <>
            <div className="text-5xl mb-3">🎯</div>
            <p className="text-lg text-gray-800 mb-1">
              오늘의 퀴즈에 도전하자!
            </p>
            <p className="text-xs text-gray-500 mb-5">
              3문제 모두 맞히면 사과포인트 1점!
            </p>
          </>
        )}
        {today && today.is_perfect && (
          <>
            <div className="text-5xl mb-3">🎉</div>
            <p className="text-lg text-gray-800 mb-1">
              오늘 퀴즈 완료!
            </p>
            <p className="text-sm text-emerald-600 font-bold mb-5">+1 사과포인트</p>
          </>
        )}
        {today && !today.is_perfect && (
          <>
            <div className="text-5xl mb-3">😢</div>
            <p className="text-lg text-gray-800 mb-1">아쉽! 내일 다시 도전하자!</p>
            <p className="text-sm text-gray-500 mb-5">
              오늘 결과: <span className="font-bold text-gray-700">{today.correct_count}</span>
              <span className="text-gray-400"> / 3</span>
            </p>
          </>
        )}

        <button
          type="button"
          onClick={onStart}
          disabled={!canChallenge || starting}
          className="w-full text-base font-bold text-white rounded-2xl py-4 transition shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
          style={{
            background: canChallenge
              ? "linear-gradient(90deg, #a855f7 0%, #8b5cf6 100%)"
              : "#d1d5db",
          }}
        >
          {starting
            ? "준비 중..."
            : !canChallenge
              ? "내일 다시 만나요"
              : adminMode
                ? "🛠 테스트 도전하기"
                : "🚀 도전하기"}
        </button>

        {error && (
          <p className="mt-3 text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">
            {error}
          </p>
        )}
      </section>

      {/* 내 기록 */}
      <section className="bg-white rounded-3xl shadow-md p-5 space-y-4">
        <h2 className="text-base font-bold text-purple-900">📊 내 기록</h2>

        {/* 최근 7일 */}
        <div>
          <p className="text-xs text-gray-500 mb-2">최근 7일</p>
          <SevenDayStrip plays={recentWeek} />
        </div>

        {/* 연속 + 누적 */}
        <div className="grid grid-cols-2 gap-3">
          <StatCard
            icon="🔥"
            label="연속 올클"
            value={streakDays > 0 ? `${streakDays}일` : "-"}
            highlight={streakDays > 0}
          />
          <StatCard
            icon="🍎"
            label="누적 포인트"
            value={`${lifetimePoints}점`}
            highlight={false}
          />
        </div>
      </section>

      {/* 몬스터마을 돌아가기 */}
      <div className="text-center pt-2">
        <Link
          href="/me/village"
          className="inline-block text-sm text-purple-700 bg-white/60 hover:bg-white rounded-xl px-4 py-2 transition"
        >
          ← 몬스터마을로 돌아가기
        </Link>
      </div>
    </div>
  );
}

function SevenDayStrip({ plays }: { plays: TodayPlay[] }) {
  // 7개 슬롯: index 0 = 6일 전, index 6 = 오늘.
  const byDay = useMemo(() => {
    const map = new Map<string, TodayPlay>();
    for (const p of plays) {
      map.set(toKstDateKey(p.played_at), p);
    }
    return map;
  }, [plays]);

  const days = useMemo(() => {
    const out: Array<{ key: string; label: string; play: TodayPlay | undefined; isToday: boolean }> = [];
    const now = Date.now();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now - i * 24 * 3600 * 1000);
      const key = toKstDateKey(d.toISOString());
      const labels = ["일", "월", "화", "수", "목", "금", "토"];
      const label = labels[d.getDay()];
      out.push({ key, label, play: byDay.get(key), isToday: i === 0 });
    }
    return out;
  }, [byDay]);

  return (
    <div className="flex justify-between gap-1">
      {days.map((d) => {
        const symbol = d.play
          ? d.play.is_perfect
            ? "🍎"
            : d.play.correct_count > 0
              ? "△"
              : "✕"
          : "·";
        const bg = d.play
          ? d.play.is_perfect
            ? "bg-emerald-50 border-emerald-200 text-emerald-700"
            : d.play.correct_count > 0
              ? "bg-amber-50 border-amber-200 text-amber-700"
              : "bg-rose-50 border-rose-200 text-rose-600"
          : "bg-gray-50 border-gray-200 text-gray-300";
        return (
          <div key={d.key} className="flex-1 flex flex-col items-center">
            <div
              className={`w-full aspect-square rounded-xl border flex items-center justify-center text-lg ${bg}`}
            >
              {symbol}
            </div>
            <span
              className={`text-[11px] mt-1 ${
                d.isToday ? "font-bold text-purple-700" : "text-gray-400"
              }`}
            >
              {d.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  highlight,
}: {
  icon: string;
  label: string;
  value: string;
  highlight: boolean;
}) {
  return (
    <div
      className={`rounded-2xl p-3 text-center ${
        highlight
          ? "bg-orange-50 border border-orange-200"
          : "bg-purple-50 border border-purple-100"
      }`}
    >
      <div className="text-2xl">{icon}</div>
      <div className="text-xs text-gray-500 mt-1">{label}</div>
      <div
        className={`text-base font-bold mt-0.5 ${
          highlight ? "text-orange-600" : "text-purple-900"
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function toKstDateKey(iso: string): string {
  const t = new Date(iso).getTime();
  const kst = new Date(t + 9 * 3600 * 1000);
  const y = kst.getUTCFullYear();
  const m = String(kst.getUTCMonth() + 1).padStart(2, "0");
  const d = String(kst.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/* ===== 플레이 화면 ===== */

function PlayScreen({
  questions,
  onComplete,
}: {
  questions: PlayableQuestion[];
  onComplete: (answers: number[]) => void;
}) {
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState<number[]>([]);
  // feedback: null = 답 입력 대기, 객체 = 선택 후 2초 피드백 중.
  const [feedback, setFeedback] = useState<{
    chosen: number;
    correctAnswer: number;
  } | null>(null);
  const [timeLeft, setTimeLeft] = useState(QUESTION_TIME_SEC);
  const timerRef = useRef<number | null>(null);
  // 사용자 클릭 + 타이머 0 도달이 동시에 일어났을 때 handleAnswer 중복 발화 방지.
  // (feedback state 는 비동기라 closure check 만으론 불충분.)
  const answeredRef = useRef(false);

  const current = questions[idx];

  // 다음 문제로 진행 (또는 결과로). 항상 effect cleanup 와 타이머 정리.
  const goNext = useCallback(
    (chosen: number) => {
      const nextAnswers = [...answers, chosen];
      if (idx + 1 < questions.length) {
        setAnswers(nextAnswers);
        setIdx(idx + 1);
        setFeedback(null);
        setTimeLeft(QUESTION_TIME_SEC);
      } else {
        // 모든 문제 완료 — 부모로 위임.
        onComplete(nextAnswers);
      }
    },
    [answers, idx, questions.length, onComplete],
  );

  // 답 선택 (또는 시간 초과 시 chosen=0).
  const handleAnswer = useCallback(
    (chosen: number) => {
      if (answeredRef.current) return;
      answeredRef.current = true;
      if (timerRef.current) {
        window.clearInterval(timerRef.current);
        timerRef.current = null;
      }
      setFeedback({ chosen, correctAnswer: current.correct_answer });
      window.setTimeout(() => goNext(chosen), FEEDBACK_DURATION_MS);
    },
    [current, goNext],
  );

  // 타이머는 idx 변경 시에만 리셋. handleAnswer 는 ref 로 호출 (deps 에 안 넣음)
  // — 그래야 답 클릭으로 feedback 가 set 되어도 타이머가 reset 되지 않는다.
  const handleAnswerRef = useRef(handleAnswer);
  useEffect(() => {
    handleAnswerRef.current = handleAnswer;
  }, [handleAnswer]);

  useEffect(() => {
    setTimeLeft(QUESTION_TIME_SEC);
    answeredRef.current = false;
    if (timerRef.current) window.clearInterval(timerRef.current);
    timerRef.current = window.setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          if (timerRef.current) {
            window.clearInterval(timerRef.current);
            timerRef.current = null;
          }
          handleAnswerRef.current(0);
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => {
      if (timerRef.current) {
        window.clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [idx]);

  const badge = CATEGORY_BADGE[current.category];
  const timerPct = (timeLeft / QUESTION_TIME_SEC) * 100;

  return (
    <div className="space-y-4">
      {/* 헤더 — 진행 + 카테고리 뱃지 */}
      <div className="flex items-center justify-between">
        <span className="text-sm font-bold text-purple-900">
          {idx + 1} / {questions.length}
        </span>
        <span
          className={`text-xs font-bold px-3 py-1 rounded-full ${badge.bg} ${badge.text}`}
        >
          {badge.icon} {badge.label}
        </span>
      </div>

      {/* 타이머 바 */}
      <div className="w-full h-2 bg-white/70 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-[width] duration-1000 ease-linear ${
            timeLeft <= 5 ? "bg-red-400" : "bg-purple-500"
          }`}
          style={{ width: `${timerPct}%` }}
        />
      </div>

      {/* 문제 + 보기 */}
      <section className="bg-white rounded-3xl shadow-md p-6 space-y-4">
        <p className="text-lg text-gray-900 leading-relaxed whitespace-pre-wrap">
          {current.question}
        </p>

        <div className="space-y-2 pt-2">
          {([1, 2, 3, 4] as const).map((n) => {
            const text = current.options[n - 1];
            let cls =
              "bg-purple-50 border-purple-100 text-gray-900 hover:bg-purple-100 active:bg-purple-200";
            if (feedback) {
              if (n === feedback.correctAnswer) {
                cls = "bg-emerald-100 border-emerald-300 text-emerald-800 font-bold";
              } else if (n === feedback.chosen) {
                cls = "bg-rose-100 border-rose-300 text-rose-700";
              } else {
                cls = "bg-gray-50 border-gray-200 text-gray-400";
              }
            }
            return (
              <button
                key={n}
                type="button"
                disabled={!!feedback}
                onClick={() => handleAnswer(n)}
                className={`w-full text-left rounded-2xl border-2 px-4 py-3 transition ${cls}`}
              >
                <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-white border border-current text-sm font-bold mr-2">
                  {n}
                </span>
                <span className="text-base">{text}</span>
              </button>
            );
          })}
        </div>

        {/* 피드백 */}
        {feedback && (
          <FeedbackBanner
            chosen={feedback.chosen}
            correctAnswer={feedback.correctAnswer}
            explanation={current.explanation}
          />
        )}
      </section>
    </div>
  );
}

function FeedbackBanner({
  chosen,
  correctAnswer,
  explanation,
}: {
  chosen: number;
  correctAnswer: number;
  explanation: string | null;
}) {
  const correct = chosen === correctAnswer;
  return (
    <div
      className={`rounded-2xl p-4 ${
        correct
          ? "bg-emerald-50 border border-emerald-200"
          : "bg-rose-50 border border-rose-200"
      }`}
    >
      <div className="flex items-center gap-2 mb-2">
        <span className="text-2xl">{correct ? "✅" : chosen === 0 ? "⏰" : "❌"}</span>
        <span
          className={`text-base font-bold ${
            correct ? "text-emerald-700" : "text-rose-700"
          }`}
        >
          {correct
            ? "정답!"
            : chosen === 0
              ? "시간 초과! 정답은 " + correctAnswer + "번."
              : "오답. 정답은 " + correctAnswer + "번."}
        </span>
      </div>
      {explanation && (
        <p className="text-sm text-gray-700 leading-relaxed">{explanation}</p>
      )}
    </div>
  );
}

/* ===== 결과 화면 ===== */

function ResultScreen({
  adminMode,
  questions,
  answers,
  result,
  onClose,
}: {
  adminMode: boolean;
  questions: PlayableQuestion[];
  answers: number[];
  result: SubmitResult;
  onClose: () => void;
}) {
  // 올클 시 confetti.
  useEffect(() => {
    if (!result.isPerfect) return;
    const end = Date.now() + 1200;
    const tick = () => {
      confetti({
        particleCount: 40,
        startVelocity: 35,
        spread: 70,
        origin: { y: 0.4 },
        colors: ["#a855f7", "#8b5cf6", "#ec4899", "#f59e0b", "#10b981"],
      });
      if (Date.now() < end) requestAnimationFrame(tick);
    };
    tick();
  }, [result.isPerfect]);

  const headline = result.isPerfect
    ? "🎉 올클 성공!"
    : result.correctCount > 0
      ? "아쉬워! 내일 다시!"
      : "내일 또 도전해봐요!";

  return (
    <div className="space-y-4">
      <header className="text-center pt-2">
        <div className="text-5xl mb-2">{result.isPerfect ? "🎉" : "😅"}</div>
        <h2 className="text-2xl font-bold text-purple-900">{headline}</h2>
        <p className="text-sm text-gray-700 mt-2">
          <span className="text-xl font-bold text-purple-700">
            {result.correctCount}
          </span>
          <span className="text-gray-400"> / {questions.length} 맞췄어요</span>
        </p>
      </header>

      {result.isPerfect && !adminMode && (
        <div className="bg-gradient-to-r from-emerald-100 to-emerald-50 border border-emerald-200 rounded-2xl p-4 text-center">
          <div className="text-base font-bold text-emerald-700">
            +{result.pointEarned} 사과포인트 적립!
          </div>
          <p className="text-xs text-emerald-600/80 mt-1">
            사과정원에서 "받기" 버튼을 누르면 화분에 물을 줄 수 있어요 🌱
          </p>
        </div>
      )}
      {adminMode && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3 text-center text-sm text-amber-700">
          🛠 테스트 모드 — 기록과 포인트는 저장되지 않았어요.
        </div>
      )}

      {/* 문제별 결과 */}
      <section className="bg-white rounded-3xl shadow-md p-4 space-y-3">
        {questions.map((q, i) => {
          const item = result.perItem[i];
          const chosen = answers[i];
          const correct = item?.correct ?? false;
          const badge = CATEGORY_BADGE[q.category];
          return (
            <div key={q.id} className="border border-gray-100 rounded-2xl p-3">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-sm font-bold text-gray-500">{i + 1}.</span>
                <span
                  className={`text-xs font-bold px-2 py-0.5 rounded-full ${badge.bg} ${badge.text}`}
                >
                  {badge.icon} {badge.label}
                </span>
                <span
                  className={`ml-auto text-base font-bold ${
                    correct ? "text-emerald-600" : "text-rose-500"
                  }`}
                >
                  {correct ? "⭕" : "❌"}
                </span>
              </div>
              <p className="text-sm text-gray-800 mb-2 leading-snug">{q.question}</p>
              <p className="text-xs text-gray-500">
                정답: <span className="font-bold text-gray-700">{item?.correctAnswer ?? "?"}번</span>
                {!correct && chosen !== 0 && (
                  <> · 내 답: <span className="text-rose-500">{chosen}번</span></>
                )}
                {chosen === 0 && <> · <span className="text-rose-500">시간 초과</span></>}
              </p>
            </div>
          );
        })}
      </section>

      {/* 닫기 / 다시 도전 (admin) */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onClose}
          className="flex-1 text-base font-bold text-white rounded-2xl py-3 transition"
          style={{ background: "linear-gradient(90deg, #a855f7 0%, #8b5cf6 100%)" }}
        >
          {adminMode ? "다시 도전" : "확인"}
        </button>
        <Link
          href="/me/village"
          className="flex-1 text-base font-bold text-purple-700 bg-white border border-purple-200 rounded-2xl py-3 text-center transition hover:bg-purple-50"
        >
          마을로
        </Link>
      </div>
    </div>
  );
}
