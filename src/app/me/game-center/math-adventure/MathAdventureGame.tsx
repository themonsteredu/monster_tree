"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  recordMathAdventurePlayAction,
  type PlayResult,
} from "../actions";

type Phase = "ready" | "playing" | "quiz" | "over";
type Question = {
  prompt: string;
  choices: number[];
  answer: number;
  x: number;
};

type Props = {
  remainingBefore: number;
  monsterNickname: string;
  adminMode?: boolean;
  homeHref?: string;
};

const STARTING_LIVES = 3;
const WORLD_WIDTH = 4200;
const FINISH_X = 3970;
const PLAYER_SPEED = 255;

const QUESTIONS: Question[] = [
  { prompt: "7 + 5", choices: [10, 11, 12, 13], answer: 12, x: 520 },
  { prompt: "18 - 9", choices: [7, 8, 9, 10], answer: 9, x: 970 },
  { prompt: "6 × 4", choices: [20, 22, 24, 26], answer: 24, x: 1420 },
  { prompt: "35 ÷ 5", choices: [5, 6, 7, 8], answer: 7, x: 1870 },
  { prompt: "27 + 16", choices: [41, 42, 43, 44], answer: 43, x: 2320 },
  { prompt: "50 - 23", choices: [25, 26, 27, 28], answer: 27, x: 2770 },
  { prompt: "8 × 7", choices: [54, 55, 56, 57], answer: 56, x: 3220 },
  { prompt: "72 ÷ 8", choices: [7, 8, 9, 10], answer: 9, x: 3620 },
];

const COINS = [260, 350, 710, 810, 1150, 1260, 1600, 1710, 2050, 2160, 2500, 2610, 2950, 3060, 3400, 3500, 3800];
const MONSTERS = [760, 1210, 1660, 2110, 2560, 3010, 3460];

