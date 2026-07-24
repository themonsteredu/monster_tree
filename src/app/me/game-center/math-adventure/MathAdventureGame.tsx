"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  recordMathAdventurePlayAction,
  type PlayResult,
} from "../actions";

type Phase = "ready" | "playing" | "stageQuiz" | "over";
type TileKind = "ground" | "brick" | "block" | "pipe";
type Rect = { x: number; y: number; w: number; h: number; kind: TileKind };
type CoinSeed = { x: number; y: number };
type EnemySeed = { x: number; y: number; minX: number; maxX: number; speed: number };
type Quiz = { prompt: string; choices: number[]; answer: number };
type Palette = {
  sky: string;
  skyBottom: string;
  cloud: string;
  hillBack: string;
  hillFront: string;
  groundTop: string;
  groundA: string;
  groundB: string;
  brickA: string;
  brickB: string;
  pipeA: string;
  pipeB: string;
};
type Stage = {
  name: string;
  subtitle: string;
  width: number;
  startX: number;
  startY: number;
  flagX: number;
  solids: Rect[];
  coins: CoinSeed[];
  enemies: EnemySeed[];
  quiz: Quiz;
  palette: Palette;
};
type Player = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  w: number;
  h: number;
  onGround: boolean;
  facing: 1 | -1;
};
type Coin = CoinSeed & { collected: boolean };
type Enemy = EnemySeed & { vx: number; alive: boolean };

type Props = {
  remainingBefore: number;
  monsterNickname: string;
  adminMode?: boolean;
  homeHref?: string;
};

const VIEW_W = 320;
const VIEW_H = 240;
const PLAYER_W = 14;
const PLAYER_H = 20;
const MOVE_SPEED = 116;
const JUMP_SPEED = 330;
const GRAVITY = 920;
const STARTING_LIVES = 3;
const MAX_SCORE = 5000;

const DAY: Palette = {
  sky: "#5cc8ff",
  skyBottom: "#b9efff",
  cloud: "#fffdf2",
  hillBack: "#6fcf72",
  hillFront: "#3ea957",
  groundTop: "#66c84a",
  groundA: "#a65b2a",
  groundB: "#7f3f20",
  brickA: "#e7782d",
  brickB: "#9b3f1b",
  pipeA: "#22b8a4",
  pipeB: "#087d76",
};

const SUNSET: Palette = {
  sky: "#ff9d68",
  skyBottom: "#ffd6a0",
  cloud: "#fff2d2",
  hillBack: "#b68a68",
  hillFront: "#756156",
  groundTop: "#9bc847",
  groundA: "#87512f",
  groundB: "#59331f",
  brickA: "#c95a35",
  brickB: "#783322",
  pipeA: "#24a98e",
  pipeB: "#087061",
};

const NIGHT: Palette = {
  sky: "#18194c",
  skyBottom: "#39347b",
  cloud: "#b9b9dd",
  hillBack: "#403a75",
  hillFront: "#272455",
  groundTop: "#58a95a",
  groundA: "#60422e",
  groundB: "#3e291f",
  brickA: "#8b4b74",
  brickB: "#512b52",
  pipeA: "#30ad9b",
  pipeB: "#11625e",
};

function ground(x: number, w: number): Rect {
  return { x, y: 208, w, h: 32, kind: "ground" };
}
function brick(x: number, y: number, w = 16, h = 16): Rect {
  return { x, y, w, h, kind: "brick" };
}
function block(x: number, y: number): Rect {
  return { x, y, w: 16, h: 16, kind: "block" };
}
function pipe(x: number, h: number): Rect {
  return { x, y: 208 - h, w: 32, h, kind: "pipe" };
}

