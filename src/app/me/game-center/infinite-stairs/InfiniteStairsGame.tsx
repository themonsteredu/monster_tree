"use client";

// 무한의 계단 — 좌/우 알록달록 계단을 끝없이 올라가는 미니게임.
// 규칙:
//  - 캐릭터는 현재 계단(stairs[0])의 좌/우 한쪽에 서 있다.
//  - 다음 계단(stairs[1])이 좌 / 우 어느 쪽인지 보고 그쪽을 탭하면 +1.
//  - 틀린 방향 탭 = 게임오버. 제한시간 초과 = 게임오버.
//  - 초기 제한시간 2.0s → 한 칸 오를 때마다 -0.05s, 하한 0.8s.
//
// 조작:
//  - 모바일: 화면 왼쪽 절반 / 오른쪽 절반 탭.
//  - PC: ← / → 화살표.

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  recordInfiniteStairsPlayAction,
  type InfiniteStairsResult,
} from "../actions";

type Side = "L" | "R";
type Phase = "ready" | "playing" | "over";

const STAIR_QUEUE_LEN = 10; // 화면에 보이는 계단 수
const INITIAL_TIMER_MS = 2000;
const TIMER_STEP_MS = 50;
const MIN_TIMER_MS = 800;

function randomSide(): Side {
  return Math.random() < 0.5 ? "L" : "R";
}

function makeStairs(): Side[] {
  return Array.from({ length: STAIR_QUEUE_LEN }, randomSide);
}

type Props = {
  remainingBefore: number;
  characterImageUrl: string | null;
  characterFallback: string;
  monsterNickname: string;
};

