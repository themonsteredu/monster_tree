"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  recordMathAdventurePlayAction,
  type PlayResult,
} from "../actions";

type Phase = "ready" | "playing" | "stageQuiz" | "over";
type ItemKind = "growth" | "blaster" | "star";
type TileKind = "ground" | "stone" | "supply" | "pillar";
type Rect = {
  x: number;
  y: number;
  w: number;
  h: number;
  kind: TileKind;
  supplyId?: string;
};
type CoinSeed = { x: number; y: number };
type EnemySeed = {
  x: number;
  y: number;
  minX: number;
  maxX: number;
  speed: number;
  variant?: "slime" | "crawler";
};
type SupplySeed = {
  id: string;
  x: number;
  y: number;
  item: ItemKind;
};
type Quiz = { prompt: string; choices: number[]; answer: number };
type Palette = {
  sky: string;
  skyBottom: string;
  cloud: string;
  mountainBack: string;
  mountainFront: string;
  grassTop: string;
  dirt: string;
  dirtDark: string;
  stone: string;
  stoneDark: string;
  wood: string;
  woodDark: string;
  accent: string;
};
type Stage = {
  name: string;
  subtitle: string;
  width: number;
  startX: number;
  startY: number;
  goalX: number;
  solids: Rect[];
  coins: CoinSeed[];
  enemies: EnemySeed[];
  supplies: SupplySeed[];
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
type Supply = SupplySeed & { hit: boolean };
type SpawnedItem = {
  id: string;
  kind: ItemKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  active: boolean;
};
type Projectile = {
  id: number;
  x: number;
  y: number;
  vx: number;
  active: boolean;
};

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
const POWERED_HEIGHT = 28;
const MOVE_SPEED = 116;
const JUMP_SPEED = 332;
const GRAVITY = 920;
const ITEM_GRAVITY = 520;
const STARTING_LIVES = 3;
const MAX_SCORE = 5000;

const MEADOW: Palette = {
  sky: "#7fd1ff",
  skyBottom: "#d8f5ff",
  cloud: "#f8fbff",
  mountainBack: "#8bbf91",
  mountainFront: "#4d8d59",
  grassTop: "#72c94d",
  dirt: "#8d5b37",
  dirtDark: "#604027",
  stone: "#8b9296",
  stoneDark: "#596064",
  wood: "#a66a3f",
  woodDark: "#684128",
  accent: "#f2a93b",
};

const CANYON: Palette = {
  sky: "#ef9c67",
  skyBottom: "#f9d29b",
  cloud: "#fff0d3",
  mountainBack: "#ad7960",
  mountainFront: "#70483e",
  grassTop: "#b8b14d",
  dirt: "#8b4b35",
  dirtDark: "#5f3027",
  stone: "#8f7770",
  stoneDark: "#5a4743",
  wood: "#a8663d",
  woodDark: "#653c27",
  accent: "#45c7b4",
};

const FORTRESS: Palette = {
  sky: "#1a254d",
  skyBottom: "#3d4a73",
  cloud: "#aebad0",
  mountainBack: "#454a69",
  mountainFront: "#292d47",
  grassTop: "#5f9d67",
  dirt: "#514536",
  dirtDark: "#332c24",
  stone: "#68717c",
  stoneDark: "#343b45",
  wood: "#75513c",
  woodDark: "#412f25",
  accent: "#bb79e8",
};

function ground(x: number, w: number): Rect {
  return { x, y: 208, w, h: 32, kind: "ground" };
}

function stone(x: number, y: number, w = 16, h = 16): Rect {
  return { x, y, w, h, kind: "stone" };
}

function pillar(x: number, h: number): Rect {
  return { x, y: 208 - h, w: 32, h, kind: "pillar" };
}

function supplyRect(id: string, x: number, y: number): Rect {
  return { x, y, w: 16, h: 16, kind: "supply", supplyId: id };
}

const STAGES: Stage[] = [
  {
    name: "BLOCK WORLD 1",
    subtitle: "초원 광산",
    width: 1760,
    startX: 38,
    startY: 170,
    goalX: 1648,
    palette: MEADOW,
    solids: [
      ground(0, 450),
      ground(510, 310),
      ground(875, 355),
      ground(1280, 480),
      stone(225, 160, 48),
      supplyRect("s1-grow", 289, 160),
      stone(305, 160, 32),
      pillar(390, 32),
      stone(590, 144, 64),
      supplyRect("s1-blaster", 670, 144),
      pillar(760, 48),
      stone(930, 160, 48),
      supplyRect("s1-star", 994, 160),
      stone(1058, 128, 80),
      pillar(1182, 64),
      stone(1360, 160, 64),
      supplyRect("s1-coin", 1440, 160),
    ],
    supplies: [
      { id: "s1-grow", x: 289, y: 160, item: "growth" },
      { id: "s1-blaster", x: 670, y: 144, item: "blaster" },
      { id: "s1-star", x: 994, y: 160, item: "star" },
      { id: "s1-coin", x: 1440, y: 160, item: "growth" },
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
      { x: 330, y: 192, minX: 310, maxX: 370, speed: 24, variant: "slime" },
      { x: 650, y: 192, minX: 540, maxX: 735, speed: 28, variant: "crawler" },
      { x: 1030, y: 192, minX: 900, maxX: 1150, speed: 30, variant: "slime" },
      { x: 1480, y: 192, minX: 1300, maxX: 1590, speed: 32, variant: "crawler" },
    ],
    quiz: { prompt: "7 + 5", choices: [10, 11, 12, 13], answer: 12 },
  },
  {
    name: "BLOCK WORLD 2",
    subtitle: "불빛 협곡",
    width: 1940,
    startX: 38,
    startY: 170,
    goalX: 1828,
    palette: CANYON,
    solids: [
      ground(0, 360),
      ground(425, 245),
      ground(735, 260),
      ground(1050, 330),
      ground(1445, 495),
      stone(175, 160, 80),
      supplyRect("s2-grow", 271, 160),
      pillar(330, 48),
      stone(470, 144, 96),
      supplyRect("s2-blaster", 582, 144),
      stone(690, 176, 48),
      pillar(825, 64),
      stone(910, 128, 80),
      supplyRect("s2-star", 1008, 128),
      stone(1110, 160, 64),
      pillar(1270, 48),
      stone(1385, 176, 64),
      stone(1500, 144, 96),
      supplyRect("s2-grow2", 1612, 144),
      pillar(1710, 64),
    ],
    supplies: [
      { id: "s2-grow", x: 271, y: 160, item: "growth" },
      { id: "s2-blaster", x: 582, y: 144, item: "blaster" },
      { id: "s2-star", x: 1008, y: 128, item: "star" },
      { id: "s2-grow2", x: 1612, y: 144, item: "growth" },
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
      { x: 250, y: 192, minX: 220, maxX: 310, speed: 30, variant: "crawler" },
      { x: 500, y: 192, minX: 450, maxX: 640, speed: 34, variant: "slime" },
      { x: 780, y: 192, minX: 755, maxX: 810, speed: 26, variant: "crawler" },
      { x: 1160, y: 192, minX: 1080, maxX: 1240, speed: 34, variant: "slime" },
      { x: 1540, y: 192, minX: 1470, maxX: 1680, speed: 38, variant: "crawler" },
    ],
    quiz: { prompt: "6 × 4", choices: [20, 22, 24, 26], answer: 24 },
  },
  {
    name: "BLOCK WORLD 3",
    subtitle: "밤의 요새",
    width: 2100,
    startX: 38,
    startY: 170,
    goalX: 1988,
    palette: FORTRESS,
    solids: [
      ground(0, 300),
      ground(360, 250),
      ground(680, 250),
      ground(1000, 270),
      ground(1340, 290),
      ground(1690, 410),
      stone(150, 160, 64),
      supplyRect("s3-grow", 230, 160),
      stone(315, 176, 48),
      pillar(450, 64),
      stone(535, 128, 80),
      supplyRect("s3-blaster", 630, 128),
      stone(770, 160, 80),
      pillar(890, 48),
      stone(1080, 144, 96),
      supplyRect("s3-star", 1192, 144),
      pillar(1255, 64),
      stone(1400, 176, 64),
      stone(1510, 128, 96),
      supplyRect("s3-grow2", 1620, 128),
      pillar(1770, 80),
      stone(1840, 160, 64),
    ],
    supplies: [
      { id: "s3-grow", x: 230, y: 160, item: "growth" },
      { id: "s3-blaster", x: 630, y: 128, item: "blaster" },
      { id: "s3-star", x: 1192, y: 144, item: "star" },
      { id: "s3-grow2", x: 1620, y: 128, item: "growth" },
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
      { x: 245, y: 192, minX: 220, maxX: 280, speed: 32, variant: "slime" },
      { x: 520, y: 192, minX: 390, maxX: 580, speed: 38, variant: "crawler" },
      { x: 800, y: 192, minX: 700, maxX: 865, speed: 40, variant: "slime" },
      { x: 1110, y: 192, minX: 1030, maxX: 1220, speed: 42, variant: "crawler" },
      { x: 1440, y: 192, minX: 1370, maxX: 1580, speed: 44, variant: "slime" },
      { x: 1870, y: 192, minX: 1810, maxX: 1950, speed: 46, variant: "crawler" },
    ],
    quiz: { prompt: "35 ÷ 5", choices: [5, 6, 7, 8], answer: 7 },
  },
];

function intersects(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
) {
  return (
    a.x < b.x + b.w &&
    a.x + a.w > b.x &&
    a.y < b.y + b.h &&
    a.y + a.h > b.y
  );
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function pixelRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

function itemLabel(kind: ItemKind) {
  if (kind === "growth") return "성장 버섯";
  if (kind === "blaster") return "블록 블래스터";
  return "별 큐브";
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
  const playerRef = useRef<Player>({
    x: 38,
    y: 170,
    vx: 0,
    vy: 0,
    w: PLAYER_W,
    h: PLAYER_H,
    onGround: false,
    facing: 1,
  });
  const coinsRef = useRef<Coin[]>([]);
  const enemiesRef = useRef<Enemy[]>([]);
  const suppliesRef = useRef<Supply[]>([]);
  const itemsRef = useRef<SpawnedItem[]>([]);
  const projectilesRef = useRef<Projectile[]>([]);
  const controlsRef = useRef({
    left: false,
    right: false,
    jumpQueued: false,
    fireQueued: false,
  });
  const cameraRef = useRef(0);
  const scoreRef = useRef(0);
  const livesRef = useRef(STARTING_LIVES);
  const coinCountRef = useRef(0);
  const powerLevelRef = useRef<0 | 1 | 2>(0);
  const startedAtRef = useRef(0);
  const lastHudPaintRef = useRef(0);
  const invincibleUntilRef = useRef(0);
  const starUntilRef = useRef(0);
  const fireCooldownRef = useRef(0);
  const projectileIdRef = useRef(1);
  const finishingRef = useRef(false);
  const submitResultRef = useRef<(cleared: boolean) => void>(() => undefined);

  const [phase, setPhase] = useState<Phase>("ready");
  const [stageIndex, setStageIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(STARTING_LIVES);
  const [coinCount, setCoinCount] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [powerLevel, setPowerLevel] = useState<0 | 1 | 2>(0);
  const [starActive, setStarActive] = useState(false);
  const [lastItem, setLastItem] = useState<ItemKind | null>(null);
  const [quizFeedback, setQuizFeedback] = useState<
    "correct" | "wrong" | null
  >(null);
  const [cleared, setCleared] = useState(false);
  const [result, setResult] = useState<PlayResult | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const currentStage = STAGES[stageIndex];
  const hearts = useMemo(
    () =>
      Array.from(
        { length: STARTING_LIVES },
        (_, i) => (i < lives ? "♥" : "♡"),
      ),
    [lives],
  );

  const syncPhase = useCallback((next: Phase) => {
    phaseRef.current = next;
    setPhase(next);
  }, []);

  const syncPower = useCallback((next: 0 | 1 | 2) => {
    const player = playerRef.current;
    const previousHeight = player.h;
    powerLevelRef.current = next;
    player.h = next > 0 ? POWERED_HEIGHT : PLAYER_H;
    if (player.h > previousHeight) player.y -= player.h - previousHeight;
    if (player.h < previousHeight) player.y += previousHeight - player.h;
    setPowerLevel(next);
  }, []);

  const loadStage = useCallback(
    (index: number, startImmediately = true) => {
      const stage = STAGES[index];
      const height = powerLevelRef.current > 0 ? POWERED_HEIGHT : PLAYER_H;
      stageIndexRef.current = index;
      setStageIndex(index);
      playerRef.current = {
        x: stage.startX,
        y: stage.startY - (height - PLAYER_H),
        vx: 0,
        vy: 0,
        w: PLAYER_W,
        h: height,
        onGround: false,
        facing: 1,
      };
      coinsRef.current = stage.coins.map((coin) => ({
        ...coin,
        collected: false,
      }));
      enemiesRef.current = stage.enemies.map((enemy) => ({
        ...enemy,
        vx: enemy.speed,
        alive: true,
      }));
      suppliesRef.current = stage.supplies.map((supply) => ({
        ...supply,
        hit: false,
      }));
      itemsRef.current = [];
      projectilesRef.current = [];
      cameraRef.current = 0;
      controlsRef.current = {
        left: false,
        right: false,
        jumpQueued: false,
        fireQueued: false,
      };
      invincibleUntilRef.current = 0;
      starUntilRef.current = 0;
      setStarActive(false);
      setLastItem(null);
      setQuizFeedback(null);
      if (startImmediately) syncPhase("playing");
    },
    [syncPhase],
  );

  const submitResult = useCallback(
    async (didClear: boolean) => {
      if (finishingRef.current) return;
      finishingRef.current = true;
      controlsRef.current = {
        left: false,
        right: false,
        jumpQueued: false,
        fireQueued: false,
      };
      const seconds = Math.max(
        1,
        Math.floor((Date.now() - startedAtRef.current) / 1000),
      );
      const clearBonus = didClear ? 900 : 0;
      const lifeBonus = didClear ? livesRef.current * 120 : 0;
      const powerBonus = didClear ? powerLevelRef.current * 120 : 0;
      const timeBonus = didClear ? Math.max(0, 420 - seconds) : 0;
      const finalScore = clamp(
        Math.floor(
          scoreRef.current +
            clearBonus +
            lifeBonus +
            powerBonus +
            timeBonus,
        ),
        0,
        MAX_SCORE,
      );
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
        const saved = await recordMathAdventurePlayAction({
          score: finalScore,
        });
        setResult(saved);
      } catch {
        setResult({
          ok: false,
          reason: "invalid",
          message: "네트워크 오류로 기록을 저장하지 못했어요.",
        });
      } finally {
        setSubmitting(false);
      }
    },
    [adminMode, syncPhase],
  );

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
    powerLevelRef.current = 0;
    startedAtRef.current = Date.now();
    setScore(0);
    setLives(STARTING_LIVES);
    setCoinCount(0);
    setElapsed(0);
    setPowerLevel(0);
    setStarActive(false);
    setLastItem(null);
    setCleared(false);
    setResult(null);
    setSubmitting(false);
    loadStage(0, true);
  }, [loadStage]);

  const answerStageQuiz = useCallback(
    (choice: number) => {
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
    },
    [loadStage, quizFeedback],
  );

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

  const queueFire = () => {
    if (phaseRef.current !== "playing" || powerLevelRef.current < 2) return;
    controlsRef.current.fireQueued = true;
  };

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (
        phaseRef.current === "ready" &&
        (event.key === "Enter" || event.key === " ")
      ) {
        event.preventDefault();
        startGame();
        return;
      }
      if (phaseRef.current !== "playing") return;
      if (
        event.key === "ArrowLeft" ||
        event.key.toLowerCase() === "a"
      ) {
        event.preventDefault();
        controlsRef.current.left = true;
      }
      if (
        event.key === "ArrowRight" ||
        event.key.toLowerCase() === "d"
      ) {
        event.preventDefault();
        controlsRef.current.right = true;
      }
      if (event.key === "ArrowUp" || event.key === " ") {
        event.preventDefault();
        controlsRef.current.jumpQueued = true;
      }
      if (
        event.key.toLowerCase() === "f" ||
        event.key.toLowerCase() === "x"
      ) {
        event.preventDefault();
        controlsRef.current.fireQueued = true;
      }
    };
    const up = (event: KeyboardEvent) => {
      if (
        event.key === "ArrowLeft" ||
        event.key.toLowerCase() === "a"
      ) {
        controlsRef.current.left = false;
      }
      if (
        event.key === "ArrowRight" ||
        event.key.toLowerCase() === "d"
      ) {
        controlsRef.current.right = false;
      }
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
      scoreRef.current = clamp(
        scoreRef.current + amount,
        0,
        MAX_SCORE,
      );
      setScore(scoreRef.current);
    };

    const setPowerWithToast = (
      next: 0 | 1 | 2,
      item: ItemKind,
    ) => {
      syncPower(next);
      setLastItem(item);
      window.setTimeout(() => setLastItem(null), 1300);
    };

    const resetAtStageStart = () => {
      const stage = STAGES[stageIndexRef.current];
      const height =
        powerLevelRef.current > 0 ? POWERED_HEIGHT : PLAYER_H;
      playerRef.current.x = stage.startX;
      playerRef.current.y = stage.startY - (height - PLAYER_H);
      playerRef.current.vx = 0;
      playerRef.current.vy = 0;
      playerRef.current.w = PLAYER_W;
      playerRef.current.h = height;
      cameraRef.current = 0;
    };

    const takeDamage = (now: number) => {
      if (now < starUntilRef.current || now < invincibleUntilRef.current) {
        return;
      }
      if (powerLevelRef.current > 0) {
        const next = (powerLevelRef.current - 1) as 0 | 1;
        syncPower(next);
        invincibleUntilRef.current = now + 1500;
        if (typeof navigator !== "undefined" && "vibrate" in navigator) {
          navigator.vibrate?.(65);
        }
        return;
      }

      const nextLives = livesRef.current - 1;
      livesRef.current = nextLives;
      setLives(nextLives);
      if (typeof navigator !== "undefined" && "vibrate" in navigator) {
        navigator.vibrate?.(90);
      }
      if (nextLives <= 0) {
        submitResultRef.current(false);
        return;
      }
      invincibleUntilRef.current = now + 1300;
      resetAtStageStart();
    };

    const spawnSupplyItem = (supplyId: string) => {
      const supply = suppliesRef.current.find(
        (candidate) => candidate.id === supplyId,
      );
      if (!supply || supply.hit) return;
      supply.hit = true;
      itemsRef.current.push({
        id: supply.id,
        kind: supply.item,
        x: supply.x + 2,
        y: supply.y - 12,
        vx:
          supply.item === "growth"
            ? 28
            : supply.item === "star"
              ? 38
              : 0,
        vy: -125,
        active: true,
      });
      addScore(40);
    };

    const collectItem = (item: SpawnedItem, now: number) => {
      item.active = false;
      if (item.kind === "growth") {
        const next = powerLevelRef.current === 0 ? 1 : powerLevelRef.current;
        setPowerWithToast(next, item.kind);
        addScore(160);
      } else if (item.kind === "blaster") {
        setPowerWithToast(2, item.kind);
        addScore(220);
      } else {
        starUntilRef.current = now + 7000;
        setStarActive(true);
        setLastItem(item.kind);
        window.setTimeout(() => setLastItem(null), 1300);
        addScore(260);
      }
    };

    const update = (now: number, dt: number) => {
      if (phaseRef.current !== "playing") return;
      const stage = STAGES[stageIndexRef.current];
      const player = playerRef.current;
      const previous = {
        x: player.x,
        y: player.y,
        w: player.w,
        h: player.h,
      };
      const controls = controlsRef.current;

      if (starUntilRef.current > 0 && now >= starUntilRef.current) {
        starUntilRef.current = 0;
        setStarActive(false);
      }

      if (controls.left === controls.right) {
        player.vx *= Math.pow(0.0008, dt);
      } else if (controls.left) {
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

      if (controls.fireQueued) {
        controls.fireQueued = false;
        if (
          powerLevelRef.current >= 2 &&
          now >= fireCooldownRef.current
        ) {
          fireCooldownRef.current = now + 360;
          projectilesRef.current.push({
            id: projectileIdRef.current,
            x:
              player.facing > 0
                ? player.x + player.w
                : player.x - 7,
            y: player.y + Math.min(12, player.h / 2),
            vx: player.facing * 215,
            active: true,
          });
          projectileIdRef.current += 1;
        }
      }

      player.vy = Math.min(player.vy + GRAVITY * dt, 540);
      player.x += player.vx * dt;
      player.x = clamp(player.x, 0, stage.width - player.w);

      for (const solid of stage.solids) {
        if (!intersects(player, solid)) continue;
        if (
          player.vx > 0 &&
          previous.x + previous.w <= solid.x + 3
        ) {
          player.x = solid.x - player.w;
        } else if (
          player.vx < 0 &&
          previous.x >= solid.x + solid.w - 3
        ) {
          player.x = solid.x + solid.w;
        }
      }

      player.y += player.vy * dt;
      player.onGround = false;
      for (const solid of stage.solids) {
        if (!intersects(player, solid)) continue;
        const previousBottom = previous.y + previous.h;
        if (
          player.vy >= 0 &&
          previousBottom <= solid.y + 5
        ) {
          player.y = solid.y - player.h;
          player.vy = 0;
          player.onGround = true;
        } else if (
          player.vy < 0 &&
          previous.y >= solid.y + solid.h - 5
        ) {
          player.y = solid.y + solid.h;
          player.vy = 0;
          if (solid.kind === "supply" && solid.supplyId) {
            spawnSupplyItem(solid.supplyId);
          } else if (solid.kind === "stone") {
            addScore(8);
          }
        }
      }

      if (player.y > VIEW_H + 36) {
        takeDamage(now);
        if (livesRef.current > 0) resetAtStageStart();
        return;
      }

      for (const item of itemsRef.current) {
        if (!item.active) continue;
        const previousItemX = item.x;
        const previousItemY = item.y;
        item.vy = Math.min(item.vy + ITEM_GRAVITY * dt, 340);
        item.x += item.vx * dt;

        const itemBox = { x: item.x, y: item.y, w: 12, h: 12 };
        for (const solid of stage.solids) {
          if (!intersects(itemBox, solid)) continue;
          item.x = previousItemX;
          item.vx *= -1;
          break;
        }

        item.y += item.vy * dt;
        const fallingBox = { x: item.x, y: item.y, w: 12, h: 12 };
        for (const solid of stage.solids) {
          if (!intersects(fallingBox, solid)) continue;
          if (
            item.vy >= 0 &&
            previousItemY + 12 <= solid.y + 4
          ) {
            item.y = solid.y - 12;
            if (item.kind === "star") {
              item.vy = -185;
            } else {
              item.vy = 0;
            }
          }
        }

        if (item.y > VIEW_H + 40) {
          item.active = false;
          continue;
        }
        if (intersects(player, { x: item.x, y: item.y, w: 12, h: 12 })) {
          collectItem(item, now);
        }
      }

      for (const coin of coinsRef.current) {
        if (coin.collected) continue;
        if (
          intersects(player, {
            x: coin.x - 5,
            y: coin.y - 7,
            w: 10,
            h: 14,
          })
        ) {
          coin.collected = true;
          coinCountRef.current += 1;
          setCoinCount(coinCountRef.current);
          addScore(30);
        }
      }

      for (const projectile of projectilesRef.current) {
        if (!projectile.active) continue;
        projectile.x += projectile.vx * dt;
        const projectileBox = {
          x: projectile.x,
          y: projectile.y,
          w: 7,
          h: 5,
        };
        if (
          projectile.x < -20 ||
          projectile.x > stage.width + 20
        ) {
          projectile.active = false;
          continue;
        }
        if (
          stage.solids.some((solid) =>
            intersects(projectileBox, solid),
          )
        ) {
          projectile.active = false;
          continue;
        }
        for (const enemy of enemiesRef.current) {
          if (!enemy.alive) continue;
          if (
            intersects(projectileBox, {
              x: enemy.x,
              y: enemy.y,
              w: 16,
              h: 16,
            })
          ) {
            projectile.active = false;
            enemy.alive = false;
            addScore(120);
            break;
          }
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
        const enemyBox = {
          x: enemy.x,
          y: enemy.y,
          w: 16,
          h: 16,
        };
        if (!intersects(player, enemyBox)) continue;

        if (now < starUntilRef.current) {
          enemy.alive = false;
          addScore(130);
          continue;
        }

        const previousBottom = previous.y + previous.h;
        if (
          player.vy > 35 &&
          previousBottom <= enemy.y + 6
        ) {
          enemy.alive = false;
          player.vy = -210;
          addScore(100);
        } else {
          takeDamage(now);
          return;
        }
      }

      if (player.x + player.w >= stage.goalX) {
        controlsRef.current = {
          left: false,
          right: false,
          jumpQueued: false,
          fireQueued: false,
        };
        player.vx = 0;
        addScore(180);
        syncPhase("stageQuiz");
      }

      cameraRef.current = clamp(
        player.x - 112,
        0,
        stage.width - VIEW_W,
      );
      if (now - lastHudPaintRef.current > 250) {
        lastHudPaintRef.current = now;
        setElapsed(
          Math.max(
            0,
            Math.floor(
              (Date.now() - startedAtRef.current) / 1000,
            ),
          ),
        );
      }
    };

    const drawVoxelBlock = (
      x: number,
      y: number,
      w: number,
      h: number,
      top: string,
      front: string,
      shadow: string,
    ) => {
      pixelRect(ctx, x, y, w, h, front);
      pixelRect(ctx, x, y, w, Math.min(4, h), top);
      pixelRect(ctx, x + Math.max(0, w - 4), y + 4, 4, Math.max(0, h - 4), shadow);
      pixelRect(ctx, x + 2, y + 6, 3, 3, "rgba(255,255,255,0.16)");
      pixelRect(ctx, x + Math.max(2, w - 8), y + Math.max(7, h - 7), 3, 3, "rgba(0,0,0,0.14)");
    };

    const drawCloud = (x: number, y: number, palette: Palette) => {
      pixelRect(ctx, x + 10, y, 22, 8, palette.cloud);
      pixelRect(ctx, x, y + 8, 46, 12, palette.cloud);
      pixelRect(ctx, x + 7, y + 20, 32, 5, palette.cloud);
      pixelRect(ctx, x + 33, y + 12, 10, 8, "rgba(180,205,220,0.4)");
    };

    const drawTree = (x: number, y: number, camera: number, palette: Palette) => {
      const screenX = Math.round(x - camera * 0.35);
      drawVoxelBlock(screenX, y + 26, 12, 34, "#bb7a49", palette.wood, palette.woodDark);
      drawVoxelBlock(screenX - 15, y + 4, 42, 26, "#62bd5d", "#3f9748", "#2d6b35");
      drawVoxelBlock(screenX - 8, y - 6, 28, 18, "#74d36a", "#4eab55", "#347b3c");
    };

    const drawBackground = (stage: Stage, camera: number) => {
      const gradient = ctx.createLinearGradient(0, 0, 0, VIEW_H);
      gradient.addColorStop(0, stage.palette.sky);
      gradient.addColorStop(1, stage.palette.skyBottom);
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);

      if (stage.palette === FORTRESS) {
        for (let i = 0; i < 24; i += 1) {
          const sx = ((i * 67 - camera * 0.08) % 360 + 360) % 360;
          const sy = 16 + ((i * 37) % 100);
          pixelRect(
            ctx,
            sx,
            sy,
            i % 4 === 0 ? 2 : 1,
            i % 4 === 0 ? 2 : 1,
            "#fff2a1",
          );
        }
        drawVoxelBlock(266, 24, 22, 22, "#fff3b6", "#e6d478", "#a49656");
      } else {
        drawCloud(35 - (camera * 0.1) % 410, 28, stage.palette);
        drawCloud(210 - (camera * 0.08) % 430, 52, stage.palette);
        drawCloud(380 - (camera * 0.1) % 410, 20, stage.palette);
        drawVoxelBlock(266, 26, 22, 22, "#fff4a5", "#f4ca50", "#c58f2d");
      }

      const backOffset = -((camera * 0.15) % 170);
      const frontOffset = -((camera * 0.27) % 210);
      for (let i = -1; i < 4; i += 1) {
        const x = backOffset + i * 170;
        pixelRect(ctx, x + 18, 150, 130, 58, stage.palette.mountainBack);
        pixelRect(ctx, x + 42, 130, 82, 78, stage.palette.mountainBack);
        pixelRect(ctx, x + 64, 116, 42, 92, stage.palette.mountainBack);
        pixelRect(ctx, x + 72, 120, 12, 12, "rgba(255,255,255,0.16)");
      }
      for (let i = -1; i < 4; i += 1) {
        const x = frontOffset + i * 210;
        pixelRect(ctx, x + 4, 177, 180, 31, stage.palette.mountainFront);
        pixelRect(ctx, x + 38, 155, 116, 53, stage.palette.mountainFront);
        pixelRect(ctx, x + 70, 140, 56, 68, stage.palette.mountainFront);
      }

      if (stage.palette === MEADOW) {
        drawTree(90, 124, camera, stage.palette);
        drawTree(520, 128, camera, stage.palette);
        drawTree(1040, 122, camera, stage.palette);
        drawTree(1520, 130, camera, stage.palette);
      }
    };

    const drawSolid = (
      solid: Rect,
      palette: Palette,
      camera: number,
    ) => {
      const x = Math.round(solid.x - camera);
      if (x > VIEW_W || x + solid.w < 0) return;

      if (solid.kind === "ground") {
        for (let tx = 0; tx < solid.w; tx += 16) {
          for (let ty = 0; ty < solid.h; ty += 16) {
            const top =
              ty === 0 ? palette.grassTop : palette.dirt;
            const front =
              ty === 0
                ? palette.dirt
                : (tx / 16 + ty / 16) % 2 === 0
                  ? palette.dirt
                  : palette.dirtDark;
            drawVoxelBlock(
              x + tx,
              solid.y + ty,
              Math.min(16, solid.w - tx),
              Math.min(16, solid.h - ty),
              top,
              front,
              palette.dirtDark,
            );
          }
        }
        return;
      }

      if (solid.kind === "stone") {
        for (let tx = 0; tx < solid.w; tx += 16) {
          for (let ty = 0; ty < solid.h; ty += 16) {
            drawVoxelBlock(
              x + tx,
              solid.y + ty,
              16,
              16,
              "#b6bec1",
              palette.stone,
              palette.stoneDark,
            );
            pixelRect(
              ctx,
              x + tx + 7,
              solid.y + ty + 7,
              3,
              3,
              palette.stoneDark,
            );
          }
        }
        return;
      }

      if (solid.kind === "supply") {
        const supply = suppliesRef.current.find(
          (candidate) => candidate.id === solid.supplyId,
        );
        const hit = supply?.hit ?? false;
        drawVoxelBlock(
          x,
          solid.y,
          16,
          16,
          hit ? "#747b80" : "#ffd65b",
          hit ? "#555d62" : "#e8952d",
          hit ? "#343a3e" : "#9b561f",
        );
        pixelRect(
          ctx,
          x + 5,
          solid.y + 4,
          6,
          6,
          hit ? "#8f989c" : "#fff4a4",
        );
        pixelRect(
          ctx,
          x + 7,
          solid.y + 11,
          2,
          2,
          hit ? "#33383b" : "#75421b",
        );
        return;
      }

      drawVoxelBlock(
        x - 3,
        solid.y,
        solid.w + 6,
        10,
        "#6be6d1",
        palette.accent,
        "#17665f",
      );
      for (let ty = 10; ty < solid.h; ty += 16) {
        drawVoxelBlock(
          x,
          solid.y + ty,
          solid.w,
          Math.min(16, solid.h - ty),
          "#47cbb8",
          "#249580",
          "#17665f",
        );
      }
    };

    const drawCrystal = (coin: Coin, camera: number, now: number) => {
      if (coin.collected) return;
      const x = Math.round(coin.x - camera);
      if (x < -12 || x > VIEW_W + 12) return;
      const squash = Math.floor(now / 140) % 4 === 0;
      const width = squash ? 3 : 9;
      drawVoxelBlock(
        x - Math.floor(width / 2),
        coin.y - 7,
        width,
        14,
        "#fff08b",
        "#e9b936",
        "#9a6d17",
      );
    };

    const drawEnemy = (
      enemy: Enemy,
      camera: number,
      now: number,
    ) => {
      if (!enemy.alive) return;
      const x = Math.round(enemy.x - camera);
      if (x < -22 || x > VIEW_W + 22) return;
      const step = Math.floor(now / 180) % 2;

      if (enemy.variant === "crawler") {
        drawVoxelBlock(
          x,
          enemy.y + 4,
          16,
          12,
          "#e78655",
          "#b74e42",
          "#6f2c32",
        );
        pixelRect(ctx, x + 3, enemy.y + 7, 3, 3, "#f7f4dc");
        pixelRect(ctx, x + 11, enemy.y + 7, 3, 3, "#f7f4dc");
        pixelRect(ctx, x + 4, enemy.y + 8, 1, 2, "#18202b");
        pixelRect(ctx, x + 12, enemy.y + 8, 1, 2, "#18202b");
        pixelRect(ctx, x + (step ? 1 : 0), enemy.y + 15, 6, 2, "#37262b");
        pixelRect(ctx, x + (step ? 9 : 10), enemy.y + 15, 6, 2, "#37262b");
      } else {
        drawVoxelBlock(
          x + 1,
          enemy.y + 2,
          14,
          14,
          "#75de75",
          "#42a95d",
          "#26713f",
        );
        pixelRect(ctx, x + 4, enemy.y + 6, 3, 3, "#eafbea");
        pixelRect(ctx, x + 10, enemy.y + 6, 3, 3, "#eafbea");
        pixelRect(ctx, x + 5, enemy.y + 7, 1, 2, "#143321");
        pixelRect(ctx, x + 11, enemy.y + 7, 1, 2, "#143321");
        pixelRect(ctx, x + 6, enemy.y + 12, 5, 2, "#1d5832");
      }
    };

    const drawItem = (
      item: SpawnedItem,
      camera: number,
      now: number,
    ) => {
      if (!item.active) return;
      const x = Math.round(item.x - camera);
      const y = Math.round(item.y);
      if (x < -20 || x > VIEW_W + 20) return;
      const bob = Math.floor(now / 130) % 2;

      if (item.kind === "growth") {
        drawVoxelBlock(x, y + 4 - bob, 12, 7, "#ff9b72", "#d94d3f", "#7f2c31");
        pixelRect(ctx, x + 2, y + 5 - bob, 3, 2, "#fff0c9");
        pixelRect(ctx, x + 8, y + 5 - bob, 2, 2, "#fff0c9");
        drawVoxelBlock(x + 4, y + 11 - bob, 5, 5, "#f5d5a8", "#c99c6c", "#7a6048");
      } else if (item.kind === "blaster") {
        drawVoxelBlock(x, y + 3 - bob, 11, 8, "#8cf5f0", "#31b9c0", "#176a78");
        pixelRect(ctx, x + 8, y + 5 - bob, 7, 3, "#ff9c3d");
        pixelRect(ctx, x + 3, y + 11 - bob, 4, 5, "#52637b");
      } else {
        drawVoxelBlock(x + 3, y - bob, 6, 15, "#fff48a", "#f2c33e", "#a36e17");
        drawVoxelBlock(x, y + 4 - bob, 12, 7, "#fff48a", "#f2c33e", "#a36e17");
        pixelRect(ctx, x + 5, y + 5 - bob, 2, 2, "#ffffff");
      }
    };

    const drawProjectile = (
      projectile: Projectile,
      camera: number,
      now: number,
    ) => {
      if (!projectile.active) return;
      const x = Math.round(projectile.x - camera);
      const pulse = Math.floor(now / 80) % 2;
      drawVoxelBlock(
        x,
        projectile.y,
        pulse ? 8 : 7,
        pulse ? 6 : 5,
        "#fff7b0",
        "#ff9a3c",
        "#b63b2f",
      );
    };

    const drawGoal = (stage: Stage, camera: number) => {
      const goalX = Math.round(stage.goalX - camera);
      if (goalX > -70 && goalX < VIEW_W + 80) {
        drawVoxelBlock(goalX, 80, 5, 128, "#e5edf1", "#9ca8b1", "#59646d");
        drawVoxelBlock(goalX + 5, 86, 38, 20, "#ffe16a", "#f26522", "#95381c");
        pixelRect(ctx, goalX + 13, 92, 17, 3, "#fff6cf");
        pixelRect(ctx, goalX + 13, 98, 11, 3, "#fff6cf");
        drawVoxelBlock(goalX - 6, 200, 17, 8, "#bec6ca", "#7e898f", "#4c5458");
      }

      const towerX = Math.round(stage.goalX + 58 - camera);
      if (towerX > -90 && towerX < VIEW_W + 100) {
        for (let tx = 0; tx < 5; tx += 1) {
          for (let ty = 0; ty < 4; ty += 1) {
            drawVoxelBlock(
              towerX + tx * 16,
              144 + ty * 16,
              16,
              16,
              "#8f99a3",
              "#606a75",
              "#343c46",
            );
          }
        }
        drawVoxelBlock(towerX + 14, 126, 18, 82, "#9aa4ad", "#697480", "#39434d");
        drawVoxelBlock(towerX + 48, 126, 18, 82, "#9aa4ad", "#697480", "#39434d");
        pixelRect(ctx, towerX + 30, 176, 20, 32, "#141a22");
        pixelRect(ctx, towerX + 19, 151, 8, 10, "#ffd45d");
        pixelRect(ctx, towerX + 54, 151, 8, 10, "#ffd45d");
      }
    };

    const drawPlayer = (
      player: Player,
      camera: number,
      now: number,
    ) => {
      const x = Math.round(player.x - camera);
      const y = Math.round(player.y);
      const blink =
        now < invincibleUntilRef.current &&
        Math.floor(now / 90) % 2 === 0;
      if (blink) return;

      const powered = powerLevelRef.current > 0;
      const armed = powerLevelRef.current >= 2;
      const running = Math.abs(player.vx) > 20 && player.onGround;
      const step = running ? Math.floor(now / 100) % 2 : 0;
      const rainbow = now < starUntilRef.current;
      const body = rainbow
        ? Math.floor(now / 100) % 2 === 0
          ? "#ffdc55"
          : "#76eff0"
        : "#f26522";

      ctx.save();
      if (player.facing < 0) {
        ctx.translate(x + player.w, 0);
        ctx.scale(-1, 1);
        ctx.translate(-x, 0);
      }

      drawVoxelBlock(x + 3, y, 9, powered ? 9 : 8, "#f2c79b", "#c9906b", "#795542");
      pixelRect(ctx, x + 9, y + 3, 2, 2, "#1a2430");
      pixelRect(ctx, x + 2, y - 2, 11, 4, "#2b546f");
      pixelRect(ctx, x + 1, y + 8, 13, powered ? 13 : 9, "#ff8b3d", body, "#98351f");
      pixelRect(ctx, x + 4, y + 11, 6, 3, "#3ec2b0");
      pixelRect(ctx, x - 1, y + 10, 3, powered ? 9 : 6, "#f2c79b");
      pixelRect(ctx, x + 12, y + 10, 3, powered ? 9 : 6, armed ? "#46d9df" : "#f2c79b");
      if (armed) {
        pixelRect(ctx, x + 13, y + 12, 7, 3, "#46d9df");
        pixelRect(ctx, x + 18, y + 13, 4, 2, "#ffb13b");
      }
      const legY = y + (powered ? 22 : 14);
      pixelRect(ctx, x + 3, legY, 4, 3, "#31445d");
      pixelRect(ctx, x + 8, legY, 4, 3, "#31445d");
      pixelRect(ctx, x + (step ? 1 : 2), legY + 3, 6, 3, "#22252b");
      pixelRect(ctx, x + (step ? 8 : 7), legY + 3, 6, 3, "#22252b");
      ctx.restore();
    };

    const draw = (now: number) => {
      const stage = STAGES[stageIndexRef.current];
      const camera = cameraRef.current;
      drawBackground(stage, camera);
      for (const solid of stage.solids) {
        drawSolid(solid, stage.palette, camera);
      }
      for (const coin of coinsRef.current) {
        drawCrystal(coin, camera, now);
      }
      for (const item of itemsRef.current) {
        drawItem(item, camera, now);
      }
      for (const enemy of enemiesRef.current) {
        drawEnemy(enemy, camera, now);
      }
      for (const projectile of projectilesRef.current) {
        drawProjectile(projectile, camera, now);
      }
      drawGoal(stage, camera);
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
  }, [syncPhase, syncPower]);

  const remainingAfter = result?.ok
    ? result.remainingToday
    : Math.max(remainingBefore - 1, 0);

  return (
    <main
      className="relative flex min-h-[100dvh] select-none flex-col overflow-hidden bg-[#111820] text-white"
      style={{
        fontFamily: "'Galmuri11', 'Jua', monospace",
        touchAction: "none",
      }}
    >
      {adminMode && (
        <div className="absolute inset-x-0 top-0 z-[120] flex justify-center">
          <span className="border-x-2 border-b-2 border-amber-200 bg-amber-500 px-3 py-1 text-[10px] font-bold text-slate-950">
            TEST MODE · 기록 저장 안 됨
          </span>
        </div>
      )}

      <header
        className={`z-50 mx-auto flex w-full max-w-3xl items-center justify-between gap-2 px-3 pb-2 ${
          adminMode ? "pt-9" : "pt-3"
        }`}
      >
        <Link
          href={homeHref}
          className="border-4 border-[#0b0f14] bg-[#596875] px-3 py-2 text-[10px] font-bold shadow-[inset_2px_2px_0_#9faab2,4px_4px_0_#000] active:translate-y-0.5"
        >
          ← GAME CENTER
        </Link>
        <div className="flex min-w-0 items-center gap-2 text-[9px] sm:gap-3 sm:text-xs">
          <div className="text-center">
            <div className="text-white/55">WORLD</div>
            <div className="text-yellow-300">
              {stageIndex + 1}/{STAGES.length}
            </div>
          </div>
          <div className="text-center">
            <div className="text-white/55">SCORE</div>
            <div>{score.toString().padStart(6, "0")}</div>
          </div>
          <div className="text-center">
            <div className="text-white/55">CRYSTAL</div>
            <div className="text-yellow-300">×{coinCount}</div>
          </div>
          <div className="text-center">
            <div className="text-white/55">POWER</div>
            <div className={starActive ? "text-yellow-300" : "text-cyan-300"}>
              {starActive
                ? "STAR"
                : powerLevel === 2
                  ? "BLASTER"
                  : powerLevel === 1
                    ? "GROW"
                    : "NORMAL"}
            </div>
          </div>
        </div>
        <div className="whitespace-nowrap text-sm tracking-[-3px] text-rose-400">
          {hearts.join(" ")}
        </div>
      </header>

      <section className="relative mx-auto w-full max-w-3xl border-y-4 border-[#050709] bg-black sm:border-x-4">
        <canvas
          ref={canvasRef}
          width={VIEW_W}
          height={VIEW_H}
          aria-label="블록형 횡스크롤 수학 게임"
          className="block h-auto w-full"
          style={{
            imageRendering: "pixelated",
            aspectRatio: `${VIEW_W}/${VIEW_H}`,
          }}
        />

        <AnimatePresence>
          {phase === "ready" && (
            <motion.div
              className="absolute inset-0 z-40 flex items-center justify-center bg-[#17212b]/94 px-5"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <div className="w-full max-w-sm border-4 border-[#0a0d10] bg-[#536673] p-5 text-center shadow-[inset_4px_4px_0_#8b9ba4,inset_-4px_-4px_0_#2d3942,8px_8px_0_#000]">
                <div className="mx-auto mb-3 grid h-16 w-16 place-items-center border-4 border-[#111820] bg-[#e8952d] text-4xl shadow-[inset_4px_4px_0_#ffd65b,inset_-4px_-4px_0_#9b561f,4px_4px_0_#000]">
                  ◆
                </div>
                <h1 className="text-xl font-black leading-relaxed text-[#fff0a8] sm:text-2xl">
                  BLOCK MATH QUEST
                </h1>
                <p className="mt-2 text-[10px] leading-5 text-white/85 sm:text-xs">
                  블록 월드를 달리고 점프해 출구 깃발까지 가세요.
                  <br />
                  보급 블록을 머리로 치면 특별 아이템이 나옵니다.
                </p>
                <div className="mt-4 grid grid-cols-3 gap-2 text-[8px] sm:text-[10px]">
                  <div className="border-2 border-[#111820] bg-black/20 p-2">
                    🍄
                    <br />
                    성장 버섯
                  </div>
                  <div className="border-2 border-[#111820] bg-black/20 p-2">
                    ▰
                    <br />
                    블래스터
                  </div>
                  <div className="border-2 border-[#111820] bg-black/20 p-2">
                    ✦
                    <br />
                    무적 큐브
                  </div>
                </div>
                <button
                  type="button"
                  onClick={startGame}
                  className="mt-5 w-full border-4 border-[#111820] bg-[#f26522] py-3 text-sm font-black text-white shadow-[inset_3px_3px_0_#ff9a61,inset_-3px_-3px_0_#a7381b,5px_5px_0_#000] active:translate-x-0.5 active:translate-y-0.5 active:shadow-[2px_2px_0_#000]"
                >
                  ▶ START QUEST
                </button>
                <p className="mt-3 text-[9px] text-white/60">
                  오늘 남은 횟수 ·{" "}
                  {adminMode ? "∞" : `${remainingBefore}회`}
                </p>
              </div>
            </motion.div>
          )}

          {lastItem && phase === "playing" && (
            <motion.div
              key={lastItem}
              initial={{ opacity: 0, y: -10, scale: 0.85 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0 }}
              className="pointer-events-none absolute left-1/2 top-5 z-30 -translate-x-1/2 border-4 border-[#111820] bg-[#fff0a8] px-4 py-2 text-center text-[10px] font-black text-[#17212b] shadow-[4px_4px_0_#000]"
            >
              {itemLabel(lastItem)} 획득!
            </motion.div>
          )}

          {phase === "stageQuiz" && (
            <motion.div
              className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 px-5"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              <motion.div
                initial={{ scale: 0.82, y: 12 }}
                animate={{ scale: 1, y: 0 }}
                className="w-full max-w-xs border-4 border-[#111820] bg-[#d6c59b] p-4 text-center text-[#17212b] shadow-[inset_4px_4px_0_#fff0c9,inset_-4px_-4px_0_#8d7957,8px_8px_0_#000]"
              >
                <div className="text-[10px] font-black text-[#b43c1f]">
                  {currentStage.name} CLEAR!
                </div>
                <h2 className="mt-2 text-sm font-black">
                  다음 블록 월드 잠금 해제
                </h2>
                <div className="my-4 border-4 border-[#17212b] bg-[#f7edd3] py-4 text-3xl font-black shadow-[inset_3px_3px_0_#fff,inset_-3px_-3px_0_#b5a47d]">
                  {currentStage.quiz.prompt} = ?
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {currentStage.quiz.choices.map((choice) => (
                    <button
                      key={choice}
                      type="button"
                      disabled={quizFeedback !== null}
                      onClick={() => answerStageQuiz(choice)}
                      className="border-4 border-[#17212b] bg-[#64c9c0] py-3 text-xl font-black shadow-[inset_3px_3px_0_#9cefe7,inset_-3px_-3px_0_#288d86,3px_3px_0_#17212b] active:translate-x-0.5 active:translate-y-0.5 disabled:opacity-70"
                    >
                      {choice}
                    </button>
                  ))}
                </div>
                {quizFeedback && (
                  <div
                    className={`mt-3 border-2 border-[#17212b] py-2 text-xs font-black ${
                      quizFeedback === "correct"
                        ? "bg-emerald-300"
                        : "bg-rose-300"
                    }`}
                  >
                    {quizFeedback === "correct"
                      ? stageIndex === STAGES.length - 1
                        ? "정답! 최종 요새 클리어!"
                        : "정답! 다음 월드가 열렸어요!"
                      : "다시 골라보세요!"}
                  </div>
                )}
              </motion.div>
            </motion.div>
          )}

          {phase === "over" && (
            <motion.div
              className="absolute inset-0 z-50 flex items-center justify-center bg-[#0b1016]/92 px-5"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              <div className="w-full max-w-sm border-4 border-[#080a0c] bg-[#536673] p-5 text-center shadow-[inset_4px_4px_0_#8b9ba4,inset_-4px_-4px_0_#2d3942,8px_8px_0_#000]">
                <div className="text-4xl">
                  {cleared ? "🏰" : "💥"}
                </div>
                <h2 className="mt-2 text-xl font-black text-[#fff0a8]">
                  {cleared ? "ALL BLOCKS CLEAR!" : "GAME OVER"}
                </h2>
                <p className="mt-2 text-[10px] leading-5 text-white/80">
                  {cleared
                    ? `${monsterNickname}와 함께 3개 블록 월드를 모두 통과했어요!`
                    : "블록과 아이템을 활용해 다시 도전해보세요."}
                </p>
                <div className="mt-4 grid grid-cols-3 gap-2 text-[10px]">
                  <BlockStat
                    label="SCORE"
                    value={score.toLocaleString()}
                  />
                  <BlockStat label="CRYSTAL" value={String(coinCount)} />
                  <BlockStat label="TIME" value={`${elapsed}s`} />
                </div>
                <div className="mt-3 border-2 border-[#111820] bg-black/25 p-3 text-[10px] leading-5">
                  {submitting
                    ? "기록 저장 중..."
                    : adminMode
                      ? "테스트 모드라 기록은 저장되지 않아요."
                      : result?.ok
                        ? `EXP +${result.expEarned}${
                            result.isNewBest ? " · NEW RECORD!" : ""
                          }`
                        : result
                          ? result.message
                          : "결과를 확인했어요."}
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3 text-xs font-black">
                  {(adminMode || remainingAfter > 0) && (
                    <button
                      type="button"
                      onClick={startGame}
                      className="border-4 border-[#111820] bg-[#f26522] py-3 shadow-[inset_3px_3px_0_#ff9a61,inset_-3px_-3px_0_#a7381b,4px_4px_0_#000] active:translate-y-0.5"
                    >
                      RETRY
                    </button>
                  )}
                  <Link
                    href={homeHref}
                    className="flex items-center justify-center border-4 border-[#111820] bg-[#39b7a8] py-3 shadow-[inset_3px_3px_0_#7ce3d7,inset_-3px_-3px_0_#22786f,4px_4px_0_#000] active:translate-y-0.5"
                  >
                    EXIT
                  </Link>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </section>

      <div className="mx-auto flex w-full max-w-3xl flex-1 items-center justify-between gap-3 px-4 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        <div className="flex gap-2">
          <BlockControl
            label="왼쪽"
            icon="◀"
            onPress={() => pressControl("left")}
            onRelease={() => releaseControl("left")}
          />
          <BlockControl
            label="오른쪽"
            icon="▶"
            onPress={() => pressControl("right")}
            onRelease={() => releaseControl("right")}
          />
        </div>

        <div className="hidden text-center text-[9px] leading-5 text-white/45 sm:block">
          {currentStage.name}
          <br />
          {currentStage.subtitle}
        </div>

        <div className="flex items-end gap-2">
          <button
            type="button"
            disabled={powerLevel < 2 || phase !== "playing"}
            onPointerDown={(event) => {
              event.preventDefault();
              queueFire();
            }}
            className="grid h-14 w-14 place-items-center border-4 border-[#080a0c] bg-[#2eb9c0] text-lg font-black shadow-[inset_3px_3px_0_#82f1ef,inset_-3px_-3px_0_#176a78,0_6px_0_#000] active:translate-y-1 disabled:bg-[#3c4650] disabled:text-white/35 disabled:shadow-[inset_3px_3px_0_#59636c,inset_-3px_-3px_0_#20282e,0_6px_0_#000]"
            aria-label="블래스터 발사"
          >
            ◆
          </button>
          <button
            type="button"
            onPointerDown={(event) => {
              event.preventDefault();
              queueJump();
            }}
            className="grid h-20 w-20 place-items-center border-4 border-[#080a0c] bg-[#f26522] text-3xl font-black shadow-[inset_4px_4px_0_#ff9a61,inset_-4px_-4px_0_#a7381b,0_8px_0_#000] active:translate-y-1 active:shadow-[inset_3px_3px_0_#ff9a61,inset_-3px_-3px_0_#a7381b,0_4px_0_#000]"
            aria-label="점프"
          >
            ↑
          </button>
        </div>
      </div>
    </main>
  );
}

function BlockControl({
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
      onPointerDown={(event) => {
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        onPress();
      }}
      onPointerUp={onRelease}
      onPointerCancel={onRelease}
      onLostPointerCapture={onRelease}
      className="grid h-[68px] w-[68px] place-items-center border-4 border-[#080a0c] bg-[#596875] text-2xl font-black shadow-[inset_4px_4px_0_#93a0a8,inset_-4px_-4px_0_#2c363e,0_7px_0_#000] active:translate-y-1 active:shadow-[inset_3px_3px_0_#93a0a8,inset_-3px_-3px_0_#2c363e,0_3px_0_#000]"
    >
      {icon}
    </button>
  );
}

function BlockStat({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="border-2 border-[#111820] bg-black/25 p-2 shadow-[inset_2px_2px_0_rgba(255,255,255,0.15)]">
      <div className="text-white/55">{label}</div>
      <div className="mt-1 text-sm text-yellow-300">{value}</div>
    </div>
  );
}