const STAGES: Stage[] = [
  {
    name: "WORLD 1-1",
    subtitle: "초록 언덕",
    width: 1760,
    startX: 38,
    startY: 170,
    flagX: 1648,
    palette: DAY,
    solids: [
      ground(0, 450),
      ground(510, 310),
      ground(875, 355),
      ground(1280, 480),
      brick(225, 160, 48),
      block(289, 160),
      brick(305, 160, 32),
      pipe(390, 32),
      brick(590, 144, 64),
      block(670, 144),
      pipe(760, 48),
      brick(930, 160, 48),
      block(994, 160),
      brick(1058, 128, 80),
      pipe(1182, 64),
      brick(1360, 160, 64),
      block(1440, 160),
    ],
    coins: [
      { x: 238, y: 140 }, { x: 258, y: 140 }, { x: 298, y: 138 },
      { x: 535, y: 178 }, { x: 565, y: 166 }, { x: 610, y: 122 },
      { x: 690, y: 122 }, { x: 840, y: 166 }, { x: 900, y: 176 },
      { x: 950, y: 138 }, { x: 1010, y: 138 }, { x: 1080, y: 106 },
      { x: 1160, y: 166 }, { x: 1308, y: 176 }, { x: 1378, y: 138 },
      { x: 1460, y: 138 }, { x: 1540, y: 176 },
    ],
    enemies: [
      { x: 330, y: 194, minX: 310, maxX: 370, speed: 24 },
      { x: 650, y: 194, minX: 540, maxX: 735, speed: 28 },
      { x: 1030, y: 194, minX: 900, maxX: 1150, speed: 30 },
      { x: 1480, y: 194, minX: 1300, maxX: 1590, speed: 32 },
    ],
    quiz: { prompt: "7 + 5", choices: [10, 11, 12, 13], answer: 12 },
  },
  {
    name: "WORLD 1-2",
    subtitle: "노을 벽돌길",
    width: 1940,
    startX: 38,
    startY: 170,
    flagX: 1828,
    palette: SUNSET,
    solids: [
      ground(0, 360),
      ground(425, 245),
      ground(735, 260),
      ground(1050, 330),
      ground(1445, 495),
      brick(175, 160, 80),
      block(271, 160),
      pipe(330, 48),
      brick(470, 144, 96),
      block(582, 144),
      brick(690, 176, 48),
      pipe(825, 64),
      brick(910, 128, 80),
      block(1008, 128),
      brick(1110, 160, 64),
      pipe(1270, 48),
      brick(1385, 176, 64),
      brick(1500, 144, 96),
      block(1612, 144),
      pipe(1710, 64),
    ],
    coins: [
      { x: 190, y: 138 }, { x: 215, y: 138 }, { x: 280, y: 138 },
      { x: 390, y: 158 }, { x: 490, y: 122 }, { x: 530, y: 122 },
      { x: 600, y: 122 }, { x: 700, y: 154 }, { x: 760, y: 174 },
      { x: 850, y: 122 }, { x: 930, y: 106 }, { x: 980, y: 106 },
      { x: 1080, y: 176 }, { x: 1140, y: 138 }, { x: 1220, y: 176 },
      { x: 1400, y: 154 }, { x: 1515, y: 122 }, { x: 1570, y: 122 },
      { x: 1630, y: 122 }, { x: 1760, y: 174 },
    ],
    enemies: [
      { x: 250, y: 194, minX: 220, maxX: 310, speed: 30 },
      { x: 500, y: 194, minX: 450, maxX: 640, speed: 34 },
      { x: 780, y: 194, minX: 755, maxX: 810, speed: 26 },
      { x: 1160, y: 194, minX: 1080, maxX: 1240, speed: 34 },
      { x: 1540, y: 194, minX: 1470, maxX: 1680, speed: 38 },
    ],
    quiz: { prompt: "6 × 4", choices: [20, 22, 24, 26], answer: 24 },
  },
  {
    name: "WORLD 1-3",
    subtitle: "별빛 성으로",
    width: 2100,
    startX: 38,
    startY: 170,
    flagX: 1988,
    palette: NIGHT,
    solids: [
      ground(0, 300),
      ground(360, 250),
      ground(680, 250),
      ground(1000, 270),
      ground(1340, 290),
      ground(1690, 410),
      brick(150, 160, 64),
      block(230, 160),
      brick(315, 176, 48),
      pipe(450, 64),
      brick(535, 128, 80),
      block(630, 128),
      brick(770, 160, 80),
      pipe(890, 48),
      brick(1080, 144, 96),
      block(1192, 144),
      pipe(1255, 64),
      brick(1400, 176, 64),
      brick(1510, 128, 96),
      block(1620, 128),
      pipe(1770, 80),
      brick(1840, 160, 64),
    ],
    coins: [
      { x: 165, y: 138 }, { x: 195, y: 138 }, { x: 238, y: 138 },
      { x: 330, y: 154 }, { x: 390, y: 168 }, { x: 475, y: 120 },
      { x: 550, y: 106 }, { x: 600, y: 106 }, { x: 645, y: 106 },
      { x: 710, y: 176 }, { x: 790, y: 138 }, { x: 835, y: 138 },
      { x: 950, y: 168 }, { x: 1040, y: 176 }, { x: 1100, y: 122 },
      { x: 1170, y: 122 }, { x: 1210, y: 122 }, { x: 1365, y: 176 },
      { x: 1420, y: 154 }, { x: 1530, y: 106 }, { x: 1590, y: 106 },
      { x: 1640, y: 106 }, { x: 1740, y: 176 }, { x: 1870, y: 138 },
      { x: 1930, y: 176 },
    ],
    enemies: [
      { x: 245, y: 194, minX: 220, maxX: 280, speed: 32 },
      { x: 520, y: 194, minX: 390, maxX: 580, speed: 38 },
      { x: 800, y: 194, minX: 700, maxX: 865, speed: 40 },
      { x: 1110, y: 194, minX: 1030, maxX: 1220, speed: 42 },
      { x: 1440, y: 194, minX: 1370, maxX: 1580, speed: 44 },
      { x: 1870, y: 194, minX: 1810, maxX: 1950, speed: 46 },
    ],
    quiz: { prompt: "35 ÷ 5", choices: [5, 6, 7, 8], answer: 7 },
  },
];