export function InfiniteStairsGame({
  remainingBefore,
  characterImageUrl,
  characterFallback,
  monsterNickname,
}: Props) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("ready");
  const [score, setScore] = useState(0);
  const [stairs, setStairs] = useState<Side[]>(() => makeStairs());
  const [timerMs, setTimerMs] = useState(INITIAL_TIMER_MS);
  const [maxTimerMs, setMaxTimerMs] = useState(INITIAL_TIMER_MS);
  const [result, setResult] = useState<InfiniteStairsResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [flash, setFlash] = useState<"none" | "good" | "bad">("none");

  // 클로저 문제 회피 — 타이머/이벤트 콜백에서 최신값 읽기
  const scoreRef = useRef(0);
  const stairsRef = useRef<Side[]>(stairs);
  const phaseRef = useRef<Phase>(phase);

  const timeoutRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const startedAtRef = useRef<number>(0);
  const durationRef = useRef<number>(INITIAL_TIMER_MS);

  useEffect(() => {
    stairsRef.current = stairs;
  }, [stairs]);
  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  const clearTimers = useCallback(() => {
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  const submitResult = useCallback(
    async (finalScore: number) => {
      clearTimers();
      setSubmitting(true);
      try {
        const res = await recordInfiniteStairsPlayAction({
          score: finalScore,
        });
        setResult(res);
      } catch {
        setResult({
          ok: false,
          reason: "invalid",
          message: "네트워크 오류로 저장 실패",
        });
      } finally {
        setSubmitting(false);
        setPhase("over");
      }
    },
    [clearTimers],
  );

  const startTurnTimer = useCallback(
    (duration: number) => {
      clearTimers();
      startedAtRef.current = performance.now();
      durationRef.current = duration;
      setTimerMs(duration);
      setMaxTimerMs(duration);

      timeoutRef.current = window.setTimeout(() => {
        if (phaseRef.current !== "playing") return;
        setFlash("bad");
        void submitResult(scoreRef.current);
      }, duration);

      const tick = () => {
        const elapsed = performance.now() - startedAtRef.current;
        const remaining = Math.max(durationRef.current - elapsed, 0);
        setTimerMs(remaining);
        if (remaining > 0 && phaseRef.current === "playing") {
          rafRef.current = requestAnimationFrame(tick);
        }
      };
      rafRef.current = requestAnimationFrame(tick);
    },
    [clearTimers, submitResult],
  );

  const startGame = useCallback(() => {
    scoreRef.current = 0;
    setScore(0);
    const initial = makeStairs();
    stairsRef.current = initial;
    setStairs(initial);
    setResult(null);
    setFlash("none");
    setPhase("playing");
    phaseRef.current = "playing";
    startTurnTimer(INITIAL_TIMER_MS);
  }, [startTurnTimer]);

  const handleInput = useCallback(
    (side: Side) => {
      if (phaseRef.current !== "playing") return;
      const expected = stairsRef.current[1];

      if (side !== expected) {
        setFlash("bad");
        setTimeout(() => setFlash("none"), 220);
        void submitResult(scoreRef.current);
        return;
      }

      // 정답
      const newScore = scoreRef.current + 1;
      scoreRef.current = newScore;
      setScore(newScore);

      const newStairs = [...stairsRef.current.slice(1), randomSide()];
      stairsRef.current = newStairs;
      setStairs(newStairs);

      setFlash("good");
      window.setTimeout(() => setFlash("none"), 90);

      const nextDuration = Math.max(
        MIN_TIMER_MS,
        INITIAL_TIMER_MS - newScore * TIMER_STEP_MS,
      );
      startTurnTimer(nextDuration);
    },
    [startTurnTimer, submitResult],
  );

  // 키보드 입력 (PC)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (phaseRef.current === "ready" && (e.key === " " || e.key === "Enter")) {
        e.preventDefault();
        startGame();
        return;
      }
      if (phaseRef.current !== "playing") return;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        handleInput("L");
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        handleInput("R");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleInput, startGame]);

  // unmount cleanup
  useEffect(() => clearTimers, [clearTimers]);

  const timerRatio =
    maxTimerMs > 0 ? Math.max(0, Math.min(1, timerMs / maxTimerMs)) : 0;
  const timerColor =
    timerRatio > 0.5
      ? "from-emerald-400 to-cyan-400"
      : timerRatio > 0.25
        ? "from-amber-300 to-orange-400"
        : "from-rose-500 to-red-500";

  const flashOverlay =
    flash === "bad"
      ? "bg-red-500/35"
      : flash === "good"
        ? "bg-pink-400/15"
        : "bg-transparent";

  return (
    <main
      className="relative h-[100dvh] w-full select-none overflow-hidden text-white"
      style={{
        background:
          "radial-gradient(120% 80% at 50% -10%, #3b0d6e 0%, #1a0a3a 40%, #0a0418 70%, #050308 100%)",
        fontFamily: "'Jua', 'Pretendard Variable', sans-serif",
        touchAction: "manipulation",
      }}
    >
      <Stars />

      {/* 점수 + 타이머 (상단) */}
      <div className="absolute inset-x-0 top-0 z-30 px-5 pt-4">
        <div className="mx-auto flex w-full max-w-md items-center justify-between">
          <Link
            href="/me/game-center"
            className="rounded-full border border-white/15 bg-black/40 px-3 py-1.5 text-xs font-bold text-white/80 backdrop-blur-sm"
          >
            ← 나가기
          </Link>
          <div className="text-right">
            <div className="text-[11px] text-white/55">점수</div>
            <div className="text-3xl font-extrabold leading-none tracking-tight text-white">
              {score}
            </div>
          </div>
        </div>
        {/* 타이머 바 */}
        <div className="mx-auto mt-3 h-2 w-full max-w-md overflow-hidden rounded-full bg-white/10">
          <motion.div
            className={`h-full rounded-full bg-gradient-to-r ${timerColor}`}
            style={{ width: `${timerRatio * 100}%` }}
            transition={{ duration: 0 }}
          />
        </div>
      </div>

      {/* 게임 영역 */}
      <div className="absolute inset-0 z-10">
        <StairColumn
          stairs={stairs}
          characterImageUrl={characterImageUrl}
          characterFallback={characterFallback}
        />
      </div>

      {/* 좌/우 탭 영역 + 화살표 인디케이터 */}
      <button
        type="button"
        aria-label="왼쪽"
        className="absolute left-0 top-0 z-20 h-full w-1/2"
        onPointerDown={(e) => {
          e.preventDefault();
          handleInput("L");
        }}
      >
        <span
          className="pointer-events-none absolute bottom-6 left-6 text-4xl text-white/35"
          aria-hidden
        >
          ◀
        </span>
      </button>
      <button
        type="button"
        aria-label="오른쪽"
        className="absolute right-0 top-0 z-20 h-full w-1/2"
        onPointerDown={(e) => {
          e.preventDefault();
          handleInput("R");
        }}
      >
        <span
          className="pointer-events-none absolute bottom-6 right-6 text-4xl text-white/35"
          aria-hidden
        >
          ▶
        </span>
      </button>

      {/* 플래시 오버레이 */}
      <div
        className={`pointer-events-none absolute inset-0 z-40 transition-colors duration-150 ${flashOverlay}`}
        aria-hidden
      />

      {/* 시작 전 오버레이 */}
      <AnimatePresence>
        {phase === "ready" && (
          <motion.div
            key="ready"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/55 px-6 text-center backdrop-blur-sm"
          >
            <div className="text-5xl">🪜</div>
            <h2 className="mt-3 text-2xl font-extrabold">무한의 계단</h2>
            <p className="mt-2 max-w-xs text-sm text-white/80">
              화면을 왼쪽 / 오른쪽으로 탭해서
              <br />
              다음 계단 방향을 맞춰주세요.
            </p>
            <button
              type="button"
              onClick={startGame}
              className="mt-6 rounded-full bg-gradient-to-r from-pink-500 to-fuchsia-500 px-8 py-3 text-base font-extrabold text-white shadow-[0_8px_24px_rgba(244,114,182,0.45)] active:scale-95"
            >
              ▶ 탭하여 시작
            </button>
            <p className="mt-4 text-xs text-white/50">
              오늘 남은 횟수 · {remainingBefore}회
            </p>
          </motion.div>
        )}

        {phase === "over" && (
          <ResultOverlay
            key="over"
            result={result}
            submitting={submitting}
            score={score}
            monsterNickname={monsterNickname}
            onRetry={remainingBefore > 1 ? startGame : null}
            onHome={() => router.push("/me/game-center")}
            onEvolutionContinue={() => router.push("/me/onboarding")}
          />
        )}
      </AnimatePresence>
    </main>
  );
}

