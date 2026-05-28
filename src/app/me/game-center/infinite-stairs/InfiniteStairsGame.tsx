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
import type { AvatarConfig } from "@/lib/types";
import {
  recordInfiniteStairsPlayAction,
  type InfiniteStairsResult,
} from "../actions";
import { GameAudio } from "../bgm";

type Side = "L" | "R";
type Phase = "ready" | "playing" | "over";

const STAIR_QUEUE_LEN = 10; // 화면에 보이는 계단 수
const INITIAL_TIMER_MS = 2000;
const TIMER_STEP_MS = 50;
const MIN_TIMER_MS = 800;
const STARTING_LIVES = 3;
// 피격 후 무적 시간(ms) — 같은 액션 연타 시 중복 피해 방지 (오답 탭 한정).
const INVINCIBLE_MS = 700;
// 깜빡임 지속 시간(ms)
const DAMAGED_FLASH_MS = 700;
// 게임 캐릭터 — 귀여운 이모지. 바꾸고 싶으면 이 값만 교체 (예: "🐰" "🦊" "🐧" "👾").
const CHARACTER_EMOJI = "🐥";

function randomSide(): Side {
  return Math.random() < 0.5 ? "L" : "R";
}

function makeStairs(): Side[] {
  return Array.from({ length: STAIR_QUEUE_LEN }, randomSide);
}

type Props = {
  remainingBefore: number;
  avatarConfig: AvatarConfig | null;
  monsterNickname: string;
  // 관리자 미리보기 모드 — 서버 액션 호출 안 함, 결과 저장 안 됨, 무제한 다시하기.
  adminMode?: boolean;
  // adminMode 에서 '나가기' 클릭 시 이동 경로 (기본: /me/game-center)
  homeHref?: string;
};