function intersects(a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function pixelRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

export function MathAdventureGame({
  remainingBefore,
  monsterNickname,
  adminMode = false,
  homeHref = "/me/game-center",
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const phaseRef = useRef<Phase>("ready");
  const stageIndexRef = useRef(0);
  const playerRef = useRef<Player>({ x: 38, y: 170, vx: 0, vy: 0, w: PLAYER_W, h: PLAYER_H, onGround: false, facing: 1 });
  const coinsRef = useRef<Coin[]>([]);
  const enemiesRef = useRef<Enemy[]>([]);
  const controlsRef = useRef({ left: false, right: false, jumpQueued: false });
  const cameraRef = useRef(0);
  const scoreRef = useRef(0);
  const livesRef = useRef(STARTING_LIVES);
  const coinCountRef = useRef(0);
  const startedAtRef = useRef(0);
  const lastHudPaintRef = useRef(0);
  const invincibleUntilRef = useRef(0);
  const finishingRef = useRef(false);
  const submitResultRef = useRef<(cleared: boolean) => void>(() => undefined);

  const [phase, setPhase] = useState<Phase>("ready");
  const [stageIndex, setStageIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(STARTING_LIVES);
  const [coinCount, setCoinCount] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [quizFeedback, setQuizFeedback] = useState<"correct" | "wrong" | null>(null);
  const [cleared, setCleared] = useState(false);
  const [result, setResult] = useState<PlayResult | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const currentStage = STAGES[stageIndex];
  const hearts = useMemo(
    () => Array.from({ length: STARTING_LIVES }, (_, i) => (i < lives ? "♥" : "♡")),
    [lives],
  );

  const syncPhase = useCallback((next: Phase) => {
    phaseRef.current = next;
    setPhase(next);
  }, []);

  const loadStage = useCallback((index: number, startImmediately = true) => {
    const stage = STAGES[index];
    stageIndexRef.current = index;
    setStageIndex(index);
    playerRef.current = {
      x: stage.startX,
      y: stage.startY,
      vx: 0,
      vy: 0,
      w: PLAYER_W,
      h: PLAYER_H,
      onGround: false,
      facing: 1,
    };
    coinsRef.current = stage.coins.map((coin) => ({ ...coin, collected: false }));
    enemiesRef.current = stage.enemies.map((enemy) => ({ ...enemy, vx: enemy.speed, alive: true }));
    cameraRef.current = 0;
    controlsRef.current = { left: false, right: false, jumpQueued: false };
    invincibleUntilRef.current = 0;
    setQuizFeedback(null);
    if (startImmediately) syncPhase("playing");
  }, [syncPhase]);

  const submitResult = useCallback(async (didClear: boolean) => {
    if (finishingRef.current) return;
    finishingRef.current = true;
    controlsRef.current = { left: false, right: false, jumpQueued: false };
    const seconds = Math.max(1, Math.floor((Date.now() - startedAtRef.current) / 1000));
    const clearBonus = didClear ? 900 : 0;
    const lifeBonus = didClear ? livesRef.current * 120 : 0;
    const timeBonus = didClear ? Math.max(0, 420 - seconds) : 0;
    const finalScore = clamp(Math.floor(scoreRef.current + clearBonus + lifeBonus + timeBonus), 0, MAX_SCORE);
    scoreRef.current = finalScore;
    setScore(finalScore);
    setElapsed(seconds);
    setCleared(didClear);
    setSubmitting(true);
    syncPhase("over");

    if (adminMode) {
      setSubmitting(false);
      return;
    }

    try {
      const saved = await recordMathAdventurePlayAction({ score: finalScore });
      setResult(saved);
    } catch {
      setResult({ ok: false, reason: "invalid", message: "네트워크 오류로 기록을 저장하지 못했어요." });
    } finally {
      setSubmitting(false);
    }
  }, [adminMode, syncPhase]);

  useEffect(() => {
    submitResultRef.current = (didClear: boolean) => {
      void submitResult(didClear);
    };
  }, [submitResult]);

  const startGame = useCallback(() => {
    finishingRef.current = false;
    scoreRef.current = 0;
    livesRef.current = STARTING_LIVES;
    coinCountRef.current = 0;
    startedAtRef.current = Date.now();
    setScore(0);
    setLives(STARTING_LIVES);
    setCoinCount(0);
    setElapsed(0);
    setCleared(false);
    setResult(null);
    setSubmitting(false);
    loadStage(0, true);
  }, [loadStage]);

  const answerStageQuiz = useCallback((choice: number) => {
    if (quizFeedback) return;
    const stage = STAGES[stageIndexRef.current];
    if (choice !== stage.quiz.answer) {
      setQuizFeedback("wrong");
      window.setTimeout(() => setQuizFeedback(null), 650);
      return;
    }

    setQuizFeedback("correct");
    scoreRef.current = clamp(scoreRef.current + 250, 0, MAX_SCORE);
    setScore(scoreRef.current);
    window.setTimeout(() => {
      const next = stageIndexRef.current + 1;
      if (next >= STAGES.length) {
        submitResultRef.current(true);
      } else {
        loadStage(next, true);
      }
    }, 700);
  }, [loadStage, quizFeedback]);

  const pressControl = (key: "left" | "right") => {
    if (phaseRef.current !== "playing") return;
    controlsRef.current[key] = true;
  };
  const releaseControl = (key: "left" | "right") => {
    controlsRef.current[key] = false;
  };
  const queueJump = () => {
    if (phaseRef.current !== "playing") return;
    controlsRef.current.jumpQueued = true;
  };

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (phaseRef.current === "ready" && (event.key === "Enter" || event.key === " ")) {
        event.preventDefault();
        startGame();
        return;
      }
      if (phaseRef.current !== "playing") return;
      if (event.key === "ArrowLeft" || event.key.toLowerCase() === "a") {
        event.preventDefault();
        controlsRef.current.left = true;
      }
      if (event.key === "ArrowRight" || event.key.toLowerCase() === "d") {
        event.preventDefault();
        controlsRef.current.right = true;
      }
      if (event.key === "ArrowUp" || event.key === " ") {
        event.preventDefault();
        controlsRef.current.jumpQueued = true;
      }
    };
    const up = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft" || event.key.toLowerCase() === "a") controlsRef.current.left = false;
      if (event.key === "ArrowRight" || event.key.toLowerCase() === "d") controlsRef.current.right = false;
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [startGame]);

  useEffect(() => {
    loadStage(0, false);
  }, [loadStage]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    let animationFrame = 0;
    let lastFrame = 0;

    const addScore = (amount: number) => {
      scoreRef.current = clamp(scoreRef.current + amount, 0, MAX_SCORE);
      setScore(scoreRef.current);
    };

    const resetAfterDamage = (now: number) => {
      const stage = STAGES[stageIndexRef.current];
      const nextLives = livesRef.current - 1;
      livesRef.current = nextLives;
      setLives(nextLives);
      if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate?.(90);
      if (nextLives <= 0) {
        submitResultRef.current(false);
        return;
      }
      invincibleUntilRef.current = now + 1300;
      playerRef.current.x = stage.startX;
      playerRef.current.y = stage.startY;
      playerRef.current.vx = 0;
      playerRef.current.vy = 0;
      cameraRef.current = 0;
    };

    const update = (now: number, dt: number) => {
      if (phaseRef.current !== "playing") return;
      const stage = STAGES[stageIndexRef.current];
      const player = playerRef.current;
      const previous = { x: player.x, y: player.y, w: player.w, h: player.h };
      const controls = controlsRef.current;

      if (controls.left === controls.right) player.vx *= Math.pow(0.0008, dt);
      else if (controls.left) {
        player.vx = -MOVE_SPEED;
        player.facing = -1;
      } else {
        player.vx = MOVE_SPEED;
        player.facing = 1;
      }

      if (controls.jumpQueued) {
        controls.jumpQueued = false;
        if (player.onGround) {
          player.vy = -JUMP_SPEED;
          player.onGround = false;
        }
      }

      player.vy = Math.min(player.vy + GRAVITY * dt, 540);
      player.x += player.vx * dt;
      player.x = clamp(player.x, 0, stage.width - player.w);

      for (const solid of stage.solids) {
        if (!intersects(player, solid)) continue;
        if (player.vx > 0 && previous.x + previous.w <= solid.x + 3) player.x = solid.x - player.w;
        else if (player.vx < 0 && previous.x >= solid.x + solid.w - 3) player.x = solid.x + solid.w;
      }

      player.y += player.vy * dt;
      player.onGround = false;
      for (const solid of stage.solids) {
        if (!intersects(player, solid)) continue;
        const previousBottom = previous.y + previous.h;
        if (player.vy >= 0 && previousBottom <= solid.y + 5) {
          player.y = solid.y - player.h;
          player.vy = 0;
          player.onGround = true;
        } else if (player.vy < 0 && previous.y >= solid.y + solid.h - 5) {
          player.y = solid.y + solid.h;
          player.vy = 0;
          if (solid.kind === "block") addScore(20);
        }
      }

      if (player.y > VIEW_H + 36) {
        resetAfterDamage(now);
        return;
      }

      for (const coin of coinsRef.current) {
        if (coin.collected) continue;
        if (intersects(player, { x: coin.x - 5, y: coin.y - 7, w: 10, h: 14 })) {
          coin.collected = true;
          coinCountRef.current += 1;
          setCoinCount(coinCountRef.current);
          addScore(30);
        }
      }

      for (const enemy of enemiesRef.current) {
        if (!enemy.alive) continue;
        enemy.x += enemy.vx * dt;
        if (enemy.x <= enemy.minX) {
          enemy.x = enemy.minX;
          enemy.vx = Math.abs(enemy.speed);
        } else if (enemy.x >= enemy.maxX) {
          enemy.x = enemy.maxX;
          enemy.vx = -Math.abs(enemy.speed);
        }
        const enemyBox = { x: enemy.x, y: enemy.y, w: 14, h: 14 };
        if (!intersects(player, enemyBox)) continue;
        const previousBottom = previous.y + previous.h;
        if (player.vy > 35 && previousBottom <= enemy.y + 5) {
          enemy.alive = false;
          player.vy = -205;
          addScore(100);
        } else if (now >= invincibleUntilRef.current) {
          resetAfterDamage(now);
          return;
        }
      }

      if (player.x + player.w >= stage.flagX) {
        controlsRef.current = { left: false, right: false, jumpQueued: false };
        player.vx = 0;
        addScore(180);
        syncPhase("stageQuiz");
      }

      cameraRef.current = clamp(player.x - 112, 0, stage.width - VIEW_W);
      if (now - lastHudPaintRef.current > 250) {
        lastHudPaintRef.current = now;
        setElapsed(Math.max(0, Math.floor((Date.now() - startedAtRef.current) / 1000)));
      }
    };

    const drawCloud = (x: number, y: number, palette: Palette) => {
      pixelRect(ctx, x + 8, y, 20, 6, palette.cloud);
      pixelRect(ctx, x, y + 6, 38, 8, palette.cloud);
      pixelRect(ctx, x + 6, y + 14, 28, 4, palette.cloud);
    };

    const drawBackground = (stage: Stage, camera: number) => {
      const gradient = ctx.createLinearGradient(0, 0, 0, VIEW_H);
      gradient.addColorStop(0, stage.palette.sky);
      gradient.addColorStop(1, stage.palette.skyBottom);
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);

      if (stage.palette === NIGHT) {
        for (let i = 0; i < 22; i += 1) {
          const sx = ((i * 71 - camera * 0.08) % 360 + 360) % 360;
          const sy = 18 + ((i * 37) % 92);
          pixelRect(ctx, sx, sy, i % 3 === 0 ? 2 : 1, i % 3 === 0 ? 2 : 1, "#fff3a6");
        }
        pixelRect(ctx, 265, 28, 18, 18, "#fff0a8");
        pixelRect(ctx, 260, 28, 8, 9, stage.palette.sky);
      } else {
        drawCloud(45 - (camera * 0.12) % 410, 32, stage.palette);
        drawCloud(220 - (camera * 0.09) % 430, 55, stage.palette);
        drawCloud(390 - (camera * 0.12) % 410, 25, stage.palette);
      }

      const backOffset = -((camera * 0.18) % 170);
      const frontOffset = -((camera * 0.3) % 210);
      for (let i = -1; i < 4; i += 1) {
        const x = backOffset + i * 170;
        pixelRect(ctx, x + 25, 144, 120, 64, stage.palette.hillBack);
        pixelRect(ctx, x + 42, 128, 86, 80, stage.palette.hillBack);
        pixelRect(ctx, x + 58, 116, 54, 92, stage.palette.hillBack);
      }
      for (let i = -1; i < 4; i += 1) {
        const x = frontOffset + i * 210;
        pixelRect(ctx, x + 10, 174, 170, 34, stage.palette.hillFront);
        pixelRect(ctx, x + 38, 154, 116, 54, stage.palette.hillFront);
        pixelRect(ctx, x + 65, 140, 62, 68, stage.palette.hillFront);
      }
    };

    const drawSolid = (solid: Rect, palette: Palette, camera: number) => {
      const x = Math.round(solid.x - camera);
      if (x > VIEW_W || x + solid.w < 0) return;
      if (solid.kind === "ground") {
        pixelRect(ctx, x, solid.y, solid.w, 7, palette.groundTop);
        for (let tx = 0; tx < solid.w; tx += 16) {
          for (let ty = 7; ty < solid.h; ty += 16) {
            const color = ((tx / 16 + ty / 16) % 2 === 0) ? palette.groundA : palette.groundB;
            pixelRect(ctx, x + tx, solid.y + ty, Math.min(16, solid.w - tx), Math.min(16, solid.h - ty), color);
            pixelRect(ctx, x + tx + 2, solid.y + ty + 3, 4, 3, "rgba(255,255,255,0.12)");
          }
        }
      } else if (solid.kind === "brick") {
        for (let tx = 0; tx < solid.w; tx += 16) {
          for (let ty = 0; ty < solid.h; ty += 16) {
            pixelRect(ctx, x + tx, solid.y + ty, 16, 16, palette.brickA);
            pixelRect(ctx, x + tx, solid.y + ty + 7, 16, 2, palette.brickB);
            pixelRect(ctx, x + tx + 7, solid.y + ty, 2, 8, palette.brickB);
            pixelRect(ctx, x + tx + 3, solid.y + ty + 2, 5, 2, "rgba(255,255,255,0.18)");
          }
        }
      } else if (solid.kind === "block") {
        pixelRect(ctx, x, solid.y, 16, 16, "#f4b938");
        pixelRect(ctx, x + 2, solid.y + 2, 12, 12, "#d8881f");
        pixelRect(ctx, x + 4, solid.y + 4, 8, 8, "#f4b938");
        ctx.fillStyle = "#704315";
        ctx.font = "bold 10px monospace";
        ctx.fillText("★", x + 3, solid.y + 12);
      } else {
        pixelRect(ctx, x - 3, solid.y, solid.w + 6, 8, palette.pipeA);
        pixelRect(ctx, x, solid.y + 8, solid.w, solid.h - 8, palette.pipeA);
        pixelRect(ctx, x + 5, solid.y + 8, 6, solid.h - 8, "rgba(255,255,255,0.22)");
        pixelRect(ctx, x + solid.w - 8, solid.y + 8, 8, solid.h - 8, palette.pipeB);
        pixelRect(ctx, x - 3, solid.y + 6, solid.w + 6, 3, palette.pipeB);
      }
    };

    const drawCoin = (coin: Coin, camera: number, now: number) => {
      if (coin.collected) return;
      const x = Math.round(coin.x - camera);
      if (x < -10 || x > VIEW_W + 10) return;
      const narrow = Math.floor(now / 140) % 4 === 0;
      pixelRect(ctx, x - (narrow ? 1 : 4), coin.y - 7, narrow ? 2 : 8, 14, "#ffd83d");
      pixelRect(ctx, x - (narrow ? 0 : 2), coin.y - 5, narrow ? 1 : 3, 10, "#fff2a0");
      pixelRect(ctx, x + (narrow ? 0 : 3), coin.y - 4, 1, 8, "#b87812");
    };

    const drawEnemy = (enemy: Enemy, camera: number, now: number) => {
      if (!enemy.alive) return;
      const x = Math.round(enemy.x - camera);
      if (x < -20 || x > VIEW_W + 20) return;
      const step = Math.floor(now / 180) % 2;
      pixelRect(ctx, x + 2, enemy.y + 2, 10, 10, "#6c357f");
      pixelRect(ctx, x, enemy.y + 6, 14, 7, "#8c4b9f");
      pixelRect(ctx, x + 3, enemy.y + 4, 2, 3, "#fff");
      pixelRect(ctx, x + 9, enemy.y + 4, 2, 3, "#fff");
      pixelRect(ctx, x + 4, enemy.y + 5, 1, 2, "#15121e");
      pixelRect(ctx, x + 10, enemy.y + 5, 1, 2, "#15121e");
      pixelRect(ctx, x + (step ? 1 : 0), enemy.y + 12, 5, 2, "#2d1837");
      pixelRect(ctx, x + (step ? 8 : 9), enemy.y + 12, 5, 2, "#2d1837");
    };

    const drawFlagAndCastle = (stage: Stage, camera: number) => {
      const flagX = Math.round(stage.flagX - camera);
      if (flagX > -60 && flagX < VIEW_W + 70) {
        pixelRect(ctx, flagX, 80, 3, 128, "#26324a");
        pixelRect(ctx, flagX + 3, 86, 34, 18, "#f26522");
        pixelRect(ctx, flagX + 8, 91, 17, 3, "#fff1d7");
        pixelRect(ctx, flagX + 8, 97, 11, 3, "#fff1d7");
        pixelRect(ctx, flagX - 5, 203, 13, 5, "#d9c49b");
      }
      const castleX = Math.round(stage.flagX + 60 - camera);
      if (castleX > -80 && castleX < VIEW_W + 90) {
        pixelRect(ctx, castleX, 142, 72, 66, "#3c365a");
        pixelRect(ctx, castleX + 8, 124, 18, 84, "#51496d");
        pixelRect(ctx, castleX + 46, 124, 18, 84, "#51496d");
        pixelRect(ctx, castleX + 10, 116, 6, 10, "#3c365a");
        pixelRect(ctx, castleX + 20, 116, 6, 10, "#3c365a");
        pixelRect(ctx, castleX + 48, 116, 6, 10, "#3c365a");
        pixelRect(ctx, castleX + 58, 116, 6, 10, "#3c365a");
        pixelRect(ctx, castleX + 29, 174, 16, 34, "#171526");
        pixelRect(ctx, castleX + 14, 150, 8, 10, "#f9d86a");
        pixelRect(ctx, castleX + 50, 150, 8, 10, "#f9d86a");
      }
    };

    const drawPlayer = (player: Player, camera: number, now: number) => {
      const x = Math.round(player.x - camera);
      const y = Math.round(player.y);
      const blink = now < invincibleUntilRef.current && Math.floor(now / 90) % 2 === 0;
      if (blink) return;
      const running = Math.abs(player.vx) > 20 && player.onGround;
      const step = running ? Math.floor(now / 100) % 2 : 0;
      ctx.save();
      if (player.facing < 0) {
        ctx.translate(x + player.w, 0);
        ctx.scale(-1, 1);
        ctx.translate(-x, 0);
      }
      pixelRect(ctx, x + 3, y, 8, 3, "#f26522");
      pixelRect(ctx, x + 1, y + 3, 12, 3, "#f26522");
      pixelRect(ctx, x + 4, y + 6, 7, 5, "#f2bd86");
      pixelRect(ctx, x + 10, y + 7, 2, 2, "#171526");
      pixelRect(ctx, x + 2, y + 10, 10, 6, "#25b9a8");
      pixelRect(ctx, x, y + 11, 3, 5, "#f2bd86");
      pixelRect(ctx, x + 11, y + 11, 3, 5, "#f2bd86");
      pixelRect(ctx, x + 3, y + 16, 4, 3, "#172944");
      pixelRect(ctx, x + 8, y + 16, 4, 3, "#172944");
      pixelRect(ctx, x + (step ? 1 : 2), y + 19, 5, 2, "#241a18");
      pixelRect(ctx, x + (step ? 8 : 7), y + 19, 5, 2, "#241a18");
      ctx.restore();
    };

    const draw = (now: number) => {
      const stage = STAGES[stageIndexRef.current];
      const camera = cameraRef.current;
      drawBackground(stage, camera);
      for (const solid of stage.solids) drawSolid(solid, stage.palette, camera);
      for (const coin of coinsRef.current) drawCoin(coin, camera, now);
      for (const enemy of enemiesRef.current) drawEnemy(enemy, camera, now);
      drawFlagAndCastle(stage, camera);
      drawPlayer(playerRef.current, camera, now);
    };

    const loop = (now: number) => {
      const previous = lastFrame || now;
      const dt = Math.min((now - previous) / 1000, 0.035);
      lastFrame = now;
      update(now, dt);
      draw(now);
      animationFrame = requestAnimationFrame(loop);
    };

    animationFrame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animationFrame);
  }, [syncPhase]);

  const remainingAfter = result?.ok ? result.remainingToday : Math.max(remainingBefore - 1, 0);

  return (
    <main
      className="relative flex min-h-[100dvh] select-none flex-col overflow-hidden bg-[#090b1a] text-white"
      style={{ fontFamily: "'Galmuri11', 'Jua', monospace", touchAction: "none" }}
    >
      {adminMode && (
        <div className="absolute inset-x-0 top-0 z-[120] flex justify-center">
          <span className="border-x-2 border-b-2 border-amber-200 bg-amber-500 px-3 py-1 text-[10px] font-bold text-slate-950">
            TEST MODE · 기록 저장 안 됨
          </span>
        </div>
      )}

      <header className={`z-50 mx-auto flex w-full max-w-3xl items-center justify-between gap-2 px-3 pb-2 ${adminMode ? "pt-9" : "pt-3"}`}>
        <Link href={homeHref} className="border-2 border-white bg-[#25284e] px-3 py-2 text-[10px] font-bold shadow-[3px_3px_0_#000] active:translate-y-0.5">
          ← GAME CENTER
        </Link>
        <div className="flex min-w-0 items-center gap-3 text-[10px] sm:text-xs">
          <div className="text-center"><div className="text-white/55">WORLD</div><div className="text-yellow-300">{stageIndex + 1}-{STAGES.length}</div></div>
          <div className="text-center"><div className="text-white/55">SCORE</div><div>{score.toString().padStart(6, "0")}</div></div>
          <div className="text-center"><div className="text-white/55">COIN</div><div className="text-yellow-300">×{coinCount}</div></div>
          <div className="text-center"><div className="text-white/55">TIME</div><div>{elapsed}</div></div>
        </div>
        <div className="whitespace-nowrap text-sm tracking-[-3px] text-rose-400">{hearts.join(" ")}</div>
      </header>

      <section className="relative mx-auto w-full max-w-3xl border-y-4 border-black bg-black sm:border-x-4">
        <canvas
          ref={canvasRef}
          width={VIEW_W}
          height={VIEW_H}
          aria-label="픽셀 횡스크롤 수학 게임"
          className="block h-auto w-full"
          style={{ imageRendering: "pixelated", aspectRatio: `${VIEW_W}/${VIEW_H}` }}
        />

        <AnimatePresence>
          {phase === "ready" && (
            <motion.div className="absolute inset-0 z-40 flex items-center justify-center bg-[#10132c]/90 px-5" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <div className="w-full max-w-sm border-4 border-white bg-[#1a2d5b] p-5 text-center shadow-[8px_8px_0_#000]">
                <div className="mx-auto mb-3 grid h-16 w-16 place-items-center border-4 border-black bg-[#f26522] text-4xl shadow-[4px_4px_0_#000]">★</div>
                <h1 className="text-xl font-black leading-relaxed text-yellow-300 sm:text-2xl">PIXEL MATH WORLD</h1>
                <p className="mt-2 text-[10px] leading-5 text-white/80 sm:text-xs">
                  달리고 점프해 코인과 몬스터를 통과하세요.<br />깃발에 도착하면 수학 문제 1개가 나옵니다.
                </p>
                <div className="mt-4 grid grid-cols-3 gap-2 text-[9px] sm:text-[10px]">
                  <div className="border-2 border-white/70 bg-black/25 p-2">◀ ▶<br />이동</div>
                  <div className="border-2 border-white/70 bg-black/25 p-2">↑<br />점프</div>
                  <div className="border-2 border-white/70 bg-black/25 p-2">⚑<br />문제</div>
                </div>
                <button type="button" onClick={startGame} className="mt-5 w-full border-4 border-white bg-[#f26522] py-3 text-sm font-black text-white shadow-[5px_5px_0_#000] active:translate-x-0.5 active:translate-y-0.5 active:shadow-[2px_2px_0_#000]">
                  ▶ START GAME
                </button>
                <p className="mt-3 text-[9px] text-white/55">오늘 남은 횟수 · {adminMode ? "∞" : `${remainingBefore}회`}</p>
              </div>
            </motion.div>
          )}

          {phase === "stageQuiz" && (
            <motion.div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 px-5" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <motion.div initial={{ scale: 0.82, y: 12 }} animate={{ scale: 1, y: 0 }} className="w-full max-w-xs border-4 border-white bg-[#fff2c8] p-4 text-center text-[#171526] shadow-[8px_8px_0_#000]">
                <div className="text-[10px] font-black text-[#d64b22]">{currentStage.name} CLEAR!</div>
                <h2 className="mt-2 text-sm font-black">다음 월드로 가는 문</h2>
                <div className="my-4 border-4 border-[#171526] bg-white py-4 text-3xl font-black">
                  {currentStage.quiz.prompt} = ?
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {currentStage.quiz.choices.map((choice) => (
                    <button key={choice} type="button" disabled={quizFeedback !== null} onClick={() => answerStageQuiz(choice)} className="border-4 border-[#171526] bg-[#5cc8ff] py-3 text-xl font-black shadow-[3px_3px_0_#171526] active:translate-x-0.5 active:translate-y-0.5 disabled:opacity-70">
                      {choice}
                    </button>
                  ))}
                </div>
                {quizFeedback && (
                  <div className={`mt-3 border-2 border-[#171526] py-2 text-xs font-black ${quizFeedback === "correct" ? "bg-emerald-300" : "bg-rose-300"}`}>
                    {quizFeedback === "correct" ? (stageIndex === STAGES.length - 1 ? "정답! 최종 클리어!" : "정답! 다음 월드로 이동!") : "다시 골라보세요!"}
                  </div>
                )}
              </motion.div>
            </motion.div>
          )}

          {phase === "over" && (
            <motion.div className="absolute inset-0 z-50 flex items-center justify-center bg-[#080916]/90 px-5" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <div className="w-full max-w-sm border-4 border-white bg-[#1a2d5b] p-5 text-center shadow-[8px_8px_0_#000]">
                <div className="text-4xl">{cleared ? "🏰" : "💥"}</div>
                <h2 className="mt-2 text-xl font-black text-yellow-300">{cleared ? "ALL CLEAR!" : "GAME OVER"}</h2>
                <p className="mt-2 text-[10px] leading-5 text-white/75">{cleared ? `${monsterNickname}와 함께 3개 월드를 모두 통과했어요!` : "점프 타이밍을 맞춰 다시 도전해보세요."}</p>
                <div className="mt-4 grid grid-cols-3 gap-2 text-[10px]">
                  <PixelStat label="SCORE" value={score.toLocaleString()} />
                  <PixelStat label="COIN" value={String(coinCount)} />
                  <PixelStat label="TIME" value={`${elapsed}s`} />
                </div>
                <div className="mt-3 border-2 border-white/70 bg-black/30 p-3 text-[10px] leading-5">
                  {submitting ? "기록 저장 중..." : adminMode ? "테스트 모드라 기록은 저장되지 않아요." : result?.ok ? `EXP +${result.expEarned}${result.isNewBest ? " · NEW RECORD!" : ""}` : result ? result.message : "결과를 확인했어요."}
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3 text-xs font-black">
                  {(adminMode || remainingAfter > 0) && <button type="button" onClick={startGame} className="border-4 border-white bg-[#f26522] py-3 shadow-[4px_4px_0_#000] active:translate-y-0.5">RETRY</button>}
                  <Link href={homeHref} className="flex items-center justify-center border-4 border-white bg-[#26b99a] py-3 shadow-[4px_4px_0_#000] active:translate-y-0.5">EXIT</Link>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </section>

      <div className="mx-auto flex w-full max-w-3xl flex-1 items-center justify-between gap-5 px-5 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        <div className="flex gap-3">
          <PixelControl label="왼쪽" icon="◀" onPress={() => pressControl("left")} onRelease={() => releaseControl("left")} />
          <PixelControl label="오른쪽" icon="▶" onPress={() => pressControl("right")} onRelease={() => releaseControl("right")} />
        </div>
        <div className="hidden text-center text-[9px] leading-5 text-white/45 sm:block">{currentStage.name}<br />{currentStage.subtitle}</div>
        <button type="button" onPointerDown={(event) => { event.preventDefault(); queueJump(); }} className="grid h-20 w-20 place-items-center rounded-full border-4 border-white bg-[#f26522] text-3xl font-black shadow-[0_7px_0_#8e2e12,0_10px_0_#000] active:translate-y-1 active:shadow-[0_3px_0_#8e2e12,0_5px_0_#000]" aria-label="점프">
          ↑
        </button>
      </div>
    </main>
  );
}

function PixelControl({ label, icon, onPress, onRelease }: { label: string; icon: string; onPress: () => void; onRelease: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      onPointerDown={(event) => { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); onPress(); }}
      onPointerUp={onRelease}
      onPointerCancel={onRelease}
      onLostPointerCapture={onRelease}
      className="grid h-[72px] w-[72px] place-items-center rounded-full border-4 border-white bg-[#25284e] text-2xl font-black shadow-[0_7px_0_#101126,0_10px_0_#000] active:translate-y-1 active:shadow-[0_3px_0_#101126,0_5px_0_#000]"
    >
      {icon}
    </button>
  );
}

function PixelStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-2 border-white bg-black/25 p-2">
      <div className="text-white/55">{label}</div>
      <div className="mt-1 text-sm text-yellow-300">{value}</div>
    </div>
  );
}