// ============== 계단 컬럼 + 캐릭터 ==============

function StairColumn({
  stairs,
  characterImageUrl,
  characterFallback,
}: {
  stairs: Side[];
  characterImageUrl: string | null;
  characterFallback: string;
}) {
  // 계단을 화면 아래쪽부터 위로 쌓는다. stairs[0] = 가장 아래 (캐릭터 위치).
  // 화면 높이 대비 % 로 배치 → 어떤 단말에서도 비율 유지.
  // 보이는 계단은 9개 (10번째는 큐 끝 — 보이지 않음, 다음에 올라올 자리).
  const visible = stairs.slice(0, 9);
  const stairBottomStartPct = 18; // 가장 아래 계단의 화면 하단으로부터 %
  const stairStepPct = 9; // 한 계단당 위로 올라가는 %
  const charSide = stairs[0];

  return (
    <div className="absolute inset-0">
      {visible.map((side, i) => {
        const bottom = stairBottomStartPct + i * stairStepPct;
        // 가장 아래 계단을 가장 진하게, 위로 갈수록 살짝 흐리게 — 깊이감.
        const opacity = Math.max(0.35, 1 - i * 0.06);
        return (
          <div
            key={`stair-${i}-${side}`}
            className="absolute h-[7%] w-[44%]"
            style={{
              bottom: `${bottom}%`,
              ...(side === "L"
                ? { left: "6%" }
                : { right: "6%" }),
              opacity,
            }}
          >
            <div
              className="h-full w-full rounded-xl border border-white/15"
              style={{
                background:
                  side === "L"
                    ? "linear-gradient(180deg, #c084fc 0%, #7c3aed 100%)"
                    : "linear-gradient(180deg, #f0abfc 0%, #c026d3 100%)",
                boxShadow:
                  "0 6px 12px rgba(0,0,0,0.35), 0 0 16px rgba(168,85,247,0.25) inset",
              }}
            />
          </div>
        );
      })}

      {/* 캐릭터 — 가장 아래 계단 위 */}
      <motion.div
        className="absolute"
        animate={{
          // 캐릭터의 좌/우 위치는 stairs[0] 에 따라 결정. 두 위치 사이 fade-swap.
          left: charSide === "L" ? "13%" : "auto",
          right: charSide === "R" ? "13%" : "auto",
        }}
        transition={{ duration: 0.08 }}
        style={{
          bottom: `${stairBottomStartPct + 7}%`,
        }}
      >
        <motion.div
          animate={{ y: [0, -3, 0] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
          className="flex h-16 w-16 items-center justify-center"
        >
          {characterImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={characterImageUrl}
              alt=""
              draggable={false}
              className="h-16 w-16 object-contain"
              style={{
                filter:
                  "drop-shadow(0 6px 12px rgba(0,0,0,0.55)) drop-shadow(0 0 14px rgba(244,114,182,0.4))",
              }}
            />
          ) : (
            <span
              className="text-5xl"
              style={{
                filter:
                  "drop-shadow(0 6px 12px rgba(0,0,0,0.55)) drop-shadow(0 0 14px rgba(244,114,182,0.4))",
              }}
            >
              {characterFallback}
            </span>
          )}
        </motion.div>
      </motion.div>
    </div>
  );
}

// ============== 결과 오버레이 ==============

function ResultOverlay({
  result,
  submitting,
  score,
  monsterNickname,
  onRetry,
  onHome,
  onEvolutionContinue,
}: {
  result: InfiniteStairsResult | null;
  submitting: boolean;
  score: number;
  monsterNickname: string;
  onRetry: (() => void) | null;
  onHome: () => void;
  onEvolutionContinue: () => void;
}) {
  const isFinal = result?.ok && result.finalEvolution;
  const stageUp = result?.ok && result.stageUp;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="absolute inset-0 z-50 flex items-center justify-center bg-black/65 px-6 backdrop-blur-sm"
    >
      <motion.div
        initial={{ y: 30, scale: 0.95 }}
        animate={{ y: 0, scale: 1 }}
        transition={{ type: "spring", stiffness: 220, damping: 20 }}
        className="w-full max-w-sm rounded-2xl border border-purple-400/30 bg-gradient-to-br from-purple-900/80 to-indigo-950/85 p-6 text-center"
        style={{
          boxShadow:
            "0 20px 50px rgba(0,0,0,0.55), 0 0 40px rgba(168,85,247,0.25)",
        }}
      >
        {submitting ? (
          <>
            <div className="text-4xl">⏳</div>
            <div className="mt-3 text-base font-bold text-white">
              결과 저장 중...
            </div>
          </>
        ) : result?.ok ? (
          <>
            <div className="text-2xl font-extrabold text-white">
              {isFinal ? "🎉 진화 완료!" : stageUp ? "🌟 단계 업!" : "GAME OVER"}
            </div>

            <div className="mt-4 rounded-xl bg-white/[0.05] p-4">
              <div className="text-xs text-white/55">최종 점수</div>
              <div className="text-5xl font-extrabold text-pink-300">
                {result.score}
              </div>
              {result.isNewBest && (
                <div className="mt-1 text-xs font-bold text-yellow-300">
                  🏆 이번 달 최고기록!
                </div>
              )}
            </div>

            <div className="mt-3 flex items-center justify-center gap-2 text-sm text-white/85">
              <span aria-hidden>✨</span>
              <span className="font-bold">EXP +{result.expEarned}</span>
              <span className="text-white/40">·</span>
              <span className="text-white/65">총 {result.newExp}</span>
            </div>

            {stageUp && !isFinal && (
              <div className="mt-3 rounded-lg border border-pink-300/30 bg-pink-500/15 px-3 py-2 text-sm font-bold text-pink-200">
                {monsterNickname} 가 {result.toStage}단계로 성장했어요!
              </div>
            )}

            {isFinal && (
              <div className="mt-3 rounded-lg border border-yellow-300/30 bg-yellow-400/10 px-3 py-2 text-sm font-bold text-yellow-200">
                {monsterNickname} 가 최종 진화 완료! 도감에 등록됐어요.
              </div>
            )}

            <div className="mt-5 flex flex-col gap-2">
              {isFinal ? (
                <button
                  type="button"
                  onClick={onEvolutionContinue}
                  className="rounded-full bg-gradient-to-r from-yellow-400 to-orange-500 px-5 py-3 text-base font-extrabold text-white shadow-[0_6px_18px_rgba(251,191,36,0.45)] active:scale-95"
                >
                  🥚 새 알 고르러 가기
                </button>
              ) : onRetry ? (
                <button
                  type="button"
                  onClick={onRetry}
                  className="rounded-full bg-gradient-to-r from-pink-500 to-fuchsia-500 px-5 py-3 text-base font-extrabold text-white shadow-[0_6px_18px_rgba(244,114,182,0.45)] active:scale-95"
                >
                  ↻ 다시하기
                </button>
              ) : (
                <div className="rounded-full bg-white/10 px-5 py-3 text-sm font-bold text-white/60">
                  오늘 횟수를 모두 사용했어요
                </div>
              )}
              <button
                type="button"
                onClick={onHome}
                className="rounded-full border border-white/15 bg-white/[0.04] px-5 py-2.5 text-sm font-bold text-white/80 active:scale-95"
              >
                게임센터로
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="text-2xl font-extrabold text-white">GAME OVER</div>
            <div className="mt-3 text-3xl font-extrabold text-pink-300">
              {score}점
            </div>
            <div className="mt-2 text-sm text-rose-200">
              {result?.message ?? "결과 저장에 실패했어요"}
            </div>
            <button
              type="button"
              onClick={onHome}
              className="mt-5 w-full rounded-full bg-white/10 px-5 py-3 text-base font-bold text-white"
            >
              게임센터로
            </button>
          </>
        )}
      </motion.div>
    </motion.div>
  );
}

function Stars() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-0 opacity-60"
      style={{
        backgroundImage:
          "radial-gradient(1.5px 1.5px at 20% 30%, rgba(255,255,255,0.7) 50%, transparent 51%)," +
          "radial-gradient(1px 1px at 70% 60%, rgba(255,255,255,0.55) 50%, transparent 51%)," +
          "radial-gradient(1.2px 1.2px at 40% 80%, rgba(255,255,255,0.5) 50%, transparent 51%)," +
          "radial-gradient(1px 1px at 85% 20%, rgba(255,255,255,0.55) 50%, transparent 51%)," +
          "radial-gradient(1.4px 1.4px at 12% 70%, rgba(255,255,255,0.45) 50%, transparent 51%)," +
          "radial-gradient(1.8px 1.8px at 90% 75%, rgba(255,255,255,0.4) 50%, transparent 51%)",
        backgroundSize: "320px 320px",
      }}
    />
  );
}