export function InfiniteStairsGame({
  remainingBefore,
  // avatarConfig 는 더 이상 사용 안 함 — 게임 캐릭터는 고정 이모지(CHARACTER_EMOJI).
  monsterNickname,
  adminMode = false,
  homeHref = "/me/game-center",
}: Props) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("ready");
  const [score, setScore] = useState(0);
  const [stairs, setStairs] = useState<Side[]>(() => makeStairs());
  const [result, setResult] = useState<InfiniteStairsResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [flash, setFlash] = useState<"none" | "good" | "bad">("none");
  const [climbing, setClimbing] = useState(false);
  const [combo, setCombo] = useState(0);
  const [maxCombo, setMaxCombo] = useState(0);
  const [muted, setMuted] = useState(false);
  const [lives, setLives] = useState(STARTING_LIVES);
  const [damaged, setDamaged] = useState(false);

  // 클로저 문제 회피 — 타이머/이벤트 콜백에서 최신값 읽기
  const scoreRef = useRef(0);
  const stairsRef = useRef<Side[]>(stairs);
  const phaseRef = useRef<Phase>(phase);
  const climbingRef = useRef(false);
  const comboRef = useRef(0);
  const maxComboRef = useRef(0);
  const livesRef = useRef(STARTING_LIVES);
  const invincibleRef = useRef(false);
  // loseLife 와 startTurnTimer 가 서로를 호출하는 순환 참조 해소를 위해 ref 우회.
  const loseLifeRef = useRef<() => void>(() => {});

  const timeoutRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const climbAnimRef = useRef<number | null>(null);
  const startedAtRef = useRef<number>(0);
  const durationRef = useRef<number>(INITIAL_TIMER_MS);
  // 타이머 바는 React state(매 프레임 setState → 전체 리렌더) 대신 DOM 을 직접 갱신해
  // 60fps 리렌더로 인한 버벅임을 없앤다. lastTierRef 는 색 구간 변경 시에만 배경/그림자 갱신.
  const timerBarRef = useRef<HTMLDivElement | null>(null);
  const lastTierRef = useRef<string>("");
  const audioRef = useRef<GameAudio | null>(null);
  if (audioRef.current === null && typeof window !== "undefined") {
    audioRef.current = new GameAudio();
  }

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
    if (climbAnimRef.current !== null) {
      window.clearTimeout(climbAnimRef.current);
      climbAnimRef.current = null;
    }
  }, []);

  const submitResult = useCallback(
    async (finalScore: number) => {
      clearTimers();
      audioRef.current?.stopBgm();
      audioRef.current?.sfxGameOver();
      setSubmitting(true);
      // 관리자 모드 — 서버 호출 안 함. 점수만 로컬에 표시.
      if (adminMode) {
        setResult(null);
        setSubmitting(false);
        setPhase("over");
        return;
      }
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
    [clearTimers, adminMode],
  );

  // 타이머 바 DOM 직접 갱신 — 폭은 매 프레임, 배경/그림자 색은 구간이 바뀔 때만.
  const paintTimer = useCallback((ratio: number) => {
    const el = timerBarRef.current;
    if (!el) return;
    const r = ratio < 0 ? 0 : ratio > 1 ? 1 : ratio;
    el.style.width = `${r * 100}%`;
    const tier = r > 0.5 ? "hi" : r > 0.25 ? "mid" : "lo";
    if (tier !== lastTierRef.current) {
      lastTierRef.current = tier;
      el.style.background =
        tier === "hi"
          ? "linear-gradient(to right,#34d399,#22d3ee)"
          : tier === "mid"
            ? "linear-gradient(to right,#fcd34d,#fb923c)"
            : "linear-gradient(to right,#f43f5e,#ef4444)";
      el.style.boxShadow =
        tier === "lo"
          ? "0 0 14px rgba(244,63,94,0.8)"
          : "0 0 8px rgba(168,85,247,0.5)";
    }
  }, []);

  const startTurnTimer = useCallback(
    (duration: number) => {
      clearTimers();
      startedAtRef.current = performance.now();
      durationRef.current = duration;
      // 바를 풀로 리셋 (DOM 직접 갱신 — 리렌더 없음)
      lastTierRef.current = "";
      paintTimer(1);

      timeoutRef.current = window.setTimeout(() => {
        if (phaseRef.current !== "playing") return;
        // 시간 초과 = 피해 1 (무적 무시). loseLife 가 마지막 목숨이면 submitResult 호출.
        loseLifeRef.current();
      }, duration);

      const tick = () => {
        const elapsed = performance.now() - startedAtRef.current;
        const remaining = Math.max(durationRef.current - elapsed, 0);
        paintTimer(durationRef.current > 0 ? remaining / durationRef.current : 0);
        if (remaining > 0 && phaseRef.current === "playing") {
          rafRef.current = requestAnimationFrame(tick);
        }
      };
      rafRef.current = requestAnimationFrame(tick);
    },
    [clearTimers, paintTimer],
  );

  // 피해 처리 — 오답 탭(무적 체크 호출자 측) 또는 시간 초과.
  // 마지막 목숨이면 submitResult, 아니면 같은 계단에서 타이머 리셋 + 무적/깜빡임.
  const loseLife = useCallback(() => {
    const newLives = livesRef.current - 1;
    livesRef.current = newLives;
    setLives(newLives);
    comboRef.current = 0;
    setCombo(0);
    setFlash("bad");
    window.setTimeout(() => setFlash("none"), 220);
    setDamaged(true);
    window.setTimeout(() => setDamaged(false), DAMAGED_FLASH_MS);

    if (newLives <= 0) {
      void submitResult(scoreRef.current);
      return;
    }

    audioRef.current?.sfxHurt();
    invincibleRef.current = true;
    window.setTimeout(() => {
      invincibleRef.current = false;
    }, INVINCIBLE_MS);

    // 같은 계단에서 다시 도전 — 타이머만 풀 듀레이션으로 리셋.
    startTurnTimer(durationRef.current);
  }, [startTurnTimer, submitResult]);

  // ref 동기화 — startTurnTimer 의 timeout 콜백이 ref 로 호출.
  useEffect(() => {
    loseLifeRef.current = loseLife;
  }, [loseLife]);

  const startGame = useCallback(() => {
    scoreRef.current = 0;
    comboRef.current = 0;
    maxComboRef.current = 0;
    livesRef.current = STARTING_LIVES;
    invincibleRef.current = false;
    setScore(0);
    setCombo(0);
    setMaxCombo(0);
    setLives(STARTING_LIVES);
    setDamaged(false);
    const initial = makeStairs();
    stairsRef.current = initial;
    setStairs(initial);
    setResult(null);
    setFlash("none");
    setClimbing(false);
    climbingRef.current = false;
    setPhase("playing");
    phaseRef.current = "playing";
    // BGM 시작 — startGame 은 사용자 탭 핸들러에서 호출되므로 autoplay 정책 통과.
    audioRef.current?.startBgm();
    startTurnTimer(INITIAL_TIMER_MS);
  }, [startTurnTimer]);

  const handleInput = useCallback(
    (side: Side) => {
      if (phaseRef.current !== "playing") return;
      if (climbingRef.current) return; // climb 애니메이션 중 입력 잠금
      const expected = stairsRef.current[1];

      if (side !== expected) {
        // 무적 시간(피격 직후)엔 오답 탭 무시 — 중복 피해 방지.
        if (invincibleRef.current) return;
        loseLife();
        return;
      }

      // === 정답 처리 ===
      audioRef.current?.sfxStep();
      // 정답 즉시 현재 턴 타이머(게임오버 timeout + rAF) 정리.
      // 안 그러면 climb 애니(110ms) 동안 직전 턴의 게임오버 timeout 이 발화해
      // 정답인데도 목숨이 깎이는 버그 발생(막판 정답 탭 시).
      clearTimers();

      // 콤보 — 타이머가 50% 이상 남았을 때 탭하면 콤보 증가, 아니면 0 으로 리셋.
      const elapsed = performance.now() - startedAtRef.current;
      const remainingRatio =
        durationRef.current > 0
          ? 1 - elapsed / durationRef.current
          : 0;
      const fast = remainingRatio > 0.5;
      const newCombo = fast ? comboRef.current + 1 : 0;
      comboRef.current = newCombo;
      setCombo(newCombo);
      if (newCombo > maxComboRef.current) {
        maxComboRef.current = newCombo;
        setMaxCombo(newCombo);
      }
      if (fast && newCombo >= 3 && newCombo % 3 === 0) {
        audioRef.current?.sfxCombo(newCombo);
      }

      // climb 애니메이션 시작 — 100ms 후 큐 시프트
      climbingRef.current = true;
      setClimbing(true);
      setFlash("good");
      window.setTimeout(() => setFlash("none"), 90);

      climbAnimRef.current = window.setTimeout(() => {
        const newScore = scoreRef.current + 1;
        scoreRef.current = newScore;
        setScore(newScore);

        const newStairs = [
          ...stairsRef.current.slice(1),
          randomSide(),
        ];
        stairsRef.current = newStairs;
        setStairs(newStairs);

        climbingRef.current = false;
        setClimbing(false);

        const nextDuration = Math.max(
          MIN_TIMER_MS,
          INITIAL_TIMER_MS - newScore * TIMER_STEP_MS,
        );
        startTurnTimer(nextDuration);
        climbAnimRef.current = null;
      }, 110);
    },
    [startTurnTimer, loseLife, clearTimers],
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

  // unmount cleanup — 타이머 + 오디오 정리
  useEffect(() => {
    return () => {
      clearTimers();
      audioRef.current?.dispose();
      audioRef.current = null;
    };
  }, [clearTimers]);

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    audioRef.current?.setMuted(next);
  };

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
      {/* Jua 폰트 */}
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Jua&display=swap"
      />

      {/* 원거리 nebula 글로우 — 깊이감 */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-0"
        style={{
          background:
            "radial-gradient(40% 30% at 25% 30%, rgba(168,85,247,0.25) 0%, transparent 70%)," +
            "radial-gradient(35% 25% at 80% 65%, rgba(244,114,182,0.18) 0%, transparent 70%)",
        }}
      />
      <Stars />

      {/* 관리자 테스트 모드 뱃지 (게임 화면 최상단) */}
      {adminMode && (
        <div className="absolute inset-x-0 top-0 z-40 pointer-events-none flex justify-center pt-1">
          <span
            className="pointer-events-auto rounded-b-xl border border-amber-400/40 border-t-0 bg-amber-500/20 px-3 py-1 text-[11px] font-bold text-amber-100 backdrop-blur-sm"
            style={{ boxShadow: "0 0 12px rgba(245,158,11,0.4)" }}
          >
            🛠 테스트 모드 · 기록 저장 안 됨
          </span>
        </div>
      )}

      {/* 점수 + 타이머 (상단) */}
      <div
        className={`absolute inset-x-0 top-0 z-30 px-5 ${adminMode ? "pt-9" : "pt-4"}`}
      >
        <div className="mx-auto flex w-full max-w-md items-center justify-between gap-2">
          <Link
            href={homeHref}
            className="rounded-full border border-white/15 bg-black/40 px-3 py-1.5 text-xs font-bold text-white/80 backdrop-blur-sm"
          >
            ← 나가기
          </Link>
          <Hearts lives={lives} max={STARTING_LIVES} />
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={toggleMute}
              aria-label={muted ? "소리 켜기" : "소리 끄기"}
              className="rounded-full border border-white/15 bg-black/40 px-2.5 py-1.5 text-base backdrop-blur-sm"
            >
              {muted ? "🔇" : "🔊"}
            </button>
            <div className="text-right">
              <div className="text-[11px] uppercase tracking-widest text-white/45">
                SCORE
              </div>
              <motion.div
                key={score}
                initial={{ scale: 1.25, color: "#fde68a" }}
                animate={{ scale: 1, color: "#ffffff" }}
                transition={{ duration: 0.2 }}
                className="text-4xl font-extrabold leading-none tracking-tight"
                style={{
                  textShadow:
                    "0 2px 8px rgba(0,0,0,0.55), 0 0 14px rgba(244,114,182,0.35)",
                }}
              >
                {score}
              </motion.div>
            </div>
          </div>
        </div>
        {/* 타이머 바 */}
        <div
          className="mx-auto mt-3 h-2 w-full max-w-md overflow-hidden rounded-full bg-white/10"
          style={{ boxShadow: "0 0 1px rgba(255,255,255,0.1) inset" }}
        >
          <div
            ref={timerBarRef}
            className="h-full rounded-full"
            style={{
              width: "100%",
              background: "linear-gradient(to right,#34d399,#22d3ee)",
              boxShadow: "0 0 8px rgba(168,85,247,0.5)",
            }}
          />
        </div>
      </div>

      {/* 게임 영역 */}
      <div className="absolute inset-0 z-10">
        <StairColumn
          stairs={stairs}
          score={score}
          climbing={climbing}
          damaged={damaged}
        />
      </div>

      {/* 콤보 표시 — 3 이상일 때만 */}
      <AnimatePresence>
        {combo >= 3 && phase === "playing" && (
          <motion.div
            key={`combo-${combo}`}
            initial={{ scale: 0.6, opacity: 0, y: 10 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ type: "spring", stiffness: 380, damping: 20 }}
            className="pointer-events-none absolute left-1/2 top-[28%] z-30 -translate-x-1/2 text-center"
          >
            <div
              className="text-xs font-bold uppercase tracking-widest text-yellow-200/90"
              style={{ textShadow: "0 0 8px rgba(0,0,0,0.6)" }}
            >
              COMBO
            </div>
            <div
              className="text-5xl font-extrabold leading-none text-yellow-200"
              style={{
                textShadow:
                  "0 0 10px rgba(251,191,36,0.7), 0 4px 10px rgba(0,0,0,0.65), 0 0 22px rgba(244,63,94,0.4)",
              }}
            >
              ×{combo}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 좌/우 탭 영역 + 화살표 인디케이터 (하단 25% 영역 살짝 틴트) */}
      <button
        type="button"
        aria-label="왼쪽"
        className="group absolute left-0 top-0 z-20 h-full w-1/2"
        onPointerDown={(e) => {
          e.preventDefault();
          handleInput("L");
        }}
        style={{
          background:
            "linear-gradient(to top, rgba(168,85,247,0.12) 0%, transparent 22%)",
        }}
      >
        <motion.span
          className="pointer-events-none absolute bottom-7 left-7 text-5xl text-white/45"
          aria-hidden
          animate={{ x: [0, -4, 0], opacity: [0.4, 0.7, 0.4] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
          style={{
            textShadow:
              "0 0 12px rgba(168,85,247,0.6), 0 2px 6px rgba(0,0,0,0.7)",
          }}
        >
          ◀
        </motion.span>
      </button>
      <button
        type="button"
        aria-label="오른쪽"
        className="group absolute right-0 top-0 z-20 h-full w-1/2"
        onPointerDown={(e) => {
          e.preventDefault();
          handleInput("R");
        }}
        style={{
          background:
            "linear-gradient(to top, rgba(236,72,153,0.12) 0%, transparent 22%)",
        }}
      >
        <motion.span
          className="pointer-events-none absolute bottom-7 right-7 text-5xl text-white/45"
          aria-hidden
          animate={{ x: [0, 4, 0], opacity: [0.4, 0.7, 0.4] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
          style={{
            textShadow:
              "0 0 12px rgba(236,72,153,0.6), 0 2px 6px rgba(0,0,0,0.7)",
          }}
        >
          ▶
        </motion.span>
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
            maxCombo={maxCombo}
            monsterNickname={monsterNickname}
            adminMode={adminMode}
            onRetry={adminMode || remainingBefore > 1 ? startGame : null}
            onHome={() => router.push(homeHref)}
            onEvolutionContinue={() => router.push("/me/onboarding")}
          />
        )}
      </AnimatePresence>
    </main>
  );
}

// ============== 계단 컬럼 + 캐릭터 ==============

// 상단 목숨 표시 — 채워진 ❤️ + 잃은 자리는 흐린 회색 (subtle).
function Hearts({ lives, max }: { lives: number; max: number }) {
  return (
    <div
      className="flex items-center gap-1"
      aria-label={`목숨 ${lives} / ${max}`}
    >
      {Array.from({ length: max }).map((_, i) => {
        const filled = i < lives;
        return (
          <motion.span
            key={i}
            className="text-lg leading-none"
            initial={false}
            animate={{
              scale: filled ? 1 : 0.78,
              opacity: filled ? 1 : 0.22,
            }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            style={{
              filter: filled
                ? "drop-shadow(0 0 6px rgba(244,63,94,0.7))"
                : "grayscale(1)",
            }}
          >
            ❤️
          </motion.span>
        );
      })}
    </div>
  );
}

function StairColumn({
  stairs,
  score,
  climbing,
  damaged,
}: {
  stairs: Side[];
  score: number;
  climbing: boolean;
  damaged: boolean;
}) {
  const visible = stairs.slice(0, 9);
  // 계단 크기 80%로 축소 (사용자 피드백): 폭 42→34%, 높이 8→6.5%, 간격 9→7.5%.
  const stairBottomStartPct = 16;
  const stairStepPct = 7.5;
  const stairHeightPct = 6.5;
  const stairWidthPct = 34;
  // 계단의 좌/우 중앙(%) — 캐릭터 위치 보간에 사용.
  const stairCenterL = 6 + stairWidthPct / 2; // 23
  const stairCenterR = 100 - 6 - stairWidthPct / 2; // 77
  // climbing 중에는 캐릭터가 다음 계단(stairs[1]) 쪽에 서 있어야 함.
  const charSide = climbing ? stairs[1] : stairs[0];

  return (
    <div className="absolute inset-0">
      {/* 계단 컨테이너 — climbing 중에는 한 칸만큼 아래로 평행이동(스크롤 다운) */}
      <motion.div
        className="absolute inset-0"
        animate={{ y: climbing ? `${stairStepPct}%` : "0%" }}
        transition={{
          duration: climbing ? 0.11 : 0, // 복귀는 즉시(snap)
          ease: "easeOut",
        }}
      >
        {visible.map((side, i) => {
          const bottom = stairBottomStartPct + i * stairStepPct;
          const scale = Math.max(0.78, 1 - i * 0.03);
          const opacity = Math.max(0.42, 1 - i * 0.07);
          return (
            <div
              // ★ 안정 키 — 큐 시프트 시 같은 논리 위치의 요소가 같은 키를 유지해
              //   React 가 DOM 을 재활용 → 한 칸 오를 때 깜빡임/뚝뚝 끊김 방지.
              key={`stair-${score + i}`}
              className="absolute"
              style={{
                width: `${stairWidthPct}%`,
                height: `${stairHeightPct}%`,
                bottom: `${bottom}%`,
                ...(side === "L" ? { left: "6%" } : { right: "6%" }),
                opacity,
                transform: `scale(${scale})`,
                transformOrigin: side === "L" ? "left bottom" : "right bottom",
              }}
            >
              <Stair side={side} />
            </div>
          );
        })}
      </motion.div>

      {/* 캐릭터 — 가장 아래 계단 위.
          ★ left/right 토글(auto) 방식은 framer-motion 이 보간을 못 해 좌↔우가
            순간이동했다. 항상 left(%) 하나로만 애니메이션해 부드럽게 미끄러진다.
            계단 중앙(23%/77%)에 캐릭터 중심을 정확히 맞추도록 안쪽에서 -50% 평행이동. */}
      <motion.div
        className="absolute"
        animate={{ left: `${charSide === "L" ? stairCenterL : stairCenterR}%` }}
        transition={{ duration: 0.18, ease: "easeOut" }}
        style={{ bottom: `${stairBottomStartPct + stairHeightPct}%` }}
      >
        <div style={{ transform: "translateX(-50%)" }}>
          {/* 피격 깜빡임 — damaged 켜진 동안 opacity 진동 */}
          <motion.div
            animate={
              damaged
                ? { opacity: [1, 0.2, 1, 0.2, 1, 0.25, 1] }
                : { opacity: 1 }
            }
            transition={{ duration: damaged ? 0.7 : 0.1 }}
          >
          {/* 점프 효과 — 매 칸 재마운트(=깜빡임/뚝뚝) 방지 위해 key={score}/initial 제거.
              위아래로 살짝 튀는 idle 바운스만 끊김 없이 계속. */}
          <motion.div
            animate={{ y: [0, -4, 0] }}
            transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
            className="relative flex h-24 w-24 items-end justify-center"
          >
          {/* 후광(halo) — 어두운 배경에 묻히지 않도록 캐릭터 뒤에 핑크/퍼플 글로우. */}
          <div
            aria-hidden
            className="pointer-events-none absolute bottom-1 left-1/2 h-28 w-28 -translate-x-1/2 rounded-full"
            style={{
              background:
                "radial-gradient(circle, rgba(244,114,182,0.42) 0%, rgba(168,85,247,0.18) 50%, transparent 75%)",
              filter: "blur(6px)",
            }}
          />
          {/* 발 그림자 — 계단 위에 또렷이 서 있는 느낌. */}
          <div
            aria-hidden
            className="absolute -bottom-1 left-1/2 h-2.5 w-16 -translate-x-1/2 rounded-full bg-black/60 blur-md"
          />
          <span
            className="relative leading-none"
            style={{
              fontSize: "4.5rem",
              filter:
                "drop-shadow(0 10px 18px rgba(0,0,0,0.6)) drop-shadow(0 0 22px rgba(244,114,182,0.55))",
            }}
          >
            {CHARACTER_EMOJI}
          </span>
          </motion.div>
          </motion.div>
        </div>
      </motion.div>
    </div>
  );
}

// 입체감 있는 계단 블록 — 윗면 + 측면 + 정면 + 하이라이트 + 그림자.
function Stair({ side }: { side: Side }) {
  const topColor =
    side === "L"
      ? "linear-gradient(180deg, #d8b4fe 0%, #a855f7 70%, #7c3aed 100%)"
      : "linear-gradient(180deg, #fbcfe8 0%, #ec4899 60%, #be185d 100%)";
  const sideColor =
    side === "L"
      ? "linear-gradient(180deg, #6d28d9 0%, #4c1d95 100%)"
      : "linear-gradient(180deg, #9d174d 0%, #500724 100%)";

  return (
    <div className="relative h-full w-full">
      {/* 측면 (depth) — 계단 뒤쪽 살짝 두꺼운 느낌 */}
      <div
        aria-hidden
        className="absolute inset-x-0 bottom-0 h-[55%] rounded-b-xl"
        style={{
          background: sideColor,
          transform: "translateY(20%)",
          filter: "blur(0.5px)",
        }}
      />
      {/* 윗면 — 계단 본체 */}
      <div
        className="absolute inset-0 rounded-xl border border-white/20"
        style={{
          background: topColor,
          boxShadow:
            "0 8px 16px rgba(0,0,0,0.45), 0 0 24px rgba(168,85,247,0.2)",
        }}
      >
        {/* 위쪽 하이라이트 라인 */}
        <div
          aria-hidden
          className="absolute inset-x-2 top-1 h-[2px] rounded-full"
          style={{
            background:
              "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.7) 50%, transparent 100%)",
          }}
        />
        {/* 작은 별 장식 — 가운데 살짝 */}
        <span
          aria-hidden
          className="absolute right-3 top-1.5 text-[10px] text-white/45"
        >
          ✦
        </span>
      </div>
    </div>
  );
}

// ============== 결과 오버레이 ==============

function ResultOverlay({
  result,
  submitting,
  score,
  maxCombo,
  monsterNickname,
  adminMode,
  onRetry,
  onHome,
  onEvolutionContinue,
}: {
  result: InfiniteStairsResult | null;
  submitting: boolean;
  score: number;
  maxCombo: number;
  monsterNickname: string;
  adminMode: boolean;
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
        ) : adminMode ? (
          <>
            <div className="text-2xl font-extrabold text-white">GAME OVER</div>
            <div className="mt-1 inline-block rounded-full border border-amber-400/40 bg-amber-500/15 px-3 py-1 text-[11px] font-bold text-amber-100">
              🛠 테스트 모드 — 기록 저장 안 됨
            </div>
            <div className="mt-4 rounded-xl bg-white/[0.05] p-4">
              <div className="text-xs text-white/55">최종 점수</div>
              <div className="text-5xl font-extrabold text-pink-300">
                {score}
              </div>
            </div>
            {maxCombo >= 3 && (
              <div className="mt-2 flex items-center justify-center gap-2 text-sm text-yellow-200">
                <span aria-hidden>🔥</span>
                <span className="font-bold">최고 콤보 ×{maxCombo}</span>
              </div>
            )}
            <div className="mt-5 flex flex-col gap-2">
              {onRetry && (
                <button
                  type="button"
                  onClick={onRetry}
                  className="rounded-full bg-gradient-to-r from-pink-500 to-fuchsia-500 px-5 py-3 text-base font-extrabold text-white shadow-[0_6px_18px_rgba(244,114,182,0.45)] active:scale-95"
                >
                  ↻ 다시하기
                </button>
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

            {maxCombo >= 3 && (
              <div className="mt-2 flex items-center justify-center gap-2 text-sm text-yellow-200">
                <span aria-hidden>🔥</span>
                <span className="font-bold">최고 콤보 ×{maxCombo}</span>
              </div>
            )}

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