export function MathAdventureGame({
  remainingBefore,
  monsterNickname,
  adminMode = false,
  homeHref = "/me/game-center",
}: Props) {
  const [phase, setPhase] = useState<Phase>("ready");
  const [visual, setVisual] = useState({ x: 90, camera: 0 });
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(STARTING_LIVES);
  const [combo, setCombo] = useState(0);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [feedback, setFeedback] = useState<"correct" | "wrong" | null>(null);
  const [collectedCoins, setCollectedCoins] = useState<number[]>([]);
  const [defeatedMonsters, setDefeatedMonsters] = useState<number[]>([]);
  const [jumpNonce, setJumpNonce] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [cleared, setCleared] = useState(false);
  const [result, setResult] = useState<PlayResult | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const viewportRef = useRef<HTMLDivElement>(null);
  const widthRef = useRef(390);
  const phaseRef = useRef<Phase>(phase);
  const playerXRef = useRef(90);
  const scoreRef = useRef(0);
  const livesRef = useRef(STARTING_LIVES);
  const comboRef = useRef(0);
  const questionIndexRef = useRef(0);
  const collectedRef = useRef(new Set<number>());
  const defeatedRef = useRef(new Set<number>());
  const controlsRef = useRef({ left: false, right: false });
  const jumpUntilRef = useRef(0);
  const invincibleUntilRef = useRef(0);
  const startedAtRef = useRef(0);
  const lastFrameRef = useRef(0);
  const lastPaintRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const finishingRef = useRef(false);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const update = () => {
      widthRef.current = el.getBoundingClientRect().width;
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const stopLoop = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  const paint = useCallback((x: number) => {
    const camera = Math.max(
      0,
      Math.min(WORLD_WIDTH - widthRef.current, x - widthRef.current * 0.34),
    );
    setVisual({ x, camera });
  }, []);

  const submitResult = useCallback(
    async (didClear: boolean) => {
      if (finishingRef.current) return;
      finishingRef.current = true;
      stopLoop();
      controlsRef.current = { left: false, right: false };

      const seconds = Math.floor((Date.now() - startedAtRef.current) / 1000);
      const timeBonus = didClear ? Math.max(0, 180 - seconds) * 2 : 0;
      const lifeBonus = didClear ? livesRef.current * 100 : 0;
      const clearBonus = didClear ? 500 : 0;
      const finalScore = Math.min(
        5000,
        Math.max(0, Math.floor(scoreRef.current + timeBonus + lifeBonus + clearBonus)),
      );

      scoreRef.current = finalScore;
      setScore(finalScore);
      setElapsed(seconds);
      setCleared(didClear);
      setSubmitting(true);

      if (adminMode) {
        setResult(null);
        setSubmitting(false);
        setPhase("over");
        return;
      }

      try {
        const saved = await recordMathAdventurePlayAction({ score: finalScore });
        setResult(saved);
      } catch {
        setResult({
          ok: false,
          reason: "invalid",
          message: "네트워크 오류로 기록을 저장하지 못했어요.",
        });
      } finally {
        setSubmitting(false);
        setPhase("over");
      }
    },
    [adminMode, stopLoop],
  );

  const loseLife = useCallback(() => {
    const now = Date.now();
    if (now < invincibleUntilRef.current || phaseRef.current !== "playing") return;
    invincibleUntilRef.current = now + 1100;
    const nextLives = livesRef.current - 1;
    livesRef.current = nextLives;
    setLives(nextLives);
    comboRef.current = 0;
    setCombo(0);
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate?.(80);
    }
    if (nextLives <= 0) {
      void submitResult(false);
      return;
    }
    playerXRef.current = Math.max(90, playerXRef.current - 130);
    paint(playerXRef.current);
  }, [paint, submitResult]);

  const loop = useCallback(
    (now: number) => {
      if (phaseRef.current !== "playing") return;
      const last = lastFrameRef.current || now;
      const dt = Math.min((now - last) / 1000, 0.05);
      lastFrameRef.current = now;

      let nextX = playerXRef.current;
      if (controlsRef.current.left) nextX -= PLAYER_SPEED * dt;
      if (controlsRef.current.right) nextX += PLAYER_SPEED * dt;
      nextX = Math.max(45, Math.min(FINISH_X + 40, nextX));

      const qIndex = questionIndexRef.current;
      const nextQuestion = QUESTIONS[qIndex];
      if (nextQuestion && nextX >= nextQuestion.x - 108) {
        nextX = nextQuestion.x - 108;
        playerXRef.current = nextX;
        controlsRef.current = { left: false, right: false };
        phaseRef.current = "quiz";
        setPhase("quiz");
        paint(nextX);
        return;
      }

      for (const coinX of COINS) {
        if (!collectedRef.current.has(coinX) && Math.abs(nextX - coinX) < 27) {
          collectedRef.current.add(coinX);
          setCollectedCoins(Array.from(collectedRef.current));
          scoreRef.current += 25;
          setScore(scoreRef.current);
        }
      }

      for (const monsterX of MONSTERS) {
        if (defeatedRef.current.has(monsterX) || Math.abs(nextX - monsterX) >= 40) {
          continue;
        }
        if (Date.now() < jumpUntilRef.current) {
          defeatedRef.current.add(monsterX);
          setDefeatedMonsters(Array.from(defeatedRef.current));
          scoreRef.current += 50;
          setScore(scoreRef.current);
        } else {
          loseLife();
        }
      }

      playerXRef.current = nextX;
      if (nextX >= FINISH_X) {
        void submitResult(true);
        return;
      }

      if (now - lastPaintRef.current > 32) {
        lastPaintRef.current = now;
        paint(nextX);
        setElapsed(Math.floor((Date.now() - startedAtRef.current) / 1000));
      }
      rafRef.current = requestAnimationFrame(loop);
    },
    [loseLife, paint, submitResult],
  );

  const startGame = useCallback(() => {
    stopLoop();
    finishingRef.current = false;
    playerXRef.current = 90;
    scoreRef.current = 0;
    livesRef.current = STARTING_LIVES;
    comboRef.current = 0;
    questionIndexRef.current = 0;
    collectedRef.current = new Set<number>();
    defeatedRef.current = new Set<number>();
    controlsRef.current = { left: false, right: false };
    jumpUntilRef.current = 0;
    invincibleUntilRef.current = 0;
    startedAtRef.current = Date.now();
    lastFrameRef.current = 0;
    lastPaintRef.current = 0;
    setVisual({ x: 90, camera: 0 });
    setScore(0);
    setLives(STARTING_LIVES);
    setCombo(0);
    setQuestionIndex(0);
    setCollectedCoins([]);
    setDefeatedMonsters([]);
    setFeedback(null);
    setElapsed(0);
    setCleared(false);
    setResult(null);
    setPhase("playing");
    phaseRef.current = "playing";
    rafRef.current = requestAnimationFrame(loop);
  }, [loop, stopLoop]);

  const jump = useCallback(() => {
    if (phaseRef.current !== "playing") return;
    jumpUntilRef.current = Date.now() + 560;
    setJumpNonce((v) => v + 1);
  }, []);

  const answerQuestion = useCallback(
    (choice: number) => {
      if (feedback) return;
      const current = QUESTIONS[questionIndexRef.current];
      if (!current) return;

      if (choice === current.answer) {
        setFeedback("correct");
        const nextCombo = comboRef.current + 1;
        comboRef.current = nextCombo;
        setCombo(nextCombo);
        scoreRef.current += 100 + Math.min(nextCombo, 5) * 20;
        setScore(scoreRef.current);
        window.setTimeout(() => {
          const nextIndex = questionIndexRef.current + 1;
          questionIndexRef.current = nextIndex;
          setQuestionIndex(nextIndex);
          playerXRef.current = current.x + 55;
          paint(playerXRef.current);
          setFeedback(null);
          setPhase("playing");
          phaseRef.current = "playing";
          lastFrameRef.current = 0;
          rafRef.current = requestAnimationFrame(loop);
        }, 650);
      } else {
        setFeedback("wrong");
        const nextLives = livesRef.current - 1;
        livesRef.current = nextLives;
        setLives(nextLives);
        comboRef.current = 0;
        setCombo(0);
        if (typeof navigator !== "undefined" && "vibrate" in navigator) {
          navigator.vibrate?.(80);
        }
        window.setTimeout(() => {
          setFeedback(null);
          if (nextLives <= 0) {
            void submitResult(false);
            return;
          }
          playerXRef.current = current.x - 140;
          paint(playerXRef.current);
          setPhase("playing");
          phaseRef.current = "playing";
          lastFrameRef.current = 0;
          rafRef.current = requestAnimationFrame(loop);
        }, 750);
      }
    },
    [feedback, loop, paint, submitResult],
  );

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (phaseRef.current === "ready" && (e.key === "Enter" || e.key === " ")) {
        e.preventDefault();
        startGame();
        return;
      }
      if (phaseRef.current !== "playing") return;
      if (e.key === "ArrowLeft") controlsRef.current.left = true;
      if (e.key === "ArrowRight") controlsRef.current.right = true;
      if (e.key === "ArrowUp" || e.key === " ") jump();
    };
    const up = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") controlsRef.current.left = false;
      if (e.key === "ArrowRight") controlsRef.current.right = false;
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [jump, startGame]);

  useEffect(() => {
    return () => stopLoop();
  }, [stopLoop]);

  const currentQuestion = QUESTIONS[questionIndex];
  const progress = Math.min(100, Math.round((visual.x / FINISH_X) * 100));
  const worldTransform = `translate3d(${-visual.camera}px, 0, 0)`;
  const playerScreenX = visual.x - visual.camera;
  const remainingAfter = result?.ok ? result.remainingToday : Math.max(remainingBefore - 1, 0);

  const hearts = useMemo(
    () => Array.from({ length: STARTING_LIVES }, (_, i) => (i < lives ? "❤️" : "🖤")),
    [lives],
  );

  return (
    <main
      className="relative h-[100dvh] w-full select-none overflow-hidden bg-[#74c7f3] text-white"
      style={{ fontFamily: "'Jua', 'Pretendard Variable', sans-serif", touchAction: "none" }}
    >
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Jua&display=swap" />

      {adminMode && (
        <div className="pointer-events-none absolute inset-x-0 top-0 z-[80] flex justify-center">
          <span className="rounded-b-xl border border-t-0 border-amber-300/60 bg-amber-500/90 px-3 py-1 text-[11px] font-bold text-white shadow-lg">
            🛠 테스트 모드 · 기록 저장 안 됨
          </span>
        </div>
      )}

      <div className={`absolute inset-x-0 top-0 z-50 px-3 ${adminMode ? "pt-9" : "pt-3"}`}>
        <div className="mx-auto flex max-w-lg items-center justify-between gap-2 rounded-2xl border-2 border-white/50 bg-slate-900/75 px-3 py-2 shadow-lg">
          <Link href={homeHref} className="rounded-full bg-white/15 px-3 py-1.5 text-xs font-bold active:scale-95">
            ← 나가기
          </Link>
          <div className="text-sm tracking-tight">{hearts.join(" ")}</div>
          <div className="flex items-center gap-3 text-right">
            <div>
              <div className="text-[9px] tracking-widest text-white/60">TIME</div>
              <div className="text-lg font-black leading-none">{elapsed}</div>
            </div>
            <div>
              <div className="text-[9px] tracking-widest text-white/60">SCORE</div>
              <div className="text-xl font-black leading-none text-yellow-300">{score}</div>
            </div>
          </div>
        </div>
        <div className="mx-auto mt-2 h-2 max-w-lg overflow-hidden rounded-full border border-white/60 bg-black/25">
          <div className="h-full rounded-full bg-gradient-to-r from-yellow-300 via-orange-400 to-pink-500 transition-[width]" style={{ width: `${progress}%` }} />
        </div>
      </div>

      <div ref={viewportRef} className="absolute inset-0 overflow-hidden">
        <div className="absolute inset-0 bg-[linear-gradient(#76c9f5_0%,#c8efff_62%,#8ad660_62%,#5ba63a_100%)]" />
        <div className="absolute left-[6%] top-[19%] text-5xl opacity-90">☁️</div>
        <div className="absolute left-[58%] top-[25%] text-4xl opacity-80">☁️</div>
        <div className="absolute right-[5%] top-[14%] text-5xl opacity-90">☁️</div>

        <div className="absolute bottom-[28%] left-0 h-32 w-full opacity-60" style={{ background: "repeating-linear-gradient(120deg, transparent 0 85px, #5e9fc9 86px 165px, transparent 166px 245px)" }} />

        <div className="absolute bottom-0 left-0 h-[38%]" style={{ width: WORLD_WIDTH, transform: worldTransform, willChange: "transform" }}>
          <div className="absolute inset-x-0 bottom-0 h-[42%] border-t-8 border-[#66bd3d] bg-[repeating-linear-gradient(90deg,#7c4929_0_42px,#8f5530_42px_84px)] shadow-[inset_0_12px_0_#4c8f2f]" />

          {QUESTIONS.map((q, index) => {
            const solved = index < questionIndex;
            return (
              <div key={q.x} className="absolute bottom-[58%]" style={{ left: q.x }}>
                <div className={`flex h-16 w-16 items-center justify-center border-4 border-[#713812] text-3xl font-black shadow-[inset_0_0_0_4px_rgba(255,255,255,0.18),0_6px_0_#4b2710] ${solved ? "bg-emerald-500" : "bg-[#e99024]"}`}>
                  {solved ? "✓" : "?"}
                </div>
                {!solved && index === questionIndex && (
                  <div className="absolute -left-8 -top-10 whitespace-nowrap rounded-lg border-2 border-slate-800 bg-white px-2 py-1 text-xs font-bold text-slate-900 shadow-lg">
                    문제 블록!
                  </div>
                )}
              </div>
            );
          })}

          {COINS.map((x, i) => !collectedCoins.includes(x) && (
            <motion.div key={x} className="absolute bottom-[48%] text-3xl" style={{ left: x }} animate={{ y: [0, -8, 0], rotateY: [0, 180, 360] }} transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.05 }}>
              🪙
            </motion.div>
          ))}

          {MONSTERS.map((x, i) => !defeatedMonsters.includes(x) && (
            <motion.div key={x} className="absolute bottom-[34%] text-4xl" style={{ left: x }} animate={{ x: [0, 24, 0] }} transition={{ duration: 1.6, repeat: Infinity, delay: i * 0.1 }}>
              {i % 2 === 0 ? "👾" : "🐛"}
            </motion.div>
          ))}

          <div className="absolute bottom-[34%]" style={{ left: FINISH_X }}>
            <div className="relative h-48 w-28">
              <div className="absolute bottom-0 left-0 h-36 w-24 border-4 border-slate-900 bg-slate-600 shadow-[inset_0_0_0_5px_#94a3b8]">
                <div className="mx-auto mt-14 h-20 w-12 rounded-t-full bg-slate-900" />
              </div>
              <div className="absolute left-8 top-0 h-32 w-2 bg-slate-900" />
              <div className="absolute left-10 top-2 rounded-r-md bg-[#F26522] px-3 py-2 text-[10px] font-black leading-tight shadow-md">THE<br />MONSTER</div>
            </div>
          </div>
        </div>

        {phase !== "ready" && phase !== "over" && (
          <motion.div
            key={jumpNonce}
            className="absolute bottom-[28%] z-30"
            style={{ left: playerScreenX - 28 }}
            animate={jumpNonce > 0 ? { y: [0, -92, 0] } : { y: 0 }}
            transition={{ duration: 0.56, ease: "easeOut" }}
          >
            <div className="absolute -bottom-2 left-1/2 h-3 w-14 -translate-x-1/2 rounded-full bg-black/30 blur-sm" />
            <div className="relative text-6xl drop-shadow-[0_7px_4px_rgba(0,0,0,0.35)]">🤖</div>
          </motion.div>
        )}
      </div>

      {phase === "playing" && (
        <div className="absolute inset-x-0 bottom-4 z-60 mx-auto flex max-w-lg items-end justify-between px-5 pb-[env(safe-area-inset-bottom)]">
          <div className="flex gap-3">
            <ControlButton label="왼쪽" icon="◀" onPress={() => { controlsRef.current.left = true; }} onRelease={() => { controlsRef.current.left = false; }} />
            <ControlButton label="오른쪽" icon="▶" onPress={() => { controlsRef.current.right = true; }} onRelease={() => { controlsRef.current.right = false; }} />
          </div>
          <button type="button" onPointerDown={jump} className="flex h-20 w-20 items-center justify-center rounded-full border-4 border-white/80 bg-[#F26522] text-4xl font-black shadow-[0_8px_0_#a53c0d,0_12px_24px_rgba(0,0,0,0.3)] active:translate-y-1 active:shadow-[0_4px_0_#a53c0d]" aria-label="점프">
            ↑
          </button>
        </div>
      )}

      <AnimatePresence>
        {phase === "ready" && (
          <motion.div className="absolute inset-0 z-[100] flex items-center justify-center bg-slate-950/75 px-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="w-full max-w-sm rounded-3xl border-4 border-white bg-[#173b72] p-6 text-center shadow-2xl">
              <div className="text-6xl">🧮</div>
              <h1 className="mt-2 text-3xl font-black text-yellow-300" style={{ textShadow: "0 4px 0 #7c2d12" }}>더몬스터 수학 대모험</h1>
              <p className="mt-3 text-sm leading-relaxed text-white/85">
                좌우로 달리고 점프해 코인을 모으세요.<br />문제 블록 8개를 풀면 학원 성에 도착합니다!
              </p>
              <div className="mt-4 grid grid-cols-3 gap-2 text-xs">
                <div className="rounded-xl bg-white/10 p-2">🪙<br />+25점</div>
                <div className="rounded-xl bg-white/10 p-2">👾<br />점프 공격</div>
                <div className="rounded-xl bg-white/10 p-2">❓<br />+100점</div>
              </div>
              <button type="button" onClick={startGame} className="mt-6 w-full rounded-2xl border-2 border-yellow-200 bg-yellow-400 py-3 text-lg font-black text-slate-900 shadow-[0_6px_0_#b45309] active:translate-y-1 active:shadow-[0_3px_0_#b45309]">
                ▶ 게임 시작
              </button>
              <p className="mt-4 text-xs text-white/60">오늘 남은 횟수 · {adminMode ? "무제한" : `${remainingBefore}회`}</p>
            </div>
          </motion.div>
        )}

        {phase === "quiz" && currentQuestion && (
          <motion.div className="absolute inset-0 z-[110] flex items-center justify-center bg-slate-950/70 px-5" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.div initial={{ scale: 0.85, y: 30 }} animate={{ scale: 1, y: 0 }} className="w-full max-w-sm rounded-3xl border-4 border-slate-900 bg-[#fff8df] p-5 text-slate-900 shadow-2xl">
              <div className="flex items-center justify-between">
                <span className="rounded-full bg-emerald-600 px-3 py-1 text-xs font-black text-white">문제 {questionIndex + 1} / {QUESTIONS.length}</span>
                <span className="text-sm font-bold text-orange-600">COMBO × {combo}</span>
              </div>
              <div className="my-6 text-center text-5xl font-black tracking-tight">{currentQuestion.prompt} = ?</div>
              <div className="grid grid-cols-2 gap-3">
                {currentQuestion.choices.map((choice) => (
                  <button key={choice} type="button" disabled={feedback !== null} onClick={() => answerQuestion(choice)} className="rounded-2xl border-4 border-slate-800 bg-white py-4 text-2xl font-black shadow-[0_5px_0_#334155] active:translate-y-1 active:shadow-[0_2px_0_#334155] disabled:opacity-70">
                    {choice}
                  </button>
                ))}
              </div>
              {feedback && (
                <div className={`mt-4 rounded-xl py-3 text-center text-lg font-black ${feedback === "correct" ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}>
                  {feedback === "correct" ? "정답! 길이 열렸어요 ✨" : `아쉬워요! 정답은 ${currentQuestion.answer}`}
                </div>
              )}
            </motion.div>
          </motion.div>
        )}

        {phase === "over" && (
          <motion.div className="absolute inset-0 z-[120] flex items-center justify-center bg-slate-950/80 px-5" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <div className="w-full max-w-sm rounded-3xl border-4 border-white bg-[#173b72] p-6 text-center shadow-2xl">
              <div className="text-6xl">{cleared ? "🏰" : "💥"}</div>
              <h2 className="mt-2 text-3xl font-black text-yellow-300">{cleared ? "스테이지 클리어!" : "게임 오버"}</h2>
              <p className="mt-2 text-sm text-white/75">{cleared ? `${monsterNickname}와 함께 학원 성에 도착했어요!` : "다시 도전하면 더 멀리 갈 수 있어요."}</p>
              <div className="mt-5 grid grid-cols-3 gap-2">
                <ResultStat label="점수" value={score.toLocaleString()} />
                <ResultStat label="정답" value={`${questionIndex}/${QUESTIONS.length}`} />
                <ResultStat label="시간" value={`${elapsed}초`} />
              </div>
              <div className="mt-4 rounded-xl bg-white/10 p-3 text-sm">
                {submitting ? "기록을 저장하는 중..." : adminMode ? "테스트 모드라 기록은 저장되지 않아요." : result?.ok ? `EXP +${result.expEarned}${result.isNewBest ? " · 신기록!" : ""}` : result ? result.message : "결과를 확인했어요."}
              </div>
              <div className="mt-5 grid grid-cols-2 gap-3">
                {(adminMode || remainingAfter > 0) && (
                  <button type="button" onClick={startGame} className="rounded-2xl bg-[#F26522] py-3 font-black shadow-[0_5px_0_#9a3412] active:translate-y-1">다시 하기</button>
                )}
                <Link href={homeHref} className="flex items-center justify-center rounded-2xl bg-emerald-500 py-3 font-black shadow-[0_5px_0_#047857] active:translate-y-1">게임센터</Link>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}

function ControlButton({
  label,
  icon,
  onPress,
  onRelease,
}: {
  label: string;
  icon: string;
  onPress: () => void;
  onRelease: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); onPress(); }}
      onPointerUp={onRelease}
      onPointerCancel={onRelease}
      onPointerLeave={onRelease}
      className="flex h-18 w-18 h-[72px] w-[72px] items-center justify-center rounded-full border-4 border-white/80 bg-slate-800/90 text-3xl font-black shadow-[0_7px_0_#0f172a,0_10px_20px_rgba(0,0,0,0.3)] active:translate-y-1 active:shadow-[0_3px_0_#0f172a]"
    >
      {icon}
    </button>
  );
}

function ResultStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-white/10 p-2">
      <div className="text-[10px] tracking-widest text-white/55">{label}</div>
      <div className="mt-1 text-lg font-black text-white">{value}</div>
    </div>
  );
}
